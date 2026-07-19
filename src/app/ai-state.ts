export type AiConnectionStatus =
  | "disabled"
  | "installed"
  | "installing"
  | "connecting"
  | "not_authenticated"
  | "available"
  | "generating"
  | "interrupting"
  | "error"
  | "stopped";

export type AiContextScope =
  | "project_summary"
  | "selected_zone"
  | "draft_summary"
  | "run_summary"
  | "result_summary"
  | "diagnostics";

export interface AiDiagnostic {
  code: string;
  message: string;
}

export interface CodexCliProbeView {
  found: boolean;
  version: string | null;
  source: "environment" | "official_install" | "path" | null;
}

export interface CodexAccountView {
  authenticated: boolean;
  auth_mode: string | null;
  plan_type: string | null;
  requires_login: boolean;
}

export interface CodexReasoningEffortView {
  id: string;
  description: string;
}

export interface CodexModelView {
  id: string;
  display_name: string;
  is_default: boolean;
  available: boolean;
  reasoning_efforts: CodexReasoningEffortView[];
  default_reasoning_effort: string;
}

export interface CodexConnectionView {
  status: "available" | "not_authenticated" | "stopped";
  cli: CodexCliProbeView;
  account: CodexAccountView;
  models: CodexModelView[];
}

export interface AiContextDisclosureView {
  preview_id: string;
  project_session_id: string;
  revision_id: string;
  revision_number: number;
  zone_id: string;
  zone_name: string;
  included_scopes: AiContextScope[];
  excluded_scopes: AiContextScope[];
  context_fingerprint: string;
  payload: Record<string, unknown>;
  disclosure: {
    contains_local_paths: false;
    contains_prj_text: false;
    contains_complete_result_series: false;
    model_request_uses_network: true;
  };
}

export interface StructuredAiAnswer {
  deterministic_facts: string[];
  interpretation: string;
  limitations: string[];
  suggested_questions: string[];
}

export interface AiTokenUsageView {
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
}

export interface DesktopCodexProbeResponse {
  request_id: string;
  probe: CodexCliProbeView | null;
  error: AiDiagnostic | null;
}

export interface DesktopCodexConnectionResponse {
  request_id: string;
  connection: CodexConnectionView | null;
  error: AiDiagnostic | null;
}

export interface DesktopCodexInstallResponse {
  request_id: string;
  status: "installed" | "already_available" | "error";
  probe: CodexCliProbeView | null;
  error: AiDiagnostic | null;
}

export interface DesktopAiContextPreviewResponse {
  request_id: string;
  preview: AiContextDisclosureView | null;
  error: AiDiagnostic | null;
}

export interface DesktopAiTurnResponse {
  request_id: string;
  status: "completed" | "error";
  answer: StructuredAiAnswer | null;
  token_usage: AiTokenUsageView | null;
  error: AiDiagnostic | null;
}

export interface DesktopAiActionResponse {
  request_id: string;
  status: string;
  error: AiDiagnostic | null;
}

export interface AiState {
  status: AiConnectionStatus;
  connection: CodexConnectionView | null;
  scopes: AiContextScope[];
  modelId: string;
  reasoningEffort: string;
  preview: AiContextDisclosureView | null;
  previewExpanded: boolean;
  question: string;
  answer: StructuredAiAnswer | null;
  tokenUsage: AiTokenUsageView | null;
  activeRequestId: string | null;
  issue: AiDiagnostic | null;
}

export const DEFAULT_AI_SCOPES: AiContextScope[] = ["selected_zone", "draft_summary"];

export const INITIAL_AI_STATE: AiState = {
  status: "disabled",
  connection: null,
  scopes: DEFAULT_AI_SCOPES,
  modelId: "",
  reasoningEffort: "",
  preview: null,
  previewExpanded: false,
  question: "",
  answer: null,
  tokenUsage: null,
  activeRequestId: null,
  issue: null,
};

export type AiAction =
  | { type: "install_started"; requestId: string }
  | { type: "install_succeeded"; requestId: string }
  | { type: "connect_started"; requestId: string }
  | { type: "connect_succeeded"; requestId: string; connection: CodexConnectionView }
  | { type: "operation_failed"; requestId: string | null; issue: AiDiagnostic }
  | { type: "scope_toggled"; scope: AiContextScope }
  | { type: "model_changed"; modelId: string; effort: string }
  | { type: "effort_changed"; effort: string }
  | { type: "preview_started"; requestId: string }
  | { type: "preview_succeeded"; requestId: string; preview: AiContextDisclosureView }
  | { type: "preview_visibility_toggled" }
  | { type: "question_changed"; question: string }
  | { type: "turn_started"; requestId: string }
  | { type: "turn_succeeded"; requestId: string; answer: StructuredAiAnswer; tokenUsage: AiTokenUsageView | null }
  | { type: "interrupt_started" }
  | { type: "turn_interrupted" }
  | { type: "context_changed" }
  | { type: "session_cleared" }
  | { type: "disconnected" };

function selectValidModel(connection: CodexConnectionView) {
  return connection.models.find((model) => model.is_default && model.available)
    ?? connection.models.find((model) => model.available)
    ?? null;
}

