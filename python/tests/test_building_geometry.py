from __future__ import annotations

from dataclasses import replace
import hashlib
import json
from pathlib import Path

import pytest

import contam_studio_core.building_geometry as geometry_module
from contam_studio_core.building_geometry import (
    BuildingGeometry,
    BuildingGeometryError,
    GeometryCapabilities,
    GeometryCoordinateSpace,
    GeometryFlowPathAnchor,
    GeometryLevel,
    GeometryOpening,
    GeometryPlanUnderlay,
    GeometryProvenance,
    GeometryVertex,
    GeometryVerticalFlowPathAnchor,
    GeometryVerticalOpening,
    GeometryWall,
    GeometryZoneRegion,
    geometry_sha256,
    geometry_validation_result,
    project_read_only_geometry,
    validate_building_geometry,
)
from contam_studio_core.prj_sections import (
    PrjSection,
    PrjSectionsDocument,
    SectionLine,
    read_prj_sections,
)
from contam_studio_core.spatial_projection import project_spatial


REPO_ROOT = Path(__file__).resolve().parents[2]
OFFICIAL_FIXTURE = REPO_ROOT / "fixtures/contam/official-contamxpy/test_GetPrjInfo.prj"
SHARED_METRIC_FIXTURE = REPO_ROOT / "contracts/geometry/examples/studio-metric-valid.json"


def _document(lines: list[str]) -> PrjSectionsDocument:
    section = PrjSection(
        name="levels plus icon data",
        declared_count=1,
        marker_line_number=2,
        lines=tuple(SectionLine(index + 3, line) for index, line in enumerate(lines)),
        terminator_line_number=len(lines) + 3,
    )
    return PrjSectionsDocument(
        source_path="fixture.prj",
        source_sha256="b" * 64,
        source_size_bytes=128,
        header_version="3.4.0.4",
        header_variant=0,
        sections=(section,),
    )


def _metric_geometry() -> BuildingGeometry:
    vertices = (
        GeometryVertex("v1", 0, 0),
        GeometryVertex("v2", 4000, 0),
        GeometryVertex("v3", 4000, 3000),
        GeometryVertex("v4", 0, 3000),
    )
    walls = (
        GeometryWall("w1", "v1", "v2", "exterior", 200, None),
        GeometryWall("w2", "v2", "v3", "exterior", 200, None),
        GeometryWall("w3", "v3", "v4", "exterior", 200, None),
        GeometryWall("w4", "v4", "v1", "exterior", 200, None),
    )
    level = GeometryLevel(
        level_id="level-1",
        level_number=1,
        name="Level 1",
        elevation=0,
        height=3000,
        vertices=vertices,
        walls=walls,
        openings=(GeometryOpening("door-1", "w1", "door", 1000, 900, "right", ("zone-1",)),),
        zone_regions=(GeometryZoneRegion("region-1", "zone-1", ("v1", "v2", "v3", "v4")),),
    )
    return BuildingGeometry(
        status="available",
        geometry_id="geometry-1",
        project_session_id="project-1",
        identity_sha256="a" * 64,
        source_sha256="b" * 64,
        revision_id="revision-1",
        geometry_revision=0,
        coordinate_space=GeometryCoordinateSpace("studio_metric", "mm", None),
        provenance=GeometryProvenance("studio_metric_draft", True, None),
        capabilities=GeometryCapabilities("studio_draft", "unsupported"),
        levels=(level,),
        vertical_openings=(),
        vertical_flow_path_anchors=(),
        warnings=(),
        unavailable_reason=None,
    )


def _two_level_metric_geometry() -> BuildingGeometry:
    base = _metric_geometry()
    upper = GeometryLevel(
        level_id="level-2",
        level_number=2,
        name="Level 2",
        elevation=3000,
        height=3000,
        vertices=(
            GeometryVertex("l2-v1", 0, 0),
            GeometryVertex("l2-v2", 4000, 0),
            GeometryVertex("l2-v3", 4000, 3000),
            GeometryVertex("l2-v4", 0, 3000),
        ),
        walls=(
            GeometryWall("l2-w1", "l2-v1", "l2-v2", "exterior", 200, None),
            GeometryWall("l2-w2", "l2-v2", "l2-v3", "exterior", 200, None),
            GeometryWall("l2-w3", "l2-v3", "l2-v4", "exterior", 200, None),
            GeometryWall("l2-w4", "l2-v4", "l2-v1", "exterior", 200, None),
        ),
        zone_regions=(
            GeometryZoneRegion(
                "l2-region", "zone-2", ("l2-v1", "l2-v2", "l2-v3", "l2-v4")
            ),
        ),
    )
    return replace(base, levels=(base.levels[0], upper))


