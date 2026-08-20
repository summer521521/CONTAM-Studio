import type {
  GeometryLevel,
  GeometryVertex,
  GeometryWall,
  GeometryZoneRegion,
} from "./geometry-model";

export const MAX_ZONE_FACE_EDGES = 4_096;
export const MAX_ZONE_TOPOLOGY_HALF_EDGES = 200_000;

export interface ZoneMetricPoint { x: number; y: number; }

interface ZoneFace {
  vertexIds: string[];
  vertices: GeometryVertex[];
  areaTwice: bigint;
}

export interface ZoneTopologyContext {
  levelId: string;
  vertices: readonly GeometryVertex[];
  walls: readonly GeometryWall[];
  zoneRegions: readonly GeometryZoneRegion[];
  verticesById: ReadonlyMap<string, GeometryVertex>;
  wallByEdge: ReadonlyMap<string, GeometryWall>;
  faces: readonly ZoneFace[];
  allIds: ReadonlySet<string>;
  baselineDiagnosticCode: string | null;
}

export interface CreateZoneRegionOperation {
  operation: "create_zone_region";
  parameters: { level_id: string; zone_region: GeometryZoneRegion };
}

export interface PartitionZoneRegionOperation {
  operation: "partition_zone_region";
  parameters: {
    level_id: string;
    source_region_id: string;
    source_outer_vertex_ids: string[];
    new_zone_region: GeometryZoneRegion;
  };
}

export interface MergeZoneRegionsOperation {
  operation: "merge_zone_regions";
  parameters: {
    level_id: string;
    kept_region_id: string;
    removed_region_id: string;
    merged_outer_vertex_ids: string[];
    removed_wall_ids: string[];
  };
}

export type ZoneCreatePlan =
  | { status: "ready"; region: GeometryZoneRegion; operation: CreateZoneRegionOperation }
  | { status: "unchanged" | "blocked"; diagnosticCode: string };

export type ZonePartitionPlan =
  | {
    status: "ready";
    sourceRegion: GeometryZoneRegion;
    newRegion: GeometryZoneRegion;
    dividerWallIds: string[];
    operation: PartitionZoneRegionOperation;
  }
  | { status: "unchanged" | "blocked"; diagnosticCode: string };

export type ZoneMergePlan =
  | {
    status: "ready";
    keptRegion: GeometryZoneRegion;
    removedRegion: GeometryZoneRegion;
    mergedOuterVertexIds: string[];
    removedWallIds: string[];
    operation: MergeZoneRegionsOperation;
  }
  | { status: "unchanged" | "blocked"; diagnosticCode: string };

function edgeKey(firstId: string, secondId: string): string {
  return firstId < secondId ? `${firstId}:${secondId}` : `${secondId}:${firstId}`;
}

function directedEdgeKey(firstId: string, secondId: string): string {
  return `${firstId}>${secondId}`;
}

function regionEdges(ids: readonly string[]): string[] {
  return ids.map((id, index) => edgeKey(id, ids[(index + 1) % ids.length]));
}

function cross(first: ZoneMetricPoint, second: ZoneMetricPoint, third: ZoneMetricPoint): bigint {
  return BigInt(second.x - first.x) * BigInt(third.y - first.y)
    - BigInt(second.y - first.y) * BigInt(third.x - first.x);
}

function areaTwice(vertices: readonly ZoneMetricPoint[]): bigint {
  let area = 0n;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    area += BigInt(current.x) * BigInt(next.y) - BigInt(next.x) * BigInt(current.y);
  }
  return area;
}

function pointOnSegment(point: ZoneMetricPoint, first: ZoneMetricPoint, second: ZoneMetricPoint): boolean {
  return cross(first, second, point) === 0n
    && point.x >= Math.min(first.x, second.x) && point.x <= Math.max(first.x, second.x)
    && point.y >= Math.min(first.y, second.y) && point.y <= Math.max(first.y, second.y);
}

