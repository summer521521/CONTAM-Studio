import { describe, expect, it } from "vitest";
import type { GeometryLevel } from "../../../app/geometry/geometry-model";
import { geometryNavigatorItems } from "./GeometryObjectNavigator";

const level: GeometryLevel = {
  id: "level-1",
  level_number: 1,
  name: "Level 1",
  elevation: 0,
  height: 3_000,
  vertices: [{ id: "vertex-1", x: 0, y: 0 }],
  walls: [{ id: "wall-1", start_vertex_id: "vertex-1", end_vertex_id: "vertex-1", kind: "interior", thickness: 120, source_icon_id: null }],
  openings: [{ id: "opening-1", wall_id: "wall-1", kind: "door", offset: 0, width: 900, swing: "left", adjacent_zone_ids: ["zone-1"] }],
  zone_regions: [{ id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["vertex-1"] }],
  flow_path_anchors: [{ id: "anchor-1", opening_id: "opening-1", semantic_flow_path_id: "flow-1", from_zone_id: "zone-1", to_zone_id: null, exterior_side: "to" }],
  underlays: [],
};

describe("geometry object navigator", () => {
  it("projects every geometry object into a stable DOM selection", () => {
    const items = geometryNavigatorItems(
      level,
      new Map([["zone-1", "Office"]]),
      new Map([["flow-1", "Door leakage"], ["flow-vertical", "Stair transfer"]]),
      [{
        id: "vertical-opening-1", lower_level_id: "level-1", upper_level_id: "level-2",
        x: 1_000, y: 1_000, width: 1_000, depth: 1_000, kind: "stair",
      }],
      [{
        id: "vertical-anchor-1", vertical_opening_id: "vertical-opening-1",
        semantic_flow_path_id: "flow-vertical", lower_zone_id: "zone-1", upper_zone_id: "zone-2",
      }],
      new Map([["level-1", "Ground"], ["level-2", "Upper"]]),
    );
    expect(items.map((item) => item.selection.kind)).toEqual([
      "zone", "wall", "opening", "flow_path", "vertical_opening", "vertical_flow_path", "vertex",
    ]);
    expect(items.map((item) => item.selection.id)).toEqual([
      "region-1", "wall-1", "opening-1", "anchor-1", "vertical-opening-1", "vertical-anchor-1", "vertex-1",
    ]);
    expect(items[0]).toMatchObject({ label: "Office", semanticZoneId: "zone-1" });
    expect(items[3]).toMatchObject({ label: "Door leakage", semanticFlowPathId: "flow-1" });
    expect(items[4]).toMatchObject({ detail: "stair · Ground ↕ Upper" });
    expect(items[5]).toMatchObject({ label: "Stair transfer", semanticFlowPathId: "flow-vertical" });
  });
});
