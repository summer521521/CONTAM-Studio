import type { SpatialIcon, SpatialProjection } from "../spatial-model";
import { geometrySha256, type BuildingGeometry, type GeometryLevel, type GeometryZoneRegion } from "./geometry-model";

export const SKETCHPAD_PROJECTION_PREVIEW_SCHEMA_VERSION = "sketchpad_projection_preview.v1" as const;

export interface SketchpadProjectionMove {
  icon_id: string;
  semantic_zone_id: string;
  level_number: number;
  from_column: number;
  from_row: number;
  to_column: number;
  to_row: number;
  changed: boolean;
}

export interface SketchpadProjectionPreview {
  schema_version: typeof SKETCHPAD_PROJECTION_PREVIEW_SCHEMA_VERSION;
  status: "preview" | "blocked" | "unavailable";
  method: "zone_centroid_normalized_to_existing_icon_bounds";
  lossy: true;
  can_apply: false;
  project_session_id: string;
  geometry_id: string;
  geometry_sha256: string;
  identity_sha256: string;
  source_sha256: string;
  revision_id: string;
  moves: SketchpadProjectionMove[];
  diagnostics: string[];
}

interface ZoneCentroid {
  region: GeometryZoneRegion;
  icon: SpatialIcon;
  x: number;
  y: number;
}

function centroid(level: GeometryLevel, region: GeometryZoneRegion): { x: number; y: number } | null {
  const vertices = new Map(level.vertices.map((vertex) => [vertex.id, vertex]));
  const polygon = region.outer_vertex_ids.map((id) => vertices.get(id)).filter((value) => value !== undefined);
  if (polygon.length !== region.outer_vertex_ids.length || polygon.length < 3) return null;
  let crossSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const cross = current.x * next.y - next.x * current.y;
    crossSum += cross;
    xSum += (current.x + next.x) * cross;
    ySum += (current.y + next.y) * cross;
  }
  if (!Number.isFinite(crossSum) || crossSum === 0) return null;
  return { x: xSum / (3 * crossSum), y: ySum / (3 * crossSum) };
}

function unavailable(geometry: BuildingGeometry, diagnostics: string[]): SketchpadProjectionPreview {
  return {
    schema_version: SKETCHPAD_PROJECTION_PREVIEW_SCHEMA_VERSION,
    status: "unavailable",
    method: "zone_centroid_normalized_to_existing_icon_bounds",
    lossy: true,
    can_apply: false,
    project_session_id: geometry.project_session_id,
    geometry_id: geometry.geometry_id,
    geometry_sha256: geometrySha256(geometry),
    identity_sha256: geometry.identity_sha256,
    source_sha256: geometry.source_sha256,
    revision_id: geometry.revision_id,
    moves: [],
    diagnostics,
  };
}

function normalizedCoordinate(
  value: number,
  sourceMin: number,
  sourceMax: number,
  targetMin: number,
  targetMax: number,
  fallback: number,
  invert: boolean,
): number {
  if (sourceMin === sourceMax || targetMin === targetMax) return fallback;
  const ratio = (value - sourceMin) / (sourceMax - sourceMin);
  const normalized = invert ? 1 - ratio : ratio;
  return Math.round(targetMin + normalized * (targetMax - targetMin));
}

