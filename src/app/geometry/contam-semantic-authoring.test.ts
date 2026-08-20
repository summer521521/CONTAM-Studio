import { describe, expect, it } from "vitest";
import type { BuildingGeometry, GeometryLevel, GeometryZoneRegion } from "./geometry-model";
import { contamZoneNameSuggestion, createDraftFlowPathForOpening, createDraftZoneForRegion, geometryEstimatedVolumeLitres, parseCubicMetresToLitres, parseMetresToMillimetres, parseMultiplierMillionths } from "./contam-semantic-authoring";
import { createEmptyContamSemanticDraft } from "./contam-semantic-draft";

const level: GeometryLevel = {
  id: "level-1",
  level_number: 1,
  name: "Ground",
  elevation: 0,
  height: 3_200,
  vertices: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 4_000, y: 0 },
    { id: "c", x: 4_000, y: 3_000 },
    { id: "d", x: 0, y: 3_000 },
  ],
  walls: [],
  openings: [],
  zone_regions: [],
  flow_path_anchors: [],
  underlays: [],
};
const region: GeometryZoneRegion = { id: "region-1", semantic_zone_id: "draft-zone-1", outer_vertex_ids: ["a", "b", "c", "d"] };
const draft = createEmptyContamSemanticDraft({
  projectSessionId: "session-1",
  identitySha256: "a".repeat(64),
  sourceSha256: "b".repeat(64),
  revisionId: "revision-1",
}, "draft-1");

describe("CONTAM semantic authoring", () => {
  it("derives a confirmed fixed-point volume from area and Level height", () => {
    expect(geometryEstimatedVolumeLitres(level, region)).toBe(38_400);
  });

  it("builds an application-owned Zone without mutating the previous draft", () => {
    const result = createDraftZoneForRegion(draft, level, region, {
      id: "draft-zone-1",
      displayName: "北侧教室",
      contamName: "North_Class",
      volume: { basis: "geometry_estimate_confirmed" },
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.zone.volume_litres).toBe(38_400);
    expect(result.draft.draft_revision).toBe(1);
    expect(draft.zones).toHaveLength(0);
  });

  it("rejects missing Level height rather than inventing a volume", () => {
    expect(createDraftZoneForRegion(draft, { ...level, height: null }, region, {
      id: "draft-zone-1",
      displayName: "Zone 1",
      contamName: "Zone_1",
      volume: { basis: "geometry_estimate_confirmed" },
    })).toEqual({ status: "blocked", diagnosticCode: "semantic_authoring_zone_volume_invalid" });
  });

  it("creates a strict CONTAM token suggestion while preserving the display name separately", () => {
    expect(contamZoneNameSuggestion("North classroom 01", 1)).toBe("North_classroom");
    expect(contamZoneNameSuggestion("北侧教室", 3)).toBe("Zone_3");
  });

  it("parses cubic metres into integer litres without floating-point drift", () => {
    expect(parseCubicMetresToLitres("38.4")).toBe(38_400);
    expect(parseCubicMetresToLitres("0.001")).toBe(1);
    expect(parseCubicMetresToLitres("1.0001")).toBeNull();
    expect(parseCubicMetresToLitres("0")).toBeNull();
  });

  it("creates a wall FlowPath and semantic endpoint facts as one plan", () => {
    const zoneRegion = { ...region, semantic_zone_id: "existing-zone-1" };
    const geometry: BuildingGeometry = {
      schema_version: "building_geometry.v1",
      status: "available",
      geometry_id: "geometry-1",
      project_session_id: "session-1",
      identity_sha256: "a".repeat(64),
      source_sha256: "b".repeat(64),
      revision_id: "revision-1",
      geometry_revision: 0,
      coordinate_space: { kind: "studio_metric", unit: "mm", units_per_grid_cell: null, y_axis: "up" },
      provenance: { source_kind: "studio_metric_draft", application_owned: true, source_schema_version: null },
      capabilities: { geometry_editing: "studio_draft", prj_round_trip: "unsupported" },
      levels: [{
        ...level,
        walls: [{ id: "wall-1", start_vertex_id: "a", end_vertex_id: "b", kind: "exterior", thickness: 200, source_icon_id: null }],
        openings: [{ id: "opening-1", wall_id: "wall-1", kind: "window", offset: 1_000, width: 1_000, swing: "none", adjacent_zone_ids: ["existing-zone-1"] }],
        zone_regions: [zoneRegion],
      }],
      vertical_openings: [],
      vertical_flow_path_anchors: [],
      warnings: [],
      unavailable_reason: null,
    };
    const result = createDraftFlowPathForOpening(geometry, draft, "level-1", "opening-1", {
      id: "draft-flow-1",
      flowElementId: "flow-element-1",
      multiplierMillionths: 1_000_000,
      relativeHeightMm: 1_200,
      reverse: false,
    }, () => "anchor-1");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.flowPath).toMatchObject({
      x_mm: 1_500,
      y_mm: 0,
      from_endpoint: { kind: "zone", zone_id: "existing-zone-1" },
      to_endpoint: { kind: "outdoor", zone_id: null },
    });
    expect(result.anchor.exterior_side).toBe("to");
  });

  it("parses relative height and multiplier into fixed-point integers", () => {
    expect(parseMetresToMillimetres("1.2")).toBe(1_200);
    expect(parseMultiplierMillionths("0.125")).toBe(125_000);
    expect(parseMultiplierMillionths("0.0000001")).toBeNull();
  });
});
