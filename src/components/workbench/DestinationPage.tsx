import { BarChart3, FileSearch, Play, RotateCcw, Search, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../app/command-availability";
import type { ProjectState } from "../../app/project-state";
import type { ResultState } from "../../app/result-state";
import type { ResultExportState } from "../../app/result-export-state";
import type { AppTheme, WorkbenchDestination } from "../../app/workbench-state";
import { ZoneAirStateResults } from "./ZoneAirStateResults";

interface DestinationPageProps {
  destination: Exclude<WorkbenchDestination, "project">;
  projectState: ProjectState;
  resultState: ResultState;
  resultExportState: ResultExportState;
  activeRunId: string | null;
  theme: AppTheme;
  availability: Pick<CommandAvailability, "openProject" | "loadActiveResult" | "selectManifest" | "exportResult"> & { runProject?: boolean };
  onOpenProject: () => void;
  onRunProject: () => void;
  onSelectZone: (zoneId: string) => void;
  onLoadLatestResults: () => void;
  onSelectManifestResults: () => void;
  onExportResults: () => void;
  onSettingsReset: () => void;
}

export function DestinationPage({
  destination,
  projectState,
  resultState,
  resultExportState,
  activeRunId,
  theme,
  availability,
  onOpenProject,
  onRunProject,
  onSelectZone,
  onLoadLatestResults,
  onSelectManifestResults,
  onExportResults,
  onSettingsReset,
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

  return (
    <section className="destination-page" aria-labelledby="destination-title">
      <header className="destination-header"><Settings2 size={22} aria-hidden="true" /><div><span>{t("toolbar.settings")}</span><h1 id="destination-title">{t("settings.destinationTitle")}</h1></div></header>
      <section className="destination-section settings-list">
        <div><strong>{t("settings.languageTitle")}</strong><p>{t("settings.languageBody")}</p></div>
        <div><strong>{t("settings.privacyTitle")}</strong><p>{t("settings.privacyBody")}</p></div>
        <div><strong>{t("settings.storageTitle")}</strong><p>{t("settings.storageBody")}</p></div>
        <button className="secondary-action" type="button" onClick={onSettingsReset}><RotateCcw size={16} />{t("settings.resetLayout")}</button>
      </section>
    </section>
  );
}

function EmptyDestination({ onOpenProject, availability }: Pick<DestinationPageProps, "onOpenProject" | "availability">) {
  const { t } = useTranslation();
  return <div className="destination-empty-state"><FileSearch size={30} strokeWidth={1.5} aria-hidden="true" /><strong>{t("navigation.noProjectTitle")}</strong><p>{t("navigation.noProjectBody")}</p><button className="primary-action" type="button" disabled={!availability.openProject} onClick={onOpenProject}>{t("welcome.openProject")}</button></div>;
}