export function aiReducer(state: AiState, action: AiAction): AiState {
  switch (action.type) {
    case "install_started":
      return { ...state, status: "installing", activeRequestId: action.requestId, issue: null };
    case "install_succeeded":
      if (state.activeRequestId !== action.requestId) return state;
      return { ...state, status: "installed", activeRequestId: null, issue: null };
    case "connect_started":
      return { ...state, status: "connecting", activeRequestId: action.requestId, issue: null };
    case "connect_succeeded": {
      if (state.activeRequestId !== action.requestId) return state;
      const previous = action.connection.models.find((model) => model.id === state.modelId && model.available);
      const model = previous ?? selectValidModel(action.connection);
      const effort = model?.reasoning_efforts.some((item) => item.id === state.reasoningEffort)
        ? state.reasoningEffort
        : model?.default_reasoning_effort ?? "";
      return {
        ...state,
        status: action.connection.account.authenticated ? "available" : "not_authenticated",
        connection: action.connection,
        modelId: model?.id ?? "",
        reasoningEffort: effort,
        activeRequestId: null,
        issue: null,
      };
    }
    case "operation_failed":
      if (action.requestId && action.requestId !== state.activeRequestId) return state;
      if (action.issue.code === "codex_app_server_disconnected") {
        return {
          ...INITIAL_AI_STATE,
          status: state.connection?.cli.found ? "installed" : "disabled",
          scopes: state.scopes,
          issue: action.issue,
        };
      }
      return { ...state, status: "error", activeRequestId: null, issue: action.issue };
    case "scope_toggled": {
      const scopes = state.scopes.includes(action.scope)
        ? state.scopes.filter((scope) => scope !== action.scope)
        : [...state.scopes, action.scope];
      return { ...state, scopes, preview: null, previewExpanded: false, answer: null, tokenUsage: null, issue: null };
    }
    case "model_changed":
      return { ...state, modelId: action.modelId, reasoningEffort: action.effort, preview: null, previewExpanded: false, answer: null, tokenUsage: null, issue: null };
    case "effort_changed":
      return { ...state, reasoningEffort: action.effort, preview: null, previewExpanded: false, answer: null, tokenUsage: null, issue: null };
    case "preview_started":
      return { ...state, activeRequestId: action.requestId, preview: null, previewExpanded: false, answer: null, tokenUsage: null, issue: null };
    case "preview_succeeded":
      if (state.activeRequestId !== action.requestId) return state;
      return { ...state, status: "available", activeRequestId: null, preview: action.preview, previewExpanded: true, answer: null, tokenUsage: null, issue: null };
    case "preview_visibility_toggled":
      return state.preview ? { ...state, previewExpanded: !state.previewExpanded } : state;
    case "question_changed":
      return { ...state, question: action.question };
    case "turn_started":
      return { ...state, status: "generating", activeRequestId: action.requestId, answer: null, tokenUsage: null, issue: null };
    case "turn_succeeded":
      if (state.activeRequestId !== action.requestId) return state;
      return { ...state, status: "available", activeRequestId: null, answer: action.answer, tokenUsage: action.tokenUsage, issue: null };
    case "interrupt_started":
      return { ...state, status: "interrupting" };
    case "turn_interrupted":
      return { ...state, status: "available", activeRequestId: null, answer: null, tokenUsage: null, issue: null };
    case "context_changed":
      return { ...state, preview: null, previewExpanded: false, answer: null, tokenUsage: null, activeRequestId: null, question: "", issue: null, status: state.connection?.account.authenticated ? "available" : state.status };
    case "session_cleared":
      return { ...state, preview: null, previewExpanded: false, answer: null, tokenUsage: null, activeRequestId: null, question: "", issue: null, status: state.connection?.account.authenticated ? "available" : state.status };
    case "disconnected":
      return {
        ...INITIAL_AI_STATE,
        status: state.connection?.cli.found ? "installed" : "disabled",
      };
    default:
      return state;
  }
}

export function isSafeAiPreview(preview: AiContextDisclosureView): boolean {
  const text = JSON.stringify(preview.payload);
  return preview.preview_id.length > 0
    && preview.context_fingerprint.length > 0
    && preview.included_scopes.length > 0
    && preview.included_scopes.every((scope) => DEFAULT_AI_SCOPES.includes(scope) || ["project_summary", "run_summary", "result_summary", "diagnostics"].includes(scope))
    && !preview.disclosure.contains_local_paths
    && !preview.disclosure.contains_prj_text
    && !preview.disclosure.contains_complete_result_series
    && preview.disclosure.model_request_uses_network
    && !/[A-Za-z]:\\|\\\\|file:\/\//i.test(text);
}

export function isStructuredAiAnswer(value: unknown): value is StructuredAiAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  const expectedKeys = ["deterministic_facts", "interpretation", "limitations", "suggested_questions"];
  if (Object.keys(answer).length !== expectedKeys.length || !expectedKeys.every((key) => key in answer)) return false;
  const validItems = (items: unknown, limit: number) => Array.isArray(items)
    && items.length <= limit
    && items.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 1200);
  return validItems(answer.deterministic_facts, 8)
    && typeof answer.interpretation === "string"
    && answer.interpretation.trim().length > 0
    && answer.interpretation.length <= 4000
    && validItems(answer.limitations, 8)
    && validItems(answer.suggested_questions, 6);
}
