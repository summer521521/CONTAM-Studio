import { describe, expect, it } from "vitest";
import metricFixture from "../../../contracts/geometry/examples/studio-metric-valid.json";
import { createGeometryHistory } from "../geometry/geometry-history";
import { cloneBuildingGeometry, type BuildingGeometry } from "../geometry/geometry-model";
import { planTopologyAwareWallDraw } from "../geometry/geometry-wall-topology";
import { planLevelConstructionCopy } from "../geometry/geometry-level-construction";
import {
  GEOMETRY_AI_OPERATION_APPROVAL_SCHEMA_VERSION,
  commitApprovedAiGeometryOperationBatch,
  commitGeometryOperationBatch,
  geometryOperationBatchSha256,
  previewGeometryOperationBatch,
  redoGeometryOperationBatch,
  undoGeometryOperationBatch,
} from "./useGeometryWorkbench";

describe("geometry operation batch", () => {
  it("commits every valid command as one published state transition", () => {
    let sequence = 0;
    const history = createGeometryHistory(cloneBuildingGeometry(metricFixture as BuildingGeometry));
    const result = commitGeometryOperationBatch(history, [
      { operation: "add_vertex", parameters: { level_id: "level-1", vertex: { id: "v5", x: 5_000, y: 3_000 } } },
      { operation: "add_wall", parameters: { level_id: "level-1", wall: { id: "w5", start_vertex_id: "v3", end_vertex_id: "v5", kind: "interior", thickness: 120, source_icon_id: null } } },
    ], () => `batch-command-${++sequence}`);
    expect(result.committed).toBe(true);
    expect(result.state.geometry.geometry_revision).toBe(2);
    expect(result.state.geometry.levels[0].walls.some((wall) => wall.id === "w5")).toBe(true);
    expect(history.geometry.geometry_revision).toBe(0);
  });

  it("returns the untouched baseline when a later command fails", () => {
    let sequence = 0;
    const history = createGeometryHistory(cloneBuildingGeometry(metricFixture as BuildingGeometry));
    const result = commitGeometryOperationBatch(history, [
      { operation: "add_vertex", parameters: { level_id: "level-1", vertex: { id: "v5", x: 5_000, y: 3_000 } } },
      { operation: "add_wall", parameters: { level_id: "level-1", wall: { id: "bad-wall", start_vertex_id: "v1", end_vertex_id: "v3", kind: "interior", thickness: 120, source_icon_id: null } } },
    ], () => `rejected-command-${++sequence}`);
    expect(result.committed).toBe(false);
    expect(result.state).toBe(history);
    expect(result.state.geometry.levels[0].vertices.some((vertex) => vertex.id === "v5")).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("geometry_wall_not_orthogonal");
  });

  it("undoes and redoes a multi-command drawing gesture as one unit", () => {
    let sequence = 0;
    const history = createGeometryHistory(cloneBuildingGeometry(metricFixture as BuildingGeometry));
    const result = commitGeometryOperationBatch(history, [
      { operation: "add_vertex", parameters: { level_id: "level-1", vertex: { id: "v5", x: 5_000, y: 3_000 } } },
      { operation: "add_wall", parameters: { level_id: "level-1", wall: { id: "w5", start_vertex_id: "v3", end_vertex_id: "v5", kind: "interior", thickness: 120, source_icon_id: null } } },
    ], () => `gesture-command-${++sequence}`);

    expect(result.committed).toBe(true);
    const undone = undoGeometryOperationBatch(result.state, 2);
    expect(undone.geometry.levels[0].vertices.some((vertex) => vertex.id === "v5")).toBe(false);
    expect(undone.geometry.levels[0].walls.some((wall) => wall.id === "w5")).toBe(false);

    const redone = redoGeometryOperationBatch(undone, 2);
    expect(redone.geometry.levels[0].vertices.some((vertex) => vertex.id === "v5")).toBe(true);
    expect(redone.geometry.levels[0].walls.some((wall) => wall.id === "w5")).toBe(true);
    expect(redone.geometry_hash).toBe(result.state.geometry_hash);
  });

  it("commits intersecting wall segments and their host-wall splits as one undoable gesture", () => {
    const history = createGeometryHistory(cloneBuildingGeometry(metricFixture as BuildingGeometry));
    let topologySequence = 0;
    const plan = planTopologyAwareWallDraw(
      history.geometry.levels[0],
      { x: -1_000, y: 1_500 },
      { x: 5_000, y: 1_500 },
      (prefix) => `topology-${prefix}-${++topologySequence}`,
    );
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;

    let commandSequence = 0;
    const result = commitGeometryOperationBatch(
      history,
      plan.operations,
      () => `topology-command-${++commandSequence}`,
    );
    expect(result.committed).toBe(true);
    expect(result.state.geometry.levels[0].walls).toHaveLength(9);
    expect(result.state.geometry.levels[0].zone_regions[0].outer_vertex_ids).toHaveLength(6);

    const undone = undoGeometryOperationBatch(result.state, plan.operations.length);
    expect(undone.geometry_hash).toBe(history.geometry_hash);
    const redone = redoGeometryOperationBatch(undone, plan.operations.length);
    expect(redone.geometry_hash).toBe(result.state.geometry_hash);
  });

  it("commits a propagated corner move as one atomic history entry", () => {
    const history = createGeometryHistory(cloneBuildingGeometry(metricFixture as BuildingGeometry));
    const result = commitGeometryOperationBatch(history, [{
      operation: "move_vertices",
      parameters: {
        level_id: "level-1",
        vertices: [
          { vertex_id: "v2", x: 5_000, y: 0 },
          { vertex_id: "v3", x: 5_000, y: 4_000 },
          { vertex_id: "v4", x: 0, y: 4_000 },
        ],
      },
    }], () => "direct-manipulation-1");
    expect(result.committed).toBe(true);
    expect(result.state.entries).toHaveLength(1);
    expect(result.state.geometry.geometry_revision).toBe(1);
    expect(result.state.geometry.levels[0].vertices.find((vertex) => vertex.id === "v3")).toMatchObject({ x: 5_000, y: 4_000 });

    const undone = undoGeometryOperationBatch(result.state, 1);
    expect(undone.geometry.levels[0].vertices.find((vertex) => vertex.id === "v3")).toMatchObject({ x: 4_000, y: 3_000 });
    expect(redoGeometryOperationBatch(undone, 1).geometry_hash).toBe(result.state.geometry_hash);
  });

  it("rejects an atomic corner move when the final opening would be out of bounds", () => {
    const history = createGeometryHistory(cloneBuildingGeometry(metricFixture as BuildingGeometry));
    const result = commitGeometryOperationBatch(history, [{
      operation: "move_vertices",
      parameters: {
        level_id: "level-1",
        vertices: [
          { vertex_id: "v2", x: 1_500, y: 0 },
          { vertex_id: "v3", x: 1_500, y: 3_000 },
        ],
      },
    }], () => "direct-manipulation-invalid-opening");
    expect(result.committed).toBe(false);
    expect(result.state).toBe(history);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("geometry_opening_out_of_bounds");
    expect(history.geometry.levels[0].vertices.find((vertex) => vertex.id === "v2")).toMatchObject({ x: 4_000, y: 0 });
  });

  it("undoes one opening slide as one entry without replacing its FlowPath identity", () => {
    const model = cloneBuildingGeometry(metricFixture as BuildingGeometry);
    model.levels[0].flow_path_anchors.push({
      id: "flow-anchor-1",
      opening_id: "door-1",
      semantic_flow_path_id: "flow-1",
      from_zone_id: "zone-1",
      to_zone_id: null,
      exterior_side: "to",
    });
    const history = createGeometryHistory(model);
    const result = commitGeometryOperationBatch(history, [{
      operation: "update_opening",
      parameters: { level_id: "level-1", opening_id: "door-1", offset: 1_250, width: 1_000 },
    }], () => "opening-slide-1");
    expect(result.committed).toBe(true);
    expect(result.state.entries).toHaveLength(1);
    expect(result.state.geometry.levels[0].openings[0]).toMatchObject({
      id: "door-1", wall_id: "w1", offset: 1_250, width: 1_000,
    });
    expect(result.state.geometry.levels[0].flow_path_anchors[0]).toMatchObject({
      id: "flow-anchor-1", opening_id: "door-1", semantic_flow_path_id: "flow-1",
    });
    const undone = undoGeometryOperationBatch(result.state, 1);
    expect(undone.geometry.levels[0].openings[0]).toMatchObject({ offset: 1_000, width: 900 });
    expect(redoGeometryOperationBatch(undone, 1).geometry_hash).toBe(result.state.geometry_hash);
  });

  it("copies one Level construction shell as one undoable history entry", () => {
    const model = cloneBuildingGeometry(metricFixture as BuildingGeometry);
    model.levels.push({
      id: "level-2", level_number: 2, name: "Level 2", elevation: 3_000, height: 3_000,
      vertices: [], walls: [], openings: [], zone_regions: [], flow_path_anchors: [], underlays: [],
    });
    const history = createGeometryHistory(model);
    const plan = planLevelConstructionCopy(history.geometry, "level-1", "level-2", (kind, sourceId) => `copy-${kind}-${sourceId}`);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    const result = commitGeometryOperationBatch(history, [plan.operation], () => "copy-level-construction-1");
    expect(result.committed).toBe(true);
    expect(result.state.geometry.levels[1].walls).toHaveLength(4);
    expect(result.state.entries).toHaveLength(1);
    const undone = undoGeometryOperationBatch(result.state, 1);
    expect(undone.geometry.levels[1].walls).toEqual([]);
    expect(redoGeometryOperationBatch(undone, 1).geometry_hash).toBe(result.state.geometry_hash);
  });

  it("previews AI operations without mutation and rejects absent or stale approval", () => {
    const history = createGeometryHistory(cloneBuildingGeometry(metricFixture as BuildingGeometry));
    const operations = [
      { operation: "add_vertex" as const, parameters: { level_id: "level-1", vertex: { id: "ai-v5", x: 5_000, y: 3_000 } } },
      { operation: "add_wall" as const, parameters: { level_id: "level-1", wall: { id: "ai-w5", start_vertex_id: "v3", end_vertex_id: "ai-v5", kind: "interior", thickness: 120, source_icon_id: null } } },
    ];
    let previewSequence = 0;
    const preview = previewGeometryOperationBatch(history, operations, () => `preview-${++previewSequence}`);
    expect(preview.ready).toBe(true);
    expect(preview.geometry.levels[0].walls.some((wall) => wall.id === "ai-w5")).toBe(true);
    expect(history.geometry.levels[0].walls.some((wall) => wall.id === "ai-w5")).toBe(false);

    const absent = commitApprovedAiGeometryOperationBatch(history, operations, null);
    expect(absent.committed).toBe(false);
    expect(absent.diagnostics[0]?.code).toBe("geometry_ai_approval_required");

    const stale = commitApprovedAiGeometryOperationBatch(history, operations, {
      schemaVersion: GEOMETRY_AI_OPERATION_APPROVAL_SCHEMA_VERSION,
      approvalId: "approval-stale",
      approvedBy: "user",
      sourceRequestId: "request-1",
      attachmentSha256: "a".repeat(64),
      projectSessionId: history.geometry.project_session_id,
      revisionId: history.geometry.revision_id,
      geometryId: history.geometry.geometry_id,
      baselineGeometryHash: "b".repeat(64),
      operationsSha256: geometryOperationBatchSha256(operations),
    });
    expect(stale.committed).toBe(false);
    expect(stale.diagnostics[0]?.code).toBe("geometry_ai_approval_stale");
  });

  it("binds AI approval to the exact operation batch and rejects replay after undo", () => {
    const history = createGeometryHistory(cloneBuildingGeometry(metricFixture as BuildingGeometry));
    const operations = [
      { operation: "add_vertex" as const, parameters: { level_id: "level-1", vertex: { id: "ai-v5", x: 5_000, y: 3_000 } } },
      { operation: "add_wall" as const, parameters: { level_id: "level-1", wall: { id: "ai-w5", start_vertex_id: "v3", end_vertex_id: "ai-v5", kind: "interior", thickness: 120, source_icon_id: null } } },
    ];
    const approval = {
      schemaVersion: GEOMETRY_AI_OPERATION_APPROVAL_SCHEMA_VERSION,
      approvalId: "approval-exact-1",
      approvedBy: "user" as const,
      sourceRequestId: "request-1",
      attachmentSha256: "a".repeat(64),
      projectSessionId: history.geometry.project_session_id,
      revisionId: history.geometry.revision_id,
      geometryId: history.geometry.geometry_id,
      baselineGeometryHash: history.geometry_hash,
      operationsSha256: geometryOperationBatchSha256(operations),
    };
    const tampered = commitApprovedAiGeometryOperationBatch(history, [
      ...operations.slice(0, 1),
      { ...operations[1], parameters: { ...operations[1].parameters, unexpected: true } },
    ], approval);
    expect(tampered.committed).toBe(false);
    expect(tampered.diagnostics[0]?.code).toBe("geometry_ai_approval_scope_mismatch");

    const committed = commitApprovedAiGeometryOperationBatch(history, operations, approval);
    expect(committed.committed).toBe(true);
    expect(committed.state.entries.map((entry) => entry.command.actor)).toEqual(["ai_suggestion", "ai_suggestion"]);
    const undone = undoGeometryOperationBatch(committed.state, operations.length);
    const replay = commitApprovedAiGeometryOperationBatch(undone, operations, approval);
    expect(replay.committed).toBe(false);
    expect(replay.diagnostics[0]?.code).toBe("geometry_command_duplicate");
  });
});
