import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileSearch, RefreshCw, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buildEvidenceLineage, evidenceChainStatus, type EvidenceStatus } from "../../../app/evidence-lineage";
import { projectFileName, type ProjectState } from "../../../app/project-state";
import {
  RESULT_TABLE_PAGE_SIZE,
  datasetAvailableTimes,
  datasetHasOnlyUnavailableNodeAirState,
  datasetMetricStatistics,
  datasetValueAtTime,
  isTrustedResultDataset,
  nearestAvailableResultTime,
  resultColorForValue,
  resultColorScale,
  type ResultDatasetState,
  type ResultMetricKey,
} from "../../../app/result-dataset-state";
import type { ResultExportState } from "../../../app/result-export-state";
import { isSimReadNodeAirStateUnavailable, type ResultState } from "../../../app/result-state";
import type { RunState } from "../../../app/run-state";
import type { SemanticSnapshot } from "../../../app/semantic-state";
import type { VisualWorkspacePreferences } from "../../../app/spatial-model";
import type { AppTheme } from "../../../app/workbench-state";
import { Button } from "../../ui/Button";
import { Disclosure } from "../../ui/Disclosure";
import { EmptyState } from "../../ui/EmptyState";
import { InlineNotice } from "../../ui/InlineNotice";
import { LoadingState } from "../../ui/LoadingState";
import { StatusTag } from "../../ui/StatusTag";
import { VisualModelWorkspace, type VisualResultOverlay } from "../visual/VisualModelWorkspace";
import { ZoneAirStateResults } from "../ZoneAirStateResults";

const MultiZoneResultChart = lazy(async () => ({ default: (await import("./MultiZoneResultChart")).MultiZoneResultChart }));

export type ResultsTab = "overview" | "timeseries" | "spatial" | "evidence";

export const RESULTS_TABS: readonly ResultsTab[] = ["overview", "timeseries", "spatial", "evidence"];

const METRIC_UNITS: Record<ResultMetricKey, string> = {
  temperature_k: "K",
  reference_pressure_pa: "Pa",
  air_density_kg_m3: "kg/m³",
};

function tone(status: EvidenceStatus): "neutral" | "success" | "warning" | "error" {
  if (status === "verified") return "success";
  if (status === "failed") return "error";
  if (status === "partial" || status === "stale") return "warning";
  return "neutral";
}

function availableTimes(state: ResultDatasetState): number[] {
  return state.dataset ? datasetAvailableTimes(state.dataset, state.selectedZoneIds) : [];
}

