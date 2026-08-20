import Konva from "konva";
import { Navigation } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import { underlayGeometryCorners } from "../../../app/geometry/geometry-plan-underlay";
import {
  createOrthogonalManipulationContext,
  DIRECT_MANIPULATION_SNAP_MM,
  planOrthogonalVertexMoveWithContext,
  selectedVertexIds,
  type OrthogonalVertexMovePlan,
} from "../../../app/geometry/geometry-direct-manipulation";
import {
  OPENING_MANIPULATION_SNAP_MM,
  createOpeningManipulationContext,
  geometryWallFrame,
  planOpeningUpdateWithContext,
  planOrthogonalWallTranslationWithContext,
  projectedOpeningOffset,
  type OpeningUpdatePlan,
  type WallTranslationPlan,
} from "../../../app/geometry/geometry-wall-opening-manipulation";
import {
  createWallTopologyContext,
  planTopologyAwareWallDrawWithContext,
  planWallSplitWithContext,
  type WallDrawPlan,
  type WallSplitPlan,
} from "../../../app/geometry/geometry-wall-topology";
import {
  createZoneTopologyContext,
  planZoneMergeWithContext,
  planZonePartitionWithContext,
  planZoneRegionFromPointWithContext,
  type ZoneCreatePlan,
  type ZoneMergePlan,
  type ZonePartitionPlan,
} from "../../../app/geometry/geometry-zone-topology";
import type { GeometryAiCanvasPreview } from "../../../app/geometry/geometry-ai-draft";
import { planVerticalOpeningPlacement } from "../../../app/geometry/geometry-vertical-connections";
import type {
  BuildingGeometry,
  GeometryLevel,
  GeometryOpening,
  GeometryPlanUnderlay,
  GeometryVertex,
  GeometryWall,
  GeometryZoneRegion,
  GeometryVerticalOpening,
} from "../../../app/geometry/geometry-model";
import type {
  GeometryOperationInput,
  GeometrySelection,
  GeometryTool,
} from "../../../app/runtime/useGeometryWorkbench";
import {
  directMoveIssueKey,
  manipulationIssueKey,
  topologyIssueKey,
  wallTranslationIssueKey,
  zoneTopologyIssueKey,
  verticalOpeningIssueKey,
} from "./geometry-interaction-issues";

export interface GeometryViewport { x: number; y: number; scale: number; }
export interface GeometryLayerVisibility {
  grid: boolean;
  walls: boolean;
  zones: boolean;
  openings: boolean;
  airflow: boolean;
  dimensions: boolean;
  labels: boolean;
}
export interface GeometryMeasurement { id: string; start: MetricPoint; end: MetricPoint; }
export interface MetricPoint { x: number; y: number; }
export type GeometryAiDraftPreview = GeometryAiCanvasPreview;

export interface GeometryCanvasKonvaProps {
  geometry: BuildingGeometry;
  levelId: string;
  referenceLevelId: string | null;
  tool: GeometryTool;
  selection: GeometrySelection | null;
  selectedZoneId: string | null;
  verticalTargetLevelId: string | null;
  verticalOpeningKind: GeometryVerticalOpening["kind"];
  zoneLabels: ReadonlyMap<string, string>;
  layers: GeometryLayerVisibility;
  viewport: GeometryViewport;
  fitSequence: number;
  aiDraftPreview?: GeometryAiDraftPreview | null;
  onToggleAiOperation?: (index: number) => void;
  underlay?: GeometryPlanUnderlay | null;
  underlayImage?: CanvasImageSource | null;
  calibrationPoints?: MetricPoint[];
  onViewportChange: (viewport: GeometryViewport) => void;
  onSelect: (selection: GeometrySelection | null) => void;
  onLinkWallFlowPath: (openingId: string) => void;
  onCommitOperations: (operations: GeometryOperationInput[], selectAfter?: GeometrySelection | null) => boolean;
  onCommitZoneRegion?: (
    operations: GeometryOperationInput[],
    region: GeometryZoneRegion,
    selectAfter: GeometrySelection,
  ) => boolean;
  onIssue: (message: string | null) => void;
  onCalibrationPoint?: (point: MetricPoint) => void;
  onUndo: () => void;
  onRedo: () => void;
}

interface WallDragGesture {
  wallId: string;
  orientation: "horizontal" | "vertical";
  initialPointerAxis: number;
  initialAxisPosition: number;
}

interface OpeningDragGesture {
  openingId: string;
  wallId: string;
  initialProjectedDistance: number;
  initialOffset: number;
  width: number;
}

interface VertexBatchPreview {
  movedVertices: GeometryVertex[];
}

type GeometryPalette = {
  canvas: string;
  gridMinor: string;
  gridMajor: string;
  line: string;
  lineMuted: string;
  zoneFill: string;
  selection: string;
  panelText: string;
  opening: string;
  flow: string;
};

const FALLBACK_PALETTE: GeometryPalette = {
  canvas: "#eee8dc",
  gridMinor: "rgba(85,81,73,.10)",
  gridMajor: "rgba(85,81,73,.21)",
  line: "#383b3b",
  lineMuted: "#6e706c",
  zoneFill: "rgba(163,174,164,.28)",
  selection: "#b55235",
  panelText: "#282b2a",
  opening: "#2f7c87",
  flow: "#a84d36",
};

const SNAP_MM = 250;
const MIN_SCALE = 0.015;
const MAX_SCALE = 0.32;

function id(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function snapMetricPoint(point: MetricPoint, increment = SNAP_MM): MetricPoint {
  const x = Math.round(point.x / increment) * increment;
  const y = Math.round(point.y / increment) * increment;
  return {
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  };
}

export function orthogonalEndpoint(start: MetricPoint, candidate: MetricPoint): MetricPoint {
  return Math.abs(candidate.x - start.x) >= Math.abs(candidate.y - start.y)
    ? { x: candidate.x, y: start.y }
    : { x: start.x, y: candidate.y };
}

function vertexMap(level: GeometryLevel): Map<string, GeometryVertex> {
  return new Map(level.vertices.map((vertex) => [vertex.id, vertex]));
}

function metricBounds(level: GeometryLevel): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!level.vertices.length) return null;
  return level.vertices.reduce((bounds, vertex) => ({
    minX: Math.min(bounds.minX, vertex.x),
    minY: Math.min(bounds.minY, vertex.y),
    maxX: Math.max(bounds.maxX, vertex.x),
    maxY: Math.max(bounds.maxY, vertex.y),
  }), { minX: level.vertices[0].x, minY: level.vertices[0].y, maxX: level.vertices[0].x, maxY: level.vertices[0].y });
}

function underlayBounds(underlay: GeometryPlanUnderlay | null): ReturnType<typeof metricBounds> {
  if (!underlay?.visible) return null;
  const corners = underlayGeometryCorners(underlay);
  return corners.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: corners[0].x, minY: corners[0].y, maxX: corners[0].x, maxY: corners[0].y });
}

function mergeBounds(
  left: ReturnType<typeof metricBounds>,
  right: ReturnType<typeof metricBounds>,
): ReturnType<typeof metricBounds> {
  if (!left) return right;
  if (!right) return left;
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

export function fitGeometryViewport(
  level: GeometryLevel,
  width: number,
  height: number,
  referenceLevel: GeometryLevel | null = null,
  underlay: GeometryPlanUnderlay | null = null,
): GeometryViewport {
  const activeBounds = metricBounds(level);
  const referenceBounds = referenceLevel ? metricBounds(referenceLevel) : null;
  const bounds = mergeBounds(mergeBounds(activeBounds, referenceBounds), underlayBounds(underlay));
  if (!bounds) return { x: width / 2, y: height / 2, scale: 0.06 };
  const frame = width >= 1_000
    ? { left: 284, right: 320, top: 150, bottom: 118 }
    : { left: 72, right: 72, top: 96, bottom: 96 };
  const contentWidth = Math.max(1_000, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1_000, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(240, width - frame.left - frame.right);
  const availableHeight = Math.max(240, height - frame.top - frame.bottom);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(availableWidth / contentWidth, availableHeight / contentHeight)));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    x: frame.left + availableWidth / 2 - centerX * scale,
    y: frame.top + availableHeight / 2 + centerY * scale,
    scale,
  };
}

