import { sanitizeDiagnostic, type ProjectInspection, type ReaderDiagnostic } from "./project-state";

export type PatchStatus =
  | "idle"
  | "editing"
  | "planning"
  | "review"
  | "applying"
  | "success"
  | "error";

export interface PatchReviewView {
  project_session_id: string;
  patch_id: string;
  zone_number: number;
  zone_name: string;
  field: "volume_m3";
  old_token: string;
  new_token: string;
  old_value: number;
  new_value: number;
  source_line_number: number;
  old_line: string;
  new_line: string;
  diff_text: string;
}

export interface DesktopPlanResponse {
  request_id: string;
  review: PatchReviewView | null;
  error: ReaderDiagnostic | null;
}

export interface DesktopApplyResponse {
  request_id: string;
  cancelled: boolean;
  project_session_id: string | null;
  project: ProjectInspection | null;
  target_zone_number: number | null;
  error: ReaderDiagnostic | null;
}

export interface PatchState {
  status: PatchStatus;
  newVolumeToken: string;
  planRequestId: string | null;
  applyRequestId: string | null;
  projectSessionId: string | null;
  zoneNumber: number | null;
  patchId: string | null;
  review: PatchReviewView | null;
  issue: ReaderDiagnostic | null;
}

export const INITIAL_PATCH_STATE: PatchState = {
  status: "idle",
  newVolumeToken: "",
  planRequestId: null,
  applyRequestId: null,
  projectSessionId: null,
  zoneNumber: null,
  patchId: null,
  review: null,
  issue: null,
};

export type PatchAction =
  | { type: "start_editing"; projectSessionId: string; zoneNumber: number; token: string }
  | { type: "input_changed"; token: string }
  | { type: "plan_started"; requestId: string }
  | { type: "plan_succeeded"; requestId: string; review: PatchReviewView }
  | { type: "plan_failed"; requestId: string; issue: ReaderDiagnostic }
  | { type: "return_to_edit" }
  | { type: "cancel" }
  | { type: "apply_started"; requestId: string }
  | { type: "apply_cancelled"; requestId: string }
  | { type: "apply_failed"; requestId: string; issue: ReaderDiagnostic; invalidate: boolean }
  | { type: "apply_succeeded"; requestId: string }
  | { type: "project_or_zone_changed" };

export function patchReducer(state: PatchState, action: PatchAction): PatchState {
  switch (action.type) {
    case "start_editing":
      return {
        ...INITIAL_PATCH_STATE,
        status: "editing",
        newVolumeToken: action.token,
        projectSessionId: action.projectSessionId,
        zoneNumber: action.zoneNumber,
      };
    case "input_changed":
      return { ...state, status: "editing", newVolumeToken: action.token, patchId: null, review: null, issue: null };
    case "plan_started":
      return { ...state, status: "planning", planRequestId: action.requestId, issue: null };
    case "plan_succeeded":
      if (state.planRequestId !== action.requestId || state.newVolumeToken !== action.review.new_token) return state;
      return { ...state, status: "review", planRequestId: null, patchId: action.review.patch_id, review: action.review, issue: null };
    case "plan_failed":
      if (state.planRequestId !== action.requestId) return state;
      return { ...state, status: "error", planRequestId: null, issue: sanitizeDiagnostic(action.issue) };
    case "return_to_edit":
      return { ...state, status: "editing", patchId: null, review: null, issue: null };
    case "cancel":
    case "project_or_zone_changed":
      return INITIAL_PATCH_STATE;
    case "apply_started":
      return { ...state, status: "applying", applyRequestId: action.requestId, issue: null };
    case "apply_cancelled":
      if (state.applyRequestId !== action.requestId) return state;
      return { ...state, status: "review", applyRequestId: null };
    case "apply_failed":
      if (state.applyRequestId !== action.requestId) return state;
      if (action.invalidate) {
        return { ...state, status: "error", applyRequestId: null, patchId: null, review: null, issue: sanitizeDiagnostic(action.issue) };
      }
      return { ...state, status: "review", applyRequestId: null, issue: sanitizeDiagnostic(action.issue) };
    case "apply_succeeded":
      if (state.applyRequestId !== action.requestId) return state;
      return { ...INITIAL_PATCH_STATE, status: "success" };
  }
}

export function patchResponseIssue(
  response: DesktopPlanResponse,
  requestId: string,
): ReaderDiagnostic | null {
  if (response.request_id !== requestId || (response.review === null) === (response.error === null)) {
    return { code: "patch_response_contract_invalid", message: "Patch response contract invalid", source_line_number: null, context: {} };
  }
  return response.error ? sanitizeDiagnostic(response.error) : null;
}

export function applyResponseIssue(
  response: DesktopApplyResponse,
  requestId: string,
): ReaderDiagnostic | null {
  if (response.request_id !== requestId) {
    return { code: "patch_apply_response_invalid", message: "Patch apply response mismatch", source_line_number: null, context: {} };
  }
  const success = !response.cancelled && response.project !== null && response.project_session_id !== null && response.target_zone_number !== null && response.error === null;
  const cancelled = response.cancelled && response.project === null && response.project_session_id === null && response.error === null;
  const failed = !response.cancelled && response.project === null && response.project_session_id === null && response.error !== null;
  if (!success && !cancelled && !failed) {
    return { code: "patch_apply_response_invalid", message: "Patch apply response contract invalid", source_line_number: null, context: {} };
  }
  return response.error ? sanitizeDiagnostic(response.error) : null;
}
