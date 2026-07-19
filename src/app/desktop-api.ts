import { invoke } from "@tauri-apps/api/core";
import type {
  DesktopApplyResponse,
  DesktopPlanResponse,
} from "./patch-state";
import type { DesktopOpenResponse } from "./project-state";
import type { DesktopDraftExportResponse, DesktopDraftTransitionResponse } from "./project-state";
import type { DesktopZoneAirStateResponse } from "./result-state";
import type { DesktopZoneAirStateCsvExportResponse } from "./result-export-state";
import type { DesktopRunResponse } from "./run-state";

export async function selectAndReadPrjZones(
  requestId: string,
): Promise<DesktopOpenResponse> {
  return invoke<DesktopOpenResponse>("select_and_read_prj_zones", { requestId });
}

export async function planZoneVolumePatch(
  requestId: string,
  projectSessionId: string,
  zoneId: string,
  newVolumeToken: string,
): Promise<DesktopPlanResponse> {
  return invoke<DesktopPlanResponse>("plan_zone_volume_patch", {
    requestId,
    projectSessionId,
    zoneId,
    newVolumeToken,
  });
}

export async function applyZoneVolumePatchToDraft(
  requestId: string,
  projectSessionId: string,
  patchId: string,
): Promise<DesktopApplyResponse> {
  return invoke<DesktopApplyResponse>("apply_zone_volume_patch_to_draft", {
    requestId,
    projectSessionId,
    patchId,
  });
}

export async function selectAndExtractZoneAirState(
  requestId: string,
  projectSessionId: string,
  zoneId: string,
): Promise<DesktopZoneAirStateResponse> {
  return invoke<DesktopZoneAirStateResponse>("select_and_extract_zone_air_state", {
    requestId,
    projectSessionId,
    zoneId,
  });
}

export async function extractActiveRunZoneAirState(
  requestId: string,
  projectSessionId: string,
  zoneId: string,
): Promise<DesktopZoneAirStateResponse> {
  return invoke<DesktopZoneAirStateResponse>("extract_active_run_zone_air_state", {
    requestId,
    projectSessionId,
    zoneId,
  });
}

export async function exportActiveZoneAirStateCsv(
  requestId: string,
  projectSessionId: string,
  zoneId: string,
  runId: string,
  extractionId: string,
): Promise<DesktopZoneAirStateCsvExportResponse> {
  return invoke<DesktopZoneAirStateCsvExportResponse>("export_active_zone_air_state_csv", {
    requestId,
    projectSessionId,
    zoneId,
    runId,
    extractionId,
  });
}

export async function undoProjectDraft(
  requestId: string,
  projectSessionId: string,
): Promise<DesktopDraftTransitionResponse> {
  return invoke<DesktopDraftTransitionResponse>("undo_project_draft", { requestId, projectSessionId });
}

export async function redoProjectDraft(
  requestId: string,
  projectSessionId: string,
): Promise<DesktopDraftTransitionResponse> {
  return invoke<DesktopDraftTransitionResponse>("redo_project_draft", { requestId, projectSessionId });
}

export async function exportActiveProjectDraftCopy(
  requestId: string,
  projectSessionId: string,
  revisionId: string,
): Promise<DesktopDraftExportResponse> {
  return invoke<DesktopDraftExportResponse>("export_active_project_draft_copy", {
    requestId,
    projectSessionId,
    revisionId,
  });
}

export async function runActiveContamProject(
  requestId: string,
  projectSessionId: string,
): Promise<DesktopRunResponse> {
  return invoke<DesktopRunResponse>("run_active_contam_project", {
    requestId,
    projectSessionId,
  });
}