function pointInPolygon(point: ZoneMetricPoint, polygon: readonly ZoneMetricPoint[], includeBoundary: boolean): boolean {
  let winding = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const first = polygon[index];
    const second = polygon[(index + 1) % polygon.length];
    if (pointOnSegment(point, first, second)) return includeBoundary;
    const turn = cross(first, second, point);
    if (first.y <= point.y && point.y < second.y && turn > 0n) winding += 1;
    else if (second.y <= point.y && point.y < first.y && turn < 0n) winding -= 1;
  }
  return winding !== 0;
}

function rotateCanonical(ids: readonly string[]): string[] {
  let best = 0;
  for (let index = 1; index < ids.length; index += 1) {
    if (ids[index].localeCompare(ids[best]) < 0) best = index;
  }
  return [...ids.slice(best), ...ids.slice(0, best)];
}

function normalizedCounterClockwise(ids: readonly string[], verticesById: ReadonlyMap<string, GeometryVertex>): string[] | null {
  if (ids.length < 3 || ids.length > MAX_ZONE_FACE_EDGES || new Set(ids).size !== ids.length) return null;
  const vertices = ids.map((id) => verticesById.get(id));
  if (vertices.some((vertex) => !vertex)) return null;
  const signedArea = areaTwice(vertices as GeometryVertex[]);
  if (signedArea === 0n) return null;
  const oriented = signedArea > 0n ? [...ids] : [...ids].reverse();
  return rotateCanonical(oriented);
}

function angle(from: GeometryVertex, to: GeometryVertex): number {
  const value = Math.atan2(to.y - from.y, to.x - from.x);
  return value < 0 ? value + Math.PI * 2 : value;
}

function extractFaces(
  verticesById: ReadonlyMap<string, GeometryVertex>,
  walls: readonly GeometryWall[],
): { faces: ZoneFace[]; diagnosticCode: string | null; wallByEdge: Map<string, GeometryWall> } {
  if (walls.length * 2 > MAX_ZONE_TOPOLOGY_HALF_EDGES) {
    return { faces: [], diagnosticCode: "geometry_zone_topology_complexity_limit", wallByEdge: new Map() };
  }
  const adjacency = new Map<string, string[]>();
  const wallByEdge = new Map<string, GeometryWall>();
  for (const wall of walls) {
    const start = verticesById.get(wall.start_vertex_id);
    const end = verticesById.get(wall.end_vertex_id);
    if (!start || !end || (start.x !== end.x && start.y !== end.y) || (start.x === end.x && start.y === end.y)) {
      return { faces: [], diagnosticCode: "geometry_zone_topology_baseline_invalid", wallByEdge };
    }
    const key = edgeKey(start.id, end.id);
    if (wallByEdge.has(key)) return { faces: [], diagnosticCode: "geometry_zone_topology_baseline_invalid", wallByEdge };
    wallByEdge.set(key, wall);
    const startNeighbors = adjacency.get(start.id) ?? [];
    const endNeighbors = adjacency.get(end.id) ?? [];
    startNeighbors.push(end.id);
    endNeighbors.push(start.id);
    adjacency.set(start.id, startNeighbors);
    adjacency.set(end.id, endNeighbors);
  }
  for (const [vertexId, neighbors] of adjacency) {
    const vertex = verticesById.get(vertexId)!;
    neighbors.sort((left, right) => angle(vertex, verticesById.get(left)!) - angle(vertex, verticesById.get(right)!) || left.localeCompare(right));
  }

  const visited = new Set<string>();
  const faces: ZoneFace[] = [];
  for (const wall of walls) {
    for (const [initialFrom, initialTo] of [[wall.start_vertex_id, wall.end_vertex_id], [wall.end_vertex_id, wall.start_vertex_id]]) {
      if (visited.has(directedEdgeKey(initialFrom, initialTo))) continue;
      const loop: string[] = [];
      let from = initialFrom;
      let to = initialTo;
      let closed = false;
      for (let step = 0; step <= walls.length * 2; step += 1) {
        const key = directedEdgeKey(from, to);
        if (visited.has(key)) break;
        visited.add(key);
        loop.push(from);
        const neighbors = adjacency.get(to);
        const reverseIndex = neighbors?.indexOf(from) ?? -1;
        if (!neighbors?.length || reverseIndex < 0) break;
        const next = neighbors[(reverseIndex - 1 + neighbors.length) % neighbors.length];
        from = to;
        to = next;
        if (from === initialFrom && to === initialTo) {
          closed = true;
          break;
        }
      }
      if (!closed || loop.length < 3 || loop.length > MAX_ZONE_FACE_EDGES || new Set(loop).size !== loop.length) continue;
      const rawVertices = loop.map((id) => verticesById.get(id)!);
      if (areaTwice(rawVertices) <= 0n) continue;
      const normalized = normalizedCounterClockwise(loop, verticesById);
      if (!normalized) continue;
      const vertices = normalized.map((id) => verticesById.get(id)!);
      const signedArea = areaTwice(vertices);
      faces.push({ vertexIds: normalized, vertices, areaTwice: signedArea });
    }
  }
  faces.sort((left, right) => left.areaTwice < right.areaTwice ? -1 : left.areaTwice > right.areaTwice ? 1 : left.vertexIds.join(":").localeCompare(right.vertexIds.join(":")));
  return { faces, diagnosticCode: null, wallByEdge };
}

