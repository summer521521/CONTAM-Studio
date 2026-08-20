import type { AiDiagnostic, AiTokenUsageView } from "../ai-state";
import type { GeometryOperationInput } from "../runtime/useGeometryWorkbench";
import type { BuildingGeometry } from "./geometry-model";

export const GEOMETRY_AI_DRAFT_SCHEMA_VERSION = "geometry_ai_draft.v1" as const;
export const GEOMETRY_VISION_MODEL_ID = "gpt-5.6-luna" as const;

export interface GeometryAiDraft {
  schema_version: typeof GEOMETRY_AI_DRAFT_SCHEMA_VERSION;
  project_session_id: string;
  revision_id: string;
  baseline_geometry_hash: string;
  attachment_sha256: string;
  summary: string;
  observations: string[];
  measurement_basis: "explicit_dimensions" | "scaled_reference" | "visual_estimate" | "unknown";
  confidence_percent: number;
  assumptions: string[];
  warnings: string[];
  operations: GeometryOperationInput[];
}

export interface DesktopGeometryAiDraftResponse {
  request_id: string;
  status: "completed" | "error";
  model_id: string;
  reasoning_effort: string | null;
  draft: GeometryAiDraft | null;
  token_usage: AiTokenUsageView | null;
  error: AiDiagnostic | null;
}

export function geometryAiOperationIndices(draft: GeometryAiDraft): number[] {
  return draft.operations.map((_operation, index) => index);
}

export function selectGeometryAiOperations(
  draft: GeometryAiDraft,
  selectedIndices: readonly number[],
): GeometryOperationInput[] {
  const selected = new Set(
    selectedIndices.filter((index) => Number.isSafeInteger(index) && index >= 0 && index < draft.operations.length),
  );
  return draft.operations.filter((_operation, index) => selected.has(index));
}

export interface GeometryAiSelectionChange {
  selectedIndices: number[];
  autoIncludedIndices: number[];
  removedDependentIndices: number[];
}

interface GeometryAiOperationIndex {
  levelId: string;
  operation: GeometryOperationInput;
}

function operationLevelId(operation: GeometryOperationInput): string | null {
  return typeof operation.parameters.level_id === "string" ? operation.parameters.level_id : null;
}

function operationObject(operation: GeometryOperationInput, key: string): RecordValue | null {
  return record(operation.parameters[key]);
}

function operationString(operation: GeometryOperationInput, objectKey: string, field: string): string | null {
  const object = operationObject(operation, objectKey);
  return typeof object?.[field] === "string" ? object[field] : null;
}

function operationStringList(operation: GeometryOperationInput, objectKey: string, field: string): string[] {
  const object = operationObject(operation, objectKey);
  return Array.isArray(object?.[field])
    ? object[field].filter((value): value is string => typeof value === "string")
    : [];
}

function geometryLevelKey(levelId: string, objectId: string): string {
  return `${levelId}\u0000${objectId}`;
}

function geometryEdgeKey(startVertexId: string, endVertexId: string): string {
  return [startVertexId, endVertexId].sort().join("\u0000");
}

function operationIndexMaps(
  draft: GeometryAiDraft,
  geometry: BuildingGeometry,
): {
  operations: GeometryAiOperationIndex[];
  vertexProducers: Map<string, number>;
  wallProducers: Map<string, number>;
  wallEdgeProducers: Map<string, number>;
  existingVertices: Set<string>;
  existingWalls: Set<string>;
  existingWallEdges: Set<string>;
} {
  const operations = draft.operations.map((operation) => ({
    levelId: operationLevelId(operation) ?? "",
    operation,
  }));
  const vertexProducers = new Map<string, number>();
  const wallProducers = new Map<string, number>();
  const wallEdgeProducers = new Map<string, number>();
  const existingVertices = new Set<string>();
  const existingWalls = new Set<string>();
  const existingWallEdges = new Set<string>();

  for (const level of geometry.levels) {
    for (const vertex of level.vertices) existingVertices.add(geometryLevelKey(level.id, vertex.id));
    for (const wall of level.walls) {
      existingWalls.add(geometryLevelKey(level.id, wall.id));
      existingWallEdges.add(geometryLevelKey(level.id, geometryEdgeKey(wall.start_vertex_id, wall.end_vertex_id)));
    }
  }
  for (const [index, entry] of operations.entries()) {
    if (entry.operation.operation === "add_vertex") {
      const id = operationString(entry.operation, "vertex", "id");
      if (id) vertexProducers.set(geometryLevelKey(entry.levelId, id), index);
    } else if (entry.operation.operation === "add_wall") {
      const id = operationString(entry.operation, "wall", "id");
      const start = operationString(entry.operation, "wall", "start_vertex_id");
      const end = operationString(entry.operation, "wall", "end_vertex_id");
      if (id) wallProducers.set(geometryLevelKey(entry.levelId, id), index);
      if (start && end) wallEdgeProducers.set(geometryLevelKey(entry.levelId, geometryEdgeKey(start, end)), index);
    }
  }
  return { operations, vertexProducers, wallProducers, wallEdgeProducers, existingVertices, existingWalls, existingWallEdges };
}

