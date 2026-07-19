export const BRIDGE_PROTOCOL_VERSION = "1.2";

export type ProjectStatus =
  | "idle"
  | "selecting"
  | "loading"
  | "loaded"
  | "cancelled"
  | "unsupported"
  | "error";

export interface ReaderDiagnostic {
  code: string;
  message: string;
  source_line_number: number | null;
  context: Record<string, string | number>;
}

export interface ZoneRecord {
  zone_id: string;
  contam_number: number;
  name: string;
  flags: number;
  level_number: number;
  relative_height: number;
  volume_m3: number;
  source_line_number: number;
}

export interface ProjectInspection {
  schema_version: string;
  reader_mode: string;
  source_path: string;
  source_sha256: string;
  source_size_bytes: number;
  source_unchanged: boolean;
  header_version: string;
  header_variant: number;
  declared_zone_count: number;
  zones: ZoneRecord[];
  first_zone: ZoneRecord | null;
  diagnostics: ReaderDiagnostic[];
}

export interface BridgeEnvelope {
  protocol_version: string;
  request_id: string;
  ok: boolean;
  result: ProjectInspection | null;
  error: ReaderDiagnostic | null;
}

export interface DesktopOpenResponse {
  request_id: string;
  cancelled: boolean;
  project_session_id: string | null;
  envelope: BridgeEnvelope | null;
  draft: DraftSummary | null;
}

export interface DraftSummary {
  revision_id: string;
  revision_number: number;
  history_tip: number;
  dirty: boolean;
  exported: boolean;
  can_undo: boolean;
  can_redo: boolean;
}

export interface DesktopDraftTransitionResponse {
  request_id: string;
  project_session_id: string | null;
  project: ProjectInspection | null;
  draft: DraftSummary | null;
  error: ReaderDiagnostic | null;
}

export interface DraftExportSummary {
  file_name: string;
  sha256: string;
  size_bytes: number;
  zone_count: number;
  revision_number: number;
  matches_active_revision: boolean;
}

export interface DesktopDraftExportResponse {
  request_id: string;
  cancelled: boolean;
  project_session_id: string | null;
  export: DraftExportSummary | null;
  error: ReaderDiagnostic | null;
}

export interface ProjectState {
  status: ProjectStatus;
  activeSequence: number | null;
  activeRequestId: string | null;
  project: ProjectInspection | null;
  projectSessionId: string | null;
  draft: DraftSummary | null;
  selectedZoneKey: string | null;
  issue: ReaderDiagnostic | null;
}

export type ProjectAction =
  | { type: "selection_started"; sequence: number }
  | { type: "selection_cancelled"; sequence: number }
  | { type: "selection_failed"; sequence: number; issue: ReaderDiagnostic }
  | { type: "loading_started"; sequence: number; requestId: string }
  | {
      type: "loading_succeeded";
      sequence: number;
      requestId: string;
      project: ProjectInspection;
      projectSessionId: string;
      draft: DraftSummary;
    }
  | {
      type: "loading_failed";
      sequence: number;
      requestId: string;
      issue: ReaderDiagnostic;
    }
  | {
      type: "draft_replaced";
      project: ProjectInspection;
      projectSessionId: string;
      targetZoneId: string;
      draft: DraftSummary;
    }
  | { type: "draft_exported"; revisionId: string }
  | { type: "issue_reported"; issue: ReaderDiagnostic }
  | { type: "issue_cleared" }
  | { type: "zone_selected"; zoneKey: string };

export const INITIAL_PROJECT_STATE: ProjectState = {
  status: "idle",
  activeSequence: null,
  activeRequestId: null,
  project: null,
  projectSessionId: null,
  draft: null,
  selectedZoneKey: null,
  issue: null,
};

const UNSUPPORTED_CODES = new Set([
  "invalid_source_extension",
  "non_ascii_prj",
  "unsupported_prj_version",
  "zone_section_not_found",
  "multiple_zone_sections",
  "invalid_zone_count",
  "zone_header_missing",
  "zone_count_mismatch",
  "zone_terminator_missing",
  "unsupported_zone_layout",
  "invalid_zone_field",
  "duplicate_zone_number",
  "unsupported_zone_name",
  "unsupported_zone_conditional_fields",
]);

