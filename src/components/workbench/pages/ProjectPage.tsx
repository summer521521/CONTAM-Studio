import { FolderOpen, Play, ShieldCheck } from "lucide-react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../../app/command-availability";
import { projectFileName, selectedZone, type ProjectState, type ReaderDiagnostic } from "../../../app/project-state";
import type { ResultState } from "../../../app/result-state";
import type { RunState } from "../../../app/run-state";
import type { StudioSetup } from "../../../app/release-state";
import type { SemanticSnapshot, SemanticStatus } from "../../../app/semantic-state";
import { DEFAULT_VISUAL_PREFERENCES, type VisualWorkspacePreferences } from "../../../app/spatial-model";
import type { WorkbenchDestination } from "../../../app/workbench-state";
import { Button } from "../../ui/Button";
import { Disclosure } from "../../ui/Disclosure";
import { InlineNotice } from "../../ui/InlineNotice";
import { LoadingState } from "../../ui/LoadingState";
import { PageHeader } from "../../ui/PageHeader";
import { StatusTag } from "../../ui/StatusTag";

const VisualModelWorkspace = lazy(async () => ({
  default: (await import("../visual/VisualModelWorkspace")).VisualModelWorkspace,
}));

export interface ProjectPageProps {
  projectState: ProjectState;
  runState: RunState;
  resultState: ResultState;
  setup: StudioSetup | null;
  availability: Pick<CommandAvailability, "openProject" | "runProject">;
  onOpenProject: () => void;
  onNavigate: (destination: WorkbenchDestination) => void;
  semanticSnapshot?: SemanticSnapshot | null;
  semanticStatus?: SemanticStatus;
  semanticIssue?: ReaderDiagnostic | null;
  selectedSemanticObjectId?: string | null;
  visualPreferences?: VisualWorkspacePreferences;
  onVisualPreferencesChange?: (preferences: VisualWorkspacePreferences) => void;
  onSelectSemantic?: (semanticId: string) => void;
}

function engineStatus(setup: StudioSetup | null, t: (key: string, options?: Record<string, unknown>) => string) {
  if (!setup) return t("journeys.home.engineChecking");
  if (setup.contamx.status === "available") {
    return t("journeys.home.engineReady", { version: setup.contamx.version ?? "—" });
  }
  return t("journeys.home.engineUnavailable");
}

