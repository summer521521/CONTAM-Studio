import Konva from "konva";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Arrow, Circle, Group, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import {
  VISUAL_GRID_SIZE,
  buildSpatialBindingIndex,
  classifySpatialIconType,
  fitViewport,
  iconVisible,
  wallSegments,
  zoomViewportAtPointer,
  type SpatialIcon,
  type SpatialLevel,
  type SpatialProjection,
  type TopologyLayout,
  type VisualLayerVisibility,
  type VisualViewport,
  type VisualWorkspaceMode,
} from "../../../app/spatial-model";
import type { VisualViewportCommand } from "./VisualModelWorkspace";
import type { VisualResultOverlay } from "./VisualModelWorkspace";

export interface VisualCanvasKonvaProps {
  mode: VisualWorkspaceMode;
  projection: SpatialProjection | null;
  activeLevel: SpatialLevel | null;
  topology: TopologyLayout;
  layers: VisualLayerVisibility;
  viewport: VisualViewport;
  command: VisualViewportCommand;
  selectedSemanticObjectId: string | null;
  onViewportChange: (viewport: VisualViewport) => void;
  onSelectSemantic: (semanticId: string) => void;
  resultOverlay?: VisualResultOverlay | null;
}

export interface HandledViewportCommand {
  contextKey: string;
  sequence: number;
}

export function shouldConsumeViewportCommand(
  handled: HandledViewportCommand | null,
  command: VisualViewportCommand,
  currentContextKey: string,
): boolean {
  return command.sequence > 0
    && command.contextKey === currentContextKey
    && (handled?.contextKey !== command.contextKey || handled.sequence !== command.sequence);
}

type CanvasPalette = {
  background: string;
  grid: string;
  wall: string;
  node: string;
  nodeFill: string;
  flow: string;
  boundary: string;
  text: string;
  muted: string;
  selection: string;
  selectionContrast: string;
};

const fallbackPalette: CanvasPalette = {
  background: "#f4f7f9",
  grid: "#dfe6eb",
  wall: "#52616b",
  node: "#2563a6",
  nodeFill: "#e8f1fb",
  flow: "#5f7280",
  boundary: "#7a6d5c",
  text: "#1f2933",
  muted: "#677783",
  selection: "#0b6fc2",
  selectionContrast: "#ffffff",
};

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readPalette(): CanvasPalette {
  return {
    background: cssColor("--visual-canvas-bg", fallbackPalette.background),
    grid: cssColor("--visual-grid", fallbackPalette.grid),
    wall: cssColor("--visual-wall", fallbackPalette.wall),
    node: cssColor("--visual-zone", fallbackPalette.node),
    nodeFill: cssColor("--visual-zone-fill", fallbackPalette.nodeFill),
    flow: cssColor("--visual-flow", fallbackPalette.flow),
    boundary: cssColor("--visual-boundary", fallbackPalette.boundary),
    text: cssColor("--text-primary", fallbackPalette.text),
    muted: cssColor("--text-supporting", fallbackPalette.muted),
    selection: cssColor("--visual-selection", fallbackPalette.selection),
    selectionContrast: cssColor("--visual-selection-contrast", fallbackPalette.selectionContrast),
  };
}

function useCanvasPalette(): CanvasPalette {
  const [palette, setPalette] = useState(fallbackPalette);
  useEffect(() => {
    const update = () => setPalette(readPalette());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
    return () => observer.disconnect();
  }, []);
  return palette;
}

function previousLevel(projection: SpatialProjection | null, activeLevel: SpatialLevel | null): SpatialLevel | null {
  if (!projection || !activeLevel) return null;
  const ordered = [...projection.levels].sort((left, right) => left.level_number - right.level_number);
  const index = ordered.findIndex((level) => level.level_number === activeLevel.level_number);
  return index > 0 ? ordered[index - 1] : null;
}

function visibleIcons(
  icons: readonly SpatialIcon[],
  layers: VisualLayerVisibility,
  viewport: VisualViewport,
  size: { width: number; height: number },
): SpatialIcon[] {
  const filtered = icons.filter((icon) => iconVisible(icon, layers));
  if (filtered.length <= 20_000) return filtered;
  const margin = VISUAL_GRID_SIZE * 4;
  const minX = -viewport.x / viewport.scale - margin;
  const maxX = (size.width - viewport.x) / viewport.scale + margin;
  const minY = -viewport.y / viewport.scale - margin;
  const maxY = (size.height - viewport.y) / viewport.scale + margin;
  return filtered.filter((icon) => {
    const x = icon.column * VISUAL_GRID_SIZE;
    const y = icon.row * VISUAL_GRID_SIZE;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  });
}

