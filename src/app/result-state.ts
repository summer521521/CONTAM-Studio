import type { ReaderDiagnostic } from "./project-state";

export type ZoneResultStatus = "idle" | "selecting" | "loading" | "loaded" | "cancelled" | "error";
export type ResultLoadSource = "active_run" | "selected_manifest";
export const SIMREAD_NODE_AIR_STATE_UNAVAILABLE = "simread_node_air_state_unavailable";

export function isSimReadNodeAirStateUnavailable(code: string | null | undefined): boolean {
  return code === SIMREAD_NODE_AIR_STATE_UNAVAILABLE;
}

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
  zone_id: string;
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
  zoneId: string | null;
  zoneNumber: number | null;
  result: ZoneAirStateResult | null;
  resultSource: ResultLoadSource | null;
  pendingSource: ResultLoadSource | null;
  issue: ReaderDiagnostic | null;
}

export type ResultAction =
  | { type: "selection_started"; sequence: number; requestId: string; projectSessionId: string; zoneId: string; zoneNumber: number }
  | { type: "active_run_started"; sequence: number; requestId: string; projectSessionId: string; zoneId: string; zoneNumber: number }
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
  zoneId: null,
  zoneNumber: null,
  result: null,
  resultSource: null,
  pendingSource: null,
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
        zoneId: action.zoneId,
        zoneNumber: action.zoneNumber,
        pendingSource: "selected_manifest",
        issue: null,
      };
    case "active_run_started":
      return {
        ...state,
        status: "loading",
        activeSequence: action.sequence,
        activeRequestId: action.requestId,
        projectSessionId: action.projectSessionId,
        zoneId: action.zoneId,
        zoneNumber: action.zoneNumber,
        pendingSource: "active_run",
        issue: null,
      };
    case "host_loading_started":
      return state.activeRequestId === action.requestId && state.pendingSource === "selected_manifest"
        ? { ...state, status: "loading" }
        : state;
    case "load_cancelled":
      return current(state, action.sequence, action.requestId)
        ? { ...state, status: "cancelled", activeSequence: null, activeRequestId: null, pendingSource: null, issue: null }
        : state;
    case "load_succeeded":
      return current(state, action.sequence, action.requestId)
        ? {
            ...state,
            status: "loaded",
            activeSequence: null,
            activeRequestId: null,
            projectSessionId: action.projectSessionId,
            zoneId: action.result.zone_id,
            zoneNumber: action.result.zone_number,
            result: action.result,
            resultSource: state.pendingSource,
            pendingSource: null,
            issue: null,
          }
        : state;
    case "load_failed":
      return current(state, action.sequence, action.requestId)
        ? { ...state, status: "error", activeSequence: null, activeRequestId: null, pendingSource: null, issue: action.issue }
        : state;
    case "project_or_zone_changed":
      return { ...INITIAL_RESULT_STATE };
    case "issue_cleared":
      return { ...state, issue: null };
  }
}

export function resultIsOlderThanActiveRun(
  state: ResultState,
  activeRunId: string | null,
): boolean {
  return Boolean(state.result && activeRunId && state.result.run_id !== activeRunId);
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
