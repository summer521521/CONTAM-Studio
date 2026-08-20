import type {
  BuildingGeometry,
  GeometryLevel,
  GeometryVerticalFlowPathAnchor,
  GeometryVerticalOpening,
  GeometryZoneRegion,
} from "./geometry-model";
import type { SemanticNode } from "../semantic-state";

export const DEFAULT_VERTICAL_OPENING_SIZE_MM = 1_000;
export const MAX_VERTICAL_OPENINGS = 25_000;
export const MAX_VERTICAL_FLOW_PATH_ANCHORS = 25_000;
const MAX_GEOMETRY_COORDINATE_MM = 1_000_000_000;

export interface VerticalPoint { x: number; y: number; }

export interface PlaceVerticalOpeningOperation {
  operation: "place_vertical_opening";
  parameters: { level_id: string; vertical_opening: GeometryVerticalOpening };
}

export interface LinkVerticalFlowPathOperation {
  operation: "link_vertical_flow_path";
  parameters: { level_id: string; vertical_flow_path_anchor: GeometryVerticalFlowPathAnchor };
}

export type VerticalOpeningPlan =
  | {
    status: "ready";
    opening: GeometryVerticalOpening;
    lowerZoneId: string;
    upperZoneId: string;
    operation: PlaceVerticalOpeningOperation;
  }
  | { status: "blocked" | "unchanged"; diagnosticCode: string };

export type VerticalFlowPathPlan =
  | { status: "ready"; anchor: GeometryVerticalFlowPathAnchor; operation: LinkVerticalFlowPathOperation }
  | { status: "blocked" | "unchanged"; diagnosticCode: string };

export interface MatchingVerticalFlowPathOption {
  id: string;
  label: string;
}

function semanticId(node: SemanticNode): string | null {
  return node.object_id ?? node.zone_id ?? node.level_id ?? node.path_id
    ?? node.species_id ?? node.source_id ?? null;
}

export function matchingVerticalFlowPathOptions(
  zones: readonly SemanticNode[],
  flowPaths: readonly SemanticNode[],
  lowerZoneId: string,
  upperZoneId: string,
  boundFlowPathIds: ReadonlySet<string>,
): MatchingVerticalFlowPathOption[] {
  if (!safeId(lowerZoneId) || !safeId(upperZoneId) || lowerZoneId === upperZoneId) return [];
  const zoneIdsByContamNumber = new Map<number, string | null>();
  for (const zone of zones) {
    const id = semanticId(zone);
    if (!id || typeof zone.contam_number !== "number" || !Number.isSafeInteger(zone.contam_number)) continue;
    zoneIdsByContamNumber.set(
      zone.contam_number,
      zoneIdsByContamNumber.has(zone.contam_number) ? null : id,
    );
  }
  const expected = new Set([lowerZoneId, upperZoneId]);
  return flowPaths.flatMap((flow, index) => {
    const id = semanticId(flow);
    if (!id || boundFlowPathIds.has(id)
      || flow.from_endpoint?.category !== "zone" || flow.to_endpoint?.category !== "zone"
      || flow.from_endpoint.contam_number === null || flow.to_endpoint.contam_number === null) return [];
    const fromId = zoneIdsByContamNumber.get(flow.from_endpoint.contam_number) ?? null;
    const toId = zoneIdsByContamNumber.get(flow.to_endpoint.contam_number) ?? null;
    if (!fromId || !toId || fromId === toId
      || !expected.has(fromId) || !expected.has(toId)) return [];
    return [{ id, label: flow.label ?? flow.name ?? `FlowPath ${flow.contam_number ?? index + 1}` }];
  });
}

function safeId(value: string): boolean {
  return value.length > 0 && value.length <= 128;
}

function allGeometryObjectIds(geometry: BuildingGeometry): Set<string> {
  return new Set([
    geometry.geometry_id,
    ...geometry.levels.flatMap((level) => [
      level.id,
      ...level.vertices.map((item) => item.id),
      ...level.walls.map((item) => item.id),
      ...level.openings.map((item) => item.id),
      ...level.zone_regions.map((item) => item.id),
      ...level.flow_path_anchors.map((item) => item.id),
    ]),
    ...geometry.vertical_openings.map((item) => item.id),
    ...geometry.vertical_flow_path_anchors.map((item) => item.id),
  ]);
}

function cross(first: VerticalPoint, second: VerticalPoint, third: VerticalPoint): bigint {
  return BigInt(second.x - first.x) * BigInt(third.y - first.y)
    - BigInt(second.y - first.y) * BigInt(third.x - first.x);
}

