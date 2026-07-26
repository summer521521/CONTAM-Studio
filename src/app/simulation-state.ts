import { isDraftSummaryValid, isSafeProjectInspection, sanitizeDiagnostic, type DraftSummary, type ProjectInspection, type ReaderDiagnostic } from "./project-state";
import type { ZoneAirStateResult } from "./result-state";
import type { ContamXRunSummary } from "./run-state";
import { isSafeAttachmentEvidence, type AttachmentEvidenceView } from "./attachment-state";

export type AssistantMode = "analysis" | "simulation_plan";
export type SimulationStatus = "idle" | "planning" | "needs_input" | "ready" | "unsupported" | "executing" | "succeeded" | "failed" | "cancelled";
export type SimulationPlanStatus = "needs_input" | "ready" | "unsupported";

export interface SimulationAction {
  action: "replace_zone_volume" | "run_current_revision" | "analyze_active_zone_result";
  zone_id?: string;
  new_volume_token?: string;
}

export interface SimulationDiffView {
  zone_id: string;
  zone_name: string;
  field: "volume_m3";
  old_token: string;
  new_token: string;
  old_value: number;
  new_value: number;
}

export interface SimulationPlanView {
  schema_version: "simulation_plan.v1";
  plan_id: string;
  status: SimulationPlanStatus;
  goal: string;
  project_session_id: string | null;
  revision_id: string | null;
  revision_number: number | null;
  zone_id: string | null;
  zone_name: string | null;
  assumptions: string[];
  questions: string[];
  actions: SimulationAction[];
  risks: string[];
  context_fingerprint: string;
  volume_diff: SimulationDiffView | null;
  attachment_evidence: AttachmentEvidenceView[];
}

export interface SimulationTimelineStepView {
  step: "validate_context" | "create_draft_revision" | "run_contamx" | "read_result" | "analyze_result";
  status: "pending" | "completed" | "failed";
}

export interface SafeAiAnalysisView {
  result_type: "zone_air_state";
  zone_id: string;
  zone_name: string;
  run_id: string;
  extraction_id: string;
  sample_count: number;
  temperature_k_min: number;
  temperature_k_max: number;
  reference_pressure_pa_min: number;
  reference_pressure_pa_max: number;
  limitations: string[];
}

export interface SimulationExecutionView {
  trace_id: string;
  plan_hash: string;
  approval_hash: string;
  revision_id: string | null;
  revision_number: number | null;
  run_id: string | null;
  extraction_id: string | null;
  previous_trusted_result_available: boolean;
  safe_ai_analysis: SafeAiAnalysisView | null;
}

export interface DesktopSimulationPlanResponse {
  request_id: string;
  plan: SimulationPlanView | null;
  error: ReaderDiagnostic | null;
}

export interface DesktopSimulationExecutionResponse {
  request_id: string;
  status: "succeeded" | "failed";
  timeline: SimulationTimelineStepView[];
  execution: SimulationExecutionView | null;
  project_session_id: string | null;
  project: ProjectInspection | null;
  target_zone_id: string | null;
  draft: DraftSummary | null;
  run: ContamXRunSummary | null;
  result: ZoneAirStateResult | null;
  error: ReaderDiagnostic | null;
}

export interface SimulationState {
  mode: AssistantMode;
  status: SimulationStatus;
  goal: string;
  activeRequestId: string | null;
  plan: SimulationPlanView | null;
  timeline: SimulationTimelineStepView[];
  execution: SimulationExecutionView | null;
  issue: ReaderDiagnostic | null;
}

export const SIMULATION_TIMELINE: SimulationTimelineStepView[] = [
  { step: "validate_context", status: "pending" },
  { step: "create_draft_revision", status: "pending" },
  { step: "run_contamx", status: "pending" },
  { step: "read_result", status: "pending" },
  { step: "analyze_result", status: "pending" },
];

export const INITIAL_SIMULATION_STATE: SimulationState = {
  mode: "analysis",
  status: "idle",
  goal: "",
  activeRequestId: null,
  plan: null,
  timeline: SIMULATION_TIMELINE,
  execution: null,
  issue: null,
};