export function createZoneTopologyContext(level: GeometryLevel): ZoneTopologyContext {
  const verticesById = new Map(level.vertices.map((vertex) => [vertex.id, vertex]));
  const extracted = extractFaces(verticesById, level.walls);
  return {
    levelId: level.id,
    vertices: level.vertices,
    walls: level.walls,
    zoneRegions: level.zone_regions,
    verticesById,
    wallByEdge: extracted.wallByEdge,
    faces: extracted.faces,
    allIds: new Set([
      level.id,
      ...level.vertices.map((item) => item.id),
      ...level.walls.map((item) => item.id),
      ...level.openings.map((item) => item.id),
      ...level.zone_regions.map((item) => item.id),
      ...level.flow_path_anchors.map((item) => item.id),
    ]),
    baselineDiagnosticCode: extracted.diagnosticCode,
  };
}

function contextIsCurrent(context: ZoneTopologyContext, level: GeometryLevel): boolean {
  return context.levelId === level.id && context.vertices === level.vertices
    && context.walls === level.walls && context.zoneRegions === level.zone_regions;
}

function faceAtPoint(context: ZoneTopologyContext, point: ZoneMetricPoint): ZoneFace | null | "boundary" | "ambiguous" {
  if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) return null;
  for (const face of context.faces) {
    if (face.vertices.some((vertex, index) => pointOnSegment(point, vertex, face.vertices[(index + 1) % face.vertices.length]))) return "boundary";
  }
  const matches = context.faces.filter((face) => pointInPolygon(point, face.vertices, false));
  return matches.length === 0 ? null : matches.length === 1 ? matches[0] : "ambiguous";
}

function regionPolygon(region: GeometryZoneRegion, context: ZoneTopologyContext): GeometryVertex[] | null {
  const polygon = region.outer_vertex_ids.map((id) => context.verticesById.get(id));
  return polygon.some((vertex) => !vertex) ? null : polygon as GeometryVertex[];
}

