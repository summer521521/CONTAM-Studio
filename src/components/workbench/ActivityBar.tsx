import { BarChart3, FolderTree, Play, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ActivityBarProps {
  projectCollapsed: boolean;
  onToggleProject: () => void;
  onPlaceholder: (action: string) => void;
}

export function ActivityBar({
  projectCollapsed,
  onToggleProject,
  onPlaceholder,
}: ActivityBarProps) {
  const { t } = useTranslation();
  const items: Array<{
    key: "projects" | "search" | "run" | "results";
    icon: LucideIcon;
    onClick?: () => void;
  }> = [
    { key: "projects", icon: FolderTree, onClick: onToggleProject },
    { key: "search", icon: Search },
    { key: "run", icon: Play },
    { key: "results", icon: BarChart3 },
  ];

  return (
    <nav className="activity-bar" aria-label={t("navigation.projects")}>
      {items.map(({ key, icon: Icon, onClick }) => (
        <button
          className={`activity-button ${key === "projects" && !projectCollapsed ? "is-active" : ""}`}
          type="button"
          key={key}
          title={t(`navigation.${key}`)}
          aria-label={t(`navigation.${key}`)}
          aria-pressed={key === "projects" ? !projectCollapsed : undefined}
          onClick={onClick ?? (() => onPlaceholder(t(`navigation.${key}`)))}
        >
          <Icon size={21} strokeWidth={1.8} />
        </button>
      ))}
    </nav>
  );
}