def test_projection_preserves_sketchpad_truth_without_inventing_zone_regions() -> None:
    spatial = project_spatial(
        _document(["1 0.0 3.0 3 0 0 One", "22 10 20 -1", "11 11 20 -1", "5 10 19 1"]),
        identity_sha256="a" * 64,
        revision_id="revision-1",
        zone_semantic_ids={1: "zone-1"},
        flow_path_semantic_ids={},
    )

    first = project_read_only_geometry(spatial, project_session_id="project-1")
    second = project_read_only_geometry(spatial, project_session_id="project-1")

    assert first.to_dict() == second.to_dict()
    assert first.coordinate_space.to_dict() == {
        "kind": "contam_sketchpad_grid",
        "unit": "half_grid",
        "units_per_grid_cell": 2,
        "y_axis": "up",
    }
    assert first.capabilities.geometry_editing == "read_only"
    assert first.capabilities.prj_round_trip == "read_only_projection"
    assert first.levels[0].walls
    assert first.levels[0].zone_regions == ()
    assert "geometry_zone_regions_not_inferred" in {item.code for item in first.warnings}
    assert validate_building_geometry(first) == ()


def test_official_fixture_is_not_changed_by_geometry_projection() -> None:
    before = hashlib.sha256(OFFICIAL_FIXTURE.read_bytes()).hexdigest()
    document = read_prj_sections(OFFICIAL_FIXTURE)
    spatial = project_spatial(
        document,
        identity_sha256="a" * 64,
        revision_id="revision-fixture",
        zone_semantic_ids={},
        flow_path_semantic_ids={},
    )

    geometry = project_read_only_geometry(spatial, project_session_id="project-fixture")

    assert geometry.status == "available"
    assert hashlib.sha256(OFFICIAL_FIXTURE.read_bytes()).hexdigest() == before


def test_valid_metric_geometry_has_deterministic_hash_and_result() -> None:
    geometry = _metric_geometry()

    assert validate_building_geometry(geometry) == ()
    assert json.loads(SHARED_METRIC_FIXTURE.read_text(encoding="utf-8")) == geometry.to_dict()
    assert (
        geometry_sha256(geometry)
        == "C90985EB642B32F8DFFA224CC207169C0C3B30B2528A7DCFE702F79108638B5B"
    )
    result = geometry_validation_result(
        geometry,
        expected_project_session_id="project-1",
        expected_revision_id="revision-1",
    )
    assert result["schema_version"] == "geometry_validation.v1"
    assert result["status"] == "valid"
    assert len(result["geometry_hash"]) == 64


def test_plan_underlay_is_bounded_path_free_and_one_per_level() -> None:
    underlay = GeometryPlanUnderlay(
        underlay_id="underlay-1",
        resource_id="00000000-0000-5000-8000-000000000001",
        display_name="floor-plan.png",
        sha256="c" * 64,
        mime_type="image/png",
        page_number=None,
        pixel_width=1000,
        pixel_height=800,
        pixel_origin_x_milli=0,
        pixel_origin_y_milli=800_000,
        origin_x_mm=0,
        origin_y_mm=0,
        micrometres_per_pixel=10_000,
        rotation_millidegrees=0,
        opacity_percent=42,
        visible=True,
        locked=True,
    )
    level = replace(_metric_geometry().levels[0], underlays=(underlay,))
    geometry = replace(_metric_geometry(), levels=(level,))
    assert validate_building_geometry(geometry) == ()

    invalid = replace(underlay, display_name="C:\\private\\plan.png")
    invalid_level = replace(level, underlays=(invalid, underlay))
    codes = {item.code for item in validate_building_geometry(replace(geometry, levels=(invalid_level,)))}
    assert {"geometry_underlay_count_invalid", "geometry_underlay_invalid"}.issubset(codes)


def test_stale_identity_and_invalid_coordinate_capability_are_rejected() -> None:
    geometry = replace(
        _metric_geometry(),
        coordinate_space=GeometryCoordinateSpace("contam_sketchpad_grid", "mm", None),
    )

    codes = {
        item.code
        for item in validate_building_geometry(
            geometry,
            expected_project_session_id="other-project",
            expected_revision_id="other-revision",
        )
    }

    assert codes == {
        "geometry_coordinate_capability_invalid",
        "geometry_project_session_stale",
        "geometry_revision_stale",
    }


