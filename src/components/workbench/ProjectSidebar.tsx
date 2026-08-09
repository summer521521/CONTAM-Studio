import { Building2, ChevronDown, Clock3, DoorOpen, FolderTree, PanelLeftClose, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../app/command-availability";
import type { ProjectState, ZoneRecord } from "../../app/project-state";
import { projectFileName, zoneSelectionKey } from "../../app/project-state";
import type { SemanticState } from "../../app/semantic-state";
import { SemanticProjectTree } from "./SemanticProjectTree";

interface ProjectSidebarProps {
  projectState: ProjectState;
  selectedZoneKey: string | null;
  availability?: Pick<CommandAvailability, "zoneSelect"> & { navigation?: boolean };
  onSelectZone: (zone: ZoneRecord) => void;
  onCollapse: () => void;
  semanticState?: SemanticState;
  onSelectSemantic?: (objectId: string, additive?: boolean) => void;
}

interface TreeRowProps {
  icon: typeof FolderTree;
  label: string;
  level?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function filterProjectZones(zones: ZoneRecord[], query: string): ZoneRecord[] {
  const normalized = query.trim().toLocaleLowerCase();
  return zones.filter((zone) => !normalized || `${zone.name} ${zone.contam_number}`.toLocaleLowerCase().includes(normalized));
}

function TreeRow({ icon: Icon, label, level = 0, selected, disabled = false, onClick }: TreeRowProps) {
  return (
    <li>
      <button
        className={`tree-row ${selected ? "is-selected" : ""}`}
        style={{ paddingInlineStart: `${10 + level * 18}px` }}
        type="button"
        disabled={disabled}
        onClick={onClick}
      >
        <Icon size={15} aria-hidden="true" />
        <span>{label}</span>
      </button>
    </li>
  );
}

export function ProjectSidebar({
  projectState,
  selectedZoneKey,
  availability = { zoneSelect: true, navigation: true },
  onSelectZone,
  onCollapse,
  semanticState,
  onSelectSemantic = () => undefined,
}: ProjectSidebarProps) {
  const { t } = useTranslation();
  const project = projectState.project;
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredZones = useMemo(() => filterProjectZones(project?.zones ?? [], query), [project, query]);

  useEffect(() => {
    const focusSearch = () => searchRef.current?.focus();
    window.addEventListener("contam-studio:focus-object-search", focusSearch);
    return () => window.removeEventListener("contam-studio:focus-object-search", focusSearch);
  }, []);

  useEffect(() => {
    setQuery("");
  }, [project?.source_sha256]);

  return (
    <aside className="project-sidebar">
      <div className="panel-heading">
        <FolderTree size={16} aria-hidden="true" />
        <strong>{t("navigation.projectTitle")}</strong>
        <button
          className="panel-icon-button"
          type="button"
          title={t("navigation.collapse")}
          aria-label={t("navigation.collapse")}
          disabled={availability.navigation === false}
          onClick={onCollapse}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      {project ? (
        <div className="readonly-strip">
          <span className="readonly-dot" aria-hidden="true" />
          {t("project.readOnlyPreview")}
        </div>
      ) : null}
      <div className="tree-scroll">
        {project ? (
          <>
            <label className="object-search">
              <Search size={14} aria-hidden="true" />
              <span className="sr-only">{t("search.inputLabel")}</span>
              <input
                type="search"
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search.inputPlaceholder")}
                aria-label={t("search.inputLabel")}
              />
              {query ? (
                <button type="button" className="object-search-clear" onClick={() => setQuery("")} aria-label={t("search.clear")}>
                  <X size={13} />
                </button>
              ) : null}
            </label>
            <div className="tree-root">
              <ChevronDown size={14} aria-hidden="true" />
              <Building2 size={16} aria-hidden="true" />
              <strong>{projectFileName(project.source_path)}</strong>
            </div>
            <ul className="project-tree">
              <TreeRow
                icon={DoorOpen}
                label={t("navigation.zoneCount", { count: project.zones.length })}
              />
              {filteredZones.map((zone) => {
                const key = zoneSelectionKey(project, zone);
                return (
                  <TreeRow
                    icon={DoorOpen}
                    key={key}
                    label={t("navigation.zoneLabel", {
                      name: zone.name,
                      number: zone.contam_number,
                    })}
                    level={1}
                    selected={selectedZoneKey === key}
                    disabled={!availability.zoneSelect}
                    onClick={() => onSelectZone(zone)}
                  />
                );
              })}
            </ul>
            {project.zones.length === 0 ? (
              <p className="tree-empty">{t("navigation.noZones")}</p>
            ) : filteredZones.length === 0 ? (
              <p className="tree-empty">{t("search.noResults")}</p>
            ) : null}
            <SemanticProjectTree snapshot={semanticState?.snapshot ?? null} selectedObjectId={semanticState?.selectedObjectId ?? null} selectedObjectIds={semanticState?.selectedObjectIds ?? []} onSelect={(node, additive) => { const id = node.object_id ?? node.zone_id ?? node.level_id ?? node.path_id ?? node.species_id ?? node.source_id; if (id) onSelectSemantic(id, additive); }} />
          </>
        ) : projectState.status === "selecting" || projectState.status === "loading" ? (
          <div className="tree-loading" role="status">
            <span className="loading-indicator" aria-hidden="true" />
            {t(`project.status.${projectState.status}`)}
          </div>
        ) : (
          <div className="tree-empty-state">
            <FolderTree size={24} strokeWidth={1.5} aria-hidden="true" />
            <strong>{t("navigation.noProjectTitle")}</strong>
            <p>{t("navigation.noProjectBody")}</p>
          </div>
        )}
      </div>
      <div className="project-sidebar-footer">
        <Clock3 size={14} aria-hidden="true" />
        <span>{project ? t("navigation.zoneCount", { count: project.zones.length }) : t("navigation.noProjectFooter")}</span>
      </div>
    </aside>
  );
}