const SAFE_CONTEXT_KEYS = new Set([
  "byte_offset",
  "candidate_count",
  "contam_number",
  "declared_count",
  "expected",
  "exit_code",
  "field",
  "field_count",
  "header_variant",
  "header_version",
  "max_bytes",
  "name_length",
  "parsed_count",
  "token",
]);

export function zoneSelectionKey(_project: ProjectInspection, zone: ZoneRecord): string {
  return zone.zone_id;
}

export function projectFileName(sourcePath: string): string {
  const parts = sourcePath.split(/[\\/]/);
  return parts.at(-1) || sourcePath;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export function isDraftSummaryValid(draft: DraftSummary): boolean {
  return UUID_PATTERN.test(draft.revision_id) &&
    Number.isInteger(draft.revision_number) && draft.revision_number >= 0 &&
    Number.isInteger(draft.history_tip) && draft.history_tip >= draft.revision_number &&
    typeof draft.dirty === "boolean" && typeof draft.exported === "boolean" &&
    draft.can_undo === (draft.revision_number > 0) &&
    draft.can_redo === (draft.revision_number < draft.history_tip);
}

export function isSafeProjectInspection(project: ProjectInspection): boolean {
  if (project.schema_version !== "1.0" || project.source_path.length === 0 || project.source_path.length > 255 || /[\\/]/.test(project.source_path)) return false;
  if (!SHA256_PATTERN.test(project.source_sha256) || !Number.isInteger(project.source_size_bytes) || project.source_size_bytes < 0 || project.source_unchanged !== true) return false;
  if (!Number.isInteger(project.declared_zone_count) || project.declared_zone_count !== project.zones.length || !Array.isArray(project.diagnostics)) return false;
  const zoneIds = new Set<string>();
  for (const zone of project.zones) {
    if (!UUID_PATTERN.test(zone.zone_id) || zoneIds.has(zone.zone_id) || !Number.isInteger(zone.contam_number) || zone.contam_number <= 0 || !Number.isInteger(zone.source_line_number) || zone.source_line_number <= 0 || zone.name.length === 0 || zone.name.length > 80 || !Number.isFinite(zone.volume_m3)) return false;
    zoneIds.add(zone.zone_id);
  }
  return project.first_zone === null || project.zones.some((zone) => zone.zone_id === project.first_zone?.zone_id);
}

export function isDraftExportSummaryValid(summary: DraftExportSummary): boolean {
  return summary.file_name.length > 4 && summary.file_name.length <= 255 && !/[\\/]/.test(summary.file_name) && summary.file_name.toLowerCase().endsWith(".prj") &&
    SHA256_PATTERN.test(summary.sha256) && Number.isInteger(summary.size_bytes) && summary.size_bytes >= 0 &&
    Number.isInteger(summary.zone_count) && summary.zone_count >= 0 && Number.isInteger(summary.revision_number) && summary.revision_number >= 0 &&
    summary.matches_active_revision === true;
}

export function selectedZone(state: ProjectState): ZoneRecord | null {
  if (!state.project || !state.selectedZoneKey) return null;
  return (
    state.project.zones.find(
      (zone) => zoneSelectionKey(state.project as ProjectInspection, zone) === state.selectedZoneKey,
    ) ?? null
  );
}

export function sanitizeDiagnostic(diagnostic: ReaderDiagnostic): ReaderDiagnostic {
  const context = Object.fromEntries(
    Object.entries(diagnostic.context ?? {})
      .filter(([key, value]) =>
        SAFE_CONTEXT_KEYS.has(key) && (typeof value === "number" || typeof value === "string"),
      )
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 120) : value]),
  );
  return {
    code: diagnostic.code.slice(0, 80),
    message: diagnostic.message.slice(0, 240),
    source_line_number:
      typeof diagnostic.source_line_number === "number" ? diagnostic.source_line_number : null,
    context,
  };
}

