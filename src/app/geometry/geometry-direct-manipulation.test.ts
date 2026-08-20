import { describe, expect, it } from "vitest";
import type { GeometryLevel } from "./geometry-model";
import {
  MAX_DIRECT_MANIPULATION_VERTICES,
  createOrthogonalManipulationContext,
  planOrthogonalVertexMove,
  planOrthogonalVertexMoveWithContext,
  selectedVertexIds,
} from "./geometry-direct-manipulation";

function rectangle(): GeometryLevel {
  return {
    id: "level-1",
    level_number: 1,
    name: "Level 1",
    elevation: 0,
    height: 3_000,
    vertices: [
      { id: "v1", x: 0, y: 0 },
      { id: "v2", x: 4_000, y: 0 },
      { id: "v3", x: 4_000, y: 3_000 },
      { id: "v4", x: 0, y: 3_000 },
    ],
    walls: [
      { id: "w1", start_vertex_id: "v1", end_vertex_id: "v2", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w2", start_vertex_id: "v2", end_vertex_id: "v3", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w3", start_vertex_id: "v3", end_vertex_id: "v4", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w4", start_vertex_id: "v4", end_vertex_id: "v1", kind: "exterior", thickness: 200, source_icon_id: null },
    ],
    openings: [],
    zone_regions: [{ id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v3", "v4"] }],
    flow_path_anchors: [],
    underlays: [],
  };
}

describe("orthogonal geometry direct manipulation", () => {
  it("propagates a shared corner across vertical X and horizontal Y components", () => {
    const plan = planOrthogonalVertexMove(rectangle(), "v3", { x: 5_120, y: 4_110 });
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.target).toEqual({ x: 5_000, y: 4_000 });
    expect(plan.movedVertices).toEqual([
      { id: "v2", x: 5_000, y: 0 },
      { id: "v3", x: 5_000, y: 4_000 },
      { id: "v4", x: 0, y: 4_000 },
    ]);
    expect(plan.operation.operation).toBe("move_vertices");
  });

  it("preserves deterministic handle ownership for vertices, walls, and zones", () => {
    const level = rectangle();
    expect(selectedVertexIds(level, { kind: "vertex", id: "v2" })).toEqual(["v2"]);
    expect(selectedVertexIds(level, { kind: "wall", id: "w2" })).toEqual(["v2", "v3"]);
    expect(selectedVertexIds(level, { kind: "zone", id: "region-1" })).toEqual(["v1", "v2", "v3", "v4"]);
    expect(selectedVertexIds(level, { kind: "opening", id: "missing" })).toEqual([]);
  });

  it("rejects duplicate target coordinates and invalid baseline walls", () => {
    expect(planOrthogonalVertexMove(rectangle(), "v3", { x: 0, y: 0 }).status).toBe("blocked");
    const invalid = rectangle();
    invalid.vertices[2] = { ...invalid.vertices[2], x: 3_500 };
    expect(planOrthogonalVertexMove(invalid, "v3", { x: 5_000, y: 4_000 })).toMatchObject({
      status: "blocked",
      diagnosticCode: "geometry_direct_move_baseline_invalid",
    });
  });

  it("allows the precision editor to request exact whole millimetres", () => {
    const plan = planOrthogonalVertexMove(rectangle(), "v3", { x: 4_123, y: 3_456 }, 1);
    expect(plan.status).toBe("ready");
    expect(plan.target).toEqual({ x: 4_123, y: 3_456 });
  });

  it("rejects a cached adjacency context after the level snapshot changes", () => {
    const level = rectangle();
    const context = createOrthogonalManipulationContext(level);
    const replacement = { ...level, vertices: level.vertices.map((vertex) => ({ ...vertex })) };
    expect(planOrthogonalVertexMoveWithContext(context, replacement, "v3", { x: 5_000, y: 4_000 })).toMatchObject({
      status: "blocked",
      diagnosticCode: "geometry_direct_move_context_stale",
    });
  });

  it("bounds graph propagation before producing an atomic command", () => {
    const level = rectangle();
    level.vertices = Array.from({ length: MAX_DIRECT_MANIPULATION_VERTICES + 1 }, (_, index) => ({
      id: `v-${index}`,
      x: 0,
      y: index * 250,
    }));
    level.walls = level.vertices.slice(1).map((vertex, index) => ({
      id: `w-${index}`,
      start_vertex_id: level.vertices[index].id,
      end_vertex_id: vertex.id,
      kind: "unknown" as const,
      thickness: 160,
      source_icon_id: null,
    }));
    level.zone_regions = [];
    expect(planOrthogonalVertexMove(level, "v-0", { x: 250, y: 0 })).toMatchObject({
      status: "blocked",
      diagnosticCode: "geometry_direct_move_scope_too_large",
    });
  });
});
