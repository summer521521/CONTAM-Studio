import { describe, expect, it } from "vitest";
import type { GeometryLevel } from "./geometry-model";
import {
  createWallTopologyContext,
  planTopologyAwareWallDraw,
  planTopologyAwareWallDrawWithContext,
  planWallSplit,
} from "./geometry-wall-topology";

function rectangle(): GeometryLevel {
  return {
    id: "level-1", level_number: 1, name: "Level 1", elevation: 0, height: 3_000,
    vertices: [
      { id: "v1", x: 0, y: 0 }, { id: "v2", x: 4_000, y: 0 },
      { id: "v3", x: 4_000, y: 3_000 }, { id: "v4", x: 0, y: 3_000 },
    ],
    walls: [
      { id: "w1", start_vertex_id: "v1", end_vertex_id: "v2", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w2", start_vertex_id: "v2", end_vertex_id: "v3", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w3", start_vertex_id: "v3", end_vertex_id: "v4", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w4", start_vertex_id: "v4", end_vertex_id: "v1", kind: "exterior", thickness: 200, source_icon_id: null },
    ],
    openings: [{ id: "door-1", wall_id: "w1", kind: "door", offset: 1_000, width: 900, swing: "right", adjacent_zone_ids: ["zone-1"] }],
    zone_regions: [{ id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v3", "v4"] }],
    flow_path_anchors: [],
    underlays: [],
  };
}

function ids() {
  let sequence = 0;
  return (prefix: "vertex" | "wall") => `${prefix}-new-${++sequence}`;
}

describe("topology-aware wall drawing", () => {
  it("materializes two crossings and three new wall segments deterministically", () => {
    const plan = planTopologyAwareWallDraw(rectangle(), { x: -1_000, y: 1_500 }, { x: 5_000, y: 1_500 }, ids());
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.intersections).toEqual([{ x: 0, y: 1_500 }, { x: 4_000, y: 1_500 }]);
    expect(plan.segments.map((segment) => [segment.start, segment.end])).toEqual([
      [{ x: -1_000, y: 1_500 }, { x: 0, y: 1_500 }],
      [{ x: 0, y: 1_500 }, { x: 4_000, y: 1_500 }],
      [{ x: 4_000, y: 1_500 }, { x: 5_000, y: 1_500 }],
    ]);
    expect(plan.operations.filter((operation) => operation.operation === "split_wall")).toHaveLength(2);
    expect(plan.operations.filter((operation) => operation.operation === "add_wall")).toHaveLength(3);
  });

  it("creates a T junction when the new endpoint lands inside a wall", () => {
    const plan = planTopologyAwareWallDraw(rectangle(), { x: 2_000, y: 1_500 }, { x: 4_000, y: 1_500 }, ids());
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.intersections).toEqual([{ x: 4_000, y: 1_500 }]);
    expect(plan.operations.filter((operation) => operation.operation === "split_wall")).toHaveLength(1);
    expect(plan.segments).toHaveLength(1);
  });

  it("extends an existing wall endpoint without overlapping the original segment", () => {
    const plan = planTopologyAwareWallDraw(rectangle(), { x: 4_000, y: 0 }, { x: 6_000, y: 0 }, ids());
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.intersections).toEqual([{ x: 4_000, y: 0 }]);
    expect(plan.operations.map((operation) => operation.operation)).toEqual(["add_vertex", "add_wall"]);
  });

  it("rejects collinear overlap and a split through an opening", () => {
    expect(planTopologyAwareWallDraw(rectangle(), { x: 500, y: 0 }, { x: 2_500, y: 0 }, ids())).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_wall_draw_collinear_overlap",
    });
    expect(planTopologyAwareWallDraw(rectangle(), { x: 1_500, y: -1_000 }, { x: 1_500, y: 1_000 }, ids())).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_wall_draw_split_crosses_opening",
    });
  });

  it("plans an explicit split while reporting opening and Zone effects", () => {
    const level = rectangle();
    level.openings.push({ id: "window-2", wall_id: "w1", kind: "window", offset: 3_000, width: 600, swing: "none", adjacent_zone_ids: ["zone-1"] });
    const plan = planWallSplit(level, "w1", { x: 2_500, y: 400 }, ids());
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.point).toEqual({ x: 2_500, y: 0 });
    expect(plan.movedOpeningCount).toBe(1);
    expect(plan.affectedZoneCount).toBe(1);
    expect(plan.operation.parameters.first_wall_id).toBe("w1");
  });

  it("rejects explicit split endpoints, opening spans, and stale contexts", () => {
    const level = rectangle();
    expect(planWallSplit(level, "w1", { x: 0, y: 0 }, ids())).toMatchObject({ status: "unchanged" });
    expect(planWallSplit(level, "w1", { x: 1_500, y: 0 }, ids())).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_wall_split_crosses_opening",
    });
    const context = createWallTopologyContext(level);
    const replacement = { ...level, walls: level.walls.map((wall) => ({ ...wall })) };
    expect(planTopologyAwareWallDrawWithContext(context, replacement, { x: -1_000, y: 1_500 }, { x: 5_000, y: 1_500 }, ids())).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_wall_topology_context_stale",
    });
  });
});
