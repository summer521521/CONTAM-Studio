import { FolderOpen, ShieldCheck } from "lucide-react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../../app/command-availability";
import type { AttachmentState, AttachmentView } from "../../../app/attachment-state";
import { projectFileName, selectedZone, type ProjectState, type ReaderDiagnostic } from "../../../app/project-state";
import type { ResultState } from "../../../app/result-state";
import type { RunState } from "../../../app/run-state";
import type { StudioSetup } from "../../../app/release-state";
import type { SemanticSnapshot, SemanticStatus } from "../../../app/semantic-state";
import { DEFAULT_VISUAL_PREFERENCES, type VisualWorkspacePreferences } from "../../../app/spatial-model";
import type { WorkbenchDestination } from "../../../app/workbench-state";
import type { GeometryWorkbenchController } from "../../../app/runtime/useGeometryWorkbench";
import type { GeometryVisionDraftController } from "../../../app/runtime/useGeometryVisionDraft";
import type { SketchpadProjectionPreview } from "../../../app/geometry/sketchpad-projection-preview";
import { Button } from "../../ui/Button";
import { Disclosure } from "../../ui/Disclosure";
import { InlineNotice } from "../../ui/InlineNotice";
import { LoadingState } from "../../ui/LoadingState";

const GeometryWorkbench = lazy(async () => ({
  default: (await import("../geometry/GeometryWorkbench")).GeometryWorkbench,
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
  geometryWorkbench?: GeometryWorkbenchController;
  geometryVisionDraft?: GeometryVisionDraftController;
  attachmentState?: AttachmentState;
  onAttachmentImport?: () => void;
  onAttachmentsImported?: (attachments: AttachmentView[]) => void;
  onAttachmentSelect?: (attachment: AttachmentView, selected: boolean) => void;
  onOpenAssistant?: () => void;
  onReviewSketchpadProjection?: (preview: SketchpadProjectionPreview) => Promise<boolean>;
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
  geometryWorkbench,
  geometryVisionDraft,
  attachmentState,
  onAttachmentImport = () => undefined,
  onAttachmentsImported = () => undefined,
  onAttachmentSelect = () => undefined,
  onOpenAssistant = () => undefined,
  onReviewSketchpadProjection,
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

  const draft = projectState.draft;
  const accessibilityZone = selectedZone(projectState);

  return (
    <section className="journey-page project-journey project-visual-page geometry-project-page" aria-label={t("geometry.editor.title")}>
      <div className="sr-only" aria-label={t("project.summary")}>
        <span>{projectFileName(project.source_path)}</span>
        <span>{draft && draft.revision_number > 0 ? t("journeys.project.draft", { revision: draft.revision_number }) : t("journeys.project.original")}</span>
        <span>{accessibilityZone?.name ?? t("journeys.project.noZone")}</span>
        <span>{t("journeys.project.nextAction")}</span>
      </div>
      {draft?.dirty && !draft.exported ? <InlineNotice tone="warning">{t("journeys.project.draftUnsaved")}</InlineNotice> : null}

      {semanticSnapshot && geometryWorkbench && geometryVisionDraft ? (
        <Suspense fallback={<LoadingState label={t("visual.loading")} />}>
          <GeometryWorkbench
            projectState={projectState}
            snapshot={semanticSnapshot}
            controller={geometryWorkbench}
            geometryVisionDraft={geometryVisionDraft}
            selectedSemanticObjectId={selectedSemanticObjectId}
            visualPreferences={visualPreferences}
            onVisualPreferencesChange={onVisualPreferencesChange}
            onSelectSemantic={onSelectSemantic}
            onNavigate={onNavigate}
            onOpenAssistant={onOpenAssistant}
            attachmentState={attachmentState}
            onAttachmentImport={onAttachmentImport}
            onAttachmentsImported={onAttachmentsImported}
            onAttachmentSelect={onAttachmentSelect}
            onReviewSketchpadProjection={onReviewSketchpadProjection}
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
