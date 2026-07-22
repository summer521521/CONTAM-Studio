import {
  Beaker,
  Building2,
  CalendarClock,
  ChevronDown,
  Clock3,
  DoorOpen,
  FolderTree,
  GitBranch,
  History,
  Layers3,
  PanelLeftClose,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../app/command-availability";
import type { ProjectState, ZoneRecord } from "../../app/project-state";
import { projectFileName, zoneSelectionKey } from "../../app/project-state";

interface ProjectSidebarProps {
  projectState: ProjectState;
  selectedObject: string;
  selectedZoneKey: string | null;
  availability?: Pick<CommandAvailability, "zoneSelect">;
  onSelectObject: (translationKey: string) => void;
  onSelectZone: (zone: ZoneRecord) => void;
  onCollapse: () => void;
}

interface TreeRowProps {
  icon: typeof FolderTree;
  label: string;
  level?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
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
  selectedObject,
  selectedZoneKey,
  availability = { zoneSelect: true },
  onSelectObject,
  onSelectZone,
  onCollapse,
}: ProjectSidebarProps) {
  const { t } = useTranslation();
  const project = projectState.project;

  return (
    <aside className="project-sidebar">
      <div className="panel-heading">
        <FolderTree size={16} aria-hidden="true" />
        <strong>{t(project ? "navigation.projectTitle" : "navigation.mockProjectTitle")}</strong>
        <button
          className="panel-icon-button"
          type="button"
          title={t("navigation.collapse")}
          aria-label={t("navigation.collapse")}
          onClick={onCollapse}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className={project ? "readonly-strip" : "mock-strip"}>
        <span className={project ? "readonly-dot" : "mock-dot"} aria-hidden="true" />
        {t(project ? "project.readOnlyPreview" : "navigation.mockLabel")}
      </div>
      <div className="tree-scroll">
        {project ? (
          <>
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
              {project.zones.map((zone) => {
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
            ) : null}
          </>
        ) : projectState.status === "selecting" || projectState.status === "loading" ? (
          <div className="tree-loading" role="status">
            <span className="loading-indicator" aria-hidden="true" />
            {t(`project.status.${projectState.status}`)}
          </div>
        ) : (
          <>
            <div className="tree-root">
              <ChevronDown size={14} aria-hidden="true" />
              <Building2 size={16} aria-hidden="true" />
              <strong>{t("navigation.sampleProject")}</strong>
            </div>
            <ul className="project-tree">
          <TreeRow icon={Layers3} label={t("navigation.floors")} />
          <TreeRow icon={Layers3} label={t("navigation.floor1")} level={1} />
          <TreeRow icon={Layers3} label={t("navigation.floor2")} level={1} />
          <TreeRow icon={DoorOpen} label={t("navigation.zones")} />
          <TreeRow
            icon={DoorOpen}
            label={t("navigation.classroom")}
            level={1}
            selected={selectedObject === "navigation.classroom"}
            onClick={() => onSelectObject("navigation.classroom")}
          />
          <TreeRow
            icon={DoorOpen}
            label={t("navigation.corridor")}
            level={1}
            selected={selectedObject === "navigation.corridor"}
            onClick={() => onSelectObject("navigation.corridor")}
          />
          <TreeRow icon={GitBranch} label={t("navigation.airflowPaths")} />
          <TreeRow icon={Beaker} label={t("navigation.contaminants")} />
          <TreeRow icon={CalendarClock} label={t("navigation.schedules")} />
          <TreeRow icon={History} label={t("navigation.runHistory")} />
            </ul>
          </>
        )}
      </div>
      <div className="project-sidebar-footer">
        <Clock3 size={14} aria-hidden="true" />
        <span>{t(project ? "project.strictSubset" : "app.phase")}</span>
      </div>
    </aside>
  );
}