function directOperationDependencies(
  draft: GeometryAiDraft,
  geometry: BuildingGeometry,
  index: number,
  maps = operationIndexMaps(draft, geometry),
): number[] {
  const entry = maps.operations[index];
  if (!entry) return [];
  const dependencies = new Set<number>();
  const addVertexDependency = (vertexId: string) => {
    if (maps.existingVertices.has(geometryLevelKey(entry.levelId, vertexId))) return;
    const producer = maps.vertexProducers.get(geometryLevelKey(entry.levelId, vertexId));
    if (producer !== undefined && producer !== index) dependencies.add(producer);
  };
  const addWallDependency = (wallId: string) => {
    if (maps.existingWalls.has(geometryLevelKey(entry.levelId, wallId))) return;
    const producer = maps.wallProducers.get(geometryLevelKey(entry.levelId, wallId));
    if (producer !== undefined && producer !== index) dependencies.add(producer);
  };

  if (entry.operation.operation === "add_wall") {
    const start = operationString(entry.operation, "wall", "start_vertex_id");
    const end = operationString(entry.operation, "wall", "end_vertex_id");
    if (start) addVertexDependency(start);
    if (end) addVertexDependency(end);
  } else if (entry.operation.operation === "create_zone_region") {
    const vertices = operationStringList(entry.operation, "zone_region", "outer_vertex_ids");
    for (const vertexId of vertices) addVertexDependency(vertexId);
    for (let offset = 0; offset < vertices.length; offset += 1) {
      const start = vertices[offset];
      const end = vertices[(offset + 1) % vertices.length];
      const producer = maps.wallEdgeProducers.get(geometryLevelKey(entry.levelId, geometryEdgeKey(start, end)));
      if (producer !== undefined && !maps.existingWallEdges.has(geometryLevelKey(entry.levelId, geometryEdgeKey(start, end)))) {
        dependencies.add(producer);
      }
    }
  } else if (entry.operation.operation === "place_opening") {
    const wallId = operationString(entry.operation, "opening", "wall_id");
    if (wallId) addWallDependency(wallId);
  }
  return [...dependencies].sort((left, right) => left - right);
}

export function geometryAiOperationDependencies(
  draft: GeometryAiDraft,
  geometry: BuildingGeometry,
  index: number,
): number[] {
  if (!Number.isSafeInteger(index) || index < 0 || index >= draft.operations.length) return [];
  const maps = operationIndexMaps(draft, geometry);
  const resolved = new Set<number>();
  const expanded = new Set<number>();
  const visiting = new Set<number>();
  const visit = (current: number) => {
    if (visiting.has(current) || expanded.has(current)) return;
    visiting.add(current);
    for (const dependency of directOperationDependencies(draft, geometry, current, maps)) {
      resolved.add(dependency);
      visit(dependency);
    }
    visiting.delete(current);
    expanded.add(current);
  };
  visit(index);
  resolved.delete(index);
  return [...resolved].sort((left, right) => left - right);
}

export function toggleGeometryAiOperationSelection(
  draft: GeometryAiDraft,
  geometry: BuildingGeometry,
  selectedIndices: readonly number[],
  index: number,
): GeometryAiSelectionChange {
  const validSelection = new Set(
    selectedIndices.filter((value) => Number.isSafeInteger(value) && value >= 0 && value < draft.operations.length),
  );
  if (!Number.isSafeInteger(index) || index < 0 || index >= draft.operations.length) {
    return { selectedIndices: [...validSelection].sort((left, right) => left - right), autoIncludedIndices: [], removedDependentIndices: [] };
  }
  if (validSelection.has(index)) {
    const removed = new Set([index]);
    for (const candidate of validSelection) {
      if (candidate !== index && geometryAiOperationDependencies(draft, geometry, candidate).includes(index)) removed.add(candidate);
    }
    const removedDependentIndices = [...removed].filter((value) => value !== index).sort((left, right) => left - right);
    return {
      selectedIndices: [...validSelection].filter((value) => !removed.has(value)).sort((left, right) => left - right),
      autoIncludedIndices: [],
      removedDependentIndices,
    };
  }
  const dependencies = geometryAiOperationDependencies(draft, geometry, index);
  const autoIncludedIndices = dependencies.filter((value) => !validSelection.has(value));
  const nextSelection = new Set(validSelection);
  nextSelection.add(index);
  for (const dependency of dependencies) nextSelection.add(dependency);
  return {
    selectedIndices: [...nextSelection].sort((left, right) => left - right),
    autoIncludedIndices,
    removedDependentIndices: [],
  };
}

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function exactKeys(value: RecordValue, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
}

