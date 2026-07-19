import type { ReaderDiagnostic } from "./project-state";

export type ResultExportStatus =
  | "idle"
  | "selecting_destination"
  | "exporting"
  | "succeeded"
  | "cancelled"
  | "error";

export interface ZoneAirStateCsvExportSummary {
  file_name: string;
  row_count: number;
  byte_count: number;
  run_id: string;
  extraction_id: string;
  zone_id: string;
  zone_number: number;
}

export interface DesktopZoneAirStateCsvExportResponse {
  request_id: string;
  cancelled: boolean;
  project_session_id: string | null;
  export: ZoneAirStateCsvExportSummary | null;
  error: ReaderDiagnostic | null;
}

export const RESULT_EXPORT_STAGE_EVENT = "zone-result-export-stage";

export interface ResultExportStageEvent {
  request_id: string;
  stage: "exporting";
}

export interface ResultExportState {
  status: ResultExportStatus;
  activeSequence: number | null;
  activeRequestId: string | null;
  projectSessionId: string | null;
  zoneId: string | null;
  zoneNumber: number | null;
  runId: string | null;
  extractionId: string | null;
  summary: ZoneAirStateCsvExportSummary | null;
  issue: ReaderDiagnostic | null;
}

export const INITIAL_RESULT_EXPORT_STATE: ResultExportState = {
  status: "idle",
  activeSequence: null,
  activeRequestId: null,
  projectSessionId: null,
  zoneId: null,
  zoneNumber: null,
  runId: null,
  extractionId: null,
  summary: null,
  issue: null,
};

export type ResultExportAction =
  | {
      type: "selection_started";
      sequence: number;
      requestId: string;
      projectSessionId: string;
      zoneId: string;
      zoneNumber: number;
      runId: string;
      extractionId: string;
    }
  | { type: "host_exporting_started"; requestId: string }
  | { type: "export_cancelled"; sequence: number; requestId: string }
  | {
      type: "export_succeeded";
      sequence: number;
      requestId: string;
      projectSessionId: string;
      summary: ZoneAirStateCsvExportSummary;
    }
  | { type: "export_failed"; sequence: number; requestId: string; issue: ReaderDiagnostic }
  | { type: "result_changed" };

function isCurrent(state: ResultExportState, sequence: number, requestId: string): boolean {
  return state.activeSequence === sequence && state.activeRequestId === requestId;
}

export function resultExportReducer(
  state: ResultExportState,
  action: ResultExportAction,
): ResultExportState {
  switch (action.type) {
    case "selection_started":
      return {
        status: "selecting_destination",
        activeSequence: action.sequence,
        activeRequestId: action.requestId,
        projectSessionId: action.projectSessionId,
        zoneId: action.zoneId,
        zoneNumber: action.zoneNumber,
        runId: action.runId,
        extractionId: action.extractionId,
        summary: null,
        issue: null,
      };
    case "host_exporting_started":
      return state.activeRequestId === action.requestId
        ? { ...state, status: "exporting" }
        : state;
    case "export_cancelled":
      return isCurrent(state, action.sequence, action.requestId)
        ? { ...state, status: "cancelled", activeSequence: null, activeRequestId: null, summary: null, issue: null }
        : state;
    case "export_succeeded":
      return isCurrent(state, action.sequence, action.requestId)
        ? {
            ...state,
            status: "succeeded",
            activeSequence: null,
            activeRequestId: null,
            projectSessionId: action.projectSessionId,
            zoneId: action.summary.zone_id,
            zoneNumber: action.summary.zone_number,
            runId: action.summary.run_id,
            extractionId: action.summary.extraction_id,
            summary: action.summary,
            issue: null,
          }
        : state;
    case "export_failed":
      return isCurrent(state, action.sequence, action.requestId)
        ? { ...state, status: "error", activeSequence: null, activeRequestId: null, summary: null, issue: action.issue }
        : state;
    case "result_changed":
      return INITIAL_RESULT_EXPORT_STATE;
  }
}

export function resultExportResponseIssue(
  response: DesktopZoneAirStateCsvExportResponse,
  requestId: string,
): ReaderDiagnostic | null {
  if (response.request_id !== requestId) {
    return { code: "export_response_contract_invalid", message: "Export request mismatch", source_line_number: null, context: {} };
  }
  if (response.cancelled) {
    return response.project_session_id === null && response.export === null && response.error === null
      ? null
      : { code: "export_response_contract_invalid", message: "Cancelled export response invalid", source_line_number: null, context: {} };
  }
  const success = response.export !== null
    && response.error === null
    && typeof response.project_session_id === "string"
    && response.project_session_id.length > 0;
  const failure = response.export === null && response.error !== null;
  if (!success && !failure) {
    return { code: "export_response_contract_invalid", message: "Export response invalid", source_line_number: null, context: {} };
  }
  return response.error;
}
