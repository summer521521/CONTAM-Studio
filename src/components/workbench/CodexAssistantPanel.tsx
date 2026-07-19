import { Bot, CircleStop, Eye, Link2, RefreshCw, Send, Trash2, Unplug } from "lucide-react";
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
  onRefresh: () => void;
  onDisconnect: () => void;
  onScopeToggle: (scope: AiContextScope) => void;
  onModelChange: (modelId: string) => void;
  onEffortChange: (effort: string) => void;
  onPreview: () => void;
  onQuestionChange: (question: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
}

export function CodexAssistantPanel({
  state,
  contextAvailable,
  onConnect,
  onRefresh,
  onDisconnect,
  onScopeToggle,
  onModelChange,
  onEffortChange,
  onPreview,
  onQuestionChange,
  onSend,
  onStop,
  onClear,
}: CodexAssistantPanelProps) {
  const { t } = useTranslation();
  const model = state.connection?.models.find((item) => item.id === state.modelId) ?? null;
  const connected = Boolean(state.connection);
  const ready = state.status === "available";
  const busy = state.status === "connecting" || state.status === "generating" || state.status === "interrupting";

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
        {state.connection?.cli.version ? <span>{t("assistant.cliVersion", { version: state.connection.cli.version })}</span> : null}
        {state.connection?.account.authenticated ? (
          <span>{t("assistant.planConnected", { plan: state.connection.account.plan_type ?? t("assistant.planUnknown") })}</span>
        ) : connected ? <code>codex login</code> : null}
      </div>

      <div className="assistant-actions compact-actions">
        {!connected ? (
          <button type="button" className="primary-action" onClick={onConnect} disabled={busy}>
            <Link2 size={15} />{t(state.status === "connecting" ? "assistant.connecting" : "assistant.connect")}
          </button>
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
            onClick={onPreview}
            disabled={!ready || !contextAvailable || state.scopes.length === 0}
          >
            <Eye size={15} />{t("assistant.previewContext")}
          </button>

          {state.preview ? (
            <section className="assistant-preview" aria-labelledby="ai-context-preview-title">
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
    </div>
  );
}