function faceInsideRegion(face: ZoneFace, polygon: readonly GeometryVertex[]): boolean {
  return face.vertices.every((vertex) => pointInPolygon(vertex, polygon, true));
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function regionUsesWall(region: GeometryZoneRegion, wall: GeometryWall): boolean {
  return region.outer_vertex_ids.some((vertexId, index) => {
    const nextId = region.outer_vertex_ids[(index + 1) % region.outer_vertex_ids.length];
    return (vertexId === wall.start_vertex_id && nextId === wall.end_vertex_id)
      || (vertexId === wall.end_vertex_id && nextId === wall.start_vertex_id);
  });
}

function partitionChangesAnchoredOpening(
  level: GeometryLevel,
  sourceRegion: GeometryZoneRegion,
  newRegion: GeometryZoneRegion,
): boolean {
  const candidateRegions = [
    ...level.zone_regions.filter((region) => region.id !== sourceRegion.id),
    sourceRegion,
    newRegion,
  ];
  const openingsById = new Map(level.openings.map((opening) => [opening.id, opening]));
  const wallsById = new Map(level.walls.map((wall) => [wall.id, wall]));
  return level.flow_path_anchors.some((anchor) => {
    const opening = openingsById.get(anchor.opening_id);
    const wall = opening ? wallsById.get(opening.wall_id) : null;
    if (!opening || !wall) return false;
    const proposed = candidateRegions.filter((region) => regionUsesWall(region, wall)).map((region) => region.semantic_zone_id).sort();
    return !sameIdSet([...new Set(opening.adjacent_zone_ids)].sort(), proposed);
  });
}

function safeNewId(value: string, context: ZoneTopologyContext): boolean {
  return value.length > 0 && value.length <= 128 && !context.allIds.has(value);
}

export function planZoneRegionFromPointWithContext(
  context: ZoneTopologyContext,
  level: GeometryLevel,
  semanticZoneId: string,
  point: ZoneMetricPoint,
  regionIdFactory: () => string,
): ZoneCreatePlan {
  if (!contextIsCurrent(context, level)) return { status: "blocked", diagnosticCode: "geometry_zone_topology_context_stale" };
  if (context.baselineDiagnosticCode) return { status: "blocked", diagnosticCode: context.baselineDiagnosticCode };
  if (!semanticZoneId || level.zone_regions.some((region) => region.semantic_zone_id === semanticZoneId)) {
    return { status: "blocked", diagnosticCode: "geometry_zone_semantic_already_bound" };
  }
  const face = faceAtPoint(context, point);
  if (face === "boundary") return { status: "blocked", diagnosticCode: "geometry_zone_point_on_boundary" };
  if (face === "ambiguous") return { status: "blocked", diagnosticCode: "geometry_zone_face_ambiguous" };
  if (!face) return { status: "blocked", diagnosticCode: "geometry_zone_face_not_found" };
  if (level.zone_regions.some((region) => {
    const polygon = regionPolygon(region, context);
    return polygon ? pointInPolygon(point, polygon, true) : false;
  })) return { status: "unchanged", diagnosticCode: "geometry_zone_face_already_bound" };
  const regionId = regionIdFactory();
  if (!safeNewId(regionId, context)) return { status: "blocked", diagnosticCode: "geometry_zone_topology_id_invalid" };
  const region = { id: regionId, semantic_zone_id: semanticZoneId, outer_vertex_ids: [...face.vertexIds] };
  return {
    status: "ready",
    region,
    operation: { operation: "create_zone_region", parameters: { level_id: level.id, zone_region: region } },
  };
}

export function planZoneRegionFromPoint(
  level: GeometryLevel,
  semanticZoneId: string,
  point: ZoneMetricPoint,
  regionIdFactory: () => string,
): ZoneCreatePlan {
  return planZoneRegionFromPointWithContext(createZoneTopologyContext(level), level, semanticZoneId, point, regionIdFactory);
}

export function planZonePartitionWithContext(
  context: ZoneTopologyContext,
  level: GeometryLevel,
  sourceRegionId: string,
  targetSemanticZoneId: string,
  targetPoint: ZoneMetricPoint,
  regionIdFactory: () => string,
): ZonePartitionPlan {
  if (!contextIsCurrent(context, level)) return { status: "blocked", diagnosticCode: "geometry_zone_topology_context_stale" };
  if (context.baselineDiagnosticCode) return { status: "blocked", diagnosticCode: context.baselineDiagnosticCode };
  const source = level.zone_regions.find((region) => region.id === sourceRegionId);
  if (!source) return { status: "blocked", diagnosticCode: "geometry_zone_source_missing" };
  if (!targetSemanticZoneId || targetSemanticZoneId === source.semantic_zone_id
    || level.zone_regions.some((region) => region.semantic_zone_id === targetSemanticZoneId)) {
    return { status: "blocked", diagnosticCode: "geometry_zone_partition_target_bound" };
  }
  const sourcePolygon = regionPolygon(source, context);
  if (!sourcePolygon) return { status: "blocked", diagnosticCode: "geometry_zone_topology_baseline_invalid" };
  if (!pointInPolygon(targetPoint, sourcePolygon, false)) return { status: "blocked", diagnosticCode: "geometry_zone_partition_point_outside" };
  const clickedFace = faceAtPoint(context, targetPoint);
  if (clickedFace === "boundary") return { status: "blocked", diagnosticCode: "geometry_zone_point_on_boundary" };
  if (clickedFace === "ambiguous" || !clickedFace) return { status: "blocked", diagnosticCode: "geometry_zone_face_ambiguous" };
  const contained = context.faces.filter((face) => faceInsideRegion(face, sourcePolygon));
  const sourceArea = areaTwice(sourcePolygon);
  const containedArea = contained.reduce((total, face) => total + face.areaTwice, 0n);
  if (contained.length === 1 && sameIdSet(contained[0].vertexIds, source.outer_vertex_ids)) {
    return { status: "unchanged", diagnosticCode: "geometry_zone_partition_not_divided" };
  }
  if (contained.length !== 2 || containedArea !== sourceArea) {
    return { status: "blocked", diagnosticCode: "geometry_zone_partition_not_binary" };
  }
  const targetFace = contained.find((face) => sameIdSet(face.vertexIds, clickedFace.vertexIds));
  const sourceFace = contained.find((face) => face !== targetFace);
  if (!targetFace || !sourceFace) return { status: "blocked", diagnosticCode: "geometry_zone_partition_face_mismatch" };
  const dividerEdges = regionEdges(sourceFace.vertexIds).filter((key) => regionEdges(targetFace.vertexIds).includes(key));
  const dividerWalls = dividerEdges.map((key) => context.wallByEdge.get(key)).filter((wall): wall is GeometryWall => Boolean(wall));
  if (!dividerEdges.length || dividerWalls.length !== dividerEdges.length) {
    return { status: "blocked", diagnosticCode: "geometry_zone_partition_divider_missing" };
  }
  const newRegionId = regionIdFactory();
  if (!safeNewId(newRegionId, context)) return { status: "blocked", diagnosticCode: "geometry_zone_topology_id_invalid" };
  const sourceRegion = { ...source, outer_vertex_ids: [...sourceFace.vertexIds] };
  const newRegion = { id: newRegionId, semantic_zone_id: targetSemanticZoneId, outer_vertex_ids: [...targetFace.vertexIds] };
  if (partitionChangesAnchoredOpening(level, sourceRegion, newRegion)) {
    return { status: "blocked", diagnosticCode: "geometry_zone_partition_flow_path_conflict" };
  }
  return {
    status: "ready",
    sourceRegion,
    newRegion,
    dividerWallIds: dividerWalls.map((wall) => wall.id).sort(),
    operation: {
      operation: "partition_zone_region",
      parameters: {
        level_id: level.id,
        source_region_id: source.id,
        source_outer_vertex_ids: [...sourceRegion.outer_vertex_ids],
        new_zone_region: newRegion,
      },
    },
  };
}

export function planZonePartition(
  level: GeometryLevel,
  sourceRegionId: string,
  targetSemanticZoneId: string,
  targetPoint: ZoneMetricPoint,
  regionIdFactory: () => string,
): ZonePartitionPlan {
  return planZonePartitionWithContext(
    createZoneTopologyContext(level), level, sourceRegionId, targetSemanticZoneId, targetPoint, regionIdFactory,
  );
}

function connectedSharedBoundary(sharedEdges: readonly string[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of sharedEdges) {
    const [first, second] = edge.split(":");
    adjacency.set(first, [...(adjacency.get(first) ?? []), second]);
    adjacency.set(second, [...(adjacency.get(second) ?? []), first]);
  }
  const endpoints = [...adjacency.values()].filter((neighbors) => neighbors.length === 1).length;
  if (endpoints !== 2 || [...adjacency.values()].some((neighbors) => neighbors.length > 2)) return false;
  const start = adjacency.keys().next().value as string | undefined;
  if (!start) return false;
  const visited = new Set<string>();
  const pending = [start];
  while (pending.length) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return visited.size === adjacency.size;
}

function buildBoundaryLoop(edgeKeys: readonly string[], context: ZoneTopologyContext): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const edge of edgeKeys) {
    const [first, second] = edge.split(":");
    adjacency.set(first, [...(adjacency.get(first) ?? []), second]);
    adjacency.set(second, [...(adjacency.get(second) ?? []), first]);
  }
  if (!adjacency.size || [...adjacency.values()].some((neighbors) => neighbors.length !== 2)) return null;
  const start = [...adjacency.keys()].sort()[0];
  const candidates = [...adjacency.get(start)!].sort();
  for (const initialNext of candidates) {
    const loop = [start];
    let previous = start;
    let current = initialNext;
    for (let step = 0; step <= edgeKeys.length; step += 1) {
      if (current === start) break;
      if (loop.includes(current)) break;
      loop.push(current);
      const neighbors = adjacency.get(current);
      if (!neighbors) break;
      const next = neighbors[0] === previous ? neighbors[1] : neighbors[0];
      previous = current;
      current = next;
    }
    if (current === start && loop.length === edgeKeys.length) {
      const normalized = normalizedCounterClockwise(loop, context.verticesById);
      if (normalized) return normalized;
    }
  }
  return null;
}

