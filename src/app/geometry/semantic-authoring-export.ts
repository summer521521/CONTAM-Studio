import type { ReaderDiagnostic } from "../project-state";
import { sanitizeDiagnostic } from "../project-state";

export type SemanticAuthoringExportStatus = "idle" | "exporting" | "success" | "cancelled" | "error";

export interface SemanticAuthoringExportSummary {
  file_name: string;
  sha256: string;
  size_bytes: number;
  added_zone_count: number;
  added_flow_path_count: number;
  zone_number_by_id: Record<string, number>;
  flow_path_number_by_id: Record<string, number>;
  sketchpad_geometry_written: false;
}

export interface DesktopSemanticAuthoringExportResponse {
  request_id: string;
  cancelled: boolean;
  project_session_id: string | null;
  revision_id: string | null;
  export: SemanticAuthoringExportSummary | null;
  error: ReaderDiagnostic | null;
}

export interface SemanticAuthoringExportState {
  status: SemanticAuthoringExportStatus;
  summary: SemanticAuthoringExportSummary | null;
  issue: ReaderDiagnostic | null;
}

export const INITIAL_SEMANTIC_AUTHORING_EXPORT_STATE: SemanticAuthoringExportState = {
  status: "idle",
  summary: null,
  issue: null,
};

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function issue(code: string, message: string): ReaderDiagnostic {
  return { code, message, source_line_number: null, context: {} };
}

function exactNumberMap(
  value: Record<string, number>,
  expectedIds: readonly string[],
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedIds].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  const numbers = Object.values(value);
  return numbers.every((number) => Number.isSafeInteger(number) && number > 0)
    && new Set(numbers).size === numbers.length;
}

export function semanticAuthoringExportResponseIssue(
  response: DesktopSemanticAuthoringExportResponse,
  requestId: string,
  projectSessionId: string,
  revisionId: string,
  expectedZoneIds: readonly string[],
  expectedFlowPathIds: readonly string[],
): ReaderDiagnostic | null {
  if (response.request_id !== requestId) {
    return issue("semantic_authoring_export_request_mismatch", "Semantic authoring export request mismatch");
  }
  if (response.error) {
    return response.export === null && !response.cancelled
      ? sanitizeDiagnostic(response.error)
      : issue("semantic_authoring_export_response_invalid", "Semantic authoring export error response was invalid");
  }
  if (response.project_session_id !== projectSessionId || response.revision_id !== revisionId) {
    return issue("semantic_authoring_export_context_stale", "Semantic authoring export context mismatch");
  }
  if (response.cancelled) {
    return response.export === null
      ? null
      : issue("semantic_authoring_export_response_invalid", "Cancelled semantic authoring export returned a payload");
  }
  const summary = response.export;
  const expectedObjectCount = expectedZoneIds.length + expectedFlowPathIds.length;
  if (!summary
    || expectedObjectCount === 0
    || summary.file_name.length < 5
    || summary.file_name.length > 255
    || /[\\/]/.test(summary.file_name)
    || !summary.file_name.toLowerCase().endsWith(".prj")
    || !SHA256_PATTERN.test(summary.sha256)
    || !Number.isSafeInteger(summary.size_bytes)
    || summary.size_bytes <= 0
    || summary.size_bytes > 32 * 1024 * 1024
    || summary.added_zone_count !== expectedZoneIds.length
    || summary.added_flow_path_count !== expectedFlowPathIds.length
    || !exactNumberMap(summary.zone_number_by_id, expectedZoneIds)
    || !exactNumberMap(summary.flow_path_number_by_id, expectedFlowPathIds)
    || summary.sketchpad_geometry_written !== false) {
    return issue("semantic_authoring_export_response_invalid", "Semantic authoring export response failed validation");
  }
  return null;
}
