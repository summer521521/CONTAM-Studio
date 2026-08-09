import type { SemanticNode, SemanticSnapshot } from "./semantic-state";

export const SPATIAL_SCHEMA_VERSION = "spatial_projection.v1" as const;
export const VISUAL_MIN_SCALE = 0.05;
export const VISUAL_MAX_SCALE = 4;
export const VISUAL_GRID_SIZE = 24;

export type SpatialProjectionStatus = "available" | "unavailable";
export type SpatialIconKind = "zone" | "flow_path" | "wall" | "opening" | "fan" | "note" | "unknown";
export type SpatialBindingKind = "zone" | "flow_path" | "none";
export type SpatialBindingStatus = "bound" | "unbound";
export type SpatialUnavailableReason =
  | "spatial_section_missing"
  | "spatial_duplicate_section"
  | "spatial_level_limit_exceeded"
  | "spatial_icon_limit_exceeded"
  | "spatial_payload_limit_exceeded"
  | "spatial_level_truncated"
  | "spatial_level_record_invalid"
  | "spatial_icon_count_mismatch"
  | "spatial_icon_record_invalid"
  | "spatial_icon_integer_invalid"
  | "spatial_coordinate_limit_exceeded"
  | "spatial_extra_records"
  | string;

export interface SpatialBinding {
  kind: SpatialBindingKind;
  semantic_id: string | null;
  status: SpatialBindingStatus;
  reason: string | null;
}

export interface SpatialIcon {
  id: string;
  icon_type: number;
  kind: SpatialIconKind;
  column: number;
  row: number;
  object_number: number;
  binding: SpatialBinding;
  evidence: { source_line: number };
}

export interface SpatialBounds {
  min_column: number;
  max_column: number;
  min_row: number;
  max_row: number;
}

export interface SpatialLevel {
  level_number: number;
  name: string;
  reference_height: number;
  delta_height: number;
  reference_height_unit: number;
  delta_height_unit: number;
  bounds: SpatialBounds | null;
  icons: SpatialIcon[];
}

export interface SpatialWarning {
  code: string;
  icon_id: string | null;
}

export interface SpatialProjection {
  schema_version: typeof SPATIAL_SCHEMA_VERSION;
  status: SpatialProjectionStatus;
  identity_sha256: string;
  source_sha256: string;
  revision_id: string;
  levels: SpatialLevel[];
  warnings: SpatialWarning[];
  unavailable_reason: SpatialUnavailableReason | null;
}

export type VisualWorkspaceMode = "sketchpad" | "topology";

export interface VisualLayerVisibility {
  walls: boolean;
  zones: boolean;
  flowPaths: boolean;
  labels: boolean;
  grid: boolean;
  otherIcons: boolean;
  lowerLevelReference: boolean;
}

export interface VisualWorkspacePreferences {
  mode: VisualWorkspaceMode;
  layers: VisualLayerVisibility;
}

export interface VisualViewport {
  x: number;
  y: number;
  scale: number;
}

export interface VisualSelectionProjection {
  semanticId: string;
  iconId: string | null;
  levelNumber: number | null;
}

export interface WallSegment {
  from: readonly [number, number];
  to: readonly [number, number];
}

export interface TopologyNode {
  id: string;
  semanticId: string | null;
  kind: "zone" | "boundary" | "unresolved";
  label: string;
  contamNumber: number | null;
  levelNumber: number | null;
  x: number;
  y: number;
}

export interface TopologyEdge {
  id: string;
  semanticId: string;
  contamNumber: number;
  fromNodeId: string;
  toNodeId: string;
  flowElementId: string;
  direction: number;
  multiplier: number;
  crossLevel: boolean;
}

export interface TopologyLayout {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  bounds: SpatialBounds | null;
}

export const DEFAULT_VISUAL_LAYERS: VisualLayerVisibility = {
  walls: true,
  zones: true,
  flowPaths: true,
  labels: true,
  grid: true,
  otherIcons: true,
  lowerLevelReference: false,
};

export const DEFAULT_VISUAL_PREFERENCES: VisualWorkspacePreferences = {
  mode: "sketchpad",
  layers: DEFAULT_VISUAL_LAYERS,
};

