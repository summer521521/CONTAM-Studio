import { useEffect, useRef, useState } from "react";
import { Archive, CircleStop, Download, Eye, Link2, RefreshCw, Send, ShieldCheck, Trash2, Unplug, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiContextScope, AiIntent, AiProviderProfile, AiSemanticPatchSuggestion, AiState } from "../../app/ai-state";
import type { AssistantContextReceipt } from "../../app/assistant-context";
import type { SemanticSnapshot } from "../../app/semantic-state";
import { INITIAL_SIMULATION_STATE, type AssistantMode, type SimulationState } from "../../app/simulation-state";
import type { GeometryVisionDraftController } from "../../app/runtime/useGeometryVisionDraft";
import { SimulationPlanPanel } from "./SimulationPlanPanel";
import { AttachmentCenterPanel } from "./AttachmentCenterPanel";
import { INITIAL_ATTACHMENT_STATE, type AttachmentState, type AttachmentView } from "../../app/attachment-state";
import { HoverHint } from "./HoverHint";
import { AssistantContextReceiptView } from "./assistant/AssistantContextReceipt";
import { AssistantConversation } from "./assistant/AssistantConversation";
import { AssistantHeader } from "./assistant/AssistantHeader";
import { AssistantIntentSelector } from "./assistant/AssistantIntentSelector";
import { GeometryVisionDraftPanel } from "./assistant/GeometryVisionDraftPanel";

const SCOPES: AiContextScope[] = [
  "project_summary",
  "selected_zone",
  "draft_summary",
  "run_summary",
  "result_summary",
  "study_summary",
  "diagnostics",
  "attachment_evidence",
  "semantic_project",
  "semantic_object",
];

