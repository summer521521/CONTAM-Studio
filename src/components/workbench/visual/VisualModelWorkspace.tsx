import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Layers3,
  ListTree,
  Maximize2,
  Network,
  RotateCcw,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_VISUAL_PREFERENCES,
  activeSpatialLevel,
  buildTopologyLayout,
  projectVisualSelection,
  resetVisualContext,
  type SpatialIcon,
  type SpatialProjection,
  type TopologyEdge,
  type TopologyNode,
  type VisualLayerVisibility,
  type VisualViewport,
  type VisualWorkspacePreferences,
} from "../../../app/spatial-model";
import type { SemanticSnapshot } from "../../../app/semantic-state";
import { EmptyState } from "../../ui/EmptyState";
import { ErrorBoundary } from "../../ui/ErrorBoundary";
import { IconButton } from "../../ui/IconButton";
import { InlineNotice } from "../../ui/InlineNotice";
import { LoadingState } from "../../ui/LoadingState";

const VisualCanvas = lazy(() => import("./VisualCanvasKonva"));

export interface VisualModelWorkspaceProps {
  snapshot: SemanticSnapshot | null;
  projection: SpatialProjection | null;
  selectedSemanticObjectId: string | null;
  preferences?: VisualWorkspacePreferences;
  onPreferencesChange?: (preferences: VisualWorkspacePreferences) => void;
  onSelectSemantic: (semanticId: string) => void;
  resultOverlay?: VisualResultOverlay | null;
}

export interface VisualResultOverlay {
  colors: ReadonlyMap<string, string>;
  labels: ReadonlyMap<string, string>;
  missingLabel: string;
}

export type VisualViewportCommand = {
  sequence: number;
  action: "zoom_in" | "zoom_out" | "fit" | "reset" | "locate";
  contextKey: string;
};

export type ExplorerItem = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  semanticId: string | null;
};

function sketchExplorerItem(icon: SpatialIcon, kindLabel: string): ExplorerItem {
  return {
    id: icon.id,
    kind: icon.kind,
    label: `${kindLabel} · #${icon.object_number}`,
    detail: `${icon.column}, ${icon.row}`,
    semanticId: icon.binding.semantic_id,
  };
}

function nodeExplorerItem(node: TopologyNode, kindLabel: string): ExplorerItem {
  return {
    id: node.id,
    kind: node.kind,
    label: `${kindLabel} · ${node.label}`,
    detail: node.contamNumber === null ? "—" : `#${node.contamNumber}`,
    semanticId: node.semanticId,
  };
}

function edgeExplorerItem(edge: TopologyEdge, kindLabel: string): ExplorerItem {
  return {
    id: edge.id,
    kind: "flow_path",
    label: `${kindLabel} · #${edge.contamNumber}`,
    detail: `${edge.fromNodeId} → ${edge.toNodeId}`,
    semanticId: edge.semanticId,
  };
}

