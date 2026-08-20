from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path

import pytest

from contam_studio_core.contam_semantic_draft import (
    ContamSemanticDraftError,
    DraftContext,
    create_empty_contam_semantic_draft,
    parse_contam_semantic_draft,
    semantic_draft_sha256,
    validate_contam_semantic_draft,
)


IDENTITY = "a" * 64
SOURCE = "b" * 64
CONTRACT_FIXTURE = (
    Path(__file__).parents[2]
    / "contracts"
    / "semantic-authoring"
    / "fixtures"
    / "valid-draft.json"
)


def context(**changes) -> DraftContext:
    values = {
        "project_session_id": "session-1",
        "identity_sha256": IDENTITY,
        "source_sha256": SOURCE,
        "revision_id": "revision-1",
        "level_numbers": frozenset({1, 2}),
        "existing_zone_ids": frozenset({"existing-zone-1"}),
        "supported_flow_element_ids": frozenset({"flow-element-1"}),
        "geometry": None,
    }
    values.update(changes)
    return DraftContext(**values)


def draft() -> dict:
    value = create_empty_contam_semantic_draft(
        draft_id="semantic-draft-1",
        project_session_id="session-1",
        identity_sha256=IDENTITY,
        source_sha256=SOURCE,
        revision_id="revision-1",
    )
    value["draft_revision"] = 2
    value["zones"].append(
        {
            "id": "draft-zone-1",
            "level_number": 1,
            "name": "Office_1",
            "display_name": "办公室 1",
            "volume_litres": 48_000,
            "volume_basis": "geometry_estimate_confirmed",
            "geometry_region_id": "region-1",
            "initial_temperature_millikelvin": 293_150,
            "initial_pressure_millipascal": 0,
        }
    )
    value["flow_paths"].append(
        {
            "id": "draft-flow-1",
            "level_number": 1,
            "opening_id": "opening-1",
            "from_endpoint": {"kind": "zone", "zone_id": "draft-zone-1"},
            "to_endpoint": {"kind": "zone", "zone_id": "existing-zone-1"},
            "flow_element_id": "flow-element-1",
            "multiplier_millionths": 1_000_000,
            "x_mm": 4_000,
            "y_mm": 2_000,
            "relative_height_mm": 1_500,
            "direction_degrees": -1,
        }
    )
    return value


def test_fixed_point_semantic_draft_is_valid_and_hashable() -> None:
    value = draft()
    assert parse_contam_semantic_draft(value) == value
    result = validate_contam_semantic_draft(value, context())
    assert result.status == "valid"
    assert result.diagnostics == ()
    assert result.draft_sha256 == semantic_draft_sha256(value)
    assert len(result.draft_sha256) == 64


def test_contract_fixture_has_cross_language_canonical_hash() -> None:
    value = json.loads(CONTRACT_FIXTURE.read_text(encoding="utf-8"))
    assert semantic_draft_sha256(value) == (
        "08ebf8937b1640ca13a55b701a84e3b83b05e77c665e5986ec4a795018229586"
    )


def test_context_elements_and_endpoints_fail_independently() -> None:
    value = draft()
    value["source_sha256"] = "c" * 64
    value["flow_paths"][0]["flow_element_id"] = "unsupported-element"
    value["flow_paths"][0]["to_endpoint"] = {"kind": "zone", "zone_id": "missing-zone"}
    assert validate_contam_semantic_draft(value, context()).diagnostics == (
        "semantic_draft_context_stale",
        "semantic_draft_endpoint_unknown",
        "semantic_draft_flow_element_unsupported",
    )


def test_duplicates_and_outdoor_to_outdoor_are_rejected() -> None:
    value = draft()
    value["zones"].append(deepcopy(value["zones"][0]))
    duplicate_path = deepcopy(value["flow_paths"][0])
    duplicate_path["from_endpoint"] = {"kind": "outdoor", "zone_id": None}
    duplicate_path["to_endpoint"] = {"kind": "outdoor", "zone_id": None}
    value["flow_paths"].append(duplicate_path)
    assert validate_contam_semantic_draft(value, context()).diagnostics == (
        "semantic_draft_flow_path_id_duplicate",
        "semantic_draft_flow_path_outdoor_to_outdoor",
        "semantic_draft_opening_duplicate",
        "semantic_draft_zone_id_duplicate",
        "semantic_draft_zone_name_duplicate",
        "semantic_draft_zone_region_duplicate",
    )


def test_unknown_fields_unsafe_names_and_boolean_integers_fail_closed() -> None:
    value = draft()
    value["unexpected"] = True
    with pytest.raises(ContamSemanticDraftError, match="semantic_draft_contract_invalid"):
        parse_contam_semantic_draft(value)
    value = draft()
    value["zones"][0]["name"] = "bad name"
    with pytest.raises(ContamSemanticDraftError):
        parse_contam_semantic_draft(value)
    value = draft()
    value["zones"][0]["volume_litres"] = True
    with pytest.raises(ContamSemanticDraftError):
        parse_contam_semantic_draft(value)


def test_geometry_bindings_are_explicit() -> None:
    value = draft()
    missing = {"levels": [{"level_number": 1, "zone_regions": [], "openings": [], "flow_path_anchors": []}]}
    assert validate_contam_semantic_draft(value, context(geometry=missing)).diagnostics == (
        "semantic_draft_flow_path_geometry_mismatch",
        "semantic_draft_zone_geometry_mismatch",
    )
    matching = {
        "levels": [
            {
                "level_number": 1,
                "zone_regions": [{"id": "region-1", "semantic_zone_id": "draft-zone-1"}],
                "openings": [{"id": "opening-1"}],
                "flow_path_anchors": [{
                    "semantic_flow_path_id": "draft-flow-1",
                    "opening_id": "opening-1",
                    "from_zone_id": "draft-zone-1",
                    "to_zone_id": "existing-zone-1",
                    "exterior_side": "none",
                }],
            }
        ]
    }
    assert validate_contam_semantic_draft(value, context(geometry=matching)).status == "valid"
