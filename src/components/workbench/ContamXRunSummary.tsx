import { AlertCircle, CheckCircle2, LoaderCircle, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RunState } from "../../app/run-state";

interface ContamXRunSummaryProps {
  state: RunState;
}

export function ContamXRunSummary({ state }: ContamXRunSummaryProps) {
  const { t } = useTranslation();
  const summary = state.summary;
  return (
    <div className="run-summary" aria-live="polite">
      <div className="run-summary-heading">
        {state.status === "running" ? <LoaderCircle className="spin" size={18} /> : summary ? <CheckCircle2 size={18} /> : state.issue ? <AlertCircle size={18} /> : <Play size={18} />}
        <div>
          <strong>{t(`run.status.${state.status}`)}</strong>
          <p>{state.status === "running" ? t("run.runningHint") : summary ? t("run.successHint") : t("run.idleHint")}</p>
        </div>
      </div>
      {state.issue ? (
        <div className="run-notice is-error" role="alert">
          {t(`errors.codes.${state.issue.code}`, { defaultValue: t("errors.codes.unknown") })}
          {summary ? ` ${t("run.previousRetained")}` : ""}
        </div>
      ) : null}
      {summary ? (
        <dl className="run-summary-grid">
          <div><dt>{t("run.runId")}</dt><dd><code>{summary.run_id}</code></dd></div>
          <div><dt>{t("run.solver")}</dt><dd>{summary.solver_name} {summary.solver_version}</dd></div>
          <div><dt>{t("run.started")}</dt><dd>{summary.started_at_utc}</dd></div>
          <div><dt>{t("run.duration")}</dt><dd>{summary.duration_ms} ms</dd></div>
          <div><dt>{t("run.exitCode")}</dt><dd>{summary.exit_code}</dd></div>
          <div><dt>{t("run.timedOut")}</dt><dd>{t(summary.timed_out ? "common.yes" : "common.no")}</dd></div>
          <div><dt>{t("run.simCount")}</dt><dd>{summary.sim_artifact_count}</dd></div>
          <div><dt>{t("run.sourceUnchanged")}</dt><dd>{t(summary.source_unchanged ? "common.yes" : "common.no")}</dd></div>
        </dl>
      ) : null}
      {summary ? <p className="run-next-note">{t("run.nextSlice")}</p> : null}
    </div>
  );
}