def test_provenance_capability_and_unavailable_result_status_are_explicit() -> None:
    malformed = replace(
        _metric_geometry(),
        provenance=GeometryProvenance(
            "contam_sketchpad_projection", False, "spatial_projection.v1"
        ),
        capabilities=GeometryCapabilities("read_only", "read_only_projection"),
    )
    assert {item.code for item in validate_building_geometry(malformed)} == {
        "geometry_coordinate_capability_invalid"
    }

    unavailable = replace(
        _metric_geometry(),
        status="unavailable",
        levels=(),
        unavailable_reason="geometry_projection_unavailable",
    )
    result = geometry_validation_result(unavailable)
    assert result["status"] == "unavailable"
    assert result["diagnostics"] == []


def test_dangling_wall_duplicate_coordinate_and_non_split_intersection_are_rejected() -> None:
    base = _metric_geometry()
    level = base.levels[0]
    malformed = replace(
        level,
        vertices=level.vertices
        + (
            GeometryVertex("duplicate-coordinate", 0, 0),
            GeometryVertex("v5", 2000, -1000),
            GeometryVertex("v6", 2000, 1000),
        ),
        walls=level.walls
        + (
            GeometryWall("dangling", "missing", "v2", "interior", 100, None),
            GeometryWall("crossing", "v5", "v6", "interior", 100, None),
        ),
    )

    codes = {item.code for item in validate_building_geometry(replace(base, levels=(malformed,)))}

    assert "geometry_duplicate_vertex_coordinate" in codes
    assert "geometry_wall_vertex_missing" in codes
    assert "geometry_wall_intersection_requires_split" in codes


def test_self_intersecting_zone_and_out_of_bounds_opening_are_rejected() -> None:
    base = _metric_geometry()
    level = base.levels[0]
    malformed = replace(
        level,
        openings=(GeometryOpening("door-1", "w1", "door", 3800, 900, "right", ("zone-1",)),),
        zone_regions=(GeometryZoneRegion("region-1", "zone-1", ("v1", "v3", "v2", "v4")),),
    )

    codes = {item.code for item in validate_building_geometry(replace(base, levels=(malformed,)))}

    assert "geometry_opening_out_of_bounds" in codes
    assert "geometry_zone_self_intersection" in codes


def test_shared_zone_boundary_is_allowed_but_interior_overlap_is_rejected() -> None:
    base = _metric_geometry()
    level = base.levels[0]
    adjacent = replace(
        level,
        vertices=level.vertices + (GeometryVertex("v5", 8000, 0), GeometryVertex("v6", 8000, 3000)),
        zone_regions=level.zone_regions
        + (GeometryZoneRegion("region-2", "zone-2", ("v2", "v5", "v6", "v3")),),
    )
    assert validate_building_geometry(replace(base, levels=(adjacent,))) == ()

    overlapping = replace(
        level,
        vertices=level.vertices
        + (
            GeometryVertex("v5", 1000, 1000),
            GeometryVertex("v6", 2000, 1000),
            GeometryVertex("v7", 2000, 2000),
            GeometryVertex("v8", 1000, 2000),
        ),
        zone_regions=level.zone_regions
        + (GeometryZoneRegion("region-2", "zone-2", ("v5", "v6", "v7", "v8")),),
    )
    assert "geometry_zone_overlap" in {
        item.code for item in validate_building_geometry(replace(base, levels=(overlapping,)))
    }


def test_flow_path_must_match_attached_opening_zones() -> None:
    base = _metric_geometry()
    level = replace(
        base.levels[0],
        flow_path_anchors=(
            GeometryFlowPathAnchor("anchor-1", "door-1", "path-1", "zone-2", "zone-3", "none"),
        ),
    )

    codes = {item.code for item in validate_building_geometry(replace(base, levels=(level,)))}

    assert "geometry_flow_path_zone_mismatch" in codes


def test_wall_flow_path_requires_one_explicit_boundary_and_exact_zone_set() -> None:
    base = _metric_geometry()
    valid_level = replace(
        base.levels[0],
        flow_path_anchors=(
            GeometryFlowPathAnchor("anchor-1", "door-1", "path-1", "zone-1", None, "to"),
        ),
    )
    assert validate_building_geometry(replace(base, levels=(valid_level,))) == ()

    wrong_wall = replace(
        valid_level,
        walls=(replace(valid_level.walls[0], kind="interior"),) + valid_level.walls[1:],
    )
    assert "geometry_flow_path_boundary_invalid" in {
        item.code for item in validate_building_geometry(replace(base, levels=(wrong_wall,)))
    }

    duplicate = replace(
        valid_level,
        flow_path_anchors=valid_level.flow_path_anchors
        + (GeometryFlowPathAnchor("anchor-2", "door-1", "path-2", "zone-1", None, "to"),),
    )
    assert "geometry_flow_path_opening_duplicate" in {
        item.code for item in validate_building_geometry(replace(base, levels=(duplicate,)))
    }


