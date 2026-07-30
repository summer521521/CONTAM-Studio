import { BarChart3, Bot, Database, FileSearch, HardDrive, Palette, Play, RotateCcw, Search, Settings2, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../app/command-availability";
import type { ProjectState } from "../../app/project-state";
import type { ResultState } from "../../app/result-state";
import type { ResultExportState } from "../../app/result-export-state";
import type { AppLanguage, AppTheme, WorkbenchDestination } from "../../app/workbench-state";
import type { SemanticSnapshot } from "../../app/semantic-state";
import type { StorageUsageView, StudioSetup, ToolKind } from "../../app/release-state";
import { ZoneAirStateResults } from "./ZoneAirStateResults";
import { StudyWorkspace } from "./StudyWorkspace";
import { ReleaseSettings } from "./ReleaseSettings";

interface DestinationPageProps {
  destination: Exclude<WorkbenchDestination, "project">;
  projectState: ProjectState;
  resultState: ResultState;
  resultExportState: ResultExportState;
  activeRunId: string | null;
  theme: AppTheme;
  language?: AppLanguage;
  availability: Pick<CommandAvailability, "openProject" | "loadActiveResult" | "selectManifest" | "exportResult"> & { runProject?: boolean };
  onOpenProject: () => void;
  onRunProject: () => void;
  onSelectZone: (zoneId: string) => void;
  onLoadLatestResults: () => void;
  onSelectManifestResults: () => void;
  onExportResults: () => void;
  onSettingsReset: () => void;
  projectSessionId?: string | null;
  revisionId?: string | null;
  semanticSnapshot?: SemanticSnapshot | null;
  onNotice?: (message: string) => void;
  onOpenAssistant?: () => void;
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

export function DestinationPage({
  destination,
  projectState,
  resultState,
  resultExportState,
  activeRunId,
  theme,
  language = "zh-CN",
  availability,
  onOpenProject,
  onRunProject,
  onSelectZone,
  onLoadLatestResults,
  onSelectManifestResults,
  onExportResults,
  onSettingsReset,
  projectSessionId = null,
  revisionId = null,
  semanticSnapshot = null,
  onNotice,
  onOpenAssistant,
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
}: DestinationPageProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const project = projectState.project;
  const filteredZones = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return project?.zones.filter((zone) => !normalized || `${zone.name} ${zone.contam_number}`.toLocaleLowerCase().includes(normalized)) ?? [];
  }, [project, query]);

  if (destination === "results") {
    return (
      <section className="destination-page" aria-labelledby="destination-title">
        <header className="destination-header">
          <BarChart3 size={22} aria-hidden="true" />
          <div><span>{t("navigation.results")}</span><h1 id="destination-title">{t("results.destinationTitle")}</h1></div>
        </header>
        {project ? (
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
        ) : <EmptyDestination onOpenProject={onOpenProject} availability={availability} />}
      </section>
    );
  }

  if (destination === "search") {
    return (
      <section className="destination-page" aria-labelledby="destination-title">
        <header className="destination-header">
          <Search size={22} aria-hidden="true" />
          <div><span>{t("navigation.search")}</span><h1 id="destination-title">{t("search.destinationTitle")}</h1></div>
        </header>
        {project ? (
          <>
            <label className="destination-search"><Search size={16} aria-hidden="true" /><span className="sr-only">{t("search.inputLabel")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.inputPlaceholder")} /></label>
            <ul className="destination-results" aria-label={t("search.resultLabel")}>
              {filteredZones.map((zone) => <li key={zone.zone_id}><button type="button" onClick={() => onSelectZone(zone.zone_id)}><span>{zone.name}</span><code>#{zone.contam_number}</code></button></li>)}
              {filteredZones.length === 0 ? <li className="destination-empty">{t("search.noResults")}</li> : null}
            </ul>
          </>
        ) : <EmptyDestination onOpenProject={onOpenProject} availability={availability} />}
      </section>
    );
  }

  if (destination === "run") {
    return (
      <section className="destination-page" aria-labelledby="destination-title">
        <header className="destination-header"><Play size={22} aria-hidden="true" /><div><span>{t("navigation.run")}</span><h1 id="destination-title">{t("run.destinationTitle")}</h1></div></header>
        {project ? <section className="destination-section"><p>{t("run.readinessBody")}</p><button className="primary-action" type="button" disabled={availability.runProject === false} onClick={onRunProject}><Play size={16} />{t("toolbar.run")}</button></section> : <EmptyDestination onOpenProject={onOpenProject} availability={availability} />}
      </section>
    );
  }

  if (destination === "studies") {
    return <StudyWorkspace project={project} projectSessionId={projectSessionId} revisionId={revisionId} semanticSnapshot={semanticSnapshot} theme={theme} onNotice={onNotice} />;
  }

  return (
    <section className="destination-page" aria-labelledby="destination-title">
      <header className="destination-header"><Settings2 size={22} aria-hidden="true" /><div><span>{t("toolbar.settings")}</span><h1 id="destination-title">{t("settings.destinationTitle")}</h1></div></header>
      <section className="destination-section settings-overview" aria-label={t("settings.categoriesLabel")}>
        <SettingsCategory icon={Palette} title={t("settings.appearanceTitle")} status={t("settings.appearanceStatus")} action={t("settings.appearanceAction")} onAction={() => onNotice?.(t("settings.appearanceActionHint"))} />
        <SettingsCategory icon={Bot} title={t("settings.aiTitle")} status={t("settings.aiStatus")} action={t("settings.aiAction")} onAction={onOpenAssistant ?? (() => onNotice?.(t("settings.aiActionHint")))} />
        <SettingsCategory icon={Wrench} title={t("settings.simulationTitle")} status={setup?.contamx.status === "available" ? t("settings.simulationReady") : t("settings.simulationCheck")} action={t("settings.simulationAction")} onAction={() => onNotice?.(t("settings.simulationActionHint"))} />
        <SettingsCategory icon={Database} title={t("settings.dataTitle")} status={t("settings.dataStatus")} action={t("settings.dataAction")} onAction={() => onOpenStudioDirectory("app-data")} />
        <SettingsCategory icon={HardDrive} title={t("settings.diagnosticsTitle")} status={t("settings.diagnosticsStatus")} action={t("settings.diagnosticsAction")} onAction={() => onNotice?.(t("settings.diagnosticsActionHint"))} />
      </section>
      <section className="destination-section settings-controls">
        <ReleaseSettings
          setup={setup}
          language={language}
          theme={theme}
          busy={setupBusy}
          onChooseDataDirectory={onChooseDataDirectory}
          onProbeTool={onProbeTool}
          onSave={onSaveSetup}
          onOpenDirectory={onOpenStudioDirectory}
          onClearCache={onClearStudioCache}
          storageUsage={storageUsage}
          onCopyDiagnostics={onCopyDiagnostics}
          onExportDiagnostics={onExportDiagnostics}
        />
        <button className="secondary-action" type="button" onClick={onSettingsReset}><RotateCcw size={16} />{t("settings.resetLayout")}</button>
      </section>
    </section>
  );
}

function SettingsCategory({
  icon: Icon,
  title,
  status,
  action,
  onAction,
}: {
  icon: typeof Palette;
  title: string;
  status: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <article className="settings-category">
      <div className="settings-category-icon"><Icon size={19} aria-hidden="true" /></div>
      <div className="settings-category-copy">
        <h2>{title}</h2>
        <p>{status}</p>
      </div>
      <button type="button" className="secondary-action compact-action" onClick={onAction}>{action}</button>
    </article>
  );
}

function EmptyDestination({ onOpenProject, availability }: Pick<DestinationPageProps, "onOpenProject" | "availability">) {
  const { t } = useTranslation();
  return <div className="destination-empty-state"><FileSearch size={30} strokeWidth={1.5} aria-hidden="true" /><strong>{t("navigation.noProjectTitle")}</strong><p>{t("navigation.noProjectBody")}</p><button className="primary-action" type="button" disabled={!availability.openProject} onClick={onOpenProject}>{t("welcome.openProject")}</button></div>;
}