function GridLayer({ size, viewport, color }: { size: { width: number; height: number }; viewport: VisualViewport; color: string }) {
  const spacing = VISUAL_GRID_SIZE * viewport.scale;
  if (spacing < 7) return null;
  const vertical: number[][] = [];
  const horizontal: number[][] = [];
  const minX = -viewport.x / viewport.scale;
  const maxX = (size.width - viewport.x) / viewport.scale;
  const minY = -viewport.y / viewport.scale;
  const maxY = (size.height - viewport.y) / viewport.scale;
  const startX = Math.floor(minX / VISUAL_GRID_SIZE) * VISUAL_GRID_SIZE;
  const startY = Math.floor(minY / VISUAL_GRID_SIZE) * VISUAL_GRID_SIZE;
  for (let x = startX; x <= maxX; x += VISUAL_GRID_SIZE) vertical.push([x, minY, x, maxY]);
  for (let y = startY; y <= maxY; y += VISUAL_GRID_SIZE) horizontal.push([minX, y, maxX, y]);
  return (
    <Layer listening={false}>
      {vertical.map((points, index) => <Line key={`v-${index}`} points={points} stroke={color} strokeWidth={1 / viewport.scale} />)}
      {horizontal.map((points, index) => <Line key={`h-${index}`} points={points} stroke={color} strokeWidth={1 / viewport.scale} />)}
    </Layer>
  );
}

function wallScene(icons: readonly SpatialIcon[]) {
  return (context: Konva.Context, shape: Konva.Shape) => {
    context.beginPath();
    for (const icon of icons) {
      const x = icon.column * VISUAL_GRID_SIZE;
      const y = icon.row * VISUAL_GRID_SIZE;
      for (const segment of wallSegments(icon.icon_type)) {
        context.moveTo(x + segment.from[0] * VISUAL_GRID_SIZE, y + segment.from[1] * VISUAL_GRID_SIZE);
        context.lineTo(x + segment.to[0] * VISUAL_GRID_SIZE, y + segment.to[1] * VISUAL_GRID_SIZE);
      }
    }
    context.strokeShape(shape);
  };
}

function iconTooltip(icon: SpatialIcon, kindLabel: string, bindingLabel: string): string {
  return `${kindLabel} · #${icon.object_number}\n${bindingLabel}`;
}

function selectedLabelPosition(
  worldPoint: { x: number; y: number },
  viewport: VisualViewport,
  size: { width: number; height: number },
): { left: number; top: number } {
  const maxLeft = Math.max(8, size.width - 240);
  const maxTop = Math.max(8, size.height - 42);
  return {
    left: Math.min(Math.max(8, viewport.x + worldPoint.x * viewport.scale + 14), maxLeft),
    top: Math.min(Math.max(8, viewport.y + worldPoint.y * viewport.scale - 42), maxTop),
  };
}

