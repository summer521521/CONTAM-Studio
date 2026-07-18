import { CheckCircle2, FileClock, PanelBottomClose } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BottomTab } from "../../app/workbench-state";
import type { ProjectState } from "../../app/project-state";
import type { RunState } from "../../app/run-state";
import { ContamXRunSummary } from "./ContamXRunSummary";

interface BottomPanelProps {
  activeTab: BottomTab;
  projectState: ProjectState;
  runState: RunState;
  onViewCurrentZoneResults: () => void;
  viewRunResultsDisabled: boolean;
  onTabChange: (tab: BottomTab) => void;
  onCollapse: () => void;
}

export function BottomPanel({
  activeTab,
  projectState,
  runState,
  onViewCurrentZoneResults,
  viewRunResultsDisabled,
  onTabChange,
  onCollapse,
}: BottomPanelProps) {
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
            {tab === "problems" ? (
              <span className="tab-count">{projectState.issue ? 1 : 0}</span>
            ) : null}
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
        {activeTab === "problems" && projectState.issue ? (
          <div className="problem-detail" role="alert">
            <div className="problem-heading">
              <strong>{t(`errors.codes.${projectState.issue.code}`, { defaultValue: t("errors.codes.unknown") })}</strong>
              <code>{projectState.issue.code}</code>
            </div>
            {projectState.issue.source_line_number ? (
              <p>{t("errors.sourceLine", { line: projectState.issue.source_line_number })}</p>
            ) : null}
            {Object.keys(projectState.issue.context).length > 0 ? (
              <dl className="problem-context">
                {Object.entries(projectState.issue.context).map(([key, value]) => (
                  <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
                ))}
              </dl>
            ) : null}
            <p>{t("errors.retryHint")}</p>
          </div>
        ) : null}
        {activeTab === "problems" && !projectState.issue ? (
          <div className="panel-empty-state">
            <CheckCircle2 size={27} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <strong>{t("panel.noProblems")}</strong>
              <p>{t(projectState.project ? "panel.projectValidatedHint" : "panel.noProblemsHint")}</p>
            </div>
          </div>
        ) : null}
        {activeTab === "logs" ? (
          <ContamXRunSummary
            state={runState}
            onViewCurrentZoneResults={onViewCurrentZoneResults}
            viewResultsDisabled={viewRunResultsDisabled}
          />
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
