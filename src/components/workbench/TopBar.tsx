import {
  FolderOpen,
  Moon,
  Play,
  Download,
  Settings,
  Sun,
  Undo2,
  Redo2,
  Wind,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../app/command-availability";
import type { AppLanguage, AppTheme } from "../../app/workbench-state";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

type TopBarAvailability = Pick<CommandAvailability, "newProject" | "openProject" | "runProject" | "undoDraft" | "redoDraft" | "exportDraft" | "language"> & { navigation?: boolean };

interface TopBarProps {
  language: AppLanguage;
  theme: AppTheme;
  onLanguageChange: (language: AppLanguage) => void;
  availability?: TopBarAvailability;
  onThemeToggle: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onRunProject: () => void;
  onUndoDraft: () => void;
  onRedoDraft: () => void;
  onExportDraft: () => void;
  onPlaceholder?: (action: string) => void;
  onSettings?: () => void;
}

export function TopBar({
  language,
  theme,
  onLanguageChange,
  availability = { newProject: true, openProject: true, runProject: true, undoDraft: true, redoDraft: true, exportDraft: true, language: true, navigation: true },
  onThemeToggle,
  onOpenProject,
  onRunProject,
  onUndoDraft,
  onRedoDraft,
  onExportDraft,
  onPlaceholder,
  onSettings,
}: TopBarProps) {
  const { t } = useTranslation();
  const actions = [
    { key: "openProject", icon: FolderOpen, onClick: onOpenProject },
    { key: "run", icon: Play, onClick: onRunProject },
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
        {actions.map(({ key, icon: Icon, onClick }) => (
          <Button
            variant="tool"
            className={`tool-button ${key === "run" ? "tool-button-run" : ""}`}
            key={key}
            type="button"
            disabled={key === "openProject" ? !availability.openProject : !availability.runProject}
            title={key === "run" && !availability.runProject ? t("toolbar.runUnavailable") : undefined}
            aria-label={key === "run" && !availability.runProject ? `${t(`toolbar.${key}`)} · ${t("toolbar.runUnavailable")}` : t(`toolbar.${key}`)}
            onClick={onClick}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{t(`toolbar.${key}`)}</span>
          </Button>
        ))}
      </div>

      {(availability.undoDraft || availability.redoDraft || availability.exportDraft) ? (
        <div className="toolbar-actions draft-toolbar-actions" role="toolbar" aria-label={t("draft.toolbarLabel")}>
          <Button variant="tool" className="tool-button" disabled={!availability.undoDraft} onClick={onUndoDraft} title={t("draft.undo")} aria-label={t("draft.undo")}><Undo2 size={16} /><span>{t("draft.undo")}</span></Button>
          <Button variant="tool" className="tool-button" disabled={!availability.redoDraft} onClick={onRedoDraft} title={t("draft.redo")} aria-label={t("draft.redo")}><Redo2 size={16} /><span>{t("draft.redo")}</span></Button>
          <Button variant="tool" className="tool-button" disabled={!availability.exportDraft} onClick={onExportDraft} title={t("draft.export")} aria-label={t("draft.export")}><Download size={16} /><span>{t("draft.export")}</span></Button>
        </div>
      ) : null}

      <div className="toolbar-spacer" />
      <label className="language-control">
        <span className="sr-only">{t("toolbar.language")}</span>
        <select
          aria-label={t("toolbar.language")}
          value={language}
          disabled={!availability.language}
          onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}
        >
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <IconButton
        className="icon-button"
        title={`${t("toolbar.theme")}: ${t(`toolbar.${theme}`)}`}
        aria-label={`${t("toolbar.theme")}: ${t(`toolbar.${theme}`)}`}
        disabled={availability.navigation === false}
        onClick={onThemeToggle}
      >
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      </IconButton>
      <IconButton
        className="icon-button"
        title={t("toolbar.settings")}
        aria-label={t("toolbar.settings")}
        disabled={availability.navigation === false}
        onClick={onSettings ?? (() => onPlaceholder?.(t("toolbar.settings")))}
      >
        <Settings size={17} />
      </IconButton>
    </header>
  );
}