export function buildSketchpadProjectionPreview(
  geometry: BuildingGeometry,
  projection: SpatialProjection | null,
): SketchpadProjectionPreview {
  if (geometry.status !== "available"
    || geometry.provenance.source_kind !== "studio_metric_draft"
    || geometry.coordinate_space.kind !== "studio_metric") {
    return unavailable(geometry, ["sketchpad_projection_requires_studio_metric_geometry"]);
  }
  if (!projection || projection.status !== "available") {
    return unavailable(geometry, ["sketchpad_projection_source_unavailable"]);
  }
  if (projection.identity_sha256.toLowerCase() !== geometry.identity_sha256.toLowerCase()
    || projection.source_sha256.toLowerCase() !== geometry.source_sha256.toLowerCase()
    || projection.revision_id !== geometry.revision_id) {
    return unavailable(geometry, ["sketchpad_projection_context_stale"]);
  }

  const moves: SketchpadProjectionMove[] = [];
  const diagnostics = ["sketchpad_projection_lossy", "sketchpad_projection_requires_verified_patch_planner"];
  for (const level of [...geometry.levels].sort((left, right) => left.level_number - right.level_number || left.id.localeCompare(right.id))) {
    const spatialLevel = projection.levels.find((candidate) => candidate.level_number === level.level_number);
    if (!spatialLevel) {
      if (level.zone_regions.length) diagnostics.push("sketchpad_projection_level_unmatched");
      continue;
    }
    const zoneIconBySemantic = new Map(
      spatialLevel.icons
        .filter((icon) => icon.kind === "zone" && icon.binding.status === "bound" && icon.binding.semantic_id)
        .map((icon) => [icon.binding.semantic_id as string, icon]),
    );
    const centroids: ZoneCentroid[] = [];
    for (const region of [...level.zone_regions].sort((left, right) => left.semantic_zone_id.localeCompare(right.semantic_zone_id) || left.id.localeCompare(right.id))) {
      const icon = zoneIconBySemantic.get(region.semantic_zone_id);
      const center = centroid(level, region);
      if (!icon || !center) {
        diagnostics.push(icon ? "sketchpad_projection_zone_geometry_invalid" : "sketchpad_projection_zone_unbound");
        continue;
      }
      centroids.push({ region, icon, ...center });
    }
    if (!centroids.length) continue;
    let minX = centroids[0].x;
    let maxX = centroids[0].x;
    let minY = centroids[0].y;
    let maxY = centroids[0].y;
    let minColumn = centroids[0].icon.column;
    let maxColumn = centroids[0].icon.column;
    let minRow = centroids[0].icon.row;
    let maxRow = centroids[0].icon.row;
    for (let index = 1; index < centroids.length; index += 1) {
      const item = centroids[index];
      minX = Math.min(minX, item.x);
      maxX = Math.max(maxX, item.x);
      minY = Math.min(minY, item.y);
      maxY = Math.max(maxY, item.y);
      minColumn = Math.min(minColumn, item.icon.column);
      maxColumn = Math.max(maxColumn, item.icon.column);
      minRow = Math.min(minRow, item.icon.row);
      maxRow = Math.max(maxRow, item.icon.row);
    }
    for (const item of centroids) {
      const toColumn = normalizedCoordinate(item.x, minX, maxX, minColumn, maxColumn, item.icon.column, false);
      const toRow = normalizedCoordinate(item.y, minY, maxY, minRow, maxRow, item.icon.row, true);
      moves.push({
        icon_id: item.icon.id,
        semantic_zone_id: item.region.semantic_zone_id,
        level_number: level.level_number,
        from_column: item.icon.column,
        from_row: item.icon.row,
        to_column: toColumn,
        to_row: toRow,
        changed: toColumn !== item.icon.column || toRow !== item.icon.row,
      });
    }
  }
  if (!moves.length) return unavailable(geometry, [...new Set(diagnostics), "sketchpad_projection_no_bound_zones"]);

  const targetIcons = new Set(moves.map((move) => move.icon_id));
  const occupancy = new Map<string, string>();
  for (const level of projection.levels) {
    for (const icon of level.icons) {
      if (targetIcons.has(icon.id)) continue;
      occupancy.set(`${level.level_number}:${icon.column}:${icon.row}`, icon.id);
    }
  }
  let blocked = false;
  for (const move of moves) {
    const key = `${move.level_number}:${move.to_column}:${move.to_row}`;
    if (occupancy.has(key)) {
      blocked = true;
      diagnostics.push("sketchpad_projection_candidate_collision");
    } else {
      occupancy.set(key, move.icon_id);
    }
  }
  return {
    schema_version: SKETCHPAD_PROJECTION_PREVIEW_SCHEMA_VERSION,
    status: blocked ? "blocked" : "preview",
    method: "zone_centroid_normalized_to_existing_icon_bounds",
    lossy: true,
    can_apply: false,
    project_session_id: geometry.project_session_id,
    geometry_id: geometry.geometry_id,
    geometry_sha256: geometrySha256(geometry),
    identity_sha256: geometry.identity_sha256,
    source_sha256: geometry.source_sha256,
    revision_id: geometry.revision_id,
    moves,
    diagnostics: [...new Set(diagnostics)].sort(),
  };
}
