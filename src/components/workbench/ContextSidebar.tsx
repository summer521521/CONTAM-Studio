import { Eye, Info, PanelRightClose, Pencil, SlidersHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PatchState } from "../../app/patch-state";
import type { ContextTab } from "../../app/workbench-state";
import type { ProjectInspection, ZoneRecord } from "../../app/project-state";
import { INITIAL_AI_STATE, type AiContextScope, type AiState } from "../../app/ai-state";
import { CodexAssistantPanel } from "./CodexAssistantPanel";

interface ContextSidebarProps {
  activeTab: ContextTab;
  project: ProjectInspection | null;
  selectedZone: ZoneRecord | null;
  selectedObject: string;
  patchState: PatchState;
  onStartVolumeEdit: () => void;
  onVolumeTokenChange: (token: string) => void;
  onPlanVolumePatch: () => void;
  onCancelVolumeEdit: () => void;
  onTabChange: (tab: ContextTab) => void;
  onCollapse: () => void;
  aiState?: AiState;
  aiContextAvailable?: boolean;
  onAiConnect?: () => void;
  onAiInstall?: () => void;
  onAiRefresh?: () => void;
  onAiDisconnect?: () => void;
  onAiScopeToggle?: (scope: AiContextScope) => void;
  onAiModelChange?: (modelId: string) => void;
  onAiEffortChange?: (effort: string) => void;
  onAiPreview?: () => void;
  onAiQuestionChange?: (question: string) => void;
  onAiSend?: () => void;
  onAiStop?: () => void;
  onAiClear?: () => void;
}

export function ContextSidebar({
  activeTab,
  project,
  selectedZone,
  selectedObject,
  patchState,
  onStartVolumeEdit,
  onVolumeTokenChange,
  onPlanVolumePatch,
  onCancelVolumeEdit,
  onTabChange,
  onCollapse,
  aiState = INITIAL_AI_STATE,
  aiContextAvailable = false,
  onAiConnect = () => undefined,
  onAiInstall = () => undefined,
  onAiRefresh = () => undefined,
  onAiDisconnect = () => undefined,
  onAiScopeToggle = () => undefined,
  onAiModelChange = () => undefined,
  onAiEffortChange = () => undefined,
  onAiPreview = () => undefined,
  onAiQuestionChange = () => undefined,
  onAiSend = () => undefined,
  onAiStop = () => undefined,
  onAiClear = () => undefined,
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
              <div className="volume-property">
                <dt>{t("inspector.volume")}</dt>
                <dd>
                  <span>{t("inspector.volumeUnit", { value: selectedZone.volume_m3 })}</span>
                  {patchState.status === "idle" || patchState.status === "success" ? (
                    <button type="button" className="property-action" onClick={onStartVolumeEdit}>
                      <Pencil size={13} />{t("patch.editVolume")}
                    </button>
                  ) : null}
                </dd>
              </div>
              <div><dt>{t("inspector.sourceLine")}</dt><dd>{selectedZone.source_line_number}</dd></div>
              <div><dt>{t("inspector.readerMode")}</dt><dd>{project.reader_mode}</dd></div>
              <div><dt>{t("inspector.status")}</dt><dd>{t("inspector.readOnlyValue")}</dd></div>
            </dl>
          ) : null}
          {project && selectedZone && ["editing", "planning", "error"].includes(patchState.status) ? (
            <div className="volume-edit-panel">
              <label htmlFor="zone-volume-token">{t("patch.newVolumeToken")}</label>
              <div className="volume-edit-row">
                <input
                  id="zone-volume-token"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={80}
                  value={patchState.newVolumeToken}
                  disabled={patchState.status === "planning"}
                  onChange={(event) => onVolumeTokenChange(event.target.value)}
                />
                <span>m³</span>
              </div>
              <p>{t("patch.numericHelp")}</p>
              {patchState.issue ? (
                <p className="patch-inline-error" role="alert">
                  {t(`errors.codes.${patchState.issue.code}`, { defaultValue: t("errors.codes.unknown") })}
                </p>
              ) : null}
              <div className="volume-edit-actions">
                <button type="button" className="secondary-action" onClick={onCancelVolumeEdit} disabled={patchState.status === "planning"}>
                  <X size={15} />{t("patch.cancel")}
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={onPlanVolumePatch}
                  disabled={patchState.status === "planning" || !patchState.newVolumeToken.trim()}
                >
                  {patchState.status === "planning" ? <span className="loading-indicator" /> : <Eye size={15} />}
                  {t(patchState.status === "planning" ? "patch.planning" : "patch.generatePreview")}
                </button>
              </div>
            </div>
          ) : null}
          {project && !selectedZone ? (
            <div className="context-empty">
              <Info size={22} aria-hidden="true" />
              <p>{t("inspector.noZone")}</p>
            </div>
          ) : !project ? (
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
          ) : null}
          <div className="context-note">
            <Info size={16} aria-hidden="true" />
            <p>{t(project ? "inspector.realReadOnly" : "inspector.readOnly")}</p>
          </div>
        </div>
      ) : (
        <CodexAssistantPanel
          state={aiState}
          contextAvailable={aiContextAvailable}
          onConnect={onAiConnect}
          onInstall={onAiInstall}
          onRefresh={onAiRefresh}
          onDisconnect={onAiDisconnect}
          onScopeToggle={onAiScopeToggle}
          onModelChange={onAiModelChange}
          onEffortChange={onAiEffortChange}
          onPreview={onAiPreview}
          onQuestionChange={onAiQuestionChange}
          onSend={onAiSend}
          onStop={onAiStop}
          onClear={onAiClear}
        />
      )}
    </aside>
  );
}