function readPalette(element: HTMLElement): GeometryPalette {
  const style = getComputedStyle(element);
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    canvas: value("--geometry-canvas", FALLBACK_PALETTE.canvas),
    gridMinor: value("--geometry-grid-minor", FALLBACK_PALETTE.gridMinor),
    gridMajor: value("--geometry-grid-major", FALLBACK_PALETTE.gridMajor),
    line: value("--geometry-line", FALLBACK_PALETTE.line),
    lineMuted: value("--geometry-line-muted", FALLBACK_PALETTE.lineMuted),
    zoneFill: value("--geometry-zone-fill", FALLBACK_PALETTE.zoneFill),
    selection: value("--geometry-selection", FALLBACK_PALETTE.selection),
    panelText: value("--geometry-panel-text", FALLBACK_PALETTE.panelText),
    opening: value("--geometry-opening", FALLBACK_PALETTE.opening),
    flow: value("--geometry-flow", FALLBACK_PALETTE.flow),
  };
}

function screenPoint(point: MetricPoint): MetricPoint {
  return { x: point.x, y: -point.y };
}

function geometryPoint(stage: Konva.Stage, viewport: GeometryViewport): MetricPoint | null {
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  return {
    x: (pointer.x - viewport.x) / viewport.scale,
    y: -((pointer.y - viewport.y) / viewport.scale),
  };
}

function wallEndpoints(wall: GeometryWall, vertices: ReadonlyMap<string, GeometryVertex>): [GeometryVertex, GeometryVertex] | null {
  const start = vertices.get(wall.start_vertex_id);
  const end = vertices.get(wall.end_vertex_id);
  return start && end ? [start, end] : null;
}

function wallLength(wall: GeometryWall, vertices: ReadonlyMap<string, GeometryVertex>): number {
  const endpoints = wallEndpoints(wall, vertices);
  return endpoints ? Math.abs(endpoints[1].x - endpoints[0].x) + Math.abs(endpoints[1].y - endpoints[0].y) : 0;
}

function openingPoint(opening: GeometryOpening, wall: GeometryWall, vertices: ReadonlyMap<string, GeometryVertex>, atEnd = false): MetricPoint | null {
  const endpoints = wallEndpoints(wall, vertices);
  if (!endpoints) return null;
  const [start, end] = endpoints;
  const distance = opening.offset + (atEnd ? opening.width : 0);
  const length = wallLength(wall, vertices);
  if (!length) return null;
  return {
    x: start.x + ((end.x - start.x) * distance) / length,
    y: start.y + ((end.y - start.y) * distance) / length,
  };
}

function polygonCenter(region: GeometryZoneRegion, vertices: ReadonlyMap<string, GeometryVertex>): MetricPoint {
  const polygon = region.outer_vertex_ids.map((vertexId) => vertices.get(vertexId)).filter((vertex): vertex is GeometryVertex => Boolean(vertex));
  if (!polygon.length) return { x: 0, y: 0 };
  return polygon.reduce((total, vertex) => ({ x: total.x + vertex.x / polygon.length, y: total.y + vertex.y / polygon.length }), { x: 0, y: 0 });
}

export function polygonAreaM2(region: GeometryZoneRegion, vertices: ReadonlyMap<string, GeometryVertex>): number {
  const polygon = region.outer_vertex_ids.map((vertexId) => vertices.get(vertexId)).filter((vertex): vertex is GeometryVertex => Boolean(vertex));
  if (polygon.length < 3) return 0;
  const twiceArea = polygon.reduce((total, vertex, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return total + vertex.x * next.y - next.x * vertex.y;
  }, 0);
  return Math.abs(twiceArea) / 2_000_000;
}

export function metricScaleBar(scale: number): { millimeters: number; pixels: number; label: string } {
  const candidates = [500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000];
  const targetMillimeters = 120 / Math.max(scale, MIN_SCALE);
  const millimeters = candidates.reduce((closest, candidate) => (
    Math.abs(candidate - targetMillimeters) < Math.abs(closest - targetMillimeters) ? candidate : closest
  ));
  return {
    millimeters,
    pixels: millimeters * scale,
    label: millimeters >= 1_000 ? `${millimeters / 1_000} m` : `${millimeters} mm`,
  };
}

function doorSwingArc(start: MetricPoint, end: MetricPoint, openEnd: MetricPoint): number[] {
  const startAngle = Math.atan2(end.y - start.y, end.x - start.x);
  let delta = Math.atan2(openEnd.y - start.y, openEnd.x - start.x) - startAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const radius = Math.hypot(end.x - start.x, end.y - start.y);
  return Array.from({ length: 13 }, (_, index) => {
    const angle = startAngle + delta * (index / 12);
    return [start.x + Math.cos(angle) * radius, start.y + Math.sin(angle) * radius];
  }).flat();
}

function adjacentZones(wall: GeometryWall, level: GeometryLevel): string[] {
  return level.zone_regions
    .filter((region) => region.outer_vertex_ids.includes(wall.start_vertex_id) && region.outer_vertex_ids.includes(wall.end_vertex_id))
    .map((region) => region.semantic_zone_id)
    .slice(0, 2);
}

function Grid({ size, viewport, palette }: { size: { width: number; height: number }; viewport: GeometryViewport; palette: GeometryPalette }) {
  const spacing = viewport.scale * SNAP_MM >= 9 ? SNAP_MM : 1_000;
  const minX = (0 - viewport.x) / viewport.scale;
  const maxX = (size.width - viewport.x) / viewport.scale;
  const minScreenY = (0 - viewport.y) / viewport.scale;
  const maxScreenY = (size.height - viewport.y) / viewport.scale;
  const lines: Array<{ key: string; points: number[]; major: boolean }> = [];
  for (let x = Math.floor(minX / spacing) * spacing, count = 0; x <= maxX && count < 420; x += spacing, count += 1) {
    lines.push({ key: `x-${x}`, points: [x, minScreenY, x, maxScreenY], major: x % 1_000 === 0 });
  }
  for (let y = Math.floor(minScreenY / spacing) * spacing, count = 0; y <= maxScreenY && count < 420; y += spacing, count += 1) {
    lines.push({ key: `y-${y}`, points: [minX, y, maxX, y], major: y % 1_000 === 0 });
  }
  return (
    <>
      {lines.map((line) => <Line key={line.key} points={line.points} stroke={line.major ? palette.gridMajor : palette.gridMinor} strokeWidth={1 / viewport.scale} />)}
    </>
  );
}

