import { describe, expect, it } from "vitest";
import metricFixture from "../../../contracts/geometry/examples/studio-metric-valid.json";
import { cloneBuildingGeometry, type BuildingGeometry, type GeometryLevel } from "./geometry-model";
import {
  levelIsEmptyConstructionTarget,
  planLevelConstructionCopy,
  semanticObjectBelongsToGeometryLevel,
} from "./geometry-level-construction";

function model(): BuildingGeometry {
  const geometry = cloneBuildingGeometry(metricFixture as BuildingGeometry);
  geometry.levels.push({
    id: "level-2", level_number: 2, name: "Level 2", elevation: 3_000, height: 3_000,
    vertices: [], walls: [], openings: [], zone_regions: [], flow_path_anchors: [], underlays: [],
  });
  return geometry;
}

function deterministicId(kind: "vertex" | "wall" | "opening", sourceId: string): string {
  return `level-2-${kind}-${sourceId}`;
}

describe("multi-level construction copy planner", () => {
  it("creates complete deterministic ID maps for construction only", () => {
    const geometry = model();
    const plan = planLevelConstructionCopy(geometry, "level-1", "level-2", deterministicId);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.copiedCounts).toEqual({ vertices: 4, walls: 4, openings: 1 });
    expect(plan.operation.parameters.vertex_id_map).toEqual([
      { source_id: "v1", target_id: "level-2-vertex-v1" },
      { source_id: "v2", target_id: "level-2-vertex-v2" },
      { source_id: "v3", target_id: "level-2-vertex-v3" },
      { source_id: "v4", target_id: "level-2-vertex-v4" },
    ]);
    expect("zone_region_id_map" in plan.operation.parameters).toBe(false);
    expect("flow_path_anchor_id_map" in plan.operation.parameters).toBe(false);
  });

  it("rejects the same level, missing levels, non-empty targets, and empty sources", () => {
    const geometry = model();
    expect(planLevelConstructionCopy(geometry, "level-1", "level-1", deterministicId)).toMatchObject({ status: "unchanged" });
    expect(planLevelConstructionCopy(geometry, "missing", "level-2", deterministicId)).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_level_copy_level_missing",
    });
    geometry.levels[1].vertices.push({ id: "occupied", x: 0, y: 0 });
    expect(planLevelConstructionCopy(geometry, "level-1", "level-2", deterministicId)).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_level_copy_target_not_empty",
    });
    const emptySource: GeometryLevel = {
      id: "level-3", level_number: 3, name: "Level 3", elevation: 6_000, height: 3_000,
      vertices: [], walls: [], openings: [], zone_regions: [], flow_path_anchors: [], underlays: [],
    };
    geometry.levels.push(emptySource);
    geometry.levels[1].vertices = [];
    expect(planLevelConstructionCopy(geometry, "level-3", "level-2", deterministicId)).toMatchObject({ status: "unchanged" });
  });

  it("rejects target ID collisions across every object kind", () => {
    const geometry = model();
    expect(planLevelConstructionCopy(geometry, "level-1", "level-2", () => "same-id")).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_level_copy_id_invalid",
    });
    expect(planLevelConstructionCopy(geometry, "level-1", "level-2", () => "v1")).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_level_copy_id_invalid",
    });
  });

  it("shares strict empty-target and semantic Level membership rules with the UI", () => {
    const geometry = model();
    expect(levelIsEmptyConstructionTarget(geometry.levels[1])).toBe(true);
    geometry.vertical_openings.push({
      id: "vertical-opening-1", lower_level_id: "level-1", upper_level_id: "level-2",
      x: 1_000, y: 1_000, width: 1_000, depth: 1_000, kind: "floor_opening",
    });
    expect(levelIsEmptyConstructionTarget(geometry.levels[1], geometry)).toBe(false);
    geometry.vertical_openings = [];
    geometry.levels[1].flow_path_anchors.push({
      id: "flow-occupied",
      semantic_flow_path_id: "semantic-flow",
      opening_id: "missing-opening",
      from_zone_id: "zone-a",
      to_zone_id: "zone-b",
      exterior_side: "none",
    });
    expect(levelIsEmptyConstructionTarget(geometry.levels[1])).toBe(false);

    expect(semanticObjectBelongsToGeometryLevel(undefined, 1, 1)).toBe(true);
    expect(semanticObjectBelongsToGeometryLevel(2, 2, 3)).toBe(true);
    expect(semanticObjectBelongsToGeometryLevel(1, 2, 3)).toBe(false);
    expect(semanticObjectBelongsToGeometryLevel("2", 2, 3)).toBe(false);
  });
});
