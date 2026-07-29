import {
  Activity,
  FolderOpen,
  HardDrive,
  Home,
  PanelBottomClose,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../app/command-availability";
import type { ProjectState } from "../../app/project-state";
import { projectFileName } from "../../app/project-state";
import type { ResultState } from "../../app/result-state";
import type { ResultExportState } from "../../app/result-export-state";
import type { AppLanguage, AppTheme } from "../../app/workbench-state";
import { ZoneAirStateResults } from "./ZoneAirStateResults";
import { DestinationPage } from "./DestinationPage";
import type { WorkbenchDestination } from "../../app/workbench-state";
import type { SemanticSnapshot } from "../../app/semantic-state";
import type { StorageUsageView, StudioSetup, ToolKind } from "../../app/release-state";

interface WelcomePageProps {
  destination?: WorkbenchDestination;
  projectState: ProjectState;
  contextCollapsed: boolean;
  bottomCollapsed: boolean;
  onToggleContext: () => void;
  onToggleBottom: () => void;
  onNewProject?: () => void;
  onOpenProject: () => void;
  availability?: Pick<CommandAvailability, "newProject" | "openProject" | "loadActiveResult" | "selectManifest" | "exportResult">;
  resultState: ResultState;
  resultExportState: ResultExportState;
  activeRunId: string | null;
  theme: AppTheme;
  language?: AppLanguage;
  onLoadLatestResults: () => void;
  onSelectManifestResults: () => void;
  onExportResults: () => void;
  onSelectZone?: (zoneId: string) => void;
  onRunProject?: () => void;
  onSettingsReset?: () => void;
  projectSessionId?: string | null;
  revisionId?: string | null;
  semanticSnapshot?: SemanticSnapshot | null;
  onNotice?: (message: string) => void;
  setup?: StudioSetup | null;
  setupBusy?: boolean;
  onChooseDataDirectory?: () => Promise<string | null>;
  onProbeTool?: (kind: ToolKind) => Promise<import("../../app/release-state").ToolState | null>;
  onSaveSetup?: (dataDirectory: string, contamxPath: string | null, simreadPath: string | null) => Promise<void>;
  onOpenStudioDirectory?: (kind: "data" | "app-data" | "logs" | "cache") => Promise<void>;
  onClearStudioCache?: () => Promise<void>;
  storageUsage?: StorageUsageView | null;
  onCopyDiagnostics?: () => Promise<void>;
  onExportDiagnostics?: () => Promise<void>;
}

export function WelcomePage({
  destination = "project",
  projectState,
  contextCollapsed,
  bottomCollapsed,
  onToggleContext,
  onToggleBottom,
  onOpenProject,
  availability = { newProject: true, openProject: true, loadActiveResult: true, selectManifest: true, exportResult: true },
  resultState,
  resultExportState,
  activeRunId,
  theme,
  language = "zh-CN",
  onLoadLatestResults,
  onSelectManifestResults,
  onExportResults,
  onSelectZone = () => undefined,
  onRunProject = () => undefined,
  onSettingsReset = () => undefined,
  projectSessionId = null,
  revisionId = null,
  semanticSnapshot = null,
  onNotice = () => undefined,
  setup = null,
  setupBusy = false,
  onChooseDataDirectory = async () => null,
  onProbeTool = async () => null,
  onSaveSetup = async () => undefined,
  onOpenStudioDirectory = async () => undefined,
  onClearStudioCache = async () => undefined,
  storageUsage = null,
  onCopyDiagnostics = async () => undefined,
  onExportDiagnostics = async () => undefined,
}: WelcomePageProps) {
  const { t } = useTranslation();
  const project = projectState.project;

  return (
    <main className="editor-surface">
      <div className="editor-tabs">
        <div className="editor-tab is-active">
          {project ? <Activity size={14} aria-hidden="true" /> : <Home size={14} aria-hidden="true" />}
          <span>{destination === "project" ? (project ? t("results.tab") : t("welcome.tab")) : t(`navigation.${destination}`)}</span>
        </div>
        <div className="editor-layout-actions">
          <button
            className="panel-icon-button"
            type="button"
            title={contextCollapsed ? t("inspector.expand") : t("inspector.collapse")}
            aria-label={contextCollapsed ? t("inspector.expand") : t("inspector.collapse")}
            onClick={onToggleContext}
          >
            {contextCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
          <button
            className="panel-icon-button"
            type="button"
            title={bottomCollapsed ? t("panel.expand") : t("panel.collapse")}
            aria-label={bottomCollapsed ? t("panel.expand") : t("panel.collapse")}
            onClick={onToggleBottom}
          >
            {bottomCollapsed ? <PanelBottomOpen size={16} /> : <PanelBottomClose size={16} />}
          </button>
        </div>
      </div>

      <div className="welcome-scroll">
        {destination !== "project" ? (
          <DestinationPage
            destination={destination}
            projectState={projectState}
            resultState={resultState}
            resultExportState={resultExportState}
            activeRunId={activeRunId}
            theme={theme}
            language={language}
            onOpenProject={onOpenProject}
            onRunProject={onRunProject}
            onSelectZone={onSelectZone}
            onLoadLatestResults={onLoadLatestResults}
            onSelectManifestResults={onSelectManifestResults}
            onExportResults={onExportResults}
            onSettingsReset={onSettingsReset}
            availability={availability}
            projectSessionId={projectSessionId}
            revisionId={revisionId}
            semanticSnapshot={semanticSnapshot}
            onNotice={onNotice}
            setup={setup}
            setupBusy={setupBusy}
            onChooseDataDirectory={onChooseDataDirectory}
            onProbeTool={onProbeTool}
            onSaveSetup={onSaveSetup}
            onOpenStudioDirectory={onOpenStudioDirectory}
            onClearStudioCache={onClearStudioCache}
            storageUsage={storageUsage}
            onCopyDiagnostics={onCopyDiagnostics}
            onExportDiagnostics={onExportDiagnostics}
          />
        ) : project ? (
          <div className="project-summary">
            <header className="project-summary-header">
              <div>
                <span>{t("project.summaryEyebrow")}</span>
                <h1>{projectFileName(project.source_path)}</h1>
              </div>
              <div className="summary-badges">
                <span className="readonly-badge">{t("project.readOnly")}</span>
                <span className="version-badge">ContamW {project.header_version}</span>
              </div>
            </header>

            {projectState.status === "selecting" || projectState.status === "loading" ? (
              <div className="loading-banner" role="status">
                <span className="loading-indicator" aria-hidden="true" />
                {t(`project.status.${projectState.status}`)}
              </div>
            ) : null}

            <section className="summary-grid" aria-label={t("project.summary") }>
              <div><span>{t("project.headerVersion")}</span><strong>{project.header_version}</strong></div>
              <div><span>{t("project.zoneCount")}</span><strong>{project.declared_zone_count}</strong></div>
              <div><span>{t("project.sourceSize")}</span><strong>{t("project.bytes", { value: project.source_size_bytes })}</strong></div>
              <div><span>{t("project.hash")}</span><strong><code>{project.source_sha256.slice(0, 12)}…</code></strong></div>
              <div className="summary-wide"><span>{t("project.readerMode")}</span><strong><code>{project.reader_mode}</code></strong></div>
            </section>

            <details className="source-path-details">
              <summary>{t("project.showSourcePath")}</summary>
              <code>{project.source_path}</code>
            </details>

            <section className="subset-notice">
              <ShieldCheck size={20} aria-hidden="true" />
              <div>
                <strong>{t("project.strictSubset")}</strong>
                <p>{t("project.strictSubsetBody")}</p>
                {project.diagnostics.map((diagnostic) => (
                  <p key={diagnostic.code}>{t(`diagnostics.${diagnostic.code}`)}</p>
                ))}
              </div>
            </section>

            <div className="project-summary-actions">
              <button className="secondary-action" type="button" disabled={!availability.openProject} onClick={onOpenProject}>
                <FolderOpen size={17} />
                <span>{t("project.openAnother")}</span>
              </button>
            </div>
            <ZoneAirStateResults
              state={resultState}
              exportState={resultExportState}
              activeRunId={activeRunId}
              theme={theme}
              onLoadLatest={onLoadLatestResults}
              onSelectManifest={onSelectManifestResults}
              onExport={onExportResults}
              availability={availability}
            />
          </div>
        ) : (
        <div className="welcome-content">
          <section className="welcome-intro">
            <h1>{t("welcome.title")}</h1>
            <p>{t("welcome.tagline")}</p>
            <div className="welcome-actions">
              <button
                className="primary-action"
                type="button"
                disabled={!availability.openProject}
                onClick={onOpenProject}
              >
                <FolderOpen size={18} />
                <span>{t("welcome.openProject")}</span>
              </button>
            </div>
          </section>

          <section className="recent-section">
            <h2>{t("welcome.recent")}</h2>
            <div className="recent-empty">
              <FolderOpen size={28} strokeWidth={1.5} aria-hidden="true" />
              <div>
                <strong>{t("welcome.recentEmpty")}</strong>
                <p>{t("welcome.recentHint")}</p>
              </div>
            </div>
          </section>

          {projectState.status === "selecting" || projectState.status === "loading" ? (
            <div className="loading-banner" role="status">
              <span className="loading-indicator" aria-hidden="true" />
              {t(`project.status.${projectState.status}`)}
            </div>
          ) : null}

          {projectState.status === "cancelled" ? (
            <p className="cancelled-note" role="status">{t("project.cancelledHint")}</p>
          ) : null}

          <section className="safety-notes">
            <div className="safety-note">
              <HardDrive size={19} aria-hidden="true" />
              <div>
                <strong>{t("welcome.offlineTitle")}</strong>
                <p>{t("welcome.offlineBody")}</p>
              </div>
            </div>
            <div className="safety-note">
              <ShieldCheck size={19} aria-hidden="true" />
              <div>
                <strong>{t("welcome.protectionTitle")}</strong>
                <p>{t("welcome.protectionBody")}</p>
              </div>
            </div>
          </section>
        </div>
        )}
      </div>
    </main>
  );
}