function pointOnSegment(point: VerticalPoint, first: VerticalPoint, second: VerticalPoint): boolean {
  return cross(first, second, point) === 0n
    && point.x >= Math.min(first.x, second.x) && point.x <= Math.max(first.x, second.x)
    && point.y >= Math.min(first.y, second.y) && point.y <= Math.max(first.y, second.y);
}

function pointStrictlyInsidePolygon(point: VerticalPoint, polygon: readonly VerticalPoint[]): boolean {
  let winding = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const first = polygon[index];
    const second = polygon[(index + 1) % polygon.length];
    if (pointOnSegment(point, first, second)) return false;
    const turn = cross(first, second, point);
    if (first.y <= point.y && point.y < second.y && turn > 0n) winding += 1;
    else if (second.y <= point.y && point.y < first.y && turn < 0n) winding -= 1;
  }
  return winding !== 0;
}

export function verticalOpeningCorners(opening: GeometryVerticalOpening): VerticalPoint[] {
  return [
    { x: opening.x, y: opening.y },
    { x: opening.x + opening.width, y: opening.y },
    { x: opening.x + opening.width, y: opening.y + opening.depth },
    { x: opening.x, y: opening.y + opening.depth },
  ];
}

function regionPolygon(level: GeometryLevel, region: GeometryZoneRegion): VerticalPoint[] | null {
  const vertices = new Map(level.vertices.map((vertex) => [vertex.id, vertex]));
  const polygon = region.outer_vertex_ids.map((id) => vertices.get(id));
  return polygon.some((vertex) => !vertex) ? null : polygon as VerticalPoint[];
}

export function zonesContainingVerticalOpening(
  level: GeometryLevel,
  opening: GeometryVerticalOpening,
): string[] {
  const corners = verticalOpeningCorners(opening);
  return level.zone_regions.flatMap((region) => {
    const polygon = regionPolygon(level, region);
    return polygon && corners.every((corner) => pointStrictlyInsidePolygon(corner, polygon))
      ? [region.semantic_zone_id]
      : [];
  }).sort();
}

export function adjacentLevelPair(
  geometry: BuildingGeometry,
  firstLevelId: string,
  secondLevelId: string,
): { lower: GeometryLevel; upper: GeometryLevel } | null {
  if (firstLevelId === secondLevelId) return null;
  const ordered = [...geometry.levels].sort((left, right) => left.level_number - right.level_number || left.id.localeCompare(right.id));
  const firstIndex = ordered.findIndex((level) => level.id === firstLevelId);
  const secondIndex = ordered.findIndex((level) => level.id === secondLevelId);
  if (firstIndex < 0 || secondIndex < 0 || Math.abs(firstIndex - secondIndex) !== 1) return null;
  return firstIndex < secondIndex
    ? { lower: ordered[firstIndex], upper: ordered[secondIndex] }
    : { lower: ordered[secondIndex], upper: ordered[firstIndex] };
}

export function verticalOpeningsOverlap(
  first: GeometryVerticalOpening,
  second: GeometryVerticalOpening,
): boolean {
  if (first.lower_level_id !== second.lower_level_id || first.upper_level_id !== second.upper_level_id) return false;
  return first.x < second.x + second.width && second.x < first.x + first.width
    && first.y < second.y + second.depth && second.y < first.y + first.depth;
}

