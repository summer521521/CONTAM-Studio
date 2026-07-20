import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { CodexAssistantPanel } from "../components/workbench/CodexAssistantPanel";
import {
  aiReducer,
  INITIAL_AI_STATE,
  isSafeAiPreview,
  isStructuredAiAnswer,
  type AiState,
  type AiContextDisclosureView,
  type CodexConnectionView,
} from "./ai-state";

const connection: CodexConnectionView = {
  status: "available",
  cli: { found: true, version: "codex-cli 1.2.3", source: "path" },
  account: { authenticated: true, auth_mode: "chatgpt", plan_type: "plus", requires_login: false },
  models: [{
    id: "model-a",
    display_name: "Model A",
    is_default: true,
    available: true,
    reasoning_efforts: [{ id: "low", description: "Low" }, { id: "high", description: "High" }],
    default_reasoning_effort: "low",
  }],
};

const preview: AiContextDisclosureView = {
  preview_id: "preview-1",
  project_session_id: "session-1",
  revision_id: "00000000-0000-5000-8000-000000000001",
  revision_number: 1,
  zone_id: "00000000-0000-5000-8000-000000000002",
  zone_name: "One",
  included_scopes: ["selected_zone", "draft_summary"],
  excluded_scopes: ["project_summary", "run_summary", "result_summary", "diagnostics"],
  context_fingerprint: "fingerprint-1",
  payload: { selected_zone: { name: "One", volume_m3: 600 }, draft_summary: { revision_number: 1 } },
  disclosure: {
    contains_local_paths: false,
    contains_prj_text: false,
    contains_complete_result_series: false,
    model_request_uses_network: true,
  },
};

