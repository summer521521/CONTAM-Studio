import { BarChart3, Download, FlaskConical, Play, RefreshCw, Square } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { analyzeStudyResults, cancelStudy, exportStudyReport, pageStudyResults, prepareStudyPlan, runStudy } from "../../app/desktop-api";
import { isSafeStudyPlan, isSafeStudySampleResult, studyReducer, INITIAL_STUDY_STATE, studyResultFilter, type StudyMode, type StudyParameter, type StudyPlan } from "../../app/study-state";
import type { ProjectInspection, ReaderDiagnostic } from "../../app/project-state";

interface StudyWorkspaceProps {
  project: ProjectInspection | null;
  projectSessionId: string | null;
  revisionId: string | null;
  onNotice?: (message: string) => void;
}

export function StudyWorkspace({ project, projectSessionId, revisionId, onNotice = () => undefined }: StudyWorkspaceProps) {
  const { t } = useTranslation();
  const [state, dispatch] = useState(INITIAL_STUDY_STATE);
  const [mode, setMode] = useState<StudyMode>("single_scan");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [step, setStep] = useState("");
  const [format, setFormat] = useState("html");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageTotal, setPageTotal] = useState(0);
  const [filterValue, setFilterValue] = useState("");
  const [sortBy, setSortBy] = useState("sample_id");
  const [busy, setBusy] = useState(false);
  const currentZone = project?.zones[0] ?? null;
  const initialVolume = currentZone?.volume_m3 ?? 100;
  const parameter = useMemo<StudyParameter | null>(() => {
    if (!currentZone) return null;
    const min = Number(minimum || Math.max(0.1, initialVolume * 0.8));
    const max = Number(maximum || initialVolume * 1.2);
    const increment = Number(step || Math.max(0.1, (max - min) / 2));
    return {
      parameter_id: "zone-volume",
      parameter_type: "zone_volume_m3",
      object_id: currentZone.zone_id,
      name: currentZone.name,
      unit: "m3",
      minimum: min,
      maximum: max,
      step: increment,
      discrete_values: [],
      default_value: initialVolume,
    };
  }, [currentZone, initialVolume, minimum, maximum, step]);

  function bridgeIssue(code: string, message: string): ReaderDiagnostic {
    return { code, message, source_line_number: null, context: {} };
  }

  async function loadPage(plan: StudyPlan, nextPage: number) {
    if (!projectSessionId) return;
    const resultFilter = studyResultFilter(filterValue);
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
    if (!parameter || !projectSessionId || !revisionId) return;
    setBusy(true);
    const requestId = crypto.randomUUID();
    try {
      const response = await prepareStudyPlan(requestId, projectSessionId, revisionId, [parameter], mode, null, null, 32);
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
    if (!state.plan || !projectSessionId || !busy) return;
    const requestId = crypto.randomUUID();
    try {
      const response = await cancelStudy(requestId, projectSessionId, state.plan.study_id);
      if (!response.error) dispatch((current) => studyReducer(current, { type: "cancelled", requestId: current.activeRequestId ?? requestId }));
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
            <div className="study-control-row"><label>{t("studies.parameter")}<select value={currentZone.zone_id} disabled><option>{currentZone.name}</option></select></label><label>{t("studies.mode")}<select value={mode} onChange={(event) => setMode(event.target.value as StudyMode)} disabled={busy}><option value="single_scan">{t("studies.singleScan")}</option><option value="cartesian">{t("studies.cartesian")}</option></select></label></div>
            <div className="study-control-row"><label>{t("studies.min")}<input type="number" value={minimum} onChange={(event) => setMinimum(event.target.value)} placeholder={String(Math.round(initialVolume * 0.8))} disabled={busy} /></label><label>{t("studies.max")}<input type="number" value={maximum} onChange={(event) => setMaximum(event.target.value)} placeholder={String(Math.round(initialVolume * 1.2))} disabled={busy} /></label><label>{t("studies.step")}<input type="number" value={step} onChange={(event) => setStep(event.target.value)} placeholder="10" disabled={busy} /></label></div>
            <div className="study-actions"><button className="primary-action" type="button" onClick={() => void createPlan()} disabled={busy}><FlaskConical size={16} />{t("studies.create")}</button><button className="secondary-action" type="button" onClick={() => void runPlan()} disabled={busy || !state.plan}><Play size={16} />{t("studies.run")}</button><button className="secondary-action" type="button" onClick={() => void cancelPlan()} disabled={!busy || !state.plan}><Square size={16} />{t("studies.cancel")}</button></div>
            {state.issue ? <p className="patch-inline-error" role="alert">{state.issue.message} ({state.issue.code})</p> : null}
          </section>
          {state.plan ? <section className="destination-section study-plan-summary"><div className="study-meta"><span>{t("studies.status")}</span><strong>{state.status}</strong><code>{state.plan.study_hash.slice(0, 12)}…</code></div><p>{t("studies.offline")}</p></section> : null}
          {state.plan ? <section className="destination-section study-results"><div className="study-results-toolbar"><strong>{t("results.destinationTitle")}</strong><div><label className="study-inline-control">{t("studies.filter")}<input value={filterValue} onChange={(event) => setFilterValue(event.target.value)} inputMode="decimal" disabled={busy} /></label><label className="study-inline-control">{t("studies.sort")}<select value={sortBy} onChange={(event) => setSortBy(event.target.value)} disabled={busy}><option value="sample_id">{t("studies.sample")}</option><option value="value">{t("studies.value")}</option><option value="status">{t("studies.status")}</option></select></label><button className="secondary-action" type="button" onClick={() => void loadPage(state.plan!, 0)} disabled={busy}><RefreshCw size={16} />{t("studies.refresh")}</button><button className="secondary-action" type="button" onClick={() => void analyze()} disabled={busy || !state.results.length}><BarChart3 size={16} />{t("studies.analyze")}</button><select aria-label={t("studies.export")} value={format} onChange={(event) => setFormat(event.target.value)}><option value="html">HTML</option><option value="pdf">PDF</option><option value="csv">CSV</option><option value="json">JSON</option></select><button className="secondary-action" type="button" onClick={() => void exportReport()} disabled={busy || !state.results.length}><Download size={16} />{t("studies.export")}</button></div></div>{state.results.length ? <div className="table-scroll"><table className="results-table"><thead><tr><th>{t("studies.sample")}</th><th>{t("studies.status")}</th><th>{t("studies.value")}</th><th>{t("studies.hash")}</th></tr></thead><tbody>{state.results.map((item) => <tr key={item.sample_id}><td><code>{item.sample_id.slice(0, 8)}</code></td><td>{item.status}</td><td>{String(item.statistics.value ?? "-")}</td><td><code>{item.result_hash?.slice(0, 12) ?? "-"}</code></td></tr>)}</tbody></table></div> : <p className="destination-empty">{t("studies.noResults")}</p>}<div className="study-pagination"><button className="secondary-action" type="button" onClick={() => void loadPage(state.plan!, pageIndex - 1)} disabled={busy || pageIndex <= 0}>{t("studies.previous")}</button><span>{t("studies.page")} {pageIndex + 1} · {pageTotal}</span><button className="secondary-action" type="button" onClick={() => void loadPage(state.plan!, pageIndex + 1)} disabled={busy || (pageIndex + 1) * 8 >= pageTotal}>{t("studies.next")}</button></div>{state.stale ? <p className="warning-note">{t("studies.stale")}</p> : null}{state.analysis ? <pre className="study-analysis">{state.analysis.conclusions.map((item) => item.text).join("\n")}</pre> : null}</section> : null}
        </>
      )}
    </section>
  );
}