export function AccessibleObjectExplorer({
  items,
  selectedSemanticObjectId,
  onSelect,
  onLocate,
}: {
  items: ExplorerItem[];
  selectedSemanticObjectId: string | null;
  onSelect: (semanticId: string) => void;
  onLocate: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items.filter((item) => !normalized || `${item.label} ${item.detail}`.toLocaleLowerCase().includes(normalized));
  }, [items, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => {
    setPage(0);
  }, [query, items]);

  return (
    <section className="visual-object-explorer" aria-labelledby="visual-object-explorer-title">
      <header>
        <div>
          <ListTree size={16} aria-hidden="true" />
          <strong id="visual-object-explorer-title">{t("visual.objectList.title")}</strong>
        </div>
        <span>{t("visual.objectList.count", { count: filtered.length })}</span>
      </header>
      <label className="visual-object-search">
        <Search size={14} aria-hidden="true" />
        <span className="sr-only">{t("visual.objectList.search")}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("visual.objectList.search")}
        />
      </label>
      {visible.length ? (
        <ul aria-label={t("visual.objectList.results")}>
          {visible.map((item) => (
            <li key={item.id} className={item.semanticId === selectedSemanticObjectId ? "is-selected" : ""}>
              <button
                type="button"
                disabled={!item.semanticId}
                aria-pressed={item.semanticId === selectedSemanticObjectId}
                onClick={() => {
                  if (!item.semanticId) return;
                  onSelect(item.semanticId);
                  onLocate();
                }}
              >
                <span>{item.label}</span>
                <small>{item.detail}</small>
              </button>
              {!item.semanticId ? <span>{t("visual.objectList.unbound")}</span> : null}
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t("visual.objectList.empty")} description={t("visual.objectList.emptyBody")} />}
      <footer>
        <IconButton label={t("visual.objectList.previous")} title={t("visual.objectList.previous")} disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
          <ChevronLeft size={15} />
        </IconButton>
        <span>{t("visual.objectList.page", { page: page + 1, pages: pageCount })}</span>
        <IconButton label={t("visual.objectList.next")} title={t("visual.objectList.next")} disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>
          <ChevronRight size={15} />
        </IconButton>
      </footer>
    </section>
  );
}

const layerKeys: Array<keyof VisualLayerVisibility> = [
  "walls",
  "zones",
  "flowPaths",
  "labels",
  "grid",
  "otherIcons",
  "lowerLevelReference",
];

export function VisualModelWorkspace({
  snapshot,
  projection,
  selectedSemanticObjectId,
  preferences = DEFAULT_VISUAL_PREFERENCES,
  onPreferencesChange = () => undefined,
  onSelectSemantic,
  resultOverlay = null,
}: VisualModelWorkspaceProps) {
  const { t } = useTranslation();
  const contextIdentity = projection?.identity_sha256 ?? null;
  const contextRevision = projection?.revision_id ?? null;
  const contextKey = `${contextIdentity ?? "none"}:${contextRevision ?? "none"}`;
  const [activeLevelNumber, setActiveLevelNumber] = useState<number | null>(projection?.levels[0]?.level_number ?? null);
  const [viewport, setViewport] = useState<VisualViewport>({ x: 0, y: 0, scale: 1 });
  // The lazy canvas can mount after the projection is already available. Start
  // with a consumable fit command so that first paint does not leave valid
  // geometry off-screen until the user presses "fit" manually.
  const [command, setCommand] = useState<VisualViewportCommand>({ sequence: 1, action: "fit", contextKey });
  const [objectListOpen, setObjectListOpen] = useState(false);
  const [knownContext, setKnownContext] = useState({ identity: contextIdentity, revision: contextRevision });
  const topology = useMemo(() => snapshot ? buildTopologyLayout(snapshot) : { nodes: [], edges: [], bounds: null }, [snapshot]);
  const selection = useMemo(
    () => projectVisualSelection(selectedSemanticObjectId, projection),
    [projection, selectedSemanticObjectId],
  );
  const activeLevel = activeSpatialLevel(projection, activeLevelNumber);

  const issueCommand = (action: VisualViewportCommand["action"], targetContextKey = contextKey) => {
    setCommand((current) => ({ sequence: current.sequence + 1, action, contextKey: targetContextKey }));
  };

  useEffect(() => {
    const reset = resetVisualContext(knownContext, projection);
    if (!reset.changed) return;
    setKnownContext({ identity: contextIdentity, revision: contextRevision });
    setActiveLevelNumber(reset.activeLevel);
    setViewport({ x: 0, y: 0, scale: 1 });
    issueCommand("fit", contextKey);
  }, [contextIdentity, contextRevision, knownContext, projection]);

  useEffect(() => {
    if (selection?.levelNumber !== null && selection?.levelNumber !== undefined) {
      setActiveLevelNumber(selection.levelNumber);
      issueCommand("locate");
    }
  }, [selection?.iconId, selection?.levelNumber, selection?.semanticId]);

  const mode = preferences.mode;
  const sketchUnavailable = mode === "sketchpad" && projection?.status !== "available";
  const explorerItems = useMemo(() => {
    if (mode === "topology") {
      return [
        ...topology.nodes.map((node) => nodeExplorerItem(node, t(`visual.topologyKinds.${node.kind}`))),
        ...topology.edges.map((edge) => edgeExplorerItem(edge, t("visual.iconKinds.flow_path"))),
      ];
    }
    return (activeLevel?.icons ?? []).map((item) => sketchExplorerItem(item, t(`visual.iconKinds.${item.kind}`, { type: item.icon_type })));
  }, [activeLevel?.icons, mode, t, topology.edges, topology.nodes]);

  const updateMode = (nextMode: VisualWorkspacePreferences["mode"]) => {
    onPreferencesChange({ ...preferences, mode: nextMode });
    issueCommand("fit");
  };
  const updateLayer = (key: keyof VisualLayerVisibility, visible: boolean) => {
    onPreferencesChange({ ...preferences, layers: { ...preferences.layers, [key]: visible } });
  };
  const canvasLabel = mode === "sketchpad" ? t("visual.canvas.sketchpadLabel") : t("visual.canvas.topologyLabel");
  const canvasDescription = mode === "sketchpad" ? t("visual.schematicNotice") : t("visual.topologyNotice");
  const canvasFallback = (
    <InlineNotice tone="error" role="alert">
      {t("visual.canvas.failed")}
      <button type="button" onClick={() => setObjectListOpen(true)}>{t("visual.objectList.open")}</button>
    </InlineNotice>
  );

  return (
    <section className="visual-model-workspace" aria-label={t("visual.title")}>
      <div className="visual-toolbar" role="toolbar" aria-label={t("visual.toolbarLabel")}>
        <label className="visual-level-select">
          <span>{t("visual.level")}</span>
          <select
            value={activeLevelNumber ?? ""}
            disabled={mode === "topology" || !projection?.levels.length}
            onChange={(event) => {
              setActiveLevelNumber(Number(event.target.value));
              issueCommand("fit");
            }}
          >
            {(projection?.levels ?? []).map((level) => (
              <option key={level.level_number} value={level.level_number}>{level.name} · {level.level_number}</option>
            ))}
          </select>
        </label>
        <div className="visual-mode-switch" aria-label={t("visual.modeLabel")}>
          <button type="button" aria-pressed={mode === "sketchpad"} onClick={() => updateMode("sketchpad")}>{t("visual.modeSketchpad")}</button>
          <button type="button" aria-pressed={mode === "topology"} onClick={() => updateMode("topology")}><Network size={14} aria-hidden="true" />{t("visual.modeTopology")}</button>
        </div>
        <details className="visual-layer-menu">
          <summary><Layers3 size={15} aria-hidden="true" />{t("visual.layers.title")}</summary>
          <div>
            {layerKeys.map((key) => (
              <label key={key}>
                <input type="checkbox" checked={preferences.layers[key]} onChange={(event) => updateLayer(key, event.target.checked)} />
                <span>{t(`visual.layers.${key}`)}</span>
              </label>
            ))}
          </div>
        </details>
        <div className="visual-view-actions">
          <IconButton label={t("visual.zoomIn")} title={t("visual.zoomIn")} onClick={() => issueCommand("zoom_in")}><ZoomIn size={16} /></IconButton>
          <IconButton label={t("visual.zoomOut")} title={t("visual.zoomOut")} onClick={() => issueCommand("zoom_out")}><ZoomOut size={16} /></IconButton>
          <IconButton label={t("visual.fit")} title={t("visual.fit")} onClick={() => issueCommand("fit")}><Maximize2 size={16} /></IconButton>
          <IconButton label={t("visual.reset")} title={t("visual.reset")} onClick={() => issueCommand("reset")}><RotateCcw size={16} /></IconButton>
          <IconButton label={t("visual.objectList.open")} title={t("visual.objectList.open")} aria-pressed={objectListOpen} onClick={() => setObjectListOpen((value) => !value)}><ListTree size={16} /></IconButton>
        </div>
      </div>

      <div className="visual-scale-notice" role="note">{canvasDescription}</div>
      <div className={`visual-workspace-body ${objectListOpen ? "has-object-list" : ""}`}>
        <div className="visual-canvas-region" role="region" aria-label={canvasLabel} aria-describedby="visual-canvas-description">
          <span id="visual-canvas-description" className="sr-only">{canvasDescription}</span>
          {sketchUnavailable ? (
            <EmptyState
              title={t("visual.unavailable.title")}
              description={t(`visual.unavailable.reasons.${projection?.unavailable_reason ?? "unknown"}`, { defaultValue: t("visual.unavailable.reasons.unknown") })}
              action={<button type="button" className="ui-button is-primary" onClick={() => updateMode("topology")}>{t("visual.unavailable.switchTopology")}</button>}
            />
          ) : mode === "sketchpad" && !activeLevel?.icons.length ? (
            <EmptyState title={t("visual.emptyLevel.title")} description={t("visual.emptyLevel.body")} action={<button type="button" className="ui-button" onClick={() => setObjectListOpen(true)}>{t("visual.objectList.open")}</button>} />
          ) : mode === "topology" && !topology.nodes.length ? (
            <EmptyState title={t("visual.topologyEmpty.title")} description={t("visual.topologyEmpty.body")} />
          ) : (
            <ErrorBoundary resetKey={`${contextIdentity}:${contextRevision}:${mode}`} fallback={canvasFallback}>
              <Suspense fallback={<LoadingState label={t("visual.canvas.loading")} />}>
                <VisualCanvas
                  mode={mode}
                  projection={projection}
                  activeLevel={activeLevel}
                  topology={topology}
                  layers={preferences.layers}
                  viewport={viewport}
                  command={command}
                  selectedSemanticObjectId={selectedSemanticObjectId}
                  onViewportChange={setViewport}
                  onSelectSemantic={onSelectSemantic}
                  resultOverlay={resultOverlay}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          <div className="visual-selection-announcement" aria-live="polite" aria-atomic="true">
            {selectedSemanticObjectId ? t("visual.selectionChanged") : ""}
          </div>
        </div>
        {objectListOpen ? (
          <AccessibleObjectExplorer
            items={explorerItems}
            selectedSemanticObjectId={selectedSemanticObjectId}
            onSelect={onSelectSemantic}
            onLocate={() => issueCommand("locate")}
          />
        ) : null}
      </div>
      {projection?.warnings.length ? (
        <details className="visual-diagnostics">
          <summary>{t("visual.diagnostics", { count: projection.warnings.length })}</summary>
          <ul>{projection.warnings.slice(0, 20).map((warning, index) => <li key={`${warning.code}:${warning.icon_id ?? index}`}>{t(`visual.warning.${warning.code}`, { defaultValue: t("visual.warning.unknown") })}</li>)}</ul>
        </details>
      ) : null}
      {selection?.iconId ? <span className="sr-only"><Crosshair size={12} />{selection.iconId}</span> : null}
    </section>
  );
}
