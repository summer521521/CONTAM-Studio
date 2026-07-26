import type { ReaderDiagnostic } from "./project-state";

export type StudyStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "partial";
export type StudySampleStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type StudyMode = "single_scan" | "cartesian" | "user_combinations";
export type StudyParameterType = "zone_volume_m3" | "zone_name" | "flow_path_multiplier" | "schedule_value" | "species_initial";

export interface StudyParameter {
  parameter_id: string;
  parameter_type: StudyParameterType;
  object_id: string;
  name: string;
  unit: string | null;
  minimum: number | null;
  maximum: number | null;
  step: number | null;
  discrete_values: Array<string | number>;
  default_value: string | number | null;
}

export interface StudyParameterDraft {
  parameter_id: string;
  parameter_type: StudyParameterType;
  object_id: string;
  name: string;
  unit: string | null;
  minimum: string;
  maximum: string;
  step: string;
  discrete_values: Array<string | number>;
  default_value: string | number | null;
}

export interface StudyParameterTarget {
  object_id: string;
  name: string;
  parameter_type: Extract<StudyParameterType, "zone_volume_m3" | "flow_path_multiplier">;
  unit: string;
  default_value: number;
}

export const MAX_STUDY_CASES = 32;

const PARAMETER_PREFIX: Record<StudyParameterTarget["parameter_type"], string> = {
  zone_volume_m3: "zone-volume",
  flow_path_multiplier: "flow-path-multiplier",
};

export function stableStudyParameterId(parameterType: StudyParameterTarget["parameter_type"], objectId: string): string {
  return `${PARAMETER_PREFIX[parameterType]}-${objectId}`;
}

export function makeStudyParameterDraft(target: StudyParameterTarget): StudyParameterDraft {
  const value = Number.isFinite(target.default_value) ? target.default_value : 1;
  const isVolume = target.parameter_type === "zone_volume_m3";
  const minimum = isVolume ? Math.max(0.1, value * 0.8) : Math.max(0.01, value * 0.5);
  const maximum = isVolume ? Math.max(minimum, value * 1.2) : Math.max(minimum, value * 1.5);
  const step = isVolume ? Math.max(0.1, (maximum - minimum) / 2) : Math.max(0.01, (maximum - minimum) / 2);
  return {
    parameter_id: stableStudyParameterId(target.parameter_type, target.object_id),
    parameter_type: target.parameter_type,
    object_id: target.object_id,
    name: target.name,
    unit: target.unit,
    minimum: String(minimum),
    maximum: String(maximum),
    step: String(step),
    discrete_values: [],
    default_value: value,
  };
}

function finiteDraftNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function studyDraftToParameter(draft: StudyParameterDraft): StudyParameter | null {
  const minimum = finiteDraftNumber(draft.minimum);
  const maximum = finiteDraftNumber(draft.maximum);
  const step = finiteDraftNumber(draft.step);
  if (!draft.parameter_id || !draft.object_id || !draft.name || minimum === null || maximum === null || step === null) return null;
  if (minimum > maximum || step <= 0) return null;
  return {
    parameter_id: draft.parameter_id,
    parameter_type: draft.parameter_type,
    object_id: draft.object_id,
    name: draft.name,
    unit: draft.unit,
    minimum,
    maximum,
    step,
    discrete_values: draft.discrete_values,
    default_value: draft.default_value,
  };
}

export function studyParameterValueCount(parameter: StudyParameter): number {
  if (parameter.discrete_values.length) return parameter.discrete_values.length;
  if (parameter.minimum === null || parameter.maximum === null || parameter.step === null || parameter.step <= 0 || parameter.minimum > parameter.maximum) return 0;
  const tolerance = Math.max(1e-12, Math.abs(parameter.step) * 1e-9);
  const span = parameter.maximum - parameter.minimum;
  const wholeSteps = Math.floor((span + tolerance) / parameter.step);
  const last = parameter.minimum + wholeSteps * parameter.step;
  return last < parameter.maximum - tolerance ? wholeSteps + 2 : wholeSteps + 1;
}

