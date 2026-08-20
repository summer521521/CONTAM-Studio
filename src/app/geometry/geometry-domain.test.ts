import { describe, expect, it } from "vitest";
import metricFixture from "../../../contracts/geometry/examples/studio-metric-valid.json";
import { previewGeometryCommand } from "./geometry-commands";
import {
  BUILDING_GEOMETRY_SCHEMA_VERSION,
  GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION,
  cloneBuildingGeometry,
  geometrySha256,
  sha256Text,
  type BuildingGeometry,
  type GeometryEditCommand,
} from "./geometry-model";
import {
  commitGeometryCommand,
  createGeometryHistory,
  redoGeometryCommand,
  resetGeometryHistory,
  undoGeometryCommand,
} from "./geometry-history";
import { validateBuildingGeometry } from "./geometry-validation";
import { planLevelConstructionCopy } from "./geometry-level-construction";
import { planZoneMerge, planZonePartition } from "./geometry-zone-topology";
import { createPlanUnderlay } from "./geometry-plan-underlay";

function geometry(): BuildingGeometry {
  return cloneBuildingGeometry(metricFixture as BuildingGeometry);
}

function dividedGeometry(): BuildingGeometry {
  const model = geometry();
  model.levels[0] = {
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
    zone_regions: [{ id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v3", "v4", "v5", "v6"] }],
    flow_path_anchors: [],
    underlays: [],
  };
  return model;
}

function command(
  base: BuildingGeometry,
  operation: GeometryEditCommand["operation"],
  parameters: Record<string, unknown>,
  overrides: Partial<GeometryEditCommand> = {},
): GeometryEditCommand {
  return {
    schema_version: GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION,
    command_id: `command-${base.geometry_revision + 1}`,
    sequence: base.geometry_revision + 1,
    project_session_id: base.project_session_id,
    geometry_id: base.geometry_id,
    baseline_revision_id: base.revision_id,
    baseline_geometry_hash: geometrySha256(base),
    actor: "user",
    operation,
    parameters,
    ...overrides,
  };
}

describe("building geometry domain", () => {
  it("uses deterministic canonical SHA-256 and the versioned fixture", () => {
    const model = geometry();
    expect(model.schema_version).toBe(BUILDING_GEOMETRY_SCHEMA_VERSION);
    expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(geometrySha256(model)).toBe("c90985eb642b32f8dffa224cc207169c0c3b30b2528a7dcfe702f79108638b5b");
    expect(geometrySha256(model)).toBe(geometrySha256(cloneBuildingGeometry(model)));
  });

  it("accepts the shared Studio metric fixture and binds validation identity", () => {
    const result = validateBuildingGeometry(geometry(), {
      expectedProjectSessionId: "project-1",
      expectedRevisionId: "revision-1",
    });
    expect(result.status).toBe("valid");
    expect(result.geometry_id).toBe("geometry-1");
    expect(result.diagnostics).toEqual([]);
  });

  it("routes plan underlay add, update, and remove through the same geometry history", () => {
    const model = geometry();
    const underlay = createPlanUnderlay({
      schema_version: "geometry_underlay_resource.v1",
      resource_id: "00000000-0000-5000-8000-000000000011",
      attachment_id: "00000000-0000-5000-8000-000000000011",
      display_name: "level-1.png",
      sha256: "d".repeat(64),
      mime_type: "image/png",
      size_bytes: 4096,
      page_count: null,
      pixel_width: 800,
      pixel_height: 600,
    }, 800, 600)!;
    const added = commitGeometryCommand(createGeometryHistory(model), command(model, "set_plan_underlay", {
      level_id: "level-1",
      underlay,
    }));
    expect(added.status).toBe("committed");
    if (added.status !== "committed") return;
    const unlocked = { ...underlay, locked: false, opacity_percent: 55 };
    const updated = commitGeometryCommand(added.state, command(added.state.geometry, "update_plan_underlay", {
      level_id: "level-1",
      underlay: unlocked,
    }));
    expect(updated.status).toBe("committed");
    if (updated.status !== "committed") return;
    const removed = commitGeometryCommand(updated.state, command(updated.state.geometry, "remove_plan_underlay", {
      level_id: "level-1",
      underlay_id: underlay.id,
    }));
    expect(removed.status).toBe("committed");
    if (removed.status === "committed") expect(removed.state.geometry.levels[0].underlays).toEqual([]);
  });

  it("rejects stale project, revision, and geometry hashes before mutation", () => {
    const model = geometry();
    const stale = previewGeometryCommand(model, command(model, "add_vertex", {
      level_id: "level-1",
      vertex: { id: "v5", x: 5000, y: 3000 },
    }, { project_session_id: "other-project" }));
    expect(stale.status).toBe("rejected");
    expect(stale.diagnostics[0].code).toBe("geometry_command_identity_stale");
    expect(model.levels[0].vertices).toHaveLength(4);

    const staleHash = previewGeometryCommand(model, command(model, "add_vertex", {
      level_id: "level-1",
      vertex: { id: "v5", x: 5000, y: 3000 },
    }, { baseline_geometry_hash: "0".repeat(64) }));
    expect(staleHash.status).toBe("rejected");
    expect(staleHash.diagnostics[0].code).toBe("geometry_command_hash_stale");
  });

  it("keeps the read-only SketchPad projection immutable", () => {
    const model = geometry();
    model.coordinate_space = { kind: "contam_sketchpad_grid", unit: "half_grid", units_per_grid_cell: 2, y_axis: "up" };
    model.provenance = { source_kind: "contam_sketchpad_projection", application_owned: false, source_schema_version: "spatial_projection.v1" };
    model.capabilities = { geometry_editing: "read_only", prj_round_trip: "read_only_projection" };
    const result = previewGeometryCommand(model, command(model, "add_vertex", {
      level_id: "level-1",
      vertex: { id: "v5", x: 10, y: 10 },
    }));
    expect(result.status).toBe("rejected");
    expect(result.diagnostics[0].code).toBe("geometry_command_read_only");
  });

  it("does not accept provenance and capability combinations from another geometry kind", () => {
    const model = geometry();
    model.provenance = { source_kind: "contam_sketchpad_projection", application_owned: false, source_schema_version: "spatial_projection.v1" };
    const result = validateBuildingGeometry(model);
    expect(result.status).toBe("invalid");
    expect(result.diagnostics.map((item) => item.code)).toContain("geometry_projection_capability_invalid");
  });

  it("previews a valid operation without changing the baseline", () => {
    const model = geometry();
    const result = previewGeometryCommand(model, command(model, "add_vertex", {
      level_id: "level-1",
      vertex: { id: "v5", x: 5000, y: 3000 },
    }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.after.levels[0].vertices).toHaveLength(5);
      expect(result.after.geometry_revision).toBe(1);
      expect(result.before).toBe(model);
    }
    expect(model.levels[0].vertices).toHaveLength(4);
    expect(model.geometry_revision).toBe(0);
  });

  it("rejects an edit that would make connected walls diagonal", () => {
    const model = geometry();
    const result = previewGeometryCommand(model, command(model, "move_vertex", {
      level_id: "level-1", vertex_id: "v3", x: 3500, y: 2500,
    }));
    expect(result.status).toBe("rejected");
    expect(result.diagnostics.map((item) => item.code)).toContain("geometry_wall_not_orthogonal");
    expect(model.levels[0].vertices.find((item) => item.id === "v3")).toEqual({ id: "v3", x: 4000, y: 3000 });
  });

  it("moves a bounded vertex set atomically before validating the final topology", () => {
    const model = geometry();
    const result = previewGeometryCommand(model, command(model, "move_vertices", {
      level_id: "level-1",
      vertices: [
        { vertex_id: "v2", x: 5000, y: 0 },
        { vertex_id: "v3", x: 5000, y: 4000 },
        { vertex_id: "v4", x: 0, y: 4000 },
      ],
    }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.after.levels[0].vertices).toEqual([
        { id: "v1", x: 0, y: 0 },
        { id: "v2", x: 5000, y: 0 },
        { id: "v3", x: 5000, y: 4000 },
        { id: "v4", x: 0, y: 4000 },
      ]);
    }
    expect(model.levels[0].vertices.find((item) => item.id === "v3")).toEqual({ id: "v3", x: 4000, y: 3000 });
  });

  it("rejects duplicate and oversized atomic vertex move payloads", () => {
    const model = geometry();
    const duplicate = previewGeometryCommand(model, command(model, "move_vertices", {
      level_id: "level-1",
      vertices: [
        { vertex_id: "v2", x: 5000, y: 0 },
        { vertex_id: "v2", x: 5000, y: 250 },
      ],
    }));
    expect(duplicate.status).toBe("rejected");
    expect(duplicate.diagnostics[0]?.code).toBe("geometry_command_vertex_batch_invalid");

    const oversized = previewGeometryCommand(model, command(model, "move_vertices", {
      level_id: "level-1",
      vertices: Array.from({ length: 129 }, (_, index) => ({ vertex_id: `v${index}`, x: index, y: 0 })),
    }));
    expect(oversized.status).toBe("rejected");
    expect(oversized.diagnostics[0]?.code).toBe("geometry_command_vertex_batch_invalid");
  });

  it("allows shared Zone boundaries but rejects overlapping interiors", () => {
    const adjacent = geometry();
    adjacent.levels[0].vertices.push({ id: "v5", x: 8000, y: 0 }, { id: "v6", x: 8000, y: 3000 });
    adjacent.levels[0].zone_regions.push({
      id: "region-2", semantic_zone_id: "zone-2", outer_vertex_ids: ["v2", "v5", "v6", "v3"],
    });
    expect(validateBuildingGeometry(adjacent).status).toBe("valid");

    const overlapping = geometry();
    overlapping.levels[0].vertices.push(
      { id: "v5", x: 1000, y: 1000 }, { id: "v6", x: 2000, y: 1000 },
      { id: "v7", x: 2000, y: 2000 }, { id: "v8", x: 1000, y: 2000 },
    );
    overlapping.levels[0].zone_regions.push({
      id: "region-2", semantic_zone_id: "zone-2", outer_vertex_ids: ["v5", "v6", "v7", "v8"],
    });
    expect(validateBuildingGeometry(overlapping).diagnostics.map((item) => item.code)).toContain("geometry_zone_overlap");
  });

  it("blocks deleting walls with dependent openings", () => {
    const model = geometry();
    const result = previewGeometryCommand(model, command(model, "delete_wall", {
      level_id: "level-1", wall_id: "w1",
    }));
    expect(result.status).toBe("rejected");
    expect(result.diagnostics[0].code).toBe("geometry_command_wall_has_openings");
  });

  it("blocks trimming a wall that is still an explicit Zone boundary", () => {
    const model = geometry();
    const result = previewGeometryCommand(model, command(model, "delete_wall", {
      level_id: "level-1", wall_id: "w3",
    }));
    expect(result.status).toBe("rejected");
    expect(result.diagnostics[0].code).toBe("geometry_command_wall_bounds_zone");
  });

  it("updates only an existing opening offset and width as one validated command", () => {
    const model = geometry();
    const original = model.levels[0].openings[0];
    const result = previewGeometryCommand(model, command(model, "update_opening", {
      level_id: "level-1", opening_id: original.id, offset: 1_250, width: 1_000,
    }));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.after.levels[0].openings[0]).toEqual({
      ...original,
      offset: 1_250,
      width: 1_000,
    });
    expect(model.levels[0].openings[0]).toBe(original);
    expect(model.levels[0].openings[0].offset).not.toBe(1_250);
  });

  it("rejects invalid, missing, overlapping, and out-of-bounds opening updates without mutation", () => {
    const model = geometry();
    const baseline = {
      ...model.levels[0].openings[0],
      adjacent_zone_ids: [...model.levels[0].openings[0].adjacent_zone_ids],
    };
    const unknownField = previewGeometryCommand(model, command(model, "update_opening", {
      level_id: "level-1", opening_id: baseline.id, offset: 250, width: 900, wall_id: "w2",
    }));
    expect(unknownField.status).toBe("rejected");
    expect(unknownField.diagnostics[0]?.code).toBe("geometry_command_parameters_invalid");

    const missing = previewGeometryCommand(model, command(model, "update_opening", {
      level_id: "level-1", opening_id: "missing", offset: 250, width: 900,
    }));
    expect(missing.status).toBe("rejected");
    expect(missing.diagnostics[0]?.code).toBe("geometry_command_opening_missing");

    const outOfBounds = previewGeometryCommand(model, command(model, "update_opening", {
      level_id: "level-1", opening_id: baseline.id, offset: 3_500, width: 900,
    }));
    expect(outOfBounds.status).toBe("rejected");
    expect(outOfBounds.diagnostics.map((item) => item.code)).toContain("geometry_opening_out_of_bounds");

    model.levels[0].openings.push({ ...baseline, id: "opening-2", offset: 2_000, width: 800 });
    const overlap = previewGeometryCommand(model, command(model, "update_opening", {
      level_id: "level-1", opening_id: baseline.id, offset: 1_500, width: 900,
    }));
    expect(overlap.status).toBe("rejected");
    expect(overlap.diagnostics.map((item) => item.code)).toContain("geometry_opening_overlap");
    expect(model.levels[0].openings[0]).toEqual(baseline);
  });

  it("supports a validated wall split where no opening depends on the wall", () => {
    const model = geometry();
    const result = previewGeometryCommand(model, command(model, "split_wall", {
      level_id: "level-1",
      wall_id: "w3",
      vertex: { id: "v5", x: 2000, y: 3000 },
      first_wall_id: "w3-a",
      second_wall_id: "w3-b",
    }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.after.levels[0].walls.map((wall) => wall.id)).toEqual(["w1", "w2", "w3-a", "w3-b", "w4"]);
      expect(result.after.levels[0].zone_regions[0].outer_vertex_ids).toEqual(["v1", "v2", "v3", "v5", "v4"]);
    }
  });

  it("splits around dependent openings while preserving opening and FlowPath identity", () => {
    const model = geometry();
    model.levels[0].openings.push({
      id: "window-2", wall_id: "w1", kind: "window", offset: 3_000, width: 600,
      swing: "none", adjacent_zone_ids: ["zone-1"],
    });
    model.levels[0].flow_path_anchors.push({
      id: "flow-anchor-1", opening_id: "window-2", semantic_flow_path_id: "flow-1",
      from_zone_id: "zone-1", to_zone_id: null, exterior_side: "to",
    });
    const result = previewGeometryCommand(model, command(model, "split_wall", {
      level_id: "level-1", wall_id: "w1",
      vertex: { id: "v5", x: 2_500, y: 0 },
      first_wall_id: "w1", second_wall_id: "w1-b",
    }));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.after.levels[0].openings).toEqual([
      { ...model.levels[0].openings[0], wall_id: "w1" },
      { ...model.levels[0].openings[1], wall_id: "w1-b", offset: 500 },
    ]);
    expect(result.after.levels[0].flow_path_anchors[0]).toEqual(model.levels[0].flow_path_anchors[0]);
    expect(result.after.levels[0].zone_regions[0].outer_vertex_ids).toEqual(["v1", "v5", "v2", "v3", "v4"]);
  });

  it("rejects a split point through an opening and leaves the original topology unchanged", () => {
    const model = geometry();
    const result = previewGeometryCommand(model, command(model, "split_wall", {
      level_id: "level-1", wall_id: "w1",
      vertex: { id: "v5", x: 1_500, y: 0 },
      first_wall_id: "w1", second_wall_id: "w1-b",
    }));
    expect(result.status).toBe("rejected");
    expect(result.diagnostics[0].code).toBe("geometry_command_split_crosses_opening");
    expect(model.levels[0].walls.map((wall) => wall.id)).toEqual(["w1", "w2", "w3", "w4"]);
    expect(model.levels[0].zone_regions[0].outer_vertex_ids).toEqual(["v1", "v2", "v3", "v4"]);
  });

  it("partitions one Zone atomically and reconciles unanchored opening adjacency", () => {
    const model = dividedGeometry();
    model.levels[0].openings.push({
      id: "window-right", wall_id: "w3", kind: "window", offset: 1_000, width: 800,
      swing: "none", adjacent_zone_ids: ["zone-1"],
    });
    const plan = planZonePartition(model.levels[0], "region-1", "zone-2", { x: 3_000, y: 1_500 }, () => "region-2");
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    const result = previewGeometryCommand(model, command(model, plan.operation.operation, plan.operation.parameters));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.after.levels[0].zone_regions).toEqual([plan.sourceRegion, plan.newRegion]);
    expect(result.after.levels[0].openings[0].adjacent_zone_ids).toEqual(["zone-2"]);
    expect(model.levels[0].zone_regions).toHaveLength(1);
  });

  it("rejects a partition that would silently change an anchored FlowPath adjacency", () => {
    const model = dividedGeometry();
    model.levels[0].openings.push({
      id: "window-right", wall_id: "w3", kind: "window", offset: 1_000, width: 800,
      swing: "none", adjacent_zone_ids: ["zone-1"],
    });
    const plan = planZonePartition(model.levels[0], "region-1", "zone-2", { x: 3_000, y: 1_500 }, () => "region-2");
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    model.levels[0].flow_path_anchors.push({
      id: "anchor-right", opening_id: "window-right", semantic_flow_path_id: "flow-1",
      from_zone_id: "zone-1", to_zone_id: null, exterior_side: "to",
    });
    const result = previewGeometryCommand(model, command(model, plan.operation.operation, plan.operation.parameters));
    expect(result.status).toBe("rejected");
    expect(result.diagnostics[0]?.code).toBe("geometry_command_zone_flow_path_conflict");
    expect(model.levels[0].zone_regions).toHaveLength(1);
  });

  it("merges adjacent Zone geometry, releases one semantic binding, and removes only the divider", () => {
    const model = dividedGeometry();
    model.levels[0].zone_regions = [
      { id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v5", "v6"] },
      { id: "region-2", semantic_zone_id: "zone-2", outer_vertex_ids: ["v2", "v3", "v4", "v5"] },
    ];
    model.levels[0].openings.push({
      id: "window-right", wall_id: "w3", kind: "window", offset: 1_000, width: 800,
      swing: "none", adjacent_zone_ids: ["zone-2"],
    });
    const plan = planZoneMerge(model.levels[0], "region-1", "region-2");
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    const result = previewGeometryCommand(model, command(model, plan.operation.operation, plan.operation.parameters));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.after.levels[0].zone_regions).toEqual([{ ...model.levels[0].zone_regions[0], outer_vertex_ids: plan.mergedOuterVertexIds }]);
    expect(result.after.levels[0].walls.some((wall) => wall.id === "divider")).toBe(false);
    expect(result.after.levels[0].openings[0].adjacent_zone_ids).toEqual(["zone-1"]);
  });

  it("rejects merge payload tampering and a divider with an opening", () => {
    const model = dividedGeometry();
    model.levels[0].zone_regions = [
      { id: "region-1", semantic_zone_id: "zone-1", outer_vertex_ids: ["v1", "v2", "v5", "v6"] },
      { id: "region-2", semantic_zone_id: "zone-2", outer_vertex_ids: ["v2", "v3", "v4", "v5"] },
    ];
    const plan = planZoneMerge(model.levels[0], "region-1", "region-2");
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    const tampered = previewGeometryCommand(model, command(model, plan.operation.operation, {
      ...plan.operation.parameters, removed_wall_ids: ["w1"],
    }));
    expect(tampered.status).toBe("rejected");
    expect(tampered.diagnostics[0]?.code).toBe("geometry_command_zone_merge_invalid");

    model.levels[0].openings.push({
      id: "divider-door", wall_id: "divider", kind: "door", offset: 500, width: 900,
      swing: "right", adjacent_zone_ids: ["zone-1", "zone-2"],
    });
    const blocked = previewGeometryCommand(model, command(model, plan.operation.operation, plan.operation.parameters));
    expect(blocked.status).toBe("rejected");
    expect(blocked.diagnostics[0]?.code).toBe("geometry_command_zone_merge_boundary_has_opening");
  });

  it("copies only aligned construction into an existing empty Level", () => {
    const model = geometry();
    model.levels.push({
      id: "level-2", level_number: 2, name: "Level 2", elevation: 3_000, height: 3_000,
      vertices: [], walls: [], openings: [], zone_regions: [], flow_path_anchors: [], underlays: [],
    });
    const plan = planLevelConstructionCopy(
      model,
      "level-1",
      "level-2",
      (kind, sourceId) => `level-2-${kind}-${sourceId}`,
    );
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    const result = previewGeometryCommand(model, command(model, plan.operation.operation, plan.operation.parameters));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const target = result.after.levels[1];
    expect(target.vertices.map(({ x, y }) => ({ x, y }))).toEqual(model.levels[0].vertices.map(({ x, y }) => ({ x, y })));
    expect(target.walls.map((wall) => wall.source_icon_id)).toEqual([null, null, null, null]);
    expect(target.openings).toEqual([{
      ...model.levels[0].openings[0],
      id: "level-2-opening-door-1",
      wall_id: "level-2-wall-w1",
      adjacent_zone_ids: [],
    }]);
    expect(target.zone_regions).toEqual([]);
    expect(target.flow_path_anchors).toEqual([]);
    expect(model.levels[1].vertices).toEqual([]);
  });

  it("rejects incomplete mappings, ID conflicts, and non-empty copy targets", () => {
    const model = geometry();
    model.levels.push({
      id: "level-2", level_number: 2, name: "Level 2", elevation: 3_000, height: 3_000,
      vertices: [], walls: [], openings: [], zone_regions: [], flow_path_anchors: [], underlays: [],
    });
    const plan = planLevelConstructionCopy(model, "level-1", "level-2", (kind, sourceId) => `copy-${kind}-${sourceId}`);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    const missing = previewGeometryCommand(model, command(model, plan.operation.operation, {
      ...plan.operation.parameters,
      vertex_id_map: plan.operation.parameters.vertex_id_map.slice(1),
    }));
    expect(missing.status).toBe("rejected");
    expect(missing.diagnostics[0]?.code).toBe("geometry_command_level_copy_mapping_invalid");

    const conflict = previewGeometryCommand(model, command(model, plan.operation.operation, {
      ...plan.operation.parameters,
      wall_id_map: plan.operation.parameters.wall_id_map.map((mapping, index) => (
        index === 0 ? { ...mapping, target_id: "v1" } : mapping
      )),
    }));
    expect(conflict.status).toBe("rejected");
    expect(conflict.diagnostics[0]?.code).toBe("geometry_command_level_copy_id_conflict");

    model.levels[1].vertices.push({ id: "occupied", x: 0, y: 0 });
    const occupied = previewGeometryCommand(model, command(model, plan.operation.operation, plan.operation.parameters));
    expect(occupied.status).toBe("rejected");
    expect(occupied.diagnostics[0]?.code).toBe("geometry_command_level_copy_target_not_empty");
  });

  it("commits, undoes, redoes, and rejects duplicate command replay", () => {
    const model = geometry();
    const initial = createGeometryHistory(model);
    const edit = command(model, "add_vertex", { level_id: "level-1", vertex: { id: "v5", x: 5000, y: 3000 } });
    const committed = commitGeometryCommand(initial, edit);
    expect(committed.status).toBe("committed");
    expect(committed.state.cursor).toBe(1);
    expect(undoGeometryCommand(committed.state).geometry_hash).toBe(initial.geometry_hash);
    expect(redoGeometryCommand(undoGeometryCommand(committed.state)).geometry_hash).toBe(committed.state.geometry_hash);
    expect(commitGeometryCommand(committed.state, edit).status).toBe("duplicate");
  });

  it("requires a hash-bound user approval before committing AI or system commands", () => {
    const model = geometry();
    const history = createGeometryHistory(model);
    const suggestion = command(model, "add_vertex", {
      level_id: "level-1", vertex: { id: "v5", x: 5000, y: 3000 },
    }, { command_id: "ai-command-1", actor: "ai_suggestion" });
    expect(commitGeometryCommand(history, suggestion).status).toBe("approval_required");
    expect(commitGeometryCommand(history, suggestion, {
      command_id: suggestion.command_id,
      baseline_geometry_hash: "0".repeat(64),
      approved_by: "user",
    }).status).toBe("approval_required");
    expect(commitGeometryCommand(history, suggestion, {
      command_id: suggestion.command_id,
      baseline_geometry_hash: history.geometry_hash,
      approved_by: "user",
    }).status).toBe("committed");
  });

  it("drops redo entries after branching while retaining replay protection", () => {
    const model = geometry();
    const first = commitGeometryCommand(createGeometryHistory(model), command(model, "add_vertex", {
      level_id: "level-1", vertex: { id: "v5", x: 5000, y: 3000 },
    })).state;
    const undone = undoGeometryCommand(first);
    const alternate = command(undone.geometry, "add_vertex", {
      level_id: "level-1", vertex: { id: "v6", x: 6000, y: 3000 },
    }, { command_id: "alternate-1" });
    const branched = commitGeometryCommand(undone, alternate);
    expect(branched.state.entries).toHaveLength(1);
    expect(branched.state.geometry.levels[0].vertices.some((vertex) => vertex.id === "v6")).toBe(true);
    expect(branched.state.geometry.levels[0].vertices.some((vertex) => vertex.id === "v5")).toBe(false);
  });

  it("resets history only when project, Revision, or geometry identity changes", () => {
    const model = geometry();
    const history = createGeometryHistory(model);
    expect(resetGeometryHistory(history, cloneBuildingGeometry(model))).toBe(history);
    const next = cloneBuildingGeometry(model);
    next.revision_id = "revision-2";
    expect(resetGeometryHistory(history, next)).toEqual(expect.objectContaining({ cursor: 0, entries: [] }));
    const changedSource = cloneBuildingGeometry(model);
    changedSource.source_sha256 = "c".repeat(64);
    expect(resetGeometryHistory(history, changedSource)).not.toBe(history);
  });
});
