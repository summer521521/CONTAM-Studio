import {
  FilePlus2,
  FolderOpen,
  HardDrive,
  Home,
  PanelBottomClose,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface WelcomePageProps {
  contextCollapsed: boolean;
  bottomCollapsed: boolean;
  onToggleContext: () => void;
  onToggleBottom: () => void;
  onPlaceholder: (action: string) => void;
}

export function WelcomePage({
  contextCollapsed,
  bottomCollapsed,
  onToggleContext,
  onToggleBottom,
  onPlaceholder,
}: WelcomePageProps) {
  const { t } = useTranslation();

  return (
    <main className="editor-surface">
      <div className="editor-tabs">
        <div className="editor-tab is-active">
          <Home size={14} aria-hidden="true" />
          <span>{t("welcome.tab")}</span>
        </div>
        <div className="editor-layout-actions">
          <button
            className="panel-icon-button"
            type="button"
            title={contextCollapsed ? t("inspector.expand") : t("inspector.collapse")}
            aria-label={contextCollapsed ? t("inspector.expand") : t("inspector.collapse")}
            onClick={onToggleContext}
          >
            {contextCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
          <button
            className="panel-icon-button"
            type="button"
            title={bottomCollapsed ? t("panel.expand") : t("panel.collapse")}
            aria-label={bottomCollapsed ? t("panel.expand") : t("panel.collapse")}
            onClick={onToggleBottom}
          >
            {bottomCollapsed ? <PanelBottomOpen size={16} /> : <PanelBottomClose size={16} />}
          </button>
        </div>
      </div>

      <div className="welcome-scroll">
        <div className="welcome-content">
          <section className="welcome-intro">
            <h1>{t("welcome.title")}</h1>
            <p>{t("welcome.tagline")}</p>
            <div className="welcome-actions">
              <button
                className="primary-action"
                type="button"
                onClick={() => onPlaceholder(t("welcome.openProject"))}
              >
                <FolderOpen size={18} />
                <span>{t("welcome.openProject")}</span>
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() => onPlaceholder(t("welcome.newProject"))}
              >
                <FilePlus2 size={18} />
                <span>{t("welcome.newProject")}</span>
              </button>
            </div>
          </section>

          <section className="recent-section">
            <h2>{t("welcome.recent")}</h2>
            <div className="recent-empty">
              <FolderOpen size={28} strokeWidth={1.5} aria-hidden="true" />
              <div>
                <strong>{t("welcome.recentEmpty")}</strong>
                <p>{t("welcome.recentHint")}</p>
              </div>
            </div>
          </section>

          <section className="phase-band">
            <strong>{t("welcome.phaseTitle")}</strong>
            <p>{t("welcome.phaseBody")}</p>
          </section>

          <section className="safety-notes">
            <div className="safety-note">
              <HardDrive size={19} aria-hidden="true" />
              <div>
                <strong>{t("welcome.offlineTitle")}</strong>
                <p>{t("welcome.offlineBody")}</p>
              </div>
            </div>
            <div className="safety-note">
              <ShieldCheck size={19} aria-hidden="true" />
              <div>
                <strong>{t("welcome.protectionTitle")}</strong>
                <p>{t("welcome.protectionBody")}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
