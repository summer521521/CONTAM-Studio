export type AiConnectionStatus =
  | "probing"
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
  | "study_summary"
  | "diagnostics"
  | "attachment_evidence"
  | "semantic_project"
  | "semantic_object";

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

export type AiSemanticPatchOperation = {
  operation: "set_zone_volume" | "set_zone_name" | "set_flow_path_multiplier" | "set_flow_path_coefficient";
  object_id: string;
  field: "volume_m3" | "name" | "multiplier";
  new_value: string;
  unit: "m3" | "1" | null;
  evidence: "semantic_project" | "semantic_object" | "user_request";
};

export interface AiSemanticPatchSuggestion {
  schema_version: "semantic_patch_suggestion.v1";
  baseline_source_sha256: string;
  operations: AiSemanticPatchOperation[];
  affected_object_ids: string[];
}

export interface StructuredAiAnswer {
  deterministic_facts: string[];
  interpretation: string;
  limitations: string[];
  suggested_questions: string[];
  semantic_patch?: AiSemanticPatchSuggestion;
}

export interface AiTokenUsageView {
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
}

export interface AiConversationEntry {
  turn_id: string;
  archive_entry_id: string | null;
  question: string;
  answer: StructuredAiAnswer;
}

export const MAX_AI_CONVERSATION_ENTRIES = 12;

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
  archive: AiArchiveSaveView;
  error: AiDiagnostic | null;
}

export interface AiArchiveSaveView {
  saved: boolean;
  entry_id: string | null;
  warning: AiDiagnostic | null;
}

export interface AiArchivedConversationEntry {
  entry_id: string;
  revision_id: string;
  revision_number: number;
  zone_id: string;
  zone_name: string;
  language: string;
  model_id: string;
  reasoning_effort: string;
  included_scopes: AiContextScope[];
  completed_at_unix_ms: number;
  is_current_revision: boolean;
  question: string;
  answer: StructuredAiAnswer;
}

export interface AiConversationArchiveView {
  persistence_enabled: boolean;
  entries: AiArchivedConversationEntry[];
}

export interface DesktopAiConversationArchiveResponse {
  request_id: string;
  archive: AiConversationArchiveView | null;
  error: AiDiagnostic | null;
}

export interface DesktopAiActionResponse {
  request_id: string;
  status: string;
  error: AiDiagnostic | null;
}

export interface AiState {
  status: AiConnectionStatus;
  cliProbe: CodexCliProbeView | null;
  connection: CodexConnectionView | null;
  scopes: AiContextScope[];
  modelId: string;
  reasoningEffort: string;
  preview: AiContextDisclosureView | null;
  previewExpanded: boolean;
  question: string;
  pendingQuestion: string | null;
  conversation: AiConversationEntry[];
  archive: AiConversationArchiveView | null;
  archiveStatus: "idle" | "loading" | "loaded" | "error";
  archiveIssue: AiDiagnostic | null;
  archiveRequestId: string | null;
  activeRequestId: string | null;
  issue: AiDiagnostic | null;
}

export const DEFAULT_AI_SCOPES: AiContextScope[] = ["selected_zone", "draft_summary"];

export const INITIAL_AI_STATE: AiState = {
  status: "probing",
  cliProbe: null,
  connection: null,
  scopes: DEFAULT_AI_SCOPES,
  modelId: "",
  reasoningEffort: "",
  preview: null,
  previewExpanded: false,
  question: "",
  pendingQuestion: null,
  conversation: [],
  archive: null,
  archiveStatus: "idle",
  archiveIssue: null,
  archiveRequestId: null,
  activeRequestId: null,
  issue: null,
};

export type AiAction =
  | { type: "probe_started"; requestId: string }
  | { type: "probe_succeeded"; requestId: string; probe: CodexCliProbeView }
  | { type: "probe_unavailable"; requestId: string }
  | { type: "install_started"; requestId: string }
  | { type: "install_succeeded"; requestId: string; probe: CodexCliProbeView }
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
  | { type: "turn_started"; requestId: string; question: string }
  | { type: "turn_succeeded"; requestId: string; answer: StructuredAiAnswer; archive: AiArchiveSaveView }
  | { type: "archive_loading"; requestId: string }
  | { type: "archive_loaded"; requestId: string; archive: AiConversationArchiveView }
  | { type: "archive_failed"; requestId: string; issue: AiDiagnostic }
  | { type: "archive_persistence_changed"; enabled: boolean }
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