export function estimateStudyCombinations(parameters: StudyParameter[], mode: StudyMode, maxCombinations = MAX_STUDY_CASES): { counts: number[]; total: number; overLimit: boolean } {
  const counts = parameters.map(studyParameterValueCount);
  if (counts.some((count) => count <= 0)) return { counts, total: 0, overLimit: false };
  if (mode === "single_scan") return { counts, total: parameters.length === 1 ? counts[0] : 0, overLimit: parameters.length !== 1 || counts[0] > maxCombinations };
  const total = counts.reduce((product, count) => product > maxCombinations ? maxCombinations + 1 : product * count, 1);
  return { counts, total, overLimit: total > maxCombinations };
}

export function validateStudyParameterDrafts(drafts: StudyParameterDraft[], mode: StudyMode, maxCombinations = MAX_STUDY_CASES): { parameters: StudyParameter[]; estimate: ReturnType<typeof estimateStudyCombinations>; issue: string | null } {
  const parameters = drafts.map(studyDraftToParameter);
  if (!drafts.length) return { parameters: [], estimate: { counts: [], total: 0, overLimit: false }, issue: "parameter_required" };
  if (parameters.some((parameter) => parameter === null)) return { parameters: [], estimate: { counts: [], total: 0, overLimit: false }, issue: "parameter_invalid" };
  const safeParameters = parameters as StudyParameter[];
  const targets = safeParameters.map((parameter) => `${parameter.parameter_type}:${parameter.object_id}`);
  if (new Set(targets).size !== targets.length) return { parameters: [], estimate: { counts: [], total: 0, overLimit: false }, issue: "duplicate_parameter_target" };
  const estimate = estimateStudyCombinations(safeParameters, mode, maxCombinations);
  if (mode === "single_scan" && safeParameters.length !== 1) return { parameters: safeParameters, estimate, issue: "single_scan_requires_one_parameter" };
  if (estimate.total <= 0) return { parameters: safeParameters, estimate, issue: "parameter_invalid" };
  if (estimate.overLimit) return { parameters: safeParameters, estimate, issue: "combination_limit" };
  return { parameters: safeParameters, estimate, issue: null };
}

export interface StudySample {
  sample_id: string;
  ordinal: number;
  values: Record<string, string | number>;
  status: StudySampleStatus;
}

export interface StudyPlan {
  schema_version: "study_plan.v1";
  study_id: string;
  baseline_project_sha256: string;
  revision_id: string;
  patch_sha256: string | null;
  parameters: StudyParameter[];
  mode: StudyMode;
  max_combinations: number;
  samples: StudySample[];
  study_hash: string;
  created_at: string;
}

export interface StudySampleResult {
  schema_version: "study_sample_result.v1";
  study_id: string;
  study_hash: string;
  sample_id: string;
  status: StudySampleStatus;
  parameters: Record<string, string | number>;
  project_sha256: string;
  solver_manifest: Record<string, string>;
  statistics: Record<string, string | number | null>;
  result_hash: string | null;
  error: { code: string; message: string } | null;
  generated_at: string;
  provenance: "synthetic fixture" | "official tool result" | "user project result";
  evidence: Array<Record<string, string | number | null>>;
  attempt_id?: string | null;
}

export interface StudyAnalysis {
  schema_version: "study_analysis.v1";
  sample_count: number;
  mean: number;
  minimum: number;
  maximum: number;
  spread: number;
  conclusions: Array<{ kind: string; text: string; evidence: Array<Record<string, string | number | null>> }>;
  limitations: string[];
  trace: { evidence_refs: Array<Record<string, string | number | null>>; analysis_hash: string };
}

export interface DesktopStudyResponse {
  request_id: string;
  project_session_id: string | null;
  study_id: string | null;
  result: Record<string, unknown> | null;
  error: ReaderDiagnostic | null;
}

export interface StudyState {
  status: StudyStatus;
  plan: StudyPlan | null;
  results: StudySampleResult[];
  analysis: StudyAnalysis | null;
  stale: boolean;
  issue: ReaderDiagnostic | null;
  activeRequestId: string | null;
}