function safeInteger(value: unknown, minimum = -1_000_000_000): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= 1_000_000_000;
}

function safeTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 32
    && value.every((item) => typeof item === "string" && item.trim().length > 0 && [...item].length <= 600);
}

function safeVertex(value: unknown): boolean {
  const item = record(value);
  return Boolean(item && exactKeys(item, ["id", "x", "y"])
    && safeId(item.id) && safeInteger(item.x) && safeInteger(item.y));
}

function safeOperation(value: unknown): value is GeometryOperationInput {
  const operation = record(value);
  if (!operation || !exactKeys(operation, ["operation", "parameters"]) || typeof operation.operation !== "string") return false;
  const parameters = record(operation.parameters);
  if (!parameters || !safeId(parameters.level_id)) return false;
  if (operation.operation === "add_vertex") {
    return exactKeys(parameters, ["level_id", "vertex"]) && safeVertex(parameters.vertex);
  }
  if (operation.operation === "add_wall") {
    const wall = record(parameters.wall);
    return exactKeys(parameters, ["level_id", "wall"]) && Boolean(wall
      && exactKeys(wall, ["id", "start_vertex_id", "end_vertex_id", "kind", "thickness", "source_icon_id"])
      && safeId(wall.id) && safeId(wall.start_vertex_id) && safeId(wall.end_vertex_id)
      && ["exterior", "interior", "unknown"].includes(String(wall.kind))
      && (wall.thickness === null || safeInteger(wall.thickness, 1)) && wall.source_icon_id === null);
  }
  if (operation.operation === "create_zone_region") {
    const zone = record(parameters.zone_region);
    return exactKeys(parameters, ["level_id", "zone_region"]) && Boolean(zone
      && exactKeys(zone, ["id", "semantic_zone_id", "outer_vertex_ids"])
      && safeId(zone.id) && safeId(zone.semantic_zone_id)
      && Array.isArray(zone.outer_vertex_ids) && zone.outer_vertex_ids.length >= 3
      && zone.outer_vertex_ids.length <= 256 && zone.outer_vertex_ids.every(safeId));
  }
  if (operation.operation === "place_opening") {
    const opening = record(parameters.opening);
    return exactKeys(parameters, ["level_id", "opening"]) && Boolean(opening
      && exactKeys(opening, ["id", "wall_id", "kind", "offset", "width", "swing", "adjacent_zone_ids"])
      && safeId(opening.id) && safeId(opening.wall_id)
      && ["door", "window", "exterior_opening", "other"].includes(String(opening.kind))
      && safeInteger(opening.offset, 0) && safeInteger(opening.width, 1)
      && ["none", "left", "right", "double"].includes(String(opening.swing))
      && Array.isArray(opening.adjacent_zone_ids) && opening.adjacent_zone_ids.length <= 2
      && opening.adjacent_zone_ids.every(safeId));
  }
  return false;
}

export function isSafeGeometryAiDraft(value: unknown): value is GeometryAiDraft {
  const draft = record(value);
  if (!draft || !exactKeys(draft, [
    "schema_version", "project_session_id", "revision_id", "baseline_geometry_hash",
    "attachment_sha256", "summary", "observations", "measurement_basis",
    "confidence_percent", "assumptions", "warnings", "operations",
  ])) return false;
  return draft.schema_version === GEOMETRY_AI_DRAFT_SCHEMA_VERSION
    && safeId(draft.project_session_id) && safeId(draft.revision_id)
    && typeof draft.baseline_geometry_hash === "string" && /^[A-Fa-f0-9]{64}$/.test(draft.baseline_geometry_hash)
    && typeof draft.attachment_sha256 === "string" && /^[A-Fa-f0-9]{64}$/.test(draft.attachment_sha256)
    && typeof draft.summary === "string" && draft.summary.trim().length > 0 && [...draft.summary].length <= 1200
    && safeTextList(draft.observations) && safeTextList(draft.assumptions) && safeTextList(draft.warnings)
    && ["explicit_dimensions", "scaled_reference", "visual_estimate", "unknown"].includes(String(draft.measurement_basis))
    && Number.isInteger(draft.confidence_percent) && Number(draft.confidence_percent) >= 0 && Number(draft.confidence_percent) <= 100
    && Array.isArray(draft.operations) && draft.operations.length <= 256 && draft.operations.every(safeOperation);
}

