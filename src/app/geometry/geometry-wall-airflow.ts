import type { SemanticNode } from "../semantic-state";
import { semanticNodeId } from "../semantic-state";
import type {
  BuildingGeometry,
  GeometryFlowPathAnchor,
  GeometryLevel,
  GeometryOpening,
  GeometryWall,
} from "./geometry-model";

const MAX_WALL_FLOW_PATH_ANCHORS = 100_000;

export type WallAirflowBoundaryKind = "interior" | "exterior";

export interface WallAirflowBoundary {
  status: "ready";
  kind: WallAirflowBoundaryKind;
  opening: GeometryOpening;
  wall: GeometryWall;
  zoneIds: readonly string[];
}

export interface WallFlowPathOption {
  id: string;
  label: string;
  boundaryKind: WallAirflowBoundaryKind;
  fromZoneId: string | null;
  toZoneId: string | null;
  exteriorSide: "none" | "from" | "to";
}

export type WallFlowPathPlan =
  | { status: "ready"; anchor: GeometryFlowPathAnchor; operation: { operation: "link_flow_path"; parameters: { level_id: string; flow_path_anchor: GeometryFlowPathAnchor } } }
  | { status: "blocked" | "unchanged"; diagnosticCode: string };

export interface WallFlowPathAudit {
  status: "verified" | "invalid" | "unavailable";
  boundaryKind: WallAirflowBoundaryKind | null;
  diagnosticCode: string | null;
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

export function wallAirflowBoundary(
  level: GeometryLevel,
  openingId: string,
): WallAirflowBoundary | { status: "blocked"; diagnosticCode: string } {
  const opening = level.openings.find((item) => item.id === openingId);
  if (!opening) return { status: "blocked", diagnosticCode: "geometry_wall_flow_path_opening_missing" };
  const wall = level.walls.find((item) => item.id === opening.wall_id);
  if (!wall) return { status: "blocked", diagnosticCode: "geometry_wall_flow_path_wall_missing" };
  const zoneIds = [...new Set(opening.adjacent_zone_ids)];
  if (zoneIds.length !== opening.adjacent_zone_ids.length
    || zoneIds.some((id) => !level.zone_regions.some((region) => region.semantic_zone_id === id))) {
    return { status: "blocked", diagnosticCode: "geometry_wall_flow_path_adjacency_invalid" };
  }
  if (zoneIds.length === 2 && wall.kind === "interior") {
    return { status: "ready", kind: "interior", opening, wall, zoneIds };
  }
  if (zoneIds.length === 1 && wall.kind === "exterior") {
    return { status: "ready", kind: "exterior", opening, wall, zoneIds };
  }
  return { status: "blocked", diagnosticCode: "geometry_wall_flow_path_boundary_unresolved" };
}

function uniqueZoneIdsByContamNumber(zones: readonly SemanticNode[]): ReadonlyMap<number, string | null> {
  const result = new Map<number, string | null>();
  for (const zone of zones) {
    const id = semanticNodeId(zone);
    if (!id || !Number.isSafeInteger(zone.contam_number)) continue;
    const number = zone.contam_number as number;
    result.set(number, result.has(number) ? null : id);
  }
  return result;
}

function uniqueSemanticIds(nodes: readonly SemanticNode[]): ReadonlyMap<string, boolean> {
  const result = new Map<string, boolean>();
  for (const node of nodes) {
    const id = semanticNodeId(node);
    if (id) result.set(id, !result.has(id));
  }
  return result;
}

function zoneEndpointId(
  endpoint: SemanticNode["from_endpoint"],
  zoneIdsByContamNumber: ReadonlyMap<number, string | null>,
): string | null {
  if (endpoint?.category !== "zone" || !Number.isSafeInteger(endpoint.contam_number)) return null;
  return zoneIdsByContamNumber.get(endpoint.contam_number as number) ?? null;
}

function outdoorEndpoint(endpoint: SemanticNode["from_endpoint"]): boolean {
  return endpoint?.category === "outdoor" && endpoint.contam_number === null;
}

export function matchingWallFlowPathOptions(
  level: GeometryLevel,
  zones: readonly SemanticNode[],
  flowPaths: readonly SemanticNode[],
  openingId: string,
  boundFlowPathIds: ReadonlySet<string>,
): WallFlowPathOption[] {
  const boundary = wallAirflowBoundary(level, openingId);
  if (boundary.status !== "ready") return [];
  const zoneIdsByContamNumber = uniqueZoneIdsByContamNumber(zones);
  const uniqueFlowIds = uniqueSemanticIds(flowPaths);
  const expectedZones = new Set(boundary.zoneIds);
  const options: WallFlowPathOption[] = [];

  for (let index = 0; index < flowPaths.length; index += 1) {
    const flow = flowPaths[index];
    const id = semanticNodeId(flow);
    if (!id || uniqueFlowIds.get(id) !== true || boundFlowPathIds.has(id)) continue;
    const fromZoneId = zoneEndpointId(flow.from_endpoint, zoneIdsByContamNumber);
    const toZoneId = zoneEndpointId(flow.to_endpoint, zoneIdsByContamNumber);
    const label = flow.label ?? flow.name ?? `FlowPath ${flow.contam_number ?? index + 1}`;
    if (boundary.kind === "interior") {
      if (!fromZoneId || !toZoneId || fromZoneId === toZoneId
        || !expectedZones.has(fromZoneId) || !expectedZones.has(toZoneId)) continue;
      options.push({ id, label, boundaryKind: "interior", fromZoneId, toZoneId, exteriorSide: "none" });
      continue;
    }
    if (outdoorEndpoint(flow.from_endpoint) && toZoneId === boundary.zoneIds[0]) {
      options.push({ id, label, boundaryKind: "exterior", fromZoneId: null, toZoneId, exteriorSide: "from" });
    } else if (fromZoneId === boundary.zoneIds[0] && outdoorEndpoint(flow.to_endpoint)) {
      options.push({ id, label, boundaryKind: "exterior", fromZoneId, toZoneId: null, exteriorSide: "to" });
    }
  }
  return options;
}

function optionMatchesBoundary(boundary: WallAirflowBoundary, option: WallFlowPathOption): boolean {
  if (!safeId(option.id) || option.boundaryKind !== boundary.kind) return false;
  const expected = new Set(boundary.zoneIds);
  const actual = new Set([option.fromZoneId, option.toZoneId].filter((id): id is string => id !== null));
  if (actual.size !== expected.size || [...actual].some((id) => !expected.has(id))) return false;
  if (boundary.kind === "interior") {
    return option.exteriorSide === "none" && option.fromZoneId !== null && option.toZoneId !== null;
  }
  return (option.exteriorSide === "from" && option.fromZoneId === null && option.toZoneId === boundary.zoneIds[0])
    || (option.exteriorSide === "to" && option.fromZoneId === boundary.zoneIds[0] && option.toZoneId === null);
}

export function planWallFlowPathLink(
  geometry: BuildingGeometry,
  levelId: string,
  openingId: string,
  option: WallFlowPathOption,
  idFactory: () => string,
): WallFlowPathPlan {
  if (geometry.coordinate_space.kind !== "studio_metric" || geometry.capabilities.geometry_editing !== "studio_draft") {
    return { status: "blocked", diagnosticCode: "geometry_wall_flow_path_read_only" };
  }
  const level = geometry.levels.find((item) => item.id === levelId);
  if (!level) return { status: "blocked", diagnosticCode: "geometry_wall_flow_path_level_missing" };
  const boundary = wallAirflowBoundary(level, openingId);
  if (boundary.status !== "ready") return boundary;
  if (level.flow_path_anchors.some((anchor) => anchor.opening_id === openingId)) {
    return { status: "unchanged", diagnosticCode: "geometry_wall_flow_path_opening_already_bound" };
  }
  const boundSemanticIds = new Set([
    ...geometry.levels.flatMap((item) => item.flow_path_anchors.map((anchor) => anchor.semantic_flow_path_id)),
    ...geometry.vertical_flow_path_anchors.map((anchor) => anchor.semantic_flow_path_id),
  ]);
  const id = idFactory();
  if (!optionMatchesBoundary(boundary, option) || boundSemanticIds.has(option.id)
    || level.flow_path_anchors.length >= MAX_WALL_FLOW_PATH_ANCHORS
    || !safeId(id) || allGeometryObjectIds(geometry).has(id)) {
    return { status: "blocked", diagnosticCode: "geometry_wall_flow_path_binding_invalid" };
  }
  const anchor: GeometryFlowPathAnchor = {
    id,
    opening_id: openingId,
    semantic_flow_path_id: option.id,
    from_zone_id: option.fromZoneId,
    to_zone_id: option.toZoneId,
    exterior_side: option.exteriorSide,
  };
  return {
    status: "ready",
    anchor,
    operation: { operation: "link_flow_path", parameters: { level_id: levelId, flow_path_anchor: anchor } },
  };
}

export function auditWallFlowPathAnchor(
  level: GeometryLevel,
  anchor: GeometryFlowPathAnchor,
  zones: readonly SemanticNode[],
  flowPaths: readonly SemanticNode[],
): WallFlowPathAudit {
  const boundary = wallAirflowBoundary(level, anchor.opening_id);
  if (boundary.status !== "ready") {
    return { status: "invalid", boundaryKind: null, diagnosticCode: boundary.diagnosticCode };
  }
  const matches = matchingWallFlowPathOptions(level, zones, flowPaths, anchor.opening_id, new Set());
  const option = matches.find((item) => item.id === anchor.semantic_flow_path_id);
  const semanticMatches = flowPaths.filter((flow) => semanticNodeId(flow) === anchor.semantic_flow_path_id);
  if (semanticMatches.length === 0) {
    return { status: "unavailable", boundaryKind: boundary.kind, diagnosticCode: "geometry_wall_flow_path_semantic_missing" };
  }
  if (semanticMatches.length !== 1 || !option || !optionMatchesBoundary(boundary, option)
    || option.fromZoneId !== anchor.from_zone_id || option.toZoneId !== anchor.to_zone_id
    || option.exteriorSide !== anchor.exterior_side) {
    return { status: "invalid", boundaryKind: boundary.kind, diagnosticCode: "geometry_wall_flow_path_semantic_mismatch" };
  }
  return { status: "verified", boundaryKind: boundary.kind, diagnosticCode: null };
}