function clearConversationForBindingChange(state: AiState, preserveActiveRequest = false): AiState {
  return {
    ...state,
    preview: null,
    previewExpanded: false,
    question: "",
    pendingQuestion: null,
    conversation: [],
    activeRequestId: preserveActiveRequest ? state.activeRequestId : null,
    issue: null,
  };
}

export function aiReducer(state: AiState, action: AiAction): AiState {
  switch (action.type) {
    case "probe_started":
      return { ...state, status: "probing", activeRequestId: action.requestId, issue: null };
    case "probe_succeeded":
      if (state.activeRequestId !== action.requestId) return state;
      return {
        ...state,
        status: "installed",
        cliProbe: action.probe,
        activeRequestId: null,
        issue: null,
      };
    case "probe_unavailable":
      if (state.activeRequestId !== action.requestId) return state;
      return { ...state, status: "disabled", cliProbe: null, activeRequestId: null, issue: null };
    case "install_started":
      return { ...state, status: "installing", activeRequestId: action.requestId, issue: null };
    case "install_succeeded":
      if (state.activeRequestId !== action.requestId) return state;
      return { ...state, status: "installed", cliProbe: action.probe, activeRequestId: null, issue: null };
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
        cliProbe: action.connection.cli,
        connection: action.connection,
        modelId: model?.id ?? "",
        reasoningEffort: effort,
        activeRequestId: null,
        issue: null,
      };
    }
    case "operation_failed":
      if (action.requestId && action.requestId !== state.activeRequestId) return state;
      if (action.issue.code === "codex_cli_not_found") {
        return { ...state, status: "disabled", cliProbe: null, activeRequestId: null, issue: null };
      }
      if (action.issue.code === "codex_app_server_disconnected") {
        const cliProbe = state.connection?.cli ?? state.cliProbe;
        return {
          ...INITIAL_AI_STATE,
          status: cliProbe?.found ? "installed" : "disabled",
          cliProbe,
          scopes: state.scopes,
          issue: action.issue,
        };
      }
      return { ...state, status: "error", activeRequestId: null, pendingQuestion: null, issue: action.issue };
    case "scope_toggled": {
      const scopes = state.scopes.includes(action.scope)
        ? state.scopes.filter((scope) => scope !== action.scope)
        : [...state.scopes, action.scope];
      return { ...clearConversationForBindingChange(state), scopes };
    }
    case "model_changed":
      return { ...clearConversationForBindingChange(state), modelId: action.modelId, reasoningEffort: action.effort };
    case "effort_changed":
      return { ...clearConversationForBindingChange(state), reasoningEffort: action.effort };
    case "preview_started":
      return { ...state, activeRequestId: action.requestId, preview: null, previewExpanded: false, issue: null };
    case "preview_succeeded":
      if (state.activeRequestId !== action.requestId) return state;
      return { ...state, status: "available", activeRequestId: null, preview: action.preview, previewExpanded: true, issue: null };
    case "preview_visibility_toggled":
      return state.preview ? { ...state, previewExpanded: !state.previewExpanded } : state;
    case "question_changed":
      return { ...state, question: action.question };
    case "turn_started": {
      const question = action.question.trim();
      if (!question) return state;
      return {
        ...state,
        status: "generating",
        activeRequestId: action.requestId,
        pendingQuestion: question,
        issue: null,
      };
    }
    case "turn_succeeded": {
      if (state.activeRequestId !== action.requestId) return state;
      const question = state.pendingQuestion;
      if (!question) return { ...state, status: "available", activeRequestId: null, issue: null };
      const conversation = [
        ...state.conversation,
        {
          turn_id: action.requestId,
          archive_entry_id: action.archive.entry_id,
          question,
          answer: action.answer,
        },
      ].slice(-MAX_AI_CONVERSATION_ENTRIES);
      return {
        ...state,
        status: "available",
        activeRequestId: null,
        question: "",
        pendingQuestion: null,
        conversation,
        archiveIssue: action.archive.warning,
        issue: null,
      };
    }
    case "archive_loading":
      return { ...state, archiveStatus: "loading", archiveIssue: null, archiveRequestId: action.requestId };
    case "archive_loaded":
      if (state.archiveRequestId !== action.requestId) return state;
      return {
        ...state,
        archive: action.archive,
        archiveStatus: "loaded",
        archiveIssue: null,
        archiveRequestId: null,
      };
    case "archive_failed":
      if (state.archiveRequestId !== action.requestId) return state;
      return { ...state, archiveStatus: "error", archiveIssue: action.issue, archiveRequestId: null };
    case "archive_persistence_changed":
      return {
        ...state,
        archive: {
          persistence_enabled: action.enabled,
          entries: state.archive?.entries ?? [],
        },
        archiveStatus: "loaded",
        archiveIssue: null,
        archiveRequestId: null,
      };
    case "interrupt_started":
      return { ...state, status: "interrupting", activeRequestId: null, pendingQuestion: null };
    case "turn_interrupted":
      return { ...state, status: "available", activeRequestId: null, pendingQuestion: null, issue: null };
    case "context_changed":
      return {
        ...clearConversationForBindingChange(
          state,
          state.status === "probing" || state.status === "installing" || state.status === "connecting",
        ),
        status: state.connection?.account.authenticated ? "available" : state.status,
        archive: null,
        archiveStatus: "idle",
        archiveIssue: null,
        archiveRequestId: null,
      };
    case "session_cleared":
      return { ...clearConversationForBindingChange(state), status: state.connection?.account.authenticated ? "available" : state.status };
    case "disconnected": {
      const cliProbe = state.connection?.cli ?? state.cliProbe;
      return {
        ...INITIAL_AI_STATE,
        status: cliProbe?.found ? "installed" : "disabled",
        cliProbe,
      };
    }
    default:
      return state;
  }
}

