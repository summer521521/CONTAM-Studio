import { describe, expect, it } from "vitest";
import { INITIAL_SEMANTIC_STATE, semanticReducer, semanticNodeId, type SemanticSnapshot } from "./semantic-state";

const snapshot: SemanticSnapshot = {
  result_type: "semantic_project_snapshot", source_sha256: "a".repeat(64), revision_state: "baseline_editable",
  project: { object_id: "project-a", object_kind: "Project" }, levels: [],
  zones: [{ object_id: "zone-a", object_kind: "Zone", name: "One", fields: { name: "One", volume_m3: 600 }, capabilities: { name: { state: "editable_via_patch", unit: null }, volume_m3: { state: "editable_via_patch", unit: "m3" } } }],
  flow_paths: [], schedules: [], species: [], sources: [], sections: [], read_only_reason: null,
  spatial_projection: { schema_version: "spatial_projection.v1", status: "unavailable", identity_sha256: "a".repeat(64), source_sha256: "a".repeat(64), revision_id: "baseline", levels: [], warnings: [], unavailable_reason: "spatial_section_missing" },
};

describe("semantic state", () => {
  it("tracks multi-object edits and invalidates the review when context changes", () => {
    let state = semanticReducer(INITIAL_SEMANTIC_STATE, { type: "snapshot_received", snapshot });
    state = semanticReducer(state, { type: "object_selected", objectId: "zone-a" });
    state = semanticReducer(state, { type: "object_selected", objectId: "zone-a", append: true });
    expect(state.selectedObjectIds).toEqual([]);
    state = semanticReducer(state, { type: "object_selected", objectId: "zone-a" });
    state = semanticReducer(state, { type: "edit", operations: [{ operation: "set_zone_volume", object_id: "zone-a", new_value: "650", unit: "m3" }] });
    expect(state.operations).toHaveLength(1);
    state = semanticReducer(state, { type: "plan_received", plan: { request_id: "r", project_session_id: "s", revision_id: "v", patch_id: "p", source_sha256: "a".repeat(64), patch_sha256: "b".repeat(64), diff: [], error: null } });
    expect(state.status).toBe("review");
    state = semanticReducer(state, { type: "context_changed" });
    expect(state.plan).toBeNull();
  });

  it("supports undo and redo without exposing paths", () => {
    let state = semanticReducer(INITIAL_SEMANTIC_STATE, { type: "snapshot_received", snapshot });
    state = semanticReducer(state, { type: "edit", operations: [{ operation: "set_zone_name", object_id: "zone-a", new_value: "Two", unit: null }] });
    state = semanticReducer(state, { type: "undo" });
    expect(state.operations).toEqual([]);
    state = semanticReducer(state, { type: "redo" });
    expect(state.operations[0].new_value).toBe("Two");
    expect(JSON.stringify(state)).not.toMatch(/[A-Za-z]:\\|source_path|output_path/);
    expect(semanticNodeId(snapshot.zones[0])).toBe("zone-a");
  });
});
