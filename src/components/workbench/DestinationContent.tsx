import { Activity, BarChart3, FlaskConical, Home, PanelBottomClose, PanelBottomOpen, PanelRightClose, PanelRightOpen, Play, Settings2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { AiProviderProfile, AiState } from "../../app/ai-state";
import type { AttachmentState, AttachmentView } from "../../app/attachment-state";
import type { CommandAvailability } from "../../app/command-availability";
import type { ProjectState, ReaderDiagnostic } from "../../app/project-state";
import type { ResultExportState } from "../../app/result-export-state";
import type { ResultState } from "../../app/result-state";
import type { ResultDatasetState, ResultMetricKey } from "../../app/result-dataset-state";
import type { StorageUsageView, StudioSetup, ToolKind, ToolState } from "../../app/release-state";
import type { RunState } from "../../app/run-state";
import type { SemanticSnapshot, SemanticStatus } from "../../app/semantic-state";
import type { VisualWorkspacePreferences } from "../../app/spatial-model";
import type { AppLanguage, AppTheme, WorkbenchDestination } from "../../app/workbench-state";
import type { GeometryWorkbenchController } from "../../app/runtime/useGeometryWorkbench";
import type { GeometryVisionDraftController } from "../../app/runtime/useGeometryVisionDraft";
import type { SketchpadProjectionPreview } from "../../app/geometry/sketchpad-projection-preview";
import { EmptyState } from "../ui/EmptyState";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { IconButton } from "../ui/IconButton";
import { LoadingState } from "../ui/LoadingState";
import { ProjectPage } from "./pages/ProjectPage";
import { RunPage } from "./pages/RunPage";

const ResultsPage = lazy(async () => ({ default: (await import("./pages/ResultsPage")).ResultsPage }));
const ResearchPage = lazy(async () => ({ default: (await import("./pages/ResearchPage")).ResearchPage }));
const SettingsPage = lazy(async () => ({ default: (await import("./pages/SettingsPage")).SettingsPage }));

export interface DestinationContentProps {
  destination: WorkbenchDestination;
  projectState: ProjectState;
  runState: RunState;
  resultState: ResultState;
  resultDatasetState: ResultDatasetState;
  resultExportState: ResultExportState;
  aiState: AiState;
  contextCollapsed: boolean;
  bottomCollapsed: boolean;
  activeRunId: string | null;
  theme: AppTheme;
  language: AppLanguage;
  availability: Pick<CommandAvailability, "openProject" | "runProject" | "loadActiveResult" | "selectManifest" | "exportResult">;
  onToggleContext: () => void;
  onToggleBottom: () => void;
  onNavigate: (destination: WorkbenchDestination) => void;
  onOpenProject: () => void;
  onRunProject: () => void;
  onLoadLatestResults: () => void;
  onSelectManifestResults: () => void;
  onExportResults: () => void;
  onLoadResultDataset: () => void;
  onCancelResultDataset: () => void;
  onResultMetricChange: (metric: ResultMetricKey) => void;
  onResultTimeChange: (timeSeconds: number | null) => void;
  onResultZonesChange: (zoneIds: string[]) => void;
  onSettingsReset: () => void;
  projectSessionId: string | null;
  revisionId: string | null;
  semanticSnapshot: SemanticSnapshot | null;
  semanticStatus: SemanticStatus;
  semanticIssue: ReaderDiagnostic | null;
  selectedSemanticObjectId: string | null;
  visualPreferences: VisualWorkspacePreferences;
  onVisualPreferencesChange: (preferences: VisualWorkspacePreferences) => void;
  onSelectSemantic: (semanticId: string) => void;
  geometryWorkbench: GeometryWorkbenchController;
  geometryVisionDraft: GeometryVisionDraftController;
  onNotice: (message: string) => void;
  onOpenAssistant: () => void;
  onReviewSketchpadProjection: (preview: SketchpadProjectionPreview) => Promise<boolean>;
  onAiConnect: () => void;
  onAiRefresh: () => void;
  onAiProviderSelect: (profileId: string) => void;
  onAiProviderTest: () => void;
  onAiProviderRefreshModels: () => void;
  onAiProviderSave: (profile: AiProviderProfile) => void;
  onAiProviderDelete: () => void;
  onAiCodexDeviceLogin: () => void;
  onAiCodexApiKeyLogin: (apiKey: string) => void;
  onAiCodexCancelLogin: () => void;
  onAiCodexLogout: () => void;
  onAiProviderSecret: (secret: string) => void;
  onAiProviderClearSecret: () => void;
  onAiModelChange: (modelId: string) => void;
  attachmentState: AttachmentState;
  onAttachmentImport: () => void;
  onAttachmentsImported: (attachments: AttachmentView[]) => void;
  onAttachmentSelect: (attachment: AttachmentView, selected: boolean) => void;
  setup: StudioSetup | null;
  setupBusy: boolean;
  onChooseDataDirectory: () => Promise<string | null>;
  onProbeTool: (kind: ToolKind) => Promise<ToolState | null>;
  onSaveDataDirectory: (dataDirectory: string) => Promise<void>;
  onOpenStudioDirectory: (kind: "data" | "app-data" | "logs" | "cache") => Promise<void>;
  onClearStudioCache: () => Promise<void>;
  storageUsage: StorageUsageView | null;
  onCopyDiagnostics: () => Promise<void>;
  onExportDiagnostics: () => Promise<void>;
}

const destinationIcons = {
  project: Home,
  run: Play,
  results: BarChart3,
  studies: FlaskConical,
  settings: Settings2,
} satisfies Record<WorkbenchDestination, typeof Activity>;

export function DestinationContent(props: DestinationContentProps) {
  const { t } = useTranslation();
  const Icon = props.projectState.project && props.destination === "project" ? Activity : destinationIcons[props.destination];
  const destinationLabel = props.destination === "project"
    ? props.projectState.project ? t("navigation.projects") : t("welcome.tab")
    : t(`navigation.${props.destination}`);
  const immersiveProject = props.destination === "project" && Boolean(props.projectState.project);
  const fallback = <EmptyState title={t("journeys.loadFailed")} description={t("journeys.loadFailedBody")} />;

  return (
    <main className={`editor-surface ${immersiveProject ? "is-immersive-project" : ""}`}>
      {!immersiveProject ? <div className="editor-tabs">
        <div className="editor-tab is-active"><Icon size={14} aria-hidden="true" /><span>{destinationLabel}</span></div>
        <div className="editor-layout-actions">
          <IconButton className="panel-icon-button" label={props.contextCollapsed ? t("inspector.expand") : t("inspector.collapse")} title={props.contextCollapsed ? t("inspector.expand") : t("inspector.collapse")} onClick={props.onToggleContext}>
            {props.contextCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </IconButton>
          <IconButton className="panel-icon-button" label={props.bottomCollapsed ? t("panel.expand") : t("panel.collapse")} title={props.bottomCollapsed ? t("panel.expand") : t("panel.collapse")} onClick={props.onToggleBottom}>
            {props.bottomCollapsed ? <PanelBottomOpen size={16} /> : <PanelBottomClose size={16} />}
          </IconButton>
        </div>
      </div> : null}
      <div className={`journey-scroll ${immersiveProject ? "is-immersive" : ""}`}>
        <ErrorBoundary resetKey={props.destination} fallback={fallback}>
          <Suspense fallback={<LoadingState label={t("journeys.loading")} />}>
            {props.destination === "project" ? (
              <ProjectPage projectState={props.projectState} runState={props.runState} resultState={props.resultState} setup={props.setup} availability={props.availability} onOpenProject={props.onOpenProject} onNavigate={props.onNavigate} semanticSnapshot={props.semanticSnapshot} semanticStatus={props.semanticStatus} semanticIssue={props.semanticIssue} selectedSemanticObjectId={props.selectedSemanticObjectId} visualPreferences={props.visualPreferences} onVisualPreferencesChange={props.onVisualPreferencesChange} onSelectSemantic={props.onSelectSemantic} geometryWorkbench={props.geometryWorkbench} geometryVisionDraft={props.geometryVisionDraft} attachmentState={props.attachmentState} onAttachmentImport={props.onAttachmentImport} onAttachmentsImported={props.onAttachmentsImported} onAttachmentSelect={props.onAttachmentSelect} onOpenAssistant={props.onOpenAssistant} onReviewSketchpadProjection={props.onReviewSketchpadProjection} />
            ) : props.destination === "run" ? (
              <RunPage projectState={props.projectState} runState={props.runState} resultState={props.resultState} setup={props.setup} availability={props.availability} onOpenProject={props.onOpenProject} onRunProject={props.onRunProject} onLoadLatestResults={props.onLoadLatestResults} onNavigate={props.onNavigate} />
            ) : props.destination === "results" ? (
              <ResultsPage projectState={props.projectState} runState={props.runState} resultState={props.resultState} resultDatasetState={props.resultDatasetState} resultExportState={props.resultExportState} activeRunId={props.activeRunId} theme={props.theme} availability={props.availability} onOpenProject={props.onOpenProject} onLoadLatestResults={props.onLoadLatestResults} onSelectManifestResults={props.onSelectManifestResults} onExportResults={props.onExportResults} onLoadResultDataset={props.onLoadResultDataset} onCancelResultDataset={props.onCancelResultDataset} onResultMetricChange={props.onResultMetricChange} onResultTimeChange={props.onResultTimeChange} onResultZonesChange={props.onResultZonesChange} onNavigate={props.onNavigate} semanticSnapshot={props.semanticSnapshot} selectedSemanticObjectId={props.selectedSemanticObjectId} visualPreferences={props.visualPreferences} onVisualPreferencesChange={props.onVisualPreferencesChange} onSelectSemantic={props.onSelectSemantic} />
            ) : props.destination === "studies" ? (
              <ResearchPage projectState={props.projectState} projectSessionId={props.projectSessionId} revisionId={props.revisionId} semanticSnapshot={props.semanticSnapshot} theme={props.theme} onNotice={props.onNotice} onNavigate={props.onNavigate} />
            ) : props.destination === "settings" ? (
              <SettingsPage language={props.language} theme={props.theme} aiState={props.aiState} setup={props.setup} setupBusy={props.setupBusy} storageUsage={props.storageUsage} onOpenAssistant={props.onOpenAssistant} onAiConnect={props.onAiConnect} onAiRefresh={props.onAiRefresh} onAiProviderSelect={props.onAiProviderSelect} onAiProviderTest={props.onAiProviderTest} onAiProviderRefreshModels={props.onAiProviderRefreshModels} onAiProviderSave={props.onAiProviderSave} onAiProviderDelete={props.onAiProviderDelete} onAiCodexDeviceLogin={props.onAiCodexDeviceLogin} onAiCodexApiKeyLogin={props.onAiCodexApiKeyLogin} onAiCodexCancelLogin={props.onAiCodexCancelLogin} onAiCodexLogout={props.onAiCodexLogout} onAiProviderSecret={props.onAiProviderSecret} onAiProviderClearSecret={props.onAiProviderClearSecret} onAiModelChange={props.onAiModelChange} onSettingsReset={props.onSettingsReset} onChooseDataDirectory={props.onChooseDataDirectory} onProbeTool={props.onProbeTool} onSaveDataDirectory={props.onSaveDataDirectory} onOpenStudioDirectory={props.onOpenStudioDirectory} onClearStudioCache={props.onClearStudioCache} onCopyDiagnostics={props.onCopyDiagnostics} onExportDiagnostics={props.onExportDiagnostics} />
            ) : (
              fallback
            )}
          </Suspense>
        </ErrorBoundary>
      </div>
    </main>
  );
}