export function isSafeAiPreview(preview: AiContextDisclosureView): boolean {
  const text = JSON.stringify(preview.payload);
  return preview.preview_id.length > 0
    && preview.context_fingerprint.length > 0
    && preview.included_scopes.length > 0
    && preview.included_scopes.every((scope) => DEFAULT_AI_SCOPES.includes(scope) || ["project_summary", "run_summary", "result_summary", "study_summary", "diagnostics", "attachment_evidence", "semantic_project", "semantic_object"].includes(scope))
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
  if ((Object.keys(answer).length !== expectedKeys.length && Object.keys(answer).length !== expectedKeys.length + 1) || !expectedKeys.every((key) => key in answer) || Object.keys(answer).some((key) => !expectedKeys.includes(key) && key !== "semantic_patch")) return false;
  const validItems = (items: unknown, limit: number) => Array.isArray(items)
    && items.length <= limit
    && items.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 1200);
  if ("semantic_patch" in answer && !isSafeSemanticPatchSuggestion(answer.semantic_patch)) return false;
  return validItems(answer.deterministic_facts, 8)
    && typeof answer.interpretation === "string"
    && answer.interpretation.trim().length > 0
    && answer.interpretation.length <= 4000
    && validItems(answer.limitations, 8)
    && validItems(answer.suggested_questions, 6);
}

function isSafeSemanticPatchSuggestion(value: unknown): value is AiSemanticPatchSuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const patch = value as Record<string, unknown>;
  const required = ["schema_version", "baseline_source_sha256", "operations", "affected_object_ids"];
  if (Object.keys(patch).length !== required.length || !required.every((key) => key in patch)) return false;
  if (patch.schema_version !== "semantic_patch_suggestion.v1" || typeof patch.baseline_source_sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(patch.baseline_source_sha256)) return false;
  if (!Array.isArray(patch.operations) || patch.operations.length < 1 || patch.operations.length > 128 || !Array.isArray(patch.affected_object_ids) || patch.affected_object_ids.length !== patch.operations.length) return false;
  const ids = new Set<string>();
  const targets = new Set<string>();
  for (const item of patch.affected_object_ids) {
    if (typeof item !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item) || ids.has(item)) return false;
    ids.add(item);
  }
  for (const item of patch.operations) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const operation = item as Record<string, unknown>;
    const keys = ["operation", "object_id", "field", "new_value", "unit", "evidence"];
    if (Object.keys(operation).length !== keys.length || !keys.every((key) => key in operation)) return false;
    if (typeof operation.object_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation.object_id)) return false;
    if (typeof operation.new_value !== "string" || operation.new_value.length === 0 || operation.new_value.length > 80 || /[\u0000-\u001f\u007f]|[A-Za-z]:\\|\\\\|file:\/\//i.test(operation.new_value)) return false;
    const valid = (operation.operation === "set_zone_volume" && operation.field === "volume_m3" && operation.unit === "m3")
      || (operation.operation === "set_zone_name" && operation.field === "name" && operation.unit === null)
      || ((operation.operation === "set_flow_path_multiplier" || operation.operation === "set_flow_path_coefficient") && operation.field === "multiplier" && operation.unit === "1");
    if (!valid || !["semantic_project", "semantic_object", "user_request"].includes(String(operation.evidence))) return false;
    if (operation.field === "name" ? !/^[A-Za-z0-9_.-]{1,15}$/.test(operation.new_value) : !Number.isFinite(Number(operation.new_value)) || Number(operation.new_value) <= 0 || Number(operation.new_value) > 1_000_000_000) return false;
    const key = `${operation.object_id}:${operation.field}`;
    if (targets.has(key)) return false;
    targets.add(key);
  }
  return [...targets].every((key) => ids.has(key.split(":", 1)[0])) && ids.size === new Set([...targets].map((key) => key.split(":", 1)[0])).size;
}

