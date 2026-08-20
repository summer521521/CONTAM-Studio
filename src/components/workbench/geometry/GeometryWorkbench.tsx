import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Eye,
  EyeOff,
  FileOutput,
  Hand,
  Image as ImageIcon,
  Layers3,
  Link2,
  Lock,
  Maximize2,
  Merge,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Palette,
  Play,
  Plus,
  Redo2,
  Ruler,
  ScanLine,
  Scissors,
  ShieldCheck,
  Sparkles,
  Square,
  SquareSplitHorizontal,
  Trash2,
  Undo2,
  Unlock,
  Unlink,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { AttachmentState, AttachmentView } from "../../../app/attachment-state";
import {
  contamZoneNameSuggestion,
  createDraftFlowPathForOpening,
  createDraftZoneForRegion,
  parseCubicMetresToLitres,
  type DraftFlowPathDefinition,
  type DraftZoneDefinition,
} from "../../../app/geometry/contam-semantic-authoring";
import { createEmptyContamSemanticDraft } from "../../../app/geometry/contam-semantic-draft";
import {
  GEOMETRY_THEMES,
  loadFloatingWorkbenchLayout,
  saveFloatingWorkbenchLayout,
  type GeometryTheme,
} from "../../../app/geometry/geometry-layout";
import {
  planUnderlayCalibration,
  updatePlanUnderlay,
} from "../../../app/geometry/geometry-plan-underlay";
import {
  levelIsEmptyConstructionTarget,
  planLevelConstructionCopy,
  semanticObjectBelongsToGeometryLevel,
} from "../../../app/geometry/geometry-level-construction";
import {
  planOrthogonalVertexMove,
} from "../../../app/geometry/geometry-direct-manipulation";
import {
  geometryWallFrame,
  planOpeningUpdate,
  planOrthogonalWallTranslation,
} from "../../../app/geometry/geometry-wall-opening-manipulation";
import type {
  GeometryFlowPathAnchor,
  GeometryLevel,
  GeometryOpening,
  GeometryVertex,
  GeometryWall,
  GeometryZoneRegion,
  GeometryVerticalOpening,
} from "../../../app/geometry/geometry-model";
import {
  adjacentLevelPair,
  matchingVerticalFlowPathOptions,
  planVerticalFlowPathLink,
  zonesContainingVerticalOpening,
} from "../../../app/geometry/geometry-vertical-connections";
import {
  auditWallFlowPathAnchor,
  matchingWallFlowPathOptions,
  planWallFlowPathLink,
  wallAirflowBoundary,
  type WallAirflowBoundary,
} from "../../../app/geometry/geometry-wall-airflow";
import { validateBuildingGeometry } from "../../../app/geometry/geometry-validation";
import {
  buildSketchpadProjectionPreview,
  type SketchpadProjectionPreview,
} from "../../../app/geometry/sketchpad-projection-preview";
import type { ProjectState } from "../../../app/project-state";
import type { GeometryOperationInput, GeometrySelection, GeometryTool, GeometryWorkbenchController } from "../../../app/runtime/useGeometryWorkbench";
import { useGeometryPlanUnderlay } from "../../../app/runtime/useGeometryPlanUnderlay";
import type { GeometryVisionDraftController } from "../../../app/runtime/useGeometryVisionDraft";
import { semanticNodeId, type SemanticSnapshot } from "../../../app/semantic-state";
import { DEFAULT_VISUAL_PREFERENCES, type VisualWorkspacePreferences } from "../../../app/spatial-model";
import type { WorkbenchDestination } from "../../../app/workbench-state";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { LoadingState } from "../../ui/LoadingState";
import type {
  GeometryAiDraftPreview,
  GeometryLayerVisibility,
  GeometryViewport,
} from "./GeometryCanvasKonva";
import { GeometryObjectNavigator, type GeometryNavigatorItem } from "./GeometryObjectNavigator";
import { SemanticFlowPathCreator } from "./SemanticFlowPathCreator";
import { WallFlowPathEditor } from "./WallFlowPathEditor";
import { levelConstructionIssueKey } from "./geometry-interaction-issues";
import {
  directMoveIssueKey,
  geometryCommandIssueKey,
  manipulationIssueKey,
  wallFlowPathIssueKey,
  wallTranslationIssueKey,
} from "./geometry-interaction-issues";

const GeometryCanvas = lazy(() => import("./GeometryCanvasKonva"));
const VisualModelWorkspace = lazy(async () => ({ default: (await import("../visual/VisualModelWorkspace")).VisualModelWorkspace }));

interface GeometryWorkbenchProps {
  projectState: ProjectState;
  snapshot: SemanticSnapshot;
  controller: GeometryWorkbenchController;
  visualPreferences?: VisualWorkspacePreferences;
  onVisualPreferencesChange?: (preferences: VisualWorkspacePreferences) => void;
  selectedSemanticObjectId: string | null;
  onSelectSemantic: (semanticId: string) => void;
  geometryVisionDraft: GeometryVisionDraftController;
  onNavigate?: (destination: WorkbenchDestination) => void;
  onOpenAssistant?: () => void;
  attachmentState?: AttachmentState;
  onAttachmentImport?: () => void;
  onAttachmentsImported?: (attachments: AttachmentView[]) => void;
  onAttachmentSelect?: (attachment: AttachmentView, selected: boolean) => void;
  onReviewSketchpadProjection?: (preview: SketchpadProjectionPreview) => Promise<boolean>;
  qualityAiDemo?: boolean;
  qualityAiDemoSource?: string;
}

const TOOL_DEFINITIONS: Array<{ id: GeometryTool; icon: typeof MousePointer2 }> = [
  { id: "select", icon: MousePointer2 },
  { id: "pan", icon: Hand },
  { id: "wall", icon: Minus },
  { id: "split", icon: Scissors },
  { id: "zone", icon: Square },
  { id: "door", icon: DoorOpen },
  { id: "window", icon: ScanLine },
  { id: "vertical_opening", icon: ArrowUpDown },
  { id: "flow_path", icon: ArrowRight },
  { id: "dimension", icon: Ruler },
  { id: "calibrate_underlay", icon: ScanLine },
];

const QUALITY_AI_DRAFT: GeometryAiDraftPreview = {
  operationCount: 12,
  zones: [
    { id: "ai-zone-1", points: [{ x: 7_000, y: 0 }, { x: 9_500, y: 0 }, { x: 9_500, y: 4_500 }, { x: 7_000, y: 4_500 }] },
  ],
  walls: [
    { id: "ai-wall-1", start: { x: 7_000, y: 4_500 }, end: { x: 9_500, y: 4_500 } },
    { id: "ai-wall-2", start: { x: 9_500, y: 4_500 }, end: { x: 9_500, y: 0 } },
  ],
  openings: [
    { id: "ai-opening-1", start: { x: 9_500, y: 2_150 }, end: { x: 9_500, y: 3_050 } },
  ],
};

function selectionObject(
  level: GeometryLevel | null,
  selection: GeometrySelection | null,
): GeometryWall | GeometryOpening | GeometryZoneRegion | GeometryFlowPathAnchor | GeometryVertex | null {
  if (!level || !selection) return null;
  if (selection.kind === "wall") return level.walls.find((item) => item.id === selection.id) ?? null;
  if (selection.kind === "opening") return level.openings.find((item) => item.id === selection.id) ?? null;
  if (selection.kind === "zone") return level.zone_regions.find((item) => item.id === selection.id) ?? null;
  if (selection.kind === "flow_path") return level.flow_path_anchors.find((item) => item.id === selection.id) ?? null;
  return level.vertices.find((item) => item.id === selection.id) ?? null;
}

