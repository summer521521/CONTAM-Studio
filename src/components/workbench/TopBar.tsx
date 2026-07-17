import {
  FolderOpen,
  Moon,
  Play,
  Plus,
  Save,
  Settings,
  Sun,
  Wind,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppLanguage, AppTheme } from "../../app/workbench-state";

interface TopBarProps {
  language: AppLanguage;
  theme: AppTheme;
  onLanguageChange: (language: AppLanguage) => void;
  onThemeToggle: () => void;
  onPlaceholder: (action: string) => void;
}

export function TopBar({
  language,
  theme,
  onLanguageChange,
  onThemeToggle,
  onPlaceholder,
}: TopBarProps) {
  const { t } = useTranslation();
  const actions = [
    { key: "newProject", icon: Plus },
    { key: "openProject", icon: FolderOpen },
    { key: "save", icon: Save },
    { key: "run", icon: Play },
  ] as const;

  return (
    <header className="top-bar">
      <div className="brand" aria-label={t("app.name")}>
        <span className="brand-mark" aria-hidden="true">
          <Wind size={18} />
        </span>
        <span className="brand-name">{t("app.name")}</span>
      </div>

      <div className="toolbar-actions" role="toolbar" aria-label={t("app.name")}>
        {actions.map(({ key, icon: Icon }) => (
          <button
            className={`tool-button ${key === "run" ? "tool-button-run" : ""}`}
            key={key}
            type="button"
            onClick={() => onPlaceholder(t(`toolbar.${key}`))}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{t(`toolbar.${key}`)}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-spacer" />
      <span className="phase-label">{t("app.phase")}</span>
      <label className="language-control">
        <span className="sr-only">{t("toolbar.language")}</span>
        <select
          aria-label={t("toolbar.language")}
          value={language}
          onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}
        >
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <button
        className="icon-button"
        type="button"
        title={`${t("toolbar.theme")}: ${t(`toolbar.${theme}`)}`}
        aria-label={`${t("toolbar.theme")}: ${t(`toolbar.${theme}`)}`}
        onClick={onThemeToggle}
      >
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      </button>
      <button
        className="icon-button"
        type="button"
        title={t("toolbar.settings")}
        aria-label={t("toolbar.settings")}
        onClick={() => onPlaceholder(t("toolbar.settings"))}
      >
        <Settings size={17} />
      </button>
    </header>
  );
}
