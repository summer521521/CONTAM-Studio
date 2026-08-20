import type {
  GeometryLevel,
  GeometryOpening,
  GeometryVertex,
  GeometryWall,
} from "./geometry-model";
import { MAX_GEOMETRY_COORDINATE } from "./geometry-validation";

export const WALL_TOPOLOGY_SNAP_MM = 250;
export const MAX_WALL_DRAW_INTERSECTIONS = 64;
export const MAX_WALL_DRAW_OPERATIONS = 256;

export interface GeometryMetricPoint {
  x: number;
  y: number;
}

interface IndexedWall {
  wall: GeometryWall;
  start: GeometryVertex;
  end: GeometryVertex;
  orientation: "horizontal" | "vertical";
  axisPosition: number;
  minimum: number;
  maximum: number;
}

export interface GeometrySplitWallOperation {
  operation: "split_wall";
  parameters: {
    level_id: string;
    wall_id: string;
    vertex: GeometryVertex;
    first_wall_id: string;
    second_wall_id: string;
  };
}

export interface GeometryAddVertexOperation {
  operation: "add_vertex";
  parameters: { level_id: string; vertex: GeometryVertex };
}

export interface GeometryAddWallOperation {
  operation: "add_wall";
  parameters: { level_id: string; wall: GeometryWall };
}

export type WallTopologyOperation = GeometrySplitWallOperation | GeometryAddVertexOperation | GeometryAddWallOperation;

export interface WallTopologyContext {
  levelId: string;
  vertices: readonly GeometryVertex[];
  walls: readonly GeometryWall[];
  openings: readonly GeometryOpening[];
  verticesByCoordinate: ReadonlyMap<string, GeometryVertex>;
  wallsById: ReadonlyMap<string, IndexedWall>;
  horizontalByAxis: ReadonlyMap<number, readonly IndexedWall[]>;
  verticalByAxis: ReadonlyMap<number, readonly IndexedWall[]>;
  horizontalSorted: readonly IndexedWall[];
  verticalSorted: readonly IndexedWall[];
  openingsByWall: ReadonlyMap<string, readonly GeometryOpening[]>;
  allIds: ReadonlySet<string>;
  baselineDiagnosticCode: string | null;
}

export type WallSplitPlan =
  | {
    status: "ready";
    point: GeometryMetricPoint;
    operation: GeometrySplitWallOperation;
    movedOpeningCount: number;
    affectedZoneCount: number;
  }
  | {
    status: "unchanged";
    point: GeometryMetricPoint;
    diagnosticCode: string;
  }
  | {
    status: "blocked";
    point: GeometryMetricPoint;
    diagnosticCode: string;
  };

export type WallDrawPlan =
  | {
    status: "ready";
    start: GeometryMetricPoint;
    end: GeometryMetricPoint;
    intersections: GeometryMetricPoint[];
    segments: Array<{ id: string; start: GeometryMetricPoint; end: GeometryMetricPoint }>;
    operations: WallTopologyOperation[];
    selectAfterWallId: string;
  }
  | {
    status: "unchanged";
    start: GeometryMetricPoint;
    end: GeometryMetricPoint;
    intersections: GeometryMetricPoint[];
    diagnosticCode: string;
  }
  | {
    status: "blocked";
    start: GeometryMetricPoint;
    end: GeometryMetricPoint;
    intersections: GeometryMetricPoint[];
    diagnosticCode: string;
  };

type IdFactory = (prefix: "vertex" | "wall") => string;

function coordinateKey(point: GeometryMetricPoint): string {
  return `${point.x}:${point.y}`;
}

function snappedCoordinate(value: number, increment: number): number {
  const snapped = Math.round(value / increment) * increment;
  return Object.is(snapped, -0) ? 0 : snapped;
}

function snapPoint(point: GeometryMetricPoint, increment: number): GeometryMetricPoint {
  return { x: snappedCoordinate(point.x, increment), y: snappedCoordinate(point.y, increment) };
}

function safePoint(point: GeometryMetricPoint): boolean {
  return Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)
    && Math.abs(point.x) <= MAX_GEOMETRY_COORDINATE
    && Math.abs(point.y) <= MAX_GEOMETRY_COORDINATE;
}