export type StudyAction =
  | { type: "plan_ready"; requestId: string; plan: StudyPlan }
  | { type: "run_started"; requestId: string }
  | { type: "run_succeeded"; requestId: string; results: StudySampleResult[]; status: StudyStatus }
  | { type: "run_failed"; requestId: string; issue: ReaderDiagnostic }
  | { type: "page_loaded"; results: StudySampleResult[]; stale: boolean }
  | { type: "analysis_ready"; analysis: StudyAnalysis }
  | { type: "cancelled"; requestId: string; allowQueued?: boolean }
  | { type: "issue"; issue: ReaderDiagnostic }
  | { type: "reset" };

export const INITIAL_STUDY_STATE: StudyState = {
  status: "queued",
  plan: null,
  results: [],
  analysis: null,
  stale: false,
  issue: null,
  activeRequestId: null,
};

export function studyResultFilter(raw: string, parameterId = "zone-volume"): { parameter: string | null; value: number | null } {
  const trimmed = raw.trim();
  if (trimmed === "") return { parameter: null, value: null };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { parameter: parameterId || null, value } : { parameter: null, value: null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

export function isSafeStudyPlan(value: unknown): value is StudyPlan {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudyPlan>;
  return item.schema_version === "study_plan.v1" && typeof item.study_id === "string" && UUID.test(item.study_id) &&
    typeof item.study_hash === "string" && SHA256.test(item.study_hash) && typeof item.baseline_project_sha256 === "string" && SHA256.test(item.baseline_project_sha256) &&
    typeof item.revision_id === "string" && UUID.test(item.revision_id) && Array.isArray(item.parameters) && Array.isArray(item.samples) && item.samples.length > 0;
}

export function isSafeStudySampleResult(value: unknown): value is StudySampleResult {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudySampleResult>;
  return item.schema_version === "study_sample_result.v1" && typeof item.sample_id === "string" && UUID.test(item.sample_id) &&
    typeof item.study_hash === "string" && SHA256.test(item.study_hash) && typeof item.status === "string" &&
    ["queued", "running", "succeeded", "failed", "cancelled"].includes(item.status) && typeof item.parameters === "object";
}

export function studyReducer(state: StudyState, action: StudyAction): StudyState {
  switch (action.type) {
    case "plan_ready":
      return { ...state, status: "queued", plan: action.plan, results: [], analysis: null, stale: false, issue: null, activeRequestId: null };
    case "run_started":
      return { ...state, status: "running", activeRequestId: action.requestId, issue: null, analysis: null };
    case "run_succeeded":
      if (state.activeRequestId !== action.requestId) return state;
      return { ...state, status: action.status, results: action.results, activeRequestId: null, issue: null };
    case "run_failed":
      if (state.activeRequestId !== action.requestId) return state;
      return { ...state, status: "failed", activeRequestId: null, issue: action.issue };
    case "page_loaded":
      return { ...state, results: action.results, stale: action.stale };
    case "analysis_ready":
      return { ...state, analysis: action.analysis, issue: null };
    case "cancelled":
      if (state.activeRequestId) return state.activeRequestId === action.requestId ? { ...state, status: "cancelled", activeRequestId: null } : state;
      return action.allowQueued === true && state.status === "queued" ? { ...state, status: "cancelled", issue: null } : state;
    case "issue":
      return { ...state, issue: action.issue };
    case "reset":
      return INITIAL_STUDY_STATE;
  }
}

export function studyStatusFromResults(results: StudySampleResult[], total: number): StudyStatus {
  if (results.length === 0) return "queued";
  if (results.some((item) => item.status === "running") || results.length < total) return "running";
  const statuses = new Set(results.map((item) => item.status));
  if (statuses.size === 1 && statuses.has("succeeded")) return "succeeded";
  if (statuses.size === 1 && statuses.has("failed")) return "failed";
  if (statuses.size === 1 && statuses.has("cancelled")) return "cancelled";
  return "partial";
}
