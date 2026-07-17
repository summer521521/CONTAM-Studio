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

interface ProjectSidebarProps {
  selectedObject: string;
  onSelectObject: (translationKey: string) => void;
  onCollapse: () => void;
}

interface TreeRowProps {
  icon: typeof FolderTree;
  label: string;
  level?: number;
  selected?: boolean;
  onClick?: () => void;
}

function TreeRow({ icon: Icon, label, level = 0, selected, onClick }: TreeRowProps) {
  return (
    <li>
      <button
        className={`tree-row ${selected ? "is-selected" : ""}`}
        style={{ paddingInlineStart: `${10 + level * 18}px` }}
        type="button"
        onClick={onClick}
      >
        <Icon size={15} aria-hidden="true" />
        <span>{label}</span>
      </button>
    </li>
  );
}

export function ProjectSidebar({
  selectedObject,
  onSelectObject,
  onCollapse,
}: ProjectSidebarProps) {
  const { t } = useTranslation();

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
          onClick={onCollapse}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="mock-strip">
        <span className="mock-dot" aria-hidden="true" />
        {t("navigation.mockLabel")}
      </div>
      <div className="tree-scroll">
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
      </div>
      <div className="project-sidebar-footer">
        <Clock3 size={14} aria-hidden="true" />
        <span>{t("app.phase")}</span>
      </div>
    </aside>
  );
}
