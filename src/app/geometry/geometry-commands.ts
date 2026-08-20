import {
  GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION,
  GEOMETRY_HASH_PATTERN,
  cloneBuildingGeometry,
  geometrySha256,
  type BuildingGeometry,
  type GeometryDiagnostic,
  type GeometryEditCommand,
  type GeometryFlowPathAnchor,
  type GeometryLevel,
  type GeometryOpening,
  type GeometryPlanUnderlay,
  type GeometryVertex,
  type GeometryVerticalFlowPathAnchor,
  type GeometryVerticalOpening,
  type GeometryWall,
  type GeometryZoneRegion,
} from "./geometry-model";
import { isValidPlanUnderlay } from "./geometry-plan-underlay";
import { validateBuildingGeometry } from "./geometry-validation";
import {
  levelIsEmptyConstructionTarget,
  MAX_LEVEL_COPY_OPENINGS,
  MAX_LEVEL_COPY_VERTICES,
  MAX_LEVEL_COPY_WALLS,
  type GeometryIdMapping,
} from "./geometry-level-construction";

export type GeometryCommandResult =
  | { status: "ready"; command: GeometryEditCommand; before: BuildingGeometry; after: BuildingGeometry; geometry_hash: string; diagnostics: GeometryDiagnostic[] }
  | { status: "rejected"; command: GeometryEditCommand; geometry: BuildingGeometry; diagnostics: GeometryDiagnostic[] };

function error(code: string, objectId: string | null = null): GeometryDiagnostic {
  return { code, severity: "error", object_id: objectId };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function safeInteger(value: unknown, minimum = -1_000_000_000): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= 1_000_000_000;
}

function findLevel(geometry: BuildingGeometry, levelId: unknown): GeometryLevel | null {
  return safeId(levelId) ? geometry.levels.find((level) => level.id === levelId) ?? null : null;
}

function parseVertex(value: unknown): GeometryVertex | null {
  const item = record(value);
  return item && exactKeys(item, ["id", "x", "y"])
    && safeId(item.id) && safeInteger(item.x) && safeInteger(item.y)
    ? { id: item.id, x: item.x, y: item.y }
    : null;
}

interface GeometryVertexMove {
  vertex_id: string;
  x: number;
  y: number;
}

function parseVertexMoves(value: unknown): GeometryVertexMove[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) return null;
  const seen = new Set<string>();
  const moves: GeometryVertexMove[] = [];
  for (const candidate of value) {
    const item = record(candidate);
    if (!item || !exactKeys(item, ["vertex_id", "x", "y"])
      || !safeId(item.vertex_id) || !safeInteger(item.x) || !safeInteger(item.y)
      || seen.has(item.vertex_id)) return null;
    seen.add(item.vertex_id);
    moves.push({ vertex_id: item.vertex_id, x: item.x, y: item.y });
  }
  return moves;
}

function parseWall(value: unknown): GeometryWall | null {
  const item = record(value);
  if (!item || !exactKeys(item, ["id", "start_vertex_id", "end_vertex_id", "kind", "thickness", "source_icon_id"])) return null;
  if (!safeId(item.id) || !safeId(item.start_vertex_id) || !safeId(item.end_vertex_id)
    || !["exterior", "interior", "unknown"].includes(String(item.kind))
    || !(item.thickness === null || safeInteger(item.thickness, 1))
    || !(item.source_icon_id === null || safeId(item.source_icon_id))) return null;
  return item as unknown as GeometryWall;
}

function parseOpening(value: unknown): GeometryOpening | null {
  const item = record(value);
  if (!item || !exactKeys(item, ["id", "wall_id", "kind", "offset", "width", "swing", "adjacent_zone_ids"])) return null;
  if (!safeId(item.id) || !safeId(item.wall_id)
    || !["door", "window", "exterior_opening", "other"].includes(String(item.kind))
    || !safeInteger(item.offset, 0) || !safeInteger(item.width, 1)
    || !["none", "left", "right", "double"].includes(String(item.swing))
    || !Array.isArray(item.adjacent_zone_ids) || item.adjacent_zone_ids.length > 2
    || item.adjacent_zone_ids.some((id) => !safeId(id))) return null;
  return item as unknown as GeometryOpening;
}

function parseZoneRegion(value: unknown): GeometryZoneRegion | null {
  const item = record(value);
  if (!item || !exactKeys(item, ["id", "semantic_zone_id", "outer_vertex_ids"])) return null;
  if (!safeId(item.id) || !safeId(item.semantic_zone_id) || !Array.isArray(item.outer_vertex_ids)
    || item.outer_vertex_ids.length < 3 || item.outer_vertex_ids.some((id) => !safeId(id))) return null;
  return item as unknown as GeometryZoneRegion;
}