function isCurrentRequest(
  state: ProjectState,
  sequence: number,
  requestId?: string,
): boolean {
  return (
    state.activeSequence === sequence &&
    (requestId === undefined || state.activeRequestId === requestId)
  );
}

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case "selection_started":
      return {
        ...state,
        status: "selecting",
        activeSequence: action.sequence,
        activeRequestId: null,
        issue: null,
      };
    case "selection_cancelled":
      if (!isCurrentRequest(state, action.sequence)) return state;
      return {
        ...state,
        status: "cancelled",
        activeSequence: null,
        activeRequestId: null,
        issue: null,
      };
    case "selection_failed":
      if (!isCurrentRequest(state, action.sequence)) return state;
      return {
        ...state,
        status: "error",
        activeSequence: null,
        activeRequestId: null,
        issue: sanitizeDiagnostic(action.issue),
      };
    case "loading_started":
      if (!isCurrentRequest(state, action.sequence)) return state;
      return {
        ...state,
        status: "loading",
        activeRequestId: action.requestId,
        issue: null,
      };
    case "loading_succeeded":
      if (!isCurrentRequest(state, action.sequence, action.requestId)) return state;
      return {
        status: "loaded",
        activeSequence: null,
        activeRequestId: null,
        project: action.project,
        projectSessionId: action.projectSessionId,
        draft: action.draft,
        selectedZoneKey: action.project.zones[0]
          ? zoneSelectionKey(action.project, action.project.zones[0])
          : null,
        issue: null,
      };
    case "loading_failed":
      if (!isCurrentRequest(state, action.sequence, action.requestId)) return state;
      return {
        ...state,
        status: UNSUPPORTED_CODES.has(action.issue.code) ? "unsupported" : "error",
        activeSequence: null,
        activeRequestId: null,
        issue: sanitizeDiagnostic(action.issue),
      };
    case "draft_replaced": {
      const target = action.project.zones.find(
        (zone) => zone.zone_id === action.targetZoneId,
      );
      return {
        status: "loaded",
        activeSequence: null,
        activeRequestId: null,
        project: action.project,
        projectSessionId: action.projectSessionId,
        draft: action.draft,
        selectedZoneKey: target ? zoneSelectionKey(action.project, target) : null,
        issue: null,
      };
    }
    case "draft_exported":
      return state.draft?.revision_id === action.revisionId
        ? { ...state, draft: { ...state.draft, exported: true } }
        : state;
    case "issue_reported":
      return { ...state, issue: sanitizeDiagnostic(action.issue) };
    case "issue_cleared":
      return { ...state, issue: null };
    case "zone_selected":
      if (
        !state.project ||
        !state.project.zones.some(
          (zone) => zoneSelectionKey(state.project as ProjectInspection, zone) === action.zoneKey,
        )
      ) {
        return state;
      }
      return { ...state, selectedZoneKey: action.zoneKey };
  }
}

export function envelopeIssue(envelope: BridgeEnvelope, requestId: string): ReaderDiagnostic | null {
  if (envelope.protocol_version !== BRIDGE_PROTOCOL_VERSION) {
    return {
      code: "python_response_protocol_mismatch",
      message: "Bridge protocol mismatch",
      source_line_number: null,
      context: {},
    };
  }
  if (envelope.request_id !== requestId) {
    return {
      code: "python_response_request_mismatch",
      message: "Bridge request mismatch",
      source_line_number: null,
      context: {},
    };
  }
  if (!envelope.ok) {
    return envelope.error
      ? sanitizeDiagnostic(envelope.error)
      : {
          code: "python_response_contract_invalid",
          message: "Bridge response contract invalid",
          source_line_number: null,
          context: {},
        };
  }
  if (!envelope.result || envelope.error || !isSafeProjectInspection(envelope.result)) {
    return {
      code: "python_response_contract_invalid",
      message: "Bridge response contract invalid",
      source_line_number: null,
      context: {},
    };
  }
  return null;
}

export function desktopOpenIssue(
  response: DesktopOpenResponse,
  requestId: string,
): ReaderDiagnostic | null {
  if (response.request_id !== requestId) {
    return {
      code: "desktop_response_request_mismatch",
      message: "Desktop open response did not match the request",
      source_line_number: null,
      context: {},
    };
  }
  if (
    response.cancelled !== (response.envelope === null) ||
    (response.cancelled && response.project_session_id !== null) ||
    (response.cancelled && response.draft !== null) ||
    (!response.cancelled && response.envelope?.ok === true && (!response.project_session_id || !response.draft || !isDraftSummaryValid(response.draft))) ||
    (!response.cancelled && response.envelope?.ok !== true && response.draft !== null)
  ) {
    return {
      code: "desktop_response_contract_invalid",
      message: "Desktop open response contract invalid",
      source_line_number: null,
      context: {},
    };
  }
  return null;
}