function safeGeneratedId(value: string): boolean {
  return value.length > 0 && value.length <= 128;
}

function indexWall(wall: GeometryWall, verticesById: ReadonlyMap<string, GeometryVertex>): IndexedWall | null {
  const start = verticesById.get(wall.start_vertex_id);
  const end = verticesById.get(wall.end_vertex_id);
  if (!start || !end) return null;
  if (start.y === end.y && start.x !== end.x) {
    return {
      wall, start, end, orientation: "horizontal", axisPosition: start.y,
      minimum: Math.min(start.x, end.x), maximum: Math.max(start.x, end.x),
    };
  }
  if (start.x === end.x && start.y !== end.y) {
    return {
      wall, start, end, orientation: "vertical", axisPosition: start.x,
      minimum: Math.min(start.y, end.y), maximum: Math.max(start.y, end.y),
    };
  }
  return null;
}

function addByAxis(map: Map<number, IndexedWall[]>, frame: IndexedWall): void {
  const items = map.get(frame.axisPosition);
  if (items) items.push(frame);
  else map.set(frame.axisPosition, [frame]);
}

export function createWallTopologyContext(level: GeometryLevel): WallTopologyContext {
  const verticesById = new Map(level.vertices.map((vertex) => [vertex.id, vertex]));
  const wallsById = new Map<string, IndexedWall>();
  const horizontalByAxis = new Map<number, IndexedWall[]>();
  const verticalByAxis = new Map<number, IndexedWall[]>();
  const horizontalSorted: IndexedWall[] = [];
  const verticalSorted: IndexedWall[] = [];
  let baselineDiagnosticCode: string | null = null;
  for (const wall of level.walls) {
    const frame = indexWall(wall, verticesById);
    if (!frame) {
      baselineDiagnosticCode = "geometry_wall_topology_baseline_invalid";
      break;
    }
    wallsById.set(wall.id, frame);
    if (frame.orientation === "horizontal") {
      horizontalSorted.push(frame);
      addByAxis(horizontalByAxis, frame);
    } else {
      verticalSorted.push(frame);
      addByAxis(verticalByAxis, frame);
    }
  }
  horizontalSorted.sort((left, right) => left.axisPosition - right.axisPosition || left.wall.id.localeCompare(right.wall.id));
  verticalSorted.sort((left, right) => left.axisPosition - right.axisPosition || left.wall.id.localeCompare(right.wall.id));
  const openingsByWall = new Map<string, GeometryOpening[]>();
  for (const opening of level.openings) {
    const items = openingsByWall.get(opening.wall_id);
    if (items) items.push(opening);
    else openingsByWall.set(opening.wall_id, [opening]);
  }
  return {
    levelId: level.id,
    vertices: level.vertices,
    walls: level.walls,
    openings: level.openings,
    verticesByCoordinate: new Map(level.vertices.map((vertex) => [coordinateKey(vertex), vertex])),
    wallsById,
    horizontalByAxis,
    verticalByAxis,
    horizontalSorted,
    verticalSorted,
    openingsByWall,
    allIds: new Set([
      level.id,
      ...level.vertices.map((item) => item.id),
      ...level.walls.map((item) => item.id),
      ...level.openings.map((item) => item.id),
      ...level.zone_regions.map((item) => item.id),
      ...level.flow_path_anchors.map((item) => item.id),
    ]),
    baselineDiagnosticCode,
  };
}

function contextIsCurrent(context: WallTopologyContext, level: GeometryLevel): boolean {
  return context.levelId === level.id && context.vertices === level.vertices
    && context.walls === level.walls && context.openings === level.openings;
}

function wallDistance(frame: IndexedWall, point: GeometryMetricPoint): number {
  return Math.abs(point.x - frame.start.x) + Math.abs(point.y - frame.start.y);
}

function pointIsInterior(frame: IndexedWall, point: GeometryMetricPoint): boolean {
  const coordinate = frame.orientation === "horizontal" ? point.x : point.y;
  return coordinate > frame.minimum && coordinate < frame.maximum
    && (frame.orientation === "horizontal" ? point.y === frame.axisPosition : point.x === frame.axisPosition);
}

function splitCrossesOpening(
  frame: IndexedWall,
  point: GeometryMetricPoint,
  openings: readonly GeometryOpening[],
): boolean {
  const distance = wallDistance(frame, point);
  return openings.some((opening) => opening.offset < distance && opening.offset + opening.width > distance);
}