function parseFlowPathAnchor(value: unknown): GeometryFlowPathAnchor | null {
  const item = record(value);
  if (!item || !exactKeys(item, ["id", "opening_id", "semantic_flow_path_id", "from_zone_id", "to_zone_id", "exterior_side"])) return null;
  if (!safeId(item.id) || !safeId(item.opening_id) || !safeId(item.semantic_flow_path_id)
    || !(item.from_zone_id === null || safeId(item.from_zone_id))
    || !(item.to_zone_id === null || safeId(item.to_zone_id))
    || !["none", "from", "to"].includes(String(item.exterior_side))) return null;
  return item as unknown as GeometryFlowPathAnchor;
}

function parseVerticalOpening(value: unknown): GeometryVerticalOpening | null {
  const item = record(value);
  if (!item || !exactKeys(item, ["id", "lower_level_id", "upper_level_id", "x", "y", "width", "depth", "kind"])
    || !safeId(item.id) || !safeId(item.lower_level_id) || !safeId(item.upper_level_id)
    || item.lower_level_id === item.upper_level_id
    || !safeInteger(item.x) || !safeInteger(item.y)
    || !safeInteger(item.width, 1) || !safeInteger(item.depth, 1)
    || !["floor_opening", "stair", "shaft"].includes(String(item.kind))) return null;
  return item as unknown as GeometryVerticalOpening;
}

function parseVerticalFlowPathAnchor(value: unknown): GeometryVerticalFlowPathAnchor | null {
  const item = record(value);
  if (!item || !exactKeys(item, ["id", "vertical_opening_id", "semantic_flow_path_id", "lower_zone_id", "upper_zone_id"])
    || !safeId(item.id) || !safeId(item.vertical_opening_id) || !safeId(item.semantic_flow_path_id)
    || !safeId(item.lower_zone_id) || !safeId(item.upper_zone_id)
    || item.lower_zone_id === item.upper_zone_id) return null;
  return item as unknown as GeometryVerticalFlowPathAnchor;
}

function parsePlanUnderlay(value: unknown): GeometryPlanUnderlay | null {
  return isValidPlanUnderlay(value) ? structuredClone(value) : null;
}

function reject(command: GeometryEditCommand, geometry: BuildingGeometry, code: string, objectId: string | null = null): GeometryCommandResult {
  return { status: "rejected", command, geometry, diagnostics: [error(code, objectId)] };
}

function zoneRegionUsesWall(region: GeometryZoneRegion, startVertexId: string, endVertexId: string): boolean {
  return region.outer_vertex_ids.some((vertexId, index) => {
    const nextId = region.outer_vertex_ids[(index + 1) % region.outer_vertex_ids.length];
    return (vertexId === startVertexId && nextId === endVertexId)
      || (vertexId === endVertexId && nextId === startVertexId);
  });
}

function insertSplitVertexInZoneRegions(
  regions: GeometryZoneRegion[],
  startVertexId: string,
  endVertexId: string,
  splitVertexId: string,
): void {
  for (const region of regions) {
    if (!zoneRegionUsesWall(region, startVertexId, endVertexId)) continue;
    const expanded: string[] = [];
    for (let index = 0; index < region.outer_vertex_ids.length; index += 1) {
      const vertexId = region.outer_vertex_ids[index];
      const nextId = region.outer_vertex_ids[(index + 1) % region.outer_vertex_ids.length];
      expanded.push(vertexId);
      if ((vertexId === startVertexId && nextId === endVertexId)
        || (vertexId === endVertexId && nextId === startVertexId)) {
        expanded.push(splitVertexId);
      }
    }
    region.outer_vertex_ids = expanded;
  }
}

function parseUniqueIds(value: unknown, minimum: number, maximum = 4_096): string[] | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum
    || value.some((item) => !safeId(item))) return null;
  const ids = value as string[];
  return new Set(ids).size === ids.length ? [...ids] : null;
}

function parseIdMappings(value: unknown, expectedLength: number, maximum: number): GeometryIdMapping[] | null {
  if (!Array.isArray(value) || value.length !== expectedLength || value.length > maximum) return null;
  const sourceIds = new Set<string>();
  const targetIds = new Set<string>();
  const mappings: GeometryIdMapping[] = [];
  for (const candidate of value) {
    const item = record(candidate);
    if (!item || !exactKeys(item, ["source_id", "target_id"])
      || !safeId(item.source_id) || !safeId(item.target_id)
      || sourceIds.has(item.source_id) || targetIds.has(item.target_id)) return null;
    sourceIds.add(item.source_id);
    targetIds.add(item.target_id);
    mappings.push({ source_id: item.source_id, target_id: item.target_id });
  }
  return mappings;
}