function ResultsOverview({ projectState, runState, state, resultState, onRead, onGoRun }: {
  projectState: ProjectState;
  runState: RunState;
  state: ResultDatasetState;
  resultState: ResultState;
  onRead: () => void;
  onGoRun: () => void;
}) {
  const { t } = useTranslation();
  const dataset = state.dataset;
  const solveSucceeded = runState.status === "succeeded" && runState.projectSessionId === projectState.projectSessionId;
  const trustedDataset = dataset && isTrustedResultDataset(dataset);
  // The compatibility reader exposes the same SimRead evidence, but must not
  // override a multi-Zone dataset that has already been loaded.
  const compatibilityIssue = !dataset && resultState.status === "error" ? resultState.issue : null;
  const readIssue = state.issue ?? compatibilityIssue;
  const nodeAirStateUnavailable = datasetHasOnlyUnavailableNodeAirState(dataset)
    || isSimReadNodeAirStateUnavailable(readIssue?.code);
  const readFailed = solveSucceeded && (state.status === "failed" || compatibilityIssue !== null);
  const effectiveReadStatus = compatibilityIssue ? "failed" : state.status;
  const failureTitle = t(nodeAirStateUnavailable ? "results.nodeAirStateUnavailableTitle" : "results.solveSucceededReadFailed");
  const failureBody = t(nodeAirStateUnavailable ? "results.nodeAirStateUnavailableBody" : "results.solveSucceededReadFailedBody");
  return (
    <section className="results-overview" aria-labelledby="results-overview-title">
      <h2 id="results-overview-title">{t("resultsWorkspace.overview.title")}</h2>
      <div className="results-status-row">
        <div><span>{t("resultsWorkspace.solveStatus")}</span><StatusTag tone={solveSucceeded ? "success" : runState.status === "error" ? "error" : "neutral"}>{t(`resultsWorkspace.solve.${solveSucceeded ? "succeeded" : runState.status}`)}</StatusTag></div>
        <div><span>{t("resultsWorkspace.readStatus")}</span><StatusTag tone={effectiveReadStatus === "ready" ? "success" : effectiveReadStatus === "partial" || effectiveReadStatus === "stale" ? "warning" : effectiveReadStatus === "failed" ? "error" : "neutral"}>{t(`resultsWorkspace.status.${effectiveReadStatus}`)}</StatusTag></div>
      </div>
      {trustedDataset ? (
        <dl className="results-overview-summary">
          <div><dt>{t("resultsWorkspace.zonesSucceeded")}</dt><dd>{dataset.evidence_summary.successful_zone_count}</dd></div>
          <div><dt>{t("resultsWorkspace.zonesFailed")}</dt><dd>{dataset.evidence_summary.failed_zone_count}</dd></div>
          <div><dt>{t("resultsWorkspace.samples")}</dt><dd>{dataset.bounds.total_samples}</dd></div>
          <div><dt>{t("resultsWorkspace.timeRange")}</dt><dd>{availableTimes(state).at(0) ?? "—"}–{availableTimes(state).at(-1) ?? "—"} s</dd></div>
          <div><dt>{t("resultsWorkspace.metrics")}</dt><dd>{dataset.metric_definitions.length}</dd></div>
        </dl>
      ) : solveSucceeded ? (
        <EmptyState title={readFailed ? failureTitle : t("resultsWorkspace.empty.title")} description={readFailed ? failureBody : t("resultsWorkspace.empty.afterRun")} action={<Button variant="primary" onClick={onRead}>{t("resultsWorkspace.read")}</Button>} />
      ) : (
        <EmptyState title={t("journeys.results.noRun")} description={t("resultsWorkspace.empty.beforeRun")} action={<Button variant="primary" onClick={onGoRun}>{t("journeys.goRun")}</Button>} />
      )}
      {state.status === "stale" && state.refreshIssue ? <InlineNotice tone="warning">{t("resultsWorkspace.refreshRetained")}</InlineNotice> : null}
      {state.status === "partial" ? <InlineNotice tone="warning">{t("resultsWorkspace.partialNotice", { count: dataset?.per_zone_failures.length ?? 0 })}</InlineNotice> : null}
      {readFailed ? <InlineNotice tone="error" role="alert">{failureTitle}</InlineNotice> : null}
    </section>
  );
}

