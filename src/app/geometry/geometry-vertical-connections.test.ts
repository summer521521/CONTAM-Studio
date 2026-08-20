import { describe, expect, it } from "vitest";
import metricFixture from "../../../contracts/geometry/examples/studio-metric-valid.json";
import { previewGeometryCommand } from "./geometry-commands";
import { commitGeometryCommand, createGeometryHistory, undoGeometryCommand } from "./geometry-history";
import {
  GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION,
  cloneBuildingGeometry,
  geometrySha256,
  type BuildingGeometry,
  type GeometryEditCommand,
  type GeometryLevel,
} from "./geometry-model";
import { validateBuildingGeometry } from "./geometry-validation";
import {
  adjacentLevelPair,
  matchingVerticalFlowPathOptions,
  planVerticalFlowPathLink,
  planVerticalOpeningPlacement,
  zonesContainingVerticalOpening,
} from "./geometry-vertical-connections";

function upperLevel(levelNumber = 2): GeometryLevel {
  return {
    id: `level-${levelNumber}`,
    level_number: levelNumber,
    name: `Level ${levelNumber}`,
    elevation: (levelNumber - 1) * 3_000,
    height: 3_000,
    vertices: [
      { id: `l${levelNumber}-v1`, x: 0, y: 0 },
      { id: `l${levelNumber}-v2`, x: 4_000, y: 0 },
      { id: `l${levelNumber}-v3`, x: 4_000, y: 3_000 },
      { id: `l${levelNumber}-v4`, x: 0, y: 3_000 },
    ],
    walls: [
      { id: `l${levelNumber}-w1`, start_vertex_id: `l${levelNumber}-v1`, end_vertex_id: `l${levelNumber}-v2`, kind: "exterior", thickness: 200, source_icon_id: null },
      { id: `l${levelNumber}-w2`, start_vertex_id: `l${levelNumber}-v2`, end_vertex_id: `l${levelNumber}-v3`, kind: "exterior", thickness: 200, source_icon_id: null },
      { id: `l${levelNumber}-w3`, start_vertex_id: `l${levelNumber}-v3`, end_vertex_id: `l${levelNumber}-v4`, kind: "exterior", thickness: 200, source_icon_id: null },
      { id: `l${levelNumber}-w4`, start_vertex_id: `l${levelNumber}-v4`, end_vertex_id: `l${levelNumber}-v1`, kind: "exterior", thickness: 200, source_icon_id: null },
    ],
    openings: [],
    zone_regions: [{
      id: `l${levelNumber}-region`,
      semantic_zone_id: `zone-${levelNumber}`,
      outer_vertex_ids: [`l${levelNumber}-v1`, `l${levelNumber}-v2`, `l${levelNumber}-v3`, `l${levelNumber}-v4`],
    }],
    flow_path_anchors: [],
    underlays: [],
  };
}

function twoLevelGeometry(): BuildingGeometry {
  const geometry = cloneBuildingGeometry(metricFixture as BuildingGeometry);
  geometry.levels.push(upperLevel());
  return geometry;
}

function command(
  geometry: BuildingGeometry,
  operation: GeometryEditCommand["operation"],
  parameters: Record<string, unknown>,
): GeometryEditCommand {
  return {
    schema_version: GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION,
    command_id: `vertical-command-${geometry.geometry_revision + 1}`,
    sequence: geometry.geometry_revision + 1,
    project_session_id: geometry.project_session_id,
    geometry_id: geometry.geometry_id,
    baseline_revision_id: geometry.revision_id,
    baseline_geometry_hash: geometrySha256(geometry),
    actor: "user",
    operation,
    parameters,
  };
}