export type SimulationActionState =
  | { type: "mode_changed"; mode: AssistantMode }
  | { type: "goal_changed"; goal: string }
  | { type: "plan_started"; requestId: string }
  | { type: "plan_received"; requestId: string; plan: SimulationPlanView }
  | { type: "plan_failed"; requestId: string; issue: ReaderDiagnostic }
  | { type: "plan_cancelled" }
  | { type: "execution_started"; requestId: string }
  | { type: "execution_finished"; requestId: string; response: DesktopSimulationExecutionResponse }
  | { type: "context_changed" };

export function simulationReducer(state: SimulationState, action: SimulationActionState): SimulationState {
  switch (action.type) {
    case "mode_changed":
      return { ...state, mode: action.mode };
    case "goal_changed":
      return { ...state, goal: action.goal, status: "idle", plan: null, execution: null, timeline: SIMULATION_TIMELINE, issue: null };
    case "plan_started":
      return { ...state, status: "planning", activeRequestId: action.requestId, plan: null, execution: null, timeline: SIMULATION_TIMELINE, issue: null };
    case "plan_received":
      if (state.activeRequestId !== action.requestId) return state;
      return {
        ...state,
        status: action.plan.status === "ready" ? "ready" : action.plan.status,
        activeRequestId: null,
        plan: action.plan,
        issue: null,
      };
    case "plan_failed":
      return state.activeRequestId === action.requestId
        ? { ...state, status: "failed", activeRequestId: null, issue: sanitizeDiagnostic(action.issue) }
        : state;
    case "plan_cancelled":
      return { ...state, status: "cancelled", activeRequestId: null, plan: null, execution: null, timeline: SIMULATION_TIMELINE, issue: null };
    case "execution_started":
      return state.status === "ready"
        ? { ...state, status: "executing", activeRequestId: action.requestId, execution: null, timeline: SIMULATION_TIMELINE, issue: null }
        : state;
    case "execution_finished":
      if (state.activeRequestId !== action.requestId) return state;
      return {
        ...state,
        status: action.response.status === "succeeded" ? "succeeded" : "failed",
        activeRequestId: null,
        timeline: action.response.timeline,
        execution: action.response.execution,
        issue: action.response.error ? sanitizeDiagnostic(action.response.error) : null,
      };
    case "context_changed":
      return { ...INITIAL_SIMULATION_STATE, mode: state.mode };
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;

function safeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) && !/[A-Za-z]:\\|\\\\|file:\/\//i.test(value);
}

function isSimulationAction(value: unknown): value is SimulationAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  if (action.action === "replace_zone_volume") {
    return Object.keys(action).length === 3 && safeText(action.zone_id, 128) && safeText(action.new_volume_token, 80);
  }
  if (action.action === "run_current_revision") return Object.keys(action).length === 1;
  return action.action === "analyze_active_zone_result" && Object.keys(action).length === 2 && safeText(action.zone_id, 128);
}

export function isSafeSimulationPlan(value: unknown): value is SimulationPlanView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  const keys = ["schema_version", "plan_id", "status", "goal", "project_session_id", "revision_id", "revision_number", "zone_id", "zone_name", "assumptions", "questions", "actions", "risks", "context_fingerprint", "volume_diff", "attachment_evidence"];
  if (Object.keys(plan).length !== keys.length || !keys.every((key) => key in plan) || plan.schema_version !== "simulation_plan.v1" || !UUID_PATTERN.test(String(plan.plan_id)) || !["needs_input", "ready", "unsupported"].includes(String(plan.status)) || !safeText(plan.goal, 2000) || !HASH_PATTERN.test(String(plan.context_fingerprint))) return false;
  const nullableText = (item: unknown, max: number) => item === null || safeText(item, max);
  const nullableInteger = (item: unknown) => item === null || (typeof item === "number" && Number.isInteger(item) && item >= 0);
  const textArray = (item: unknown, max: number) => Array.isArray(item) && item.length <= 8 && item.every((entry) => safeText(entry, max));
  if (!nullableText(plan.project_session_id, 128) || !nullableText(plan.revision_id, 128) || !nullableInteger(plan.revision_number) || !nullableText(plan.zone_id, 128) || !nullableText(plan.zone_name, 256) || !textArray(plan.assumptions, 512) || !textArray(plan.questions, 512) || !textArray(plan.risks, 512) || !Array.isArray(plan.actions) || plan.actions.length > 3 || !plan.actions.every(isSimulationAction)) return false;
  if (plan.volume_diff !== null) {
    const diff = plan.volume_diff as Record<string, unknown>;
    if (!diff || typeof diff !== "object" || Array.isArray(diff) || Object.keys(diff).length !== 7 || !safeText(diff.zone_id, 128) || !safeText(diff.zone_name, 256) || diff.field !== "volume_m3" || !safeText(diff.old_token, 80) || !safeText(diff.new_token, 80) || !Number.isFinite(diff.old_value) || !Number.isFinite(diff.new_value)) return false;
  }
  if (!Array.isArray(plan.attachment_evidence) || plan.attachment_evidence.length > 32 || !plan.attachment_evidence.every(isSafeAttachmentEvidence)) return false;
  if (plan.status === "ready") {
    return plan.actions.length === 3 && plan.volume_diff !== null && typeof plan.zone_id === "string" && typeof plan.revision_id === "string";
  }
  return plan.actions.length === 0 && plan.volume_diff === null;
}