function zoneUsesWall(level: GeometryLevel, frame: IndexedWall): number {
  return level.zone_regions.filter((region) => region.outer_vertex_ids.some((vertexId, index) => {
    const nextId = region.outer_vertex_ids[(index + 1) % region.outer_vertex_ids.length];
    return (vertexId === frame.wall.start_vertex_id && nextId === frame.wall.end_vertex_id)
      || (vertexId === frame.wall.end_vertex_id && nextId === frame.wall.start_vertex_id);
  })).length;
}

function splitOperation(
  level: GeometryLevel,
  frame: IndexedWall,
  point: GeometryMetricPoint,
  vertexId: string,
  secondWallId: string,
): GeometrySplitWallOperation {
  return {
    operation: "split_wall",
    parameters: {
      level_id: level.id,
      wall_id: frame.wall.id,
      vertex: { id: vertexId, ...point },
      first_wall_id: frame.wall.id,
      second_wall_id: secondWallId,
    },
  };
}

export function projectPointToWall(
  frame: Pick<IndexedWall, "orientation" | "axisPosition" | "minimum" | "maximum">,
  point: GeometryMetricPoint,
  snapIncrement = WALL_TOPOLOGY_SNAP_MM,
): GeometryMetricPoint {
  const snapped = snapPoint(point, snapIncrement);
  return frame.orientation === "horizontal"
    ? { x: Math.max(frame.minimum, Math.min(frame.maximum, snapped.x)), y: frame.axisPosition }
    : { x: frame.axisPosition, y: Math.max(frame.minimum, Math.min(frame.maximum, snapped.y)) };
}

export function planWallSplitWithContext(
  context: WallTopologyContext,
  level: GeometryLevel,
  wallId: string,
  requestedPoint: GeometryMetricPoint,
  idFactory: IdFactory,
  snapIncrement = WALL_TOPOLOGY_SNAP_MM,
): WallSplitPlan {
  const frame = context.wallsById.get(wallId);
  const point = frame ? projectPointToWall(frame, requestedPoint, snapIncrement) : snapPoint(requestedPoint, snapIncrement);
  const blocked = (diagnosticCode: string): WallSplitPlan => ({ status: "blocked", point, diagnosticCode });
  if (!Number.isSafeInteger(snapIncrement) || snapIncrement < 1 || !safePoint(point)) {
    return blocked("geometry_wall_split_coordinate_invalid");
  }
  if (!contextIsCurrent(context, level)) return blocked("geometry_wall_topology_context_stale");
  if (context.baselineDiagnosticCode) return blocked(context.baselineDiagnosticCode);
  if (!frame) return blocked("geometry_wall_split_wall_missing");
  if (!pointIsInterior(frame, point)) return { status: "unchanged", point, diagnosticCode: "geometry_wall_split_endpoint" };
  if (context.verticesByCoordinate.has(coordinateKey(point))) return blocked("geometry_wall_split_vertex_exists");
  if (splitCrossesOpening(frame, point, context.openingsByWall.get(wallId) ?? [])) {
    return blocked("geometry_wall_split_crosses_opening");
  }
  const vertexId = idFactory("vertex");
  const secondWallId = idFactory("wall");
  if (!safeGeneratedId(vertexId) || !safeGeneratedId(secondWallId)
    || vertexId === secondWallId || context.allIds.has(vertexId) || context.allIds.has(secondWallId)) {
    return blocked("geometry_wall_topology_id_invalid");
  }
  const splitDistance = wallDistance(frame, point);
  return {
    status: "ready",
    point,
    operation: splitOperation(level, frame, point, vertexId, secondWallId),
    movedOpeningCount: (context.openingsByWall.get(wallId) ?? []).filter((opening) => opening.offset >= splitDistance).length,
    affectedZoneCount: zoneUsesWall(level, frame),
  };
}

export function planWallSplit(
  level: GeometryLevel,
  wallId: string,
  requestedPoint: GeometryMetricPoint,
  idFactory: IdFactory,
  snapIncrement = WALL_TOPOLOGY_SNAP_MM,
): WallSplitPlan {
  return planWallSplitWithContext(createWallTopologyContext(level), level, wallId, requestedPoint, idFactory, snapIncrement);
}

