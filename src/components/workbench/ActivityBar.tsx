import { BarChart3, FlaskConical, FolderTree, Play, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkbenchDestination } from "../../app/workbench-state";

interface ActivityBarProps {
  projectCollapsed: boolean;
  activeDestination?: WorkbenchDestination;
  navigationAvailable?: boolean;
  onToggleProject: () => void;
  onNavigate: (destination: Exclude<WorkbenchDestination, "settings">) => void;
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
    key: "projects" | "search" | "run" | "results" | "studies";
    icon: LucideIcon;
    onClick?: () => void;
  }> = [
    { key: "projects", icon: FolderTree, onClick: onToggleProject },
    { key: "search", icon: Search },
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
          aria-pressed={key === "projects" ? !projectCollapsed : undefined}
          onClick={onClick ?? (() => onNavigate(key === "projects" ? "project" : key))}
        >
          <Icon size={21} strokeWidth={1.8} />
        </button>
      ))}
    </nav>
  );
}
