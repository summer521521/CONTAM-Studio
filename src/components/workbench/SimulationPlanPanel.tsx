import { AlertTriangle, ArrowLeft, CheckCircle2, CirclePlay, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SimulationState } from "../../app/simulation-state";

interface SimulationPlanPanelProps {
  state: SimulationState;
  contextAvailable: boolean;
  onGoalChange: (goal: string) => void;
  onCreatePlan: () => void;
  onBack: () => void;
  onCancel: () => void;
  onApproveAndRun: () => void;
}

export function SimulationPlanPanel({
  state,
  contextAvailable,
  onGoalChange,
  onCreatePlan,
  onBack,
  onCancel,
  onApproveAndRun,
}: SimulationPlanPanelProps) {
  const { t } = useTranslation();
  const plan = state.plan;
  const busy = state.status === "planning" || state.status === "executing";
  const approvalVisible = state.status === "ready" && plan?.status === "ready";

  return (
    <section className="assistant-simulation-plan" aria-labelledby="simulation-plan-title">
      <h3 id="simulation-plan-title">{t("simulation.title")}</h3>
      <p className="assistant-safe-note">{t("simulation.boundary")}</p>
      {!approvalVisible ? (
        <>
          <label className="assistant-field">
            <span>{t("simulation.goal")}</span>
            <textarea
              rows={5}
              maxLength={2000}
              value={state.goal}
              onChange={(event) => onGoalChange(event.target.value)}
              disabled={busy}
              placeholder={t("simulation.placeholder")}
            />
          </label>
          <button
            type="button"
            className="primary-action assistant-wide-action"
            onClick={onCreatePlan}
            disabled={!contextAvailable || busy || !state.goal.trim()}
          >
            <CirclePlay size={15} />{t(state.status === "planning" ? "simulation.planning" : "simulation.createPlan")}
          </button>
          {!contextAvailable ? <p className="assistant-safe-note">{t("simulation.contextRequired")}</p> : null}
        </>
      ) : null}

      {plan?.status === "needs_input" ? (
        <section className="assistant-plan-summary" aria-live="polite">
          <h4>{t("simulation.needsInput")}</h4>
          <ul>{plan.questions.map((question) => <li key={question}>{question}</li>)}</ul>
        </section>
      ) : null}

      {plan?.status === "unsupported" ? (
        <section className="assistant-plan-summary" aria-live="polite">
          <h4>{t("simulation.unsupported")}</h4>
          <ul>{plan.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
        </section>
      ) : null}

      {approvalVisible ? (
        <section className="assistant-plan-summary" aria-labelledby="simulation-review-title">
          <h4 id="simulation-review-title">{t("simulation.ready")}</h4>
          <dl>
            <div><dt>{t("simulation.target")}</dt><dd>{plan.zone_name}</dd></div>
            <div><dt>{t("simulation.revision")}</dt><dd>{plan.revision_number}</dd></div>
          </dl>
          <section>
            <h5>{t("simulation.assumptions")}</h5>
            <ul>{plan.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h5>{t("simulation.actions")}</h5>
            <ol>{plan.actions.map((action) => <li key={action.action}>{t(`simulation.action.${action.action}`)}</li>)}</ol>
          </section>
          {plan.volume_diff ? (
            <section className="simulation-diff" aria-label={t("simulation.diffLabel")}>
              <h5>{t("simulation.diffLabel")}</h5>
              <p>{plan.zone_name} · {plan.volume_diff.field}</p>
              <p><strong>{plan.volume_diff.old_token}</strong> m³ <ArrowLeft size={14} aria-hidden="true" /> <strong>{plan.volume_diff.new_token}</strong> m³</p>
            </section>
          ) : null}
          <section>
            <h5>{t("simulation.risks")}</h5>
            <ul>{plan.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          </section>
          <div className="assistant-actions">
            <button type="button" className="secondary-action" onClick={onBack}><ArrowLeft size={15} />{t("simulation.back")}</button>
            <button type="button" className="secondary-action" onClick={onCancel}><X size={15} />{t("simulation.cancel")}</button>
            <button type="button" className="primary-action" onClick={onApproveAndRun}><CheckCircle2 size={15} />{t("simulation.approveAndRun")}</button>
          </div>
        </section>
      ) : null}

      {state.status === "executing" ? (
        <section className="assistant-plan-summary" role="status" aria-live="polite">
          <h4>{t("simulation.executing")}</h4>
          <ol className="simulation-timeline">
            {state.timeline.map((step) => <li key={step.step} data-status={step.status}>{t(`simulation.timeline.${step.step}`)}</li>)}
          </ol>
        </section>
      ) : null}

      {state.execution ? (
        <section className="assistant-plan-summary" aria-live="polite">
          <h4>{state.status === "succeeded" ? t("simulation.completed") : t("simulation.failed")}</h4>
          {state.execution.previous_trusted_result_available ? <p>{t("simulation.previousResultRetained")}</p> : null}
          {state.execution.safe_ai_analysis ? (
            <section>
              <h5>{t("simulation.analysisInput")}</h5>
              <p>{t("simulation.temperatureRange", { min: state.execution.safe_ai_analysis.temperature_k_min, max: state.execution.safe_ai_analysis.temperature_k_max })}</p>
              <p>{t("simulation.pressureRange", { min: state.execution.safe_ai_analysis.reference_pressure_pa_min, max: state.execution.safe_ai_analysis.reference_pressure_pa_max })}</p>
              <ul>{state.execution.safe_ai_analysis.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          ) : null}
          {state.issue ? <p className="patch-inline-error" role="alert"><AlertTriangle size={15} />{t(`errors.codes.${state.issue.code}`, { defaultValue: t("errors.codes.unknown") })}</p> : null}
        </section>
      ) : state.issue ? <p className="patch-inline-error" role="alert"><AlertTriangle size={15} />{t(`errors.codes.${state.issue.code}`, { defaultValue: t("errors.codes.unknown") })}</p> : null}
    </section>
  );
}
