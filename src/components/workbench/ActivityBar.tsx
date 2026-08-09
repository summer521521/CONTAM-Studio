import { BarChart3, FlaskConical, FolderTree, Play, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { projectActivityAction, type WorkbenchDestination } from "../../app/workbench-state";

interface ActivityBarProps {
  projectCollapsed: boolean;
  activeDestination?: WorkbenchDestination;
  navigationAvailable?: boolean;
  onToggleProject: () => void;
  onNavigate: (destination: WorkbenchDestination) => void;
}

export function ActivityBar({
  projectCollapsed,
  activeDestination = "project",
  navigationAvailable = true,
  onToggleProject,
  onNavigate,
}: ActivityBarProps) {
  const { t } = useTranslation();
  const items: Array<{
    key: "projects" | "run" | "results" | "studies";
    icon: LucideIcon;
    onClick?: () => void;
  }> = [
    {
      key: "projects",
      icon: FolderTree,
      onClick: () => {
        if (projectActivityAction(activeDestination) === "navigate") onNavigate("project");
        else onToggleProject();
      },
    },
    { key: "run", icon: Play },
    { key: "results", icon: BarChart3 },
    { key: "studies", icon: FlaskConical },
  ];

  return (
    <nav className="activity-bar" aria-label={t("navigation.projects")}>
      {items.map(({ key, icon: Icon, onClick }) => (
        <button
          className={`activity-button ${
            key === "projects"
              ? activeDestination === "project" && !projectCollapsed ? "is-active" : ""
              : activeDestination === key ? "is-active" : ""
          }`}
          type="button"
          key={key}
          disabled={!navigationAvailable}
          title={t(`navigation.${key}`)}
          aria-label={t(`navigation.${key}`)}
          aria-current={activeDestination === (key === "projects" ? "project" : key) ? "page" : undefined}
          onClick={onClick ?? (() => onNavigate(key === "projects" ? "project" : key))}
        >
          <Icon size={21} strokeWidth={1.8} />
        </button>
      ))}
      <div className="activity-spacer" />
      <button
        className="activity-button activity-utility"
        type="button"
        title={t("navigation.settings")}
        aria-label={t("navigation.settings")}
        aria-current={activeDestination === "settings" ? "page" : undefined}
        disabled={!navigationAvailable}
        onClick={() => onNavigate("settings")}
      >
        <Settings size={19} strokeWidth={1.8} />
      </button>
    </nav>
  );
}