interface CodexAssistantPanelProps {
  state: AiState;
  contextAvailable: boolean;
  onConnect: () => void;
  onInstall: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onProviderSelect?: (profileId: string) => void;
  onProviderTest?: () => void;
  onProviderRefreshModels?: () => void;
  onProviderSave?: (profile: AiProviderProfile) => void;
  onProviderDelete?: () => void;
  onCodexDeviceLogin?: () => void;
  onCodexApiKeyLogin?: (apiKey: string) => void;
  onCodexCancelLogin?: () => void;
  onCodexLogout?: () => void;
  onProviderSecret?: (secret: string) => void;
  onProviderClearSecret?: () => void;
  onScopeToggle: (scope: AiContextScope) => void;
  receipt?: AssistantContextReceipt | null;
  semanticSnapshot?: SemanticSnapshot | null;
  onIntentChange?: (intent: AiIntent) => void;
  onOpenSettings?: () => void;
  onModelChange: (modelId: string) => void;
  onEffortChange: (effort: string) => void;
  onPreview: () => void;
  onPreviewVisibilityToggle?: () => void;
  onQuestionChange: (question: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
  onArchiveEnabled?: (enabled: boolean) => void;
  onArchiveDelete?: (entryId: string) => void;
  onArchiveClearZone?: () => void;
  onArchiveClearAll?: () => void;
  onUseSemanticPatch?: (patch: AiSemanticPatchSuggestion) => void;
  simulationState?: SimulationState;
  onModeChange?: (mode: AssistantMode) => void;
  onSimulationGoalChange?: (goal: string) => void;
  onSimulationPlan?: () => void;
  onSimulationBack?: () => void;
  onSimulationCancel?: () => void;
  onSimulationApproveAndRun?: () => void;
  attachmentState?: AttachmentState;
  onAttachmentImport?: () => void;
  onAttachmentSelect?: (attachment: AttachmentView, selected: boolean) => void;
  onAttachmentPreview?: () => void;
  onAttachmentRemove?: (attachment: AttachmentView) => void;
  geometryVisionDraft?: GeometryVisionDraftController;
  geometryAvailable?: boolean;
}

export function CodexAssistantPanel({
  state,
  contextAvailable,
  onConnect,
  onInstall,
  onRefresh,
  onDisconnect,
  onProviderSelect = () => undefined,
  onProviderTest = () => undefined,
  onProviderRefreshModels = () => undefined,
  onScopeToggle,
  receipt = null,
  semanticSnapshot = null,
  onIntentChange = () => undefined,
  onOpenSettings = () => undefined,
  onModelChange,
  onEffortChange,
  onPreview,
  onPreviewVisibilityToggle = () => undefined,
  onQuestionChange,
  onSend,
  onStop,
  onClear,
  onArchiveEnabled = () => undefined,
  onArchiveDelete = () => undefined,
  onArchiveClearZone = () => undefined,
  onArchiveClearAll = () => undefined,
  onUseSemanticPatch = () => undefined,
  simulationState = INITIAL_SIMULATION_STATE,
  onModeChange = () => undefined,
  onSimulationGoalChange = () => undefined,
  onSimulationPlan = () => undefined,
  onSimulationBack = () => undefined,
  onSimulationCancel = () => undefined,
  onSimulationApproveAndRun = () => undefined,
  attachmentState = INITIAL_ATTACHMENT_STATE,
  onAttachmentImport = () => undefined,
  onAttachmentSelect = () => undefined,
  onAttachmentPreview = () => undefined,
  onAttachmentRemove = () => undefined,
  geometryVisionDraft,
  geometryAvailable = false,
}: CodexAssistantPanelProps) {
  const { t } = useTranslation();
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [archiveConfirmation, setArchiveConfirmation] = useState<"zone" | "all" | null>(null);
  const installDialogRef = useRef<HTMLElement>(null);
  const selectedProvider = state.providerProfiles.find((profile) => profile.profile_id === state.providerProfileId) ?? null;
  const isCodexProvider = !selectedProvider || selectedProvider.protocol === "codex_app_server";
  const model = state.connection?.models.find((item) => item.id === state.modelId) ?? null;
  const providerConfigured = isCodexProvider
    ? Boolean(state.connection)
    : Boolean(selectedProvider && (selectedProvider.auth_kind === "none" || selectedProvider.secret_state === "present"));
  const providerConnectionFailed = !isCodexProvider && Boolean(state.providerIssue);
  const connected = isCodexProvider ? Boolean(state.connection) : providerConfigured;
  const ready = isCodexProvider ? state.status === "available" : providerConfigured && !providerConnectionFailed;
  const codexVisionReady = isCodexProvider
    && state.connection?.account.authenticated === true
    && state.connection.account.auth_mode === "chatgpt"
    && state.connection.models.some((item) => item.id === "gpt-5.6-luna" && item.available && item.input_modalities.includes("image"));
  const busy = state.status === "probing" || state.status === "installing" || state.status === "connecting" || state.status === "generating" || state.status === "interrupting";
  const providerModels = isCodexProvider
    ? state.connection?.models.filter((item) => item.available).map((item) => ({ id: item.id, display_name: item.display_name })) ?? []
    : selectedProvider?.models.filter((item) => item.available).map((item) => ({ id: item.id, display_name: item.display_name })) ?? [];
  const advancedModels = isCodexProvider
    ? []
    : selectedProvider?.models.filter((item) => !item.available) ?? [];
  const manualModels = isCodexProvider || selectedProvider?.built_in ? [] : selectedProvider?.manual_model_ids ?? [];
  const archivedEntryIds = new Set(state.archive?.entries.map((entry) => entry.entry_id));
  const liveConversation = state.conversation.filter(
    (entry) => !entry.archive_entry_id || !archivedEntryIds.has(entry.archive_entry_id),
  );
  useEffect(() => {
    if (!installDialogOpen) return undefined;
    installDialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.status !== "installing") {
        setInstallDialogOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [installDialogOpen, state.status]);

  useEffect(() => {
    if (!state.archive?.entries.length) setArchiveConfirmation(null);
  }, [state.archive?.entries.length]);

  return (
    <div className="context-content codex-assistant" role="tabpanel">
      <AssistantHeader state={state} provider={selectedProvider} onOpenSettings={onOpenSettings} />

      {state.providerProfiles.length ? (
        <section className="assistant-provider-config" aria-labelledby="assistant-provider-title">
          <label className="assistant-field">
            <span id="assistant-provider-title">{t("assistant.provider")}</span>
            <select value={state.providerProfileId} onChange={(event) => onProviderSelect(event.target.value)} disabled={busy}>
              {state.providerProfiles.map((profile) => (
                <option key={profile.profile_id} value={profile.profile_id}>{profile.preset_id === "codex" ? t("assistant.codexProviderLabel") : profile.preset_id === "openai" ? t("assistant.openaiProviderLabel") : profile.display_name}</option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      <div className="assistant-mode-switch" role="tablist" aria-label={t("simulation.mode") }>
        <button type="button" role="tab" aria-selected={simulationState.mode === "analysis"} className={simulationState.mode === "analysis" ? "is-active" : ""} onClick={() => onModeChange("analysis")}>{t("simulation.analysisMode")}</button>
        <button type="button" role="tab" aria-selected={simulationState.mode === "simulation_plan"} className={simulationState.mode === "simulation_plan" ? "is-active" : ""} onClick={() => onModeChange("simulation_plan")}>{t("simulation.planMode")}</button>
      </div>

      {simulationState.mode === "simulation_plan" ? (
        <SimulationPlanPanel
          state={simulationState}
          contextAvailable={contextAvailable}
          onGoalChange={onSimulationGoalChange}
          onCreatePlan={onSimulationPlan}
          onBack={onSimulationBack}
          onCancel={onSimulationCancel}
          onApproveAndRun={onSimulationApproveAndRun}
        />
      ) : <>

      <AssistantIntentSelector value={state.intent} disabled={busy} onChange={onIntentChange} />

      <div className={`assistant-status assistant-status-${state.status}`} role="status" aria-live="polite">
        <strong>{isCodexProvider ? t(`assistant.status.${state.status}`) : t(providerConnectionFailed ? "journeys.settings.providerConnectionFailed" : providerConfigured ? "assistant.providerReady" : "assistant.providerNotConfigured")}</strong>
        {isCodexProvider && state.connection?.account.authenticated ? (
          <span>{t("assistant.planConnected", { plan: state.connection.account.plan_type ?? t("assistant.planUnknown") })}</span>
        ) : isCodexProvider && connected ? <code>codex login</code> : selectedProvider && providerConfigured && !providerConnectionFailed ? <span>{t("assistant.providerConnected")}</span> : null}
      </div>

      <div className="assistant-actions compact-actions">
        {isCodexProvider && !connected ? (
          <>
            <button type="button" className="primary-action" onClick={onConnect} disabled={busy}>
              <Link2 size={15} />{t(state.status === "connecting" ? "assistant.connecting" : "assistant.connect")}
            </button>
            {state.status !== "installed" ? (
              <button type="button" className="secondary-action" onClick={() => setInstallDialogOpen(true)} disabled={busy}>
                <Download size={15} />{t(state.status === "installing" ? "assistant.installing" : "assistant.installCli")}
              </button>
            ) : null}
          </>
        ) : isCodexProvider ? (
          <>
            <button type="button" className="secondary-action" onClick={onRefresh} disabled={busy}>
              <RefreshCw size={15} />{t("assistant.refresh")}
            </button>
            <button type="button" className="secondary-action" onClick={onDisconnect} disabled={busy}>
              <Unplug size={15} />{t("assistant.disconnect")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="secondary-action" onClick={onProviderTest} disabled={busy || !providerConfigured}>
              <Link2 size={15} />{t("assistant.testProvider")}
            </button>
            <button type="button" className="secondary-action" onClick={onProviderRefreshModels} disabled={busy || !providerConfigured}>
              <RefreshCw size={15} />{t("assistant.refreshModels")}
            </button>
          </>
        )}
      </div>
      {state.status === "probing" ? <p className="assistant-progress" role="status">{t("assistant.probingProgress")}</p> : null}
      {state.status === "connecting" ? <p className="assistant-progress" role="status">{t("assistant.connectingProgress")}</p> : null}

      {isCodexProvider && !connected && state.status === "installed" ? (
        <div className="assistant-install-reminder success">
          <ShieldCheck size={16} aria-hidden="true" />
          <p>{t("assistant.installComplete")}</p>
        </div>
      ) : isCodexProvider && !connected && state.status !== "probing" ? (
        <div className="assistant-install-reminder">
          <ShieldCheck size={16} aria-hidden="true" />
          <p>{t("assistant.installReminder")}</p>
        </div>
      ) : null}

      <div className="assistant-boundary">
        <p className="assistant-compact-note">
          {t("assistant.networkDisclosureShort")} · {t("assistant.coreUnaffectedShort")}
          <HoverHint label={`${isCodexProvider ? t("assistant.networkDisclosure") : t("assistant.providerRequestDisclosure")} ${t("assistant.coreUnaffected")}`} />
        </p>
      </div>

      {geometryAvailable && geometryVisionDraft ? (
        <GeometryVisionDraftPanel
          controller={geometryVisionDraft}
          geometryAvailable={geometryAvailable}
          codexVisionReady={codexVisionReady}
          attachmentState={attachmentState}
          onAttachmentImport={onAttachmentImport}
          onAttachmentSelect={onAttachmentSelect}
        />
      ) : null}

      {isCodexProvider && state.status === "not_authenticated" ? <p className="assistant-login-note">{t("assistant.loginInstruction")}</p> : null}
      {state.issue ? (
        <p className="patch-inline-error" role="alert">
          {t(`errors.codes.${state.issue.code}`, { defaultValue: t("errors.codes.unknown") })}
        </p>
      ) : null}
      {state.providerIssue ? (
        <p className="patch-inline-error" role="alert">
          {t(`errors.codes.${state.providerIssue.code}`, { defaultValue: t("errors.codes.unknown") })}
        </p>
      ) : null}

      {connected ? (
        <>
          <label className="assistant-field">
            <span>{t("assistant.model")}</span>
            <select value={state.modelId} onChange={(event) => onModelChange(event.target.value)} disabled={!ready || busy}>
              {!state.modelId ? <option value="">{t("assistant.selectModel")}</option> : null}
              {providerModels.map((item) => (
                <option key={item.id} value={item.id}>{item.display_name}</option>
              ))}
              {manualModels.filter((id) => !providerModels.some((item) => item.id === id)).map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          {advancedModels.length ? (
            <details className="assistant-advanced">
              <summary>{t("assistant.unverifiedModels", { count: advancedModels.length })}</summary>
              <ul className="assistant-model-list">
                {advancedModels.map((item) => <li key={item.id}><code>{item.id}</code></li>)}
              </ul>
            </details>
          ) : null}
          {isCodexProvider ? <label className="assistant-field">
            <span>{t("assistant.reasoningEffort")}</span>
            <select value={state.reasoningEffort} onChange={(event) => onEffortChange(event.target.value)} disabled={!ready || busy}>
              {model?.reasoning_efforts.map((effort) => (
                <option key={effort.id} value={effort.id}>{effort.id}</option>
              ))}
            </select>
          </label> : null}

          <details className="assistant-advanced">
            <summary>{t("assistant.contextScopes")}</summary>
            <fieldset className="assistant-scopes" disabled={!ready || busy}>
              <legend className="sr-only">{t("assistant.contextScopes")}</legend>
              {SCOPES.map((scope) => (
                <label key={scope}>
                  <input
                    type="checkbox"
                    checked={state.scopes.includes(scope)}
                    onChange={() => onScopeToggle(scope)}
                  />
                  <span>{t(`assistant.scopes.${scope}`)}</span>
                </label>
              ))}
            </fieldset>
          </details>

          <AssistantContextReceiptView receipt={receipt} preview={state.previewExpanded ? state.preview : null} />

          <button
            type="button"
            className="secondary-action assistant-wide-action"
            onClick={state.preview ? onPreviewVisibilityToggle : onPreview}
            disabled={!state.preview && (!ready || !state.modelId || !contextAvailable || state.scopes.length === 0 || (selectedProvider?.auth_kind === "api_key" && selectedProvider.secret_state !== "present"))}
            aria-expanded={state.preview ? state.previewExpanded : false}
            aria-controls="ai-context-preview"
          >
            <Eye size={15} />{t(state.previewExpanded ? "assistant.hidePreview" : "assistant.previewContext")}
          </button>
          <p className="assistant-safe-note">
            {state.preview ? t("assistant.previewConfirmed") : t("assistant.previewRequired")}
          </p>

          {state.preview && state.previewExpanded ? <p id="ai-context-preview" className="assistant-safe-note">{t("assistant.previewBoundary")}</p> : null}

          {contextAvailable ? (
            <section className="assistant-archive" aria-labelledby="ai-archive-title">
              <div className="assistant-archive-heading">
                <div>
                  <h3 id="ai-archive-title"><Archive size={17} aria-hidden="true" />{t("assistant.archive.title")}</h3>
                  <p>{t("assistant.archive.localOnly")}</p>
                </div>
                {state.archive?.persistence_enabled ? (
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => onArchiveEnabled(false)}
                    disabled={state.archiveStatus === "loading"}
                  >
                    {t("assistant.archive.disable")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => onArchiveEnabled(true)}
                    disabled={state.archiveStatus === "loading"}
                  >
                    {t("assistant.archive.enable")}
                  </button>
                )}
              </div>
              {state.archiveStatus === "loading" ? <p className="assistant-progress">{t("assistant.archive.loading")}</p> : null}
              {state.archiveIssue ? (
                <p className="patch-inline-error" role="alert">
                  {t(`errors.codes.${state.archiveIssue.code}`, { defaultValue: t("errors.codes.unknown") })}
                </p>
              ) : null}
              {state.archive?.persistence_enabled ? (
                <p className="assistant-safe-note">{t("assistant.archive.enabledNotice")}</p>
              ) : (
                <p className="assistant-safe-note">{t("assistant.archive.consentNotice")}</p>
              )}
              {state.archive?.entries.length ? (
                <>
                  <div className="assistant-archive-actions compact-actions">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => setArchiveConfirmation("zone")}
                      disabled={state.archiveStatus === "loading"}
                    >
                      <Trash2 size={14} />{t("assistant.archive.clearZone")}
                    </button>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => setArchiveConfirmation("all")}
                      disabled={state.archiveStatus === "loading"}
                    >
                      <Trash2 size={14} />{t("assistant.archive.clearAll")}
                    </button>
                  </div>
                  {archiveConfirmation ? (
                    <div className="assistant-archive-confirm" role="alert">
                      <p>{t(archiveConfirmation === "zone" ? "assistant.archive.confirmZone" : "assistant.archive.confirmAll")}</p>
                      <div className="compact-actions">
                        <button type="button" className="secondary-action" onClick={() => setArchiveConfirmation(null)}>
                          {t("assistant.installCancel")}
                        </button>
                        <button
                          type="button"
                          className="danger-action"
                          onClick={() => {
                            if (archiveConfirmation === "zone") onArchiveClearZone();
                            else onArchiveClearAll();
                            setArchiveConfirmation(null);
                          }}
                        >
                          {t("assistant.archive.confirmDelete")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="assistant-archive-list">
                    {state.archive.entries.map((entry) => (
                      <article className="assistant-answer assistant-archive-entry" key={entry.entry_id}>
                        <div className="assistant-archive-entry-heading">
                          <h4>{t("assistant.archive.entryTitle", { revision: entry.revision_number })}</h4>
                          <button
                            type="button"
                            className="panel-icon-button"
                            title={t("assistant.archive.deleteEntry")}
                            aria-label={t("assistant.archive.deleteEntry")}
                            onClick={() => onArchiveDelete(entry.entry_id)}
                            disabled={state.archiveStatus === "loading"}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <p className="assistant-safe-note">
                          {new Date(entry.completed_at_unix_ms).toLocaleString()} · {entry.provider_display_name} · {entry.model_id} · {entry.reasoning_effort}
                          {!entry.is_current_revision ? ` · ${t("assistant.archive.historical")}` : ""}
                        </p>
                        <section>
                          <h5>{t("assistant.completedQuestion")}</h5>
                          <p>{entry.question}</p>
                        </section>
                        <section><h5>{t("assistant.facts")}</h5><ul>{entry.answer.deterministic_facts.map((item) => <li key={item}>{item}</li>)}</ul></section>
                        <section><h5>{t("assistant.interpretation")}</h5><p>{entry.answer.interpretation}</p></section>
                        <section><h5>{t("assistant.limitations")}</h5><ul>{entry.answer.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>
                        {entry.answer.suggested_questions.length > 0 ? (
                          <section><h5>{t("assistant.suggestedQuestions")}</h5><ul>{entry.answer.suggested_questions.map((item) => <li key={item}>{item}</li>)}</ul></section>
                        ) : null}
                        {entry.answer.semantic_patch ? (
                          <section className="assistant-semantic-patch">
                            <h5>{t("assistant.semanticPatchTitle")}</h5>
                            <p>{t("assistant.semanticPatchSummary", { count: entry.answer.semantic_patch.operations.length })}</p>
                            <button type="button" className="secondary-action" onClick={() => onUseSemanticPatch(entry.answer.semantic_patch!)}>{t("assistant.reviewSemanticPatch")}</button>
                          </section>
                        ) : null}
                        <p className="assistant-safe-note">{t("assistant.archive.notReused")}</p>
                      </article>
                    ))}
                  </div>
                </>
              ) : state.archive?.persistence_enabled ? <p className="assistant-safe-note">{t("assistant.archive.empty")}</p> : null}
            </section>
          ) : null}

          <label className="assistant-field">
            <span>{t("assistant.question")}</span>
            <textarea
              rows={5}
              maxLength={2000}
              value={state.question}
              onChange={(event) => onQuestionChange(event.target.value)}
              disabled={!ready || busy}
              placeholder={t("assistant.questionPlaceholder")}
            />
          </label>
          {!state.preview && state.question.trim() ? <p id="ai-send-preview-gate" className="assistant-safe-note">{t("assistant.sendPreviewGate")}</p> : null}
          <div className="assistant-actions">
            {state.status === "generating" || state.status === "interrupting" ? (
              <button type="button" className="secondary-action" onClick={onStop} disabled={state.status === "interrupting"}>
                <CircleStop size={15} />{t(state.status === "interrupting" ? "assistant.stopping" : "assistant.stop")}
              </button>
            ) : (
              <button
                type="button"
                className="primary-action"
                onClick={onSend}
                disabled={!ready || !state.preview || !state.question.trim()}
                aria-describedby={!state.preview && state.question.trim() ? "ai-send-preview-gate" : undefined}
              >
                <Send size={15} />{t("assistant.send")}
              </button>
            )}
            <button type="button" className="secondary-action" onClick={onClear} disabled={busy}>
              <Trash2 size={15} />{t("assistant.clear")}
            </button>
          </div>

          {state.status === "generating" ? <p className="assistant-progress" role="status">{t("assistant.generating")}</p> : null}
          <AssistantConversation entries={liveConversation} snapshot={semanticSnapshot} onReviewPatch={onUseSemanticPatch} />
        </>
      ) : null}


      {installDialogOpen ? (
        <div className="assistant-install-backdrop">
          <section
            ref={installDialogRef}
            className="assistant-install-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="codex-install-dialog-title"
            tabIndex={-1}
          >
            <button
              type="button"
              className="panel-icon-button assistant-install-close"
              onClick={() => setInstallDialogOpen(false)}
              aria-label={t("assistant.installCancel")}
              disabled={state.status === "installing"}
            >
              <X size={16} />
            </button>
            <h3 id="codex-install-dialog-title">{t("assistant.installTitle")}</h3>
            <p>{t("assistant.installImpact")}</p>
            <ul>
              <li>{t("assistant.installNetwork")}</li>
              <li>{t("assistant.installLocation")}</li>
              <li>{t("assistant.installNoLogin")}</li>
            </ul>
            <p>{t("assistant.installPinNotice")}</p>
            <details>
              <summary>{t("assistant.manualInstall")}</summary>
              <code>$env:CODEX_NON_INTERACTIVE=1; irm https://chatgpt.com/codex/install.ps1 | iex</code>
            </details>
            <div className="assistant-actions assistant-install-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setInstallDialogOpen(false)}
                disabled={state.status === "installing"}
              >
                {t("assistant.installCancel")}
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  onInstall();
                  setInstallDialogOpen(false);
                }}
                disabled={state.status === "installing"}
              >
                <Download size={15} />{t("assistant.installConfirm")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      </>}
      <AttachmentCenterPanel
        state={attachmentState}
        contextAvailable={contextAvailable}
        onImport={onAttachmentImport}
        onSelect={onAttachmentSelect}
        onPreview={onAttachmentPreview}
        onRemove={onAttachmentRemove}
      />
    </div>
  );
}