function selectedLength(level: GeometryLevel | null, selection: GeometrySelection | null): number | null {
  if (!level || selection?.kind !== "wall") return null;
  const wall = level.walls.find((item) => item.id === selection.id);
  if (!wall) return null;
  const start = level.vertices.find((item) => item.id === wall.start_vertex_id);
  const end = level.vertices.find((item) => item.id === wall.end_vertex_id);
  if (!start || !end) return null;
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

function imageAttachment(state?: AttachmentState): AttachmentView | null {
  if (!state) return null;
  return state.attachments.find((attachment) => attachment.category === "image" && attachment.selected_by_user)
    ?? state.attachments.find((attachment) => attachment.category === "image")
    ?? null;
}

function workbenchGeometryId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

interface PendingZoneAuthoring {
  levelId: string;
  definition: DraftZoneDefinition;
}

export function GeometryWorkbench({
  projectState,
  snapshot,
  controller,
  visualPreferences = DEFAULT_VISUAL_PREFERENCES,
  onVisualPreferencesChange = () => undefined,
  selectedSemanticObjectId,
  onSelectSemantic,
  geometryVisionDraft,
  onNavigate = () => undefined,
  onOpenAssistant = () => undefined,
  attachmentState,
  onAttachmentImport = () => undefined,
  onAttachmentsImported = () => undefined,
  onAttachmentSelect = () => undefined,
  onReviewSketchpadProjection,
  qualityAiDemo = false,
  qualityAiDemoSource,
}: GeometryWorkbenchProps) {
  const { t } = useTranslation();
  const initialLayout = useRef(loadFloatingWorkbenchLayout({
    width: typeof window === "undefined" ? 1440 : Math.max(320, window.innerWidth),
    height: typeof window === "undefined" ? 900 : Math.max(420, window.innerHeight - 48),
  }));
  const [theme, setTheme] = useState<GeometryTheme>(initialLayout.current.theme);
  const [layers, setLayers] = useState<GeometryLayerVisibility>({ grid: true, walls: true, zones: true, openings: true, airflow: true, dimensions: true, labels: true });
  const [viewport, setViewport] = useState<GeometryViewport>({ x: 0, y: 0, scale: 0.06 });
  const [fitSequence, setFitSequence] = useState(1);
  const [activeLevelId, setActiveLevelId] = useState<string | null>(null);
  const [referenceLevelId, setReferenceLevelId] = useState<string | null>(null);
  const [copySourceLevelId, setCopySourceLevelId] = useState<string | null>(null);
  const [verticalTargetLevelId, setVerticalTargetLevelId] = useState<string | null>(null);
  const [verticalOpeningKind, setVerticalOpeningKind] = useState<GeometryVerticalOpening["kind"]>("floor_opening");
  const [interactionIssue, setInteractionIssue] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"geometry" | "airflow" | "validation">("geometry");
  const [layersOpen, setLayersOpen] = useState(false);
  const [navigatorTab, setNavigatorTab] = useState<"zones" | "objects">("zones");
  const [zoneCreatorOpen, setZoneCreatorOpen] = useState(false);
  const [zoneCreatorDraft, setZoneCreatorDraft] = useState({
    displayName: "",
    contamName: "",
    volumeMode: "geometry_estimate_confirmed" as "explicit" | "geometry_estimate_confirmed",
    volumeM3: "",
  });
  const [pendingZoneAuthoring, setPendingZoneAuthoring] = useState<PendingZoneAuthoring | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const semanticDraftObjectCount = (controller.semanticDraft?.zones.length ?? 0)
    + (controller.semanticDraft?.flow_paths.length ?? 0);
  const [aiDraftOpen, setAiDraftOpen] = useState(qualityAiDemo);
  const [aiDraftGenerated, setAiDraftGenerated] = useState(qualityAiDemo);
  const [aiDraftVisible, setAiDraftVisible] = useState(qualityAiDemo);
  const [aiPrompt, setAiPrompt] = useState(() => t("geometry.deck.ai.defaultPrompt"));
  const [vertexCoordinateDraft, setVertexCoordinateDraft] = useState({ x: "", y: "" });
  const [wallAxisDraft, setWallAxisDraft] = useState("");
  const [openingDimensionDraft, setOpeningDimensionDraft] = useState({ offset: "", width: "" });
  const [underlayTransformDraft, setUnderlayTransformDraft] = useState({ originX: "", originY: "", rotation: "", opacity: "" });
  const [underlayCalibrationPoints, setUnderlayCalibrationPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [underlayDistanceDraft, setUnderlayDistanceDraft] = useState("");
  const geometryAi = geometryVisionDraft;
  const history = controller.history;
  const geometry = history?.geometry ?? null;
  const canvasAiPreview = qualityAiDemo
    ? (aiDraftVisible ? QUALITY_AI_DRAFT : null)
    : geometryAi.status === "ready" ? geometryAi.canvasPreview : null;
  const activeLevel = geometry?.levels.find((level) => level.id === activeLevelId) ?? geometry?.levels[0] ?? null;
  const activeUnderlay = activeLevel?.underlays[0] ?? null;
  const underlayResource = useGeometryPlanUnderlay({
    projectSessionId: projectState.projectSessionId,
    revisionId: projectState.draft?.revision_id ?? null,
    levelId: activeLevel?.id ?? null,
    underlay: activeUnderlay,
    commitOperations: controller.commitOperations,
    onAttachmentsImported,
  });
  const otherLevels = useMemo(
    () => geometry?.levels.filter((level) => level.id !== activeLevel?.id) ?? [],
    [activeLevel?.id, geometry?.levels],
  );
  const adjacentLevels = useMemo(
    () => geometry && activeLevel
      ? geometry.levels.filter((level) => level.id !== activeLevel.id && adjacentLevelPair(geometry, activeLevel.id, level.id))
      : [],
    [activeLevel, geometry],
  );
  const validation = useMemo(() => geometry ? validateBuildingGeometry(geometry, {
    expectedProjectSessionId: projectState.projectSessionId ?? undefined,
    expectedRevisionId: projectState.draft?.revision_id,
  }) : null, [geometry, projectState.draft?.revision_id, projectState.projectSessionId]);
  const sketchpadPreview = useMemo(
    () => geometry ? buildSketchpadProjectionPreview(geometry, snapshot.spatial_projection) : null,
    [geometry, snapshot.spatial_projection],
  );
  const selectedVerticalOpening = controller.selection?.kind === "vertical_opening"
    ? geometry?.vertical_openings.find((opening) => opening.id === controller.selection?.id) ?? null
    : null;
  const directlySelectedVerticalFlowPath = controller.selection?.kind === "vertical_flow_path"
    ? geometry?.vertical_flow_path_anchors.find((anchor) => anchor.id === controller.selection?.id) ?? null
    : null;
  const selectedVerticalFlowPath = directlySelectedVerticalFlowPath
    ?? (selectedVerticalOpening
      ? geometry?.vertical_flow_path_anchors.find((anchor) => anchor.vertical_opening_id === selectedVerticalOpening.id) ?? null
      : null);
  const selectedVerticalFlowOpening = selectedVerticalFlowPath
    ? geometry?.vertical_openings.find((opening) => opening.id === selectedVerticalFlowPath.vertical_opening_id) ?? null
    : null;
  const activeVerticalOpening = selectedVerticalOpening ?? selectedVerticalFlowOpening;
  const selectedObject = selectionObject(activeLevel, controller.selection)
    ?? selectedVerticalOpening
    ?? directlySelectedVerticalFlowPath;
  const selectedVertex = controller.selection?.kind === "vertex"
    ? activeLevel?.vertices.find((vertex) => vertex.id === controller.selection?.id) ?? null
    : null;
  const selectedWall = controller.selection?.kind === "wall"
    ? activeLevel?.walls.find((wall) => wall.id === controller.selection?.id) ?? null
    : null;
  const selectedOpening = controller.selection?.kind === "opening"
    ? activeLevel?.openings.find((opening) => opening.id === controller.selection?.id) ?? null
    : null;
  const directlySelectedWallFlowPath = controller.selection?.kind === "flow_path"
    ? activeLevel?.flow_path_anchors.find((anchor) => anchor.id === controller.selection?.id) ?? null
    : null;
  const selectedWallFlowOpening = directlySelectedWallFlowPath
    ? activeLevel?.openings.find((opening) => opening.id === directlySelectedWallFlowPath.opening_id) ?? null
    : null;
  const activeWallOpening = selectedOpening ?? selectedWallFlowOpening;
  const selectedWallFlowPath = directlySelectedWallFlowPath
    ?? (selectedOpening
      ? activeLevel?.flow_path_anchors.find((anchor) => anchor.opening_id === selectedOpening.id) ?? null
      : null);
  const selectedZoneRegion = controller.selection?.kind === "zone"
    ? activeLevel?.zone_regions.find((region) => region.id === controller.selection?.id) ?? null
    : null;
  const selectedWallFrame = activeLevel && selectedWall ? geometryWallFrame(activeLevel, selectedWall.id) : null;
  const wallLength = selectedLength(activeLevel, controller.selection);
  const existingZoneIds = useMemo(
    () => new Set(snapshot.zones.map(semanticNodeId).filter((id): id is string => Boolean(id))),
    [snapshot.zones],
  );
  const zoneLabels = useMemo(() => {
    const labels = new Map(snapshot.zones.map((zone, index) => {
      const id = semanticNodeId(zone) ?? `zone-${index + 1}`;
      return [id, zone.name ?? zone.label ?? `Zone ${zone.contam_number ?? index + 1}`] as const;
    }));
    for (const zone of controller.semanticDraft?.zones ?? []) labels.set(zone.id, zone.display_name);
    if (pendingZoneAuthoring) labels.set(pendingZoneAuthoring.definition.id, pendingZoneAuthoring.definition.displayName);
    return labels;
  }, [controller.semanticDraft?.zones, pendingZoneAuthoring, snapshot.zones]);
  const activeZoneEntries = useMemo(() => {
    if (!activeLevel) return [];
    const entries: Array<readonly [string, string]> = snapshot.zones.flatMap((zone, index) => {
      if (!semanticObjectBelongsToGeometryLevel(
        zone.level_number,
        activeLevel.level_number,
        geometry?.levels.length ?? 0,
      )) return [];
      const id = semanticNodeId(zone) ?? `zone-${index + 1}`;
      return [[id, zone.name ?? zone.label ?? `Zone ${zone.contam_number ?? index + 1}`] as const];
    });
    for (const zone of controller.semanticDraft?.zones ?? []) {
      if (zone.level_number === activeLevel.level_number) entries.push([zone.id, zone.display_name]);
    }
    if (pendingZoneAuthoring?.levelId === activeLevel.id) {
      entries.push([pendingZoneAuthoring.definition.id, pendingZoneAuthoring.definition.displayName]);
    }
    return entries;
  }, [activeLevel, controller.semanticDraft?.zones, geometry?.levels.length, pendingZoneAuthoring, snapshot.zones]);
  const flowPathLabels = useMemo(() => {
    const labels = new Map(snapshot.flow_paths.map((flow, index) => {
      const id = semanticNodeId(flow) ?? `flow-${index + 1}`;
      return [id, flow.label ?? flow.name ?? `FlowPath ${flow.contam_number ?? index + 1}`] as const;
    }));
    for (const path of controller.semanticDraft?.flow_paths ?? []) labels.set(path.id, path.id);
    return labels;
  }, [controller.semanticDraft?.flow_paths, snapshot.flow_paths]);
  const supportedFlowElements = useMemo(() => (snapshot.flow_elements ?? []).flatMap((element, index) => {
    const id = typeof element.element_id === "string" ? element.element_id : null;
    if (!id || element.supported !== true) return [];
    return [{ id, label: element.name ?? element.label ?? `${t("geometry.editor.semanticAuthoring.flowElement")} ${index + 1}` }];
  }), [snapshot.flow_elements, t]);
  const boundZoneIds = useMemo(() => new Set(geometry?.levels.flatMap((level) => level.zone_regions.map((region) => region.semantic_zone_id)) ?? []), [geometry]);
  const boundFlowPathIds = useMemo(() => new Set([
    ...(geometry?.levels.flatMap((level) => level.flow_path_anchors.map((anchor) => anchor.semantic_flow_path_id)) ?? []),
    ...(geometry?.vertical_flow_path_anchors.map((anchor) => anchor.semantic_flow_path_id) ?? []),
  ]), [geometry]);
  const activeWallBoundary = useMemo(() => {
    if (!activeLevel || !activeWallOpening) return null;
    const result = wallAirflowBoundary(activeLevel, activeWallOpening.id);
    return result.status === "ready" ? result as WallAirflowBoundary : null;
  }, [activeLevel, activeWallOpening]);
  const activeWall = activeWallOpening
    ? activeLevel?.walls.find((wall) => wall.id === activeWallOpening.wall_id) ?? null
    : null;
  const wallFlowPathOptions = useMemo(() => (
    activeLevel && activeWallOpening && !selectedWallFlowPath
      ? matchingWallFlowPathOptions(
        activeLevel,
        snapshot.zones,
        snapshot.flow_paths,
        activeWallOpening.id,
        boundFlowPathIds,
      )
      : []
  ), [activeLevel, activeWallOpening, boundFlowPathIds, selectedWallFlowPath, snapshot.flow_paths, snapshot.zones]);
  const selectedWallFlowAudit = useMemo(() => (
    activeLevel && selectedWallFlowPath
      ? auditWallFlowPathAnchor(activeLevel, selectedWallFlowPath, snapshot.zones, snapshot.flow_paths)
      : null
  ), [activeLevel, selectedWallFlowPath, snapshot.flow_paths, snapshot.zones]);
  const levelNames = useMemo(
    () => new Map(geometry?.levels.map((level) => [level.id, level.name]) ?? []),
    [geometry?.levels],
  );
  const activeVerticalZones = useMemo(() => {
    if (!geometry || !activeVerticalOpening) return null;
    const pair = adjacentLevelPair(geometry, activeVerticalOpening.lower_level_id, activeVerticalOpening.upper_level_id);
    if (!pair) return null;
    const lower = zonesContainingVerticalOpening(pair.lower, activeVerticalOpening);
    const upper = zonesContainingVerticalOpening(pair.upper, activeVerticalOpening);
    return lower.length === 1 && upper.length === 1 ? { lower: lower[0], upper: upper[0] } : null;
  }, [activeVerticalOpening, geometry]);
  const verticalFlowPathOptions = useMemo(() => {
    if (!activeVerticalZones) return [];
    return matchingVerticalFlowPathOptions(
      snapshot.zones,
      snapshot.flow_paths,
      activeVerticalZones.lower,
      activeVerticalZones.upper,
      boundFlowPathIds,
    );
  }, [activeVerticalZones, boundFlowPathIds, snapshot.flow_paths, snapshot.zones]);
  const unboundZoneOptions = useMemo(
    () => activeZoneEntries.filter(([zoneId]) => !boundZoneIds.has(zoneId)),
    [activeZoneEntries, boundZoneIds],
  );
  const partitionTargetReady = Boolean(selectedZoneRegion && controller.selectedZoneId
    && controller.selectedZoneId !== selectedZoneRegion.semantic_zone_id
    && !boundZoneIds.has(controller.selectedZoneId));
  const selectedImage = attachmentState?.attachments.find((attachment) => (
    attachment.attachment_id === activeUnderlay?.resource_id && attachment.category === "image"
  )) ?? imageAttachment(attachmentState);
  const issueCode = controller.diagnostics[0]
    ? geometryCommandIssueKey(controller.diagnostics[0].code)
    : interactionIssue;
  const projectName = projectState.project?.source_path.split(/[\\/]/).at(-1) ?? t("geometry.editor.untitled");

  useEffect(() => {
    saveFloatingWorkbenchLayout({ ...initialLayout.current, theme });
  }, [theme]);
  useEffect(() => {
    if (!geometry) setActiveLevelId(null);
    else if (!geometry.levels.some((level) => level.id === activeLevelId)) setActiveLevelId(geometry.levels[0]?.id ?? null);
  }, [activeLevelId, geometry]);
  useEffect(() => {
    setUnderlayCalibrationPoints([]);
    setUnderlayDistanceDraft("");
    setUnderlayTransformDraft(activeUnderlay ? {
      originX: String(activeUnderlay.origin_x_mm),
      originY: String(activeUnderlay.origin_y_mm),
      rotation: String(activeUnderlay.rotation_millidegrees / 1_000),
      opacity: String(activeUnderlay.opacity_percent),
    } : { originX: "", originY: "", rotation: "", opacity: "" });
    if (!activeUnderlay && controller.tool === "calibrate_underlay") controller.setTool("select");
  }, [activeUnderlay, controller.setTool, controller.tool]);
  const previousActiveLevelId = useRef<string | null>(null);
  useEffect(() => {
    const currentLevelId = activeLevel?.id ?? null;
    if (previousActiveLevelId.current !== null && previousActiveLevelId.current !== currentLevelId) {
      setPendingZoneAuthoring(null);
      setZoneCreatorOpen(false);
      controller.setSelection(null);
      controller.setSelectedZoneId(null);
      controller.setSelectedFlowPathId(null);
      controller.setTool("select");
      controller.clearDiagnostics();
      setInteractionIssue(null);
    }
    previousActiveLevelId.current = currentLevelId;
  }, [
    activeLevel?.id,
    controller.clearDiagnostics,
    controller.setSelectedFlowPathId,
    controller.setSelectedZoneId,
    controller.setSelection,
    controller.setTool,
  ]);
  useEffect(() => {
    if (referenceLevelId
      && (referenceLevelId === activeLevel?.id || !otherLevels.some((level) => level.id === referenceLevelId))) {
      setReferenceLevelId(null);
    }
    if (copySourceLevelId && !otherLevels.some((level) => level.id === copySourceLevelId)) {
      setCopySourceLevelId(null);
    }
  }, [activeLevel?.id, copySourceLevelId, otherLevels, referenceLevelId]);
  useEffect(() => {
    if (!verticalTargetLevelId || !adjacentLevels.some((level) => level.id === verticalTargetLevelId)) {
      setVerticalTargetLevelId(adjacentLevels[0]?.id ?? null);
    }
  }, [adjacentLevels, verticalTargetLevelId]);
  useEffect(() => {
    setVertexCoordinateDraft(selectedVertex
      ? { x: String(selectedVertex.x), y: String(selectedVertex.y) }
      : { x: "", y: "" });
  }, [selectedVertex?.id, selectedVertex?.x, selectedVertex?.y]);
  useEffect(() => {
    setWallAxisDraft(selectedWallFrame ? String(selectedWallFrame.axisPosition) : "");
  }, [selectedWallFrame?.axisPosition, selectedWallFrame?.wall.id]);
  useEffect(() => {
    setOpeningDimensionDraft(selectedOpening
      ? { offset: String(selectedOpening.offset), width: String(selectedOpening.width) }
      : { offset: "", width: "" });
  }, [selectedOpening?.id, selectedOpening?.offset, selectedOpening?.width]);
  useEffect(() => {
    if (!qualityAiDemo) return;
    setAiDraftOpen(true);
    setAiDraftGenerated(true);
    setAiDraftVisible(true);
  }, [qualityAiDemo]);
  useEffect(() => {
    if (qualityAiDemo && geometryAi.status === "ready") {
      setAiDraftGenerated(true);
      setAiDraftVisible(true);
    } else if (qualityAiDemo && (geometryAi.status === "idle" || geometryAi.status === "error" || geometryAi.status === "applied")) {
      setAiDraftGenerated(false);
      setAiDraftVisible(false);
    }
  }, [geometryAi.status, qualityAiDemo]);

  const setMode = (mode: GeometryWorkbenchController["mode"]) => {
    controller.setMode(mode);
    if (mode === "sketchpad" && visualPreferences.mode !== "sketchpad") onVisualPreferencesChange({ ...visualPreferences, mode: "sketchpad" });
    if (mode === "topology" && visualPreferences.mode !== "topology") onVisualPreferencesChange({ ...visualPreferences, mode: "topology" });
  };
  const selectZoneForAuthoring = (zoneId: string | null) => {
    controller.setSelectedZoneId(zoneId);
    if (zoneId && existingZoneIds.has(zoneId)) onSelectSemantic(zoneId);
  };
  const beginZoneAuthoring = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLevel) return;
    const displayName = zoneCreatorDraft.displayName.trim();
    const contamName = zoneCreatorDraft.contamName.trim();
    const existingNames = new Set([
      ...snapshot.zones.map((zone) => zone.name?.toLowerCase()).filter((name): name is string => Boolean(name)),
      ...(controller.semanticDraft?.zones.map((zone) => zone.name.toLowerCase()) ?? []),
    ]);
    if (!displayName || displayName.length > 80 || !/^[A-Za-z0-9_.-]{1,15}$/.test(contamName) || existingNames.has(contamName.toLowerCase())) {
      setInteractionIssue("geometry.editor.issue.semanticZoneDefinitionInvalid");
      return;
    }
    const explicitLitres = zoneCreatorDraft.volumeMode === "explicit"
      ? parseCubicMetresToLitres(zoneCreatorDraft.volumeM3)
      : null;
    if (zoneCreatorDraft.volumeMode === "explicit" && explicitLitres === null) {
      setInteractionIssue("geometry.editor.issue.semanticZoneVolumeInvalid");
      return;
    }
    if (zoneCreatorDraft.volumeMode === "geometry_estimate_confirmed" && (!Number.isSafeInteger(activeLevel.height) || (activeLevel.height ?? 0) <= 0)) {
      setInteractionIssue("geometry.editor.issue.semanticZoneLevelHeightMissing");
      return;
    }
    const definition: DraftZoneDefinition = {
      id: workbenchGeometryId("semantic-zone"),
      displayName,
      contamName,
      volume: zoneCreatorDraft.volumeMode === "explicit"
        ? { basis: "explicit", volumeLitres: explicitLitres as number }
        : { basis: "geometry_estimate_confirmed" },
    };
    setPendingZoneAuthoring({ levelId: activeLevel.id, definition });
    selectZoneForAuthoring(definition.id);
    controller.setTool("zone");
    setZoneCreatorOpen(false);
    setInteractionIssue(null);
  };
  const cancelZoneAuthoring = () => {
    const pendingId = pendingZoneAuthoring?.definition.id;
    setPendingZoneAuthoring(null);
    if (controller.selectedZoneId === pendingId) controller.setSelectedZoneId(null);
    if (controller.tool === "zone") controller.setTool("select");
    setInteractionIssue(null);
  };
  const commitZoneRegion = (
    operations: GeometryOperationInput[],
    region: GeometryZoneRegion,
    selectAfter: GeometrySelection,
  ): boolean => {
    if (!pendingZoneAuthoring || pendingZoneAuthoring.definition.id !== region.semantic_zone_id) {
      return controller.commitOperations(operations, selectAfter);
    }
    const preview = controller.previewOperations(operations);
    const level = preview?.ready
      ? preview.geometry.levels.find((item) => item.id === pendingZoneAuthoring.levelId) ?? null
      : null;
    const sessionId = projectState.projectSessionId;
    const project = projectState.project;
    const revisionId = projectState.draft?.revision_id;
    if (!preview?.ready || !level || !sessionId || !project || !revisionId) {
      setInteractionIssue("geometry.editor.issue.semanticAuthoringRejected");
      return false;
    }
    const baseDraft = controller.semanticDraft ?? createEmptyContamSemanticDraft({
      projectSessionId: sessionId,
      identitySha256: snapshot.identity_sha256 ?? project.source_sha256,
      sourceSha256: project.source_sha256,
      revisionId,
    }, workbenchGeometryId("semantic-draft"));
    const result = createDraftZoneForRegion(baseDraft, level, region, pendingZoneAuthoring.definition);
    if (result.status !== "ready") {
      setInteractionIssue(result.diagnosticCode === "semantic_authoring_zone_volume_invalid"
        ? "geometry.editor.issue.semanticZoneVolumeInvalid"
        : "geometry.editor.issue.semanticAuthoringRejected");
      return false;
    }
    const committed = controller.commitSemanticAuthoring(operations, result.draft, selectAfter);
    if (!committed) {
      setInteractionIssue("geometry.editor.issue.semanticAuthoringRejected");
      return false;
    }
    setPendingZoneAuthoring(null);
    setZoneCreatorDraft({ displayName: "", contamName: "", volumeMode: "geometry_estimate_confirmed", volumeM3: "" });
    controller.setTool("select");
    setInteractionIssue(null);
    return true;
  };
  const createSemanticFlowPath = (definition: Omit<DraftFlowPathDefinition, "id">): boolean => {
    const sessionId = projectState.projectSessionId;
    const project = projectState.project;
    const revisionId = projectState.draft?.revision_id;
    if (!geometry || !activeLevel || !activeWallOpening || !sessionId || !project || !revisionId) {
      setInteractionIssue("geometry.editor.issue.semanticFlowPathRejected");
      return false;
    }
    const baseDraft = controller.semanticDraft ?? createEmptyContamSemanticDraft({
      projectSessionId: sessionId,
      identitySha256: snapshot.identity_sha256 ?? project.source_sha256,
      sourceSha256: project.source_sha256,
      revisionId,
    }, workbenchGeometryId("semantic-draft"));
    const result = createDraftFlowPathForOpening(
      geometry,
      baseDraft,
      activeLevel.id,
      activeWallOpening.id,
      { ...definition, id: workbenchGeometryId("semantic-flow-path") },
      () => workbenchGeometryId("wall-flow-anchor"),
    );
    if (result.status !== "ready") {
      setInteractionIssue(result.diagnosticCode === "semantic_authoring_flow_value_invalid"
        ? "geometry.editor.issue.semanticFlowValuesInvalid"
        : "geometry.editor.issue.semanticFlowPathRejected");
      return false;
    }
    const committed = controller.commitSemanticAuthoring(
      [result.operation],
      result.draft,
      { kind: "flow_path", id: result.anchor.id },
    );
    if (!committed) {
      setInteractionIssue("geometry.editor.issue.semanticFlowPathRejected");
      return false;
    }
    controller.setSelectedFlowPathId(result.flowPath.id);
    setInteractionIssue(null);
    return true;
  };
  const copyLevelConstruction = () => {
    if (!geometry || !activeLevel || !copySourceLevelId) return;
    const plan = planLevelConstructionCopy(geometry, copySourceLevelId, activeLevel.id, (kind) => {
      const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return `level-copy-${kind}-${suffix}`;
    });
    if (plan.status !== "ready") {
      setInteractionIssue(levelConstructionIssueKey(plan.diagnosticCode));
      return;
    }
    if (!controller.commitOperations([plan.operation], null)) {
      setInteractionIssue("geometry.editor.issue.levelCopyRejected");
      return;
    }
    setReferenceLevelId(copySourceLevelId);
    setFitSequence((value) => value + 1);
    setInteractionIssue(null);
  };
  const unlinkWallFlowPath = (
    anchor: GeometryFlowPathAnchor,
    selectAfter: GeometrySelection | null,
  ): boolean => {
    if (!activeLevel) return false;
    const operation: GeometryOperationInput = {
      operation: "unlink_flow_path",
      parameters: { level_id: activeLevel.id, flow_path_anchor_id: anchor.id },
    };
    const semanticPath = controller.semanticDraft?.flow_paths.find((path) => path.id === anchor.semantic_flow_path_id);
    if (!semanticPath || !controller.semanticDraft) return controller.commitOperations([operation], selectAfter);
    return controller.commitSemanticAuthoring([operation], {
      ...controller.semanticDraft,
      draft_revision: controller.semanticDraft.draft_revision + 1,
      flow_paths: controller.semanticDraft.flow_paths.filter((path) => path.id !== semanticPath.id),
    }, selectAfter);
  };
  const removeSelection = () => {
    if (!activeLevel || !controller.selection) return;
    const selection = controller.selection;
    let committed = false;
    if (selection.kind === "wall") committed = controller.commitOperations([{ operation: "delete_wall", parameters: { level_id: activeLevel.id, wall_id: selection.id } }], null);
    else if (selection.kind === "opening") committed = controller.commitOperations([{ operation: "remove_opening", parameters: { level_id: activeLevel.id, opening_id: selection.id } }], null);
    else if (selection.kind === "flow_path") {
      const anchor = activeLevel.flow_path_anchors.find((item) => item.id === selection.id);
      committed = anchor ? unlinkWallFlowPath(anchor, null) : false;
    }
    else if (selection.kind === "vertical_opening") committed = controller.commitOperations([{ operation: "remove_vertical_opening", parameters: { level_id: activeLevel.id, vertical_opening_id: selection.id } }], null);
    else if (selection.kind === "vertical_flow_path") committed = controller.commitOperations([{ operation: "unlink_vertical_flow_path", parameters: { level_id: activeLevel.id, vertical_flow_path_anchor_id: selection.id } }], null);
    setInteractionIssue(committed ? null : selection.kind === "wall" ? "geometry.editor.issue.trimRejected" : "geometry.editor.issue.rejected");
  };
  const linkSelectedWallFlowPath = (openingId = activeWallOpening?.id) => {
    if (!geometry || !activeLevel || !openingId || !controller.selectedFlowPathId) {
      setInteractionIssue("geometry.editor.issue.selectMatchingWallFlowPath");
      return;
    }
    if (activeLevel.flow_path_anchors.some((anchor) => anchor.opening_id === openingId)) {
      setInteractionIssue("geometry.editor.issue.wallFlowAlreadyBound");
      return;
    }
    const options = matchingWallFlowPathOptions(
      activeLevel,
      snapshot.zones,
      snapshot.flow_paths,
      openingId,
      boundFlowPathIds,
    );
    const option = options.find((item) => item.id === controller.selectedFlowPathId);
    if (!option) {
      const boundary = wallAirflowBoundary(activeLevel, openingId);
      setInteractionIssue(boundary.status === "ready"
        ? "geometry.editor.issue.wallFlowSemanticMismatch"
        : wallFlowPathIssueKey(boundary.diagnosticCode));
      return;
    }
    const plan = planWallFlowPathLink(
      geometry,
      activeLevel.id,
      openingId,
      option,
      () => workbenchGeometryId("wall-flow-anchor"),
    );
    if (plan.status !== "ready") {
      setInteractionIssue(wallFlowPathIssueKey(plan.diagnosticCode));
      return;
    }
    if (!controller.commitOperations([plan.operation], { kind: "flow_path", id: plan.anchor.id })) {
      setInteractionIssue("geometry.editor.issue.rejected");
      return;
    }
    setInteractionIssue(null);
  };
  const unlinkSelectedWallFlowPath = () => {
    if (!activeLevel || !activeWallOpening || !selectedWallFlowPath) return;
    const committed = unlinkWallFlowPath(selectedWallFlowPath, { kind: "opening", id: activeWallOpening.id });
    setInteractionIssue(committed ? null : "geometry.editor.issue.rejected");
  };
  const linkSelectedVerticalFlowPath = () => {
    if (!geometry || !activeLevel || !activeVerticalOpening || !activeVerticalZones || !controller.selectedFlowPathId) {
      setInteractionIssue("geometry.editor.issue.verticalFlowBindingInvalid");
      return;
    }
    if (!verticalFlowPathOptions.some((option) => option.id === controller.selectedFlowPathId)) {
      setInteractionIssue("geometry.editor.issue.verticalFlowZoneMismatch");
      return;
    }
    const plan = planVerticalFlowPathLink(
      geometry,
      activeLevel.id,
      activeVerticalOpening.id,
      controller.selectedFlowPathId,
      activeVerticalZones.lower,
      activeVerticalZones.upper,
      () => workbenchGeometryId("vertical-flow-anchor"),
    );
    if (plan.status !== "ready") {
      setInteractionIssue(plan.diagnosticCode === "geometry_vertical_flow_path_already_bound"
        ? "geometry.editor.issue.verticalFlowAlreadyBound"
        : "geometry.editor.issue.verticalFlowBindingInvalid");
      return;
    }
    if (!controller.commitOperations([plan.operation], { kind: "vertical_flow_path", id: plan.anchor.id })) {
      setInteractionIssue("geometry.editor.issue.rejected");
      return;
    }
    setInteractionIssue(null);
  };
  const unlinkSelectedVerticalFlowPath = () => {
    if (!activeLevel || !selectedVerticalFlowPath || !activeVerticalOpening) return;
    const committed = controller.commitOperations([{
      operation: "unlink_vertical_flow_path",
      parameters: {
        level_id: activeLevel.id,
        vertical_flow_path_anchor_id: selectedVerticalFlowPath.id,
      },
    }], { kind: "vertical_opening", id: activeVerticalOpening.id });
    setInteractionIssue(committed ? null : "geometry.editor.issue.rejected");
  };
  const toggleZonePartition = () => {
    if (!selectedZoneRegion || !partitionTargetReady) {
      setInteractionIssue("geometry.editor.issue.zonePartitionTargetBound");
      return;
    }
    controller.setTool(controller.tool === "partition" ? "select" : "partition");
    setInteractionIssue(null);
  };
  const toggleZoneMerge = () => {
    if (!selectedZoneRegion) return;
    controller.setTool(controller.tool === "merge" ? "select" : "merge");
    setInteractionIssue(null);
  };
  const applyVertexCoordinates = () => {
    if (!activeLevel || !selectedVertex) return;
    if (!/^-?\d+$/.test(vertexCoordinateDraft.x) || !/^-?\d+$/.test(vertexCoordinateDraft.y)) {
      setInteractionIssue("geometry.editor.issue.coordinateInvalid");
      return;
    }
    const x = Number(vertexCoordinateDraft.x);
    const y = Number(vertexCoordinateDraft.y);
    const plan = planOrthogonalVertexMove(activeLevel, selectedVertex.id, { x, y }, 1);
    if (plan.status === "unchanged") {
      setInteractionIssue(null);
      return;
    }
    if (plan.status === "blocked") {
      setInteractionIssue(directMoveIssueKey(plan));
      return;
    }
    if (!controller.commitOperations([plan.operation], { kind: "vertex", id: selectedVertex.id })) {
      setInteractionIssue("geometry.editor.issue.invalidMove");
      return;
    }
    setInteractionIssue(null);
  };
  const applyWallAxis = () => {
    if (!activeLevel || !selectedWall) return;
    if (!/^-?\d+$/.test(wallAxisDraft)) {
      setInteractionIssue("geometry.editor.issue.coordinateInvalid");
      return;
    }
    const plan = planOrthogonalWallTranslation(activeLevel, selectedWall.id, Number(wallAxisDraft), 1);
    if (plan.status === "unchanged") {
      setInteractionIssue(null);
      return;
    }
    if (plan.status === "blocked") {
      setInteractionIssue(wallTranslationIssueKey(plan.diagnosticCode));
      return;
    }
    if (!controller.commitOperations([plan.operation], { kind: "wall", id: selectedWall.id })) {
      setInteractionIssue("geometry.editor.issue.invalidMove");
      return;
    }
    setInteractionIssue(null);
  };
  const applyOpeningDimensions = () => {
    if (!activeLevel || !selectedOpening
      || !/^\d+$/.test(openingDimensionDraft.offset) || !/^\d+$/.test(openingDimensionDraft.width)) {
      setInteractionIssue("geometry.editor.issue.openingValueInvalid");
      return;
    }
    const plan = planOpeningUpdate(activeLevel, selectedOpening.id, {
      offset: Number(openingDimensionDraft.offset),
      width: Number(openingDimensionDraft.width),
    }, 1);
    if (plan.status === "unchanged") {
      setInteractionIssue(null);
      return;
    }
    if (plan.status === "blocked") {
      setInteractionIssue(manipulationIssueKey(plan.diagnosticCode));
      return;
    }
    if (!controller.commitOperations([plan.operation], { kind: "opening", id: selectedOpening.id })) {
      setInteractionIssue("geometry.editor.issue.rejected");
      return;
    }
    setInteractionIssue(null);
  };
  const commitUnderlay = (underlay: NonNullable<typeof activeUnderlay>) => {
    if (!activeLevel) return false;
    const committed = controller.commitOperations([{
      operation: "update_plan_underlay",
      parameters: { level_id: activeLevel.id, underlay },
    }]);
    setInteractionIssue(committed ? null : "geometry.editor.issue.underlayUpdateRejected");
    return committed;
  };
  const applyUnderlayTransform = () => {
    if (!activeUnderlay || activeUnderlay.locked) return;
    const originX = Number(underlayTransformDraft.originX);
    const originY = Number(underlayTransformDraft.originY);
    const rotation = Number(underlayTransformDraft.rotation);
    const opacity = Number(underlayTransformDraft.opacity);
    if (![originX, originY, rotation, opacity].every(Number.isFinite)
      || !Number.isSafeInteger(originX)
      || !Number.isSafeInteger(originY)
      || !Number.isSafeInteger(opacity)) {
      setInteractionIssue("geometry.editor.issue.underlayTransformInvalid");
      return;
    }
    const next = updatePlanUnderlay(activeUnderlay, {
      origin_x_mm: originX,
      origin_y_mm: originY,
      rotation_millidegrees: Math.round(rotation * 1_000),
      opacity_percent: opacity,
    });
    if (!next) {
      setInteractionIssue("geometry.editor.issue.underlayTransformInvalid");
      return;
    }
    commitUnderlay(next);
  };
  const toggleUnderlayLock = () => {
    if (!activeUnderlay) return;
    const next = updatePlanUnderlay(activeUnderlay, { locked: !activeUnderlay.locked });
    if (next && commitUnderlay(next) && next.locked) controller.setTool("select");
  };
  const toggleUnderlayVisibility = () => {
    if (!activeUnderlay) return;
    const next = updatePlanUnderlay(activeUnderlay, { visible: !activeUnderlay.visible });
    if (next) commitUnderlay(next);
  };
  const removeUnderlay = () => {
    if (!activeLevel || !activeUnderlay) return;
    const committed = controller.commitOperations([{
      operation: "remove_plan_underlay",
      parameters: { level_id: activeLevel.id, underlay_id: activeUnderlay.id },
    }]);
    if (committed) {
      controller.setTool("select");
      setUnderlayCalibrationPoints([]);
      setUnderlayDistanceDraft("");
      setInteractionIssue(null);
    } else setInteractionIssue("geometry.editor.issue.underlayUpdateRejected");
  };
  const addUnderlayCalibrationPoint = (point: { x: number; y: number }) => {
    if (!activeUnderlay || activeUnderlay.locked || !activeUnderlay.visible) return;
    setUnderlayCalibrationPoints((current) => current.length >= 2 ? [point] : [...current, point]);
  };
  const applyUnderlayCalibration = () => {
    if (!activeUnderlay || underlayCalibrationPoints.length !== 2 || !/^\d+$/.test(underlayDistanceDraft)) {
      setInteractionIssue("geometry.editor.issue.underlayCalibrationInvalid");
      return;
    }
    const next = planUnderlayCalibration(
      activeUnderlay,
      underlayCalibrationPoints[0],
      underlayCalibrationPoints[1],
      Number(underlayDistanceDraft),
    );
    if (!next || !commitUnderlay(next)) {
      setInteractionIssue("geometry.editor.issue.underlayCalibrationInvalid");
      return;
    }
    setUnderlayCalibrationPoints([]);
    setUnderlayDistanceDraft("");
    controller.setTool("select");
    setFitSequence((value) => value + 1);
  };
  const generateDraft = () => {
    if (!qualityAiDemo) {
      onOpenAssistant();
      return;
    }
    setAiDraftGenerated(true);
    setAiDraftVisible(true);
  };
  const toggleImageSelection = () => {
    if (selectedImage) onAttachmentSelect(selectedImage, !selectedImage.selected_by_user);
  };
  const selectNavigatorItem = (item: GeometryNavigatorItem) => {
    controller.setSelection(item.selection);
    if (item.semanticZoneId) {
      controller.setSelectedZoneId(item.semanticZoneId);
      onSelectSemantic(item.semanticZoneId);
    }
    if (item.semanticFlowPathId) {
      controller.setSelectedFlowPathId(item.semanticFlowPathId);
      onSelectSemantic(item.semanticFlowPathId);
    }
  };

  return (
    <section className="geometry-workbench geometry-command-deck" data-geometry-theme={theme} aria-label={t("geometry.editor.title")}>
      <header className="geometry-deck-commandbar">
        <div className="geometry-deck-brand">
          <span className="geometry-deck-logo"><Box size={18} aria-hidden="true" /></span>
          <strong>CONTAM Studio</strong>
        </div>
        <nav className="geometry-deck-breadcrumb" aria-label={t("geometry.deck.breadcrumbLabel")}>
          <span>{t("navigation.projects")}</span><ChevronRight size={13} />
          <span title={projectName}>{projectName}</span><ChevronRight size={13} />
          <span>{t("geometry.deck.revision", { revision: projectState.draft?.revision_number ?? 0 })}</span><ChevronRight size={13} />
          <strong>{activeLevel?.name ?? t("geometry.editor.noLevel")}</strong>
        </nav>
        <div className="geometry-deck-status-cluster">
          <button
            type="button"
            className={`geometry-deck-saved is-${controller.persistence.status}`}
            title={t(`geometry.persistence.detail.${controller.persistence.status}`)}
            disabled={controller.persistence.status !== "error"}
            onClick={controller.retryPersistence}
          >
            <Box size={14} />{t(`geometry.persistence.status.${controller.persistence.status}`)}
          </button>
          {history ? (
            <span
              className={`geometry-deck-draft-status ${controller.teachingExample ? "is-teaching" : ""}`}
              title={t("geometry.deck.draftStatusDetail")}
              aria-label={t("geometry.deck.draftStatusDetail")}
            >
              <ShieldCheck size={13} aria-hidden="true" />
              {controller.teachingExample ? t("geometry.editor.footer.teaching") : t("geometry.deck.draftStatus")}
            </span>
          ) : null}
        </div>
        <div className="geometry-deck-actions">
          <IconButton label={t("geometry.editor.undo")} disabled={!controller.canUndo} onClick={controller.undo}><Undo2 size={17} /></IconButton>
          <IconButton label={t("geometry.editor.redo")} disabled={!controller.canRedo} onClick={controller.redo}><Redo2 size={17} /></IconButton>
          <span className="geometry-deck-divider" aria-hidden="true" />
          <button type="button" className="geometry-deck-action" onClick={() => onNavigate("run")}><Play size={16} />{t("navigation.run")}</button>
          <button type="button" className="geometry-deck-action" onClick={() => onNavigate("results")}><BarChart3 size={16} />{t("navigation.results")}</button>
          <button
            type="button"
            className={`geometry-deck-action geometry-deck-ai ${(qualityAiDemo ? aiDraftOpen : geometryAi.status === "ready") ? "is-active" : ""}`}
            aria-expanded={qualityAiDemo ? aiDraftOpen : undefined}
            aria-pressed={!qualityAiDemo && geometryAi.status === "ready"}
            onClick={() => qualityAiDemo ? setAiDraftOpen((value) => !value) : onOpenAssistant()}
          >
            <Sparkles size={16} />{t("geometry.deck.ai.short")}
          </button>
          <div className="geometry-deck-overflow">
            <IconButton label={t("geometry.deck.more")} aria-expanded={overflowOpen} onClick={() => setOverflowOpen((value) => !value)}><MoreHorizontal size={18} /></IconButton>
            {overflowOpen ? (
              <div className="geometry-deck-menu" role="menu">
                <span><Palette size={14} />{t("geometry.deck.appearance")}</span>
                {GEOMETRY_THEMES.map((item) => (
                  <button key={item} type="button" role="menuitemradio" aria-checked={theme === item} onClick={() => { setTheme(item); setOverflowOpen(false); }}>
                    <i className={`geometry-theme-dot theme-${item}`} />
                    {t(`geometry.editor.themes.${item}`)}
                    {theme === item ? <Check size={14} /> : null}
                  </button>
                ))}
                <button type="button" role="menuitem" onClick={() => { setEvidenceOpen(true); setOverflowOpen(false); }}><ShieldCheck size={14} />{t("geometry.editor.review")}</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {controller.mode === "studio" ? (
        <div className="geometry-stage-shell">
          {geometry && activeLevel ? (
            <>
              <Suspense fallback={<LoadingState label={t("geometry.editor.loadingCanvas")} />}>
                <GeometryCanvas
                  geometry={geometry}
                  levelId={activeLevel.id}
                  referenceLevelId={referenceLevelId}
                  tool={controller.tool}
                  selection={controller.selection}
                  selectedZoneId={controller.selectedZoneId}
                  verticalTargetLevelId={verticalTargetLevelId}
                  verticalOpeningKind={verticalOpeningKind}
                  zoneLabels={zoneLabels}
                  layers={layers}
                  viewport={viewport}
                  fitSequence={fitSequence}
                  aiDraftPreview={canvasAiPreview}
                  onToggleAiOperation={geometryAi.toggleOperation}
                  underlay={activeUnderlay}
                  underlayImage={underlayResource.image}
                  calibrationPoints={underlayCalibrationPoints}
                  onViewportChange={setViewport}
                  onSelect={controller.setSelection}
                  onLinkWallFlowPath={linkSelectedWallFlowPath}
                  onCommitOperations={controller.commitOperations}
                  onCommitZoneRegion={commitZoneRegion}
                  onIssue={setInteractionIssue}
                  onCalibrationPoint={addUnderlayCalibrationPoint}
                  onUndo={controller.undo}
                  onRedo={controller.redo}
                />
              </Suspense>
              {referenceLevelId ? (
                <div className="geometry-level-underlay-badge" role="status">
                  <Eye size={14} aria-hidden="true" />
                  {t("geometry.editor.levels.referenceActive", {
                    level: otherLevels.find((level) => level.id === referenceLevelId)?.name ?? referenceLevelId,
                  })}
                </div>
              ) : null}
              {activeUnderlay ? (
                <div className={`geometry-level-underlay-badge geometry-plan-underlay-badge is-${underlayResource.status}`} role="status">
                  <ImageIcon size={14} aria-hidden="true" />
                  {t(`geometry.editor.underlay.status.${underlayResource.status}`, { name: activeUnderlay.display_name })}
                </div>
              ) : null}
            </>
          ) : controller.persistence.status === "loading" ? (
            <LoadingState label={t("geometry.persistence.loading")} />
          ) : (
            <div className="geometry-empty-draft" role="status">
              <div className="geometry-empty-icon"><Box size={30} aria-hidden="true" /></div>
              <h2>{t("geometry.editor.empty.title")}</h2>
              <p>{t("geometry.editor.empty.body")}</p>
              <div><Button variant="primary" onClick={controller.createBlankDraft}>{t("geometry.editor.empty.blank")}</Button><Button onClick={controller.loadTeachingExample}>{t("geometry.editor.empty.example")}</Button></div>
              <small>{t("geometry.editor.empty.boundary")}</small>
              {controller.persistence.issue ? <p className="geometry-persistence-error" role="alert">{t(`geometry.persistence.errors.${controller.persistence.issue.code}`, { defaultValue: controller.persistence.issue.message })}</p> : null}
            </div>
          )}

          <section className="geometry-deck-island geometry-deck-navigator" aria-label={t("geometry.deck.navigator")}>
            <header>
              <label className="geometry-level-select">
                <span className="sr-only">{t("geometry.editor.levels.active")}</span>
                <select value={activeLevel?.id ?? ""} onChange={(event) => { setActiveLevelId(event.target.value || null); setFitSequence((value) => value + 1); }}>
                  {geometry?.levels.map((level) => <option key={level.id} value={level.id}>{level.name} · {level.level_number}</option>)}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
              <IconButton label={t("geometry.editor.panels.layers")} aria-expanded={layersOpen} onClick={() => setLayersOpen((value) => !value)}><Layers3 size={16} /></IconButton>
            </header>
            <div className="geometry-navigator-tabs" role="tablist" aria-label={t("geometry.deck.navigatorViews")}>
              {(["zones", "objects"] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={navigatorTab === tab} onClick={() => setNavigatorTab(tab)}>{t(`geometry.deck.navigatorTabs.${tab}`)}</button>
              ))}
            </div>
            {navigatorTab === "zones" ? <div className="geometry-deck-zone-list">
              <div className="geometry-semantic-zone-actions">
                <button
                  type="button"
                  disabled={!activeLevel || Boolean(pendingZoneAuthoring)}
                  aria-expanded={zoneCreatorOpen}
                  onClick={() => {
                    setZoneCreatorOpen((value) => !value);
                    setInteractionIssue(null);
                    if (!zoneCreatorDraft.contamName) {
                      const sequence = snapshot.zones.length + (controller.semanticDraft?.zones.length ?? 0) + 1;
                      setZoneCreatorDraft((current) => ({ ...current, contamName: contamZoneNameSuggestion(current.displayName, sequence) }));
                    }
                  }}
                >
                  <Plus size={14} aria-hidden="true" />{t("geometry.editor.semanticAuthoring.newZone")}
                </button>
              </div>
              {zoneCreatorOpen ? (
                <form className="geometry-semantic-zone-form" onSubmit={beginZoneAuthoring}>
                  <label>
                    <span>{t("geometry.editor.semanticAuthoring.displayName")}</span>
                    <input
                      autoFocus
                      maxLength={80}
                      value={zoneCreatorDraft.displayName}
                      onChange={(event) => {
                        const displayName = event.target.value;
                        const sequence = snapshot.zones.length + (controller.semanticDraft?.zones.length ?? 0) + 1;
                        setZoneCreatorDraft((current) => ({
                          ...current,
                          displayName,
                          contamName: contamZoneNameSuggestion(displayName, sequence),
                        }));
                      }}
                    />
                  </label>
                  <label>
                    <span>{t("geometry.editor.semanticAuthoring.contamName")}</span>
                    <input maxLength={15} value={zoneCreatorDraft.contamName} onChange={(event) => setZoneCreatorDraft((current) => ({ ...current, contamName: event.target.value }))} />
                  </label>
                  <fieldset>
                    <legend>{t("geometry.editor.semanticAuthoring.volume")}</legend>
                    <label><input type="radio" name="zone-volume-mode" checked={zoneCreatorDraft.volumeMode === "geometry_estimate_confirmed"} onChange={() => setZoneCreatorDraft((current) => ({ ...current, volumeMode: "geometry_estimate_confirmed" }))} />{t("geometry.editor.semanticAuthoring.volumeFromGeometry")}</label>
                    <label><input type="radio" name="zone-volume-mode" checked={zoneCreatorDraft.volumeMode === "explicit"} onChange={() => setZoneCreatorDraft((current) => ({ ...current, volumeMode: "explicit" }))} />{t("geometry.editor.semanticAuthoring.volumeExplicit")}</label>
                  </fieldset>
                  {zoneCreatorDraft.volumeMode === "explicit" ? <label className="geometry-semantic-volume-input"><span>{t("geometry.editor.semanticAuthoring.volumeValue")}</span><input inputMode="decimal" value={zoneCreatorDraft.volumeM3} onChange={(event) => setZoneCreatorDraft((current) => ({ ...current, volumeM3: event.target.value }))} /><small>m³</small></label> : <small>{t("geometry.editor.semanticAuthoring.volumeGeometryHint", { height: activeLevel?.height ? activeLevel.height / 1_000 : "—" })}</small>}
                  <div><button type="button" onClick={() => setZoneCreatorOpen(false)}>{t("common.cancel")}</button><button type="submit">{t("geometry.editor.semanticAuthoring.startPlacement")}</button></div>
                </form>
              ) : null}
              {pendingZoneAuthoring ? (
                <div className="geometry-semantic-zone-pending" role="status">
                  <span><i aria-hidden="true" /><strong>{pendingZoneAuthoring.definition.displayName}</strong><small>{t("geometry.editor.semanticAuthoring.clickRoom")}</small></span>
                  <button type="button" onClick={cancelZoneAuthoring}>{t("common.cancel")}</button>
                </div>
              ) : null}
              <label className="geometry-zone-picker">
                <span>{t("geometry.editor.zoneEditor.semanticLabel")}</span>
                <select
                  value={controller.selectedZoneId ?? ""}
                  onChange={(event) => {
                    const zoneId = event.target.value || null;
                    selectZoneForAuthoring(zoneId);
                  }}
                >
                  <option value="">{t("geometry.editor.zoneEditor.semanticPlaceholder")}</option>
                  {activeZoneEntries.map(([zoneId, label]) => (
                    <option key={zoneId} value={zoneId}>{label} · {t(boundZoneIds.has(zoneId) ? "geometry.editor.bound" : "geometry.editor.unbound")}</option>
                  ))}
                </select>
              </label>
              {activeZoneEntries.slice(0, 5).map(([zoneId, label]) => {
                const selected = controller.selectedZoneId === zoneId;
                return (
                  <button key={zoneId} type="button" aria-pressed={selected} onClick={() => selectZoneForAuthoring(zoneId)}>
                    <i aria-hidden="true" />
                    <span><strong>{label}</strong><small>{boundZoneIds.has(zoneId) ? t("geometry.editor.bound") : t("geometry.editor.unbound")}</small></span>
                    {selected ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                  </button>
                );
              })}
            </div> : (
              <GeometryObjectNavigator
                level={activeLevel}
                zoneLabels={zoneLabels}
                flowPathLabels={flowPathLabels}
                verticalOpenings={geometry?.vertical_openings}
                verticalAnchors={geometry?.vertical_flow_path_anchors}
                levelNames={levelNames}
                selection={controller.selection}
                onSelect={selectNavigatorItem}
              />
            )}
            <div className="geometry-deck-mode-tabs" role="tablist" aria-label={t("geometry.editor.modeLabel")}>
              {(["studio", "sketchpad", "topology"] as const).map((mode) => (
                <button key={mode} type="button" role="tab" aria-selected={controller.mode === mode} onClick={() => setMode(mode)}>{t(`geometry.deck.modes.${mode}`)}</button>
              ))}
            </div>
            {layersOpen ? (
              <div className="geometry-deck-layer-popover">
                {(Object.keys(layers) as Array<keyof GeometryLayerVisibility>).map((key) => (
                  <label key={key}><input type="checkbox" checked={layers[key]} onChange={(event) => setLayers((current) => ({ ...current, [key]: event.target.checked }))} /><span>{t(`geometry.editor.layers.${key}`)}</span></label>
                ))}
                <section className="geometry-underlay-controls" aria-label={t("geometry.editor.underlay.title")}>
                  <header><ImageIcon size={15} /><strong>{t("geometry.editor.underlay.title")}</strong></header>
                  {!activeUnderlay ? (
                    <button type="button" disabled={underlayResource.status === "importing"} onClick={() => void underlayResource.importUnderlay()}>
                      <ImageIcon size={14} />{t(underlayResource.status === "importing" ? "geometry.editor.underlay.importing" : "geometry.editor.underlay.import")}
                    </button>
                  ) : (
                    <>
                      <div className="geometry-underlay-file">
                        <span title={activeUnderlay.display_name}>{activeUnderlay.display_name}</span>
                        <small>{activeUnderlay.mime_type === "application/pdf" ? `PDF · ${t("geometry.editor.underlay.page", { page: activeUnderlay.page_number })}` : `${activeUnderlay.pixel_width} × ${activeUnderlay.pixel_height}`}</small>
                      </div>
                      <div className="geometry-underlay-actions">
                        <button type="button" aria-pressed={activeUnderlay.visible} onClick={toggleUnderlayVisibility}>{activeUnderlay.visible ? <Eye size={14} /> : <EyeOff size={14} />}{t(activeUnderlay.visible ? "geometry.editor.underlay.hide" : "geometry.editor.underlay.show")}</button>
                        <button type="button" aria-pressed={activeUnderlay.locked} onClick={toggleUnderlayLock}>{activeUnderlay.locked ? <Lock size={14} /> : <Unlock size={14} />}{t(activeUnderlay.locked ? "geometry.editor.underlay.unlock" : "geometry.editor.underlay.lock")}</button>
                        <button type="button" onClick={removeUnderlay}><Trash2 size={14} />{t("geometry.editor.underlay.remove")}</button>
                      </div>
                      {activeUnderlay.mime_type === "application/pdf" && underlayResource.pageCount ? (
                        <label className="geometry-underlay-page"><span>{t("geometry.editor.underlay.pdfPage")}</span><input type="number" min={1} max={underlayResource.pageCount} value={activeUnderlay.page_number ?? 1} onChange={(event) => { const page = Number(event.target.value); if (Number.isSafeInteger(page) && page >= 1 && page <= underlayResource.pageCount!) void underlayResource.selectPdfPage(page); }} /><small>/ {underlayResource.pageCount}</small></label>
                      ) : null}
                      <form className="geometry-underlay-transform" onSubmit={(event) => { event.preventDefault(); applyUnderlayTransform(); }}>
                        <label><span>X <small>mm</small></span><input inputMode="numeric" disabled={activeUnderlay.locked} value={underlayTransformDraft.originX} onChange={(event) => setUnderlayTransformDraft((current) => ({ ...current, originX: event.target.value }))} /></label>
                        <label><span>Y <small>mm</small></span><input inputMode="numeric" disabled={activeUnderlay.locked} value={underlayTransformDraft.originY} onChange={(event) => setUnderlayTransformDraft((current) => ({ ...current, originY: event.target.value }))} /></label>
                        <label><span>{t("geometry.editor.underlay.rotation")} <small>°</small></span><input inputMode="decimal" disabled={activeUnderlay.locked} value={underlayTransformDraft.rotation} onChange={(event) => setUnderlayTransformDraft((current) => ({ ...current, rotation: event.target.value }))} /></label>
                        <label><span>{t("geometry.editor.underlay.opacity")} <small>%</small></span><input inputMode="numeric" disabled={activeUnderlay.locked} value={underlayTransformDraft.opacity} onChange={(event) => setUnderlayTransformDraft((current) => ({ ...current, opacity: event.target.value }))} /></label>
                        <button type="submit" disabled={activeUnderlay.locked}>{t("geometry.editor.underlay.applyTransform")}</button>
                      </form>
                      <div className="geometry-underlay-calibration">
                        <button type="button" disabled={activeUnderlay.locked || !activeUnderlay.visible || underlayResource.status !== "ready"} aria-pressed={controller.tool === "calibrate_underlay"} onClick={() => { setUnderlayCalibrationPoints([]); setUnderlayDistanceDraft(""); controller.setTool(controller.tool === "calibrate_underlay" ? "select" : "calibrate_underlay"); }}>{t("geometry.editor.underlay.calibrate")}</button>
                        {controller.tool === "calibrate_underlay" ? <p>{t("geometry.editor.underlay.calibrationProgress", { count: underlayCalibrationPoints.length })}</p> : null}
                        {underlayCalibrationPoints.length === 2 ? <form onSubmit={(event) => { event.preventDefault(); applyUnderlayCalibration(); }}><label><span>{t("geometry.editor.underlay.actualDistance")}</span><input autoFocus inputMode="numeric" value={underlayDistanceDraft} onChange={(event) => setUnderlayDistanceDraft(event.target.value)} /><small>mm</small></label><button type="submit">{t("geometry.editor.underlay.applyCalibration")}</button></form> : null}
                      </div>
                      {activeUnderlay.mime_type !== "application/pdf" && selectedImage?.attachment_id === activeUnderlay.resource_id ? (
                        <button type="button" className="geometry-underlay-ai" aria-pressed={selectedImage.selected_by_user} onClick={toggleImageSelection}><Sparkles size={14} />{t(selectedImage.selected_by_user ? "geometry.editor.underlay.aiSelected" : "geometry.editor.underlay.useForAi")}</button>
                      ) : null}
                    </>
                  )}
                  {underlayResource.issue ? <p role="alert" className="geometry-underlay-error">{t(`geometry.editor.underlay.errors.${underlayResource.issue}`, { defaultValue: t("geometry.editor.underlay.errors.generic") })}</p> : null}
                  <small>{t("geometry.editor.underlay.boundary")}</small>
                </section>
                {otherLevels.length > 0 ? <div className="geometry-level-reference-controls">
                  <label><span>{t("geometry.editor.levels.reference")}</span><select value={referenceLevelId ?? ""} onChange={(event) => { setReferenceLevelId(event.target.value || null); setFitSequence((value) => value + 1); }}><option value="">{t("geometry.editor.levels.noReference")}</option>{otherLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
                  <label><span>{t("geometry.editor.levels.copySource")}</span><select value={copySourceLevelId ?? ""} onChange={(event) => setCopySourceLevelId(event.target.value || null)}><option value="">{t("geometry.editor.levels.selectSource")}</option>{otherLevels.map((level) => <option key={level.id} value={level.id} disabled={level.walls.length === 0}>{level.name}</option>)}</select></label>
                  <button type="button" disabled={!copySourceLevelId || !activeLevel || !geometry || !levelIsEmptyConstructionTarget(activeLevel, geometry)} onClick={copyLevelConstruction}>{t("geometry.editor.levels.copyConstruction")}</button>
                  <small>{t("geometry.editor.levels.copyBoundary")}</small>
                </div> : null}
              </div>
            ) : null}
          </section>

          <div className="geometry-deck-island geometry-tool-dock" role="toolbar" aria-label={t("geometry.editor.toolbarLabel")}>
            {TOOL_DEFINITIONS.map(({ id, icon: Icon }) => (
              <button key={id} type="button" aria-pressed={controller.tool === id} disabled={(!geometry && id !== "pan" && id !== "select") || (id === "calibrate_underlay" && (!activeUnderlay || activeUnderlay.locked || !activeUnderlay.visible || underlayResource.status !== "ready"))} title={t(`geometry.editor.tools.${id}`)} onClick={() => { if (id === "calibrate_underlay") { setUnderlayCalibrationPoints([]); setUnderlayDistanceDraft(""); } controller.setTool(id); }}>
                <Icon size={20} aria-hidden="true" /><span>{t(`geometry.editor.tools.${id}`)}</span>
              </button>
            ))}
            <span className="geometry-tool-divider" aria-hidden="true" />
            <button type="button" title={t("geometry.editor.fit")} disabled={!geometry} onClick={() => setFitSequence((value) => value + 1)}><Maximize2 size={20} /><span>{t("geometry.editor.fit")}</span></button>
          </div>

          {controller.tool === "vertical_opening" ? (
            <section className="geometry-deck-island geometry-vertical-tool-options" aria-label={t("geometry.editor.verticalOpening.options")}>
              <header><ArrowUpDown size={16} /><strong>{t("geometry.editor.verticalOpening.title")}</strong></header>
              <label>
                <span>{t("geometry.editor.verticalOpening.targetLevel")}</span>
                <select value={verticalTargetLevelId ?? ""} onChange={(event) => setVerticalTargetLevelId(event.target.value || null)}>
                  <option value="">{t("geometry.editor.verticalOpening.noAdjacentLevel")}</option>
                  {adjacentLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                </select>
              </label>
              <label>
                <span>{t("geometry.editor.verticalOpening.kind")}</span>
                <select value={verticalOpeningKind} onChange={(event) => setVerticalOpeningKind(event.target.value as GeometryVerticalOpening["kind"])}>
                  {(["floor_opening", "stair", "shaft"] as const).map((kind) => <option key={kind} value={kind}>{t(`geometry.editor.verticalOpening.kinds.${kind}`)}</option>)}
                </select>
              </label>
              <small>{t("geometry.editor.verticalOpening.placeHint")}</small>
            </section>
          ) : null}

          <section className="geometry-deck-island geometry-deck-inspector" aria-label={t("geometry.editor.panels.inspector")}>
            <header>
              <div><span>{t("geometry.deck.selectedObject")}</span><strong>{controller.selection ? `${t(`geometry.editor.property.${controller.selection.kind}`, { defaultValue: controller.selection.kind })} · ${controller.selection.id}` : t("geometry.editor.inspector.empty")}</strong></div>
              {controller.selection ? <IconButton label={t("geometry.deck.clearSelection")} onClick={() => controller.setSelection(null)}><X size={15} /></IconButton> : null}
            </header>
            {selectedObject ? (
              <>
                <dl className="geometry-deck-property-list">
                  <div><dt>{t("geometry.editor.property.type")}</dt><dd>{controller.selection?.kind}</dd></div>
                  {wallLength !== null ? <div><dt>{t("geometry.deck.length")}</dt><dd>{wallLength.toLocaleString()} mm</dd></div> : null}
                  {"thickness" in selectedObject ? <div><dt>{t("geometry.editor.property.thickness")}</dt><dd>{selectedObject.thickness ?? "—"} mm</dd></div> : null}
                  {"width" in selectedObject ? <div><dt>{t("geometry.editor.property.width")}</dt><dd>{selectedObject.width.toLocaleString()} mm</dd></div> : null}
                </dl>
                {selectedVertex ? (
                  <form className="geometry-vertex-coordinate-editor geometry-precision-editor" onSubmit={(event) => { event.preventDefault(); applyVertexCoordinates(); }}>
                    <p id="geometry-vertex-coordinate-hint">{t("geometry.editor.coordinateEditor.hint")}</p>
                    <div>
                      <label htmlFor="geometry-vertex-x">X <span>mm</span></label>
                      <input
                        id="geometry-vertex-x"
                        inputMode="numeric"
                        value={vertexCoordinateDraft.x}
                        aria-describedby="geometry-vertex-coordinate-hint"
                        onChange={(event) => setVertexCoordinateDraft((current) => ({ ...current, x: event.target.value }))}
                      />
                      <label htmlFor="geometry-vertex-y">Y <span>mm</span></label>
                      <input
                        id="geometry-vertex-y"
                        inputMode="numeric"
                        value={vertexCoordinateDraft.y}
                        aria-describedby="geometry-vertex-coordinate-hint"
                        onChange={(event) => setVertexCoordinateDraft((current) => ({ ...current, y: event.target.value }))}
                      />
                    </div>
                    <button type="submit">{t("geometry.editor.coordinateEditor.apply")}</button>
                  </form>
                ) : selectedWall && selectedWallFrame ? (
                  <form className="geometry-vertex-coordinate-editor geometry-precision-editor" onSubmit={(event) => { event.preventDefault(); applyWallAxis(); }}>
                    <p id="geometry-wall-axis-hint">{t("geometry.editor.wallEditor.hint", { axis: selectedWallFrame.orientation === "horizontal" ? "Y" : "X" })}</p>
                    <div className="is-single-field">
                      <label htmlFor="geometry-wall-axis">{selectedWallFrame.orientation === "horizontal" ? "Y" : "X"} <span>mm</span></label>
                      <input
                        id="geometry-wall-axis"
                        inputMode="numeric"
                        value={wallAxisDraft}
                        aria-describedby="geometry-wall-axis-hint"
                        onChange={(event) => setWallAxisDraft(event.target.value)}
                      />
                    </div>
                    <button type="submit">{t("geometry.editor.wallEditor.apply")}</button>
                  </form>
                ) : selectedOpening ? (
                  <>
                  <form className="geometry-vertex-coordinate-editor geometry-precision-editor" onSubmit={(event) => { event.preventDefault(); applyOpeningDimensions(); }}>
                    <p id="geometry-opening-dimension-hint">{t("geometry.editor.openingEditor.hint")}</p>
                    <div>
                      <label htmlFor="geometry-opening-offset">{t("geometry.editor.openingEditor.offset")} <span>mm</span></label>
                      <input
                        id="geometry-opening-offset"
                        inputMode="numeric"
                        value={openingDimensionDraft.offset}
                        aria-describedby="geometry-opening-dimension-hint"
                        onChange={(event) => setOpeningDimensionDraft((current) => ({ ...current, offset: event.target.value }))}
                      />
                      <label htmlFor="geometry-opening-width">{t("geometry.editor.property.width")} <span>mm</span></label>
                      <input
                        id="geometry-opening-width"
                        inputMode="numeric"
                        value={openingDimensionDraft.width}
                        aria-describedby="geometry-opening-dimension-hint"
                        onChange={(event) => setOpeningDimensionDraft((current) => ({ ...current, width: event.target.value }))}
                      />
                    </div>
                    <button type="submit">{t("geometry.editor.openingEditor.apply")}</button>
                  </form>
                  <WallFlowPathEditor
                    opening={selectedOpening}
                    wall={activeWall}
                    boundary={activeWallBoundary}
                    anchor={selectedWallFlowPath}
                    audit={selectedWallFlowAudit}
                    options={wallFlowPathOptions}
                    selectedFlowPathId={controller.selectedFlowPathId}
                    zoneLabels={zoneLabels}
                    flowPathLabels={flowPathLabels}
                    onSelectFlowPath={controller.setSelectedFlowPathId}
                    onBind={() => linkSelectedWallFlowPath(selectedOpening.id)}
                    onUnbind={unlinkSelectedWallFlowPath}
                  />
                  {!selectedWallFlowPath && activeWallBoundary ? (
                    <SemanticFlowPathCreator
                      boundary={activeWallBoundary}
                      elements={supportedFlowElements}
                      zoneLabels={zoneLabels}
                      onCreate={createSemanticFlowPath}
                    />
                  ) : null}
                  </>
                ) : directlySelectedWallFlowPath && activeWallOpening ? (
                  <WallFlowPathEditor
                    opening={activeWallOpening}
                    wall={activeWall}
                    boundary={activeWallBoundary}
                    anchor={directlySelectedWallFlowPath}
                    audit={selectedWallFlowAudit}
                    options={wallFlowPathOptions}
                    selectedFlowPathId={controller.selectedFlowPathId}
                    zoneLabels={zoneLabels}
                    flowPathLabels={flowPathLabels}
                    onSelectFlowPath={controller.setSelectedFlowPathId}
                    onBind={() => linkSelectedWallFlowPath(activeWallOpening.id)}
                    onUnbind={unlinkSelectedWallFlowPath}
                  />
                ) : selectedZoneRegion ? (
                  <div className="geometry-zone-topology-actions">
                    <p>{t(controller.tool === "partition"
                      ? "geometry.editor.zoneEditor.partitionActive"
                      : controller.tool === "merge"
                        ? "geometry.editor.zoneEditor.mergeActive"
                        : "geometry.editor.zoneEditor.hint")}</p>
                    <label>
                      <span>{t("geometry.editor.zoneEditor.targetLabel")}</span>
                      <select
                        value={partitionTargetReady ? controller.selectedZoneId ?? "" : ""}
                        onChange={(event) => controller.setSelectedZoneId(event.target.value || null)}
                      >
                        <option value="">{t("geometry.editor.zoneEditor.targetPlaceholder")}</option>
                        {unboundZoneOptions.map(([zoneId, label]) => (
                          <option key={zoneId} value={zoneId}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <div>
                      <button type="button" aria-pressed={controller.tool === "partition"} disabled={!partitionTargetReady} onClick={toggleZonePartition}>
                        <SquareSplitHorizontal size={14} />{t("geometry.editor.zoneEditor.partition")}
                      </button>
                      <button type="button" aria-pressed={controller.tool === "merge"} onClick={toggleZoneMerge}>
                        <Merge size={14} />{t("geometry.editor.zoneEditor.merge")}
                      </button>
                    </div>
                    <small>{partitionTargetReady
                      ? t("geometry.editor.zoneEditor.targetReady", { zone: zoneLabels.get(controller.selectedZoneId!) ?? controller.selectedZoneId })
                      : t("geometry.editor.zoneEditor.selectTarget")}</small>
                  </div>
                ) : activeVerticalOpening ? (
                  <div className="geometry-vertical-flow-editor">
                    <dl>
                      <div><dt>{t("geometry.editor.verticalOpening.lowerLevel")}</dt><dd>{levelNames.get(activeVerticalOpening.lower_level_id) ?? activeVerticalOpening.lower_level_id}</dd></div>
                      <div><dt>{t("geometry.editor.verticalOpening.upperLevel")}</dt><dd>{levelNames.get(activeVerticalOpening.upper_level_id) ?? activeVerticalOpening.upper_level_id}</dd></div>
                      <div><dt>{t("geometry.editor.verticalOpening.depth")}</dt><dd>{activeVerticalOpening.depth.toLocaleString()} mm</dd></div>
                      <div><dt>{t("geometry.editor.verticalOpening.zonePair")}</dt><dd>{activeVerticalZones ? `${zoneLabels.get(activeVerticalZones.lower) ?? activeVerticalZones.lower} ↕ ${zoneLabels.get(activeVerticalZones.upper) ?? activeVerticalZones.upper}` : "—"}</dd></div>
                    </dl>
                    {selectedVerticalFlowPath ? (
                      <div className="geometry-vertical-flow-status is-bound">
                        <Link2 size={15} />
                        <span>{t("geometry.editor.verticalOpening.boundFlowPath")}</span>
                        <strong>{flowPathLabels.get(selectedVerticalFlowPath.semantic_flow_path_id) ?? selectedVerticalFlowPath.semantic_flow_path_id}</strong>
                        <button type="button" onClick={unlinkSelectedVerticalFlowPath}><Unlink size={13} />{t("geometry.editor.verticalOpening.unbindFlowPath")}</button>
                      </div>
                    ) : (
                      <>
                        <label>
                          <span>{t("geometry.editor.verticalOpening.flowPath")}</span>
                          <select value={controller.selectedFlowPathId ?? ""} onChange={(event) => controller.setSelectedFlowPathId(event.target.value || null)}>
                            <option value="">{t("geometry.editor.verticalOpening.selectMatchingFlowPath")}</option>
                            {verticalFlowPathOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                          </select>
                        </label>
                        <button type="button" disabled={!controller.selectedFlowPathId || !verticalFlowPathOptions.some((option) => option.id === controller.selectedFlowPathId)} onClick={linkSelectedVerticalFlowPath}>
                          <Link2 size={14} />{t("geometry.editor.verticalOpening.bindFlowPath")}
                        </button>
                        <small>{verticalFlowPathOptions.length
                          ? t("geometry.editor.verticalOpening.bindingHint")
                          : t("geometry.editor.verticalOpening.noMatchingFlowPath")}</small>
                      </>
                    )}
                  </div>
                ) : null}
                <button type="button" className="geometry-deck-details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((value) => !value)}>{t("geometry.deck.advancedDetails")}<ChevronRight size={15} /></button>
              </>
            ) : <p className="geometry-inspector-empty">{t("geometry.deck.selectHint")}</p>}
            {detailsOpen ? (
              <div className="geometry-deck-details">
                <div className="geometry-inspector-tabs" role="tablist">
                  {(["geometry", "airflow", "validation"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={inspectorTab === tab} onClick={() => setInspectorTab(tab)}>{t(`geometry.editor.inspector.${tab}`)}</button>)}
                </div>
                {inspectorTab === "airflow" ? (
                  <div className="geometry-flow-list"><p>{activeWallOpening
                    ? t("geometry.editor.wallAirflow.contextualHint")
                    : activeVerticalOpening
                      ? t("geometry.editor.verticalOpening.bindingHint")
                      : t("geometry.editor.wallAirflow.selectOpeningHint")}</p></div>
                ) : inspectorTab === "validation" ? (
                  <div className="geometry-validation-summary">{validation?.status === "valid" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<strong>{t(validation?.status === "valid" ? "geometry.editor.validation.valid" : "geometry.editor.validation.invalid")}</strong><span>{t("geometry.editor.validation.count", { count: validation?.diagnostics.length ?? 0 })}</span></div>
                ) : <p className="geometry-inspector-empty"><code>{controller.selection?.id ?? "—"}</code></p>}
              </div>
            ) : null}
            <div className="geometry-deck-inspector-actions"><button type="button" disabled={!controller.selection || !["wall", "opening", "flow_path", "vertical_opening", "vertical_flow_path"].includes(controller.selection.kind)} onClick={removeSelection}>{controller.selection?.kind === "vertical_flow_path" ? <Unlink size={14} /> : <Trash2 size={14} />}{t(controller.selection?.kind === "wall" ? "geometry.editor.trimSegment" : controller.selection?.kind === "vertical_flow_path" ? "geometry.editor.verticalOpening.unbindFlowPath" : "geometry.editor.delete")}</button></div>
          </section>

          {qualityAiDemo && aiDraftOpen ? (
            <section className="geometry-ai-draft-dialog" role="dialog" aria-modal="false" aria-labelledby="geometry-ai-draft-title">
              <header><div><Sparkles size={17} /><strong id="geometry-ai-draft-title">{t("geometry.deck.ai.title")}</strong><span>{t("geometry.deck.ai.beta")}</span></div><IconButton label={t("geometry.deck.ai.close")} onClick={() => { if (geometryAi.status === "generating") geometryAi.cancel(); setAiDraftOpen(false); }}><X size={16} /></IconButton></header>
              <div className="geometry-ai-draft-body">
                <div className="geometry-ai-source">
                  {qualityAiDemo && qualityAiDemoSource ? <img src={qualityAiDemoSource} alt={t("geometry.deck.ai.sourceAlt")} /> : <div className="geometry-ai-source-placeholder"><ImageIcon size={24} /><span>{selectedImage?.display_name ?? t("geometry.deck.ai.noImage")}</span></div>}
                  <button type="button" disabled={qualityAiDemo} onClick={selectedImage ? toggleImageSelection : onAttachmentImport}>{qualityAiDemo ? t("geometry.deck.ai.selected") : selectedImage ? (selectedImage.selected_by_user ? t("geometry.deck.ai.selected") : t("geometry.deck.ai.useImage")) : t("geometry.deck.ai.importImage")}</button>
                </div>
                <div className="geometry-ai-intent">
                  <label htmlFor="geometry-ai-prompt">{t("geometry.deck.ai.intent")}</label>
                  <textarea id="geometry-ai-prompt" value={aiPrompt} disabled={geometryAi.status === "generating"} onChange={(event) => setAiPrompt(event.target.value)} maxLength={600} />
                  <div className="geometry-ai-receipt" aria-label={t("geometry.deck.ai.receipt")}>
                    <div className="is-ready"><span><ImageIcon size={14} />{t("geometry.deck.ai.codexStage")}</span><strong>{t("geometry.deck.ai.fixtureReady")}</strong></div>
                  </div>
                  {!qualityAiDemo ? <p className="geometry-ai-boundary" id="geometry-ai-boundary">{t("geometry.deck.ai.boundary")}</p> : null}
                  {geometryAi.issue ? <p className="geometry-ai-error" role="alert"><AlertTriangle size={14} />{t(`geometry.deck.ai.errors.${geometryAi.issue.code}`, { defaultValue: geometryAi.issue.message })}</p> : null}
                  {geometryAi.draft ? (
                    <section className="geometry-ai-review" aria-live="polite">
                      <div><strong>{geometryAi.draft.summary}</strong><span>{t("geometry.deck.ai.confidence", { confidence: geometryAi.draft.confidence_percent })}</span></div>
                      <dl>
                        <div><dt>{t("geometry.deck.ai.measurementBasis")}</dt><dd>{t(`geometry.deck.ai.measurement.${geometryAi.draft.measurement_basis}`)}</dd></div>
                        <div><dt>{t("geometry.deck.ai.operationCount")}</dt><dd>{geometryAi.draft.operations.length}</dd></div>
                      </dl>
                      {geometryAi.draft.warnings.length ? <ul>{geometryAi.draft.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
                    </section>
                  ) : null}
                  <Button variant="primary" icon={<Sparkles size={16} />} loading={geometryAi.status === "generating"} disabled={geometryAi.status === "generating"} onClick={generateDraft}>{aiDraftVisible ? t("geometry.deck.ai.regenerate") : t("geometry.deck.ai.generate")}</Button>
                  <div className="geometry-ai-secondary-actions">
                    <button type="button" disabled={!aiDraftGenerated} aria-pressed={aiDraftVisible} onClick={() => setAiDraftVisible((value) => !value)}>{t("geometry.deck.ai.compare")}</button>
                    <button type="button" onClick={() => { geometryAi.cancel(); setAiDraftGenerated(false); setAiDraftVisible(false); setAiDraftOpen(false); }}>{geometryAi.status === "generating" ? t("geometry.deck.ai.stop") : t("geometry.deck.ai.cancel")}</button>
                    {!qualityAiDemo ? <button type="button" className="is-confirm" disabled={geometryAi.status !== "ready" || !geometryAi.draft?.operations.length} onClick={() => { if (geometryAi.confirm()) { setAiDraftVisible(false); setAiDraftGenerated(false); } }}>{t("geometry.deck.ai.confirm")}</button> : null}
                    <button type="button" onClick={onOpenAssistant}>{t("geometry.deck.ai.openAssistant")}</button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <button type="button" className={`geometry-deck-status ${issueCode ? "has-issue" : ""}`} onClick={() => setEvidenceOpen((value) => !value)} aria-expanded={evidenceOpen}>
            <i aria-hidden="true" />
            <strong>{issueCode ? t(issueCode, { defaultValue: issueCode }) : validation?.status === "valid" ? t("geometry.deck.simulationReady") : t("geometry.editor.footer.needsReview")}</strong>
            <span>{t("geometry.deck.unitsGrid", { grid: 250 })}</span>
          </button>
          {evidenceOpen ? (
            <section className="geometry-deck-evidence" aria-label={t("geometry.editor.panels.evidence")}>
              <header><ShieldCheck size={15} /><strong>{t("geometry.editor.panels.evidence")}</strong><IconButton label={t("geometry.deck.ai.close")} onClick={() => setEvidenceOpen(false)}><X size={15} /></IconButton></header>
              <dl><div><dt>{t("geometry.editor.evidence.source")}</dt><dd><code>{projectState.project?.source_sha256.slice(0, 12)}…</code></dd></div><div><dt>Revision</dt><dd><code>{projectState.draft?.revision_id.slice(0, 12)}…</code></dd></div><div><dt>{t("geometry.editor.evidence.roundTrip")}</dt><dd>{t("geometry.editor.evidence.unsupported")}</dd></div><div><dt>{t("geometry.projectionPreview.title")}</dt><dd>{sketchpadPreview ? t(`geometry.projectionPreview.status.${sketchpadPreview.status}`) : "—"}</dd></div></dl>
              <div className="geometry-semantic-export">
                <Button
                  variant="primary"
                  icon={<FileOutput size={15} />}
                  loading={controller.semanticExport.status === "exporting"}
                  disabled={semanticDraftObjectCount === 0 || controller.persistence.status === "loading" || controller.persistence.status === "saving" || controller.persistence.status === "error"}
                  onClick={controller.exportSemanticDraft}
                >
                  {t("geometry.editor.semanticExport.action")}
                </Button>
                <p>{t("geometry.editor.semanticExport.hint", {
                  zones: controller.semanticDraft?.zones.length ?? 0,
                  paths: controller.semanticDraft?.flow_paths.length ?? 0,
                })}</p>
                <div className={`geometry-semantic-export-status is-${controller.semanticExport.status}`} aria-live="polite" title={controller.semanticExport.issue?.code}>
                  {controller.semanticExport.status === "success" && controller.semanticExport.summary
                    ? t("geometry.editor.semanticExport.success", {
                        file: controller.semanticExport.summary.file_name,
                        zones: controller.semanticExport.summary.added_zone_count,
                        paths: controller.semanticExport.summary.added_flow_path_count,
                      })
                    : controller.semanticExport.status === "error"
                      ? t("geometry.editor.semanticExport.error")
                      : controller.semanticExport.status === "cancelled"
                        ? t("geometry.editor.semanticExport.cancelled")
                      : null}
                </div>
                {controller.semanticExport.status === "success" ? (
                  <p className="geometry-semantic-export-next-step">
                    {t("geometry.editor.semanticExport.nextStep")}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
          {canvasAiPreview ? <span className="geometry-ai-draft-badge">{t("geometry.deck.ai.draftBadge", { count: canvasAiPreview.operationCount })}</span> : null}
        </div>
      ) : (
        <div className="geometry-readonly-view">
          <Suspense fallback={<LoadingState label={t("visual.loading")} />}>
            <VisualModelWorkspace
              snapshot={snapshot}
              projection={snapshot.spatial_projection}
              selectedSemanticObjectId={selectedSemanticObjectId}
              preferences={{ ...visualPreferences, mode: controller.mode }}
              onPreferencesChange={(nextPreferences) => {
                if (nextPreferences.mode !== controller.mode) controller.setMode(nextPreferences.mode);
                onVisualPreferencesChange(nextPreferences);
              }}
              onOpenStudio={() => controller.setMode("studio")}
              studioLabel={t("geometry.deck.modes.studio")}
              onSelectSemantic={onSelectSemantic}
              projectionPreview={sketchpadPreview}
              onReviewSketchpadProjection={onReviewSketchpadProjection}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
}
