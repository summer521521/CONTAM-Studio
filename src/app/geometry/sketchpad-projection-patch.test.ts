import { describe, expect, it } from "vitest";
import type { SketchpadProjectionPreview } from "./sketchpad-projection-preview";
import {
  MAX_SKETCHPAD_PROJECTION_PATCH_OPERATIONS,
  prepareSketchpadProjectionPatch,
} from "./sketchpad-projection-patch";

function preview(): SketchpadProjectionPreview {
  return {
    schema_version: "sketchpad_projection_preview.v1",
    status: "preview",
    method: "zone_centroid_normalized_to_existing_icon_bounds",
    lossy: true,
    can_apply: false,
    project_session_id: "session-1",
    geometry_id: "geometry-1",
    geometry_sha256: "a".repeat(64),
    identity_sha256: "b".repeat(64),
    source_sha256: "c".repeat(64),
    revision_id: "revision-1",
    moves: [
      { icon_id: "icon-b", semantic_zone_id: "zone-b", level_number: 2, from_column: 4, from_row: 5, to_column: 4, to_row: 8, changed: true },
      { icon_id: "icon-a", semantic_zone_id: "zone-a", level_number: 1, from_column: 1, from_row: 2, to_column: 3, to_row: 2, changed: true },
      { icon_id: "icon-c", semantic_zone_id: "zone-c", level_number: 2, from_column: 6, from_row: 7, to_column: 6, to_row: 7, changed: false },
    ],
    diagnostics: ["sketchpad_projection_lossy"],
  };
}

describe("SketchPad projection Patch preparation", () => {
  it("emits only changed coordinate fields in deterministic order", () => {
    const prepared = prepareSketchpadProjectionPatch(preview());
    expect(prepared.status).toBe("ready");
    expect(prepared.changed_icon_count).toBe(2);
    expect(prepared.selected_semantic_zone_id).toBe("zone-a");
    expect(prepared.operations).toEqual([
      { operation: "set_spatial_icon_column", object_id: "icon-a", new_value: "3", unit: "grid_cell" },
      { operation: "set_spatial_icon_row", object_id: "icon-b", new_value: "8", unit: "grid_cell" },
    ]);
  });

  it("keeps blocked previews non-applicable and rejects tampered moves", () => {
    expect(prepareSketchpadProjectionPatch({ ...preview(), status: "blocked" }).diagnostic)
      .toBe("sketchpad_projection_candidate_collision");
    const changedFlag = preview();
    changedFlag.moves[0].changed = false;
    expect(prepareSketchpadProjectionPatch(changedFlag).diagnostic)
      .toBe("sketchpad_projection_change_flag_invalid");
    const duplicateCell = preview();
    duplicateCell.moves[1].level_number = 2;
    duplicateCell.moves[1].to_column = 4;
    duplicateCell.moves[1].to_row = 8;
    expect(prepareSketchpadProjectionPatch(duplicateCell).diagnostic)
      .toBe("sketchpad_projection_candidate_collision");
  });

  it("rejects duplicate identities, unsafe context and the Rust planner operation limit", () => {
    const duplicate = preview();
    duplicate.moves[1].icon_id = duplicate.moves[0].icon_id;
    expect(prepareSketchpadProjectionPatch(duplicate).diagnostic)
      .toBe("sketchpad_projection_target_duplicate");
    expect(prepareSketchpadProjectionPatch({ ...preview(), project_session_id: "bad\nvalue" }).diagnostic)
      .toBe("sketchpad_projection_context_invalid");

    const overLimit = preview();
    overLimit.moves = Array.from({ length: (MAX_SKETCHPAD_PROJECTION_PATCH_OPERATIONS / 2) + 1 }, (_, index) => ({
      icon_id: `icon-${index}`,
      semantic_zone_id: `zone-${index}`,
      level_number: 1,
      from_column: index * 3,
      from_row: 0,
      to_column: index * 3 + 1,
      to_row: 1,
      changed: true,
    }));
    expect(prepareSketchpadProjectionPatch(overLimit).diagnostic)
      .toBe("sketchpad_projection_operation_limit");
  });
});
