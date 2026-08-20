import type { GeometryLevel, GeometryVertex, GeometryWall } from "./geometry-model";
import { MAX_GEOMETRY_COORDINATE } from "./geometry-validation";

export const DIRECT_MANIPULATION_SNAP_MM = 250;
export const MAX_DIRECT_MANIPULATION_VERTICES = 128;
export const MAX_DIRECT_MANIPULATION_HANDLES = 256;

export interface GeometryMetricPoint {
  x: number;
  y: number;
}

export interface GeometryVertexMove {
  vertex_id: string;
  x: number;
  y: number;
}

export interface GeometryMoveVerticesOperation {
  operation: "move_vertices";
  parameters: {
    level_id: string;
    vertices: GeometryVertexMove[];
  };
}

export interface OrthogonalManipulationContext {
  levelId: string;
  vertices: readonly GeometryVertex[];
  verticesById: ReadonlyMap<string, GeometryVertex>;
  horizontalAdjacency: ReadonlyMap<string, readonly string[]>;
  verticalAdjacency: ReadonlyMap<string, readonly string[]>;
  baselineDiagnosticCode: string | null;
}

export type OrthogonalVertexMovePlan =
  | {
    status: "ready";
    target: GeometryMetricPoint;
    movedVertices: GeometryVertex[];
    operation: GeometryMoveVerticesOperation;
  }
  | {
    status: "unchanged";
    target: GeometryMetricPoint;
    movedVertices: GeometryVertex[];
    diagnosticCode: string;
  }
  | {
    status: "blocked";
    target: GeometryMetricPoint;
    movedVertices: GeometryVertex[];
    diagnosticCode: string;
  };

function snappedCoordinate(value: number, increment: number): number {
  const snapped = Math.round(value / increment) * increment;
  return Object.is(snapped, -0) ? 0 : snapped;
}

function safeCoordinate(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= MAX_GEOMETRY_COORDINATE;
}

function addAdjacent(adjacency: Map<string, string[]>, first: string, second: string): void {
  const firstItems = adjacency.get(first);
  if (firstItems) firstItems.push(second);
  else adjacency.set(first, [second]);
  const secondItems = adjacency.get(second);
  if (secondItems) secondItems.push(first);
  else adjacency.set(second, [first]);
}

function connectedVertices(
  startId: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
  limit: number,
): Set<string> {
  const connected = new Set([startId]);
  const queue = [startId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const adjacentId of adjacency.get(queue[cursor]) ?? []) {
      if (connected.has(adjacentId)) continue;
      connected.add(adjacentId);
      if (connected.size > limit) return connected;
      queue.push(adjacentId);
    }
  }
  return connected;
}

function classifyWall(
  wall: GeometryWall,
  vertices: ReadonlyMap<string, GeometryVertex>,
): "horizontal" | "vertical" | "invalid" {
  const start = vertices.get(wall.start_vertex_id);
  const end = vertices.get(wall.end_vertex_id);
  if (!start || !end || (start.x === end.x && start.y === end.y)) return "invalid";
  if (start.y === end.y) return "horizontal";
  if (start.x === end.x) return "vertical";
  return "invalid";
}

/**
 * Plans a metric corner edit without mutating the model. X changes propagate
 * through connected vertical walls and Y changes through connected horizontal
 * walls. This keeps every existing orthogonal wall orthogonal while allowing a
 * shared room corner to resize all affected boundaries as one atomic command.
 */
export function createOrthogonalManipulationContext(level: GeometryLevel): OrthogonalManipulationContext {
  const verticesById = new Map(level.vertices.map((vertex) => [vertex.id, vertex]));
  const horizontalAdjacency = new Map<string, string[]>();
  const verticalAdjacency = new Map<string, string[]>();
  let baselineDiagnosticCode: string | null = null;
  for (const wall of level.walls) {
    const orientation = classifyWall(wall, verticesById);
    if (orientation === "invalid") {
      baselineDiagnosticCode = "geometry_direct_move_baseline_invalid";
      break;
    }
    addAdjacent(
      orientation === "horizontal" ? horizontalAdjacency : verticalAdjacency,
      wall.start_vertex_id,
      wall.end_vertex_id,
    );
  }
  return {
    levelId: level.id,
    vertices: level.vertices,
    verticesById,
    horizontalAdjacency,
    verticalAdjacency,
    baselineDiagnosticCode,
  };
}