function isTimeline(value: unknown): value is SimulationTimelineStepView[] {
  const steps = ["validate_context", "create_draft_revision", "run_contamx", "read_result", "analyze_result"];
  return Array.isArray(value) && value.length === steps.length && value.every((entry, index) => entry && typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 2 && (entry as Record<string, unknown>).step === steps[index] && ["pending", "completed", "failed"].includes(String((entry as Record<string, unknown>).status)));
}

function isSafeDiagnostic(value: unknown): value is ReaderDiagnostic {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const diagnostic = value as Record<string, unknown>;
  if (Object.keys(diagnostic).length !== 4 || !safeText(diagnostic.code, 80) || !safeText(diagnostic.message, 240)) return false;
  if (diagnostic.source_line_number !== null && (!Number.isInteger(diagnostic.source_line_number) || Number(diagnostic.source_line_number) < 1)) return false;
  if (!diagnostic.context || typeof diagnostic.context !== "object" || Array.isArray(diagnostic.context) || Object.keys(diagnostic.context as Record<string, unknown>).length > 16) return false;
  return Object.entries(diagnostic.context as Record<string, unknown>).every(([key, item]) => /^[a-z_]{1,64}$/.test(key) && (typeof item === "number" ? Number.isFinite(item) : safeText(item, 120)));
}

function isSafeRunSummary(value: unknown): value is ContamXRunSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  const keys = ["status", "run_id", "solver_name", "solver_version", "started_at_utc", "duration_ms", "exit_code", "timed_out", "sim_artifact_count", "source_unchanged"];
  return Object.keys(run).length === keys.length && keys.every((key) => key in run) && run.status === "succeeded" && safeText(run.run_id, 128) && safeText(run.solver_name, 128) && safeText(run.solver_version, 128) && safeText(run.started_at_utc, 64) && Number.isInteger(run.duration_ms) && Number(run.duration_ms) >= 0 && Number.isInteger(run.exit_code) && Number(run.exit_code) === 0 && typeof run.timed_out === "boolean" && run.timed_out === false && Number.isInteger(run.sim_artifact_count) && Number(run.sim_artifact_count) > 0 && run.source_unchanged === true;
}

function isSafeZoneAirStateResult(value: unknown): value is ZoneAirStateResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const keys = ["schema_version", "result_type", "run_id", "extraction_id", "zone_id", "zone_number", "zone_name", "source_line_number", "unit_system", "sample_count", "samples", "day_type_source", "time_contract"];
  if (Object.keys(result).length !== keys.length || !keys.every((key) => key in result) || !safeText(result.schema_version, 32) || result.result_type !== "zone_air_state" || !safeText(result.run_id, 128) || !safeText(result.extraction_id, 128) || !safeText(result.zone_id, 128) || !Number.isInteger(result.zone_number) || Number(result.zone_number) <= 0 || !safeText(result.zone_name, 256) || !Number.isInteger(result.source_line_number) || Number(result.source_line_number) <= 0 || result.unit_system !== "SI" || !Number.isInteger(result.sample_count) || Number(result.sample_count) <= 0 || Number(result.sample_count) > 50_000 || !safeText(result.day_type_source, 128) || !safeText(result.time_contract, 128) || !Array.isArray(result.samples) || result.samples.length !== result.sample_count) return false;
  return result.samples.every((sample) => {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) return false;
    const entry = sample as Record<string, unknown>;
    return Object.keys(entry).length === 7 && Number.isInteger(entry.index) && Number(entry.index) >= 0 && Number.isInteger(entry.day_of_year) && Number(entry.day_of_year) >= 1 && Number(entry.day_of_year) <= 366 && (entry.day_type === null || safeText(entry.day_type, 64)) && Number.isFinite(entry.sim_time_seconds) && Number(entry.sim_time_seconds) >= 0 && Number.isFinite(entry.temperature_k) && Number.isFinite(entry.reference_pressure_pa) && Number.isFinite(entry.air_density_kg_m3) && Number(entry.air_density_kg_m3) > 0;
  });
}

