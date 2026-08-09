import { AlertCircle, CheckCircle2, FileSearch, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../../app/command-availability";
import { projectFileName, type ProjectState } from "../../../app/project-state";
import type { ResultState } from "../../../app/result-state";
import type { RunState } from "../../../app/run-state";
import type { StudioSetup } from "../../../app/release-state";
import type { WorkbenchDestination } from "../../../app/workbench-state";
import { Button } from "../../ui/Button";
import { Disclosure } from "../../ui/Disclosure";
import { EmptyState } from "../../ui/EmptyState";
import { InlineNotice } from "../../ui/InlineNotice";
import { PageHeader } from "../../ui/PageHeader";
import { StatusTag } from "../../ui/StatusTag";

export interface RunPageProps {
  projectState: ProjectState;
  runState: RunState;
  resultState: ResultState;
  setup: StudioSetup | null;
  availability: Pick<CommandAvailability, "openProject" | "runProject" | "loadActiveResult">;
  onOpenProject: () => void;
  onRunProject: () => void;
  onLoadLatestResults: () => void;
  onNavigate: (destination: WorkbenchDestination) => void;
}

export function RunPage({ projectState, runState, resultState, setup, availability, onOpenProject, onRunProject, onLoadLatestResults, onNavigate }: RunPageProps) {
  const { t } = useTranslation();
  const project = projectState.project;
  if (!project) {
    return <EmptyState title={t("journeys.run.projectReason")} action={<Button variant="primary" onClick={onOpenProject}>{t("journeys.openProject")}</Button>} />;
  }

  const toolReady = setup?.contamx.status === "available";
  const checkingTool = setup === null;
  const sameRun = runState.projectSessionId === projectState.projectSessionId;
  const resultMatchesRun = Boolean(resultState.result && runState.summary && resultState.result.run_id === runState.summary.run_id);
  const readFailed = sameRun && runState.status === "succeeded" && resultState.status === "error";
  const stale = Boolean(runState.projectSessionId && !sameRun);
  const canRun = Boolean(availability.runProject && toolReady && !checkingTool);
  const disabledReason = checkingTool
    ? t("journeys.home.engineChecking")
    : !toolReady
      ? t("journeys.run.toolReason")
      : !availability.runProject
        ? t("journeys.run.busyReason")
        : null;

  const status = stale
    ? { label: t("journeys.run.stale"), tone: "warning" as const }
    : runState.status === "running"
      ? { label: t("journeys.run.running"), tone: "neutral" as const }
      : runState.status === "error"
        ? { label: t("journeys.run.failed"), tone: "error" as const }
        : readFailed
          ? { label: t("journeys.run.readFailed"), tone: "warning" as const }
          : resultMatchesRun
            ? { label: t("journeys.run.resultsReady"), tone: "success" as const }
            : runState.status === "succeeded"
              ? { label: t("journeys.run.solvedUnread"), tone: "success" as const }
              : { label: t("journeys.run.idle"), tone: "neutral" as const };

  return (
    <section className="journey-page run-journey" aria-labelledby="run-page-title">
      <PageHeader eyebrow={t("journeys.run.eyebrow")} title={t("journeys.run.title")} description={t("journeys.run.description")} meta={<StatusTag tone={status.tone}>{status.label}</StatusTag>} />

      <section className="run-object" aria-labelledby="run-object-title">
        <span id="run-object-title">{t("journeys.run.currentObject")}</span>
        <strong>{projectFileName(project.source_path)}</strong>
        <small>{projectState.draft && projectState.draft.revision_number > 0 ? t("journeys.project.draft", { revision: projectState.draft.revision_number }) : t("journeys.project.original")}</small>
      </section>

      <section className="run-preflight" aria-labelledby="run-preflight-title">
        <div className={canRun ? "is-ready" : "is-blocked"}>{canRun ? <CheckCircle2 size={20} aria-hidden="true" /> : <AlertCircle size={20} aria-hidden="true" />}<div><strong id="run-preflight-title">{t("journeys.run.preflight")}</strong><span>{canRun ? t("journeys.run.ready") : disabledReason}</span></div></div>
        <Button variant="primary" loading={runState.status === "running"} icon={<Play size={17} aria-hidden="true" />} disabled={!canRun} onClick={onRunProject}>{t("journeys.run.start")}</Button>
      </section>

      <section className="run-current-status" aria-labelledby="run-status-title">
        <div><span id="run-status-title">{t("journeys.run.status")}</span><strong>{status.label}</strong></div>
        {readFailed ? <Button icon={<FileSearch size={16} aria-hidden="true" />} disabled={!availability.loadActiveResult} onClick={onLoadLatestResults}>{t("journeys.run.retryRead")}</Button> : null}
        {resultMatchesRun ? <Button variant="primary" onClick={() => onNavigate("results")}>{t("journeys.goResults")}</Button> : null}
      </section>

      {runState.status === "error" ? <InlineNotice tone="error" role="alert">{t(`errors.codes.${runState.issue?.code}`, { defaultValue: t("journeys.run.failed") })}</InlineNotice> : null}
      {readFailed ? <InlineNotice tone="warning" role="alert">{t("journeys.run.readFailed")}</InlineNotice> : null}

      {(runState.summary || runState.issue) ? (
        <Disclosure label={t("journeys.run.details")}>
          <dl className="technical-detail-list">
            {runState.summary ? <><div><dt>Run ID</dt><dd><code>{runState.summary.run_id}</code></dd></div><div><dt>ContamX</dt><dd>{runState.summary.solver_version}</dd></div><div><dt>{t("run.duration")}</dt><dd>{runState.summary.duration_ms} ms</dd></div><div><dt>{t("run.exitCode")}</dt><dd>{runState.summary.exit_code}</dd></div></> : null}
            {runState.issue ? <div><dt>{t("errors.technicalCode")}</dt><dd><code>{runState.issue.code}</code></dd></div> : null}
          </dl>
        </Disclosure>
      ) : null}
    </section>
  );
}
