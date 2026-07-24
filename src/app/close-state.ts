export const APP_CLOSE_REQUESTED_EVENT = "contam-studio://app-close-requested";

export interface CloseRequestView {
  request_id: string;
  draft_decision_required: boolean;
  active_work: string[];
  repeated: boolean;
}

export interface CloseResolution {
  request_id: string;
  status: "cancelled" | "awaiting_draft_export" | "export_failed" | "closing" | "blocked";
  needs_export: boolean;
  close_started: boolean;
  error_code: string | null;
}

const REQUEST_ID_PATTERN = /^close-[1-9][0-9]{0,18}$/;
const ACTIVE_WORK = new Set(["patch_review", "project_operation", "ai_turn"]);

export function isSafeCloseRequest(value: CloseRequestView): boolean {
  return REQUEST_ID_PATTERN.test(value.request_id)
    && typeof value.draft_decision_required === "boolean"
    && Array.isArray(value.active_work)
    && value.active_work.length <= ACTIVE_WORK.size
    && value.active_work.every((item) => ACTIVE_WORK.has(item))
    && new Set(value.active_work).size === value.active_work.length
    && typeof value.repeated === "boolean";
}

export function isSafeCloseResolution(value: CloseResolution, requestId: string): boolean {
  return REQUEST_ID_PATTERN.test(value.request_id)
    && value.request_id === requestId
    && ["cancelled", "awaiting_draft_export", "export_failed", "closing", "blocked"].includes(value.status)
    && typeof value.needs_export === "boolean"
    && typeof value.close_started === "boolean"
    && (value.error_code === null || /^[a-z0-9_]{1,80}$/.test(value.error_code))
    && (value.status === "closing" ? value.close_started && !value.needs_export && value.error_code === null : !value.close_started);
}
