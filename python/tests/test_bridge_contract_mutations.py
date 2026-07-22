from __future__ import annotations

import json
from pathlib import Path

import pytest

import contam_studio_core.zone_bridge as bridge
from contam_studio_core.zone_bridge import (
    MAX_REQUEST_BYTES,
    OPERATION_APPLY_ZONE_VOLUME_PATCH,
    OPERATION_EXTRACT_ZONE_AIR_STATE,
    OPERATION_PLAN_ZONE_VOLUME_PATCH,
    OPERATION_READ_SIMPLE_ZONES,
    OPERATION_RUN_ACTIVE_PROJECT,
    BridgeRequestError,
    handle_request,
)
from contam_studio_core.zone_volume_patch import plan_zone_volume_patch

REPO_ROOT = Path(__file__).parents[2]
TRACKED_PRJ = REPO_ROOT / "fixtures" / "contam" / "official-contamxpy" / "valThreeZonesWthCtm-UseApi.prj"


def _request(operation: str) -> dict[str, object]:
    return {
        "operation": operation,
        "protocol_version": "1.2",
        "request_id": f"mutation-{operation}",
    }


@pytest.mark.parametrize(
    "operation",
    [
        OPERATION_READ_SIMPLE_ZONES,
        OPERATION_PLAN_ZONE_VOLUME_PATCH,
        OPERATION_APPLY_ZONE_VOLUME_PATCH,
        OPERATION_EXTRACT_ZONE_AIR_STATE,
        OPERATION_RUN_ACTIVE_PROJECT,
    ],
)
def test_five_operation_request_exact_limit_and_one_byte_over(operation: str) -> None:
    payload = json.dumps(_request(operation), separators=(",", ":")).encode("utf-8")
    exact = b" " * (MAX_REQUEST_BYTES - len(payload)) + payload
    assert len(exact) == MAX_REQUEST_BYTES
    assert bridge._decode_request(exact)["operation"] == operation

    with pytest.raises(BridgeRequestError) as error:
        bridge._decode_request(b" " + exact)
    assert error.value.diagnostic.code == "bridge_request_too_large"


def test_protocol_and_domain_schema_mutations_remain_structured(tmp_path: Path) -> None:
    protocol = _request(OPERATION_READ_SIMPLE_ZONES)
    protocol["source_path"] = str(TRACKED_PRJ)
    protocol["protocol_version"] = "9.9"
    envelope = handle_request(protocol)
    assert envelope["error"]["code"] == "bridge_protocol_version_unsupported"

    patch = plan_zone_volume_patch(TRACKED_PRJ, 1, "650").to_dict()
    patch["schema_version"] = "9.9"
    request = _request(OPERATION_APPLY_ZONE_VOLUME_PATCH)
    request.update(
        {
            "output_path": str(tmp_path / "copy.prj"),
            "patch": patch,
            "source_path": str(TRACKED_PRJ),
        }
    )
    envelope = handle_request(request)
    assert envelope["ok"] is False
    assert envelope["error"]["code"] == "patch_precondition_failed"
    assert not (tmp_path / "copy.prj").exists()


def test_diagnostic_cleanup_rejects_unknown_context_and_hides_paths() -> None:
    envelope = handle_request(
        {
            "operation": OPERATION_READ_SIMPLE_ZONES,
            "protocol_version": "1.2",
            "request_id": "mutation",
            "source_path": "C:/secret/model.prj",
            "unexpected": "secret",
        }
    )
    serialized = json.dumps(envelope)
    assert "C:/secret/model.prj" not in serialized
    assert "secret" not in serialized
    assert envelope["error"]["context"] == {}
