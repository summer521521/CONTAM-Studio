import type {
  GeometryLevel,
  GeometryOpening,
  GeometryVertex,
  GeometryWall,
} from "./geometry-model";
import {
  DIRECT_MANIPULATION_SNAP_MM,
  type GeometryMetricPoint,
  type GeometryMoveVerticesOperation,
  type OrthogonalManipulationContext,
  createOrthogonalManipulationContext,
  planOrthogonalVertexMoveWithContext,
} from "./geometry-direct-manipulation";
import { MAX_GEOMETRY_COORDINATE } from "./geometry-validation";

export const OPENING_MANIPULATION_SNAP_MM = 50;

export interface GeometryWallFrame {
  wall: GeometryWall;
  start: GeometryVertex;
  end: GeometryVertex;
  orientation: "horizontal" | "vertical";
  length: number;
  axisPosition: number;
}

export type WallTranslationPlan =
  | {
    status: "ready";
    orientation: "horizontal" | "vertical";
    axisPosition: number;
    movedVertices: GeometryVertex[];
    operation: GeometryMoveVerticesOperation;
  }
  | {
    status: "unchanged";
    orientation: "horizontal" | "vertical" | null;
    axisPosition: number;
    movedVertices: GeometryVertex[];
    diagnosticCode: string;
  }
  | {
    status: "blocked";
    orientation: "horizontal" | "vertical" | null;
    axisPosition: number;
    movedVertices: GeometryVertex[];
    diagnosticCode: string;
  };

export interface GeometryUpdateOpeningOperation {
  operation: "update_opening";
  parameters: {
    level_id: string;
    opening_id: string;
    offset: number;
    width: number;
  };
}

export interface OpeningManipulationContext {
  levelId: string;
  vertices: readonly GeometryVertex[];
  walls: readonly GeometryWall[];
  openings: readonly GeometryOpening[];
  verticesById: ReadonlyMap<string, GeometryVertex>;
  wallsById: ReadonlyMap<string, GeometryWall>;
  openingsById: ReadonlyMap<string, GeometryOpening>;
  openingsByWall: ReadonlyMap<string, readonly GeometryOpening[]>;
}

export type OpeningUpdatePlan =
  | {
    status: "ready";
    opening: GeometryOpening;
    operation: GeometryUpdateOpeningOperation;
  }
  | {
    status: "unchanged";
    opening: GeometryOpening | null;
    diagnosticCode: string;
  }
  | {
    status: "blocked";
    opening: GeometryOpening | null;
    diagnosticCode: string;
  };

function snappedInteger(value: number, increment: number): number {
  const snapped = Math.round(value / increment) * increment;
  return Object.is(snapped, -0) ? 0 : snapped;
}

function safeDimension(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_GEOMETRY_COORDINATE;
}

function wallFrameFromMaps(
  wall: GeometryWall,
  vertices: ReadonlyMap<string, GeometryVertex>,
): GeometryWallFrame | null {
  const start = vertices.get(wall.start_vertex_id);
  const end = vertices.get(wall.end_vertex_id);
  if (!start || !end) return null;
  if (start.y === end.y && start.x !== end.x) {
    return { wall, start, end, orientation: "horizontal", length: Math.abs(end.x - start.x), axisPosition: start.y };
  }
  if (start.x === end.x && start.y !== end.y) {
    return { wall, start, end, orientation: "vertical", length: Math.abs(end.y - start.y), axisPosition: start.x };
  }
  return null;
}

export function geometryWallFrame(level: GeometryLevel, wallId: string): GeometryWallFrame | null {
  const wall = level.walls.find((item) => item.id === wallId);
  return wall ? wallFrameFromMaps(wall, new Map(level.vertices.map((vertex) => [vertex.id, vertex]))) : null;
}

/**
 * Moves a selected orthogonal wall only along its normal. The existing direct
 * manipulation graph propagates that axis through the collinear wall component,
 * so junctions remain connected and the gesture can commit as one move_vertices
 * command after full candidate validation.
 */
export function planOrthogonalWallTranslationWithContext(
  context: OrthogonalManipulationContext,
  level: GeometryLevel,
  wallId: string,
  requestedAxisPosition: number,
  snapIncrement = DIRECT_MANIPULATION_SNAP_MM,
): WallTranslationPlan {
  const frame = geometryWallFrame(level, wallId);
  const fallbackAxis = snappedInteger(requestedAxisPosition, Number.isSafeInteger(snapIncrement) && snapIncrement > 0 ? snapIncrement : 1);
  if (!frame) {
    return {
      status: "blocked",
      orientation: null,
      axisPosition: fallbackAxis,
      movedVertices: [],
      diagnosticCode: "geometry_wall_translation_wall_invalid",
    };
  }
  const target: GeometryMetricPoint = frame.orientation === "horizontal"
    ? { x: frame.start.x, y: requestedAxisPosition }
    : { x: requestedAxisPosition, y: frame.start.y };
  const plan = planOrthogonalVertexMoveWithContext(context, level, frame.start.id, target, snapIncrement);
  const axisPosition = frame.orientation === "horizontal" ? plan.target.y : plan.target.x;
  if (plan.status === "ready") {
    return { status: "ready", orientation: frame.orientation, axisPosition, movedVertices: plan.movedVertices, operation: plan.operation };
  }
  return {
    status: plan.status,
    orientation: frame.orientation,
    axisPosition,
    movedVertices: plan.movedVertices,
    diagnosticCode: plan.diagnosticCode,
  };
}

