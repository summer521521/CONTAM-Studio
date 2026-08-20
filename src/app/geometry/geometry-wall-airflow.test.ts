import { describe, expect, it } from "vitest";
import fixture from "../../../contracts/geometry/examples/studio-metric-valid.json";
import { cloneBuildingGeometry, type BuildingGeometry, type GeometryLevel } from "./geometry-model";
import { validateBuildingGeometry } from "./geometry-validation";
import {
  auditWallFlowPathAnchor,
  matchingWallFlowPathOptions,
  planWallFlowPathLink,
  wallAirflowBoundary,
  type WallFlowPathOption,
} from "./geometry-wall-airflow";

const zones = [
  { object_id: "zone-1", contam_number: 1, name: "Office" },
  { object_id: "zone-2", contam_number: 2, name: "Corridor" },
  { object_id: "zone-3", contam_number: 3, name: "Lab" },
];

const flows = [
  { object_id: "flow-outdoor-to-zone", label: "Outdoor supply", from_endpoint: { category: "outdoor", contam_number: null }, to_endpoint: { category: "zone", contam_number: 1 } },
  { object_id: "flow-zone-to-outdoor", label: "Envelope leakage", from_endpoint: { category: "zone", contam_number: 1 }, to_endpoint: { category: "outdoor", contam_number: null } },
  { object_id: "flow-interior-reversed", label: "Door transfer", from_endpoint: { category: "zone", contam_number: 2 }, to_endpoint: { category: "zone", contam_number: 1 } },
  { object_id: "flow-wrong-zone", from_endpoint: { category: "zone", contam_number: 3 }, to_endpoint: { category: "zone", contam_number: 1 } },
  { object_id: "flow-outdoor-only", from_endpoint: { category: "outdoor", contam_number: null }, to_endpoint: { category: "outdoor", contam_number: null } },
];

function geometry(): BuildingGeometry {
  return cloneBuildingGeometry(fixture as BuildingGeometry);
}

function interiorLevel(): GeometryLevel {
  const level = geometry().levels[0];
  level.zone_regions.push({ id: "region-2", semantic_zone_id: "zone-2", outer_vertex_ids: ["v1", "v2", "v3"] });
  level.walls[0].kind = "interior";
  level.openings[0].adjacent_zone_ids = ["zone-1", "zone-2"];
  return level;
}