export function planZoneMergeWithContext(
  context: ZoneTopologyContext,
  level: GeometryLevel,
  keptRegionId: string,
  removedRegionId: string,
): ZoneMergePlan {
  if (!contextIsCurrent(context, level)) return { status: "blocked", diagnosticCode: "geometry_zone_topology_context_stale" };
  if (context.baselineDiagnosticCode) return { status: "blocked", diagnosticCode: context.baselineDiagnosticCode };
  if (keptRegionId === removedRegionId) return { status: "unchanged", diagnosticCode: "geometry_zone_merge_same_region" };
  const kept = level.zone_regions.find((region) => region.id === keptRegionId);
  const removed = level.zone_regions.find((region) => region.id === removedRegionId);
  if (!kept || !removed) return { status: "blocked", diagnosticCode: "geometry_zone_merge_region_missing" };
  if (level.flow_path_anchors.some((anchor) => anchor.from_zone_id === removed.semantic_zone_id || anchor.to_zone_id === removed.semantic_zone_id)) {
    return { status: "blocked", diagnosticCode: "geometry_zone_merge_flow_path_conflict" };
  }
  const keptEdges = regionEdges(kept.outer_vertex_ids);
  const removedEdges = regionEdges(removed.outer_vertex_ids);
  const removedEdgeSet = new Set(removedEdges);
  const sharedEdges = keptEdges.filter((edge) => removedEdgeSet.has(edge));
  if (!sharedEdges.length || !connectedSharedBoundary(sharedEdges)) {
    return { status: "blocked", diagnosticCode: "geometry_zone_merge_not_adjacent" };
  }
  const sharedWalls = sharedEdges.map((edge) => context.wallByEdge.get(edge)).filter((wall): wall is GeometryWall => Boolean(wall));
  if (sharedWalls.length !== sharedEdges.length) return { status: "blocked", diagnosticCode: "geometry_zone_merge_boundary_missing" };
  if (level.openings.some((opening) => sharedWalls.some((wall) => wall.id === opening.wall_id))) {
    return { status: "blocked", diagnosticCode: "geometry_zone_merge_boundary_has_opening" };
  }
  const sharedSet = new Set(sharedEdges);
  const outerEdges = [...keptEdges.filter((edge) => !sharedSet.has(edge)), ...removedEdges.filter((edge) => !sharedSet.has(edge))];
  if (new Set(outerEdges).size !== outerEdges.length) return { status: "blocked", diagnosticCode: "geometry_zone_merge_boundary_invalid" };
  const mergedOuterVertexIds = buildBoundaryLoop(outerEdges, context);
  if (!mergedOuterVertexIds) return { status: "blocked", diagnosticCode: "geometry_zone_merge_boundary_invalid" };
  const removedWallIds = sharedWalls.map((wall) => wall.id).sort();
  return {
    status: "ready",
    keptRegion: kept,
    removedRegion: removed,
    mergedOuterVertexIds,
    removedWallIds,
    operation: {
      operation: "merge_zone_regions",
      parameters: {
        level_id: level.id,
        kept_region_id: kept.id,
        removed_region_id: removed.id,
        merged_outer_vertex_ids: mergedOuterVertexIds,
        removed_wall_ids: removedWallIds,
      },
    },
  };
}

export function planZoneMerge(level: GeometryLevel, keptRegionId: string, removedRegionId: string): ZoneMergePlan {
  return planZoneMergeWithContext(createZoneTopologyContext(level), level, keptRegionId, removedRegionId);
}