export default function VisualCanvasKonva({
  mode,
  projection,
  activeLevel,
  topology,
  layers,
  viewport,
  command,
  selectedSemanticObjectId,
  onViewportChange,
  onSelectSemantic,
  resultOverlay = null,
}: VisualCanvasKonvaProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const viewportRef = useRef(viewport);
  const lastHandledCommandRef = useRef<HandledViewportCommand | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const palette = useCanvasPalette();
  const currentContextKey = `${projection?.identity_sha256 ?? "none"}:${projection?.revision_id ?? "none"}`;
  const bindingIndex = useMemo(() => buildSpatialBindingIndex(projection?.levels ?? []), [projection]);
  const lowerLevel = useMemo(() => previousLevel(projection, activeLevel), [activeLevel, projection]);
  const sketchIcons = useMemo(
    () => visibleIcons(activeLevel?.icons ?? [], layers, viewport, size),
    [activeLevel?.icons, layers, size, viewport],
  );
  const walls = useMemo(() => sketchIcons.filter((icon) => classifySpatialIconType(icon.icon_type) === "wall"), [sketchIcons]);
  const selectableIcons = useMemo(() => sketchIcons.filter((icon) => classifySpatialIconType(icon.icon_type) !== "wall"), [sketchIcons]);
  const lowerLevelIcons = useMemo(
    () => visibleIcons(lowerLevel?.icons ?? [], layers, viewport, size),
    [layers, lowerLevel?.icons, size, viewport],
  );
  const topologyNodeById = useMemo(
    () => new Map(topology.nodes.map((node) => [node.id, node])),
    [topology.nodes],
  );
  const topologyNodeBySemantic = useMemo(
    () => new Map(topology.nodes.filter((node) => node.semanticId).map((node) => [node.semanticId as string, node])),
    [topology.nodes],
  );
  const topologyEdgeBySemantic = useMemo(
    () => new Map(topology.edges.map((edge) => [edge.semanticId, edge])),
    [topology.edges],
  );
  const visibleTopologyNodes = useMemo(() => {
    if (topology.nodes.length <= 20_000) return topology.nodes;
    const margin = 160;
    const minX = -viewport.x / viewport.scale - margin;
    const maxX = (size.width - viewport.x) / viewport.scale + margin;
    const minY = -viewport.y / viewport.scale - margin;
    const maxY = (size.height - viewport.y) / viewport.scale + margin;
    return topology.nodes.filter((node) => node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY);
  }, [size.height, size.width, topology.nodes, viewport]);
  const visibleTopologyNodeIds = useMemo(
    () => new Set(visibleTopologyNodes.map((node) => node.id)),
    [visibleTopologyNodes],
  );
  const visibleTopologyEdges = useMemo(
    () => topology.nodes.length <= 20_000
      ? topology.edges
      : topology.edges.filter((edge) => visibleTopologyNodeIds.has(edge.fromNodeId) && visibleTopologyNodeIds.has(edge.toNodeId)),
    [topology.edges, topology.nodes.length, visibleTopologyNodeIds],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let frame = 0;
    const update = (width: number, height: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setSize((current) => current.width === width && current.height === height ? current : { width, height });
      });
    };
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) update(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
    });
    observer.observe(root);
    const rect = root.getBoundingClientRect();
    update(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    if (!shouldConsumeViewportCommand(lastHandledCommandRef.current, command, currentContextKey)) return;
    // ResizeObserver reports the real canvas size after the lazy Konva shell
    // mounts. Do not consume the one-shot command against the 1x1 bootstrap
    // size, otherwise the initial fit is permanently lost.
    if (size.width <= 1 || size.height <= 1) return;
    lastHandledCommandRef.current = { contextKey: command.contextKey, sequence: command.sequence };
    const currentViewport = viewportRef.current;
    const center = { x: size.width / 2, y: size.height / 2 };
    if (command.action === "fit") {
      const bounds = mode === "sketchpad" ? activeLevel?.bounds ?? null : topology.bounds;
      onViewportChange(fitViewport(bounds, size.width, size.height));
    } else if (command.action === "reset") {
      onViewportChange({ x: 0, y: 0, scale: 1 });
    } else if (command.action === "zoom_in") {
      onViewportChange(zoomViewportAtPointer(currentViewport, center, currentViewport.scale * 1.2));
    } else if (command.action === "zoom_out") {
      onViewportChange(zoomViewportAtPointer(currentViewport, center, currentViewport.scale / 1.2));
    } else if (command.action === "locate" && selectedSemanticObjectId) {
      const sketchTarget = bindingIndex.get(selectedSemanticObjectId);
      const topologyTarget = topologyNodeBySemantic.get(selectedSemanticObjectId);
      const edgeTarget = topologyEdgeBySemantic.get(selectedSemanticObjectId);
      const edgeFrom = edgeTarget ? topologyNodeById.get(edgeTarget.fromNodeId) : null;
      const edgeTo = edgeTarget ? topologyNodeById.get(edgeTarget.toNodeId) : null;
      const worldX = mode === "sketchpad"
        ? (sketchTarget?.column ?? 0) * VISUAL_GRID_SIZE
        : topologyTarget?.x ?? (edgeFrom && edgeTo ? (edgeFrom.x + edgeTo.x) / 2 : 0);
      const worldY = mode === "sketchpad"
        ? (sketchTarget?.row ?? 0) * VISUAL_GRID_SIZE
        : topologyTarget?.y ?? (edgeFrom && edgeTo ? (edgeFrom.y + edgeTo.y) / 2 : 0);
      if (sketchTarget || topologyTarget || (edgeFrom && edgeTo)) {
        onViewportChange({ ...currentViewport, x: center.x - worldX * currentViewport.scale, y: center.y - worldY * currentViewport.scale });
      }
    }
  }, [activeLevel?.bounds, bindingIndex, command, currentContextKey, mode, onViewportChange, selectedSemanticObjectId, size.height, size.width, topology.bounds, topologyEdgeBySemantic, topologyNodeById, topologyNodeBySemantic]);

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    const factor = event.evt.deltaY > 0 ? 0.9 : 1.1;
    onViewportChange(zoomViewportAtPointer(viewport, pointer, viewport.scale * factor));
  };
  const handleBlankSelection = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (event.target === event.target.getStage()) onSelectSemantic("");
  };
  const showTooltip = (event: Konva.KonvaEventObject<MouseEvent>, text: string) => {
    const pointer = event.target.getStage()?.getPointerPosition();
    if (pointer) setTooltip({ x: pointer.x + 12, y: pointer.y + 12, text });
  };
  const onStageKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") onViewportChange(zoomViewportAtPointer(viewport, { x: size.width / 2, y: size.height / 2 }, viewport.scale * 1.2));
    else if (event.key === "-") onViewportChange(zoomViewportAtPointer(viewport, { x: size.width / 2, y: size.height / 2 }, viewport.scale / 1.2));
    else if (event.key.toLocaleLowerCase() === "f") onViewportChange(fitViewport(mode === "sketchpad" ? activeLevel?.bounds ?? null : topology.bounds, size.width, size.height));
    else return;
    event.preventDefault();
  };

  const drawSketch = mode === "sketchpad" && activeLevel;
  const selectedIconId = selectedSemanticObjectId ? bindingIndex.get(selectedSemanticObjectId)?.id : null;
  const showLabels = layers.labels && viewport.scale >= 0.65 && selectableIcons.length <= 2_000;
  const selectedTopologyNode = selectedSemanticObjectId ? topologyNodeBySemantic.get(selectedSemanticObjectId)?.id : undefined;
  const selectedSketchIcon = selectedIconId ? selectableIcons.find((icon) => icon.id === selectedIconId) ?? null : null;
  const selectedTopologyNodeData = selectedSemanticObjectId ? topologyNodeBySemantic.get(selectedSemanticObjectId) ?? null : null;
  const selectedTopologyEdge = selectedSemanticObjectId ? topologyEdgeBySemantic.get(selectedSemanticObjectId) ?? null : null;
  const selectedTopologyEdgeFrom = selectedTopologyEdge ? topologyNodeById.get(selectedTopologyEdge.fromNodeId) : null;
  const selectedTopologyEdgeTo = selectedTopologyEdge ? topologyNodeById.get(selectedTopologyEdge.toNodeId) : null;
  const selectedObjectWorldPoint = selectedSketchIcon
    ? { x: selectedSketchIcon.column * VISUAL_GRID_SIZE, y: selectedSketchIcon.row * VISUAL_GRID_SIZE }
    : selectedTopologyNodeData
      ? { x: selectedTopologyNodeData.x, y: selectedTopologyNodeData.y }
      : selectedTopologyEdgeFrom && selectedTopologyEdgeTo
        ? { x: (selectedTopologyEdgeFrom.x + selectedTopologyEdgeTo.x) / 2, y: (selectedTopologyEdgeFrom.y + selectedTopologyEdgeTo.y) / 2 }
        : null;
  const selectedObjectLabel = selectedSketchIcon
    ? t("visual.selectedObject", { label: t(`visual.iconKinds.${classifySpatialIconType(selectedSketchIcon.icon_type)}`, { type: selectedSketchIcon.icon_type }), number: selectedSketchIcon.object_number })
    : selectedTopologyNodeData
      ? t("visual.selectedObject", { label: selectedTopologyNodeData.label, number: selectedTopologyNodeData.contamNumber ?? "—" })
      : selectedTopologyEdge
        ? t("visual.selectedFlowPath", { number: selectedTopologyEdge.contamNumber })
        : null;
  const selectedLabelStyle = selectedObjectWorldPoint ? selectedLabelPosition(selectedObjectWorldPoint, viewport, size) : null;

  return (
    <div ref={rootRef} className="visual-konva-root" tabIndex={0} aria-label={t("visual.canvas.keyboardLabel")} onKeyDown={onStageKeyDown}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable
        onDragEnd={(event) => onViewportChange({ ...viewport, x: event.target.x(), y: event.target.y() })}
        onMouseDown={(event) => {
          if (event.evt.button === 1) event.target.getStage()?.startDrag();
        }}
        onWheel={handleWheel}
        onClick={handleBlankSelection}
        onTap={handleBlankSelection}
        onDblClick={() => onViewportChange(fitViewport(mode === "sketchpad" ? activeLevel?.bounds ?? null : topology.bounds, size.width, size.height))}
      >
        <Layer listening={false}><Rect x={-viewport.x / viewport.scale} y={-viewport.y / viewport.scale} width={size.width / viewport.scale} height={size.height / viewport.scale} fill={palette.background} /></Layer>
        {layers.grid ? <GridLayer size={size} viewport={viewport} color={palette.grid} /> : null}
        {drawSketch && layers.lowerLevelReference && lowerLevel ? (
          <Layer listening={false} opacity={0.18}>
            <Shape sceneFunc={wallScene(lowerLevelIcons.filter((item) => classifySpatialIconType(item.icon_type) === "wall"))} stroke={palette.wall} strokeWidth={2} />
            {lowerLevelIcons.filter((item) => classifySpatialIconType(item.icon_type) === "zone").map((icon) => (
              <Circle key={icon.id} x={icon.column * VISUAL_GRID_SIZE} y={icon.row * VISUAL_GRID_SIZE} radius={7} stroke={palette.node} dash={[3, 3]} />
            ))}
          </Layer>
        ) : null}
        {drawSketch ? (
          <>
            <Layer listening={false}><Shape sceneFunc={wallScene(walls)} stroke={palette.wall} strokeWidth={2} /></Layer>
            <Layer>
              {selectableIcons.map((icon) => {
                const kind = classifySpatialIconType(icon.icon_type);
                const selected = icon.id === selectedIconId;
                const x = icon.column * VISUAL_GRID_SIZE;
                const y = icon.row * VISUAL_GRID_SIZE;
                const label = t(`visual.iconKinds.${kind}`, { type: icon.icon_type });
                const binding = icon.binding.status === "bound" ? t("visual.binding.bound") : t("visual.binding.unbound");
                const resultColor = icon.binding.semantic_id ? resultOverlay?.colors.get(icon.binding.semantic_id) : undefined;
                const resultLabel = icon.binding.semantic_id ? resultOverlay?.labels.get(icon.binding.semantic_id) : undefined;
                const resultMissing = Boolean(resultOverlay && kind === "zone" && icon.binding.semantic_id && !resultColor);
                const handleClick = () => {
                  if (icon.binding.semantic_id) onSelectSemantic(icon.binding.semantic_id);
                };
                return (
                  <Group
                    key={icon.id}
                    x={x}
                    y={y}
                    onClick={handleClick}
                    onTap={handleClick}
                    onMouseEnter={(event) => showTooltip(event, `${iconTooltip(icon, label, binding)}${resultOverlay ? `\n${resultLabel ?? resultOverlay.missingLabel}` : ""}`)}
                    onMouseMove={(event) => showTooltip(event, `${iconTooltip(icon, label, binding)}${resultOverlay ? `\n${resultLabel ?? resultOverlay.missingLabel}` : ""}`)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {selected ? <Circle radius={13} stroke={palette.selection} strokeWidth={3} dash={[5, 3]} listening={false} /> : null}
                    {kind === "zone" ? (
                      <Circle radius={8} fill={selected ? palette.selection : resultColor ?? palette.nodeFill} stroke={selected ? palette.selectionContrast : palette.node} strokeWidth={2} dash={resultMissing ? [3, 2] : undefined} />
                    ) : kind === "flow_path" || kind === "opening" || kind === "fan" ? (
                      <Rect x={-6} y={-6} width={12} height={12} rotation={45} fill={palette.background} stroke={selected ? palette.selection : palette.flow} strokeWidth={2} />
                    ) : kind === "note" ? (
                      <Text text="*" x={-5} y={-9} fontSize={18} fill={palette.muted} />
                    ) : (
                      <Group>
                        <Rect x={-8} y={-8} width={16} height={16} fill={palette.background} stroke={selected ? palette.selection : palette.muted} dash={[3, 2]} />
                        <Text text={String(icon.icon_type)} x={-7} y={-4} width={14} align="center" fontSize={7} fill={palette.text} />
                      </Group>
                    )}
                    {showLabels ? <Text text={`#${icon.object_number}`} x={10} y={-7} fontSize={11} fill={palette.text} listening={false} /> : null}
                  </Group>
                );
              })}
            </Layer>
          </>
        ) : (
          <>
            <Layer>
              {visibleTopologyEdges.map((edge) => {
                const from = topologyNodeById.get(edge.fromNodeId);
                const to = topologyNodeById.get(edge.toNodeId);
                if (!from || !to) return null;
                const selected = edge.semanticId === selectedSemanticObjectId;
                const points = [from.x, from.y, to.x, to.y];
                const common = {
                  points,
                  stroke: selected ? palette.selection : palette.flow,
                  strokeWidth: selected ? 3 : 1.5,
                  dash: edge.crossLevel ? [7, 5] : undefined,
                  hitStrokeWidth: 12,
                  onClick: () => onSelectSemantic(edge.semanticId),
                  onTap: () => onSelectSemantic(edge.semanticId),
                  onMouseEnter: (event: Konva.KonvaEventObject<MouseEvent>) => showTooltip(event, t("visual.topology.edgeTooltip", { number: edge.contamNumber, from: edge.fromNodeId, to: edge.toNodeId, element: edge.flowElementId || "—", direction: edge.direction, multiplier: edge.multiplier })),
                  onMouseLeave: () => setTooltip(null),
                };
                return edge.direction === 0
                  ? <Line key={edge.id} {...common} />
                  : <Arrow key={edge.id} {...common} pointerLength={7} pointerWidth={7} fill={common.stroke} />;
              })}
            </Layer>
            <Layer>
              {visibleTopologyNodes.map((node) => {
                const selected = node.id === selectedTopologyNode;
                const resultColor = node.semanticId ? resultOverlay?.colors.get(node.semanticId) : undefined;
                const resultLabel = node.semanticId ? resultOverlay?.labels.get(node.semanticId) : undefined;
                const resultMissing = Boolean(resultOverlay && node.kind === "zone" && node.semanticId && !resultColor);
                const select = () => { if (node.semanticId) onSelectSemantic(node.semanticId); };
                return (
                  <Group
                    key={node.id}
                    x={node.x}
                    y={node.y}
                    onClick={select}
                    onTap={select}
                    onMouseEnter={(event) => showTooltip(event, `${t("visual.topology.nodeTooltip", { label: node.label, number: node.contamNumber ?? "—", level: node.levelNumber ?? "—" })}${resultOverlay && node.kind === "zone" ? `\n${resultLabel ?? resultOverlay.missingLabel}` : ""}`)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {node.kind === "zone" ? (
                      <Rect x={-42} y={-22} width={84} height={44} cornerRadius={6} fill={resultColor ?? palette.nodeFill} stroke={selected ? palette.selection : palette.node} strokeWidth={selected ? 3 : 1.5} dash={selected ? [6, 3] : resultMissing ? [3, 3] : undefined} />
                    ) : (
                      <Rect x={-36} y={-19} width={72} height={38} cornerRadius={19} fill={palette.background} stroke={selected ? palette.selection : palette.boundary} strokeWidth={selected ? 3 : 1.5} dash={[5, 3]} />
                    )}
                    <Text text={node.label} x={-38} y={-7} width={76} align="center" fontSize={11} fontStyle="bold" fill={palette.text} listening={false} />
                  </Group>
                );
              })}
            </Layer>
          </>
        )}
      </Stage>
      {selectedObjectLabel && selectedLabelStyle ? <div className="visual-selected-object-label" role="status" style={selectedLabelStyle}>{selectedObjectLabel}</div> : null}
      {tooltip ? <div className="visual-canvas-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div> : null}
      {(activeLevel?.icons.length ?? 0) > 20_000 || topology.nodes.length > 20_000 ? <div className="visual-simplified-note" role="status">{t("visual.simplified")}</div> : null}
    </div>
  );
}
