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
  | { type: "cancelled"; requestId: string }
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

export function studyResultFilter(raw: string): { parameter: string | null; value: number | null } {
  const trimmed = raw.trim();
  if (trimmed === "") return { parameter: null, value: null };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { parameter: "zone-volume", value } : { parameter: null, value: null };
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
      return state.activeRequestId === action.requestId ? { ...state, status: "cancelled", activeRequestId: null } : state;
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
