import type { ReaderDiagnostic } from "./project-state";

export type ZoneResultStatus = "idle" | "selecting" | "loading" | "loaded" | "cancelled" | "error";

export interface ZoneAirStateSample {
  index: number;
  day_of_year: number;
  day_type: string | null;
  sim_time_seconds: number;
  temperature_k: number;
  reference_pressure_pa: number;
  air_density_kg_m3: number;
}

export interface ZoneAirStateResult {
  schema_version: string;
  result_type: "zone_air_state";
  run_id: string;
  extraction_id: string;
  zone_number: number;
  zone_name: string;
  source_line_number: number;
  unit_system: "SI";
  sample_count: number;
  samples: ZoneAirStateSample[];
  day_type_source: string;
  time_contract: string;
}

export interface DesktopZoneAirStateResponse {
  request_id: string;
  cancelled: boolean;
  project_session_id: string | null;
  result: ZoneAirStateResult | null;
  error: ReaderDiagnostic | null;
}

export const ZONE_RESULT_STAGE_EVENT = "zone-result-stage";

export interface ZoneResultStageEvent {
  request_id: string;
  stage: "loading";
}

export interface ResultState {
  status: ZoneResultStatus;
  activeSequence: number | null;
  activeRequestId: string | null;
  projectSessionId: string | null;
  zoneNumber: number | null;
  result: ZoneAirStateResult | null;
  issue: ReaderDiagnostic | null;
}

export type ResultAction =
  | { type: "selection_started"; sequence: number; requestId: string; projectSessionId: string; zoneNumber: number }
  | { type: "host_loading_started"; requestId: string }
  | { type: "load_cancelled"; sequence: number; requestId: string }
  | { type: "load_succeeded"; sequence: number; requestId: string; projectSessionId: string; result: ZoneAirStateResult }
  | { type: "load_failed"; sequence: number; requestId: string; issue: ReaderDiagnostic }
  | { type: "project_or_zone_changed" }
  | { type: "issue_cleared" };

export const INITIAL_RESULT_STATE: ResultState = {
  status: "idle",
  activeSequence: null,
  activeRequestId: null,
  projectSessionId: null,
  zoneNumber: null,
  result: null,
  issue: null,
};

function current(state: ResultState, sequence: number, requestId: string): boolean {
  return state.activeSequence === sequence && state.activeRequestId === requestId;
}

export function resultReducer(state: ResultState, action: ResultAction): ResultState {
  switch (action.type) {
    case "selection_started":
      return {
        ...state,
        status: "selecting",
        activeSequence: action.sequence,
        activeRequestId: action.requestId,
        projectSessionId: action.projectSessionId,
        zoneNumber: action.zoneNumber,
        issue: null,
      };
    case "host_loading_started":
      return state.activeRequestId === action.requestId
        ? { ...state, status: "loading" }
        : state;
    case "load_cancelled":
      return current(state, action.sequence, action.requestId)
        ? { ...state, status: "cancelled", activeSequence: null, activeRequestId: null, issue: null }
        : state;
    case "load_succeeded":
      return current(state, action.sequence, action.requestId)
        ? {
            ...state,
            status: "loaded",
            activeSequence: null,
            activeRequestId: null,
            projectSessionId: action.projectSessionId,
            zoneNumber: action.result.zone_number,
            result: action.result,
            issue: null,
          }
        : state;
    case "load_failed":
      return current(state, action.sequence, action.requestId)
        ? { ...state, status: "error", activeSequence: null, activeRequestId: null, issue: action.issue }
        : state;
    case "project_or_zone_changed":
      return { ...INITIAL_RESULT_STATE };
    case "issue_cleared":
      return { ...state, issue: null };
  }
}

export function resultResponseIssue(
  response: DesktopZoneAirStateResponse,
  requestId: string,
): ReaderDiagnostic | null {
  if (response.request_id !== requestId) {
    return { code: "python_response_request_mismatch", message: "Result request mismatch", source_line_number: null, context: {} };
  }
  if (response.cancelled) return null;
  if (!response.result && !response.error) {
    return { code: "python_response_contract_invalid", message: "Result response invalid", source_line_number: null, context: {} };
  }
  return response.error;
}
