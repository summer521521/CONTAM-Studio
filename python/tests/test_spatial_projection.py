from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

import contam_studio_core.spatial_projection as spatial_module
from contam_studio_core.prj_sections import (
    PrjSection,
    PrjSectionError,
    PrjSectionsDocument,
    SectionLine,
    read_prj_sections,
)
from contam_studio_core.spatial_projection import (
    MAX_SPATIAL_COORDINATE,
    MAX_SPATIAL_ICON_TYPE,
    MAX_SPATIAL_ICONS,
    MAX_SPATIAL_LEVEL_NUMBER,
    MAX_SPATIAL_LEVELS,
    MAX_SPATIAL_OBJECT_NUMBER,
    MIN_SPATIAL_OBJECT_NUMBER,
    SpatialProjectionError,
    classify_icon_type,
    project_spatial,
)
from contam_studio_core.zone_bridge import PROTOCOL_VERSION, handle_request


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = {
    "test_GetPrjInfo.prj": (
        REPO_ROOT / "fixtures/contam/official-contamxpy/test_GetPrjInfo.prj",
        (63,),
        ((14, 47, 24, 48),),
    ),
    "valThreeZonesWthCtm-UseApi.prj": (
        REPO_ROOT / "fixtures/contam/official-contamxpy/valThreeZonesWthCtm-UseApi.prj",
        (121,),
        ((1, 61, 6, 46),),
    ),
    "demo1c.prj": (
        REPO_ROOT / "fixtures/contam/official-nist-tutorials/demo1c.prj",
        (9, 27, 7, 1),
        ((7, 55, 10, 46), (7, 55, 10, 46), (7, 55, 8, 48), (31, 31, 28, 28)),
    ),
}


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _projection(path: Path, *, zone_ids=None, flow_ids=None):
    document = read_prj_sections(path)
    return project_spatial(
        document,
        identity_sha256="a" * 64,
        revision_id="revision-fixture",
        zone_semantic_ids=zone_ids or {},
        flow_path_semantic_ids=flow_ids or {},
    )