export function planOrthogonalWallTranslation(
  level: GeometryLevel,
  wallId: string,
  requestedAxisPosition: number,
  snapIncrement = DIRECT_MANIPULATION_SNAP_MM,
): WallTranslationPlan {
  return planOrthogonalWallTranslationWithContext(
    createOrthogonalManipulationContext(level),
    level,
    wallId,
    requestedAxisPosition,
    snapIncrement,
  );
}

export function createOpeningManipulationContext(level: GeometryLevel): OpeningManipulationContext {
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
    verticesById: new Map(level.vertices.map((vertex) => [vertex.id, vertex])),
    wallsById: new Map(level.walls.map((wall) => [wall.id, wall])),
    openingsById: new Map(level.openings.map((opening) => [opening.id, opening])),
    openingsByWall,
  };
}

export function planOpeningUpdateWithContext(
  context: OpeningManipulationContext,
  level: GeometryLevel,
  openingId: string,
  requested: { offset: number; width: number },
  snapIncrement = OPENING_MANIPULATION_SNAP_MM,
): OpeningUpdatePlan {
  if (context.levelId !== level.id || context.vertices !== level.vertices
    || context.walls !== level.walls || context.openings !== level.openings) {
    return { status: "blocked", opening: null, diagnosticCode: "geometry_opening_edit_context_stale" };
  }
  if (!Number.isSafeInteger(snapIncrement) || snapIncrement < 1
    || !Number.isFinite(requested.offset) || !Number.isFinite(requested.width)) {
    return { status: "blocked", opening: null, diagnosticCode: "geometry_opening_edit_value_invalid" };
  }
  const source = context.openingsById.get(openingId);
  if (!source) return { status: "blocked", opening: null, diagnosticCode: "geometry_opening_edit_missing" };
  const offset = snappedInteger(requested.offset, snapIncrement);
  const width = snappedInteger(requested.width, snapIncrement);
  const candidate = { ...source, adjacent_zone_ids: [...source.adjacent_zone_ids], offset, width };
  if (!safeDimension(offset) || !safeDimension(width) || width < 1) {
    return { status: "blocked", opening: candidate, diagnosticCode: "geometry_opening_edit_value_invalid" };
  }
  const wall = context.wallsById.get(source.wall_id);
  const frame = wall ? wallFrameFromMaps(wall, context.verticesById) : null;
  if (!frame) return { status: "blocked", opening: candidate, diagnosticCode: "geometry_opening_edit_wall_invalid" };
  if (offset + width > frame.length) {
    return { status: "blocked", opening: candidate, diagnosticCode: "geometry_opening_edit_out_of_bounds" };
  }
  const overlaps = (context.openingsByWall.get(source.wall_id) ?? []).some((opening) => (
    opening.id !== source.id
    && offset < opening.offset + opening.width
    && opening.offset < offset + width
  ));
  if (overlaps) return { status: "blocked", opening: candidate, diagnosticCode: "geometry_opening_edit_overlap" };
  if (offset === source.offset && width === source.width) {
    return { status: "unchanged", opening: candidate, diagnosticCode: "geometry_opening_edit_unchanged" };
  }
  return {
    status: "ready",
    opening: candidate,
    operation: {
      operation: "update_opening",
      parameters: { level_id: level.id, opening_id: source.id, offset, width },
    },
  };
}

export function planOpeningUpdate(
  level: GeometryLevel,
  openingId: string,
  requested: { offset: number; width: number },
  snapIncrement = OPENING_MANIPULATION_SNAP_MM,
): OpeningUpdatePlan {
  return planOpeningUpdateWithContext(
    createOpeningManipulationContext(level),
    level,
    openingId,
    requested,
    snapIncrement,
  );
}

export function projectedOpeningOffset(
  frame: GeometryWallFrame,
  openingWidth: number,
  point: GeometryMetricPoint,
): number {
  const directionX = (frame.end.x - frame.start.x) / frame.length;
  const directionY = (frame.end.y - frame.start.y) / frame.length;
  const projectedCenter = (point.x - frame.start.x) * directionX + (point.y - frame.start.y) * directionY;
  return Math.max(0, Math.min(frame.length - openingWidth, projectedCenter - openingWidth / 2));
}