const FLOW_TYPES = new Set([1, 2, 3, 4]);
const ZONE_TYPES = new Set([5, 6, 7]);
const WALL_TYPES = new Set([11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
const OPENING_TYPES = new Set([23, 24, 25, 27]);
const FAN_TYPES = new Set([28, 29, 30, 31]);

export function classifySpatialIconType(iconType: number): SpatialIconKind {
  if (FLOW_TYPES.has(iconType)) return "flow_path";
  if (ZONE_TYPES.has(iconType)) return "zone";
  if (WALL_TYPES.has(iconType)) return "wall";
  if (OPENING_TYPES.has(iconType)) return "opening";
  if (FAN_TYPES.has(iconType)) return "fan";
  if (iconType === 42) return "note";
  return "unknown";
}

const N: WallSegment = { from: [0, 0], to: [0, -0.5] };
const E: WallSegment = { from: [0, 0], to: [0.5, 0] };
const S: WallSegment = { from: [0, 0], to: [0, 0.5] };
const W: WallSegment = { from: [0, 0], to: [-0.5, 0] };

/** Minimal independently expressed mapping of the verified CONTAM wall constants. */
export function wallSegments(iconType: number): readonly WallSegment[] {
  switch (iconType) {
    case 11: return [E, W];
    case 12: return [N, S];
    case 14: return [E, S];
    case 15: return [S, W];
    case 16: return [N, W];
    case 17: return [N, E];
    case 18: return [N, E, S];
    case 19: return [E, S, W];
    case 20: return [N, S, W];
    case 21: return [N, E, W];
    case 22: return [N, E, S, W];
    default: return [];
  }
}

export function spatialBoundsForIcons(icons: readonly SpatialIcon[]): SpatialBounds | null {
  if (!icons.length) return null;
  let minColumn = icons[0].column;
  let maxColumn = icons[0].column;
  let minRow = icons[0].row;
  let maxRow = icons[0].row;
  for (let index = 1; index < icons.length; index += 1) {
    const icon = icons[index];
    minColumn = Math.min(minColumn, icon.column);
    maxColumn = Math.max(maxColumn, icon.column);
    minRow = Math.min(minRow, icon.row);
    maxRow = Math.max(maxRow, icon.row);
  }
  return { min_column: minColumn, max_column: maxColumn, min_row: minRow, max_row: maxRow };
}

export function combinedSpatialBounds(levels: readonly SpatialLevel[]): SpatialBounds | null {
  const icons = levels.flatMap((level) => level.icons);
  return spatialBoundsForIcons(icons);
}

export function clampVisualScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(VISUAL_MAX_SCALE, Math.max(VISUAL_MIN_SCALE, scale));
}

export function fitViewport(
  bounds: SpatialBounds | null,
  width: number,
  height: number,
  padding = 48,
): VisualViewport {
  if (!bounds || width <= 0 || height <= 0) return { x: width / 2, y: height / 2, scale: 1 };
  const contentWidth = Math.max(1, (bounds.max_column - bounds.min_column + 2) * VISUAL_GRID_SIZE);
  const contentHeight = Math.max(1, (bounds.max_row - bounds.min_row + 2) * VISUAL_GRID_SIZE);
  const scale = clampVisualScale(Math.min(
    Math.max(1, width - padding * 2) / contentWidth,
    Math.max(1, height - padding * 2) / contentHeight,
  ));
  const centerColumn = (bounds.min_column + bounds.max_column) / 2;
  const centerRow = (bounds.min_row + bounds.max_row) / 2;
  return {
    x: width / 2 - centerColumn * VISUAL_GRID_SIZE * scale,
    y: height / 2 - centerRow * VISUAL_GRID_SIZE * scale,
    scale,
  };
}

export function zoomViewportAtPointer(
  viewport: VisualViewport,
  pointer: { x: number; y: number },
  requestedScale: number,
): VisualViewport {
  const nextScale = clampVisualScale(requestedScale);
  const worldX = (pointer.x - viewport.x) / viewport.scale;
  const worldY = (pointer.y - viewport.y) / viewport.scale;
  return {
    x: pointer.x - worldX * nextScale,
    y: pointer.y - worldY * nextScale,
    scale: nextScale,
  };
}

export function iconVisible(icon: SpatialIcon, layers: VisualLayerVisibility): boolean {
  const kind = classifySpatialIconType(icon.icon_type);
  if (kind === "wall") return layers.walls;
  if (kind === "zone") return layers.zones;
  if (kind === "flow_path" || kind === "opening" || kind === "fan") return layers.flowPaths;
  return layers.otherIcons;
}

export function buildSpatialBindingIndex(levels: readonly SpatialLevel[]): Map<string, SpatialIcon> {
  const index = new Map<string, SpatialIcon>();
  for (const level of levels) {
    for (const icon of level.icons) {
      if (icon.binding.status === "bound" && icon.binding.semantic_id) {
        index.set(icon.binding.semantic_id, icon);
      }
    }
  }
  return index;
}

export function projectVisualSelection(
  semanticId: string | null,
  projection: SpatialProjection | null,
): VisualSelectionProjection | null {
  if (!semanticId) return null;
  const icon = projection ? buildSpatialBindingIndex(projection.levels).get(semanticId) : undefined;
  const level = icon
    ? projection?.levels.find((candidate) => candidate.icons.some((item) => item.id === icon.id))
    : undefined;
  return { semanticId, iconId: icon?.id ?? null, levelNumber: level?.level_number ?? null };
}

export function resetVisualContext(
  previous: { identity: string | null; revision: string | null },
  projection: SpatialProjection | null,
): { changed: boolean; activeLevel: number | null; selection: VisualSelectionProjection | null } {
  const identity = projection?.identity_sha256 ?? null;
  const revision = projection?.revision_id ?? null;
  const changed = previous.identity !== identity || previous.revision !== revision;
  return {
    changed,
    activeLevel: projection?.levels[0]?.level_number ?? null,
    selection: null,
  };
}

function numberField(node: SemanticNode, key: string): number | null {
  const direct = node[key];
  const nested = node.fields?.[key];
  const value = typeof direct === "number" ? direct : nested;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(node: SemanticNode, key: string): string | null {
  const direct = node[key];
  const nested = node.fields?.[key];
  const value = typeof direct === "string" ? direct : nested;
  return typeof value === "string" && value ? value : null;
}

interface EndpointInput { category: string; contamNumber: number | null }

function endpointField(node: SemanticNode, key: "from_endpoint" | "to_endpoint"): EndpointInput | null {
  const raw = node[key];
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { category?: unknown; contam_number?: unknown };
  if (typeof candidate.category !== "string") return null;
  return {
    category: candidate.category,
    contamNumber: typeof candidate.contam_number === "number" ? candidate.contam_number : null,
  };
}

function semanticId(node: SemanticNode): string | null {
  return node.object_id ?? node.zone_id ?? node.path_id ?? null;
}

function endpointKey(endpoint: EndpointInput): string {
  return endpoint.category === "zone" && endpoint.contamNumber !== null
    ? `zone:${endpoint.contamNumber}`
    : `boundary:${endpoint.category}:${endpoint.contamNumber ?? "global"}`;
}

/** Deterministic level-banded layout; no random force simulation or spatial-distance claim. */
export function buildTopologyLayout(snapshot: SemanticSnapshot): TopologyLayout {
  const zones = snapshot.zones
    .map((zone) => ({
      semanticId: semanticId(zone),
      contamNumber: numberField(zone, "contam_number"),
      levelNumber: numberField(zone, "level_number"),
      name: stringField(zone, "name") ?? stringField(zone, "label"),
    }))
    .filter((zone): zone is { semanticId: string; contamNumber: number; levelNumber: number | null; name: string | null } => (
      Boolean(zone.semanticId) && zone.contamNumber !== null
    ))
    .sort((left, right) => (
      (left.levelNumber ?? Number.MAX_SAFE_INTEGER) - (right.levelNumber ?? Number.MAX_SAFE_INTEGER)
      || left.contamNumber - right.contamNumber
      || left.semanticId.localeCompare(right.semanticId)
    ));

  const zonesByLevel = new Map<number | null, typeof zones>();
  for (const zone of zones) {
    const entries = zonesByLevel.get(zone.levelNumber) ?? [];
    entries.push(zone);
    zonesByLevel.set(zone.levelNumber, entries);
  }
  const nodes: TopologyNode[] = [];
  const zoneNodeByNumber = new Map<number, TopologyNode>();
  let nextBandY = 100;
  for (const [levelNumber, entries] of [...zonesByLevel.entries()].sort((left, right) => (left[0] ?? Number.MAX_SAFE_INTEGER) - (right[0] ?? Number.MAX_SAFE_INTEGER))) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
    const rows = Math.ceil(entries.length / columns);
    entries.forEach((zone, index) => {
      const node: TopologyNode = {
        id: `zone:${zone.contamNumber}`,
        semanticId: zone.semanticId,
        kind: "zone",
        label: zone.name ?? `#${zone.contamNumber}`,
        contamNumber: zone.contamNumber,
        levelNumber,
        x: 180 + (index % columns) * 150,
        y: nextBandY + Math.floor(index / columns) * 100,
      };
      nodes.push(node);
      zoneNodeByNumber.set(zone.contamNumber, node);
    });
    nextBandY += Math.max(160, rows * 100 + 60);
  }

  const boundaryNodes = new Map<string, TopologyNode>();
  const edges: TopologyEdge[] = [];
  const rightBoundaryX = nodes.reduce((maximum, node) => Math.max(maximum, node.x + 140), 30);
  const sortedPaths = [...snapshot.flow_paths].sort((left, right) => (
    (numberField(left, "contam_number") ?? Number.MAX_SAFE_INTEGER) - (numberField(right, "contam_number") ?? Number.MAX_SAFE_INTEGER)
    || (semanticId(left) ?? "").localeCompare(semanticId(right) ?? "")
  ));
  const resolveEndpoint = (endpoint: EndpointInput, other: TopologyNode | null): TopologyNode => {
    if (endpoint.category === "zone" && endpoint.contamNumber !== null) {
      const known = zoneNodeByNumber.get(endpoint.contamNumber);
      if (known) return known;
    }
    const key = endpointKey(endpoint);
    const existing = boundaryNodes.get(key);
    if (existing) return existing;
    const node: TopologyNode = {
      id: key,
      semanticId: null,
      kind: endpoint.category === "zone" ? "unresolved" : "boundary",
      label: endpoint.category === "zone" ? `#${endpoint.contamNumber ?? "?"}` : endpoint.category,
      contamNumber: endpoint.contamNumber,
      levelNumber: other?.levelNumber ?? null,
      x: endpoint.category === "outdoor" ? 30 : rightBoundaryX,
      y: other?.y ?? 40 + boundaryNodes.size * 90,
    };
    boundaryNodes.set(key, node);
    nodes.push(node);
    return node;
  };

  for (const path of sortedPaths) {
    const pathId = semanticId(path);
    const contamNumber = numberField(path, "contam_number");
    const from = endpointField(path, "from_endpoint");
    const to = endpointField(path, "to_endpoint");
    if (!pathId || contamNumber === null || !from || !to) continue;
    const preliminaryFrom = from.category === "zone" && from.contamNumber !== null ? zoneNodeByNumber.get(from.contamNumber) ?? null : null;
    const preliminaryTo = to.category === "zone" && to.contamNumber !== null ? zoneNodeByNumber.get(to.contamNumber) ?? null : null;
    const fromNode = resolveEndpoint(from, preliminaryTo);
    const toNode = resolveEndpoint(to, preliminaryFrom ?? fromNode);
    edges.push({
      id: `flow:${contamNumber}:${pathId}`,
      semanticId: pathId,
      contamNumber,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      flowElementId: stringField(path, "flow_element_id") ?? "",
      direction: numberField(path, "direction") ?? 0,
      multiplier: numberField(path, "multiplier") ?? 1,
      crossLevel: fromNode.levelNumber !== null && toNode.levelNumber !== null && fromNode.levelNumber !== toNode.levelNumber,
    });
  }

  const coordinateIcons: SpatialIcon[] = nodes.map((node, index) => ({
    id: node.id,
    icon_type: 0,
    kind: "unknown",
    column: Math.round(node.x / VISUAL_GRID_SIZE),
    row: Math.round(node.y / VISUAL_GRID_SIZE),
    object_number: index,
    binding: { kind: "none", semantic_id: null, status: "unbound", reason: "topology_node" },
    evidence: { source_line: 1 },
  }));
  return { nodes, edges, bounds: spatialBoundsForIcons(coordinateIcons) };
}

export function activeSpatialLevel(
  projection: SpatialProjection | null,
  levelNumber: number | null,
): SpatialLevel | null {
  if (!projection || projection.status !== "available") return null;
  return projection.levels.find((level) => level.level_number === levelNumber) ?? projection.levels[0] ?? null;
}