def _document(lines: list[str], *, declared_count: int = 1) -> PrjSectionsDocument:
    section = PrjSection(
        name="levels plus icon data",
        declared_count=declared_count,
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


def _project_document(document: PrjSectionsDocument):
    return project_spatial(
        document,
        identity_sha256="a" * 64,
        revision_id="revision-fixture",
        zone_semantic_ids={1: "zone-one"},
        flow_path_semantic_ids={1: "path-one"},
    )


@pytest.mark.parametrize("fixture_name", tuple(FIXTURES))
def test_official_fixtures_preserve_level_icon_counts_bounds_and_source(
    fixture_name: str,
) -> None:
    path, expected_counts, expected_bounds = FIXTURES[fixture_name]
    before = _digest(path)

    projection = _projection(path)

    assert projection.status == "available"
    assert tuple(len(level.icons) for level in projection.levels) == expected_counts
    assert tuple(
        (
            level.bounds.min_column,
            level.bounds.max_column,
            level.bounds.min_row,
            level.bounds.max_row,
        )
        for level in projection.levels
        if level.bounds is not None
    ) == expected_bounds
    assert _digest(path) == before


def test_fixture_locks_icon_column_row_order_and_stable_id() -> None:
    path = FIXTURES["test_GetPrjInfo.prj"][0]

    first = _projection(path).levels[0].icons[0]
    second = _projection(path).levels[0].icons[0]

    assert (first.icon_type, first.column, first.row, first.object_number) == (162, 34, 24, 1)
    assert first.icon_id == second.icon_id


def test_verified_icon_categories_and_unknown_are_conservative() -> None:
    assert [classify_icon_type(value) for value in (1, 2, 3, 4)] == ["flow_path"] * 4
    assert [classify_icon_type(value) for value in (5, 6, 7)] == ["zone"] * 3
    assert classify_icon_type(11) == "wall"
    assert classify_icon_type(22) == "wall"
    assert classify_icon_type(23) == "opening"
    assert classify_icon_type(31) == "fan"
    assert classify_icon_type(42) == "note"
    assert classify_icon_type(162) == "unknown"


def test_zone_and_flow_icons_bind_only_to_matching_semantic_kinds() -> None:
    projection = _project_document(
        _document(["1 0.0 3.0 4 0 0 One", "5 10 20 1", "23 11 20 1", "14 12 20 1", "42 13 20 1"])
    )

    zone, opening, wall, note = projection.levels[0].icons
    assert zone.binding.to_dict() == {
        "kind": "zone",
        "semantic_id": "zone-one",
        "status": "bound",
        "reason": None,
    }
    assert opening.binding.kind == "flow_path"
    assert opening.binding.semantic_id == "path-one"
    assert wall.binding.kind == "none" and wall.binding.semantic_id is None
    assert note.binding.kind == "none" and note.binding.semantic_id is None


def test_unknown_and_unbound_icons_are_preserved_with_bounded_reason_codes() -> None:
    projection = _project_document(
        _document(["1 0.0 3.0 3 0 0 One", "250 10 20 9", "5 11 20 9", "23 12 20 9"])
    )

    icons = projection.levels[0].icons
    assert icons[0].kind == "unknown" and icons[0].icon_type == 250
    assert icons[1].binding.reason == "spatial_zone_binding_missing"
    assert icons[2].binding.reason == "spatial_flow_path_binding_missing"
    assert {warning.code for warning in projection.warnings} == {
        "spatial_unknown_icon_type",
        "spatial_zone_binding_missing",
        "spatial_flow_path_binding_missing",
    }


def test_duplicate_records_receive_distinct_deterministic_ids() -> None:
    document = _document(["1 0.0 3.0 2 0 0 One", "5 10 20 1", "5 10 20 1"])
    first = _project_document(document)
    second = _project_document(document)
    first_ids = [icon.icon_id for icon in first.levels[0].icons]

    assert len(first_ids) == len(set(first_ids)) == 2
    assert first_ids == [icon.icon_id for icon in second.levels[0].icons]


@pytest.mark.parametrize(
    ("document", "code"),
    [
        (_document([], declared_count=1), "spatial_level_truncated"),
        (_document(["1 0.0 3.0 0 0"], declared_count=1), "spatial_level_record_invalid"),
        (_document(["1 0.0 3.0 1 0 0 One"], declared_count=1), "spatial_icon_count_mismatch"),
        (_document(["1 0.0 3.0 1 0 0 One", "5 X 20 1"]), "spatial_icon_integer_invalid"),
        (
            _document(["1 0.0 3.0 1 0 0 One", f"5 {MAX_SPATIAL_COORDINATE + 1} 20 1"]),
            "spatial_coordinate_limit_exceeded",
        ),
        (_document(["1 0.0 3.0 0 0 0 One", "5 10 20 1"]), "spatial_extra_records"),
        (
            _document([f"1 0.0 3.0 {MAX_SPATIAL_ICONS + 1} 0 0 One"]),
            "spatial_icon_limit_exceeded",
        ),
        (_document(["-1 0.0 3.0 0 0 0 One"]), "spatial_level_number_invalid"),
        (
            _document([f"{MAX_SPATIAL_LEVEL_NUMBER + 1} 0.0 3.0 0 0 0 One"]),
            "spatial_level_number_invalid",
        ),
        (_document(["1 0.0 3.0 0 -1 0 One"]), "spatial_level_unit_invalid"),
        (_document(["1 0.0 3.0 0 2 0 One"]), "spatial_level_unit_invalid"),
        (_document(["1 0.0 3.0 1 0 0 One", "-1 10 20 1"]), "spatial_icon_type_invalid"),
        (
            _document(["1 0.0 3.0 1 0 0 One", f"{MAX_SPATIAL_ICON_TYPE + 1} 10 20 1"]),
            "spatial_icon_type_invalid",
        ),
        (
            _document(["1 0.0 3.0 1 0 0 One", f"5 10 20 {MIN_SPATIAL_OBJECT_NUMBER - 1}"]),
            "spatial_object_number_invalid",
        ),
        (
            _document(["1 0.0 3.0 1 0 0 One", f"5 10 20 {MAX_SPATIAL_OBJECT_NUMBER + 1}"]),
            "spatial_object_number_invalid",
        ),
    ],
)
def test_malformed_spatial_records_are_rejected(
    document: PrjSectionsDocument, code: str
) -> None:
    with pytest.raises(SpatialProjectionError, match="空间") as caught:
        _project_document(document)
    assert caught.value.code == code


def test_level_limit_and_duplicate_section_are_rejected() -> None:
    oversized = _document([], declared_count=MAX_SPATIAL_LEVELS + 1)
    with pytest.raises(SpatialProjectionError) as level_error:
        _project_document(oversized)
    assert level_error.value.code == "spatial_level_limit_exceeded"

    section = oversized.sections[0]
    duplicated = PrjSectionsDocument(
        source_path=oversized.source_path,
        source_sha256=oversized.source_sha256,
        source_size_bytes=oversized.source_size_bytes,
        header_version=oversized.header_version,
        header_variant=oversized.header_variant,
        sections=(section, section),
    )
    with pytest.raises(SpatialProjectionError) as duplicate_error:
        _project_document(duplicated)
    assert duplicate_error.value.code == "spatial_duplicate_section"


def test_spatial_mirror_contract_accepts_signed_coordinates_and_object_sentinel_at_boundaries() -> None:
    projection = _project_document(
        _document(
            [
                f"{MAX_SPATIAL_LEVEL_NUMBER} 0.0 3.0 2 1 0 Boundary",
                f"{MAX_SPATIAL_ICON_TYPE} {-MAX_SPATIAL_COORDINATE} {MAX_SPATIAL_COORDINATE} {MIN_SPATIAL_OBJECT_NUMBER}",
                f"5 {MAX_SPATIAL_COORDINATE} {-MAX_SPATIAL_COORDINATE} {MAX_SPATIAL_OBJECT_NUMBER}",
            ]
        )
    )

    assert projection.status == "available"
    assert projection.levels[0].reference_height_unit == 1
    assert projection.levels[0].icons[0].object_number == -1


def test_missing_section_and_terminator_have_stable_errors(tmp_path: Path) -> None:
    without_section = PrjSectionsDocument(
        source_path="fixture.prj",
        source_sha256="b" * 64,
        source_size_bytes=10,
        header_version="3.4.0.4",
        header_variant=0,
        sections=(),
    )
    with pytest.raises(SpatialProjectionError) as missing:
        _project_document(without_section)
    assert missing.value.code == "spatial_section_missing"

    source = tmp_path / "missing-terminator.prj"
    source.write_text(
        "ContamW 3.4.0.4 0\n1 ! levels plus icon data:\n1 0.0 3.0 0 0 0 One\n",
        encoding="ascii",
    )
    with pytest.raises(PrjSectionError) as terminator:
        read_prj_sections(source)
    assert terminator.value.code == "section_terminator_missing"


def test_payload_size_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(spatial_module, "MAX_SPATIAL_PAYLOAD_BYTES", 32)
    with pytest.raises(SpatialProjectionError) as caught:
        _project_document(_document(["1 0.0 3.0 0 0 0 One"]))
    assert caught.value.code == "spatial_payload_limit_exceeded"


def test_semantic_bridge_keeps_project_when_spatial_section_is_unavailable(
    tmp_path: Path,
) -> None:
    source = tmp_path / "without-spatial.prj"
    original = FIXTURES["test_GetPrjInfo.prj"][0].read_text(encoding="ascii")
    start = original.index("1 ! levels plus icon data:")
    end = original.index("-999", start) + len("-999")
    source.write_text(original[:start] + original[end:], encoding="ascii")

    envelope = handle_request(
        {
            "protocol_version": PROTOCOL_VERSION,
            "request_id": "spatial-unavailable-test",
            "operation": "read_semantic_project",
            "source_path": str(source),
            "revision_id": "revision-test",
        }
    )

    assert envelope["ok"] is True
    result = envelope["result"]
    assert result["zones"]
    assert result["spatial_projection"]["status"] == "unavailable"
    assert result["spatial_projection"]["unavailable_reason"] == "spatial_section_missing"
    assert result["spatial_projection"]["levels"] == []
    assert "source_path" not in result["spatial_projection"]


def test_semantic_bridge_keeps_project_when_spatial_section_is_malformed(
    tmp_path: Path,
) -> None:
    source = tmp_path / "malformed-spatial.prj"
    original = FIXTURES["test_GetPrjInfo.prj"][0].read_text(encoding="ascii")
    source.write_text(
        original.replace("  1   0.000   3.000 63 0 0 <1>", "  1   0.000   3.000 63 2 0 <1>", 1),
        encoding="ascii",
    )

    envelope = handle_request(
        {
            "protocol_version": PROTOCOL_VERSION,
            "request_id": "spatial-malformed-test",
            "operation": "read_semantic_project",
            "source_path": str(source),
            "revision_id": "revision-test",
        }
    )

    assert envelope["ok"] is True
    result = envelope["result"]
    assert result["zones"]
    assert result["flow_paths"]
    assert result["spatial_projection"]["status"] == "unavailable"
    assert result["spatial_projection"]["unavailable_reason"] == "spatial_level_unit_invalid"
    assert result["spatial_projection"]["levels"] == []