function ZoneSeriesSelector({ state, onChange }: { state: ResultDatasetState; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const series = state.dataset?.successful_zone_series ?? [];
  const visible = series.filter((item) => `${item.zone_name} ${item.zone_number}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return (
    <div className="result-zone-selector">
      <label><span>{t("resultsWorkspace.searchZones")}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div role="group" aria-label={t("resultsWorkspace.selectZones")}>
        {visible.map((item) => {
          const checked = state.selectedZoneIds.includes(item.zone_id);
          return <label key={item.zone_id}><input type="checkbox" checked={checked} onChange={() => onChange(checked ? state.selectedZoneIds.filter((id) => id !== item.zone_id) : [...state.selectedZoneIds, item.zone_id])} /><span>{item.zone_name} · #{item.zone_number}</span></label>;
        })}
      </div>
      <small>{t("resultsWorkspace.seriesLimit", { count: state.selectedZoneIds.length })}</small>
    </div>
  );
}

export function ResultDataTable({ state, onSelectSemantic }: { state: ResultDatasetState; onSelectSemantic: (semanticId: string) => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const dataset = state.dataset;
  const selected = new Set(state.selectedZoneIds);
  const rows = useMemo(() => dataset?.successful_zone_series
    .filter((series) => selected.has(series.zone_id))
    .flatMap((series) => series.samples.map((sample) => ({ series, sample }))) ?? [], [dataset, state.selectedZoneIds]);
  const pages = Math.max(1, Math.ceil(rows.length / RESULT_TABLE_PAGE_SIZE));
  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pages - 1));
  }, [pages, dataset?.dataset_fingerprint, state.metric, state.selectedZoneIds]);
  const visible = rows.slice(page * RESULT_TABLE_PAGE_SIZE, (page + 1) * RESULT_TABLE_PAGE_SIZE);
  return (
    <div className="multi-result-table-wrap">
      <table className="results-table">
        <caption className="sr-only">{t("resultsWorkspace.tableCaption")}</caption>
        <thead><tr><th>{t("results.zone")}</th><th>{t("resultsWorkspace.time")}</th><th>{t(`resultsWorkspace.metric.${state.metric}`)}</th><th>{t("resultsWorkspace.unit")}</th></tr></thead>
        <tbody>{visible.map(({ series, sample }) => <tr key={`${series.zone_id}:${sample.index}`}><td><button type="button" className="result-table-zone" aria-label={t("resultsWorkspace.selectZone", { name: series.zone_name })} onClick={() => onSelectSemantic(series.zone_id)}>{series.zone_name} · #{series.zone_number}</button></td><td>{sample.sim_time_seconds} s</td><td>{sample[state.metric]}</td><td>{METRIC_UNITS[state.metric]}</td></tr>)}</tbody>
      </table>
      <div className="result-table-pagination"><Button disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} />{t("visual.objectList.previous")}</Button><span>{page + 1}/{pages}</span><Button disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>{t("visual.objectList.next")}<ChevronRight size={14} /></Button></div>
    </div>
  );
}

export function ResultTimeSelector({ times, selectedTimeSeconds, onTimeChange }: {
  times: readonly number[];
  selectedTimeSeconds: number | null;
  onTimeChange: (time: number | null) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(selectedTimeSeconds === null ? "" : String(selectedTimeSeconds));
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
    setDraft(selectedTimeSeconds === null ? "" : String(selectedTimeSeconds));
  }, [selectedTimeSeconds]);
  const commit = () => {
    if (!draft.trim()) {
      onTimeChange(null);
      setFeedback(null);
      return;
    }
    const requested = Number(draft);
    const nearest = nearestAvailableResultTime(times, requested);
    if (nearest === null) {
      setDraft(selectedTimeSeconds === null ? "" : String(selectedTimeSeconds));
      setFeedback(t("resultsWorkspace.timeInvalid"));
      return;
    }
    setDraft(String(nearest));
    onTimeChange(nearest);
    setFeedback(nearest === requested ? null : t("resultsWorkspace.timeAdjusted", { time: nearest }));
  };
  return (
    <label className="result-time-input">
      <span>{t("resultsWorkspace.selectedTime")}</span>
      <span><input type="number" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") commit(); }} aria-describedby="result-time-feedback" /> <span>s</span></span>
      <small id="result-time-feedback" role="status">{feedback}</small>
    </label>
  );
}

function TimeSeriesWorkspace({ state, theme, onMetricChange, onTimeChange, onZonesChange, onSelectSemantic }: {
  state: ResultDatasetState;
  theme: AppTheme;
  onMetricChange: (metric: ResultMetricKey) => void;
  onTimeChange: (time: number | null) => void;
  onZonesChange: (ids: string[]) => void;
  onSelectSemantic: (semanticId: string) => void;
}) {
  const { t } = useTranslation();
  const [tableOpen, setTableOpen] = useState(false);
  const dataset = state.dataset;
  const statistics = dataset ? datasetMetricStatistics(dataset, state.metric, new Set(state.selectedZoneIds)) : null;
  const times = availableTimes(state);
  if (!dataset) return <EmptyState title={t("resultsWorkspace.empty.title")} description={t("resultsWorkspace.empty.afterRun")} />;
  return (
    <section className="results-analysis-grid">
      <aside><ZoneSeriesSelector state={state} onChange={onZonesChange} /></aside>
      <div className="results-chart-workspace">
        <div className="results-analysis-toolbar">
          <label><span>{t("resultsWorkspace.metricLabel")}</span><select value={state.metric} onChange={(event) => onMetricChange(event.target.value as ResultMetricKey)}><option value="temperature_k">{t("resultsWorkspace.metric.temperature_k")}</option><option value="reference_pressure_pa">{t("resultsWorkspace.metric.reference_pressure_pa")}</option><option value="air_density_kg_m3">{t("resultsWorkspace.metric.air_density_kg_m3")}</option></select></label>
          <ResultTimeSelector times={times} selectedTimeSeconds={state.selectedTimeSeconds} onTimeChange={onTimeChange} />
          <Button onClick={() => setTableOpen((value) => !value)}>{tableOpen ? t("resultsWorkspace.showChart") : t("resultsWorkspace.showTable")}</Button>
        </div>
        {statistics ? <div className="results-inline-statistics"><span>Min <strong>{statistics.minimum}</strong></span><span>Max <strong>{statistics.maximum}</strong></span><span>Mean <strong>{statistics.mean.toFixed(4)}</strong></span><span>{statistics.valueCount} {t("resultsWorkspace.values")}</span></div> : null}
        {dataset.time_identity.kind !== "exact_shared" ? <InlineNotice tone="warning">{t("resultsWorkspace.timeMismatch")}</InlineNotice> : null}
        {tableOpen ? <ResultDataTable state={state} onSelectSemantic={onSelectSemantic} /> : <Suspense fallback={<LoadingState label={t("resultsWorkspace.chartLoading")} />}><MultiZoneResultChart dataset={dataset} metric={state.metric} zoneIds={state.selectedZoneIds} theme={theme} onTimeSelect={onTimeChange} onZoneSelect={onSelectSemantic} /></Suspense>}
        <div className="result-time-stepper"><Button disabled={!times.length || state.selectedTimeSeconds === times[0]} onClick={() => { const index = Math.max(0, times.indexOf(state.selectedTimeSeconds ?? times[0])); onTimeChange(times[Math.max(0, index - 1)] ?? null); }}><ChevronLeft size={14} />{t("resultsWorkspace.previousTime")}</Button><Button disabled={!times.length || state.selectedTimeSeconds === times.at(-1)} onClick={() => { const index = Math.max(-1, times.indexOf(state.selectedTimeSeconds ?? times[0])); onTimeChange(times[Math.min(times.length - 1, index + 1)] ?? null); }}>{t("resultsWorkspace.nextTime")}<ChevronRight size={14} /></Button></div>
      </div>
    </section>
  );
}

export function ResultsTabs({ activeTab, onChange }: { activeTab: ResultsTab; onChange: (tab: ResultsTab) => void }) {
  const { t } = useTranslation();
  const tabRefs = useRef(new Map<ResultsTab, HTMLButtonElement>());
  const moveFocus = (tab: ResultsTab) => {
    onChange(tab);
    tabRefs.current.get(tab)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = RESULTS_TABS.indexOf(activeTab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % RESULTS_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + RESULTS_TABS.length) % RESULTS_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = RESULTS_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    moveFocus(RESULTS_TABS[nextIndex]);
  };
  return (
    <div className="results-primary-tabs" role="tablist" aria-label={t("resultsWorkspace.tabsLabel")}>
      {RESULTS_TABS.map((item) => (
        <button
          key={item}
          ref={(node) => { if (node) tabRefs.current.set(item, node); else tabRefs.current.delete(item); }}
          id={`results-tab-${item}`}
          type="button"
          role="tab"
          aria-selected={activeTab === item}
          aria-controls={`results-panel-${item}`}
          tabIndex={activeTab === item ? 0 : -1}
          onClick={() => moveFocus(item)}
          onKeyDown={onKeyDown}
        >
          {t(`resultsWorkspace.tabs.${item}`)}
        </button>
      ))}
    </div>
  );
}

function SpatialResults({ state, snapshot, selectedSemanticObjectId, preferences, onPreferencesChange, onSelectSemantic }: {
  state: ResultDatasetState;
  snapshot: SemanticSnapshot | null;
  selectedSemanticObjectId: string | null;
  preferences: VisualWorkspacePreferences;
  onPreferencesChange: (preferences: VisualWorkspacePreferences) => void;
  onSelectSemantic: (semanticId: string) => void;
}) {
  const { t } = useTranslation();
  const dataset = state.dataset;
  if (!dataset || !snapshot) return <EmptyState title={t("resultsWorkspace.spatial.empty")} description={t("resultsWorkspace.spatial.emptyBody")} />;
  const scale = resultColorScale(dataset, state.metric);
  const colors = new Map<string, string>();
  const labels = new Map<string, string>();
  if (scale && state.selectedTimeSeconds !== null) {
    for (const series of dataset.successful_zone_series) {
      const value = datasetValueAtTime(dataset, series.zone_id, state.metric, state.selectedTimeSeconds);
      const color = resultColorForValue(scale, value);
      if (color) colors.set(series.zone_id, color);
      if (value !== null) labels.set(series.zone_id, `${value} ${METRIC_UNITS[state.metric]}`);
    }
  }
  const overlay: VisualResultOverlay = { colors, labels, missingLabel: t("resultsWorkspace.missing") };
  return (
    <section className="spatial-results-workspace">
      <div className="result-color-legend" aria-label={t("resultsWorkspace.spatial.legend")}><span>{scale?.minimum ?? "—"}</span><span className={`result-color-ramp is-${scale?.kind ?? "sequential"}`} aria-hidden="true" /><span>{scale?.maximum ?? "—"} {METRIC_UNITS[state.metric]}</span><small>{t("resultsWorkspace.spatial.fixedRange")}</small></div>
      <VisualModelWorkspace snapshot={snapshot} projection={snapshot.spatial_projection} selectedSemanticObjectId={selectedSemanticObjectId} preferences={preferences} onPreferencesChange={onPreferencesChange} onSelectSemantic={onSelectSemantic} resultOverlay={overlay} />
    </section>
  );
}

function EvidenceLineage({ projectState, runState, state }: { projectState: ProjectState; runState: RunState; state: ResultDatasetState }) {
  const { t } = useTranslation();
  const nodes = buildEvidenceLineage(projectState, runState, state);
  const chain = evidenceChainStatus(nodes);
  return (
    <section className="evidence-lineage" aria-labelledby="evidence-title">
      <header><div><h2 id="evidence-title">{t("resultsWorkspace.evidence.title")}</h2><p>{t("resultsWorkspace.evidence.description")}</p></div><StatusTag tone={tone(chain)}>{t(`resultsWorkspace.evidence.status.${chain}`)}</StatusTag></header>
      <ol>{nodes.map((node) => <li key={node.id} data-status={node.status}><div className="evidence-node-marker" aria-hidden="true" /><div><strong>{t(node.titleKey)}</strong><StatusTag tone={tone(node.status)}>{t(`resultsWorkspace.evidence.status.${node.status}`)}</StatusTag>{node.tool ? <span>{node.tool}{node.version ? ` ${node.version}` : ""}</span> : null}{node.time ? <time>{node.time}</time> : null}<Disclosure label={t("resultsWorkspace.evidence.details")}><dl><div><dt>{t("resultsWorkspace.evidence.identity")}</dt><dd><code>{node.identity ?? "—"}</code></dd></div><div><dt>{t("resultsWorkspace.evidence.hash")}</dt><dd><code>{node.hashPrefix ?? "—"}</code></dd></div></dl></Disclosure></div></li>)}</ol>
    </section>
  );
}

export function ResultsWorkspace({ projectState, runState, state, resultState, resultExportState, theme, semanticSnapshot, selectedSemanticObjectId, visualPreferences, onVisualPreferencesChange, onSelectSemantic, onRead, onReadSingle, onCancel, onMetricChange, onTimeChange, onZonesChange, onSelectManifest, onExportSingle, onGoRun }: {
  projectState: ProjectState;
  runState: RunState;
  state: ResultDatasetState;
  resultState: ResultState;
  resultExportState: ResultExportState;
  theme: AppTheme;
  semanticSnapshot: SemanticSnapshot | null;
  selectedSemanticObjectId: string | null;
  visualPreferences: VisualWorkspacePreferences;
  onVisualPreferencesChange: (preferences: VisualWorkspacePreferences) => void;
  onSelectSemantic: (semanticId: string) => void;
  onRead: () => void;
  onReadSingle: () => void;
  onCancel: () => void;
  onMetricChange: (metric: ResultMetricKey) => void;
  onTimeChange: (time: number | null) => void;
  onZonesChange: (ids: string[]) => void;
  onSelectManifest: () => void;
  onExportSingle: () => void;
  onGoRun: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ResultsTab>("overview");
  const activeRun = runState.projectSessionId === projectState.projectSessionId && runState.status === "succeeded";
  return (
    <div className="results-workspace">
      <div className="results-command-bar">
        <div><strong>{projectState.project ? projectFileName(projectState.project.source_path) : "—"}</strong><span>{projectState.draft ? t("journeys.project.draft", { revision: projectState.draft.revision_number }) : "—"}</span><span>{runState.summary?.run_id ? `Run ${runState.summary.run_id.slice(0, 8)}` : t("resultsWorkspace.noRun")}</span></div>
        <div>{state.status === "loading" ? <Button onClick={onCancel}><Square size={13} />{t("resultsWorkspace.cancel")}</Button> : <Button variant="primary" disabled={!activeRun} onClick={onRead}><RefreshCw size={14} />{state.dataset ? t("resultsWorkspace.refresh") : t("resultsWorkspace.read")}</Button>}<Button onClick={() => setTab("evidence")}>{t("resultsWorkspace.openEvidence")}</Button></div>
      </div>
      {state.status === "stale" ? <InlineNotice tone="warning"><AlertTriangle size={15} />{t("resultsWorkspace.refreshRetained")}</InlineNotice> : null}
      <ResultsTabs activeTab={tab} onChange={setTab} />
      <div id={`results-panel-${tab}`} role="tabpanel" aria-labelledby={`results-tab-${tab}`} className="results-tab-panel">
        {tab === "overview" ? <ResultsOverview projectState={projectState} runState={runState} state={state} resultState={resultState} onRead={onRead} onGoRun={onGoRun} /> : null}
        {tab === "timeseries" ? <TimeSeriesWorkspace state={state} theme={theme} onMetricChange={onMetricChange} onTimeChange={onTimeChange} onZonesChange={onZonesChange} onSelectSemantic={onSelectSemantic} /> : null}
        {tab === "spatial" ? <SpatialResults state={state} snapshot={semanticSnapshot} selectedSemanticObjectId={selectedSemanticObjectId} preferences={visualPreferences} onPreferencesChange={onVisualPreferencesChange} onSelectSemantic={onSelectSemantic} /> : null}
        {tab === "evidence" ? <EvidenceLineage projectState={projectState} runState={runState} state={state} /> : null}
      </div>
      <Disclosure label={t("resultsWorkspace.singleZoneCompatibility")}>
        <div className="results-compat-actions"><Button onClick={onSelectManifest}><FileSearch size={14} />{t("results.selectManifest")}</Button>{resultState.result ? <Button onClick={onExportSingle}><Download size={14} />{t("results.export.action")}</Button> : null}</div>
        {resultState.result || resultState.status === "selecting" || resultState.status === "loading" || resultState.status === "cancelled" || resultState.status === "error" ? <ZoneAirStateResults state={resultState} exportState={resultExportState} activeRunId={runState.summary?.run_id ?? null} theme={theme} onLoadLatest={onReadSingle} onSelectManifest={onSelectManifest} onExport={onExportSingle} /> : null}
      </Disclosure>
    </div>
  );
}
