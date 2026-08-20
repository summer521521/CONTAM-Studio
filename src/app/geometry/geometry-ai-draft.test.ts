import { describe, expect, it } from "vitest";
import metricFixture from "../../../contracts/geometry/examples/studio-metric-valid.json";
import {
  GEOMETRY_AI_DRAFT_SCHEMA_VERSION,
  geometryAiCanvasPreview,
  geometryAiOperationIndices,
  geometryAiOperationDependencies,
  isSafeGeometryAiDraft,
  selectGeometryAiOperations,
  toggleGeometryAiOperationSelection,
  type GeometryAiDraft,
} from "./geometry-ai-draft";
import type { BuildingGeometry } from "./geometry-model";

function draft(): GeometryAiDraft {
  return {
    schema_version: GEOMETRY_AI_DRAFT_SCHEMA_VERSION,
    project_session_id: "project-session-1",
    revision_id: "revision-1",
    baseline_geometry_hash: "a".repeat(64),
    attachment_sha256: "b".repeat(64),
    summary: "A bounded room extension.",
    observations: ["Two visible orthogonal walls."],
    measurement_basis: "explicit_dimensions",
    confidence_percent: 88,
    assumptions: [],
    warnings: [],
    operations: [
      { operation: "add_vertex", parameters: { level_id: "level-1", vertex: { id: "ai-v5", x: 5_000, y: 3_000 } } },
      { operation: "add_wall", parameters: { level_id: "level-1", wall: { id: "ai-w5", start_vertex_id: "v3", end_vertex_id: "ai-v5", kind: "interior", thickness: 120, source_icon_id: null } } },
      { operation: "create_zone_region", parameters: { level_id: "level-1", zone_region: { id: "ai-region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v3", "v4"] } } },
      { operation: "place_opening", parameters: { level_id: "level-1", opening: { id: "ai-window-1", wall_id: "ai-w5", kind: "window", offset: 100, width: 600, swing: "none", adjacent_zone_ids: ["zone-1"] } } },
    ],
  };
}

describe("geometry AI draft contract", () => {
  it("accepts the closed bounded operation contract and derives a canvas overlay", () => {
    const value = draft();
    expect(isSafeGeometryAiDraft(value)).toBe(true);
    const preview = geometryAiCanvasPreview(metricFixture as BuildingGeometry, value);
    expect(preview.operationCount).toBe(4);
    expect(preview.walls).toEqual([{ id: "ai-w5", start: { x: 4_000, y: 3_000 }, end: { x: 5_000, y: 3_000 } }]);
    expect(preview.zones).toEqual([{ id: "ai-region-1", points: [{ x: 0, y: 0 }, { x: 4_000, y: 0 }, { x: 4_000, y: 3_000 }, { x: 0, y: 3_000 }] }]);
    expect(preview.openings).toEqual([{ id: "ai-window-1", start: { x: 4_100, y: 3_000 }, end: { x: 4_700, y: 3_000 } }]);
  });

  it("rejects unknown fields, unsupported operations, unsafe IDs, and oversized output", () => {
    expect(isSafeGeometryAiDraft({ ...draft(), secret_path: "C:/private" })).toBe(false);
    expect(isSafeGeometryAiDraft({ ...draft(), operations: [{ operation: "delete_wall", parameters: { level_id: "level-1", wall_id: "w1" } }] })).toBe(false);
    expect(isSafeGeometryAiDraft({ ...draft(), project_session_id: "../../escape" })).toBe(false);
    expect(isSafeGeometryAiDraft({ ...draft(), operations: Array.from({ length: 257 }, () => draft().operations[0]) })).toBe(false);
  });

  it("selects an ordered immutable subset and ignores duplicate or out-of-range indices", () => {
    const value = draft();
    expect(geometryAiOperationIndices(value)).toEqual([0, 1, 2, 3]);
    const selected = selectGeometryAiOperations(value, [3, 1, 3, -1, 99]);
    expect(selected.map((operation) => operation.operation)).toEqual(["add_wall", "place_opening"]);
    expect(value.operations).toHaveLength(4);
  });

  it("marks selected operations for the canvas without removing unselected candidates", () => {
    const value = draft();
    const preview = geometryAiCanvasPreview(metricFixture as BuildingGeometry, value, [0, 1, 2, 3], [0, 1]);
    expect(preview.operationCount).toBe(2);
    expect(preview.vertices?.find((vertex) => vertex.id === "ai-v5")?.selected).toBe(true);
    expect(preview.walls[0]?.operationIndex).toBe(1);
    expect(preview.zones[0]?.selected).toBe(false);
    expect(preview.openings[0]?.selected).toBe(false);
  });

  it("derives transitive prerequisites and removes dependents when a prerequisite is deselected", () => {
    const value = draft();
    expect(geometryAiOperationDependencies(value, metricFixture as BuildingGeometry, 1)).toEqual([0]);
    expect(geometryAiOperationDependencies(value, metricFixture as BuildingGeometry, 3)).toEqual([0, 1]);

    const selected = toggleGeometryAiOperationSelection(value, metricFixture as BuildingGeometry, [], 3);
    expect(selected.selectedIndices).toEqual([0, 1, 3]);
    expect(selected.autoIncludedIndices).toEqual([0, 1]);

    const removed = toggleGeometryAiOperationSelection(value, metricFixture as BuildingGeometry, selected.selectedIndices, 0);
    expect(removed.selectedIndices).toEqual([]);
    expect(removed.removedDependentIndices).toEqual([1, 3]);
  });
});