function geometryObjectIds(geometry: BuildingGeometry): Set<string> {
  return new Set([
    ...geometry.vertical_openings.map((item) => item.id),
    ...geometry.vertical_flow_path_anchors.map((item) => item.id),
    ...geometry.levels.flatMap((level) => [
    level.id,
    ...level.vertices.map((item) => item.id),
    ...level.walls.map((item) => item.id),
    ...level.openings.map((item) => item.id),
    ...level.zone_regions.map((item) => item.id),
    ...level.flow_path_anchors.map((item) => item.id),
    ...level.underlays.map((item) => item.id),
    ]),
  ]);
}

function undirectedEdgeKey(firstId: string, secondId: string): string {
  return firstId < secondId ? `${firstId}:${secondId}` : `${secondId}:${firstId}`;
}

function zoneEdgeKeys(vertexIds: readonly string[]): string[] {
  return vertexIds.map((id, index) => undirectedEdgeKey(id, vertexIds[(index + 1) % vertexIds.length]));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((item) => expected.has(item));
}

function zoneBoundaryHasWalls(level: GeometryLevel, vertexIds: readonly string[]): boolean {
  const wallEdges = new Set(level.walls.map((wall) => undirectedEdgeKey(wall.start_vertex_id, wall.end_vertex_id)));
  return zoneEdgeKeys(vertexIds).every((edge) => wallEdges.has(edge));
}

function partitionBoundariesMatch(
  original: readonly string[],
  first: readonly string[],
  second: readonly string[],
): boolean {
  const originalEdges = new Set(zoneEdgeKeys(original));
  const firstEdges = new Set(zoneEdgeKeys(first));
  const secondEdges = new Set(zoneEdgeKeys(second));
  const shared = [...firstEdges].filter((edge) => secondEdges.has(edge));
  const outer = [
    ...[...firstEdges].filter((edge) => !secondEdges.has(edge)),
    ...[...secondEdges].filter((edge) => !firstEdges.has(edge)),
  ];
  return shared.length > 0 && sameStringSet(outer, [...originalEdges]);
}

function mergeBoundariesMatch(
  first: readonly string[],
  second: readonly string[],
  merged: readonly string[],
): boolean {
  const firstEdges = new Set(zoneEdgeKeys(first));
  const secondEdges = new Set(zoneEdgeKeys(second));
  const shared = [...firstEdges].filter((edge) => secondEdges.has(edge));
  const expectedOuter = [
    ...[...firstEdges].filter((edge) => !secondEdges.has(edge)),
    ...[...secondEdges].filter((edge) => !firstEdges.has(edge)),
  ];
  return shared.length > 0 && sameStringSet(expectedOuter, zoneEdgeKeys(merged));
}

function openingAdjacentZones(level: GeometryLevel, opening: GeometryOpening): string[] | null {
  const wall = level.walls.find((item) => item.id === opening.wall_id);
  if (!wall) return null;
  const adjacent = level.zone_regions
    .filter((region) => zoneRegionUsesWall(region, wall.start_vertex_id, wall.end_vertex_id))
    .map((region) => region.semantic_zone_id)
    .sort();
  return adjacent.length <= 2 ? [...new Set(adjacent)] : null;
}

function reconcileOpeningAdjacency(level: GeometryLevel): GeometryDiagnostic[] {
  const anchorsByOpening = new Set(level.flow_path_anchors.map((anchor) => anchor.opening_id));
  const proposed = new Map<string, string[]>();
  for (const opening of level.openings) {
    const adjacent = openingAdjacentZones(level, opening);
    if (!adjacent) return [error("geometry_command_zone_opening_adjacency_invalid", opening.id)];
    const current = [...new Set(opening.adjacent_zone_ids)].sort();
    if (anchorsByOpening.has(opening.id) && !sameStringSet(current, adjacent)) {
      return [error("geometry_command_zone_flow_path_conflict", opening.id)];
    }
    proposed.set(opening.id, adjacent);
  }
  for (const opening of level.openings) opening.adjacent_zone_ids = proposed.get(opening.id) ?? [];
  return [];
}