function lowerBound(frames: readonly IndexedWall[], value: number): number {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].axisPosition < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function framesBetween(frames: readonly IndexedWall[], minimum: number, maximum: number): IndexedWall[] {
  const result: IndexedWall[] = [];
  for (let index = lowerBound(frames, minimum); index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame.axisPosition > maximum) break;
    result.push(frame);
  }
  return result;
}

function directedDistance(start: GeometryMetricPoint, end: GeometryMetricPoint, point: GeometryMetricPoint): number {
  const directionX = Math.sign(end.x - start.x);
  const directionY = Math.sign(end.y - start.y);
  return (point.x - start.x) * directionX + (point.y - start.y) * directionY;
}

export function planTopologyAwareWallDrawWithContext(
  context: WallTopologyContext,
  level: GeometryLevel,
  requestedStart: GeometryMetricPoint,
  requestedEnd: GeometryMetricPoint,
  idFactory: IdFactory,
  snapIncrement = WALL_TOPOLOGY_SNAP_MM,
): WallDrawPlan {
  const start = snapPoint(requestedStart, snapIncrement);
  const candidate = snapPoint(requestedEnd, snapIncrement);
  const end = Math.abs(candidate.x - start.x) >= Math.abs(candidate.y - start.y)
    ? { x: candidate.x, y: start.y }
    : { x: start.x, y: candidate.y };
  const blocked = (diagnosticCode: string, intersections: GeometryMetricPoint[] = []): WallDrawPlan => ({
    status: "blocked", start, end, intersections, diagnosticCode,
  });
  if (!Number.isSafeInteger(snapIncrement) || snapIncrement < 1 || !safePoint(start) || !safePoint(end)) {
    return blocked("geometry_wall_draw_coordinate_invalid");
  }
  if (start.x === end.x && start.y === end.y) {
    return { status: "unchanged", start, end, intersections: [], diagnosticCode: "geometry_wall_draw_zero_length" };
  }
  if (!contextIsCurrent(context, level)) return blocked("geometry_wall_topology_context_stale");
  if (context.baselineDiagnosticCode) return blocked(context.baselineDiagnosticCode);

  const orientation = start.y === end.y ? "horizontal" : "vertical";
  const axisPosition = orientation === "horizontal" ? start.y : start.x;
  const minimum = orientation === "horizontal" ? Math.min(start.x, end.x) : Math.min(start.y, end.y);
  const maximum = orientation === "horizontal" ? Math.max(start.x, end.x) : Math.max(start.y, end.y);
  const collinear = orientation === "horizontal"
    ? context.horizontalByAxis.get(axisPosition) ?? []
    : context.verticalByAxis.get(axisPosition) ?? [];
  const perpendicular = orientation === "horizontal"
    ? framesBetween(context.verticalSorted, minimum, maximum)
    : framesBetween(context.horizontalSorted, minimum, maximum);
  const intersectionsByCoordinate = new Map<string, { point: GeometryMetricPoint; frames: IndexedWall[] }>();
  const registerIntersection = (point: GeometryMetricPoint, frame: IndexedWall): void => {
    const key = coordinateKey(point);
    const existing = intersectionsByCoordinate.get(key);
    if (existing) existing.frames.push(frame);
    else intersectionsByCoordinate.set(key, { point, frames: [frame] });
  };

  for (const frame of collinear) {
    const overlapMinimum = Math.max(minimum, frame.minimum);
    const overlapMaximum = Math.min(maximum, frame.maximum);
    if (overlapMinimum < overlapMaximum) return blocked("geometry_wall_draw_collinear_overlap");
    if (overlapMinimum === overlapMaximum && overlapMinimum >= minimum && overlapMinimum <= maximum) {
      registerIntersection(
        orientation === "horizontal" ? { x: overlapMinimum, y: axisPosition } : { x: axisPosition, y: overlapMinimum },
        frame,
      );
    }
  }
  for (const frame of perpendicular) {
    if (axisPosition < frame.minimum || axisPosition > frame.maximum) continue;
    registerIntersection(
      orientation === "horizontal"
        ? { x: frame.axisPosition, y: axisPosition }
        : { x: axisPosition, y: frame.axisPosition },
      frame,
    );
  }

  const intersections = [...intersectionsByCoordinate.values()]
    .map((entry) => entry.point)
    .sort((left, right) => directedDistance(start, end, left) - directedDistance(start, end, right));
  if (intersections.length > MAX_WALL_DRAW_INTERSECTIONS) {
    return blocked("geometry_wall_draw_intersection_limit", intersections.slice(0, MAX_WALL_DRAW_INTERSECTIONS));
  }
  for (const entry of intersectionsByCoordinate.values()) {
    for (const frame of entry.frames) {
      if (!pointIsInterior(frame, entry.point)) continue;
      if (splitCrossesOpening(frame, entry.point, context.openingsByWall.get(frame.wall.id) ?? [])) {
        return blocked("geometry_wall_draw_split_crosses_opening", intersections);
      }
    }
  }

  const allocatedIds = new Set(context.allIds);
  let allocationFailed = false;
  const allocate = (prefix: "vertex" | "wall"): string => {
    const value = idFactory(prefix);
    if (!safeGeneratedId(value) || allocatedIds.has(value)) allocationFailed = true;
    allocatedIds.add(value);
    return value;
  };
  const pointIds = new Map<string, string>();
  const splitOperations: GeometrySplitWallOperation[] = [];
  const addVertexOperations: GeometryAddVertexOperation[] = [];
  const points = [start, ...intersections, end]
    .filter((point, index, items) => items.findIndex((candidatePoint) => coordinateKey(candidatePoint) === coordinateKey(point)) === index)
    .sort((left, right) => directedDistance(start, end, left) - directedDistance(start, end, right));

  for (const point of points) {
    const key = coordinateKey(point);
    const existingVertex = context.verticesByCoordinate.get(key);
    if (existingVertex) {
      pointIds.set(key, existingVertex.id);
      continue;
    }
    const crossingFrames = (intersectionsByCoordinate.get(key)?.frames ?? [])
      .filter((frame) => pointIsInterior(frame, point))
      .sort((left, right) => left.wall.id.localeCompare(right.wall.id));
    const vertexId = allocate("vertex");
    pointIds.set(key, vertexId);
    if (crossingFrames.length) {
      const frame = crossingFrames[0];
      splitOperations.push(splitOperation(level, frame, point, vertexId, allocate("wall")));
    } else {
      addVertexOperations.push({ operation: "add_vertex", parameters: { level_id: level.id, vertex: { id: vertexId, ...point } } });
    }
  }

  const segments: Array<{ id: string; start: GeometryMetricPoint; end: GeometryMetricPoint }> = [];
  const addWallOperations: GeometryAddWallOperation[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index];
    const segmentEnd = points[index + 1];
    const wallId = allocate("wall");
    segments.push({ id: wallId, start: segmentStart, end: segmentEnd });
    addWallOperations.push({
      operation: "add_wall",
      parameters: {
        level_id: level.id,
        wall: {
          id: wallId,
          start_vertex_id: pointIds.get(coordinateKey(segmentStart))!,
          end_vertex_id: pointIds.get(coordinateKey(segmentEnd))!,
          kind: "unknown",
          thickness: 160,
          source_icon_id: null,
        },
      },
    });
  }
  const operations: WallTopologyOperation[] = [...splitOperations, ...addVertexOperations, ...addWallOperations];
  if (allocationFailed) return blocked("geometry_wall_topology_id_invalid", intersections);
  if (!segments.length) return blocked("geometry_wall_draw_no_segment", intersections);
  if (operations.length > MAX_WALL_DRAW_OPERATIONS) return blocked("geometry_wall_draw_operation_limit", intersections);
  return {
    status: "ready",
    start,
    end,
    intersections,
    segments,
    operations,
    selectAfterWallId: segments.at(-1)!.id,
  };
}

export function planTopologyAwareWallDraw(
  level: GeometryLevel,
  start: GeometryMetricPoint,
  end: GeometryMetricPoint,
  idFactory: IdFactory,
  snapIncrement = WALL_TOPOLOGY_SNAP_MM,
): WallDrawPlan {
  return planTopologyAwareWallDrawWithContext(
    createWallTopologyContext(level), level, start, end, idFactory, snapIncrement,
  );
}
