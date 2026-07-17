import { BotOff, CircleOff, Languages, MonitorCog, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppTheme } from "../../app/workbench-state";

interface StatusBarProps {
  theme: AppTheme;
}

export function StatusBar({ theme }: StatusBarProps) {
  const { t } = useTranslation();

  return (
    <footer className="status-bar">
      <span className="status-item">
        <Languages size={13} aria-hidden="true" />
        {t("status.language")}
      </span>
      <span className="status-item">
        <Palette size={13} aria-hidden="true" />
        {t(`status.${theme}`)}
      </span>
      <span className="status-item">
        <CircleOff size={13} aria-hidden="true" />
        {t("status.noProject")}
      </span>
      <span className="status-spacer" />
      <span className="status-item">
        <MonitorCog size={13} aria-hidden="true" />
        {t("status.contamx")}
      </span>
      <span className="status-item">
        <BotOff size={13} aria-hidden="true" />
        {t("status.ai")}
      </span>
      <span className="status-phase">{t("app.phase")}</span>
    </footer>
  );
}