export function ProjectPage({
  projectState,
  runState,
  resultState,
  setup,
  availability,
  onOpenProject,
  onNavigate,
  semanticSnapshot = null,
  semanticStatus = "idle",
  semanticIssue = null,
  selectedSemanticObjectId = null,
  visualPreferences = DEFAULT_VISUAL_PREFERENCES,
  onVisualPreferencesChange = () => undefined,
  onSelectSemantic = () => undefined,
}: ProjectPageProps) {
  const { t } = useTranslation();
  const project = projectState.project;

  if (!project) {
    const loading = projectState.status === "selecting" || projectState.status === "loading";
    return (
      <section className="journey-page no-project-home" aria-labelledby="project-home-title">
        <div className="no-project-copy">
          <h1 id="project-home-title">{t("journeys.home.title")}</h1>
          <p>{t("journeys.home.tagline")}</p>
          <Button variant="primary" icon={<FolderOpen size={18} aria-hidden="true" />} loading={loading} disabled={!availability.openProject} onClick={onOpenProject}>
            {t("journeys.openProject")}
          </Button>
        </div>
        <div className="no-project-engine" role="status">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>{engineStatus(setup, t)}</span>
        </div>
        {loading ? <LoadingState label={t(`project.status.${projectState.status}`)} /> : null}
        {projectState.status === "cancelled" ? <InlineNotice>{t("journeys.home.cancelled")}</InlineNotice> : null}
        {projectState.status === "error" || projectState.status === "unsupported" ? (
          <InlineNotice tone="error" role="alert">{t("journeys.home.failed")}</InlineNotice>
        ) : null}
      </section>
    );
  }

  const zone = selectedZone(projectState);
  const sameRun = runState.projectSessionId === projectState.projectSessionId;
  const resultCurrent = resultState.projectSessionId === projectState.projectSessionId && Boolean(resultState.result);
  const draft = projectState.draft;
  const runLabel = !sameRun || runState.status === "idle"
    ? t("journeys.project.notRun")
    : runState.status === "error"
      ? t("journeys.project.runFailed")
      : runState.status === "running"
        ? t("journeys.run.running")
        : t("journeys.project.runSucceeded");
  const nextAction = !zone ? t("journeys.project.selectZone") : resultCurrent ? t("journeys.goResults") : t("journeys.project.startRun");

  return (
    <section className="journey-page project-journey project-visual-page" aria-labelledby="project-page-title">
      <PageHeader
        eyebrow={t("journeys.project.eyebrow")}
        title={projectFileName(project.source_path)}
        description={t("journeys.project.description")}
        meta={(
          <>
            <StatusTag>{t("journeys.project.source")}</StatusTag>
            <StatusTag tone={draft && draft.revision_number > 0 ? "warning" : "neutral"}>
              {draft && draft.revision_number > 0 ? t("journeys.project.draft", { revision: draft.revision_number }) : t("journeys.project.original")}
            </StatusTag>
            <StatusTag tone={draft ? "success" : "neutral"}>{draft ? t("journeys.project.editable") : t("journeys.project.readonly")}</StatusTag>
          </>
        )}
        actions={<Button icon={<FolderOpen size={16} aria-hidden="true" />} disabled={!availability.openProject} onClick={onOpenProject}>{t("project.openAnother")}</Button>}
      />

      {draft?.dirty && !draft.exported ? <InlineNotice tone="warning">{t("journeys.project.draftUnsaved")}</InlineNotice> : null}

      <div className="project-visual-summary" aria-label={t("project.summary")}>
        <div><span>{t("journeys.project.zoneCount")}</span><strong>{project.zones.length}</strong></div>
        <div><span>{t("journeys.project.selectedZone")}</span><strong>{zone ? `${zone.name} · ${zone.contam_number}` : t("journeys.project.noZone")}</strong></div>
        <div><span>{t("journeys.project.runSummary")}</span><strong>{runLabel}</strong></div>
        <div><span>{t("journeys.project.resultsSummary")}</span><strong>{resultCurrent ? t("journeys.project.resultReady") : t("journeys.project.noResults")}</strong></div>
        <div className="project-visual-next"><span>{t("journeys.project.nextAction")}</span><strong>{nextAction}</strong>{resultCurrent ? (
          <Button variant="primary" onClick={() => onNavigate("results")}>{t("journeys.goResults")}</Button>
        ) : (
          <Button variant="primary" icon={<Play size={16} aria-hidden="true" />} disabled={!zone || !availability.runProject} onClick={() => onNavigate("run")}>{t("journeys.goRun")}</Button>
        )}</div>
      </div>

      {semanticSnapshot ? (
        <Suspense fallback={<LoadingState label={t("visual.loading")} />}>
          <VisualModelWorkspace
            snapshot={semanticSnapshot}
            projection={semanticSnapshot.spatial_projection}
            selectedSemanticObjectId={selectedSemanticObjectId}
            preferences={visualPreferences}
            onPreferencesChange={onVisualPreferencesChange}
            onSelectSemantic={onSelectSemantic}
          />
        </Suspense>
      ) : semanticStatus === "loading" ? <LoadingState label={t("visual.loading")} /> : (
        <InlineNotice tone="warning" role="status">{t("visual.canvas.failed")}</InlineNotice>
      )}

      <Disclosure label={t("journeys.project.technical")}>
        <dl className="technical-detail-list">
          <div><dt>{t("project.headerVersion")}</dt><dd>{project.header_version}</dd></div>
          <div><dt>{t("project.readerMode")}</dt><dd><code>{project.reader_mode}</code></dd></div>
          <div><dt>{t("project.hash")}</dt><dd><code>{project.source_sha256.slice(0, 12)}…</code></dd></div>
          {draft ? <div><dt>{t("assistant.receipt.revision")}</dt><dd><code>{draft.revision_id}</code></dd></div> : null}
          <div><dt>{t("project.showSourcePath")}</dt><dd><code>{project.source_path}</code></dd></div>
          {semanticIssue ? <div><dt>{t("visual.title")}</dt><dd><code>{semanticIssue.code}</code><br />{semanticIssue.message}</dd></div> : null}
        </dl>
      </Disclosure>
    </section>
  );
}
