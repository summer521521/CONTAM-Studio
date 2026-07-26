from __future__ import annotations
from pathlib import Path
import hashlib
import shutil
import pytest
from contam_studio_core.zone_bridge import handle_request
from contam_studio_core.prj_zone_reader import read_simple_zones
from contam_studio_core.semantic_patch import SemanticPatchError, apply_transaction_to_copy, plan_zone_transaction, stable_zone_id

FIXTURE = Path(__file__).parents[2] / "fixtures" / "contam" / "official-contamxpy" / "test_GetPrjInfo.prj"

def test_multi_zone_transaction_is_byte_local_and_atomic(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    shutil.copyfile(FIXTURE, source)
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    doc = read_simple_zones(source)
    first, second = doc.zones[:2]
    tx = plan_zone_transaction(source, "00000000-0000-4000-8000-000000000001", (
        {"operation":"set_zone_volume", "object_id": stable_zone_id(before, first.contam_number, first.source_line_number), "new_value":"650", "unit":"m3"},
        {"operation":"set_zone_name", "object_id": stable_zone_id(before, second.contam_number, second.source_line_number), "new_value":"Edited", "unit":None},
    ))
    target = tmp_path / "draft.prj"
    apply_transaction_to_copy(source, target, tx)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    assert target.read_bytes() != source.read_bytes()
    assert read_simple_zones(target).zones[0].volume_m3 == 650

def test_unknown_duplicate_or_changed_values_fail_before_output(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    shutil.copyfile(FIXTURE, source)
    doc = read_simple_zones(source)
    with pytest.raises(SemanticPatchError, match="不受支持"):
        plan_zone_transaction(source, "00000000-0000-4000-8000-000000000001", ({"operation":"set_level_height", "object_id":"x", "new_value":"1", "unit":"m"},))
    zone = doc.zones[0]
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    object_id = stable_zone_id(digest, zone.contam_number, zone.source_line_number)
    with pytest.raises(SemanticPatchError, match="重复"):
        plan_zone_transaction(source, "00000000-0000-4000-8000-000000000001", tuple({"operation":"set_zone_volume", "object_id":object_id, "new_value":value, "unit":"m3"} for value in ("650", "651")))


def test_bridge_semantic_snapshot_and_apply_are_path_free_and_revision_bound(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    shutil.copyfile(FIXTURE, source)
    snapshot = handle_request({"protocol_version": "1.2", "request_id": "semantic-read", "operation": "read_semantic_project", "source_path": str(source)})
    assert snapshot["ok"]
    assert snapshot["result"]["zones"]
    assert "source_path" not in str(snapshot)
    digest = snapshot["result"]["source_sha256"]
    zone = snapshot["result"]["zones"][0]
    revision = "00000000-0000-4000-8000-000000000001"
    planned = handle_request({"protocol_version": "1.2", "request_id": "semantic-plan", "operation": "plan_semantic_patch", "source_path": str(source), "revision_id": revision, "operations": [{"operation": "set_zone_volume", "object_id": zone["object_id"], "new_value": "650", "unit": "m3"}]})
    assert planned["ok"]
    transaction = planned["result"]["transaction"]
    output = tmp_path / "draft.prj"
    applied = handle_request({"protocol_version": "1.2", "request_id": "semantic-apply", "operation": "apply_semantic_patch_to_copy", "source_path": str(source), "output_path": str(output), "transaction": transaction})
    assert applied["ok"]
    assert applied["result"]["source_unchanged"]
    assert applied["result"]["output_sha256"] != digest
    assert "source_path" not in str(applied)
    assert read_simple_zones(output).zones[0].volume_m3 == 650
    next_snapshot = handle_request({"protocol_version": "1.2", "request_id": "semantic-read-next", "operation": "read_semantic_project", "source_path": str(output), "baseline_sha256": digest})
    assert next_snapshot["ok"]
    assert next_snapshot["result"]["identity_sha256"] == digest
    assert next_snapshot["result"]["zones"][0]["object_id"] == zone["object_id"]


def test_bridge_semantic_plan_rejects_unknown_fields_and_stale_old_values(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    shutil.copyfile(FIXTURE, source)
    snapshot = handle_request({"protocol_version": "1.2", "request_id": "semantic-read", "operation": "read_semantic_project", "source_path": str(source)})
    zone = snapshot["result"]["zones"][0]
    revision = "00000000-0000-4000-8000-000000000001"
    unknown = handle_request({"protocol_version": "1.2", "request_id": "semantic-plan", "operation": "plan_semantic_patch", "source_path": str(source), "revision_id": revision, "operations": [{"operation": "set_zone_volume", "object_id": zone["object_id"], "new_value": "650", "unit": "m3", "shell": "no"}]})
    assert not unknown["ok"]
    source.write_bytes(source.read_bytes() + b"\n")
    stale = handle_request({"protocol_version": "1.2", "request_id": "semantic-plan", "operation": "plan_semantic_patch", "source_path": str(source), "revision_id": revision, "operations": [{"operation": "set_zone_volume", "object_id": zone["object_id"], "new_value": "650", "unit": "m3"}]})
    assert not stale["ok"]


def test_flow_path_multiplier_patch_uses_verified_object_and_preserves_source(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    shutil.copyfile(FIXTURE, source)
    before = source.read_bytes()
    snapshot = handle_request({"protocol_version": "1.2", "request_id": "flow-read", "operation": "read_semantic_project", "source_path": str(source)})
    path = next(item for item in snapshot["result"]["flow_paths"] if item["editable"])
    old = float(path["multiplier"])
    new = f"{old * 1.1:.8g}"
    planned = handle_request({"protocol_version": "1.2", "request_id": "flow-plan", "operation": "plan_semantic_patch", "source_path": str(source), "revision_id": "00000000-0000-4000-8000-000000000001", "operations": [{"operation": "set_flow_path_multiplier", "object_id": path["object_id"], "new_value": new, "unit": "1"}]})
    assert planned["ok"]
    output = tmp_path / "flow-draft.prj"
    applied = handle_request({"protocol_version": "1.2", "request_id": "flow-apply", "operation": "apply_semantic_patch_to_copy", "source_path": str(source), "output_path": str(output), "transaction": planned["result"]["transaction"]})
    assert applied["ok"]
    assert source.read_bytes() == before
    assert output.read_bytes() != before