function containsSensitivePath(value: string): boolean {
  return /[A-Za-z]:\\|\\\\|file:\/\//i.test(value);
}

function isSafeArchiveDiagnostic(value: unknown): value is AiDiagnostic {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const diagnostic = value as Record<string, unknown>;
  return Object.keys(diagnostic).length === 2
    && typeof diagnostic.code === "string"
    && diagnostic.code.length > 0
    && diagnostic.code.length <= 96
    && typeof diagnostic.message === "string"
    && diagnostic.message.length > 0
    && diagnostic.message.length <= 512
    && !containsSensitivePath(diagnostic.message);
}

export function isSafeAiArchiveSave(value: unknown): value is AiArchiveSaveView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const archive = value as Record<string, unknown>;
  if (Object.keys(archive).length !== 3 || typeof archive.saved !== "boolean") return false;
  const entryIdValid = archive.entry_id === null
    || (typeof archive.entry_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(archive.entry_id));
  return entryIdValid && (archive.warning === null || isSafeArchiveDiagnostic(archive.warning));
}

export function isSafeAiArchive(value: unknown): value is AiConversationArchiveView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const archive = value as Record<string, unknown>;
  if (
    Object.keys(archive).length !== 2
    || typeof archive.persistence_enabled !== "boolean"
    || !Array.isArray(archive.entries)
    || archive.entries.length > 200
  ) {
    return false;
  }
  const expectedEntryKeys = [
    "entry_id",
    "revision_id",
    "revision_number",
    "zone_id",
    "zone_name",
    "language",
    "model_id",
    "reasoning_effort",
    "included_scopes",
    "completed_at_unix_ms",
    "is_current_revision",
    "question",
    "answer",
  ];
  return archive.entries.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    const safeText = (field: string, max: number) => typeof item[field] === "string"
      && item[field].length > 0
      && item[field].length <= max
      && ![...(item[field] as string)].some((character) => /[\u0000-\u001f\u007f]/.test(character))
      && !containsSensitivePath(item[field] as string);
    return Object.keys(item).length === expectedEntryKeys.length
      && expectedEntryKeys.every((key) => key in item)
      && safeText("entry_id", 128)
      && safeText("revision_id", 128)
      && typeof item.revision_number === "number"
      && Number.isInteger(item.revision_number)
      && item.revision_number >= 0
      && safeText("zone_id", 128)
      && safeText("zone_name", 256)
      && safeText("language", 32)
      && safeText("model_id", 256)
      && safeText("reasoning_effort", 128)
      && Array.isArray(item.included_scopes)
      && item.included_scopes.every((scope) => typeof scope === "string" && [
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
      ].includes(scope))
      && typeof item.completed_at_unix_ms === "number"
      && Number.isInteger(item.completed_at_unix_ms)
      && item.completed_at_unix_ms > 0
      && typeof item.is_current_revision === "boolean"
      && safeText("question", 4000)
      && !containsSensitivePath(JSON.stringify(item.answer))
      && isStructuredAiAnswer(item.answer);
  });
}
