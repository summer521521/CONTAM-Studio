import { Bot, Info, PanelRightClose, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ContextTab } from "../../app/workbench-state";
import type { ProjectInspection, ZoneRecord } from "../../app/project-state";

interface ContextSidebarProps {
  activeTab: ContextTab;
  project: ProjectInspection | null;
  selectedZone: ZoneRecord | null;
  selectedObject: string;
  onTabChange: (tab: ContextTab) => void;
  onCollapse: () => void;
}

export function ContextSidebar({
  activeTab,
  project,
  selectedZone,
  selectedObject,
  onTabChange,
  onCollapse,
}: ContextSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="context-sidebar">
      <div className="context-tabs" role="tablist">
        <button
          className={activeTab === "inspector" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={activeTab === "inspector"}
          onClick={() => onTabChange("inspector")}
        >
          {t("inspector.properties")}
        </button>
        <button
          className={activeTab === "assistant" ? "is-active" : ""}
          type="button"
          role="tab"
          aria-selected={activeTab === "assistant"}
          onClick={() => onTabChange("assistant")}
        >
          {t("assistant.tab")}
        </button>
        <button
          className="panel-icon-button context-collapse"
          type="button"
          title={t("inspector.collapse")}
          aria-label={t("inspector.collapse")}
          onClick={onCollapse}
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {activeTab === "inspector" ? (
        <div className="context-content" role="tabpanel">
          <div className="context-title">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <div>
              <span>{t(project ? "inspector.selectedZone" : "inspector.selected")}</span>
              <strong>{selectedZone?.name ?? t(selectedObject)}</strong>
            </div>
          </div>
          {project && selectedZone ? (
            <dl className="property-list">
              <div><dt>{t("inspector.name")}</dt><dd>{selectedZone.name}</dd></div>
              <div><dt>{t("inspector.contamNumber")}</dt><dd>{selectedZone.contam_number}</dd></div>
              <div><dt>{t("inspector.flags")}</dt><dd>{selectedZone.flags}</dd></div>
              <div><dt>{t("inspector.level")}</dt><dd>{selectedZone.level_number}</dd></div>
              <div><dt>{t("inspector.relativeHeight")}</dt><dd>{selectedZone.relative_height}</dd></div>
              <div><dt>{t("inspector.volume")}</dt><dd>{t("inspector.volumeUnit", { value: selectedZone.volume_m3 })}</dd></div>
              <div><dt>{t("inspector.sourceLine")}</dt><dd>{selectedZone.source_line_number}</dd></div>
              <div><dt>{t("inspector.readerMode")}</dt><dd>{project.reader_mode}</dd></div>
              <div><dt>{t("inspector.status")}</dt><dd>{t("inspector.readOnlyValue")}</dd></div>
            </dl>
          ) : project ? (
            <div className="context-empty">
              <Info size={22} aria-hidden="true" />
              <p>{t("inspector.noZone")}</p>
            </div>
          ) : (
            <dl className="property-list">
            <div>
              <dt>{t("inspector.name")}</dt>
              <dd>{t(selectedObject)}</dd>
            </div>
            <div>
              <dt>{t("inspector.type")}</dt>
              <dd>{t("inspector.typeValue")}</dd>
            </div>
            <div>
              <dt>{t("inspector.level")}</dt>
              <dd>{t("inspector.levelValue")}</dd>
            </div>
            <div>
              <dt>{t("inspector.volume")}</dt>
              <dd>{t("inspector.volumeValue")}</dd>
            </div>
            <div>
              <dt>{t("inspector.status")}</dt>
              <dd>{t("inspector.statusValue")}</dd>
            </div>
            </dl>
          )}
          <div className="context-note">
            <Info size={16} aria-hidden="true" />
            <p>{t(project ? "inspector.realReadOnly" : "inspector.readOnly")}</p>
          </div>
        </div>
      ) : (
        <div className="context-content assistant-placeholder" role="tabpanel">
          <Bot size={32} strokeWidth={1.5} aria-hidden="true" />
          <h2>{t("assistant.title")}</h2>
          <p>{t("assistant.noContext")}</p>
          <div className="assistant-boundary">
            <p>{t("assistant.future")}</p>
            <p>{t("assistant.optIn")}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