describe("vertical openings and cross-level airflow", () => {
  it("resolves only adjacent Levels in deterministic elevation order", () => {
    const geometry = twoLevelGeometry();
    geometry.levels.push(upperLevel(3));
    expect(adjacentLevelPair(geometry, "level-2", "level-1")).toEqual({
      lower: geometry.levels[0], upper: geometry.levels[1],
    });
    expect(adjacentLevelPair(geometry, "level-1", "level-3")).toBeNull();
    expect(adjacentLevelPair(geometry, "level-1", "level-1")).toBeNull();
  });

  it("places a bounded opening only when the complete rectangle belongs to one Zone on each Level", () => {
    const geometry = twoLevelGeometry();
    const plan = planVerticalOpeningPlacement(
      geometry, "level-1", "level-2", { x: 2_000, y: 1_500 }, "stair", () => "vertical-opening-1",
    );
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.opening).toEqual({
      id: "vertical-opening-1",
      lower_level_id: "level-1",
      upper_level_id: "level-2",
      x: 1_500,
      y: 1_000,
      width: 1_000,
      depth: 1_000,
      kind: "stair",
    });
    expect([plan.lowerZoneId, plan.upperZoneId]).toEqual(["zone-1", "zone-2"]);
    expect(zonesContainingVerticalOpening(geometry.levels[0], plan.opening)).toEqual(["zone-1"]);
  });

  it("rejects boundary crossings, overlap, non-adjacent Levels, and global ID collisions", () => {
    const geometry = twoLevelGeometry();
    expect(planVerticalOpeningPlacement(
      geometry, "level-1", "level-2", { x: 250, y: 1_500 }, "shaft", () => "vertical-opening-1",
    )).toEqual({ status: "blocked", diagnosticCode: "geometry_vertical_opening_zone_coverage_invalid" });

    const ready = planVerticalOpeningPlacement(
      geometry, "level-1", "level-2", { x: 2_000, y: 1_500 }, "shaft", () => "vertical-opening-1",
    );
    if (ready.status !== "ready") throw new Error("expected ready opening");
    geometry.vertical_openings.push(ready.opening);
    expect(planVerticalOpeningPlacement(
      geometry, "level-1", "level-2", { x: 2_250, y: 1_500 }, "shaft", () => "vertical-opening-2",
    )).toEqual({ status: "blocked", diagnosticCode: "geometry_vertical_opening_overlap" });
    expect(planVerticalOpeningPlacement(
      geometry, "level-1", "level-2", { x: 3_000, y: 1_500 }, "shaft", () => "door-1",
    )).toEqual({ status: "blocked", diagnosticCode: "geometry_vertical_opening_id_invalid" });
    geometry.levels.push(upperLevel(3));
    expect(planVerticalOpeningPlacement(
      geometry, "level-1", "level-3", { x: 3_000, y: 1_500 }, "shaft", () => "vertical-opening-3",
    )).toEqual({ status: "blocked", diagnosticCode: "geometry_vertical_opening_levels_not_adjacent" });
  });

  it("binds one existing semantic FlowPath to the verified lower and upper Zone pair", () => {
    const geometry = twoLevelGeometry();
    const opening = planVerticalOpeningPlacement(
      geometry, "level-2", "level-1", { x: 2_000, y: 1_500 }, "floor_opening", () => "vertical-opening-1",
    );
    if (opening.status !== "ready") throw new Error("expected ready opening");
    geometry.vertical_openings.push(opening.opening);
    const link = planVerticalFlowPathLink(
      geometry, "level-2", opening.opening.id, "flow-between-levels", "zone-1", "zone-2", () => "vertical-anchor-1",
    );
    expect(link.status).toBe("ready");
    if (link.status !== "ready") return;
    geometry.vertical_flow_path_anchors.push(link.anchor);
    expect(validateBuildingGeometry(geometry).status).toBe("valid");
    expect(planVerticalFlowPathLink(
      geometry, "level-1", opening.opening.id, "flow-other", "zone-1", "zone-2", () => "vertical-anchor-2",
    )).toEqual({ status: "unchanged", diagnosticCode: "geometry_vertical_flow_path_already_bound" });
  });

  it("offers only stable unbound semantic FlowPaths with the exact two Zone endpoints", () => {
    const zones = [
      { object_id: "zone-1", contam_number: 1 },
      { object_id: "zone-2", contam_number: 2 },
      { object_id: "zone-3", contam_number: 3 },
    ];
    const flows = [
      { object_id: "flow-match", label: "Stair transfer", from_endpoint: { category: "zone", contam_number: 2 }, to_endpoint: { category: "zone", contam_number: 1 } },
      { object_id: "flow-other", from_endpoint: { category: "zone", contam_number: 1 }, to_endpoint: { category: "zone", contam_number: 3 } },
      { object_id: "flow-outdoor", from_endpoint: { category: "outdoor", contam_number: null }, to_endpoint: { category: "zone", contam_number: 1 } },
      { label: "missing identity", from_endpoint: { category: "zone", contam_number: 1 }, to_endpoint: { category: "zone", contam_number: 2 } },
    ];
    expect(matchingVerticalFlowPathOptions(zones, flows, "zone-1", "zone-2", new Set())).toEqual([
      { id: "flow-match", label: "Stair transfer" },
    ]);
    expect(matchingVerticalFlowPathOptions(zones, flows, "zone-1", "zone-2", new Set(["flow-match"]))).toEqual([]);
    expect(matchingVerticalFlowPathOptions(
      [...zones, { object_id: "zone-duplicate", contam_number: 2 }],
      flows,
      "zone-1",
      "zone-2",
      new Set(),
    )).toEqual([]);
  });

  it("rejects mismatched Zone identity, reused semantic paths, and anchor ID collisions", () => {
    const geometry = twoLevelGeometry();
    const opening = planVerticalOpeningPlacement(
      geometry, "level-1", "level-2", { x: 2_000, y: 1_500 }, "floor_opening", () => "vertical-opening-1",
    );
    if (opening.status !== "ready") throw new Error("expected ready opening");
    geometry.vertical_openings.push(opening.opening);
    expect(planVerticalFlowPathLink(
      geometry, "level-1", opening.opening.id, "flow-between-levels", "wrong-zone", "zone-2", () => "vertical-anchor-1",
    )).toEqual({ status: "blocked", diagnosticCode: "geometry_vertical_flow_path_zone_mismatch" });
    geometry.levels[0].flow_path_anchors.push({
      id: "wall-anchor-1",
      opening_id: "door-1",
      semantic_flow_path_id: "flow-between-levels",
      from_zone_id: "zone-1",
      to_zone_id: null,
      exterior_side: "to",
    });
    expect(planVerticalFlowPathLink(
      geometry, "level-1", opening.opening.id, "flow-between-levels", "zone-1", "zone-2", () => "vertical-anchor-1",
    )).toEqual({ status: "blocked", diagnosticCode: "geometry_vertical_flow_path_binding_invalid" });
    expect(planVerticalFlowPathLink(
      geometry, "level-1", opening.opening.id, "flow-new", "zone-1", "zone-2", () => "door-1",
    )).toEqual({ status: "blocked", diagnosticCode: "geometry_vertical_flow_path_binding_invalid" });
  });

  it("commits placement and binding as separate undoable commands and protects linked openings", () => {
    const geometry = twoLevelGeometry();
    const opening = planVerticalOpeningPlacement(
      geometry, "level-1", "level-2", { x: 2_000, y: 1_500 }, "stair", () => "vertical-opening-1",
    );
    if (opening.status !== "ready") throw new Error("expected ready opening");
    const placed = commitGeometryCommand(
      createGeometryHistory(geometry),
      command(geometry, opening.operation.operation, opening.operation.parameters),
    );
    expect(placed.status).toBe("committed");
    expect(undoGeometryCommand(placed.state).geometry.vertical_openings).toEqual([]);

    const link = planVerticalFlowPathLink(
      placed.state.geometry,
      "level-2",
      opening.opening.id,
      "flow-between-levels",
      "zone-1",
      "zone-2",
      () => "vertical-anchor-1",
    );
    if (link.status !== "ready") throw new Error("expected ready link");
    const linked = commitGeometryCommand(
      placed.state,
      command(placed.state.geometry, link.operation.operation, link.operation.parameters),
    );
    expect(linked.status).toBe("committed");
    expect(linked.state.geometry.vertical_flow_path_anchors).toEqual([link.anchor]);
    expect(undoGeometryCommand(linked.state).geometry.vertical_flow_path_anchors).toEqual([]);

    const removeLinked = previewGeometryCommand(
      linked.state.geometry,
      command(linked.state.geometry, "remove_vertical_opening", {
        level_id: "level-1",
        vertical_opening_id: opening.opening.id,
      }),
    );
    expect(removeLinked.status).toBe("rejected");
    expect(removeLinked.diagnostics[0]?.code).toBe("geometry_command_vertical_opening_has_flow_path");
  });

  it("rejects tampered cross-level payloads at the command validation boundary", () => {
    const geometry = twoLevelGeometry();
    const opening = planVerticalOpeningPlacement(
      geometry, "level-1", "level-2", { x: 2_000, y: 1_500 }, "shaft", () => "vertical-opening-1",
    );
    if (opening.status !== "ready") throw new Error("expected ready opening");
    const tampered = previewGeometryCommand(geometry, command(geometry, "place_vertical_opening", {
      ...opening.operation.parameters,
      vertical_opening: { ...opening.opening, upper_level_id: "missing-level" },
    }));
    expect(tampered.status).toBe("rejected");
    expect(tampered.diagnostics.some((item) => item.code === "geometry_vertical_opening_levels_not_adjacent")).toBe(true);

    geometry.vertical_openings.push(opening.opening);
    const wrongZones = previewGeometryCommand(geometry, command(geometry, "link_vertical_flow_path", {
      level_id: "level-1",
      vertical_flow_path_anchor: {
        id: "vertical-anchor-1",
        vertical_opening_id: opening.opening.id,
        semantic_flow_path_id: "flow-between-levels",
        lower_zone_id: "wrong-zone",
        upper_zone_id: "zone-2",
      },
    }));
    expect(wrongZones.status).toBe("rejected");
    expect(wrongZones.diagnostics.some((item) => item.code === "geometry_vertical_flow_path_zone_mismatch")).toBe(true);
  });
});
