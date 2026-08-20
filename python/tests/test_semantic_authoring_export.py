from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from contam_studio_core.contam_semantic_draft import create_empty_contam_semantic_draft
from contam_studio_core.domain_network import project_airflow
from contam_studio_core.prj_sections import read_prj_sections
from contam_studio_core.prj_zone_reader import read_simple_zones
from contam_studio_core.semantic_authoring_export import (
    SemanticAuthoringExportError,
    export_semantic_authoring_draft_to_copy,
)
from contam_studio_core.zone_bridge import PROTOCOL_VERSION, handle_request


FIXTURES = Path(__file__).parents[2] / "fixtures" / "contam"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def draft_for(source: Path) -> dict:
    sections = read_prj_sections(source)
    network = project_airflow(sections)
    element = next(item for item in network.components if item.supported)
    value = create_empty_contam_semantic_draft(
        draft_id="semantic-export-draft-1",
        project_session_id="project-session-1",
        identity_sha256=sections.source_sha256,
        source_sha256=sections.source_sha256,
        revision_id="revision-1",
    )
    value["draft_revision"] = 2
    value["zones"].append(
        {
            "id": "draft-zone-1",
            "level_number": 1,
            "name": "StudioZone",
            "display_name": "Studio Zone",
            "volume_litres": 48_125,
            "volume_basis": "explicit",
            "geometry_region_id": "region-studio-1",
            "initial_temperature_millikelvin": 293_150,
            "initial_pressure_millipascal": 0,
        }
    )
    value["flow_paths"].append(
        {
            "id": "draft-flow-1",
            "level_number": 1,
            "opening_id": "opening-studio-1",
            "from_endpoint": {"kind": "zone", "zone_id": "draft-zone-1"},
            "to_endpoint": {"kind": "outdoor", "zone_id": None},
            "flow_element_id": element.element_id,
            "multiplier_millionths": 1_250_000,
            "x_mm": 4_000,
            "y_mm": 2_000,
            "relative_height_mm": 1_500,
            "direction_degrees": -1,
        }
    )
    return value


@pytest.mark.parametrize(
    "relative",
    [
        Path("official-nist-tutorials/demo1c.prj"),
        Path("official-contamxpy/valThreeZonesWthCtm-UseApi.prj"),
    ],
)
def test_exports_new_copy_and_preserves_source_with_zeroed_concentrations(
    tmp_path: Path,
    relative: Path,
) -> None:
    source = FIXTURES / relative
    before = sha256(source)
    before_zones = read_simple_zones(source)
    before_network = project_airflow(read_prj_sections(source))
    target = tmp_path / f"{source.stem}-studio.prj"

    result = export_semantic_authoring_draft_to_copy(source, target, draft_for(source))

    assert target.is_file()
    assert sha256(source) == before
    assert result.source_unchanged is True
    assert result.added_zone_count == 1
    assert result.added_flow_path_count == 1
    assert result.zone_number_by_id == {"draft-zone-1": before_zones.declared_zone_count + 1}
    assert result.flow_path_number_by_id == {"draft-flow-1": len(before_network.paths) + 1}
    after_zones = read_simple_zones(target)
    after_network = project_airflow(read_prj_sections(target))
    assert len(after_zones.zones) == len(before_zones.zones) + 1
    assert after_zones.zones[-1].name == "StudioZone"
    assert after_zones.zones[-1].volume_m3 == pytest.approx(48.125)
    assert len(after_network.paths) == len(before_network.paths) + 1
    assert after_network.paths[-1].from_endpoint.contam_number == before_zones.declared_zone_count + 1
    assert after_network.paths[-1].to_endpoint.category == "outdoor"
    assert after_network.paths[-1].multiplier == pytest.approx(1.25)


def test_export_refuses_overwrite_and_invalid_context(tmp_path: Path) -> None:
    source = FIXTURES / "official-nist-tutorials" / "demo1c.prj"
    target = tmp_path / "existing.prj"
    target.write_bytes(b"protected")
    with pytest.raises(SemanticAuthoringExportError, match="目标副本已存在"):
        export_semantic_authoring_draft_to_copy(source, target, draft_for(source))
    assert target.read_bytes() == b"protected"

    invalid = draft_for(source)
    invalid["source_sha256"] = "c" * 64
    missing = tmp_path / "invalid.prj"
    with pytest.raises(SemanticAuthoringExportError, match="语义草稿未通过"):
        export_semantic_authoring_draft_to_copy(source, missing, invalid)
    assert not missing.exists()


def test_worker_operation_returns_exact_semantic_authoring_export_envelope(tmp_path: Path) -> None:
    source = FIXTURES / "official-nist-tutorials" / "demo1c.prj"
    before = sha256(source)
    target = tmp_path / "worker-export.prj"
    request_id = "f243b05d-8402-4bd8-b1cf-3651da259b7a"

    envelope = handle_request(
        {
            "protocol_version": PROTOCOL_VERSION,
            "request_id": request_id,
            "operation": "export_semantic_authoring_draft_to_copy",
            "source_path": str(source),
            "output_path": str(target),
            "semantic_draft": draft_for(source),
        }
    )

    assert envelope["protocol_version"] == PROTOCOL_VERSION
    assert envelope["request_id"] == request_id
    assert envelope["ok"] is True
    assert envelope["error"] is None
    assert envelope["result"]["result_type"] == "semantic_authoring_export"
    assert envelope["result"]["sketchpad_geometry_written"] is False
    assert envelope["result"]["output_sha256"] == sha256(target)
    assert sha256(source) == before