export function planVerticalOpeningPlacement(
  geometry: BuildingGeometry,
  activeLevelId: string,
  targetLevelId: string,
  center: VerticalPoint,
  kind: GeometryVerticalOpening["kind"],
  idFactory: () => string,
  width = DEFAULT_VERTICAL_OPENING_SIZE_MM,
  depth = DEFAULT_VERTICAL_OPENING_SIZE_MM,
): VerticalOpeningPlan {
  if (geometry.coordinate_space.kind !== "studio_metric" || geometry.capabilities.geometry_editing !== "studio_draft") {
    return { status: "blocked", diagnosticCode: "geometry_vertical_opening_read_only" };
  }
  const pair = adjacentLevelPair(geometry, activeLevelId, targetLevelId);
  if (!pair) return { status: "blocked", diagnosticCode: "geometry_vertical_opening_levels_not_adjacent" };
  if (!Number.isSafeInteger(center.x) || !Number.isSafeInteger(center.y)
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(depth) || width < 1 || depth < 1) {
    return { status: "blocked", diagnosticCode: "geometry_vertical_opening_dimension_invalid" };
  }
  const opening: GeometryVerticalOpening = {
    id: idFactory(),
    lower_level_id: pair.lower.id,
    upper_level_id: pair.upper.id,
    x: center.x - Math.floor(width / 2),
    y: center.y - Math.floor(depth / 2),
    width,
    depth,
    kind,
  };
  if (!safeId(opening.id) || allGeometryObjectIds(geometry).has(opening.id)) {
    return { status: "blocked", diagnosticCode: "geometry_vertical_opening_id_invalid" };
  }
  if ([opening.x, opening.y, opening.x + opening.width, opening.y + opening.depth]
    .some((value) => Math.abs(value) > MAX_GEOMETRY_COORDINATE_MM)) {
    return { status: "blocked", diagnosticCode: "geometry_vertical_opening_dimension_invalid" };
  }
  if (geometry.vertical_openings.length >= MAX_VERTICAL_OPENINGS
  ) {
    return { status: "blocked", diagnosticCode: "geometry_vertical_opening_id_invalid" };
  }
  if (geometry.vertical_openings.some((item) => verticalOpeningsOverlap(item, opening))) {
    return { status: "blocked", diagnosticCode: "geometry_vertical_opening_overlap" };
  }
  const lowerZones = zonesContainingVerticalOpening(pair.lower, opening);
  const upperZones = zonesContainingVerticalOpening(pair.upper, opening);
  if (lowerZones.length !== 1 || upperZones.length !== 1) {
    return { status: "blocked", diagnosticCode: "geometry_vertical_opening_zone_coverage_invalid" };
  }
  return {
    status: "ready",
    opening,
    lowerZoneId: lowerZones[0],
    upperZoneId: upperZones[0],
    operation: { operation: "place_vertical_opening", parameters: { level_id: activeLevelId, vertical_opening: opening } },
  };
}

export function planVerticalFlowPathLink(
  geometry: BuildingGeometry,
  activeLevelId: string,
  verticalOpeningId: string,
  semanticFlowPathId: string,
  lowerZoneId: string,
  upperZoneId: string,
  idFactory: () => string,
): VerticalFlowPathPlan {
  const opening = geometry.vertical_openings.find((item) => item.id === verticalOpeningId);
  if (!opening || ![opening.lower_level_id, opening.upper_level_id].includes(activeLevelId)) {
    return { status: "blocked", diagnosticCode: "geometry_vertical_opening_missing" };
  }
  if (geometry.vertical_flow_path_anchors.some((anchor) => anchor.vertical_opening_id === opening.id)) {
    return { status: "unchanged", diagnosticCode: "geometry_vertical_flow_path_already_bound" };
  }
  const pair = adjacentLevelPair(geometry, opening.lower_level_id, opening.upper_level_id);
  if (!pair) return { status: "blocked", diagnosticCode: "geometry_vertical_opening_levels_not_adjacent" };
  const lowerZones = zonesContainingVerticalOpening(pair.lower, opening);
  const upperZones = zonesContainingVerticalOpening(pair.upper, opening);
  if (lowerZones.length !== 1 || upperZones.length !== 1
    || lowerZones[0] !== lowerZoneId || upperZones[0] !== upperZoneId) {
    return { status: "blocked", diagnosticCode: "geometry_vertical_flow_path_zone_mismatch" };
  }
  const semanticIds = new Set([
    ...geometry.levels.flatMap((level) => level.flow_path_anchors.map((anchor) => anchor.semantic_flow_path_id)),
    ...geometry.vertical_flow_path_anchors.map((anchor) => anchor.semantic_flow_path_id),
  ]);
  const id = idFactory();
  if (!safeId(id) || allGeometryObjectIds(geometry).has(id)
    || !safeId(semanticFlowPathId) || semanticIds.has(semanticFlowPathId)
    || geometry.vertical_flow_path_anchors.length >= MAX_VERTICAL_FLOW_PATH_ANCHORS) {
    return { status: "blocked", diagnosticCode: "geometry_vertical_flow_path_binding_invalid" };
  }
  const anchor: GeometryVerticalFlowPathAnchor = {
    id,
    vertical_opening_id: opening.id,
    semantic_flow_path_id: semanticFlowPathId,
    lower_zone_id: lowerZoneId,
    upper_zone_id: upperZoneId,
  };
  return {
    status: "ready",
    anchor,
    operation: { operation: "link_vertical_flow_path", parameters: { level_id: activeLevelId, vertical_flow_path_anchor: anchor } },
  };
}
