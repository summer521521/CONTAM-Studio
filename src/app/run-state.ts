import type { ReaderDiagnostic } from "./project-state";

export type RunStatus = "idle" | "running" | "succeeded" | "error";

export interface ContamXRunSummary {
  status: "succeeded";
  run_id: string;
  solver_name: string;
  solver_version: string;
  started_at_utc: string;
  duration_ms: number;
  exit_code: number;
  timed_out: boolean;
  sim_artifact_count: number;
  source_unchanged: boolean;
}

export interface DesktopRunResponse {
  request_id: string;
  project_session_id: string | null;
  summary: ContamXRunSummary | null;
  error: ReaderDiagnostic | null;
}

export interface RunState {
  status: RunStatus;
  activeSequence: number | null;
  activeRequestId: string | null;
  projectSessionId: string | null;
  summary: ContamXRunSummary | null;
  issue: ReaderDiagnostic | null;
}

export const INITIAL_RUN_STATE: RunState = {
  status: "idle",
  activeSequence: null,
  activeRequestId: null,
  projectSessionId: null,
  summary: null,
  issue: null,
};

export type RunAction =
  | { type: "run_started"; sequence: number; requestId: string; projectSessionId: string }
  | { type: "run_succeeded"; sequence: number; requestId: string; projectSessionId: string; summary: ContamXRunSummary }
  | { type: "run_failed"; sequence: number; requestId: string; issue: ReaderDiagnostic }
  | { type: "project_changed" };

export function runReducer(state: RunState, action: RunAction): RunState {
  if (action.type === "project_changed") return INITIAL_RUN_STATE;
  if (action.type === "run_started") {
    return {
      status: "running",
      activeSequence: action.sequence,
      activeRequestId: action.requestId,
      projectSessionId: action.projectSessionId,
      summary: state.projectSessionId === action.projectSessionId ? state.summary : null,
      issue: null,
    };
  }
  if (state.activeSequence !== action.sequence || state.activeRequestId !== action.requestId) {
    return state;
  }
  if (action.type === "run_succeeded") {
    return {
      status: "succeeded",
      activeSequence: null,
      activeRequestId: null,
      projectSessionId: action.projectSessionId,
      summary: action.summary,
      issue: null,
    };
  }
  return {
    ...state,
    status: "error",
    activeSequence: null,
    activeRequestId: null,
    issue: action.issue,
  };
}

export function runResponseIssue(response: DesktopRunResponse, requestId: string): ReaderDiagnostic | null {
  if (response.request_id !== requestId) {
    return { code: "python_response_request_mismatch", message: "Run response did not match request", source_line_number: null, context: {} };
  }
  if ((response.summary === null) === (response.error === null)) {
    return { code: "run_response_contract_invalid", message: "Run response contract invalid", source_line_number: null, context: {} };
  }
  return response.error;
}
