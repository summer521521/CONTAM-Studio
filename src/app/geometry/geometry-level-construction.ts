import type { BuildingGeometry, GeometryLevel } from "./geometry-model";

export const MAX_LEVEL_COPY_VERTICES = 10_000;
export const MAX_LEVEL_COPY_WALLS = 10_000;
export const MAX_LEVEL_COPY_OPENINGS = 5_000;

export interface GeometryIdMapping {
  source_id: string;
  target_id: string;
}

export interface CopyLevelConstructionOperation {
  operation: "copy_level_construction";
  parameters: {
    level_id: string;
    source_level_id: string;
    vertex_id_map: GeometryIdMapping[];
    wall_id_map: GeometryIdMapping[];
    opening_id_map: GeometryIdMapping[];
  };
}

export type LevelConstructionCopyPlan =
  | {
    status: "ready";
    sourceLevel: GeometryLevel;
    targetLevel: GeometryLevel;
    operation: CopyLevelConstructionOperation;
    copiedCounts: { vertices: number; walls: number; openings: number };
  }
  | { status: "unchanged" | "blocked"; diagnosticCode: string };

function safeId(value: string): boolean {
  return value.length > 0 && value.length <= 128;
}

export function levelIsEmptyConstructionTarget(level: GeometryLevel, geometry?: BuildingGeometry): boolean {
  return level.vertices.length === 0 && level.walls.length === 0 && level.openings.length === 0
    && level.zone_regions.length === 0 && level.flow_path_anchors.length === 0
    && (!geometry || !geometry.vertical_openings.some((opening) => (
      opening.lower_level_id === level.id || opening.upper_level_id === level.id
    )));
}

export function semanticObjectBelongsToGeometryLevel(
  objectLevelNumber: unknown,
  activeLevelNumber: number,
  levelCount: number,
): boolean {
  if (levelCount <= 1) return true;
  return typeof objectLevelNumber === "number"
    && Number.isSafeInteger(objectLevelNumber)
    && objectLevelNumber === activeLevelNumber;
}

function allGeometryIds(geometry: BuildingGeometry): Set<string> {
  return new Set(geometry.levels.flatMap((level) => [
    level.id,
    ...level.vertices.map((item) => item.id),
    ...level.walls.map((item) => item.id),
    ...level.openings.map((item) => item.id),
    ...level.zone_regions.map((item) => item.id),
    ...level.flow_path_anchors.map((item) => item.id),
  ]).concat(
    geometry.vertical_openings.map((item) => item.id),
    geometry.vertical_flow_path_anchors.map((item) => item.id),
  ));
}

function buildIdMap(
  sourceIds: readonly string[],
  kind: "vertex" | "wall" | "opening",
  idFactory: (kind: "vertex" | "wall" | "opening", sourceId: string) => string,
  unavailableIds: Set<string>,
): GeometryIdMapping[] | null {
  const mappings: GeometryIdMapping[] = [];
  for (const sourceId of sourceIds) {
    const targetId = idFactory(kind, sourceId);
    if (!safeId(targetId) || unavailableIds.has(targetId)) return null;
    unavailableIds.add(targetId);
    mappings.push({ source_id: sourceId, target_id: targetId });
  }
  return mappings;
}

export function planLevelConstructionCopy(
  geometry: BuildingGeometry,
  sourceLevelId: string,
  targetLevelId: string,
  idFactory: (kind: "vertex" | "wall" | "opening", sourceId: string) => string,
): LevelConstructionCopyPlan {
  if (sourceLevelId === targetLevelId) return { status: "unchanged", diagnosticCode: "geometry_level_copy_same_level" };
  const sourceLevel = geometry.levels.find((level) => level.id === sourceLevelId);
  const targetLevel = geometry.levels.find((level) => level.id === targetLevelId);
  if (!sourceLevel || !targetLevel) return { status: "blocked", diagnosticCode: "geometry_level_copy_level_missing" };
  if (!levelIsEmptyConstructionTarget(targetLevel, geometry)) return { status: "blocked", diagnosticCode: "geometry_level_copy_target_not_empty" };
  if (sourceLevel.walls.length === 0) return { status: "unchanged", diagnosticCode: "geometry_level_copy_source_empty" };
  if (sourceLevel.vertices.length > MAX_LEVEL_COPY_VERTICES
    || sourceLevel.walls.length > MAX_LEVEL_COPY_WALLS
    || sourceLevel.openings.length > MAX_LEVEL_COPY_OPENINGS) {
    return { status: "blocked", diagnosticCode: "geometry_level_copy_limit_exceeded" };
  }

  const unavailableIds = allGeometryIds(geometry);
  const vertexIdMap = buildIdMap(sourceLevel.vertices.map((item) => item.id), "vertex", idFactory, unavailableIds);
  const wallIdMap = buildIdMap(sourceLevel.walls.map((item) => item.id), "wall", idFactory, unavailableIds);
  const openingIdMap = buildIdMap(sourceLevel.openings.map((item) => item.id), "opening", idFactory, unavailableIds);
  if (!vertexIdMap || !wallIdMap || !openingIdMap) {
    return { status: "blocked", diagnosticCode: "geometry_level_copy_id_invalid" };
  }
  return {
    status: "ready",
    sourceLevel,
    targetLevel,
    copiedCounts: {
      vertices: vertexIdMap.length,
      walls: wallIdMap.length,
      openings: openingIdMap.length,
    },
    operation: {
      operation: "copy_level_construction",
      parameters: {
        level_id: targetLevel.id,
        source_level_id: sourceLevel.id,
        vertex_id_map: vertexIdMap,
        wall_id_map: wallIdMap,
        opening_id_map: openingIdMap,
      },
    },
  };
}
