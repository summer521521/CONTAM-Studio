import { Bot, BotOff, CircleOff, Languages, MonitorCog, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppTheme } from "../../app/workbench-state";
import type { ProjectState } from "../../app/project-state";
import { projectFileName } from "../../app/project-state";
import type { RunState } from "../../app/run-state";
import type { AiState } from "../../app/ai-state";

interface StatusBarProps {
  theme: AppTheme;
  projectState: ProjectState;
  runState: RunState;
  aiState?: AiState;
}

export function StatusBar({ theme, projectState, runState, aiState }: StatusBarProps) {
  const { t } = useTranslation();
  const contamXStatus = runState.summary
    ? `${runState.summary.solver_name} ${runState.summary.solver_version}`
    : runState.status === "running"
      ? t("status.contamxRunning")
      : runState.issue?.code === "contamx_solver_not_configured"
        ? t("status.contamxNotConfigured")
        : t("status.contamx");

  return (
    <footer className="status-bar">
      <span className="status-item">
        <Languages size={13} aria-hidden="true" />
        {t("status.language")}
      </span>
      {projectState.draft ? (
        <span className="status-item" title={t("draft.statusTitle")}>
          {projectState.draft.revision_number === 0
            ? t("draft.original")
            : t("draft.revision", { revision: projectState.draft.revision_number })}
          {projectState.draft.dirty
            ? ` · ${t(projectState.draft.exported ? "draft.exported" : "draft.notExported")}`
            : ""}
        </span>
      ) : null}
      <span className="status-item">
        <Palette size={13} aria-hidden="true" />
        {t(`status.${theme}`)}
      </span>
      <span className="status-item">
        <CircleOff size={13} aria-hidden="true" />
        {projectState.project
          ? projectFileName(projectState.project.source_path)
          : t(`project.status.${projectState.status}`)}
      </span>
      <span className="status-spacer" />
      <span className="status-item">
        <MonitorCog size={13} aria-hidden="true" />
        {contamXStatus}
      </span>
      <span className="status-item">
        {aiState?.status === "available" ? <Bot size={13} aria-hidden="true" /> : <BotOff size={13} aria-hidden="true" />}
        {aiState ? t(`assistant.status.${aiState.status}`) : t("status.ai")}
      </span>
    </footer>
  );
}