function isSafeExecution(value: unknown): value is SimulationExecutionView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const execution = value as Record<string, unknown>;
  const keys = ["trace_id", "plan_hash", "approval_hash", "revision_id", "revision_number", "run_id", "extraction_id", "previous_trusted_result_available", "safe_ai_analysis"];
  if (Object.keys(execution).length !== keys.length || !keys.every((key) => key in execution) || !UUID_PATTERN.test(String(execution.trace_id)) || !HASH_PATTERN.test(String(execution.plan_hash)) || !HASH_PATTERN.test(String(execution.approval_hash)) || typeof execution.previous_trusted_result_available !== "boolean") return false;
  const nullableText = (item: unknown) => item === null || safeText(item, 128);
  if (!nullableText(execution.revision_id) || !nullableText(execution.run_id) || !nullableText(execution.extraction_id) || !(execution.revision_number === null || (typeof execution.revision_number === "number" && Number.isInteger(execution.revision_number) && execution.revision_number >= 0))) return false;
  if (execution.safe_ai_analysis === null) return true;
  const analysis = execution.safe_ai_analysis as Record<string, unknown>;
  return Boolean(analysis) && typeof analysis === "object" && !Array.isArray(analysis) && Object.keys(analysis).length === 11 && analysis.result_type === "zone_air_state" && safeText(analysis.zone_id, 128) && safeText(analysis.zone_name, 256) && safeText(analysis.run_id, 128) && safeText(analysis.extraction_id, 128) && typeof analysis.sample_count === "number" && Number.isInteger(analysis.sample_count) && analysis.sample_count > 0 && Number.isFinite(analysis.temperature_k_min) && Number.isFinite(analysis.temperature_k_max) && Number.isFinite(analysis.reference_pressure_pa_min) && Number.isFinite(analysis.reference_pressure_pa_max) && Array.isArray(analysis.limitations) && analysis.limitations.length <= 8 && analysis.limitations.every((item) => safeText(item, 512));
}

export function isSafeSimulationExecutionResponse(value: unknown, requestId: string): value is DesktopSimulationExecutionResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  const keys = ["request_id", "status", "timeline", "execution", "project_session_id", "project", "target_zone_id", "draft", "run", "result", "error"];
  if (Object.keys(response).length !== keys.length || !keys.every((key) => key in response) || response.request_id !== requestId || !["succeeded", "failed"].includes(String(response.status)) || !isTimeline(response.timeline)) return false;
  const nullableText = (item: unknown, max: number) => item === null || safeText(item, max);
  if (!nullableText(response.project_session_id, 128) || !nullableText(response.target_zone_id, 128) || (response.execution !== null && !isSafeExecution(response.execution)) || (response.project !== null && !isSafeProjectInspection(response.project as ProjectInspection)) || (response.draft !== null && !isDraftSummaryValid(response.draft as DraftSummary)) || (response.run !== null && !isSafeRunSummary(response.run)) || (response.result !== null && !isSafeZoneAirStateResult(response.result)) || (response.error !== null && !isSafeDiagnostic(response.error))) return false;
  if (response.status === "succeeded") {
    return response.execution !== null && response.execution.safe_ai_analysis !== null && response.project !== null && response.draft !== null && response.run !== null && response.result !== null && response.error === null && response.execution.run_id === response.run.run_id && response.execution.extraction_id === response.result.extraction_id && response.result.run_id === response.run.run_id && response.execution.safe_ai_analysis.run_id === response.run.run_id && response.execution.safe_ai_analysis.extraction_id === response.result.extraction_id;
  }
  return response.error !== null;
}
