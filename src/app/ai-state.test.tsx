import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { CodexAssistantPanel } from "../components/workbench/CodexAssistantPanel";
import {
  aiReducer,
  INITIAL_AI_STATE,
  isSafeAiPreview,
  isStructuredAiAnswer,
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

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("read-only AI state", () => {
  it("does not connect until the user explicitly starts a connection", () => {
    expect(INITIAL_AI_STATE.status).toBe("disabled");
    expect(INITIAL_AI_STATE.connection).toBeNull();
  });

  it("tracks a confirmed installation separately from connection", () => {
    const installing = aiReducer(INITIAL_AI_STATE, { type: "install_started", requestId: "install-1" });
    expect(installing.status).toBe("installing");
    expect(aiReducer(installing, { type: "install_succeeded", requestId: "old" })).toEqual(installing);
    const installed = aiReducer(installing, { type: "install_succeeded", requestId: "install-1" });
    expect(installed.status).toBe("installed");
    expect(installed.connection).toBeNull();
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

  it("invalidates preview and answer when a scope, model, or trusted context changes", () => {
    const populated = { ...INITIAL_AI_STATE, connection, status: "available" as const, preview, previewExpanded: true, answer: { deterministic_facts: ["x"], interpretation: "y", limitations: [], suggested_questions: [] } };
    expect(aiReducer(populated, { type: "scope_toggled", scope: "run_summary" }).preview).toBeNull();
    expect(aiReducer(populated, { type: "model_changed", modelId: "model-a", effort: "high" }).answer).toBeNull();
    expect(aiReducer(populated, { type: "context_changed" }).question).toBe("");
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
  });

  it("ignores stale connection and turn responses", () => {
    const connecting = aiReducer(INITIAL_AI_STATE, { type: "connect_started", requestId: "current" });
    expect(aiReducer(connecting, { type: "connect_succeeded", requestId: "old", connection })).toEqual(connecting);
    const generating = aiReducer({ ...connecting, status: "available" }, { type: "turn_started", requestId: "turn-current" });
    expect(aiReducer(generating, { type: "turn_succeeded", requestId: "turn-old", answer: { deterministic_facts: [], interpretation: "", limitations: [], suggested_questions: [] }, tokenUsage: null })).toEqual(generating);
    const ready = { ...INITIAL_AI_STATE, status: "available" as const, connection };
    expect(aiReducer(ready, { type: "operation_failed", requestId: "old", issue: { code: "codex_app_server_disconnected", message: "hidden" } })).toEqual(ready);
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

  it("renders network disclosure, context preview, and separate answer sections", () => {
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
          answer: { deterministic_facts: ["Volume is 600 m3."], interpretation: "Large volume.", limitations: ["No full series."], suggested_questions: [] },
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

  it("clears the active turn and preview on interruption or disconnection", () => {
    const generating = {
      ...INITIAL_AI_STATE,
      status: "generating" as const,
      connection,
      preview,
      question: "Explain this Zone.",
      activeRequestId: "turn-1",
    };
    const interrupted = aiReducer(generating, { type: "turn_interrupted" });
    expect(interrupted.status).toBe("available");
    expect(interrupted.preview).toEqual(preview);
    expect(interrupted.answer).toBeNull();
    const disconnected = aiReducer(interrupted, { type: "disconnected" });
    expect(disconnected).toEqual({ ...INITIAL_AI_STATE, status: "installed" });
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
        state={{ ...INITIAL_AI_STATE, issue: { code: "codex_cli_not_found", message: "hidden" } }}
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
