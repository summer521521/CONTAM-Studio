import { describe, expect, it } from "vitest";
import type { GeometryLevel } from "./geometry-model";
import {
  createZoneTopologyContext,
  planZoneMerge,
  planZonePartition,
  planZoneRegionFromPoint,
  planZoneRegionFromPointWithContext,
} from "./geometry-zone-topology";

function dividedLevel(): GeometryLevel {
  return {
    id: "level-1", level_number: 1, name: "Level 1", elevation: 0, height: 3_000,
    vertices: [
      { id: "v1", x: 0, y: 0 }, { id: "v2", x: 2_000, y: 0 }, { id: "v3", x: 4_000, y: 0 },
      { id: "v4", x: 4_000, y: 3_000 }, { id: "v5", x: 2_000, y: 3_000 }, { id: "v6", x: 0, y: 3_000 },
    ],
    walls: [
      { id: "w1", start_vertex_id: "v1", end_vertex_id: "v2", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w2", start_vertex_id: "v2", end_vertex_id: "v3", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w3", start_vertex_id: "v3", end_vertex_id: "v4", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w4", start_vertex_id: "v4", end_vertex_id: "v5", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w5", start_vertex_id: "v5", end_vertex_id: "v6", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "w6", start_vertex_id: "v6", end_vertex_id: "v1", kind: "exterior", thickness: 200, source_icon_id: null },
      { id: "divider", start_vertex_id: "v2", end_vertex_id: "v5", kind: "interior", thickness: 120, source_icon_id: null },
    ],
    openings: [],
    zone_regions: [],
    flow_path_anchors: [],
    underlays: [],
  };
}

describe("Zone wall-face topology", () => {
  it("extracts deterministic bounded faces and creates a Zone from an interior click", () => {
    const level = dividedLevel();
    const context = createZoneTopologyContext(level);
    expect(context.faces.map((face) => face.vertexIds)).toEqual([
      ["v1", "v2", "v5", "v6"],
      ["v2", "v3", "v4", "v5"],
    ]);
    const plan = planZoneRegionFromPoint(level, "zone-2", { x: 3_000, y: 1_500 }, () => "region-2");
    expect(plan).toMatchObject({ status: "ready", region: { semantic_zone_id: "zone-2", outer_vertex_ids: ["v2", "v3", "v4", "v5"] } });
  });

  it("rejects boundary clicks, bound semantics, nested ambiguity, and stale contexts", () => {
    const level = dividedLevel();
    expect(planZoneRegionFromPoint(level, "zone-2", { x: 2_000, y: 1_500 }, () => "region-2")).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_zone_point_on_boundary",
    });
    level.zone_regions.push({ id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v5", "v6"] });
    expect(planZoneRegionFromPoint(level, "zone-1", { x: 3_000, y: 1_500 }, () => "region-2")).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_zone_semantic_already_bound",
    });
    const context = createZoneTopologyContext(level);
    const replacement = { ...level, walls: level.walls.map((wall) => ({ ...wall })) };
    expect(planZoneRegionFromPointWithContext(context, replacement, "zone-2", { x: 3_000, y: 1_500 }, () => "region-2")).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_zone_topology_context_stale",
    });
  });

  it("partitions one existing Zone into two explicitly bound semantic rooms", () => {
    const level = dividedLevel();
    level.zone_regions.push({ id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v3", "v4", "v5", "v6"] });
    const plan = planZonePartition(level, "region-1", "zone-2", { x: 3_000, y: 1_500 }, () => "region-2");
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.sourceRegion.outer_vertex_ids).toEqual(["v1", "v2", "v5", "v6"]);
    expect(plan.newRegion).toMatchObject({ semantic_zone_id: "zone-2", outer_vertex_ids: ["v2", "v3", "v4", "v5"] });
    expect(plan.dividerWallIds).toEqual(["divider"]);
  });

  it("rejects non-binary partitions and already-bound target semantics", () => {
    const level = dividedLevel();
    level.zone_regions.push({ id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v3", "v4", "v5", "v6"] });
    expect(planZonePartition(level, "region-1", "zone-1", { x: 3_000, y: 1_500 }, () => "region-2")).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_zone_partition_target_bound",
    });
    level.walls = level.walls.filter((wall) => wall.id !== "divider");
    expect(planZonePartition(level, "region-1", "zone-2", { x: 3_000, y: 1_500 }, () => "region-2")).toMatchObject({ status: "unchanged" });
  });

  it("blocks a partition preview before an anchored FlowPath adjacency can change", () => {
    const level = dividedLevel();
    level.zone_regions.push({ id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v3", "v4", "v5", "v6"] });
    level.openings.push({
      id: "window-right", wall_id: "w3", kind: "window", offset: 500, width: 1_000,
      swing: "none", adjacent_zone_ids: ["zone-1"],
    });
    level.flow_path_anchors.push({
      id: "flow-right", opening_id: "window-right", semantic_flow_path_id: "semantic-flow-1",
      from_zone_id: "zone-1", to_zone_id: null, exterior_side: "to",
    });
    expect(planZonePartition(level, "region-1", "zone-2", { x: 3_000, y: 1_500 }, () => "region-2")).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_zone_partition_flow_path_conflict",
    });
  });

  it("merges adjacent rooms while explicitly identifying the removed divider", () => {
    const level = dividedLevel();
    level.zone_regions = [
      { id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v5", "v6"] },
      { id: "region-2", semantic_zone_id: "zone-2", outer_vertex_ids: ["v2", "v3", "v4", "v5"] },
    ];
    const plan = planZoneMerge(level, "region-1", "region-2");
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.removedWallIds).toEqual(["divider"]);
    expect(plan.mergedOuterVertexIds).toEqual(["v1", "v2", "v3", "v4", "v5", "v6"]);
  });

  it("blocks merge when the divider has an opening or the removed Zone owns a FlowPath endpoint", () => {
    const level = dividedLevel();
    level.zone_regions = [
      { id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v5", "v6"] },
      { id: "region-2", semantic_zone_id: "zone-2", outer_vertex_ids: ["v2", "v3", "v4", "v5"] },
    ];
    level.openings.push({ id: "door-1", wall_id: "divider", kind: "door", offset: 500, width: 900, swing: "right", adjacent_zone_ids: ["zone-1", "zone-2"] });
    expect(planZoneMerge(level, "region-1", "region-2")).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_zone_merge_boundary_has_opening",
    });
    level.openings = [];
    level.flow_path_anchors.push({ id: "flow-1", opening_id: "outside-opening", semantic_flow_path_id: "semantic-flow-1", from_zone_id: "zone-2", to_zone_id: null, exterior_side: "to" });
    expect(planZoneMerge(level, "region-1", "region-2")).toMatchObject({
      status: "blocked", diagnosticCode: "geometry_zone_merge_flow_path_conflict",
    });
  });
});
