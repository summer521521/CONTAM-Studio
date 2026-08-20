import { describe, expect, it } from "vitest";
import type { GeometryLevel } from "../../../app/geometry/geometry-model";
import {
  fitGeometryViewport,
  metricScaleBar,
  orthogonalEndpoint,
  polygonAreaM2,
  snapMetricPoint,
} from "./GeometryCanvasKonva";
import {
  geometryCommandIssueKey,
  topologyIssueKey,
  verticalOpeningIssueKey,
  zoneTopologyIssueKey,
} from "./geometry-interaction-issues";

const level: GeometryLevel = {
  id: "level-1",
  level_number: 1,
  name: "Level 1",
  elevation: 0,
  height: 3_000,
  vertices: [
    { id: "v1", x: 0, y: 0 },
    { id: "v2", x: 12_000, y: 8_000 },
  ],
  walls: [],
  openings: [],
  zone_regions: [],
  flow_path_anchors: [],
  underlays: [],
};

describe("geometry canvas math", () => {
  it("snaps to the metric construction grid", () => {
    expect(snapMetricPoint({ x: 379, y: -124 })).toEqual({ x: 500, y: 0 });
  });

  it("chooses the dominant axis for orthogonal walls", () => {
    expect(orthogonalEndpoint({ x: 0, y: 0 }, { x: 4_000, y: 1_000 })).toEqual({ x: 4_000, y: 0 });
    expect(orthogonalEndpoint({ x: 0, y: 0 }, { x: 500, y: 3_000 })).toEqual({ x: 0, y: 3_000 });
  });

  it("fits metric geometry into the available canvas", () => {
    const viewport = fitGeometryViewport(level, 1_200, 800);
    expect(viewport.scale).toBeGreaterThan(0);
    expect(viewport.scale).toBeLessThanOrEqual(0.32);
    expect(Number.isFinite(viewport.x)).toBe(true);
    expect(Number.isFinite(viewport.y)).toBe(true);
  });

  it("fits an empty active Level to its selected alignment underlay", () => {
    const empty = { ...level, id: "level-2", level_number: 2, vertices: [] };
    expect(fitGeometryViewport(empty, 1_200, 800, level)).toEqual(fitGeometryViewport(level, 1_200, 800));
  });

  it("reports real polygon area from millimetre coordinates", () => {
    const vertices = new Map([
      ["a", { id: "a", x: 0, y: 0 }],
      ["b", { id: "b", x: 4_000, y: 0 }],
      ["c", { id: "c", x: 4_000, y: 3_000 }],
      ["d", { id: "d", x: 0, y: 3_000 }],
    ]);
    expect(polygonAreaM2({ id: "z", semantic_zone_id: "zone-1", outer_vertex_ids: ["a", "b", "c", "d"] }, vertices)).toBe(12);
  });

  it("keeps the metric scale bar near a readable screen width", () => {
    const scale = metricScaleBar(0.06);
    expect(scale).toEqual({ millimeters: 2_000, pixels: 120, label: "2 m" });
  });

  it("maps topology and protected-trim diagnostics to user-facing messages", () => {
    expect(topologyIssueKey("geometry_wall_draw_split_crosses_opening")).toBe("geometry.editor.issue.splitCrossesOpening");
    expect(geometryCommandIssueKey("geometry_command_wall_bounds_zone")).toBe("geometry.editor.issue.trimRejected");
    expect(geometryCommandIssueKey("geometry_command_wall_has_openings")).toBe("geometry.editor.issue.trimRejected");
    expect(geometryCommandIssueKey("geometry_command_level_copy_target_not_empty")).toBe("geometry.editor.issue.levelCopyTargetNotEmpty");
  });

  it("maps Zone topology preconditions and dependency conflicts precisely", () => {
    expect(zoneTopologyIssueKey("geometry_zone_target_missing")).toBe("geometry.editor.issue.zoneTargetMissing");
    expect(zoneTopologyIssueKey("geometry_zone_partition_source_missing")).toBe("geometry.editor.issue.zonePartitionSourceMissing");
    expect(zoneTopologyIssueKey("geometry_zone_partition_flow_path_conflict")).toBe("geometry.editor.issue.zoneFlowPathConflict");
    expect(zoneTopologyIssueKey("geometry_zone_merge_boundary_has_opening")).toBe("geometry.editor.issue.zoneMergeOpeningConflict");
  });

  it("maps vertical construction and semantic binding failures precisely", () => {
    expect(verticalOpeningIssueKey("geometry_vertical_opening_levels_not_adjacent")).toBe("geometry.editor.issue.verticalLevelsNotAdjacent");
    expect(verticalOpeningIssueKey("geometry_vertical_opening_zone_coverage_invalid")).toBe("geometry.editor.issue.verticalZoneCoverage");
    expect(verticalOpeningIssueKey("geometry_vertical_opening_overlap")).toBe("geometry.editor.issue.verticalOverlap");
    expect(verticalOpeningIssueKey("geometry_vertical_flow_path_zone_mismatch")).toBe("geometry.editor.issue.verticalFlowZoneMismatch");
  });
});
