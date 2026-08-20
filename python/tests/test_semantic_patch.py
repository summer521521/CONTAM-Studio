from __future__ import annotations
from dataclasses import replace
from pathlib import Path
import hashlib
import shutil
import pytest
from contam_studio_core.zone_bridge import handle_request
from contam_studio_core.prj_zone_reader import read_simple_zones
from contam_studio_core.semantic_patch import SemanticPatchError, apply_transaction_to_copy, plan_zone_transaction, stable_zone_id

FIXTURE = Path(__file__).parents[2] / "fixtures" / "contam" / "official-contamxpy" / "test_GetPrjInfo.prj"
SPATIAL_FIXTURES = (
    Path(__file__).parents[2] / "fixtures" / "contam" / "official-nist-tutorials" / "demo1c.prj",
    Path(__file__).parents[2] / "fixtures" / "contam" / "official-contamxpy" / "valThreeZonesWthCtm-UseApi.prj",
    FIXTURE,
)

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


def test_sketchpad_icon_move_is_byte_local_and_uses_icon_column_row_order(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    shutil.copyfile(FIXTURE, source)
    before = source.read_bytes()
    revision = "00000000-0000-4000-8000-000000000001"
    snapshot = handle_request(
        {
            "protocol_version": "1.2",
            "request_id": "spatial-read",
            "operation": "read_semantic_project",
            "source_path": str(source),
            "revision_id": revision,
        }
    )
    assert snapshot["ok"]
    projection = snapshot["result"]["spatial_projection"]
    icon = projection["levels"][0]["icons"][0]
    occupied = {
        (item["column"], item["row"])
        for level in projection["levels"]
        for item in level["icons"]
    }
    new_column, new_row = next(
        (column, row)
        for row in range(58)
        for column in range(66)
        if (column, row) not in occupied
        and column != icon["column"]
        and row != icon["row"]
    )
    requested = (
        {
            "operation": "set_spatial_icon_column",
            "object_id": icon["id"],
            "new_value": str(new_column),
            "unit": "grid_cell",
        },
        {
            "operation": "set_spatial_icon_row",
            "object_id": icon["id"],
            "new_value": str(new_row),
            "unit": "grid_cell",
        },
    )
    transaction = plan_zone_transaction(
        source,
        revision,
        requested,
        identity_sha256=projection["identity_sha256"],
    )
    assert [item.field for item in transaction.operations] == ["column", "row"]
    assert [item.old_value for item in transaction.operations] == [
        str(icon["column"]),
        str(icon["row"]),
    ]
    output = tmp_path / "spatial-draft.prj"
    apply_transaction_to_copy(source, output, transaction)

    assert source.read_bytes() == before
    before_lines = before.decode("ascii").splitlines()
    after_lines = output.read_text("ascii").splitlines()
    changed_lines = [
        index + 1
        for index, (old, new) in enumerate(zip(before_lines, after_lines, strict=True))
        if old != new
    ]
    assert changed_lines == [icon["evidence"]["source_line"]]
    old_tokens = before_lines[changed_lines[0] - 1].split()
    new_tokens = after_lines[changed_lines[0] - 1].split()
    assert old_tokens == [
        str(icon["icon_type"]),
        str(icon["column"]),
        str(icon["row"]),
        str(icon["object_number"]),
    ]
    assert new_tokens == [
        str(icon["icon_type"]),
        str(new_column),
        str(new_row),
        str(icon["object_number"]),
    ]

    reread = handle_request(
        {
            "protocol_version": "1.2",
            "request_id": "spatial-reread",
            "operation": "read_semantic_project",
            "source_path": str(output),
            "baseline_sha256": projection["identity_sha256"],
            "revision_id": revision,
        }
    )
    assert reread["ok"]
    moved = next(
        item
        for level in reread["result"]["spatial_projection"]["levels"]
        for item in level["icons"]
        if item["icon_type"] == icon["icon_type"]
        and item["object_number"] == icon["object_number"]
        and item["evidence"]["source_line"] == icon["evidence"]["source_line"]
    )
    assert (moved["column"], moved["row"]) == (new_column, new_row)


def test_sketchpad_icon_move_rejects_collision_bounds_and_tampering(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    shutil.copyfile(FIXTURE, source)
    revision = "00000000-0000-4000-8000-000000000001"
    snapshot = handle_request(
        {
            "protocol_version": "1.2",
            "request_id": "spatial-guard-read",
            "operation": "read_semantic_project",
            "source_path": str(source),
            "revision_id": revision,
        }
    )["result"]["spatial_projection"]
    first = snapshot["levels"][0]["icons"][0]
    second = next(
        item
        for item in snapshot["levels"][0]["icons"][1:]
        if item["column"] != first["column"] and item["row"] != first["row"]
    )
    collision = (
        {
            "operation": "set_spatial_icon_column",
            "object_id": first["id"],
            "new_value": str(second["column"]),
            "unit": "grid_cell",
        },
        {
            "operation": "set_spatial_icon_row",
            "object_id": first["id"],
            "new_value": str(second["row"]),
            "unit": "grid_cell",
        },
    )
    with pytest.raises(SemanticPatchError) as collision_error:
        plan_zone_transaction(
            source,
            revision,
            collision,
            identity_sha256=snapshot["identity_sha256"],
        )
    assert collision_error.value.code == "spatial_icon_collision"

    with pytest.raises(SemanticPatchError) as bounds_error:
        plan_zone_transaction(
            source,
            revision,
            (
                {
                    "operation": "set_spatial_icon_column",
                    "object_id": first["id"],
                    "new_value": "66",
                    "unit": "grid_cell",
                },
            ),
            identity_sha256=snapshot["identity_sha256"],
        )
    assert bounds_error.value.code == "spatial_coordinate_out_of_bounds"

    valid = plan_zone_transaction(
        source,
        revision,
        (
            {
                "operation": "set_spatial_icon_column",
                "object_id": first["id"],
                "new_value": "0",
                "unit": "grid_cell",
            },
        ),
        identity_sha256=snapshot["identity_sha256"],
    )
    tampered_operation = replace(valid.operations[0], new_value="1")
    tampered = replace(valid, operations=(tampered_operation,))
    output = tmp_path / "tampered.prj"
    with pytest.raises(SemanticPatchError) as tamper_error:
        apply_transaction_to_copy(source, output, tampered)
    assert tamper_error.value.code == "patch_hash_mismatch"
    assert not output.exists()


def test_sketchpad_icon_move_rejects_unverified_grid_extents(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    shutil.copyfile(FIXTURE, source)
    revision = "00000000-0000-4000-8000-000000000001"
    snapshot = handle_request(
        {
            "protocol_version": "1.2",
            "request_id": "spatial-extent-read",
            "operation": "read_semantic_project",
            "source_path": str(source),
            "revision_id": revision,
        }
    )["result"]["spatial_projection"]
    icon = snapshot["levels"][0]["icons"][0]
    source.write_bytes(source.read_bytes().replace(b"! rows cols", b"! rows unknown", 1))

    with pytest.raises(SemanticPatchError) as extent_error:
        plan_zone_transaction(
            source,
            revision,
            (
                {
                    "operation": "set_spatial_icon_column",
                    "object_id": icon["id"],
                    "new_value": "0",
                    "unit": "grid_cell",
                },
            ),
            identity_sha256=snapshot["identity_sha256"],
        )
    assert extent_error.value.code == "sketchpad_extent_unverified"


def test_bridge_applies_verified_sketchpad_icon_move_to_new_copy(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    shutil.copyfile(FIXTURE, source)
    revision = "00000000-0000-4000-8000-000000000001"
    snapshot = handle_request(
        {
            "protocol_version": "1.2",
            "request_id": "spatial-bridge-read",
            "operation": "read_semantic_project",
            "source_path": str(source),
            "revision_id": revision,
        }
    )["result"]
    icon = snapshot["spatial_projection"]["levels"][0]["icons"][0]
    planned = handle_request(
        {
            "protocol_version": "1.2",
            "request_id": "spatial-bridge-plan",
            "operation": "plan_semantic_patch",
            "source_path": str(source),
            "baseline_sha256": snapshot["identity_sha256"],
            "revision_id": revision,
            "operations": [
                {
                    "operation": "set_spatial_icon_column",
                    "object_id": icon["id"],
                    "new_value": "0",
                    "unit": "grid_cell",
                }
            ],
        }
    )
    assert planned["ok"]
    assert planned["result"]["diff"][0]["field"] == "column"
    output = tmp_path / "bridge-spatial-draft.prj"
    applied = handle_request(
        {
            "protocol_version": "1.2",
            "request_id": "spatial-bridge-apply",
            "operation": "apply_semantic_patch_to_copy",
            "source_path": str(source),
            "output_path": str(output),
            "transaction": planned["result"]["transaction"],
        }
    )
    assert applied["ok"]
    assert applied["result"]["source_unchanged"] is True
    assert output.is_file()


@pytest.mark.parametrize("fixture", SPATIAL_FIXTURES, ids=lambda path: path.stem)
def test_verified_icon_position_subset_round_trips_official_fixtures(
    tmp_path: Path, fixture: Path
) -> None:
    source = tmp_path / fixture.name
    shutil.copyfile(fixture, source)
    before = source.read_bytes()
    revision = "00000000-0000-4000-8000-000000000001"
    snapshot = handle_request(
        {
            "protocol_version": "1.2",
            "request_id": f"fixture-read-{fixture.stem}",
            "operation": "read_semantic_project",
            "source_path": str(source),
            "revision_id": revision,
        }
    )["result"]["spatial_projection"]
    icon = snapshot["levels"][0]["icons"][0]
    occupied = {
        (item["column"], item["row"])
        for level in snapshot["levels"]
        for item in level["icons"]
    }
    new_column = next(
        column
        for column in range(66)
        if (column, icon["row"]) not in occupied and column != icon["column"]
    )
    transaction = plan_zone_transaction(
        source,
        revision,
        (
            {
                "operation": "set_spatial_icon_column",
                "object_id": icon["id"],
                "new_value": str(new_column),
                "unit": "grid_cell",
            },
        ),
        identity_sha256=snapshot["identity_sha256"],
    )
    output = tmp_path / f"{fixture.stem}-moved.prj"
    apply_transaction_to_copy(source, output, transaction)
    assert source.read_bytes() == before
    assert output.is_file()