interface GeometryAiCanvasOperationMeta {
  operationIndex?: number;
  selected?: boolean;
}

export interface GeometryAiCanvasPreview {
  operationCount: number;
  vertices?: Array<{ id: string; point: { x: number; y: number } } & GeometryAiCanvasOperationMeta>;
  zones: Array<{ id: string; points: Array<{ x: number; y: number }> } & GeometryAiCanvasOperationMeta>;
  walls: Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number } } & GeometryAiCanvasOperationMeta>;
  openings: Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number } } & GeometryAiCanvasOperationMeta>;
}

export function geometryAiCanvasPreview(
  geometry: BuildingGeometry,
  draft: GeometryAiDraft,
  operationIndices?: readonly number[],
  selectedOperationIndices?: readonly number[],
): GeometryAiCanvasPreview {
  const tracked = operationIndices !== undefined || selectedOperationIndices !== undefined;
  const sourceIndices = operationIndices ?? draft.operations.map((_operation, index) => index);
  const selected = selectedOperationIndices
    ? new Set(selectedOperationIndices.filter((index) => Number.isSafeInteger(index) && index >= 0 && index < draft.operations.length))
    : null;
  const operationMeta = (index: number): GeometryAiCanvasOperationMeta => tracked
    ? { operationIndex: sourceIndices[index] ?? index, selected: selected?.has(sourceIndices[index] ?? index) ?? true }
    : {};
  const vertices = new Map(geometry.levels.flatMap((level) => level.vertices).map((vertex) => [vertex.id, { x: vertex.x, y: vertex.y }]));
  const wallSegments = new Map<string, { start: { x: number; y: number }; end: { x: number; y: number } }>();
  for (const level of geometry.levels) {
    for (const wall of level.walls) {
      const start = vertices.get(wall.start_vertex_id);
      const end = vertices.get(wall.end_vertex_id);
      if (start && end) wallSegments.set(wall.id, { start, end });
    }
  }

  const previewVertices: NonNullable<GeometryAiCanvasPreview["vertices"]> = [];
  for (const [index, operation] of draft.operations.entries()) {
    if (operation.operation !== "add_vertex") continue;
    const vertex = (operation.parameters as { vertex: { id: string; x: number; y: number } }).vertex;
    vertices.set(vertex.id, { x: vertex.x, y: vertex.y });
    if (tracked) previewVertices.push({ id: vertex.id, point: { x: vertex.x, y: vertex.y }, ...operationMeta(index) });
  }

  const walls: GeometryAiCanvasPreview["walls"] = [];
  for (const [index, operation] of draft.operations.entries()) {
    if (operation.operation !== "add_wall") continue;
    const wall = (operation.parameters as { wall: { id: string; start_vertex_id: string; end_vertex_id: string } }).wall;
    const start = vertices.get(wall.start_vertex_id);
    const end = vertices.get(wall.end_vertex_id);
    if (!start || !end) continue;
    wallSegments.set(wall.id, { start, end });
    walls.push({ id: wall.id, start, end, ...operationMeta(index) });
  }

  const zones: GeometryAiCanvasPreview["zones"] = [];
  const openings: GeometryAiCanvasPreview["openings"] = [];
  for (const [index, operation] of draft.operations.entries()) {
    if (operation.operation === "create_zone_region") {
      const zone = (operation.parameters as { zone_region: { id: string; outer_vertex_ids: string[] } }).zone_region;
      const points = zone.outer_vertex_ids.map((vertexId) => vertices.get(vertexId)).filter((point): point is { x: number; y: number } => Boolean(point));
      if (points.length === zone.outer_vertex_ids.length) zones.push({ id: zone.id, points, ...operationMeta(index) });
    } else if (operation.operation === "place_opening") {
      const opening = (operation.parameters as { opening: { id: string; wall_id: string; offset: number; width: number } }).opening;
      const segment = wallSegments.get(opening.wall_id);
      if (!segment) continue;
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const length = Math.hypot(dx, dy);
      if (length <= 0) continue;
      const startRatio = opening.offset / length;
      const endRatio = (opening.offset + opening.width) / length;
      openings.push({
        id: opening.id,
        start: { x: segment.start.x + dx * startRatio, y: segment.start.y + dy * startRatio },
        end: { x: segment.start.x + dx * endRatio, y: segment.start.y + dy * endRatio },
        ...operationMeta(index),
      });
    }
  }
  const preview: GeometryAiCanvasPreview = {
    operationCount: selected?.size ?? draft.operations.length,
    zones,
    walls,
    openings,
  };
  if (tracked) preview.vertices = previewVertices;
  return preview;
}
