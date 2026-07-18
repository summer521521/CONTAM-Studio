import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Download,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ResultExportState } from "../../app/result-export-state";
import {
  resultIsOlderThanActiveRun,
  type ResultState,
  type ZoneAirStateResult,
} from "../../app/result-state";
import type { AppTheme } from "../../app/workbench-state";
import {
  analyzeZoneAirState,
  formatElapsedSeconds,
  formatResultNumber,
  type ZoneAirStateAnalysis,
} from "../../app/zone-air-state-analysis";
import { ZoneAirStateChart, type ZoneAirStateChartHandle } from "./ZoneAirStateChart";

interface ZoneAirStateResultsProps {
  state: ResultState;
  exportState: ResultExportState;
  activeRunId: string | null;
  theme: AppTheme;
  onLoadLatest: () => void;
  onSelectManifest: () => void;
  onExport: () => void;
  disabled: boolean;
}

type ResultView = "charts" | "table";

export function ZoneAirStateDataTable({ result }: { result: ZoneAirStateResult }) {
  const { t } = useTranslation();
  return (
    <div role="tabpanel" className="results-table-wrap">
      <table className="results-table">
        <caption className="sr-only">{t("results.analysis.tableCaption", { count: result.sample_count })}</caption>
        <thead>
          <tr>
            <th>{t("results.time")}</th>
            <th>{t("results.temperature")}</th>
            <th>{t("results.pressure")}</th>
            <th>{t("results.density")}</th>
            <th>{t("results.dayTypeColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {result.samples.map((sample) => (
            <tr key={sample.index}>
              <td>{sample.sim_time_seconds}</td>
              <td>{sample.temperature_k}</td>
              <td>{sample.reference_pressure_pa}</td>
              <td>{sample.air_density_kg_m3}</td>
              <td>{sample.day_type ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function safeAnalysis(state: ResultState): ZoneAirStateAnalysis | null {
  if (!state.result) return null;
  try {
    return analyzeZoneAirState(state.result);
  } catch {
    return null;
  }
}

export function ZoneAirStateResults({
  state,
  exportState,
  activeRunId,
  theme,
  onLoadLatest,
  onSelectManifest,
  onExport,
  disabled,
}: ZoneAirStateResultsProps) {
  const { t, i18n } = useTranslation();
  const result = state.result;
  const analysis = useMemo(() => safeAnalysis(state), [state]);
  const [view, setView] = useState<ResultView>("charts");
  const chartRef = useRef<ZoneAirStateChartHandle>(null);
  const stale = resultIsOlderThanActiveRun(state, activeRunId);
  const latestAvailable = activeRunId !== null;
  const exportBusy = exportState.status === "selecting_destination" || exportState.status === "exporting";
  const language = i18n.language === "en" ? "en" : "zh-CN";

  useEffect(() => {
    setView("charts");
  }, [result?.extraction_id, result?.run_id, result?.zone_number]);

  const loadActions = (other = false) => (
    <div className="results-actions">
      {latestAvailable ? (
        <button className="primary-action" type="button" onClick={onLoadLatest} disabled={disabled}>
          <RefreshCw size={15} />{t("results.loadLatest")}
        </button>
      ) : null}
      <button className="secondary-action" type="button" onClick={onSelectManifest} disabled={disabled}>
        <FileSearch size={15} />{t(other ? "results.selectOtherManifest" : "results.selectManifest")}
      </button>
      {result ? (
        <button className="secondary-action" type="button" onClick={onExport} disabled={disabled || exportBusy}>
          {exportBusy ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
          {t(exportState.status === "selecting_destination"
            ? "results.export.selecting"
            : exportState.status === "exporting"
              ? "results.export.exporting"
              : "results.export.action")}
        </button>
      ) : null}
    </div>
  );

  if (!result) {
    if (state.status === "selecting" || state.status === "loading") {
      const message = state.status === "selecting"
        ? "results.selecting"
        : state.pendingSource === "active_run"
          ? "results.loadingLatest"
          : "results.loading";
      return (
        <section className="results-surface" role="status">
          <LoaderCircle className="spin" size={20} />
          {t(message)}
        </section>
      );
    }
    if (state.status === "error") {
      return (
        <section className="results-surface results-error" role="alert">
          <strong>{t("results.errorTitle")}</strong>
          <p>{t(`errors.codes.${state.issue?.code}`, { defaultValue: t("errors.codes.unknown") })}</p>
          {loadActions()}
        </section>
      );
    }
    return (
      <section className="results-surface results-empty">
        <Activity size={24} aria-hidden="true" />
        <p>{state.status === "cancelled"
          ? t("results.cancelled")
          : t(latestAvailable ? "results.emptyWithActiveRun" : "results.emptyWithoutActiveRun")}</p>
        {loadActions()}
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="results-surface results-error" role="alert">
        <strong>{t("results.analysis.invalidTitle")}</strong>
        <p>{t("results.analysis.invalidBody")}</p>
        {loadActions(true)}
      </section>
    );
  }

  const retainedStatus = (() => {
    if (state.status === "selecting") return { role: "status" as const, text: t("results.selectingRetained"), error: false };
    if (state.status === "loading") return { role: "status" as const, text: t(state.pendingSource === "active_run" ? "results.loadingLatestRetained" : "results.loadingRetained"), error: false };
    if (state.status === "cancelled") return { role: "status" as const, text: t("results.cancelledRetained"), error: false };
    if (state.status === "error") {
      const safeError = t(`errors.codes.${state.issue?.code}`, { defaultValue: t("errors.codes.unknown") });
      return { role: "alert" as const, text: t("results.failedRetained", { error: safeError }), error: true };
    }
    return null;
  })();
  const exportStatus = (() => {
    if (exportState.status === "selecting_destination") return { role: "status" as const, text: t("results.export.selectingStatus"), error: false };
    if (exportState.status === "exporting") return { role: "status" as const, text: t("results.export.exportingStatus"), error: false };
    if (exportState.status === "cancelled") return { role: "status" as const, text: t("results.export.cancelled"), error: false };
    if (exportState.status === "succeeded" && exportState.summary) {
      return {
        role: "status" as const,
        text: t("results.export.succeeded", {
          file_name: exportState.summary.file_name,
          row_count: exportState.summary.row_count,
          byte_count: exportState.summary.byte_count,
        }),
        error: false,
      };
    }
    if (exportState.status === "error") {
      return {
        role: "alert" as const,
        text: t(`errors.codes.${exportState.issue?.code}`, { defaultValue: t("errors.codes.unknown") }),
        error: true,
      };
    }
    return null;
  })();

  const metricCards = [
    { key: "temperature_k" as const, label: t("results.chart.temperature"), unit: "K", digits: 3 },
    { key: "reference_pressure_pa" as const, label: t("results.chart.pressure"), unit: "Pa", digits: 4 },
    { key: "air_density_kg_m3" as const, label: t("results.chart.density"), unit: "kg/m³", digits: 5 },
  ];

  return (
    <section className="results-surface" aria-labelledby="zone-results-title">
      <div className="results-header">
        <div>
          <span className="results-eyebrow">{t("results.tab")}</span>
          <h2 id="zone-results-title">{t("results.analysis.title")}</h2>
          <div className="result-freshness" aria-label={stale ? t("results.olderResult") : t("results.latestResult")}>
            {stale ? t("results.olderResult") : t("results.latestResult")}
          </div>
        </div>
        {loadActions(true)}
      </div>
      {stale ? (
        <div className="results-inline-status is-stale" role="status" aria-live="polite">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{t("results.staleRun")}</span>
        </div>
      ) : null}
      {retainedStatus ? (
        <div className={`results-inline-status${retainedStatus.error ? " is-error" : ""}`} role={retainedStatus.role} aria-live="polite">
          {retainedStatus.error ? <AlertCircle size={16} aria-hidden="true" /> : <Activity size={16} aria-hidden="true" />}
          <span>{retainedStatus.text}</span>
        </div>
      ) : null}
      {exportStatus ? (
        <div className={`results-inline-status${exportStatus.error ? " is-error" : ""}`} role={exportStatus.role} aria-live="polite">
          {exportStatus.error ? <AlertCircle size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
          <span>{exportStatus.text}</span>
        </div>
      ) : null}
      <p className="results-source">
        {t("results.sourceLabel")}: {t(state.resultSource === "active_run" ? "results.sourceActiveRun" : "results.sourceSelectedManifest")}
      </p>
      <div className="results-summary-grid">
        <div><span>{t("results.zone")}</span><strong>{result.zone_name} · {result.zone_number}</strong></div>
        <div><span>{t("results.runId")}</span><strong><code>{result.run_id}</code></strong></div>
        <div><span>{t("results.extractionId")}</span><strong><code>{result.extraction_id}</code></strong></div>
        <div><span>{t("results.sampleCount")}</span><strong>{analysis.sampleCount}</strong></div>
        <div><span>{t("results.startTime")}</span><strong>{analysis.startTimeSeconds} s</strong></div>
        <div><span>{t("results.endTime")}</span><strong>{analysis.endTimeSeconds} s</strong></div>
        <div><span>{t("results.analysis.duration")}</span><strong>{formatElapsedSeconds(analysis.durationSeconds, language)}</strong></div>
        <div><span>{t("results.unitSystem")}</span><strong>{result.unit_system}</strong></div>
      </div>
      <p className="results-note">{t("results.dayTypeUnavailable")}. {t("results.simreadNote")}</p>
      <p className="results-note">{t("results.analysis.deterministicNote")}</p>

      <div className="results-statistics" aria-label={t("results.analysis.statistics")}>
        {metricCards.map(({ key, label, unit, digits }) => {
          const metric = analysis.metrics[key];
          return (
            <article className="results-stat-card" key={key}>
              <h3>{label}</h3>
              <dl>
                <div><dt>{t("results.analysis.minimum")}</dt><dd>{formatResultNumber(metric.minimum.value, digits)} {unit}<small>{formatElapsedSeconds(metric.minimum.simTimeSeconds, language)}</small></dd></div>
                <div><dt>{t("results.analysis.maximum")}</dt><dd>{formatResultNumber(metric.maximum.value, digits)} {unit}<small>{formatElapsedSeconds(metric.maximum.simTimeSeconds, language)}</small></dd></div>
                <div><dt>{t("results.analysis.mean")}</dt><dd>{formatResultNumber(metric.mean, digits)} {unit}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>

      <div className="results-view-toolbar">
        <div className="results-view-tabs" role="tablist" aria-label={t("results.analysis.viewLabel")}>
          <button type="button" role="tab" aria-selected={view === "charts"} className={view === "charts" ? "is-active" : ""} onClick={() => setView("charts")}>{t("results.analysis.charts")}</button>
          <button type="button" role="tab" aria-selected={view === "table"} className={view === "table" ? "is-active" : ""} onClick={() => setView("table")}>{t("results.analysis.dataTable")}</button>
        </div>
        {view === "charts" ? (
          <button className="secondary-action compact-action" type="button" onClick={() => chartRef.current?.resetZoom()}>
            <RotateCcw size={14} />{t("results.chart.resetZoom")}
          </button>
        ) : null}
      </div>

      {view === "charts" ? (
        <div role="tabpanel" className="results-chart-panel">
          <p className="results-chart-description">{t("results.chart.description")}</p>
          <ZoneAirStateChart ref={chartRef} result={result} theme={theme} />
        </div>
      ) : (
        <ZoneAirStateDataTable result={result} />
      )}
    </section>
  );
}