function applyOperation(command: GeometryEditCommand, geometry: BuildingGeometry): GeometryDiagnostic[] {
  const parameters = record(command.parameters);
  if (!parameters) return [error("geometry_command_parameters_invalid")];
  const level = findLevel(geometry, parameters.level_id);
  if (!level) return [error("geometry_command_level_missing")];

  switch (command.operation) {
    case "add_vertex": {
      if (!exactKeys(parameters, ["level_id", "vertex"])) return [error("geometry_command_parameters_invalid")];
      const vertex = parseVertex(parameters.vertex);
      if (!vertex) return [error("geometry_command_vertex_invalid")];
      level.vertices.push(vertex);
      return [];
    }
    case "add_wall": {
      if (!exactKeys(parameters, ["level_id", "wall"])) return [error("geometry_command_parameters_invalid")];
      const wall = parseWall(parameters.wall);
      if (!wall) return [error("geometry_command_wall_invalid")];
      level.walls.push(wall);
      return [];
    }
    case "split_wall": {
      if (!exactKeys(parameters, ["level_id", "wall_id", "vertex", "first_wall_id", "second_wall_id"])) return [error("geometry_command_parameters_invalid")];
      const vertex = parseVertex(parameters.vertex);
      if (!safeId(parameters.wall_id) || !safeId(parameters.first_wall_id) || !safeId(parameters.second_wall_id) || !vertex) {
        return [error("geometry_command_split_invalid")];
      }
      const wallIndex = level.walls.findIndex((wall) => wall.id === parameters.wall_id);
      if (wallIndex < 0) return [error("geometry_command_wall_missing", parameters.wall_id)];
      const wall = level.walls[wallIndex];
      const start = level.vertices.find((item) => item.id === wall.start_vertex_id);
      const end = level.vertices.find((item) => item.id === wall.end_vertex_id);
      const horizontalInterior = start && end && start.y === end.y && vertex.y === start.y
        && vertex.x > Math.min(start.x, end.x) && vertex.x < Math.max(start.x, end.x);
      const verticalInterior = start && end && start.x === end.x && vertex.x === start.x
        && vertex.y > Math.min(start.y, end.y) && vertex.y < Math.max(start.y, end.y);
      const conflictingWallId = level.walls.some((item, index) => index !== wallIndex
        && (item.id === parameters.first_wall_id || item.id === parameters.second_wall_id));
      const conflictingVertex = level.vertices.some((item) => item.id === vertex.id || (item.x === vertex.x && item.y === vertex.y));
      if ((!horizontalInterior && !verticalInterior)
        || parameters.first_wall_id === parameters.second_wall_id || conflictingWallId || conflictingVertex) {
        return [error("geometry_command_split_invalid", parameters.wall_id)];
      }
      const splitDistance = Math.abs(vertex.x - start.x) + Math.abs(vertex.y - start.y);
      const dependentOpenings = level.openings.filter((opening) => opening.wall_id === wall.id);
      if (dependentOpenings.some((opening) => opening.offset < splitDistance && opening.offset + opening.width > splitDistance)) {
        return [error("geometry_command_split_crosses_opening", parameters.wall_id)];
      }
      level.vertices.push(vertex);
      level.walls.splice(wallIndex, 1,
        { ...wall, id: parameters.first_wall_id, end_vertex_id: vertex.id, source_icon_id: null },
        { ...wall, id: parameters.second_wall_id, start_vertex_id: vertex.id, source_icon_id: null });
      for (const opening of dependentOpenings) {
        if (opening.offset >= splitDistance) {
          opening.wall_id = parameters.second_wall_id;
          opening.offset -= splitDistance;
        } else {
          opening.wall_id = parameters.first_wall_id;
        }
      }
      insertSplitVertexInZoneRegions(level.zone_regions, wall.start_vertex_id, wall.end_vertex_id, vertex.id);
      return [];
    }
    case "move_vertex": {
      if (!exactKeys(parameters, ["level_id", "vertex_id", "x", "y"])
        || !safeId(parameters.vertex_id) || !safeInteger(parameters.x) || !safeInteger(parameters.y)) {
        return [error("geometry_command_parameters_invalid")];
      }
      const vertex = level.vertices.find((item) => item.id === parameters.vertex_id);
      if (!vertex) return [error("geometry_command_vertex_missing", parameters.vertex_id)];
      vertex.x = parameters.x;
      vertex.y = parameters.y;
      return [];
    }
    case "move_vertices": {
      if (!exactKeys(parameters, ["level_id", "vertices"])) {
        return [error("geometry_command_parameters_invalid")];
      }
      const moves = parseVertexMoves(parameters.vertices);
      if (!moves) return [error("geometry_command_vertex_batch_invalid")];
      const vertices = new Map(level.vertices.map((vertex) => [vertex.id, vertex]));
      const missing = moves.find((move) => !vertices.has(move.vertex_id));
      if (missing) return [error("geometry_command_vertex_missing", missing.vertex_id)];
      for (const move of moves) {
        const vertex = vertices.get(move.vertex_id)!;
        vertex.x = move.x;
        vertex.y = move.y;
      }
      return [];
    }
    case "delete_wall": {
      if (!exactKeys(parameters, ["level_id", "wall_id"]) || !safeId(parameters.wall_id)) return [error("geometry_command_parameters_invalid")];
      if (level.openings.some((opening) => opening.wall_id === parameters.wall_id)) return [error("geometry_command_wall_has_openings", parameters.wall_id)];
      const wall = level.walls.find((item) => item.id === parameters.wall_id);
      if (wall && level.zone_regions.some((region) => zoneRegionUsesWall(region, wall.start_vertex_id, wall.end_vertex_id))) {
        return [error("geometry_command_wall_bounds_zone", parameters.wall_id)];
      }
      const before = level.walls.length;
      level.walls = level.walls.filter((wall) => wall.id !== parameters.wall_id);
      return before === level.walls.length ? [error("geometry_command_wall_missing", parameters.wall_id)] : [];
    }
    case "create_zone_region": {
      if (!exactKeys(parameters, ["level_id", "zone_region"])) return [error("geometry_command_parameters_invalid")];
      const region = parseZoneRegion(parameters.zone_region);
      if (!region) return [error("geometry_command_zone_invalid")];
      level.zone_regions.push(region);
      return reconcileOpeningAdjacency(level);
    }
    case "partition_zone_region": {
      if (!exactKeys(parameters, ["level_id", "source_region_id", "source_outer_vertex_ids", "new_zone_region"])) {
        return [error("geometry_command_parameters_invalid")];
      }
      const sourceOuterVertexIds = parseUniqueIds(parameters.source_outer_vertex_ids, 3);
      const newRegion = parseZoneRegion(parameters.new_zone_region);
      if (!safeId(parameters.source_region_id) || !sourceOuterVertexIds || !newRegion) {
        return [error("geometry_command_zone_partition_invalid")];
      }
      const source = level.zone_regions.find((region) => region.id === parameters.source_region_id);
      if (!source) return [error("geometry_command_zone_missing", parameters.source_region_id)];
      if (level.zone_regions.some((region) => region.id === newRegion.id || region.semantic_zone_id === newRegion.semantic_zone_id)
        || source.semantic_zone_id === newRegion.semantic_zone_id
        || !zoneBoundaryHasWalls(level, sourceOuterVertexIds)
        || !zoneBoundaryHasWalls(level, newRegion.outer_vertex_ids)
        || !partitionBoundariesMatch(source.outer_vertex_ids, sourceOuterVertexIds, newRegion.outer_vertex_ids)) {
        return [error("geometry_command_zone_partition_invalid", source.id)];
      }
      source.outer_vertex_ids = sourceOuterVertexIds;
      level.zone_regions.push(newRegion);
      return reconcileOpeningAdjacency(level);
    }
    case "merge_zone_regions": {
      if (!exactKeys(parameters, ["level_id", "kept_region_id", "removed_region_id", "merged_outer_vertex_ids", "removed_wall_ids"])) {
        return [error("geometry_command_parameters_invalid")];
      }
      const mergedOuterVertexIds = parseUniqueIds(parameters.merged_outer_vertex_ids, 3);
      const removedWallIds = parseUniqueIds(parameters.removed_wall_ids, 1);
      if (!safeId(parameters.kept_region_id) || !safeId(parameters.removed_region_id)
        || parameters.kept_region_id === parameters.removed_region_id || !mergedOuterVertexIds || !removedWallIds) {
        return [error("geometry_command_zone_merge_invalid")];
      }
      const kept = level.zone_regions.find((region) => region.id === parameters.kept_region_id);
      const removed = level.zone_regions.find((region) => region.id === parameters.removed_region_id);
      if (!kept || !removed) return [error("geometry_command_zone_missing")];
      const keptEdges = new Set(zoneEdgeKeys(kept.outer_vertex_ids));
      const removedEdges = new Set(zoneEdgeKeys(removed.outer_vertex_ids));
      const sharedEdges = [...keptEdges].filter((edge) => removedEdges.has(edge));
      const sharedWallIds = sharedEdges.map((edge) => level.walls.find((wall) => (
        undirectedEdgeKey(wall.start_vertex_id, wall.end_vertex_id) === edge
      ))?.id).filter((wallId): wallId is string => Boolean(wallId)).sort();
      if (!sharedEdges.length || sharedWallIds.length !== sharedEdges.length
        || !sameStringSet(sharedWallIds, removedWallIds)
        || !mergeBoundariesMatch(kept.outer_vertex_ids, removed.outer_vertex_ids, mergedOuterVertexIds)
        || !zoneBoundaryHasWalls(level, mergedOuterVertexIds)) {
        return [error("geometry_command_zone_merge_invalid", kept.id)];
      }
      if (level.openings.some((opening) => removedWallIds.includes(opening.wall_id))) {
        return [error("geometry_command_zone_merge_boundary_has_opening", removed.id)];
      }
      if (level.flow_path_anchors.some((anchor) => anchor.from_zone_id === removed.semantic_zone_id || anchor.to_zone_id === removed.semantic_zone_id)) {
        return [error("geometry_command_zone_flow_path_conflict", removed.id)];
      }
      kept.outer_vertex_ids = mergedOuterVertexIds;
      level.zone_regions = level.zone_regions.filter((region) => region.id !== removed.id);
      level.walls = level.walls.filter((wall) => !removedWallIds.includes(wall.id));
      return reconcileOpeningAdjacency(level);
    }
    case "copy_level_construction": {
      if (!exactKeys(parameters, ["level_id", "source_level_id", "vertex_id_map", "wall_id_map", "opening_id_map"])
        || !safeId(parameters.source_level_id) || parameters.source_level_id === level.id) {
        return [error("geometry_command_level_copy_invalid")];
      }
      const source = findLevel(geometry, parameters.source_level_id);
      if (!source) return [error("geometry_command_level_missing", parameters.source_level_id)];
      if (!levelIsEmptyConstructionTarget(level, geometry)) return [error("geometry_command_level_copy_target_not_empty", level.id)];
      if (source.walls.length === 0
        || source.vertices.length > MAX_LEVEL_COPY_VERTICES
        || source.walls.length > MAX_LEVEL_COPY_WALLS
        || source.openings.length > MAX_LEVEL_COPY_OPENINGS) {
        return [error("geometry_command_level_copy_invalid", source.id)];
      }
      const vertexMappings = parseIdMappings(parameters.vertex_id_map, source.vertices.length, MAX_LEVEL_COPY_VERTICES);
      const wallMappings = parseIdMappings(parameters.wall_id_map, source.walls.length, MAX_LEVEL_COPY_WALLS);
      const openingMappings = parseIdMappings(parameters.opening_id_map, source.openings.length, MAX_LEVEL_COPY_OPENINGS);
      if (!vertexMappings || !wallMappings || !openingMappings
        || !sameStringSet(vertexMappings.map((item) => item.source_id), source.vertices.map((item) => item.id))
        || !sameStringSet(wallMappings.map((item) => item.source_id), source.walls.map((item) => item.id))
        || !sameStringSet(openingMappings.map((item) => item.source_id), source.openings.map((item) => item.id))) {
        return [error("geometry_command_level_copy_mapping_invalid", source.id)];
      }
      const targetIds = [
        ...vertexMappings.map((item) => item.target_id),
        ...wallMappings.map((item) => item.target_id),
        ...openingMappings.map((item) => item.target_id),
      ];
      const existingIds = geometryObjectIds(geometry);
      if (new Set(targetIds).size !== targetIds.length || targetIds.some((id) => existingIds.has(id))) {
        return [error("geometry_command_level_copy_id_conflict", level.id)];
      }
      const vertexIdMap = new Map(vertexMappings.map((item) => [item.source_id, item.target_id]));
      const wallIdMap = new Map(wallMappings.map((item) => [item.source_id, item.target_id]));
      const openingIdMap = new Map(openingMappings.map((item) => [item.source_id, item.target_id]));
      level.vertices = source.vertices.map((vertex) => ({ ...vertex, id: vertexIdMap.get(vertex.id)! }));
      level.walls = source.walls.map((wall) => ({
        ...wall,
        id: wallIdMap.get(wall.id)!,
        start_vertex_id: vertexIdMap.get(wall.start_vertex_id)!,
        end_vertex_id: vertexIdMap.get(wall.end_vertex_id)!,
        source_icon_id: null,
      }));
      level.openings = source.openings.map((opening) => ({
        ...opening,
        id: openingIdMap.get(opening.id)!,
        wall_id: wallIdMap.get(opening.wall_id)!,
        adjacent_zone_ids: [],
      }));
      return [];
    }
    case "place_vertical_opening": {
      if (!exactKeys(parameters, ["level_id", "vertical_opening"])) return [error("geometry_command_parameters_invalid")];
      const opening = parseVerticalOpening(parameters.vertical_opening);
      if (!opening || ![opening.lower_level_id, opening.upper_level_id].includes(level.id)) {
        return [error("geometry_command_vertical_opening_invalid")];
      }
      geometry.vertical_openings.push(opening);
      return [];
    }
    case "remove_vertical_opening": {
      if (!exactKeys(parameters, ["level_id", "vertical_opening_id"]) || !safeId(parameters.vertical_opening_id)) {
        return [error("geometry_command_parameters_invalid")];
      }
      const opening = geometry.vertical_openings.find((item) => item.id === parameters.vertical_opening_id);
      if (!opening || ![opening.lower_level_id, opening.upper_level_id].includes(level.id)) {
        return [error("geometry_command_vertical_opening_missing", parameters.vertical_opening_id)];
      }
      if (geometry.vertical_flow_path_anchors.some((anchor) => anchor.vertical_opening_id === opening.id)) {
        return [error("geometry_command_vertical_opening_has_flow_path", opening.id)];
      }
      geometry.vertical_openings = geometry.vertical_openings.filter((item) => item.id !== opening.id);
      return [];
    }
    case "link_vertical_flow_path": {
      if (!exactKeys(parameters, ["level_id", "vertical_flow_path_anchor"])) return [error("geometry_command_parameters_invalid")];
      const anchor = parseVerticalFlowPathAnchor(parameters.vertical_flow_path_anchor);
      const opening = anchor ? geometry.vertical_openings.find((item) => item.id === anchor.vertical_opening_id) : null;
      if (!anchor || !opening || ![opening.lower_level_id, opening.upper_level_id].includes(level.id)) {
        return [error("geometry_command_vertical_flow_path_invalid")];
      }
      geometry.vertical_flow_path_anchors.push(anchor);
      return [];
    }
    case "unlink_vertical_flow_path": {
      if (!exactKeys(parameters, ["level_id", "vertical_flow_path_anchor_id"]) || !safeId(parameters.vertical_flow_path_anchor_id)) {
        return [error("geometry_command_parameters_invalid")];
      }
      const anchor = geometry.vertical_flow_path_anchors.find((item) => item.id === parameters.vertical_flow_path_anchor_id);
      const opening = anchor ? geometry.vertical_openings.find((item) => item.id === anchor.vertical_opening_id) : null;
      if (!anchor || !opening || ![opening.lower_level_id, opening.upper_level_id].includes(level.id)) {
        return [error("geometry_command_vertical_flow_path_missing", parameters.vertical_flow_path_anchor_id)];
      }
      geometry.vertical_flow_path_anchors = geometry.vertical_flow_path_anchors.filter((item) => item.id !== anchor.id);
      return [];
    }
    case "place_opening": {
      if (!exactKeys(parameters, ["level_id", "opening"])) return [error("geometry_command_parameters_invalid")];
      const opening = parseOpening(parameters.opening);
      if (!opening) return [error("geometry_command_opening_invalid")];
      level.openings.push(opening);
      return [];
    }
    case "update_opening": {
      if (!exactKeys(parameters, ["level_id", "opening_id", "offset", "width"])
        || !safeId(parameters.opening_id) || !safeInteger(parameters.offset, 0) || !safeInteger(parameters.width, 1)) {
        return [error("geometry_command_parameters_invalid")];
      }
      const opening = level.openings.find((item) => item.id === parameters.opening_id);
      if (!opening) return [error("geometry_command_opening_missing", parameters.opening_id)];
      opening.offset = parameters.offset;
      opening.width = parameters.width;
      return [];
    }
    case "remove_opening": {
      if (!exactKeys(parameters, ["level_id", "opening_id"]) || !safeId(parameters.opening_id)) return [error("geometry_command_parameters_invalid")];
      if (level.flow_path_anchors.some((anchor) => anchor.opening_id === parameters.opening_id)) {
        return [error("geometry_command_opening_has_flow_path", parameters.opening_id)];
      }
      const before = level.openings.length;
      level.openings = level.openings.filter((opening) => opening.id !== parameters.opening_id);
      return before === level.openings.length ? [error("geometry_command_opening_missing", parameters.opening_id)] : [];
    }
    case "link_flow_path": {
      if (!exactKeys(parameters, ["level_id", "flow_path_anchor"])) return [error("geometry_command_parameters_invalid")];
      const anchor = parseFlowPathAnchor(parameters.flow_path_anchor);
      if (!anchor) return [error("geometry_command_flow_path_invalid")];
      level.flow_path_anchors.push(anchor);
      return [];
    }
    case "unlink_flow_path": {
      if (!exactKeys(parameters, ["level_id", "flow_path_anchor_id"]) || !safeId(parameters.flow_path_anchor_id)) {
        return [error("geometry_command_parameters_invalid")];
      }
      const before = level.flow_path_anchors.length;
      level.flow_path_anchors = level.flow_path_anchors.filter((anchor) => anchor.id !== parameters.flow_path_anchor_id);
      return before === level.flow_path_anchors.length ? [error("geometry_command_flow_path_missing", parameters.flow_path_anchor_id)] : [];
    }
    case "set_plan_underlay": {
      if (!exactKeys(parameters, ["level_id", "underlay"]) || level.underlays.length !== 0) {
        return [error("geometry_command_underlay_conflict", level.id)];
      }
      const underlay = parsePlanUnderlay(parameters.underlay);
      if (!underlay || geometryObjectIds(geometry).has(underlay.id)) {
        return [error("geometry_command_underlay_invalid", underlay?.id ?? null)];
      }
      level.underlays.push(underlay);
      return [];
    }
    case "update_plan_underlay": {
      if (!exactKeys(parameters, ["level_id", "underlay"])) return [error("geometry_command_parameters_invalid")];
      const underlay = parsePlanUnderlay(parameters.underlay);
      const current = underlay ? level.underlays.find((item) => item.id === underlay.id) : null;
      if (!underlay || !current
        || current.resource_id !== underlay.resource_id
        || current.sha256.toLowerCase() !== underlay.sha256.toLowerCase()
        || current.mime_type !== underlay.mime_type
        || current.display_name !== underlay.display_name) {
        return [error("geometry_command_underlay_identity_invalid", underlay?.id ?? null)];
      }
      level.underlays = [underlay];
      return [];
    }
    case "remove_plan_underlay": {
      if (!exactKeys(parameters, ["level_id", "underlay_id"]) || !safeId(parameters.underlay_id)) {
        return [error("geometry_command_parameters_invalid")];
      }
      const before = level.underlays.length;
      level.underlays = level.underlays.filter((item) => item.id !== parameters.underlay_id);
      return before === level.underlays.length ? [error("geometry_command_underlay_missing", parameters.underlay_id)] : [];
    }
  }
}