export function planOrthogonalVertexMoveWithContext(
  context: OrthogonalManipulationContext,
  level: GeometryLevel,
  vertexId: string,
  requestedTarget: GeometryMetricPoint,
  snapIncrement = DIRECT_MANIPULATION_SNAP_MM,
): OrthogonalVertexMovePlan {
  const target = {
    x: snappedCoordinate(requestedTarget.x, snapIncrement),
    y: snappedCoordinate(requestedTarget.y, snapIncrement),
  };
  const blocked = (diagnosticCode: string): OrthogonalVertexMovePlan => ({
    status: "blocked",
    target,
    movedVertices: [],
    diagnosticCode,
  });
  if (!Number.isSafeInteger(snapIncrement) || snapIncrement < 1
    || !safeCoordinate(target.x) || !safeCoordinate(target.y)) {
    return blocked("geometry_direct_move_coordinate_invalid");
  }

  if (context.levelId !== level.id || context.vertices !== level.vertices) {
    return blocked("geometry_direct_move_context_stale");
  }
  const selected = context.verticesById.get(vertexId);
  if (!selected) return blocked("geometry_direct_move_vertex_missing");
  if (context.baselineDiagnosticCode) return blocked(context.baselineDiagnosticCode);

  const traversalLimit = MAX_DIRECT_MANIPULATION_VERTICES;
  const xConnected = connectedVertices(vertexId, context.verticalAdjacency, traversalLimit);
  const yConnected = connectedVertices(vertexId, context.horizontalAdjacency, traversalLimit);
  if (xConnected.size > MAX_DIRECT_MANIPULATION_VERTICES
    || yConnected.size > MAX_DIRECT_MANIPULATION_VERTICES) {
    return blocked("geometry_direct_move_scope_too_large");
  }
  const movedVertices = level.vertices.flatMap((vertex) => {
    const next = {
      ...vertex,
      x: xConnected.has(vertex.id) ? target.x : vertex.x,
      y: yConnected.has(vertex.id) ? target.y : vertex.y,
    };
    return next.x === vertex.x && next.y === vertex.y ? [] : [next];
  });
  if (!movedVertices.length) {
    return { status: "unchanged", target, movedVertices, diagnosticCode: "geometry_direct_move_unchanged" };
  }
  if (movedVertices.length > MAX_DIRECT_MANIPULATION_VERTICES) {
    return blocked("geometry_direct_move_scope_too_large");
  }

  const positions = new Map(level.vertices.map((vertex) => [vertex.id, `${vertex.x}:${vertex.y}`]));
  for (const vertex of movedVertices) positions.set(vertex.id, `${vertex.x}:${vertex.y}`);
  if (new Set(positions.values()).size !== positions.size) {
    return blocked("geometry_direct_move_duplicate_vertex");
  }

  const operation: GeometryMoveVerticesOperation = {
    operation: "move_vertices",
    parameters: {
      level_id: level.id,
      vertices: movedVertices.map((vertex) => ({ vertex_id: vertex.id, x: vertex.x, y: vertex.y })),
    },
  };
  return { status: "ready", target, movedVertices, operation };
}

export function planOrthogonalVertexMove(
  level: GeometryLevel,
  vertexId: string,
  requestedTarget: GeometryMetricPoint,
  snapIncrement = DIRECT_MANIPULATION_SNAP_MM,
): OrthogonalVertexMovePlan {
  return planOrthogonalVertexMoveWithContext(
    createOrthogonalManipulationContext(level),
    level,
    vertexId,
    requestedTarget,
    snapIncrement,
  );
}

export function selectedVertexIds(
  level: GeometryLevel,
  selection: { kind: string; id: string } | null,
): string[] {
  if (!selection) return [];
  if (selection.kind === "vertex") {
    return level.vertices.some((vertex) => vertex.id === selection.id) ? [selection.id] : [];
  }
  if (selection.kind === "wall") {
    const wall = level.walls.find((item) => item.id === selection.id);
    return wall ? [wall.start_vertex_id, wall.end_vertex_id] : [];
  }
  if (selection.kind === "zone") {
    return [...(level.zone_regions.find((region) => region.id === selection.id)?.outer_vertex_ids
      .slice(0, MAX_DIRECT_MANIPULATION_HANDLES) ?? [])];
  }
  return [];
}
