import { describe, expect, it } from "vitest";
import type { GeometryLevel } from "./geometry-model";
import {
  createOpeningManipulationContext,
  geometryWallFrame,
  planOpeningUpdate,
  planOpeningUpdateWithContext,
  planOrthogonalWallTranslation,
  projectedOpeningOffset,
} from "./geometry-wall-opening-manipulation";

function level(): GeometryLevel {
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
    openings: [
      { id: "door-1", wall_id: "w1", kind: "door", offset: 500, width: 900, swing: "right", adjacent_zone_ids: ["zone-1"] },
      { id: "window-1", wall_id: "w1", kind: "window", offset: 2_500, width: 1_000, swing: "none", adjacent_zone_ids: ["zone-1"] },
    ],
    zone_regions: [{ id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v3", "v4"] }],
    flow_path_anchors: [{ id: "flow-anchor-1", opening_id: "door-1", semantic_flow_path_id: "flow-1", from_zone_id: "zone-1", to_zone_id: null, exterior_side: "to" }],
    underlays: [],
  };
}

describe("wall and opening direct manipulation", () => {
  it("translates a horizontal wall along its normal as one bounded vertex batch", () => {
    const plan = planOrthogonalWallTranslation(level(), "w3", 4_120);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.orientation).toBe("horizontal");
    expect(plan.axisPosition).toBe(4_000);
    expect(plan.movedVertices).toEqual([
      { id: "v3", x: 4_000, y: 4_000 },
      { id: "v4", x: 0, y: 4_000 },
    ]);
    expect(plan.operation.operation).toBe("move_vertices");
  });

  it("translates a vertical wall along its normal without changing its length", () => {
    const plan = planOrthogonalWallTranslation(level(), "w2", 5_000, 1);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.axisPosition).toBe(5_000);
    expect(plan.movedVertices).toEqual([
      { id: "v2", x: 5_000, y: 0 },
      { id: "v3", x: 5_000, y: 3_000 },
    ]);
  });

  it("slides and resizes an opening while preserving its identity and bindings", () => {
    const plan = planOpeningUpdate(level(), "door-1", { offset: 1_250, width: 1_000 });
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.opening).toEqual({
      id: "door-1", wall_id: "w1", kind: "door", offset: 1_250, width: 1_000,
      swing: "right", adjacent_zone_ids: ["zone-1"],
    });
    expect(plan.operation).toEqual({
      operation: "update_opening",
      parameters: { level_id: "level-1", opening_id: "door-1", offset: 1_250, width: 1_000 },
    });
  });

  it("rejects overlap and wall bounds before a command is produced", () => {
    expect(planOpeningUpdate(level(), "door-1", { offset: 2_000, width: 900 })).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_opening_edit_overlap",
    });
    expect(planOpeningUpdate(level(), "door-1", { offset: 3_500, width: 900 })).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_opening_edit_out_of_bounds",
    });
  });

  it("rejects stale cached opening indices", () => {
    const source = level();
    const context = createOpeningManipulationContext(source);
    const replacement = { ...source, openings: source.openings.map((opening) => ({ ...opening })) };
    expect(planOpeningUpdateWithContext(context, replacement, "door-1", { offset: 750, width: 900 })).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_opening_edit_context_stale",
    });
  });

  it("projects a pointer onto directed wall distance and clamps the opening inside the wall", () => {
    const frame = geometryWallFrame(level(), "w1");
    expect(frame).not.toBeNull();
    expect(projectedOpeningOffset(frame!, 900, { x: 2_000, y: 750 })).toBe(1_550);
    expect(projectedOpeningOffset(frame!, 900, { x: -2_000, y: 0 })).toBe(0);
    expect(projectedOpeningOffset(frame!, 900, { x: 8_000, y: 0 })).toBe(3_100);
  });
});
