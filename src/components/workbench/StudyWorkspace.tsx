import { BarChart3, Download, FlaskConical, Play, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { analyzeStudyResults, cancelStudy, exportStudyReport, pageStudyResults, prepareStudyPlan, runStudy } from "../../app/desktop-api";
import { isSafeStudyPlan, isSafeStudySampleResult, makeStudyParameterDraft, studyReducer, INITIAL_STUDY_STATE, studyResultFilter, validateStudyParameterDrafts, type StudyMode, type StudyParameterDraft, type StudyParameterTarget, type StudyPlan } from "../../app/study-state";
import type { ProjectInspection, ReaderDiagnostic } from "../../app/project-state";
import type { SemanticSnapshot } from "../../app/semantic-state";
import type { AppTheme } from "../../app/workbench-state";
import { StudyCharts } from "./StudyCharts";

interface StudyWorkspaceProps {
  project: ProjectInspection | null;
  projectSessionId: string | null;
  revisionId: string | null;
  semanticSnapshot?: SemanticSnapshot | null;
  theme?: AppTheme;
  onNotice?: (message: string) => void;
}

export function StudyWorkspace({ project, projectSessionId, revisionId, semanticSnapshot = null, theme = "light", onNotice = () => undefined }: StudyWorkspaceProps) {
  const { t } = useTranslation();
  const [state, dispatch] = useState(INITIAL_STUDY_STATE);
  const [mode, setMode] = useState<StudyMode>("single_scan");
  const [parameters, setParameters] = useState<StudyParameterDraft[]>([]);
  const [format, setFormat] = useState("html");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageTotal, setPageTotal] = useState(0);
  const [filterValue, setFilterValue] = useState("");
  const [sortBy, setSortBy] = useState("sample_id");
  const [busy, setBusy] = useState(false);
  const currentZone = project?.zones[0] ?? null;
  const zoneTargets = useMemo<StudyParameterTarget[]>(() => project?.zones.map((zone) => ({
    object_id: zone.zone_id,
    name: zone.name,
    parameter_type: "zone_volume_m3",
    unit: "m3",
    default_value: Number.isFinite(zone.volume_m3) ? zone.volume_m3 : 100,
  })) ?? [], [project]);
  const flowPathTargets = useMemo<StudyParameterTarget[]>(() => (semanticSnapshot?.flow_paths ?? []).flatMap((node) => {
    const objectId = node.object_id ?? node.path_id;
    const capability = node.capabilities?.multiplier?.state;
    if (!objectId || (node.editable === false && capability !== "editable_via_patch")) return [];
    const rawMultiplier = node.fields?.multiplier ?? node.multiplier;
    const multiplier = typeof rawMultiplier === "number" && Number.isFinite(rawMultiplier) ? rawMultiplier : 1;
    return [{ object_id: objectId, name: node.name ?? node.label ?? `FlowPath ${objectId.slice(0, 8)}`, parameter_type: "flow_path_multiplier", unit: "1", default_value: multiplier }];
  }), [semanticSnapshot]);
  const targetsByType = useMemo(() => ({ zone_volume_m3: zoneTargets, flow_path_multiplier: flowPathTargets }), [flowPathTargets, zoneTargets]);
  const validation = useMemo(() => validateStudyParameterDrafts(parameters, mode), [mode, parameters]);
  const combinationSummary = useMemo(() => {
    if (!validation.estimate.counts.length) return "-";
    const total = validation.estimate.overLimit ? `${validation.estimate.total}+` : String(validation.estimate.total);
    return `${validation.estimate.counts.join(" × ")} = ${total}`;
  }, [validation.estimate]);
  const hasReadonlyAdvancedParameters = Boolean((semanticSnapshot?.schedules.length ?? 0) || (semanticSnapshot?.species.length ?? 0));

  useEffect(() => {
    const firstTarget = zoneTargets[0];
    if (currentZone && firstTarget && !parameters.length) {
      setParameters([makeStudyParameterDraft(firstTarget)]);
    }
  }, [currentZone, parameters.length, zoneTargets]);

  function targetList(draft: StudyParameterDraft): StudyParameterTarget[] {
    const parameterType = draft.parameter_type as keyof typeof targetsByType;
    return targetsByType[parameterType] ?? [];
  }

  function updateDraft(index: number, change: Partial<StudyParameterDraft>) {
    if (state.plan) dispatch((current) => studyReducer(current, { type: "reset" }));
    setParameters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item));
  }

  function updateTarget(index: number, objectId: string) {
    if (state.plan) dispatch((current) => studyReducer(current, { type: "reset" }));
    setParameters((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const target = targetList(item).find((candidate) => candidate.object_id === objectId);
      return target ? makeStudyParameterDraft(target) : item;
    }));
  }

  function updateType(index: number, parameterType: StudyParameterTarget["parameter_type"]) {
    if (state.plan) dispatch((current) => studyReducer(current, { type: "reset" }));
    setParameters((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const target = targetsByType[parameterType].find((candidate) => !current.some((other, otherIndex) => otherIndex !== index && other.parameter_type === parameterType && other.object_id === candidate.object_id));
      return target ? makeStudyParameterDraft(target) : item;
    }));
  }

  function addParameter() {
    const target = [...flowPathTargets, ...zoneTargets].find((candidate) => !parameters.some((item) => item.parameter_type === candidate.parameter_type && item.object_id === candidate.object_id));
    if (target) {
      if (state.plan) dispatch((current) => studyReducer(current, { type: "reset" }));
      setParameters((current) => [...current, makeStudyParameterDraft(target)]);
    }
  }

  function removeParameter(index: number) {
    if (state.plan) dispatch((current) => studyReducer(current, { type: "reset" }));
    setParameters((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function changeMode(nextMode: StudyMode) {
    if (state.plan) dispatch((current) => studyReducer(current, { type: "reset" }));
    setMode(nextMode);
  }

  function bridgeIssue(code: string, message: string): ReaderDiagnostic {
    return { code, message, source_line_number: null, context: {} };
  }

  async function loadPage(plan: StudyPlan, nextPage: number) {
    if (!projectSessionId) return;
    const resultFilter = studyResultFilter(filterValue, plan.parameters[0]?.parameter_id);
    try {
      const response = await pageStudyResults(
        crypto.randomUUID(),
        projectSessionId,
        plan.study_id,
        plan.study_hash,
        nextPage,
        8,
        resultFilter.parameter,
        resultFilter.value,
        null,
        null,
        sortBy,
        false,
      );
      const page = response.result?.page as { items?: unknown[]; stale?: boolean; total?: number; page?: number } | undefined;
      if (!response.error && page && Array.isArray(page.items)) {
        const results = page.items.filter(isSafeStudySampleResult);
        dispatch((current) => studyReducer(current, { type: "page_loaded", results, stale: page.stale === true }));
        setPageIndex(typeof page.page === "number" ? page.page : nextPage);
        setPageTotal(typeof page.total === "number" ? page.total : results.length);
      } else if (response.error) {
        dispatch((current) => studyReducer(current, { type: "issue", issue: response.error! }));
      }
    } catch {
      dispatch((current) => studyReducer(current, { type: "issue", issue: bridgeIssue("study_bridge_invoke_failed", t("studies.bridgeFailed")) }));
    }
  }

  async function createPlan() {
    if (validation.issue || !projectSessionId || !revisionId) return;
    setBusy(true);
    const requestId = crypto.randomUUID();
    try {
      const response = await prepareStudyPlan(requestId, projectSessionId, revisionId, validation.parameters, mode, null, null, 32);
      const planValue = response.result?.plan;
      if (!isSafeStudyPlan(planValue)) {
        dispatch((current) => ({ ...current, issue: response.error ?? bridgeIssue("study_response_invalid", t("studies.planInvalid")), status: "failed" }));
        return;
      }
      dispatch((current) => studyReducer(current, { type: "plan_ready", requestId, plan: planValue }));
      setPageIndex(0);
      setPageTotal(0);
    } catch {
      dispatch((current) => ({ ...current, status: "failed", issue: bridgeIssue("study_bridge_invoke_failed", t("studies.bridgeFailed")) }));
    } finally {
      setBusy(false);
    }
  }

  async function runPlan() {
    if (!state.plan || !projectSessionId || !revisionId || busy) return;
    setBusy(true);
    const requestId = crypto.randomUUID();
    dispatch((current) => studyReducer(current, { type: "run_started", requestId }));
    try {
      const response = await runStudy(requestId, projectSessionId, revisionId, state.plan, null, null);
      const rawResults = response.result?.results;
      const results = Array.isArray(rawResults) ? rawResults.filter(isSafeStudySampleResult) : [];
      if (!response.error && response.result && Array.isArray(rawResults) && results.length === rawResults.length) {
        const status = response.result.status === "succeeded" || response.result.status === "partial" ? response.result.status : "failed";
        dispatch((current) => studyReducer(current, { type: "run_succeeded", requestId, results, status }));
        await loadPage(state.plan, 0);
      } else {
        dispatch((current) => studyReducer(current, { type: "run_failed", requestId, issue: response.error ?? bridgeIssue("study_run_invalid", t("studies.runInvalid")) }));
      }
    } catch {
      dispatch((current) => studyReducer(current, { type: "run_failed", requestId, issue: bridgeIssue("study_bridge_invoke_failed", t("studies.bridgeFailed")) }));
    } finally {
      setBusy(false);
    }
  }

  async function cancelPlan() {
    const canCancel = Boolean(state.plan && projectSessionId && (busy || state.status === "queued" || state.status === "running"));
    if (!canCancel || !state.plan || !projectSessionId) return;
    const requestId = crypto.randomUUID();
    try {
      const response = await cancelStudy(requestId, projectSessionId, state.plan.study_id);
      if (!response.error) dispatch((current) => studyReducer(current, { type: "cancelled", requestId: current.activeRequestId ?? requestId, allowQueued: !busy }));
      else dispatch((current) => studyReducer(current, { type: "issue", issue: response.error! }));
    } catch {
      dispatch((current) => studyReducer(current, { type: "issue", issue: bridgeIssue("study_bridge_invoke_failed", t("studies.bridgeFailed")) }));
    }
  }

  async function analyze() {
    if (!state.results.length || !projectSessionId || busy) return;
    setBusy(true);
    try {
      const response = await analyzeStudyResults(crypto.randomUUID(), projectSessionId, state.results, state.results[0]?.sample_id ?? null);
      if (response.result?.analysis) dispatch((current) => studyReducer(current, { type: "analysis_ready", analysis: response.result?.analysis as never }));
      else if (response.error) dispatch((current) => studyReducer(current, { type: "issue", issue: response.error! }));
      else onNotice(t("studies.noEvidence"));
    } catch {
      dispatch((current) => studyReducer(current, { type: "issue", issue: bridgeIssue("study_bridge_invoke_failed", t("studies.bridgeFailed")) }));
    }
    setBusy(false);
  }

  async function exportReport() {
    if (!state.plan || !projectSessionId || busy) return;
    setBusy(true);
    try {
      const response = await exportStudyReport(crypto.randomUUID(), projectSessionId, state.plan, state.results, { version: "3.4.0.3", architecture: "windows-x64" }, state.analysis, "official tool result", format);
      if (!response.error) onNotice(`${t("studies.export")}: ${format.toUpperCase()}`);
      else dispatch((current) => studyReducer(current, { type: "issue", issue: response.error! }));
    } catch {
      dispatch((current) => studyReducer(current, { type: "issue", issue: bridgeIssue("study_bridge_invoke_failed", t("studies.bridgeFailed")) }));
    }
    setBusy(false);
  }

  return (
    <section className="destination-page study-workspace" aria-labelledby="study-title">
      <header className="destination-header"><FlaskConical size={22} aria-hidden="true" /><div><span>{t("navigation.studies")}</span><h1 id="study-title">{t("studies.destinationTitle")}</h1></div></header>
      {!project || !currentZone || !projectSessionId || !revisionId ? <div className="destination-empty-state"><BarChart3 size={30} strokeWidth={1.5} aria-hidden="true" /><strong>{t("studies.emptyTitle")}</strong><p>{t("studies.emptyBody")}</p></div> : (
        <>
          <section className="destination-section study-controls" aria-label={t("studies.parameter")}>
            <div className="study-controls-heading">
              <div><strong>{t("studies.parametersTitle")}</strong><span>{t("studies.parametersBody")}</span></div>
              <button className="secondary-action" type="button" onClick={addParameter} disabled={busy || ![...zoneTargets, ...flowPathTargets].some((target) => !parameters.some((item) => item.parameter_type === target.parameter_type && item.object_id === target.object_id))}>
                <Plus size={16} />{t("studies.addParameter")}
              </button>
            </div>
            {hasReadonlyAdvancedParameters ? <p className="warning-note study-parameter-downgrade">{t("studies.scheduleUnsupported")} {t("studies.speciesUnsupported")}</p> : null}
            <div className="study-parameter-list">
              {parameters.map((draft, index) => {
                const availableTargets = targetList(draft);
                return (
                  <article className="study-parameter-card" key={draft.parameter_id}>
                    <div className="study-parameter-card-heading"><strong>{t("studies.parameterNumber", { number: index + 1 })}</strong><button className="panel-icon-button study-remove-parameter" type="button" onClick={() => removeParameter(index)} disabled={busy} title={t("studies.removeParameter")} aria-label={t("studies.removeParameter")}><Trash2 size={15} /></button></div>
                    <div className="study-control-row">
                      <label><span>{t("studies.parameterType")}</span><select value={draft.parameter_type} onChange={(event) => updateType(index, event.target.value as StudyParameterTarget["parameter_type"])} disabled={busy}><option value="zone_volume_m3">{t("studies.zoneVolume")}</option><option value="flow_path_multiplier">{t("studies.flowPathMultiplier")}</option></select></label>
                      <label><span>{t("studies.object")}</span><select value={draft.object_id} onChange={(event) => updateTarget(index, event.target.value)} disabled={busy || !availableTargets.length}>{availableTargets.length ? availableTargets.map((target) => <option value={target.object_id} key={target.object_id}>{target.name}</option>) : <option value="">{t("studies.noTarget")}</option>}</select></label>
                      <label><span>{t("studies.min")} ({draft.unit})</span><input type="number" value={draft.minimum} onChange={(event) => updateDraft(index, { minimum: event.target.value })} disabled={busy} /></label>
                      <label><span>{t("studies.max")} ({draft.unit})</span><input type="number" value={draft.maximum} onChange={(event) => updateDraft(index, { maximum: event.target.value })} disabled={busy} /></label>
                      <label><span>{t("studies.step")} ({draft.unit})</span><input type="number" value={draft.step} onChange={(event) => updateDraft(index, { step: event.target.value })} disabled={busy} /></label>
                    </div>
                  </article>
                );
              })}
              {!parameters.length ? <p className="destination-empty">{t("studies.noParameters")}</p> : null}
            </div>
            <div className="study-control-row study-mode-row"><label><span>{t("studies.mode")}</span><select value={mode} onChange={(event) => changeMode(event.target.value as StudyMode)} disabled={busy}><option value="single_scan">{t("studies.singleScan")}</option><option value="cartesian">{t("studies.cartesian")}</option></select></label><div className={`study-combination-preview ${validation.estimate.overLimit ? "is-over-limit" : validation.estimate.total >= 26 ? "is-near-limit" : ""}`} role="status"><span>{t("studies.combinationCount")}</span><strong>{combinationSummary}</strong></div></div>
            {!validation.issue && validation.estimate.total >= 26 && !validation.estimate.overLimit ? <p className="warning-note">{t("studies.combinationNearLimit")}</p> : null}
            {validation.issue ? <p className="warning-note" role="alert">{t(`studies.validation.${validation.issue}`)}</p> : null}
            <div className="study-actions"><button className="primary-action" type="button" onClick={() => void createPlan()} disabled={busy || Boolean(validation.issue)}><FlaskConical size={16} />{t("studies.create")}</button><button className="secondary-action" type="button" onClick={() => void runPlan()} disabled={busy || !state.plan || state.status === "cancelled"}><Play size={16} />{t("studies.run")}</button><button className="secondary-action" type="button" onClick={() => void cancelPlan()} disabled={!state.plan || (!busy && !["queued", "running"].includes(state.status))} title={t("studies.cancelHint")}><Square size={16} />{t("studies.cancel")}</button></div>
            {state.issue ? <p className="patch-inline-error" role="alert">{state.issue.message} ({state.issue.code})</p> : null}
          </section>
          {state.plan ? <section className="destination-section study-plan-summary"><div className="study-meta"><span>{t("studies.status")}</span><strong>{state.status}</strong><code>{state.plan.study_hash.slice(0, 12)}…</code></div><p>{t("studies.offline")}</p></section> : null}
          {state.plan ? <section className="destination-section study-results"><div className="study-results-toolbar"><strong>{t("results.destinationTitle")}</strong><div><label className="study-inline-control">{t("studies.filter")}<input value={filterValue} onChange={(event) => setFilterValue(event.target.value)} inputMode="decimal" disabled={busy} /></label><label className="study-inline-control">{t("studies.sort")}<select value={sortBy} onChange={(event) => setSortBy(event.target.value)} disabled={busy}><option value="sample_id">{t("studies.sample")}</option><option value="value">{t("studies.value")}</option><option value="status">{t("studies.status")}</option></select></label><button className="secondary-action" type="button" onClick={() => void loadPage(state.plan!, 0)} disabled={busy}><RefreshCw size={16} />{t("studies.refresh")}</button><button className="secondary-action" type="button" onClick={() => void analyze()} disabled={busy || !state.results.length}><BarChart3 size={16} />{t("studies.analyze")}</button><select aria-label={t("studies.export")} value={format} onChange={(event) => setFormat(event.target.value)}><option value="html">HTML</option><option value="pdf">PDF</option><option value="csv">CSV</option><option value="json">JSON</option></select><button className="secondary-action" type="button" onClick={() => void exportReport()} disabled={busy || !state.results.length}><Download size={16} />{t("studies.export")}</button></div></div>{state.results.length ? <div className="table-scroll"><table className="results-table"><thead><tr><th>{t("studies.sample")}</th><th>{t("studies.status")}</th><th>{t("studies.parameters")}</th><th>{t("studies.value")}</th><th>{t("studies.hash")}</th></tr></thead><tbody>{state.results.map((item) => <tr key={item.sample_id}><td><code>{item.sample_id.slice(0, 8)}</code></td><td>{item.status}</td><td className="study-parameter-values"><code>{Object.entries(item.parameters).map(([key, value]) => `${state.plan?.parameters.find((parameter) => parameter.parameter_id === key)?.name ?? key}=${value}`).join("; ")}</code></td><td>{String(item.statistics.value ?? "-")}</td><td><code>{item.result_hash?.slice(0, 12) ?? "-"}</code></td></tr>)}</tbody></table></div> : <p className="destination-empty">{t("studies.noResults")}</p>}<div className="study-pagination"><button className="secondary-action" type="button" onClick={() => void loadPage(state.plan!, pageIndex - 1)} disabled={busy || pageIndex <= 0}>{t("studies.previous")}</button><span>{t("studies.page")} {pageIndex + 1} · {pageTotal}</span><button className="secondary-action" type="button" onClick={() => void loadPage(state.plan!, pageIndex + 1)} disabled={busy || (pageIndex + 1) * 8 >= pageTotal}>{t("studies.next")}</button></div>{state.stale ? <p className="warning-note">{t("studies.stale")}</p> : null}{state.analysis ? <div className="study-analysis" aria-label={t("studies.analyze")}>{state.analysis.conclusions.map((item) => <article key={item.kind}><p>{item.text}</p><ul>{item.evidence.map((evidence, index) => <li key={`${String(evidence.sample_id)}-${index}`}><code>{String(evidence.sample_id ?? "-").slice(0, 12)}</code> · {String(evidence.zone_id ?? "-")} · {String(evidence.metric ?? "value")} · {String(evidence.timestamp ?? "-")} s · <code>{String(evidence.result_hash ?? "-").slice(0, 12)}…</code></li>)}</ul></article>)}</div> : null}</section> : null}
          {state.plan ? <StudyCharts plan={state.plan} results={state.results} theme={theme} /> : null}
        </>
      )}
    </section>
  );
}