export default function GeometryCanvasKonva({
  geometry,
  levelId,
  referenceLevelId,
  tool,
  selection,
  selectedZoneId,
  verticalTargetLevelId,
  verticalOpeningKind,
  zoneLabels,
  layers,
  viewport,
  fitSequence,
  aiDraftPreview = null,
  onToggleAiOperation = () => undefined,
  underlay = null,
  underlayImage = null,
  calibrationPoints = [],
  onViewportChange,
  onSelect,
  onLinkWallFlowPath,
  onCommitOperations,
  onCommitZoneRegion = (operations, _region, selectAfter) => onCommitOperations(operations, selectAfter),
  onIssue,
  onCalibrationPoint = () => undefined,
  onUndo,
  onRedo,
}: GeometryCanvasKonvaProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [palette, setPalette] = useState(FALLBACK_PALETTE);
  const [firstPoint, setFirstPoint] = useState<MetricPoint | null>(null);
  const [hoverPoint, setHoverPoint] = useState<MetricPoint | null>(null);
  const [measurements, setMeasurements] = useState<GeometryMeasurement[]>([]);
  const [vertexMovePreview, setVertexMovePreview] = useState<VertexBatchPreview | null>(null);
  const [openingUpdatePreview, setOpeningUpdatePreview] = useState<Extract<OpeningUpdatePlan, { status: "ready" }> | null>(null);
  const [wallDrawPreview, setWallDrawPreview] = useState<WallDrawPlan | null>(null);
  const [wallSplitPreview, setWallSplitPreview] = useState<WallSplitPlan | null>(null);
  const [zoneTopologyPreview, setZoneTopologyPreview] = useState<ZoneCreatePlan | ZonePartitionPlan | ZoneMergePlan | null>(null);
  const wallDragGesture = useRef<WallDragGesture | null>(null);
  const openingDragGesture = useRef<OpeningDragGesture | null>(null);
  const level = geometry.levels.find((item) => item.id === levelId) ?? geometry.levels[0];
  const referenceLevel = geometry.levels.find((item) => item.id === referenceLevelId && item.id !== level.id) ?? null;
  const referenceVertices = useMemo(() => referenceLevel ? vertexMap(referenceLevel) : new Map<string, GeometryVertex>(), [referenceLevel]);
  const referenceWalls = useMemo(
    () => new Map(referenceLevel?.walls.map((wall) => [wall.id, wall]) ?? []),
    [referenceLevel],
  );
  const directManipulationContext = useMemo(() => createOrthogonalManipulationContext(level), [level]);
  const openingManipulationContext = useMemo(() => createOpeningManipulationContext(level), [level]);
  const wallTopologyContext = useMemo(() => createWallTopologyContext(level), [level]);
  const zoneTopologyContext = useMemo(() => createZoneTopologyContext(level), [level]);
  const displayLevel = useMemo<GeometryLevel>(() => {
    if (!vertexMovePreview && !openingUpdatePreview) return level;
    const previewVertices = new Map(vertexMovePreview?.movedVertices.map((vertex) => [vertex.id, vertex]) ?? []);
    return {
      ...level,
      vertices: level.vertices.map((vertex) => previewVertices.get(vertex.id) ?? vertex),
      openings: openingUpdatePreview
        ? level.openings.map((opening) => opening.id === openingUpdatePreview.opening.id ? openingUpdatePreview.opening : opening)
        : level.openings,
    };
  }, [level, openingUpdatePreview, vertexMovePreview]);
  const vertices = useMemo(() => vertexMap(displayLevel), [displayLevel]);
  const handleVertexIds = useMemo(() => new Set(selectedVertexIds(level, selection)), [level, selection]);
  const visibleVerticalOpenings = useMemo(
    () => geometry.vertical_openings.filter((opening) => (
      opening.lower_level_id === level.id || opening.upper_level_id === level.id
    )),
    [geometry.vertical_openings, level.id],
  );
  const verticalAnchorByOpeningId = useMemo(
    () => new Map(geometry.vertical_flow_path_anchors.map((anchor) => [anchor.vertical_opening_id, anchor])),
    [geometry.vertical_flow_path_anchors],
  );
  const levelNameById = useMemo(
    () => new Map(geometry.levels.map((item) => [item.id, item.name])),
    [geometry.levels],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const update = () => {
      const rect = root.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
      setPalette(readPalette(root));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const observer = new MutationObserver(() => setPalette(readPalette(root)));
    observer.observe(root.closest("[data-geometry-theme]") ?? root, { attributes: true, attributeFilter: ["data-geometry-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width > 1 && size.height > 1) onViewportChange(fitGeometryViewport(level, size.width, size.height, referenceLevel, underlay));
  }, [fitSequence, level, onViewportChange, referenceLevel, size.height, size.width, underlay]);

  useEffect(() => {
    setFirstPoint(null);
    setHoverPoint(null);
    setVertexMovePreview(null);
    setOpeningUpdatePreview(null);
    setWallDrawPreview(null);
    setWallSplitPreview(null);
    setZoneTopologyPreview(null);
    wallDragGesture.current = null;
    openingDragGesture.current = null;
    onIssue(null);
  }, [tool]);

  useEffect(() => {
    setVertexMovePreview(null);
    setOpeningUpdatePreview(null);
    setWallDrawPreview(null);
    setWallSplitPreview(null);
    setZoneTopologyPreview(null);
    wallDragGesture.current = null;
    openingDragGesture.current = null;
  }, [geometry.geometry_revision, levelId]);

  const commitVertexMove = (vertexId: string, requestedTarget: MetricPoint): boolean => {
    const plan = planOrthogonalVertexMoveWithContext(directManipulationContext, level, vertexId, requestedTarget);
    setVertexMovePreview(null);
    if (plan.status === "unchanged") {
      onIssue(null);
      return false;
    }
    if (plan.status === "blocked") {
      onIssue(directMoveIssueKey(plan));
      return false;
    }
    if (!onCommitOperations([plan.operation], { kind: "vertex", id: vertexId })) {
      onIssue("geometry.editor.issue.invalidMove");
      return false;
    }
    onIssue(null);
    return true;
  };

  const previewVertexMove = (vertexId: string, requestedTarget: MetricPoint): OrthogonalVertexMovePlan => {
    const plan = planOrthogonalVertexMoveWithContext(directManipulationContext, level, vertexId, requestedTarget);
    setVertexMovePreview(plan.status === "ready" ? plan : null);
    if (plan.status === "blocked") onIssue(directMoveIssueKey(plan));
    else onIssue(null);
    return plan;
  };

  const commitWallTranslation = (wallId: string, requestedAxisPosition: number): boolean => {
    const plan = planOrthogonalWallTranslationWithContext(
      directManipulationContext,
      level,
      wallId,
      requestedAxisPosition,
    );
    setVertexMovePreview(null);
    if (plan.status === "unchanged") {
      onIssue(null);
      return false;
    }
    if (plan.status === "blocked") {
      onIssue(wallTranslationIssueKey(plan.diagnosticCode));
      return false;
    }
    if (!onCommitOperations([plan.operation], { kind: "wall", id: wallId })) {
      onIssue("geometry.editor.issue.invalidMove");
      return false;
    }
    onIssue(null);
    return true;
  };

  const previewWallTranslation = (wallId: string, requestedAxisPosition: number): WallTranslationPlan => {
    const plan = planOrthogonalWallTranslationWithContext(
      directManipulationContext,
      level,
      wallId,
      requestedAxisPosition,
    );
    setVertexMovePreview(plan.status === "ready" ? plan : null);
    if (plan.status === "blocked") onIssue(wallTranslationIssueKey(plan.diagnosticCode));
    else onIssue(null);
    return plan;
  };

  const commitOpeningUpdate = (openingId: string, requested: { offset: number; width: number }): boolean => {
    const plan = planOpeningUpdateWithContext(
      openingManipulationContext,
      level,
      openingId,
      requested,
    );
    setOpeningUpdatePreview(null);
    if (plan.status === "unchanged") {
      onIssue(null);
      return false;
    }
    if (plan.status === "blocked") {
      onIssue(manipulationIssueKey(plan.diagnosticCode));
      return false;
    }
    if (!onCommitOperations([plan.operation], { kind: "opening", id: openingId })) {
      onIssue("geometry.editor.issue.rejected");
      return false;
    }
    onIssue(null);
    return true;
  };

  const previewOpeningUpdate = (openingId: string, requested: { offset: number; width: number }): OpeningUpdatePlan => {
    const plan = planOpeningUpdateWithContext(openingManipulationContext, level, openingId, requested);
    setOpeningUpdatePreview(plan.status === "ready" ? plan : null);
    if (plan.status === "blocked") onIssue(manipulationIssueKey(plan.diagnosticCode));
    else onIssue(null);
    return plan;
  };

  const wallAxisForPointer = (gesture: WallDragGesture, point: MetricPoint): number => (
    gesture.initialAxisPosition
    + (gesture.orientation === "horizontal" ? point.y : point.x)
    - gesture.initialPointerAxis
  );

  const openingOffsetForPointer = (gesture: OpeningDragGesture, point: MetricPoint): number | null => {
    const frame = geometryWallFrame(level, gesture.wallId);
    if (!frame) return null;
    const projectedDistance = projectedOpeningOffset(frame, 0, point);
    const requested = gesture.initialOffset + projectedDistance - gesture.initialProjectedDistance;
    return Math.max(0, Math.min(frame.length - gesture.width, requested));
  };

  const commitWall = (start: MetricPoint, endCandidate: MetricPoint) => {
    const plan = planTopologyAwareWallDrawWithContext(wallTopologyContext, level, start, endCandidate, id);
    setWallDrawPreview(null);
    if (plan.status === "unchanged") {
      onIssue(topologyIssueKey(plan.diagnosticCode));
      return;
    }
    if (plan.status === "blocked") {
      onIssue(topologyIssueKey(plan.diagnosticCode));
      return;
    }
    if (!onCommitOperations(plan.operations, { kind: "wall", id: plan.selectAfterWallId })) {
      onIssue("geometry.editor.issue.rejected");
      return;
    }
    onIssue(null);
  };

  const previewWall = (start: MetricPoint, endCandidate: MetricPoint): void => {
    let sequence = 0;
    const previewId = (prefix: "vertex" | "wall"): string => {
      let candidate = "";
      do candidate = `preview-${prefix}-${++sequence}`;
      while (wallTopologyContext.allIds.has(candidate));
      return candidate;
    };
    const plan = planTopologyAwareWallDrawWithContext(
      wallTopologyContext,
      level,
      start,
      endCandidate,
      previewId,
    );
    setWallDrawPreview(plan);
    onIssue(plan.status === "blocked" ? topologyIssueKey(plan.diagnosticCode) : null);
  };

  const previewWallSplit = (wall: GeometryWall, requestedPoint: MetricPoint): void => {
    let sequence = 0;
    const previewId = (prefix: "vertex" | "wall"): string => {
      let candidate = "";
      do candidate = `preview-${prefix}-${++sequence}`;
      while (wallTopologyContext.allIds.has(candidate));
      return candidate;
    };
    const plan = planWallSplitWithContext(
      wallTopologyContext,
      level,
      wall.id,
      requestedPoint,
      previewId,
    );
    setWallSplitPreview(plan);
    onIssue(plan.status === "blocked" ? topologyIssueKey(plan.diagnosticCode) : null);
  };

  const zonePreviewId = (): string => {
    let sequence = 0;
    let candidate = "";
    do candidate = `preview-zone-region-${++sequence}`;
    while (zoneTopologyContext.allIds.has(candidate));
    return candidate;
  };

  const planZoneAtPoint = (point: MetricPoint, preview: boolean): ZoneCreatePlan | ZonePartitionPlan => {
    if (!selectedZoneId) {
      return { status: "blocked", diagnosticCode: "geometry_zone_target_missing" };
    }
    const regionIdFactory = preview ? zonePreviewId : () => id("zone-region");
    if (tool === "partition") {
      if (selection?.kind !== "zone") return { status: "blocked", diagnosticCode: "geometry_zone_partition_source_missing" };
      return planZonePartitionWithContext(
        zoneTopologyContext, level, selection.id, selectedZoneId, snapMetricPoint(point), regionIdFactory,
      );
    }
    return planZoneRegionFromPointWithContext(
      zoneTopologyContext, level, selectedZoneId, snapMetricPoint(point), regionIdFactory,
    );
  };

  const previewZoneAtPoint = (point: MetricPoint): void => {
    const plan = planZoneAtPoint(point, true);
    setZoneTopologyPreview(plan.status === "ready" ? plan : null);
    onIssue(plan.status === "blocked" ? zoneTopologyIssueKey(plan.diagnosticCode) : null);
  };

  const commitZoneAtPoint = (point: MetricPoint): void => {
    const plan = planZoneAtPoint(point, false);
    setZoneTopologyPreview(null);
    if (plan.status !== "ready") {
      onIssue(zoneTopologyIssueKey(plan.diagnosticCode));
      return;
    }
    const region = "newRegion" in plan ? plan.newRegion : plan.region;
    if (!onCommitZoneRegion([plan.operation], region, { kind: "zone", id: region.id })) {
      onIssue("geometry.editor.issue.rejected");
      return;
    }
    onIssue(null);
  };

  const previewZoneMerge = (region: GeometryZoneRegion): void => {
    if (selection?.kind !== "zone" || selection.id === region.id) return;
    const plan = planZoneMergeWithContext(zoneTopologyContext, level, selection.id, region.id);
    setZoneTopologyPreview(plan.status === "ready" ? plan : null);
    onIssue(plan.status === "blocked" ? zoneTopologyIssueKey(plan.diagnosticCode) : null);
  };

  const commitZoneMerge = (region: GeometryZoneRegion): void => {
    if (selection?.kind !== "zone") {
      onSelect({ kind: "zone", id: region.id });
      onIssue("geometry.editor.issue.zoneMergeSelectSource");
      return;
    }
    const plan = planZoneMergeWithContext(zoneTopologyContext, level, selection.id, region.id);
    setZoneTopologyPreview(null);
    if (plan.status !== "ready") {
      onIssue(zoneTopologyIssueKey(plan.diagnosticCode));
      return;
    }
    if (!onCommitOperations([plan.operation], { kind: "zone", id: plan.keptRegion.id })) {
      onIssue("geometry.editor.issue.rejected");
      return;
    }
    onIssue(null);
  };

  const handleStageClick = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (event.target !== event.target.getStage()) return;
    if (tool === "select") {
      onSelect(null);
      return;
    }
    const point = geometryPoint(event.target.getStage()!, viewport);
    if (!point) return;
    if (tool === "calibrate_underlay") {
      onCalibrationPoint(point);
      onIssue(null);
      return;
    }
    if (tool === "zone" || tool === "partition") {
      commitZoneAtPoint(point);
      return;
    }
    if (tool === "vertical_opening") {
      if (!verticalTargetLevelId) {
        onIssue("geometry.editor.issue.verticalTargetRequired");
        return;
      }
      const plan = planVerticalOpeningPlacement(
        geometry,
        level.id,
        verticalTargetLevelId,
        snapMetricPoint(point),
        verticalOpeningKind,
        () => id("vertical-opening"),
      );
      if (plan.status !== "ready") {
        onIssue(verticalOpeningIssueKey(plan.diagnosticCode));
        return;
      }
      if (!onCommitOperations([plan.operation], { kind: "vertical_opening", id: plan.opening.id })) {
        onIssue("geometry.editor.issue.rejected");
        return;
      }
      onIssue(null);
      return;
    }
    if (!["wall", "dimension"].includes(tool)) return;
    const snapped = snapMetricPoint(point);
    if (!firstPoint) {
      setFirstPoint(snapped);
      setHoverPoint(snapped);
      onIssue(null);
      return;
    }
    if (tool === "wall") commitWall(firstPoint, snapped);
    else setMeasurements((current) => [...current, { id: id("dimension"), start: firstPoint, end: snapped }]);
    setFirstPoint(null);
    setHoverPoint(null);
  };

  const handleZoneAction = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>, region: GeometryZoneRegion) => {
    event.cancelBubble = true;
    if (tool === "merge") {
      commitZoneMerge(region);
      return;
    }
    if (tool === "zone" || tool === "partition") {
      const point = geometryPoint(event.target.getStage()!, viewport);
      if (point) commitZoneAtPoint(point);
      return;
    }
    onSelect({ kind: "zone", id: region.id });
  };

  const handleWallAction = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>, wall: GeometryWall) => {
    event.cancelBubble = true;
    if (tool === "split") {
      const point = geometryPoint(event.target.getStage()!, viewport);
      if (!point) return;
      const plan = planWallSplitWithContext(wallTopologyContext, level, wall.id, point, id);
      setWallSplitPreview(null);
      if (plan.status !== "ready") {
        onIssue(topologyIssueKey(plan.diagnosticCode));
        return;
      }
      if (!onCommitOperations([plan.operation], { kind: "vertex", id: plan.operation.parameters.vertex.id })) {
        onIssue("geometry.editor.issue.rejected");
        return;
      }
      onIssue(null);
      return;
    }
    if (tool === "select") {
      onSelect({ kind: "wall", id: wall.id });
      return;
    }
    if (tool !== "door" && tool !== "window") return;
    const point = geometryPoint(event.target.getStage()!, viewport);
    const endpoints = wallEndpoints(wall, vertices);
    if (!point || !endpoints) return;
    const [start, end] = endpoints;
    const length = wallLength(wall, vertices);
    const projected = start.x === end.x ? Math.abs(point.y - start.y) : Math.abs(point.x - start.x);
    const desiredWidth = tool === "door" ? 900 : 1_800;
    const width = Math.max(500, Math.min(desiredWidth, Math.floor((length - 200) / 50) * 50));
    if (width < 500 || length < width + 200) {
      onIssue("geometry.editor.issue.wallTooShort");
      return;
    }
    const offset = Math.max(100, Math.min(length - width - 100, Math.round((projected - width / 2) / 50) * 50));
    const openingId = id(tool);
    const opening: GeometryOpening = {
      id: openingId,
      wall_id: wall.id,
      kind: tool,
      offset,
      width,
      swing: tool === "door" ? "right" : "none",
      adjacent_zone_ids: adjacentZones(wall, level),
    };
    if (!onCommitOperations([{ operation: "place_opening", parameters: { level_id: level.id, opening } }], { kind: "opening", id: openingId })) onIssue("geometry.editor.issue.rejected");
    else onIssue(null);
  };

  const handleOpeningAction = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>, opening: GeometryOpening) => {
    event.cancelBubble = true;
    if (tool !== "flow_path") {
      onSelect({ kind: "opening", id: opening.id });
      return;
    }
    onSelect({ kind: "opening", id: opening.id });
    onLinkWallFlowPath(opening.id);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setFirstPoint(null);
      setHoverPoint(null);
      setVertexMovePreview(null);
      setOpeningUpdatePreview(null);
      setZoneTopologyPreview(null);
      wallDragGesture.current = null;
      openingDragGesture.current = null;
      onSelect(null);
      onIssue(null);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && tool === "select" && selection?.kind === "vertex"
      && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      const vertex = level.vertices.find((item) => item.id === selection.id);
      if (!vertex) return;
      event.preventDefault();
      const increment = event.shiftKey ? DIRECT_MANIPULATION_SNAP_MM * 4 : DIRECT_MANIPULATION_SNAP_MM;
      const requested = {
        x: vertex.x + (event.key === "ArrowLeft" ? -increment : event.key === "ArrowRight" ? increment : 0),
        y: vertex.y + (event.key === "ArrowDown" ? -increment : event.key === "ArrowUp" ? increment : 0),
      };
      commitVertexMove(vertex.id, requested);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && tool === "select" && selection?.kind === "wall"
      && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      const frame = geometryWallFrame(level, selection.id);
      if (!frame) return;
      const increment = event.shiftKey ? DIRECT_MANIPULATION_SNAP_MM * 4 : DIRECT_MANIPULATION_SNAP_MM;
      const delta = frame.orientation === "horizontal"
        ? event.key === "ArrowUp" ? increment : event.key === "ArrowDown" ? -increment : 0
        : event.key === "ArrowRight" ? increment : event.key === "ArrowLeft" ? -increment : 0;
      if (!delta) return;
      event.preventDefault();
      commitWallTranslation(frame.wall.id, frame.axisPosition + delta);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && tool === "select" && selection?.kind === "opening"
      && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      const opening = level.openings.find((item) => item.id === selection.id);
      const frame = opening ? geometryWallFrame(level, opening.wall_id) : null;
      if (!opening || !frame) return;
      const increment = event.shiftKey ? OPENING_MANIPULATION_SNAP_MM * 5 : OPENING_MANIPULATION_SNAP_MM;
      const worldDelta = {
        x: event.key === "ArrowLeft" ? -increment : event.key === "ArrowRight" ? increment : 0,
        y: event.key === "ArrowDown" ? -increment : event.key === "ArrowUp" ? increment : 0,
      };
      const alongWall = Math.round(
        (worldDelta.x * (frame.end.x - frame.start.x) + worldDelta.y * (frame.end.y - frame.start.y)) / frame.length,
      );
      if (!alongWall) return;
      event.preventDefault();
      commitOpeningUpdate(opening.id, { offset: opening.offset + alongWall, width: opening.width });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? onRedo() : onUndo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      onRedo();
      return;
    }
    if (!event.ctrlKey && !event.metaKey && tool === "select" && selection?.kind === "wall"
      && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      const committed = onCommitOperations([{
        operation: "delete_wall",
        parameters: { level_id: level.id, wall_id: selection.id },
      }], null);
      onIssue(committed ? null : "geometry.editor.issue.trimRejected");
    }
  };

  const previewEnd = firstPoint && hoverPoint
    ? tool === "wall" ? (wallDrawPreview?.end ?? orthogonalEndpoint(firstPoint, hoverPoint)) : hoverPoint
    : null;
  const zonePreviewRegions = zoneTopologyPreview?.status === "ready"
    ? "region" in zoneTopologyPreview
      ? [zoneTopologyPreview.region]
      : "newRegion" in zoneTopologyPreview
        ? [zoneTopologyPreview.sourceRegion, zoneTopologyPreview.newRegion]
        : [{ ...zoneTopologyPreview.keptRegion, outer_vertex_ids: zoneTopologyPreview.mergedOuterVertexIds }]
    : [];
  const scaleBar = metricScaleBar(viewport.scale);

  return (
    <div ref={rootRef} className="geometry-konva-root" data-tool={tool} tabIndex={0} onKeyDown={onKeyDown} aria-label="Building geometry canvas">
      <Stage
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={tool === "pan"}
        onDragEnd={(event) => {
          if (event.target === event.target.getStage()) {
            onViewportChange({ ...viewport, x: event.target.x(), y: event.target.y() });
          }
        }}
        onWheel={(event) => {
          event.evt.preventDefault();
          const pointer = event.target.getStage()?.getPointerPosition();
          if (!pointer) return;
          const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewport.scale * (event.evt.deltaY > 0 ? 0.9 : 1.1)));
          const world = { x: (pointer.x - viewport.x) / viewport.scale, y: (pointer.y - viewport.y) / viewport.scale };
          onViewportChange({ x: pointer.x - world.x * nextScale, y: pointer.y - world.y * nextScale, scale: nextScale });
        }}
        onMouseMove={(event) => {
          const point = geometryPoint(event.target.getStage()!, viewport);
          if (!point) return;
          if (tool === "zone" || tool === "partition") {
            previewZoneAtPoint(point);
            return;
          }
          if (!firstPoint) return;
          const snapped = snapMetricPoint(point);
          setHoverPoint(snapped);
          if (tool === "wall") previewWall(firstPoint, snapped);
        }}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer listening={false}>
          <Rect x={-viewport.x / viewport.scale} y={-viewport.y / viewport.scale} width={size.width / viewport.scale} height={size.height / viewport.scale} fill={palette.canvas} />
          {layers.grid ? <Grid size={size} viewport={viewport} palette={palette} /> : null}
        </Layer>
        {underlay?.visible && underlayImage ? (
          <Layer listening={false} opacity={underlay.opacity_percent / 100}>
            <Group
              x={underlay.origin_x_mm}
              y={-underlay.origin_y_mm}
              rotation={-underlay.rotation_millidegrees / 1_000}
              scaleX={underlay.micrometres_per_pixel / 1_000}
              scaleY={underlay.micrometres_per_pixel / 1_000}
            >
              <KonvaImage
                image={underlayImage}
                x={-underlay.pixel_origin_x_milli / 1_000}
                y={-underlay.pixel_origin_y_milli / 1_000}
                width={underlay.pixel_width}
                height={underlay.pixel_height}
              />
            </Group>
          </Layer>
        ) : null}
        {referenceLevel ? (
          <Layer listening={false} opacity={0.28}>
            {layers.walls ? referenceLevel.walls.map((wall) => {
              const endpoints = wallEndpoints(wall, referenceVertices);
              if (!endpoints) return null;
              const [start, end] = endpoints.map(screenPoint) as [MetricPoint, MetricPoint];
              return <Line key={`reference-${wall.id}`} points={[start.x, start.y, end.x, end.y]} stroke={palette.lineMuted} strokeWidth={Math.max(120, wall.thickness ?? 120)} dash={[320, 180]} />;
            }) : null}
            {layers.openings ? referenceLevel.openings.map((opening) => {
              const wall = referenceWalls.get(opening.wall_id);
              if (!wall) return null;
              const start = openingPoint(opening, wall, referenceVertices);
              const end = openingPoint(opening, wall, referenceVertices, true);
              if (!start || !end) return null;
              const screenStart = screenPoint(start);
              const screenEnd = screenPoint(end);
              return <Line key={`reference-${opening.id}`} points={[screenStart.x, screenStart.y, screenEnd.x, screenEnd.y]} stroke={palette.opening} strokeWidth={180} />;
            }) : null}
          </Layer>
        ) : null}
        {layers.zones ? (
          <Layer>
            {displayLevel.zone_regions.map((region) => {
              const points = region.outer_vertex_ids.flatMap((vertexId) => {
                const vertex = vertices.get(vertexId);
                return vertex ? [vertex.x, -vertex.y] : [];
              });
              const center = screenPoint(polygonCenter(region, vertices));
              const area = polygonAreaM2(region, vertices);
              const selected = selection?.kind === "zone" && selection.id === region.id;
              return (
                <Group
                  key={region.id}
                  onMouseMove={(event) => {
                    if (tool === "merge") previewZoneMerge(region);
                    else if (tool === "zone" || tool === "partition") {
                      const point = geometryPoint(event.target.getStage()!, viewport);
                      if (point) previewZoneAtPoint(point);
                    }
                  }}
                  onMouseLeave={() => { if (["zone", "partition", "merge"].includes(tool)) setZoneTopologyPreview(null); }}
                  onClick={(event) => handleZoneAction(event, region)}
                  onTap={(event) => handleZoneAction(event, region)}
                >
                  <Line points={points} closed fill={palette.zoneFill} stroke={selected ? palette.selection : palette.lineMuted} strokeWidth={(selected ? 4 : 1) / viewport.scale} dash={selected ? [10 / viewport.scale, 6 / viewport.scale] : undefined} />
                  {layers.labels ? (
                    <>
                      <Text x={center.x - 1_200} y={center.y - 250} width={2_400} align="center" text={zoneLabels.get(region.semantic_zone_id) ?? region.semantic_zone_id} fontSize={220} fontStyle="bold" fill={palette.panelText} listening={false} />
                      <Text x={center.x - 1_200} y={center.y + 35} width={2_400} align="center" text={`${area.toFixed(1)} m²`} fontSize={155} fill={palette.lineMuted} listening={false} />
                    </>
                  ) : null}
                </Group>
              );
            })}
          </Layer>
        ) : null}
        {layers.openings ? (
          <Layer>
            {visibleVerticalOpenings.map((opening) => {
              const anchor = verticalAnchorByOpeningId.get(opening.id);
              const selected = (selection?.kind === "vertical_opening" && selection.id === opening.id)
                || (selection?.kind === "vertical_flow_path" && selection.id === anchor?.id);
              const currentIsLower = opening.lower_level_id === level.id;
              const targetLevelId = currentIsLower ? opening.upper_level_id : opening.lower_level_id;
              const direction = currentIsLower ? "↑" : "↓";
              const label = `${direction} ${levelNameById.get(targetLevelId) ?? targetLevelId}`;
              return (
                <Group
                  key={opening.id}
                  x={opening.x}
                  y={-(opening.y + opening.depth)}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onSelect({ kind: anchor ? "vertical_flow_path" : "vertical_opening", id: anchor?.id ?? opening.id });
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onSelect({ kind: anchor ? "vertical_flow_path" : "vertical_opening", id: anchor?.id ?? opening.id });
                  }}
                >
                  <Rect
                    width={opening.width}
                    height={opening.depth}
                    fill={palette.zoneFill}
                    stroke={selected ? palette.selection : anchor ? palette.flow : palette.opening}
                    strokeWidth={selected ? 75 : 50}
                    dash={[180, 100]}
                  />
                  <Line
                    points={[opening.width / 2, opening.depth * 0.72, opening.width / 2, opening.depth * 0.28]}
                    stroke={anchor ? palette.flow : palette.opening}
                    strokeWidth={55}
                  />
                  <Line
                    points={currentIsLower
                      ? [opening.width * 0.36, opening.depth * 0.42, opening.width / 2, opening.depth * 0.26, opening.width * 0.64, opening.depth * 0.42]
                      : [opening.width * 0.36, opening.depth * 0.58, opening.width / 2, opening.depth * 0.74, opening.width * 0.64, opening.depth * 0.58]}
                    stroke={anchor ? palette.flow : palette.opening}
                    strokeWidth={55}
                  />
                  {layers.labels ? (
                    <Text
                      x={-250}
                      y={opening.depth + 90}
                      width={opening.width + 500}
                      align="center"
                      text={`${opening.kind.replace("_", " ")} · ${label}`}
                      fontSize={145}
                      fontStyle="bold"
                      fill={palette.panelText}
                      listening={false}
                    />
                  ) : null}
                </Group>
              );
            })}
          </Layer>
        ) : null}
        <Layer>
          {layers.walls ? (
          <>
            {displayLevel.walls.map((wall) => {
              const endpoints = wallEndpoints(wall, vertices);
              if (!endpoints) return null;
              const [start, end] = endpoints.map(screenPoint) as [MetricPoint, MetricPoint];
              const selected = selection?.kind === "wall" && selection.id === wall.id;
              const frame = geometryWallFrame(displayLevel, wall.id);
              return (
                <Line
                  key={wall.id}
                  points={[start.x, start.y, end.x, end.y]}
                  stroke={selected ? palette.selection : palette.line}
                  strokeWidth={selected ? Math.max(240, wall.thickness ?? 160) : wall.thickness ?? 160}
                  lineCap="square"
                  hitStrokeWidth={Math.max(420, wall.thickness ?? 160)}
                  draggable={tool === "select"}
                  onMouseEnter={(event) => {
                    event.target.getStage()!.container().style.cursor = tool === "split"
                      ? "crosshair"
                      : tool === "select"
                        ? frame?.orientation === "horizontal" ? "ns-resize" : "ew-resize"
                        : tool === "door" || tool === "window" ? "cell" : "pointer";
                  }}
                  onMouseMove={(event) => {
                    if (tool !== "split") return;
                    const point = geometryPoint(event.target.getStage()!, viewport);
                    if (point) previewWallSplit(wall, point);
                  }}
                  onMouseLeave={(event) => {
                    event.target.getStage()!.container().style.cursor = "";
                    if (tool === "split") {
                      setWallSplitPreview(null);
                      onIssue(null);
                    }
                  }}
                  onClick={(event) => handleWallAction(event, wall)}
                  onTap={(event) => handleWallAction(event, wall)}
                  onDragStart={(event) => {
                    event.cancelBubble = true;
                    rootRef.current?.focus();
                    onSelect({ kind: "wall", id: wall.id });
                    const baselineFrame = geometryWallFrame(level, wall.id);
                    const point = geometryPoint(event.target.getStage()!, viewport);
                    if (!baselineFrame || !point) {
                      wallDragGesture.current = null;
                      onIssue("geometry.editor.issue.moveUnavailable");
                      return;
                    }
                    wallDragGesture.current = {
                      wallId: wall.id,
                      orientation: baselineFrame.orientation,
                      initialPointerAxis: baselineFrame.orientation === "horizontal" ? point.y : point.x,
                      initialAxisPosition: baselineFrame.axisPosition,
                    };
                    event.target.position({ x: 0, y: 0 });
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true;
                    const gesture = wallDragGesture.current;
                    const point = geometryPoint(event.target.getStage()!, viewport);
                    event.target.position({ x: 0, y: 0 });
                    if (!gesture || !point) return;
                    previewWallTranslation(gesture.wallId, wallAxisForPointer(gesture, point));
                  }}
                  onDragEnd={(event) => {
                    event.cancelBubble = true;
                    const gesture = wallDragGesture.current;
                    const point = geometryPoint(event.target.getStage()!, viewport);
                    event.target.position({ x: 0, y: 0 });
                    wallDragGesture.current = null;
                    if (!gesture || !point) {
                      setVertexMovePreview(null);
                      return;
                    }
                    commitWallTranslation(gesture.wallId, wallAxisForPointer(gesture, point));
                  }}
                />
              );
            })}
          </>
        ) : null}
        {layers.openings ? (
          <>
            {displayLevel.openings.map((opening) => {
              const wall = displayLevel.walls.find((item) => item.id === opening.wall_id);
              if (!wall) return null;
              const startMetric = openingPoint(opening, wall, vertices);
              const endMetric = openingPoint(opening, wall, vertices, true);
              if (!startMetric || !endMetric) return null;
              const start = screenPoint(startMetric);
              const end = screenPoint(endMetric);
              const selected = selection?.kind === "opening" && selection.id === opening.id;
              const swingDirection = opening.swing === "left" ? -1 : 1;
              const perpendicular = start.y === end.y
                ? { x: 0, y: opening.kind === "door" ? -opening.width * swingDirection : 90 }
                : { x: opening.kind === "door" ? opening.width * swingDirection : 90, y: 0 };
              const openEnd = { x: start.x + perpendicular.x, y: start.y + perpendicular.y };
              return (
                <Group
                  key={opening.id}
                  draggable={tool === "select"}
                  onMouseEnter={(event) => { event.target.getStage()!.container().style.cursor = "grab"; }}
                  onMouseLeave={(event) => { event.target.getStage()!.container().style.cursor = ""; }}
                  onClick={(event) => handleOpeningAction(event, opening)}
                  onTap={(event) => handleOpeningAction(event, opening)}
                  onDragStart={(event) => {
                    event.cancelBubble = true;
                    rootRef.current?.focus();
                    onSelect({ kind: "opening", id: opening.id });
                    const baselineOpening = level.openings.find((item) => item.id === opening.id);
                    const frame = baselineOpening ? geometryWallFrame(level, baselineOpening.wall_id) : null;
                    const point = geometryPoint(event.target.getStage()!, viewport);
                    if (!baselineOpening || !frame || !point) {
                      openingDragGesture.current = null;
                      onIssue("geometry.editor.issue.openingUnavailable");
                      return;
                    }
                    openingDragGesture.current = {
                      openingId: baselineOpening.id,
                      wallId: baselineOpening.wall_id,
                      initialProjectedDistance: projectedOpeningOffset(frame, 0, point),
                      initialOffset: baselineOpening.offset,
                      width: baselineOpening.width,
                    };
                    event.target.position({ x: 0, y: 0 });
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true;
                    const gesture = openingDragGesture.current;
                    const point = geometryPoint(event.target.getStage()!, viewport);
                    event.target.position({ x: 0, y: 0 });
                    if (!gesture || !point) return;
                    const offset = openingOffsetForPointer(gesture, point);
                    if (offset !== null) previewOpeningUpdate(gesture.openingId, { offset, width: gesture.width });
                  }}
                  onDragEnd={(event) => {
                    event.cancelBubble = true;
                    const gesture = openingDragGesture.current;
                    const point = geometryPoint(event.target.getStage()!, viewport);
                    event.target.position({ x: 0, y: 0 });
                    openingDragGesture.current = null;
                    if (!gesture || !point) {
                      setOpeningUpdatePreview(null);
                      return;
                    }
                    const offset = openingOffsetForPointer(gesture, point);
                    if (offset !== null) commitOpeningUpdate(gesture.openingId, { offset, width: gesture.width });
                  }}
                >
                  <Line points={[start.x, start.y, end.x, end.y]} stroke={palette.canvas} strokeWidth={Math.max(260, (wall.thickness ?? 160) + 80)} hitStrokeWidth={500} />
                  {opening.kind === "window" ? (
                    <>
                      <Line points={[start.x + perpendicular.x, start.y + perpendicular.y, end.x + perpendicular.x, end.y + perpendicular.y]} stroke={selected ? palette.selection : palette.opening} strokeWidth={70} />
                      <Line points={[start.x - perpendicular.x, start.y - perpendicular.y, end.x - perpendicular.x, end.y - perpendicular.y]} stroke={selected ? palette.selection : palette.opening} strokeWidth={70} />
                    </>
                  ) : (
                    <>
                      <Line points={[start.x, start.y, openEnd.x, openEnd.y]} stroke={selected ? palette.selection : palette.opening} strokeWidth={70} />
                      <Line points={doorSwingArc(start, end, openEnd)} stroke={selected ? palette.selection : palette.opening} strokeWidth={35} dash={[90, 65]} />
                      <Text x={(start.x + end.x) / 2 - 360} y={(start.y + end.y) / 2 + 120} width={720} align="center" text={`${(opening.width / 1_000).toFixed(2)} m`} fontSize={125} fill={palette.lineMuted} listening={false} />
                    </>
                  )}
                </Group>
              );
            })}
          </>
        ) : null}
        {layers.airflow ? (
          <>
            {displayLevel.flow_path_anchors.map((anchor) => {
              const opening = displayLevel.openings.find((item) => item.id === anchor.opening_id);
              const wall = opening ? displayLevel.walls.find((item) => item.id === opening.wall_id) : null;
              const startMetric = opening && wall ? openingPoint(opening, wall, vertices) : null;
              const endMetric = opening && wall ? openingPoint(opening, wall, vertices, true) : null;
              if (!startMetric || !endMetric) return null;
              const center = screenPoint({ x: (startMetric.x + endMetric.x) / 2, y: (startMetric.y + endMetric.y) / 2 });
              const selected = selection?.kind === "flow_path" && selection.id === anchor.id;
              return (
                <Group key={anchor.id} x={center.x} y={center.y} onClick={(event) => { event.cancelBubble = true; onSelect({ kind: "flow_path", id: anchor.id }); }}>
                  <Circle radius={170} fill={palette.canvas} stroke={selected ? palette.selection : palette.flow} strokeWidth={60} />
                  <Text
                    x={-150}
                    y={anchor.exterior_side === "none" ? -100 : -82}
                    width={300}
                    align="center"
                    text={anchor.exterior_side === "none" ? "↔" : "EXT"}
                    fontSize={anchor.exterior_side === "none" ? 210 : 115}
                    fontStyle="bold"
                    fill={selected ? palette.selection : palette.flow}
                  />
                </Group>
              );
            })}
          </>
        ) : null}
        </Layer>
        {tool === "calibrate_underlay" ? (
          <Layer>
            <Rect
              x={-viewport.x / viewport.scale}
              y={-viewport.y / viewport.scale}
              width={size.width / viewport.scale}
              height={size.height / viewport.scale}
              fill="rgba(0,0,0,0.001)"
              onClick={(event) => {
                const point = geometryPoint(event.target.getStage()!, viewport);
                if (point) onCalibrationPoint(point);
              }}
              onTap={(event) => {
                const point = geometryPoint(event.target.getStage()!, viewport);
                if (point) onCalibrationPoint(point);
              }}
            />
          </Layer>
        ) : null}
        <Layer listening={false}>
          {calibrationPoints.length ? (
            <Group>
              {calibrationPoints.length === 2 ? <Line points={calibrationPoints.flatMap((point) => [point.x, -point.y])} stroke={palette.selection} strokeWidth={3 / viewport.scale} dash={[10 / viewport.scale, 7 / viewport.scale]} /> : null}
              {calibrationPoints.map((point, index) => (
                <Group key={`${point.x}-${point.y}-${index}`} x={point.x} y={-point.y}>
                  <Circle radius={8 / viewport.scale} fill={palette.canvas} stroke={palette.selection} strokeWidth={3 / viewport.scale} />
                  <Text text={String(index + 1)} x={10 / viewport.scale} y={-16 / viewport.scale} fontSize={14 / viewport.scale} fill={palette.selection} />
                </Group>
              ))}
            </Group>
          ) : null}
        {layers.dimensions ? (
          <>
            {measurements.map((measurement) => {
              const start = screenPoint(measurement.start);
              const end = screenPoint(measurement.end);
              const length = Math.hypot(measurement.end.x - measurement.start.x, measurement.end.y - measurement.start.y);
              const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
              return (
                <Group key={measurement.id}>
                  <Line points={[start.x, start.y, end.x, end.y]} stroke={palette.lineMuted} strokeWidth={35} dash={[120, 70]} />
                  <Text x={center.x - 550} y={center.y - 180} width={1_100} align="center" text={`${(length / 1_000).toFixed(2)} m`} fontSize={180} fill={palette.panelText} />
                </Group>
              );
            })}
          </>
        ) : null}
        {firstPoint && previewEnd ? (
          <>
            {tool === "wall" && wallDrawPreview?.status === "ready" ? (
              <>
                {wallDrawPreview.segments.map((segment) => (
                  <Line key={segment.id} points={[segment.start.x, -segment.start.y, segment.end.x, -segment.end.y]} stroke={palette.selection} strokeWidth={90} dash={[140, 80]} />
                ))}
                {wallDrawPreview.intersections.map((point) => (
                  <Circle key={`${point.x}:${point.y}`} x={point.x} y={-point.y} radius={105} fill={palette.canvas} stroke={palette.selection} strokeWidth={45} />
                ))}
              </>
            ) : <Line points={[firstPoint.x, -firstPoint.y, previewEnd.x, -previewEnd.y]} stroke={palette.selection} strokeWidth={60} dash={[140, 80]} />}
          </>
        ) : null}
        {zonePreviewRegions.map((region, index) => {
          const points = region.outer_vertex_ids.flatMap((vertexId) => {
            const vertex = vertices.get(vertexId);
            return vertex ? [vertex.x, -vertex.y] : [];
          });
          return (
            <Line
              key={`zone-topology-preview-${region.id}-${index}`}
              points={points}
              closed
              fill={index === 0 ? palette.zoneFill : "transparent"}
              stroke={palette.selection}
              strokeWidth={70}
              dash={[160, 90]}
              opacity={0.88}
            />
          );
        })}
        {tool === "split" && wallSplitPreview?.status === "ready" ? (
          <Group x={wallSplitPreview.point.x} y={-wallSplitPreview.point.y}>
            <Circle radius={130} fill={palette.canvas} stroke={palette.selection} strokeWidth={50} />
            <Line points={[-82, 0, 82, 0]} stroke={palette.selection} strokeWidth={38} />
            <Line points={[0, -82, 0, 82]} stroke={palette.selection} strokeWidth={38} />
          </Group>
        ) : null}
        {aiDraftPreview ? (
          <Group opacity={0.86}>
            {aiDraftPreview.vertices?.map((vertex) => {
              const selected = vertex.selected !== false;
              return (
                <Circle
                  key={vertex.id}
                  x={vertex.point.x}
                  y={-vertex.point.y}
                  radius={selected ? 230 : 170}
                  fill={selected ? "#7c5cff" : "#c6bddf"}
                  stroke={selected ? "#4f37c5" : "#978cad"}
                  strokeWidth={selected ? 70 : 48}
                  opacity={selected ? 0.95 : 0.42}
                  onMouseEnter={(event) => { event.target.getStage()!.container().style.cursor = vertex.operationIndex === undefined ? "" : "pointer"; }}
                  onMouseLeave={(event) => { event.target.getStage()!.container().style.cursor = ""; }}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    if (vertex.operationIndex !== undefined) onToggleAiOperation(vertex.operationIndex);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    if (vertex.operationIndex !== undefined) onToggleAiOperation(vertex.operationIndex);
                  }}
                />
              );
            })}
            {aiDraftPreview.zones.map((zone) => (
              <Line
                key={zone.id}
                points={zone.points.flatMap((point) => [point.x, -point.y])}
                closed
                fill={zone.selected === false ? "rgba(198, 189, 223, 0.08)" : "rgba(124, 92, 255, 0.16)"}
                stroke={zone.selected === false ? "#978cad" : "#7c5cff"}
                strokeWidth={zone.selected === false ? 55 : 90}
                dash={[220, 120]}
                opacity={zone.selected === false ? 0.38 : 1}
                onClick={(event) => {
                  event.cancelBubble = true;
                  if (zone.operationIndex !== undefined) onToggleAiOperation(zone.operationIndex);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  if (zone.operationIndex !== undefined) onToggleAiOperation(zone.operationIndex);
                }}
              />
            ))}
            {aiDraftPreview.walls.map((wall) => (
              <Line
                key={wall.id}
                points={[wall.start.x, -wall.start.y, wall.end.x, -wall.end.y]}
                stroke={wall.selected === false ? "#978cad" : "#7c5cff"}
                strokeWidth={wall.selected === false ? 95 : 150}
                dash={[220, 120]}
                lineCap="square"
                opacity={wall.selected === false ? 0.38 : 1}
                hitStrokeWidth={Math.max(260, wall.selected === false ? 95 : 150)}
                onClick={(event) => {
                  event.cancelBubble = true;
                  if (wall.operationIndex !== undefined) onToggleAiOperation(wall.operationIndex);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  if (wall.operationIndex !== undefined) onToggleAiOperation(wall.operationIndex);
                }}
              />
            ))}
            {aiDraftPreview.openings.map((opening) => (
              <Line
                key={opening.id}
                points={[opening.start.x, -opening.start.y, opening.end.x, -opening.end.y]}
                stroke={opening.selected === false ? "#978cad" : "#6d5dfc"}
                strokeWidth={opening.selected === false ? 170 : 260}
                dash={[120, 75]}
                lineCap="round"
                opacity={opening.selected === false ? 0.38 : 1}
                hitStrokeWidth={Math.max(320, opening.selected === false ? 170 : 260)}
                onClick={(event) => {
                  event.cancelBubble = true;
                  if (opening.operationIndex !== undefined) onToggleAiOperation(opening.operationIndex);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  if (opening.operationIndex !== undefined) onToggleAiOperation(opening.operationIndex);
                }}
              />
            ))}
            <Text
              x={7_450}
              y={-4_820}
              width={2_150}
              align="center"
              text={`Draft · ${aiDraftPreview.operationCount} operations`}
              fontSize={175}
              fontStyle="bold"
              fill="#6447e8"
              padding={90}
              listening={false}
            />
          </Group>
        ) : null}
        {vertexMovePreview ? (
          <>
            {vertexMovePreview.movedVertices.map((vertex) => {
              const source = level.vertices.find((item) => item.id === vertex.id);
              return source ? (
                <Line
                  key={`vertex-move-guide-${vertex.id}`}
                  points={[source.x, -source.y, vertex.x, -vertex.y]}
                  stroke={palette.selection}
                  strokeWidth={35}
                  dash={[120, 80]}
                  opacity={0.72}
                />
              ) : null;
            })}
          </>
        ) : null}
        </Layer>
        {tool === "select" && handleVertexIds.size ? (
          <Layer>
            {displayLevel.vertices.filter((vertex) => handleVertexIds.has(vertex.id)).map((vertex) => {
              const selected = selection?.kind === "vertex" && selection.id === vertex.id;
              return (
                <Circle
                  key={`vertex-handle-${vertex.id}`}
                  x={vertex.x}
                  y={-vertex.y}
                  radius={8 / viewport.scale}
                  fill={selected ? palette.selection : palette.canvas}
                  stroke={palette.selection}
                  strokeWidth={2 / viewport.scale}
                  hitStrokeWidth={16 / viewport.scale}
                  draggable
                  onMouseEnter={(event) => { event.target.getStage()!.container().style.cursor = "move"; }}
                  onMouseLeave={(event) => { event.target.getStage()!.container().style.cursor = ""; }}
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                    rootRef.current?.focus();
                    onSelect({ kind: "vertex", id: vertex.id });
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onSelect({ kind: "vertex", id: vertex.id });
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true;
                    const requested = { x: event.target.x(), y: -event.target.y() };
                    const plan = previewVertexMove(vertex.id, requested);
                    if (plan.status === "ready") {
                      event.target.position({ x: plan.target.x, y: -plan.target.y });
                    } else {
                      event.target.position({ x: vertex.x, y: -vertex.y });
                    }
                  }}
                  onDragEnd={(event) => {
                    event.cancelBubble = true;
                    const pointerTarget = geometryPoint(event.target.getStage()!, viewport);
                    commitVertexMove(vertex.id, pointerTarget ?? { x: event.target.x(), y: -event.target.y() });
                  }}
                />
              );
            })}
          </Layer>
        ) : null}
      </Stage>
      <div className="geometry-canvas-orientation" aria-hidden="true"><Navigation size={20} strokeWidth={1.8} /><span>N</span></div>
      <div className="geometry-canvas-scale" aria-hidden="true">
        <span className="geometry-scale-caption">{scaleBar.label}</span>
        <span className="geometry-scale-line" style={{ width: `${scaleBar.pixels}px` }} />
      </div>
    </div>
  );
}
