import { CheckCircle2, FileClock, PanelBottomClose } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BottomTab } from "../../app/workbench-state";

interface BottomPanelProps {
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
  onCollapse: () => void;
}

export function BottomPanel({ activeTab, onTabChange, onCollapse }: BottomPanelProps) {
  const { t } = useTranslation();
  const tabs: BottomTab[] = ["problems", "logs", "results"];

  return (
    <section className="bottom-panel">
      <div className="bottom-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            key={tab}
            onClick={() => onTabChange(tab)}
          >
            {t(`panel.${tab}`)}
            {tab === "problems" ? <span className="tab-count">0</span> : null}
          </button>
        ))}
        <button
          className="panel-icon-button bottom-collapse"
          type="button"
          title={t("panel.collapse")}
          aria-label={t("panel.collapse")}
          onClick={onCollapse}
        >
          <PanelBottomClose size={16} />
        </button>
      </div>

      <div className="bottom-content" role="tabpanel">
        {activeTab === "problems" ? (
          <div className="panel-empty-state">
            <CheckCircle2 size={27} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <strong>{t("panel.noProblems")}</strong>
              <p>{t("panel.noProblemsHint")}</p>
            </div>
          </div>
        ) : null}
        {activeTab === "logs" ? (
          <ol className="mock-log">
            <li>{t("panel.log1")}</li>
            <li>{t("panel.log2")}</li>
            <li>{t("panel.log3")}</li>
          </ol>
        ) : null}
        {activeTab === "results" ? (
          <div className="panel-empty-state">
            <FileClock size={27} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <strong>{t("panel.resultTitle")}</strong>
              <p>{t("panel.resultBody")}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
