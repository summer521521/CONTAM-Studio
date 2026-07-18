import { Activity, LoaderCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ResultState } from "../../app/result-state";

interface ZoneAirStateResultsProps {
  state: ResultState;
  onLoad: () => void;
  disabled: boolean;
}

export function ZoneAirStateResults({ state, onLoad, disabled }: ZoneAirStateResultsProps) {
  const { t } = useTranslation();
  const result = state.result;
  if (state.status === "loading") {
    return <section className="results-surface" role="status"><LoaderCircle className="spin" size={20} />{t("results.loading")}</section>;
  }
  if (state.status === "error") {
    return (
      <section className="results-surface results-error" role="alert">
        <strong>{t("results.errorTitle")}</strong>
        <p>{t(`errors.codes.${state.issue?.code}`, { defaultValue: t("errors.codes.unknown") })}</p>
        <button className="secondary-action" type="button" onClick={onLoad} disabled={disabled}>
          <RefreshCw size={15} />{t("results.retry")}
        </button>
      </section>
    );
  }
  if (!result) {
    return (
      <section className="results-surface results-empty">
        <Activity size={24} aria-hidden="true" />
        <p>{state.status === "cancelled" ? t("results.cancelled") : t("results.empty")}</p>
        <button className="primary-action" type="button" onClick={onLoad} disabled={disabled}>
          <Activity size={16} />{t("results.load")}
        </button>
      </section>
    );
  }
  return (
    <section className="results-surface" aria-labelledby="zone-results-title">
      <div className="results-header">
        <div>
          <span className="results-eyebrow">{t("results.tab")}</span>
          <h2 id="zone-results-title">{t("results.summaryTitle")}</h2>
        </div>
        <button className="secondary-action" type="button" onClick={onLoad} disabled={disabled}>
          <RefreshCw size={15} />{t("results.load")}
        </button>
      </div>
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
          <thead><tr><th>{t("results.time")}</th><th>{t("results.temperature")}</th><th>{t("results.pressure")}</th><th>{t("results.density")}</th><th>{t("results.dayTypeColumn")}</th></tr></thead>
          <tbody>
            {result.samples.map((sample) => (
              <tr key={sample.index}>
                <td>{sample.sim_time_seconds}</td><td>{sample.temperature_k}</td><td>{sample.reference_pressure_pa}</td><td>{sample.air_density_kg_m3}</td><td>{sample.day_type ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