describe("wall airflow boundaries and outdoor context", () => {
  it("classifies only explicit two-Zone interior and one-Zone exterior boundaries", () => {
    const exterior = geometry().levels[0];
    expect(wallAirflowBoundary(exterior, "door-1")).toMatchObject({ status: "ready", kind: "exterior", zoneIds: ["zone-1"] });
    expect(wallAirflowBoundary(interiorLevel(), "door-1")).toMatchObject({ status: "ready", kind: "interior", zoneIds: ["zone-1", "zone-2"] });
    exterior.walls[0].kind = "unknown";
    expect(wallAirflowBoundary(exterior, "door-1")).toEqual({ status: "blocked", diagnosticCode: "geometry_wall_flow_path_boundary_unresolved" });
  });

  it("matches exterior FlowPaths in both semantic directions without guessing a screen side", () => {
    const options = matchingWallFlowPathOptions(geometry().levels[0], zones, flows, "door-1", new Set());
    expect(options).toEqual([
      { id: "flow-outdoor-to-zone", label: "Outdoor supply", boundaryKind: "exterior", fromZoneId: null, toZoneId: "zone-1", exteriorSide: "from" },
      { id: "flow-zone-to-outdoor", label: "Envelope leakage", boundaryKind: "exterior", fromZoneId: "zone-1", toZoneId: null, exteriorSide: "to" },
    ]);
  });

  it("matches an interior FlowPath only when both exact Zone identities are present", () => {
    expect(matchingWallFlowPathOptions(interiorLevel(), zones, flows, "door-1", new Set())).toEqual([
      { id: "flow-interior-reversed", label: "Door transfer", boundaryKind: "interior", fromZoneId: "zone-2", toZoneId: "zone-1", exteriorSide: "none" },
    ]);
  });

  it("fails closed for duplicate Zone numbers, duplicate FlowPath identities, and occupied paths", () => {
    const duplicatedZones = [...zones, { object_id: "zone-duplicate", contam_number: 1 }];
    expect(matchingWallFlowPathOptions(geometry().levels[0], duplicatedZones, flows, "door-1", new Set())).toEqual([]);
    expect(matchingWallFlowPathOptions(
      geometry().levels[0], zones, [...flows, { ...flows[0] }], "door-1", new Set(),
    )).toEqual([{ id: "flow-zone-to-outdoor", label: "Envelope leakage", boundaryKind: "exterior", fromZoneId: "zone-1", toZoneId: null, exteriorSide: "to" }]);
    expect(matchingWallFlowPathOptions(geometry().levels[0], zones, flows, "door-1", new Set(["flow-zone-to-outdoor"]))).toHaveLength(1);
  });

  it("plans one bounded anchor while preserving semantic from/to orientation", () => {
    const model = geometry();
    const option = matchingWallFlowPathOptions(model.levels[0], zones, flows, "door-1", new Set())[0];
    const plan = planWallFlowPathLink(model, "level-1", "door-1", option, () => "wall-flow-anchor-1");
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.anchor).toEqual({
      id: "wall-flow-anchor-1",
      opening_id: "door-1",
      semantic_flow_path_id: "flow-outdoor-to-zone",
      from_zone_id: null,
      to_zone_id: "zone-1",
      exterior_side: "from",
    });
  });

  it("rejects tampered candidates, reused identities, duplicate opening bindings, and read-only geometry", () => {
    const model = geometry();
    const option: WallFlowPathOption = matchingWallFlowPathOptions(model.levels[0], zones, flows, "door-1", new Set())[0];
    expect(planWallFlowPathLink(model, "level-1", "door-1", { ...option, exteriorSide: "to" }, () => "anchor-1"))
      .toEqual({ status: "blocked", diagnosticCode: "geometry_wall_flow_path_binding_invalid" });
    model.vertical_flow_path_anchors.push({ id: "vertical-anchor", vertical_opening_id: "vertical-opening", semantic_flow_path_id: option.id, lower_zone_id: "zone-1", upper_zone_id: "zone-2" });
    expect(planWallFlowPathLink(model, "level-1", "door-1", option, () => "anchor-1"))
      .toEqual({ status: "blocked", diagnosticCode: "geometry_wall_flow_path_binding_invalid" });
    model.vertical_flow_path_anchors = [];
    model.levels[0].flow_path_anchors.push({ id: "existing", opening_id: "door-1", semantic_flow_path_id: "another-flow", from_zone_id: "zone-1", to_zone_id: null, exterior_side: "to" });
    expect(planWallFlowPathLink(model, "level-1", "door-1", option, () => "anchor-1"))
      .toEqual({ status: "unchanged", diagnosticCode: "geometry_wall_flow_path_opening_already_bound" });
    model.levels[0].flow_path_anchors = [];
    model.capabilities.geometry_editing = "read_only";
    expect(planWallFlowPathLink(model, "level-1", "door-1", option, () => "anchor-1"))
      .toEqual({ status: "blocked", diagnosticCode: "geometry_wall_flow_path_read_only" });
  });

  it("audits verified, missing, direction-mismatched, and boundary-invalid saved anchors", () => {
    const level = geometry().levels[0];
    const option = matchingWallFlowPathOptions(level, zones, flows, "door-1", new Set())[0];
    const plan = planWallFlowPathLink(geometry(), "level-1", "door-1", option, () => "anchor-1");
    if (plan.status !== "ready") throw new Error("expected ready anchor");
    expect(auditWallFlowPathAnchor(level, plan.anchor, zones, flows)).toEqual({ status: "verified", boundaryKind: "exterior", diagnosticCode: null });
    expect(auditWallFlowPathAnchor(level, { ...plan.anchor, semantic_flow_path_id: "missing" }, zones, flows)).toEqual({ status: "unavailable", boundaryKind: "exterior", diagnosticCode: "geometry_wall_flow_path_semantic_missing" });
    expect(auditWallFlowPathAnchor(level, { ...plan.anchor, exterior_side: "to" }, zones, flows)).toEqual({ status: "invalid", boundaryKind: "exterior", diagnosticCode: "geometry_wall_flow_path_semantic_mismatch" });
    level.walls[0].kind = "unknown";
    expect(auditWallFlowPathAnchor(level, plan.anchor, zones, flows).status).toBe("invalid");
  });

  it("rejects locally inconsistent anchors in the shared TypeScript geometry contract", () => {
    const model = geometry();
    model.levels[0].flow_path_anchors.push({
      id: "anchor-1", opening_id: "door-1", semantic_flow_path_id: "flow-1",
      from_zone_id: "zone-1", to_zone_id: null, exterior_side: "to",
    });
    expect(validateBuildingGeometry(model).status).toBe("valid");

    const wrongWall = cloneBuildingGeometry(model);
    wrongWall.levels[0].walls[0].kind = "interior";
    expect(validateBuildingGeometry(wrongWall).diagnostics.map((item) => item.code)).toContain("geometry_flow_path_boundary_invalid");

    const wrongZone = cloneBuildingGeometry(model);
    wrongZone.levels[0].flow_path_anchors[0].from_zone_id = "zone-2";
    expect(validateBuildingGeometry(wrongZone).diagnostics.map((item) => item.code)).toContain("geometry_flow_path_zone_mismatch");

    const duplicateOpening = cloneBuildingGeometry(model);
    duplicateOpening.levels[0].flow_path_anchors.push({
      ...duplicateOpening.levels[0].flow_path_anchors[0], id: "anchor-2", semantic_flow_path_id: "flow-2",
    });
    expect(validateBuildingGeometry(duplicateOpening).diagnostics.map((item) => item.code)).toContain("geometry_flow_path_opening_duplicate");
  });
});
