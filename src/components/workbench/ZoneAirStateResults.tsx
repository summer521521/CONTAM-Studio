import { Activity, AlertCircle, FileSearch, LoaderCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resultIsOlderThanActiveRun, type ResultState } from "../../app/result-state";

interface ZoneAirStateResultsProps {
  state: ResultState;
  activeRunId: string | null;
  onLoadLatest: () => void;
  onSelectManifest: () => void;
  disabled: boolean;
}

export function ZoneAirStateResults({
  state,
  activeRunId,
  onLoadLatest,
  onSelectManifest,
  disabled,
}: ZoneAirStateResultsProps) {
  const { t } = useTranslation();
  const result = state.result;
  const stale = resultIsOlderThanActiveRun(state, activeRunId);
  const latestAvailable = activeRunId !== null;

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
        <p>
          {state.status === "cancelled"
            ? t("results.cancelled")
            : t(latestAvailable ? "results.emptyWithActiveRun" : "results.emptyWithoutActiveRun")}
        </p>
        {loadActions()}
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

  return (
    <section className="results-surface" aria-labelledby="zone-results-title">
      <div className="results-header">
        <div>
          <span className="results-eyebrow">{t("results.tab")}</span>
          <h2 id="zone-results-title">{t("results.summaryTitle")}</h2>
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
        <div
          className={`results-inline-status${retainedStatus.error ? " is-error" : ""}`}
          role={retainedStatus.role}
          aria-live="polite"
        >
          {retainedStatus.error ? <AlertCircle size={16} aria-hidden="true" /> : <Activity size={16} aria-hidden="true" />}
          <span>{retainedStatus.text}</span>
        </div>
      ) : null}
      <p className="results-source">
        {t("results.sourceLabel")}: {t(state.resultSource === "active_run" ? "results.sourceActiveRun" : "results.sourceSelectedManifest")}
      </p>
      <div className="results-summary-grid">
        <div><span>{t("results.zone")}</span><strong>{result.zone_name} · {result.zone_number}</strong></div>
        <div><span>{t("results.runId")}</span><strong><code>{result.run_id}</code></strong></div>
        <div><span>{t("results.extractionId")}</span><strong><code>{result.extraction_id}</code></strong></div>
        <div><span>{t("results.sampleCount")}</span><strong>{result.sample_count}</strong></div>
        <div><span>{t("results.startTime")}</span><strong>{result.samples[0]?.sim_time_seconds ?? 0}</strong></div>
        <div><span>{t("results.endTime")}</span><strong>{result.samples.at(-1)?.sim_time_seconds ?? 0}</strong></div>
        <div><span>{t("results.unitSystem")}</span><strong>{result.unit_system}</strong></div>
        <div><span>{t("results.dayType")}</span><strong>—</strong></div>
      </div>
      <p className="results-note">{t("results.dayTypeUnavailable")}. {t("results.simreadNote")}</p>
      <p className="results-note">{t("results.strictNote")}</p>
      <div className="results-table-wrap">
        <table className="results-table">
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
    </section>
  );
}
