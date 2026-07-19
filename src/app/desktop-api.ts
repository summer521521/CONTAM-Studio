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
import type {
  AiContextScope,
  DesktopAiActionResponse,
  DesktopAiContextPreviewResponse,
  DesktopAiTurnResponse,
  DesktopCodexConnectionResponse,
  DesktopCodexProbeResponse,
} from "./ai-state";

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

export async function probeCodexAppServer(requestId: string): Promise<DesktopCodexProbeResponse> {
  return invoke<DesktopCodexProbeResponse>("probe_codex_app_server", { requestId });
}

export async function connectCodexAppServer(requestId: string): Promise<DesktopCodexConnectionResponse> {
  return invoke<DesktopCodexConnectionResponse>("connect_codex_app_server", { requestId });
}

export async function refreshCodexAccount(requestId: string): Promise<DesktopCodexConnectionResponse> {
  return invoke<DesktopCodexConnectionResponse>("refresh_codex_account", { requestId });
}

export async function previewAiContext(
  requestId: string,
  projectSessionId: string,
  revisionId: string,
  zoneId: string,
  scopes: AiContextScope[],
  language: string,
  modelId: string,
  reasoningEffort: string,
): Promise<DesktopAiContextPreviewResponse> {
  return invoke<DesktopAiContextPreviewResponse>("preview_ai_context", {
    requestId,
    projectSessionId,
    revisionId,
    zoneId,
    scopes,
    language,
    modelId,
    reasoningEffort,
  });
}

export async function startReadonlyAiTurn(
  requestId: string,
  projectSessionId: string,
  revisionId: string,
  zoneId: string,
  previewId: string,
  question: string,
  scopes: AiContextScope[],
  language: string,
  modelId: string,
  reasoningEffort: string,
): Promise<DesktopAiTurnResponse> {
  return invoke<DesktopAiTurnResponse>("start_readonly_ai_turn", {
    requestId,
    projectSessionId,
    revisionId,
    zoneId,
    previewId,
    question,
    scopes,
    language,
    modelId,
    reasoningEffort,
  });
}

export async function interruptReadonlyAiTurn(requestId: string): Promise<DesktopAiActionResponse> {
  return invoke<DesktopAiActionResponse>("interrupt_readonly_ai_turn", { requestId });
}

export async function clearReadonlyAiSession(requestId: string): Promise<DesktopAiActionResponse> {
  return invoke<DesktopAiActionResponse>("clear_readonly_ai_session", { requestId });
}

export async function disconnectCodexAppServer(requestId: string): Promise<DesktopAiActionResponse> {
  return invoke<DesktopAiActionResponse>("disconnect_codex_app_server", { requestId });
}