export function previewGeometryCommand(geometry: BuildingGeometry, command: GeometryEditCommand): GeometryCommandResult {
  if (command.schema_version !== GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION
    || !safeId(command.command_id) || !Number.isSafeInteger(command.sequence) || command.sequence < 1
    || !safeId(command.project_session_id) || !safeId(command.geometry_id) || !safeId(command.baseline_revision_id)
    || !GEOMETRY_HASH_PATTERN.test(command.baseline_geometry_hash)
    || !["user", "ai_suggestion", "system"].includes(command.actor)) {
    return reject(command, geometry, "geometry_command_contract_invalid");
  }
  if (geometry.status !== "available" || geometry.capabilities.geometry_editing !== "studio_draft") {
    return reject(command, geometry, "geometry_command_read_only");
  }
  if (command.project_session_id !== geometry.project_session_id || command.geometry_id !== geometry.geometry_id) {
    return reject(command, geometry, "geometry_command_identity_stale");
  }
  if (command.baseline_revision_id !== geometry.revision_id || command.sequence !== geometry.geometry_revision + 1) {
    return reject(command, geometry, "geometry_command_revision_stale");
  }
  const beforeHash = geometrySha256(geometry);
  if (command.baseline_geometry_hash.toLowerCase() !== beforeHash) {
    return reject(command, geometry, "geometry_command_hash_stale");
  }

  const candidate = cloneBuildingGeometry(geometry);
  const operationDiagnostics = applyOperation(command, candidate);
  if (operationDiagnostics.length) return { status: "rejected", command, geometry, diagnostics: operationDiagnostics };
  candidate.geometry_revision = command.sequence;
  const validation = validateBuildingGeometry(candidate, {
    expectedProjectSessionId: command.project_session_id,
    expectedRevisionId: command.baseline_revision_id,
  });
  if (validation.status !== "valid") {
    return {
      status: "rejected",
      command,
      geometry,
      diagnostics: validation.diagnostics.filter((item) => item.severity === "error"),
    };
  }
  return {
    status: "ready",
    command,
    before: geometry,
    after: candidate,
    geometry_hash: validation.geometry_hash,
    diagnostics: validation.diagnostics.filter((item) => item.severity === "warning"),
  };
}
