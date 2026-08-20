import { describe, expect, it } from "vitest";
import {
  INITIAL_SEMANTIC_STATE,
  semanticApplyResponseIssue,
  semanticNodeId,
  semanticPlanResponseIssue,
  semanticReducer,
  type DesktopSemanticApplyResponse,
  type DesktopSemanticPatchPlanResponse,
  type SemanticSnapshot,
} from "./semantic-state";

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
    expect(state.operations).toEqual([]);
    expect(state.snapshot).toBeNull();
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

  it("stages the verified existing-icon coordinate subset as two explicit fields", () => {
    const operations = [
      { operation: "set_spatial_icon_column" as const, object_id: "icon-a", new_value: "12", unit: "grid_cell" },
      { operation: "set_spatial_icon_row" as const, object_id: "icon-a", new_value: "18", unit: "grid_cell" },
    ];
    const state = semanticReducer(INITIAL_SEMANTIC_STATE, { type: "edit", operations });
    expect(state.operations).toEqual(operations);
    expect(state.status).toBe("editing");
  });

  it("rejects semantic plan and apply responses from a stale project context", () => {
    const plan: DesktopSemanticPatchPlanResponse = {
      request_id: "request-1",
      project_session_id: "session-1",
      revision_id: "revision-1",
      patch_id: "patch-1",
      source_sha256: "a".repeat(64),
      patch_sha256: "b".repeat(64),
      diff: [{
        operation: "set_spatial_icon_column",
        operation_id: "operation-1",
        object_id: "icon-1",
        field: "column",
        old_value: "1",
        new_value: "2",
        unit: "grid_cell",
        evidence_span: [1, 2],
        source_sha256: "a".repeat(64),
      }],
      error: null,
    };
    const expectation = {
      requestId: "request-1",
      projectSessionId: "session-1",
      revisionId: "revision-1",
      sourceSha256: "a".repeat(64),
      operationCount: 1,
    };
    expect(semanticPlanResponseIssue(plan, expectation)).toBeNull();
    expect(semanticPlanResponseIssue({ ...plan, revision_id: "revision-stale" }, expectation)?.code)
      .toBe("semantic_plan_invalid");
    expect(semanticPlanResponseIssue({ ...plan, diff: [] }, expectation)?.code)
      .toBe("semantic_plan_invalid");

    const apply: DesktopSemanticApplyResponse = {
      request_id: "apply-1",
      project_session_id: "session-1",
      project: {} as DesktopSemanticApplyResponse["project"],
      draft: {} as DesktopSemanticApplyResponse["draft"],
      patch_id: "patch-1",
      error: null,
    };
    expect(semanticApplyResponseIssue(apply, { requestId: "apply-1", projectSessionId: "session-1", patchId: "patch-1" })).toBeNull();
    expect(semanticApplyResponseIssue({ ...apply, project_session_id: "session-stale" }, { requestId: "apply-1", projectSessionId: "session-1", patchId: "patch-1" })?.code)
      .toBe("semantic_apply_invalid");
  });
});
