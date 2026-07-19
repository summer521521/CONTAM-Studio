import { useEffect, useRef, useState } from "react";
import { Bot, CircleStop, Download, Eye, Link2, RefreshCw, Send, ShieldCheck, Trash2, Unplug, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiContextScope, AiState } from "../../app/ai-state";

const SCOPES: AiContextScope[] = [
  "project_summary",
  "selected_zone",
  "draft_summary",
  "run_summary",
  "result_summary",
  "diagnostics",
];

interface CodexAssistantPanelProps {
  state: AiState;
  contextAvailable: boolean;
  onConnect: () => void;
  onInstall: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onScopeToggle: (scope: AiContextScope) => void;
  onModelChange: (modelId: string) => void;
  onEffortChange: (effort: string) => void;
  onPreview: () => void;
  onPreviewVisibilityToggle?: () => void;
  onQuestionChange: (question: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
}

export function CodexAssistantPanel({
  state,
  contextAvailable,
  onConnect,
  onInstall,
  onRefresh,
  onDisconnect,
  onScopeToggle,
  onModelChange,
  onEffortChange,
  onPreview,
  onPreviewVisibilityToggle = () => undefined,
  onQuestionChange,
  onSend,
  onStop,
  onClear,
}: CodexAssistantPanelProps) {
  const { t } = useTranslation();
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const installDialogRef = useRef<HTMLElement>(null);
  const model = state.connection?.models.find((item) => item.id === state.modelId) ?? null;
  const cliProbe = state.connection?.cli ?? state.cliProbe;
  const connected = Boolean(state.connection);
  const ready = state.status === "available";
  const busy = state.status === "probing" || state.status === "installing" || state.status === "connecting" || state.status === "generating" || state.status === "interrupting";

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

  return (
    <div className="context-content codex-assistant" role="tabpanel">
      <div className="assistant-heading">
        <Bot size={22} aria-hidden="true" />
        <div>
          <h2>{t("assistant.title")}</h2>
          <p>{t("assistant.localClientOnlineModel")}</p>
        </div>
      </div>

      <div className={`assistant-status assistant-status-${state.status}`} role="status" aria-live="polite">
        <strong>{t(`assistant.status.${state.status}`)}</strong>
        {cliProbe?.version ? <span>{t("assistant.cliVersion", { version: cliProbe.version })}</span> : null}
        {state.connection?.account.authenticated ? (
          <span>{t("assistant.planConnected", { plan: state.connection.account.plan_type ?? t("assistant.planUnknown") })}</span>
        ) : connected ? <code>codex login</code> : null}
      </div>

      <div className="assistant-actions compact-actions">
        {!connected ? (
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
        ) : (
          <>
            <button type="button" className="secondary-action" onClick={onRefresh} disabled={busy}>
              <RefreshCw size={15} />{t("assistant.refresh")}
            </button>
            <button type="button" className="secondary-action" onClick={onDisconnect} disabled={busy}>
              <Unplug size={15} />{t("assistant.disconnect")}
            </button>
          </>
        )}
      </div>
      {state.status === "probing" ? <p className="assistant-progress" role="status">{t("assistant.probingProgress")}</p> : null}
      {state.status === "connecting" ? <p className="assistant-progress" role="status">{t("assistant.connectingProgress")}</p> : null}

      {!connected && state.status === "installed" ? (
        <div className="assistant-install-reminder success">
          <ShieldCheck size={16} aria-hidden="true" />
          <p>{t("assistant.installComplete")}</p>
        </div>
      ) : !connected && state.status !== "probing" ? (
        <div className="assistant-install-reminder">
          <ShieldCheck size={16} aria-hidden="true" />
          <p>{t("assistant.installReminder")}</p>
        </div>
      ) : null}

      <div className="assistant-boundary">
        <p>{t("assistant.networkDisclosure")}</p>
        <p>{t("assistant.coreUnaffected")}</p>
      </div>

      {state.status === "not_authenticated" ? <p className="assistant-login-note">{t("assistant.loginInstruction")}</p> : null}
      {state.issue ? (
        <p className="patch-inline-error" role="alert">
          {t(`errors.codes.${state.issue.code}`, { defaultValue: t("errors.codes.unknown") })}
        </p>
      ) : null}

      {connected ? (
        <>
          <label className="assistant-field">
            <span>{t("assistant.model")}</span>
            <select value={state.modelId} onChange={(event) => onModelChange(event.target.value)} disabled={!ready || busy}>
              {state.connection?.models.filter((item) => item.available).map((item) => (
                <option key={item.id} value={item.id}>{item.display_name}</option>
              ))}
            </select>
          </label>
          <label className="assistant-field">
            <span>{t("assistant.reasoningEffort")}</span>
            <select value={state.reasoningEffort} onChange={(event) => onEffortChange(event.target.value)} disabled={!ready || busy}>
              {model?.reasoning_efforts.map((effort) => (
                <option key={effort.id} value={effort.id}>{effort.id}</option>
              ))}
            </select>
          </label>

          <fieldset className="assistant-scopes" disabled={!ready || busy}>
            <legend>{t("assistant.contextScopes")}</legend>
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

          <button
            type="button"
            className="secondary-action assistant-wide-action"
            onClick={state.preview ? onPreviewVisibilityToggle : onPreview}
            disabled={!state.preview && (!ready || !contextAvailable || state.scopes.length === 0)}
            aria-expanded={state.preview ? state.previewExpanded : false}
            aria-controls="ai-context-preview"
          >
            <Eye size={15} />{t(state.previewExpanded ? "assistant.hidePreview" : "assistant.previewContext")}
          </button>
          <p className="assistant-safe-note">
            {state.preview ? t("assistant.previewConfirmed") : t("assistant.previewRequired")}
          </p>

          {state.preview && state.previewExpanded ? (
            <section id="ai-context-preview" className="assistant-preview" aria-labelledby="ai-context-preview-title">
              <h3 id="ai-context-preview-title">{t("assistant.previewTitle")}</h3>
              <dl>
                <div><dt>{t("assistant.boundRevision")}</dt><dd>{state.preview.revision_number}</dd></div>
                <div><dt>{t("assistant.boundZone")}</dt><dd>{state.preview.zone_name}</dd></div>
              </dl>
              <p>{t("assistant.includedScopes")}: {state.preview.included_scopes.map((scope) => t(`assistant.scopes.${scope}`)).join(", ")}</p>
              <p>{t("assistant.excludedScopes")}: {state.preview.excluded_scopes.map((scope) => t(`assistant.scopes.${scope}`)).join(", ")}</p>
              <pre>{JSON.stringify(state.preview.payload, null, 2)}</pre>
              <p className="assistant-safe-note">{t("assistant.previewBoundary")}</p>
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
          {state.answer ? (
            <article className="assistant-answer">
              <section><h3>{t("assistant.facts")}</h3><ul>{state.answer.deterministic_facts.map((item) => <li key={item}>{item}</li>)}</ul></section>
              <section><h3>{t("assistant.interpretation")}</h3><p>{state.answer.interpretation}</p></section>
              <section><h3>{t("assistant.limitations")}</h3><ul>{state.answer.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>
              {state.answer.suggested_questions.length > 0 ? (
                <section><h3>{t("assistant.suggestedQuestions")}</h3><ul>{state.answer.suggested_questions.map((item) => <li key={item}>{item}</li>)}</ul></section>
              ) : null}
              <p className="assistant-safe-note">{t("assistant.factsCaveat")}</p>
            </article>
          ) : null}
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
    </div>
  );
}