def test_vertical_opening_and_flow_path_anchor_validate_as_distinct_facts() -> None:
    base = _two_level_metric_geometry()
    opening = GeometryVerticalOpening(
        "vertical-opening-1", "level-1", "level-2", 1500, 1000, 1000, 1000, "stair"
    )
    anchor = GeometryVerticalFlowPathAnchor(
        "vertical-anchor-1",
        opening.opening_id,
        "flow-between-levels",
        "zone-1",
        "zone-2",
    )
    geometry = replace(
        base,
        vertical_openings=(opening,),
        vertical_flow_path_anchors=(anchor,),
    )

    assert validate_building_geometry(geometry) == ()
    assert geometry.to_dict()["vertical_openings"][0]["kind"] == "stair"


def test_vertical_opening_requires_adjacent_levels_and_exact_zone_coverage() -> None:
    base = _two_level_metric_geometry()
    third = replace(
        base.levels[1],
        level_id="level-3",
        level_number=3,
        name="Level 3",
        elevation=6000,
        vertices=tuple(replace(vertex, vertex_id=f"l3-v{index + 1}") for index, vertex in enumerate(base.levels[1].vertices)),
        walls=(
            GeometryWall("l3-w1", "l3-v1", "l3-v2", "exterior", 200, None),
            GeometryWall("l3-w2", "l3-v2", "l3-v3", "exterior", 200, None),
            GeometryWall("l3-w3", "l3-v3", "l3-v4", "exterior", 200, None),
            GeometryWall("l3-w4", "l3-v4", "l3-v1", "exterior", 200, None),
        ),
        zone_regions=(GeometryZoneRegion("l3-region", "zone-3", ("l3-v1", "l3-v2", "l3-v3", "l3-v4")),),
    )
    non_adjacent = GeometryVerticalOpening(
        "vertical-opening-1", "level-1", "level-3", 1500, 1000, 1000, 1000, "shaft"
    )
    boundary_crossing = GeometryVerticalOpening(
        "vertical-opening-2", "level-1", "level-2", -250, 1000, 1000, 1000, "floor_opening"
    )
    malformed = replace(
        base,
        levels=base.levels + (third,),
        vertical_openings=(non_adjacent, boundary_crossing),
    )

    codes = {item.code for item in validate_building_geometry(malformed)}
    assert "geometry_vertical_opening_levels_not_adjacent" in codes
    assert "geometry_vertical_opening_zone_coverage_invalid" in codes


def test_vertical_anchor_rejects_duplicate_semantic_path_and_zone_mismatch() -> None:
    base = _two_level_metric_geometry()
    opening = GeometryVerticalOpening(
        "vertical-opening-1", "level-1", "level-2", 1500, 1000, 1000, 1000, "floor_opening"
    )
    level = replace(
        base.levels[0],
        flow_path_anchors=(
            GeometryFlowPathAnchor("anchor-1", "door-1", "flow-between-levels", "zone-1", None, "to"),
        ),
    )
    anchor = GeometryVerticalFlowPathAnchor(
        "vertical-anchor-1", opening.opening_id, "flow-between-levels", "wrong-zone", "zone-2"
    )
    malformed = replace(
        base,
        levels=(level, base.levels[1]),
        vertical_openings=(opening,),
        vertical_flow_path_anchors=(anchor,),
    )

    codes = {item.code for item in validate_building_geometry(malformed)}
    assert "geometry_flow_path_binding_duplicate" in codes
    assert "geometry_vertical_flow_path_zone_mismatch" in codes


def test_geometry_payload_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(geometry_module, "MAX_GEOMETRY_PAYLOAD_BYTES", 32)
    with pytest.raises(BuildingGeometryError) as caught:
        geometry_module.project_read_only_geometry(
            project_spatial(
                _document(["1 0.0 3.0 1 0 0 One", "11 10 20 -1"]),
                identity_sha256="a" * 64,
                revision_id="revision-1",
                zone_semantic_ids={},
                flow_path_semantic_ids={},
            ),
            project_session_id="project-1",
        )
    assert caught.value.code == "geometry_payload_limit_exceeded"