const structuredAnswer = {
  deterministic_facts: ["Volume is 600 m3."],
  interpretation: "The disclosed Zone has a stable volume.",
  limitations: ["No full result series was sent."],
  suggested_questions: ["What does flag 3 mean?"],
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("read-only AI state", () => {
  it("checks the local CLI before an explicit App Server connection", () => {
    expect(INITIAL_AI_STATE.status).toBe("probing");
    expect(INITIAL_AI_STATE.connection).toBeNull();
    const probing = aiReducer(INITIAL_AI_STATE, { type: "probe_started", requestId: "probe-1" });
    expect(probing.status).toBe("probing");
    expect(probing.connection).toBeNull();
    expect(aiReducer(probing, { type: "probe_succeeded", requestId: "old", probe: connection.cli })).toEqual(probing);
    const installed = aiReducer(probing, { type: "probe_succeeded", requestId: "probe-1", probe: connection.cli });
    expect(installed.status).toBe("installed");
    expect(installed.cliProbe).toEqual(connection.cli);
    expect(installed.connection).toBeNull();
  });

  it("tracks a confirmed installation separately from connection", () => {
    const installing = aiReducer(INITIAL_AI_STATE, { type: "install_started", requestId: "install-1" });
    expect(installing.status).toBe("installing");
    expect(aiReducer(installing, { type: "install_succeeded", requestId: "old", probe: connection.cli })).toEqual(installing);
    const installed = aiReducer(installing, { type: "install_succeeded", requestId: "install-1", probe: connection.cli });
    expect(installed.status).toBe("installed");
    expect(installed.cliProbe).toEqual(connection.cli);
    expect(installed.connection).toBeNull();
  });

  it("keeps pending CLI and connection responses valid when project context changes", () => {
    const probing = aiReducer(INITIAL_AI_STATE, { type: "probe_started", requestId: "probe-1" });
    const projectLoadedDuringProbe = aiReducer(probing, { type: "context_changed" });
    expect(projectLoadedDuringProbe.activeRequestId).toBe("probe-1");
    expect(aiReducer(projectLoadedDuringProbe, { type: "probe_succeeded", requestId: "probe-1", probe: connection.cli }).status).toBe("installed");

    const connecting = aiReducer(
      { ...INITIAL_AI_STATE, status: "installed", cliProbe: connection.cli },
      { type: "connect_started", requestId: "connect-1" },
    );
    const projectLoadedDuringConnection = aiReducer(connecting, { type: "context_changed" });
    expect(projectLoadedDuringConnection.activeRequestId).toBe("connect-1");
    expect(aiReducer(projectLoadedDuringConnection, { type: "connect_succeeded", requestId: "connect-1", connection }).status).toBe("available");
  });

  it("renders a local-only CLI checking state without an App Server connection", () => {
    const html = renderToStaticMarkup(
      <CodexAssistantPanel
        state={{ ...INITIAL_AI_STATE, status: "probing", activeRequestId: "probe-1" }}
        contextAvailable={false}
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(html).toContain("Checking Codex CLI");
    expect(html).toContain("This does not start the App Server or contact a model.");
    expect(html).not.toContain("Starting the local Codex App Server");
  });

  it("shows a bounded explanation while the local App Server is connecting", () => {
    const html = renderToStaticMarkup(
      <CodexAssistantPanel
        state={{ ...INITIAL_AI_STATE, status: "connecting", activeRequestId: "connect-1" }}
        contextAvailable={false}
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(html).toContain("Starting the local Codex App Server and reading the account and model catalog.");
  });

  it("uses the server model order and default reasoning effort", () => {
    const connecting = aiReducer(INITIAL_AI_STATE, { type: "connect_started", requestId: "r1" });
    const ready = aiReducer(connecting, { type: "connect_succeeded", requestId: "r1", connection });
    expect(ready.status).toBe("available");
    expect(ready.modelId).toBe("model-a");
    expect(ready.reasoningEffort).toBe("low");
    expect(ready.connection?.models[0].reasoning_efforts.map((item) => item.id)).toEqual(["low", "high"]);
  });

  it("defaults to only the selected Zone and draft summary", () => {
    expect(INITIAL_AI_STATE.scopes).toEqual(["selected_zone", "draft_summary"]);
  });

  it("invalidates preview and completed exchanges when a trusted binding changes", () => {
    const populated = {
      ...INITIAL_AI_STATE,
      connection,
      status: "available" as const,
      preview,
      previewExpanded: true,
      question: "Keep this only in the same binding.",
      conversation: [{ turn_id: "turn-1", question: "Explain One.", answer: structuredAnswer }],
    };
    const scoped = aiReducer(populated, { type: "scope_toggled", scope: "run_summary" });
    expect(scoped.preview).toBeNull();
    expect(scoped.conversation).toEqual([]);
    expect(scoped.question).toBe("");
    expect(aiReducer(populated, { type: "model_changed", modelId: "model-a", effort: "high" }).conversation).toEqual([]);
    expect(aiReducer(populated, { type: "effort_changed", effort: "low" }).conversation).toEqual([]);
    expect(aiReducer(populated, { type: "context_changed" }).conversation).toEqual([]);
    expect(aiReducer(populated, { type: "session_cleared" }).conversation).toEqual([]);
  });

  it("collapses a confirmed preview without invalidating the approved disclosure", () => {
    const previewing = aiReducer(
      { ...INITIAL_AI_STATE, activeRequestId: "preview-1" },
      { type: "preview_succeeded", requestId: "preview-1", preview },
    );
    expect(previewing.previewExpanded).toBe(true);
    const collapsed = aiReducer(previewing, { type: "preview_visibility_toggled" });
    expect(collapsed.preview).toEqual(preview);
    expect(collapsed.previewExpanded).toBe(false);
    expect(aiReducer(collapsed, { type: "preview_visibility_toggled" }).previewExpanded).toBe(true);
  });

  it("keeps a confirmed preview eligible for sending after it is collapsed", () => {
    const html = renderToStaticMarkup(
      <CodexAssistantPanel
        state={{
          ...INITIAL_AI_STATE,
          status: "available",
          connection,
          modelId: "model-a",
          reasoningEffort: "low",
          preview,
          previewExpanded: false,
          question: "Explain this Zone.",
        }}
        contextAvailable
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(html).toContain("Preview context to be sent");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("This context is confirmed. You can hide the preview and send your question.");
    expect(html).not.toContain("Structured context preview");
    expect(html).toContain(">Send<");
    expect(html).not.toContain("disabled=\"\"");
  });

  it("explains the required preview beside a disabled send action", () => {
    const html = renderToStaticMarkup(
      <CodexAssistantPanel
        state={{
          ...INITIAL_AI_STATE,
          status: "available",
          connection,
          modelId: "model-a",
          reasoningEffort: "low",
          question: "Explain this Zone.",
        }}
        contextAvailable
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(html).toContain("Preview and confirm the disclosed context before sending this question.");
    expect(html).toContain('id="ai-send-preview-gate"');
    expect(html).toContain('aria-describedby="ai-send-preview-gate"');
  });

  it("clears stale connection state when the App Server disconnects", () => {
    const disconnected = aiReducer(
      {
        ...INITIAL_AI_STATE,
        status: "available",
        connection,
        preview,
        question: "Explain this Zone.",
        conversation: [{ turn_id: "turn-1", question: "Explain One.", answer: structuredAnswer }],
      },
      {
        type: "operation_failed",
        requestId: null,
        issue: { code: "codex_app_server_disconnected", message: "hidden" },
      },
    );
    expect(disconnected.status).toBe("installed");
    expect(disconnected.connection).toBeNull();
    expect(disconnected.preview).toBeNull();
    expect(disconnected.question).toBe("");
    expect(disconnected.conversation).toEqual([]);
  });

  it("ignores stale connection and turn responses", () => {
    const connecting = aiReducer(INITIAL_AI_STATE, { type: "connect_started", requestId: "current" });
    expect(aiReducer(connecting, { type: "connect_succeeded", requestId: "old", connection })).toEqual(connecting);
    const generating = aiReducer({ ...connecting, status: "available" }, { type: "turn_started", requestId: "turn-current", question: "Explain this Zone." });
    expect(aiReducer(generating, { type: "turn_succeeded", requestId: "turn-old", answer: structuredAnswer })).toEqual(generating);
    const ready = { ...INITIAL_AI_STATE, status: "available" as const, connection };
    expect(aiReducer(ready, { type: "operation_failed", requestId: "old", issue: { code: "codex_app_server_disconnected", message: "hidden" } })).toEqual(ready);
  });

  it("retains completed exchanges in order and bounds the in-memory transcript", () => {
    let state: AiState = { ...INITIAL_AI_STATE, status: "available", connection, preview };
    for (let index = 0; index < 13; index += 1) {
      const requestId = `turn-${index}`;
      const question = `Question ${index}`;
      state = aiReducer({ ...state, question }, { type: "turn_started", requestId, question });
      state = aiReducer(state, { type: "turn_succeeded", requestId, answer: structuredAnswer });
    }
    expect(state.conversation).toHaveLength(12);
    expect(state.conversation[0]?.question).toBe("Question 1");
    expect(state.conversation.at(-1)?.question).toBe("Question 12");
    expect(state.question).toBe("");
    expect(state.pendingQuestion).toBeNull();
    expect(state.preview).toEqual(preview);
  });

  it("keeps completed exchanges on preview refresh but discards an interrupted partial answer", () => {
    const completed = {
      ...INITIAL_AI_STATE,
      status: "available" as const,
      connection,
      preview,
      conversation: [{ turn_id: "turn-complete", question: "First question", answer: structuredAnswer }],
    };
    const previewing = aiReducer(completed, { type: "preview_started", requestId: "preview-next" });
    expect(aiReducer(previewing, { type: "preview_succeeded", requestId: "preview-next", preview }).conversation).toEqual(completed.conversation);

    const generating = aiReducer(
      { ...completed, question: "Retry this question" },
      { type: "turn_started", requestId: "turn-partial", question: "Retry this question" },
    );
    const interrupting = aiReducer(generating, { type: "interrupt_started" });
    expect(interrupting.pendingQuestion).toBeNull();
    expect(interrupting.activeRequestId).toBeNull();
    expect(aiReducer(interrupting, { type: "turn_succeeded", requestId: "turn-partial", answer: structuredAnswer })).toEqual(interrupting);
    const interrupted = aiReducer(interrupting, { type: "turn_interrupted" });
    expect(interrupted.conversation).toEqual(completed.conversation);
    expect(interrupted.question).toBe("Retry this question");
  });

  it("accepts only a path-free disclosure generated by Rust", () => {
    expect(isSafeAiPreview(preview)).toBe(true);
    expect(isSafeAiPreview({ ...preview, payload: { source: "C:\\private\\project.prj" } })).toBe(false);
    expect(isSafeAiPreview({ ...preview, disclosure: { ...preview.disclosure, contains_prj_text: true } as never })).toBe(false);
  });

  it("validates the closed structured answer shape and limits", () => {
    expect(isStructuredAiAnswer({ deterministic_facts: ["fact"], interpretation: "interpretation", limitations: ["limit"], suggested_questions: ["next?"] })).toBe(true);
    expect(isStructuredAiAnswer({ deterministic_facts: ["x".repeat(1201)], interpretation: "", limitations: [], suggested_questions: [] })).toBe(false);
    expect(isStructuredAiAnswer({ deterministic_facts: [], interpretation: "x".repeat(4001), limitations: [], suggested_questions: [] })).toBe(false);
    expect(isStructuredAiAnswer({ deterministic_facts: [], interpretation: "ok", limitations: [], suggested_questions: [], raw_path: "C:\\private" })).toBe(false);
  });

  it("renders network disclosure, context preview, and completed structured exchanges", () => {
    const html = renderToStaticMarkup(
      <CodexAssistantPanel
        state={{
          ...INITIAL_AI_STATE,
          status: "available",
          connection,
          modelId: "model-a",
          reasoningEffort: "low",
          preview,
          previewExpanded: true,
          conversation: [{ turn_id: "turn-1", question: "Explain this Zone.", answer: structuredAnswer }],
        }}
        contextAvailable
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(html).toContain("Local client, online model");
    expect(html).toContain("Structured context preview");
    expect(html).toContain("This session");
    expect(html).toContain("Your question");
    expect(html).toContain("Explain this Zone.");
    expect(html).toContain("Deterministic facts");
    expect(html).toContain("AI interpretation");
    expect(html).toContain("Limitations");
    expect(html).not.toContain("C:\\");
  });

  it("shows the terminal login instruction without exposing account details", () => {
    const html = renderToStaticMarkup(
      <CodexAssistantPanel
        state={{
          ...INITIAL_AI_STATE,
          status: "not_authenticated",
          connection: {
            ...connection,
            account: {
              authenticated: false,
              auth_mode: null,
              plan_type: null,
              requires_login: true,
            },
            models: [],
          },
        }}
        contextAvailable
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(html).toContain("codex login");
    expect(html).not.toContain("email");
    expect(html).not.toContain("user_id");
  });

  it("renders a stop action while a turn is generating", () => {
    const html = renderToStaticMarkup(
      <CodexAssistantPanel
        state={{
          ...INITIAL_AI_STATE,
          status: "generating",
          connection,
          modelId: "model-a",
          reasoningEffort: "low",
          preview,
          previewExpanded: true,
          question: "Explain this Zone.",
        }}
        contextAvailable
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(html).toContain("Stop");
    expect(html).toContain("Generating");
    expect(html).not.toContain(">Send<");
  });

  it("clears an active partial turn but preserves completed exchanges until disconnection", () => {
    const generating = {
      ...INITIAL_AI_STATE,
      status: "generating" as const,
      connection,
      preview,
      question: "Explain this Zone.",
      activeRequestId: "turn-1",
      pendingQuestion: "Explain this Zone.",
      conversation: [{ turn_id: "turn-complete", question: "First question", answer: structuredAnswer }],
    };
    const interrupted = aiReducer(generating, { type: "turn_interrupted" });
    expect(interrupted.status).toBe("available");
    expect(interrupted.preview).toEqual(preview);
    expect(interrupted.conversation).toEqual(generating.conversation);
    expect(interrupted.pendingQuestion).toBeNull();
    const disconnected = aiReducer(interrupted, { type: "disconnected" });
    expect(disconnected).toEqual({ ...INITIAL_AI_STATE, status: "installed", cliProbe: connection.cli });
  });

  it("renders the Chinese network and context disclosure labels", async () => {
    await i18n.changeLanguage("zh-CN");
    const html = renderToStaticMarkup(
      <CodexAssistantPanel
        state={{ ...INITIAL_AI_STATE, status: "available", connection, preview, previewExpanded: true }}
        contextAvailable
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(html).toContain("本地客户端，联网模型");
    expect(html).toContain("结构化上下文预览");
    expect(html).toContain("不包含绝对路径、PRJ正文或完整结果序列");
    await i18n.changeLanguage("en");
  });

  it("renders an install reminder without exposing a configurable command", () => {
    const html = renderToStaticMarkup(
      <CodexAssistantPanel
        state={{ ...INITIAL_AI_STATE, status: "disabled", issue: { code: "codex_cli_not_found", message: "hidden" } }}
        contextAvailable={false}
        onConnect={() => undefined}
        onInstall={() => undefined}
        onRefresh={() => undefined}
        onDisconnect={() => undefined}
        onScopeToggle={() => undefined}
        onModelChange={() => undefined}
        onEffortChange={() => undefined}
        onPreview={() => undefined}
        onQuestionChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(html).toContain("Install Codex CLI");
    expect(html).toContain("official OpenAI build");
    expect(html).not.toContain("C:\\");
    expect(html).not.toContain("--danger");
  });
});
