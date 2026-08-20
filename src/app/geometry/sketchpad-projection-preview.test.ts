import { describe, expect, it } from "vitest";
import metricFixture from "../../../contracts/geometry/examples/studio-metric-valid.json";
import type { SpatialProjection } from "../spatial-model";
import { cloneBuildingGeometry, type BuildingGeometry } from "./geometry-model";
import { buildSketchpadProjectionPreview } from "./sketchpad-projection-preview";

function geometry(): BuildingGeometry {
  const value = cloneBuildingGeometry(metricFixture as BuildingGeometry);
  value.levels[0].zone_regions.push({
    id: "region-2",
    semantic_zone_id: "zone-2",
    outer_vertex_ids: ["v2", "v3", "v4"],
  });
  return value;
}

function projection(): SpatialProjection {
  const model = geometry();
  return {
    schema_version: "spatial_projection.v1",
    status: "available",
    identity_sha256: model.identity_sha256,
    source_sha256: model.source_sha256,
    revision_id: model.revision_id,
    levels: [{
      level_number: 1,
      name: "Level 1",
      reference_height: 0,
      delta_height: 3,
      reference_height_unit: 0,
      delta_height_unit: 0,
      bounds: { min_column: 10, max_column: 20, min_row: 10, max_row: 20 },
      icons: [
        { id: "icon-1", icon_type: 5, kind: "zone", column: 10, row: 20, object_number: 1, binding: { kind: "zone", semantic_id: "zone-1", status: "bound", reason: null }, evidence: { source_line: 1 } },
        { id: "icon-2", icon_type: 5, kind: "zone", column: 20, row: 10, object_number: 2, binding: { kind: "zone", semantic_id: "zone-2", status: "bound", reason: null }, evidence: { source_line: 2 } },
      ],
    }],
    warnings: [],
    unavailable_reason: null,
  };
}

describe("lossy SketchPad projection preview", () => {
  it("maps Studio centroids deterministically while inverting the y axis", () => {
    const preview = buildSketchpadProjectionPreview(geometry(), projection());
    expect(preview.lossy).toBe(true);
    expect(preview.can_apply).toBe(false);
    expect(preview.project_session_id).toBe(geometry().project_session_id);
    expect(preview.source_sha256).toBe(geometry().source_sha256);
    expect(preview.moves).toHaveLength(2);
    expect(preview.diagnostics).toContain("sketchpad_projection_requires_verified_patch_planner");
    expect(preview.moves.map((move) => [move.semantic_zone_id, move.to_column, move.to_row])).toEqual([
      ["zone-1", 10, 20],
      ["zone-2", 20, 10],
    ]);
  });

  it("fails closed on stale identity and marks occupied candidate cells blocked", () => {
    const stale = projection();
    stale.revision_id = "revision-stale";
    expect(buildSketchpadProjectionPreview(geometry(), stale).status).toBe("unavailable");

    const occupied = projection();
    occupied.levels[0].icons.push({ id: "wall", icon_type: 11, kind: "wall", column: 10, row: 20, object_number: 0, binding: { kind: "none", semantic_id: null, status: "unbound", reason: null }, evidence: { source_line: 3 } });
    const blocked = buildSketchpadProjectionPreview(geometry(), occupied);
    expect(blocked.status).toBe("blocked");
    expect(blocked.diagnostics).toContain("sketchpad_projection_candidate_collision");
  });
});
