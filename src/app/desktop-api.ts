import { invoke } from "@tauri-apps/api/core";
import type {
  DesktopApplyResponse,
  DesktopPlanResponse,
} from "./patch-state";
import type { DesktopOpenResponse, ReaderDiagnostic } from "./project-state";
import type { DesktopDraftExportResponse, DesktopDraftTransitionResponse } from "./project-state";
import type { DesktopZoneAirStateResponse } from "./result-state";
import type { DesktopZoneAirStateCsvExportResponse } from "./result-export-state";
import type { DesktopRunResponse } from "./run-state";
import type { CloseResolution } from "./close-state";
import type { DesktopSimulationExecutionResponse, DesktopSimulationPlanResponse } from "./simulation-state";
import type { AttachmentEvidenceBundleView, AttachmentView } from "./attachment-state";
import type { SemanticOperationRequest, DesktopSemanticPatchPlanResponse, DesktopSemanticApplyResponse, DesktopSemanticSnapshotResponse } from "./semantic-state";
import type { DesktopStudyResponse, StudyPlan, StudySampleResult } from "./study-state";
import type {
  AiContextScope,
  DesktopAiConversationArchiveResponse,
  DesktopAiActionResponse,
  DesktopAiContextPreviewResponse,
  DesktopAiTurnResponse,
  DesktopCodexConnectionResponse,
  DesktopCodexInstallResponse,
  DesktopCodexProbeResponse,
  AiProviderLoginView,
  AiProviderModelView,
  AiProviderProfile,
  AiProviderView,
} from "./ai-state";
import type {
  DesktopActionResponse,
  DesktopDiagnosticsResponse,
  DesktopDirectoryResponse,
  DesktopSetupResponse,
  DesktopToolProbeResponse,
} from "./release-state";

export interface DesktopAiProviderProfilesResponse {
  request_id: string;
  profiles: AiProviderView[];
  error: { code: string; message: string } | null;
}

export interface DesktopAiProviderActionResponse {
  request_id: string;
  status: string;
  profiles: AiProviderView[] | null;
  error: { code: string; message: string } | null;
}

export interface DesktopAiProviderModelsResponse {
  request_id: string;
  profile_id: string;
  models: AiProviderModelView[];
  verified: boolean;
  error: { code: string; message: string } | null;
}

export interface DesktopAiProviderLoginResponse {
  request_id: string;
  status: string;
  login: AiProviderLoginView | null;
  connection: DesktopCodexConnectionResponse["connection"];
  error: { code: string; message: string } | null;
}

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

export async function readSemanticProject(requestId: string, projectSessionId: string, revisionId: string): Promise<DesktopSemanticSnapshotResponse> {
  return invoke<DesktopSemanticSnapshotResponse>("read_semantic_project", { requestId, projectSessionId, revisionId });
}

export async function getSemanticObject(requestId: string, projectSessionId: string, revisionId: string, objectId: string): Promise<DesktopSemanticSnapshotResponse> {
  return invoke<DesktopSemanticSnapshotResponse>("get_semantic_object", { requestId, projectSessionId, revisionId, objectId });
}

export async function planSemanticPatch(requestId: string, projectSessionId: string, revisionId: string, operations: SemanticOperationRequest[]): Promise<DesktopSemanticPatchPlanResponse> {
  return invoke<DesktopSemanticPatchPlanResponse>("plan_semantic_patch", { requestId, projectSessionId, revisionId, operations });
}

export async function applySemanticPatchToDraft(requestId: string, projectSessionId: string, patchId: string): Promise<DesktopSemanticApplyResponse> {
  return invoke<DesktopSemanticApplyResponse>("apply_semantic_patch_to_draft", { requestId, projectSessionId, patchId });
}

export async function discardSemanticPatch(requestId: string, projectSessionId: string, patchId: string): Promise<DesktopSemanticPatchPlanResponse> {
  return invoke<DesktopSemanticPatchPlanResponse>("discard_semantic_patch", { requestId, projectSessionId, patchId });
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

export async function prepareSimulationPlan(
  requestId: string,
  projectSessionId: string,
  revisionId: string,
  selectedZoneId: string,
  goal: string,
): Promise<DesktopSimulationPlanResponse> {
  return invoke<DesktopSimulationPlanResponse>("prepare_simulation_plan", {
    requestId,
    projectSessionId,
    revisionId,
    selectedZoneId,
    goal,
  });
}

export async function approveAndRunSimulationPlan(
  requestId: string,
  projectSessionId: string,
  planId: string,
  zoneId: string,
): Promise<DesktopSimulationExecutionResponse> {
  return invoke<DesktopSimulationExecutionResponse>("approve_and_run_simulation_plan", {
    requestId,
    projectSessionId,
    planId,
    zoneId,
  });
}

export async function prepareStudyPlan(
  requestId: string,
  projectSessionId: string,
  revisionId: string,
  parameters: unknown[],
  mode: string,
  userCombinations: unknown[] | null,
  patchSha256: string | null,
  maxCombinations: number,
): Promise<DesktopStudyResponse> {
  return invoke<DesktopStudyResponse>("prepare_study_plan", {
    requestId,
    projectSessionId,
    revisionId,
    parameters,
    mode,
    userCombinations,
    patchSha256,
    maxCombinations,
  });
}

export async function runStudy(
  requestId: string,
  projectSessionId: string,
  revisionId: string,
  plan: StudyPlan,
  solverPath: string | null,
  simreadPath: string | null,
): Promise<DesktopStudyResponse> {
  return invoke<DesktopStudyResponse>("run_study", {
    requestId,
    projectSessionId,
    revisionId,
    plan,
    solverPath,
    simreadPath,
  });
}

export async function cancelStudy(
  requestId: string,
  projectSessionId: string,
  studyId: string,
): Promise<DesktopStudyResponse> {
  return invoke<DesktopStudyResponse>("cancel_study", { requestId, projectSessionId, studyId });
}

export async function pageStudyResults(
  requestId: string,
  projectSessionId: string,
  studyId: string,
  planHash: string,
  page: number,
  limit: number,
  parameter: string | null,
  value: string | number | null,
  objectId: string | null,
  timeSeconds: number | null,
  sortBy: string,
  descending: boolean,
): Promise<DesktopStudyResponse> {
  return invoke<DesktopStudyResponse>("page_study_results", {
    requestId,
    projectSessionId,
    studyId,
    planHash,
    page,
    limit,
    parameter,
    value,
    objectId,
    timeSeconds,
    sortBy,
    descending,
  });
}

export async function analyzeStudyResults(
  requestId: string,
  projectSessionId: string,
  results: StudySampleResult[],
  baselineSampleId: string | null,
): Promise<DesktopStudyResponse> {
  return invoke<DesktopStudyResponse>("analyze_study_results", {
    requestId,
    projectSessionId,
    results,
    baselineSampleId,
  });
}

export async function exportStudyReport(
  requestId: string,
  projectSessionId: string,
  plan: StudyPlan,
  results: StudySampleResult[],
  solverManifest: Record<string, string>,
  analysis: unknown,
  provenance: string,
  format: string,
): Promise<DesktopStudyResponse> {
  return invoke<DesktopStudyResponse>("export_study_report", {
    requestId,
    projectSessionId,
    plan,
    results,
    solverManifest,
    analysis,
    provenance,
    format,
  });
}

export interface DesktopAttachmentListResponse { request_id: string; attachments: AttachmentView[]; busy: boolean; error: ReaderDiagnostic | null; }
export interface DesktopAttachmentImportResponse { request_id: string; cancelled: boolean; attachments: AttachmentView[]; error: ReaderDiagnostic | null; }
export interface DesktopAttachmentEvidenceResponse { request_id: string; bundle: AttachmentEvidenceBundleView | null; error: ReaderDiagnostic | null; }
export interface DesktopAttachmentActionResponse { request_id: string; attachments: AttachmentView[]; error: ReaderDiagnostic | null; }

export async function selectAndImportAttachments(requestId: string): Promise<DesktopAttachmentImportResponse> {
  return invoke<DesktopAttachmentImportResponse>("select_and_import_attachments", { requestId });
}
export async function listAttachments(requestId: string): Promise<DesktopAttachmentListResponse> {
  return invoke<DesktopAttachmentListResponse>("list_attachments", { requestId });
}
export async function setAttachmentAiSelection(requestId: string, attachmentId: string, selected: boolean): Promise<DesktopAttachmentActionResponse> {
  return invoke<DesktopAttachmentActionResponse>("set_attachment_ai_selection", { requestId, attachmentId, selected });
}
export async function previewAttachmentEvidence(requestId: string, projectSessionId: string, revisionId: string, language: string, modelId: string): Promise<DesktopAttachmentEvidenceResponse> {
  return invoke<DesktopAttachmentEvidenceResponse>("preview_attachment_evidence", { requestId, projectSessionId, revisionId, language, modelId });
}
export async function removeStudioAttachment(requestId: string, attachmentId: string): Promise<DesktopAttachmentActionResponse> {
  return invoke<DesktopAttachmentActionResponse>("remove_studio_attachment", { requestId, attachmentId });
}

export async function listAiProviderProfiles(requestId: string): Promise<DesktopAiProviderProfilesResponse> {
  return invoke<DesktopAiProviderProfilesResponse>("list_ai_provider_profiles", { requestId });
}

export async function saveAiProviderProfile(requestId: string, profile: AiProviderProfile): Promise<DesktopAiProviderActionResponse> {
  return invoke<DesktopAiProviderActionResponse>("save_ai_provider_profile", { requestId, profile });
}

export async function deleteAiProviderProfile(requestId: string, profileId: string): Promise<DesktopAiProviderActionResponse> {
  return invoke<DesktopAiProviderActionResponse>("delete_ai_provider_profile", { requestId, profileId });
}

export async function setAiProviderSecret(requestId: string, profileId: string, secret: string): Promise<DesktopAiProviderActionResponse> {
  try {
    return await invoke<DesktopAiProviderActionResponse>("set_ai_provider_secret", { requestId, profileId, secret });
  } finally {
    secret = "";
  }
}

export async function deleteAiProviderSecret(requestId: string, profileId: string): Promise<DesktopAiProviderActionResponse> {
  return invoke<DesktopAiProviderActionResponse>("delete_ai_provider_secret", { requestId, profileId });
}

export async function testAiProviderConnection(requestId: string, profileId: string): Promise<DesktopAiProviderActionResponse> {
  return invoke<DesktopAiProviderActionResponse>("test_ai_provider_connection", { requestId, profileId });
}

export async function refreshAiProviderModels(requestId: string, profileId: string): Promise<DesktopAiProviderModelsResponse> {
  return invoke<DesktopAiProviderModelsResponse>("refresh_ai_provider_models", { requestId, profileId });
}

export async function probeCodexAppServer(requestId: string): Promise<DesktopCodexProbeResponse> {
  return invoke<DesktopCodexProbeResponse>("probe_codex_app_server", { requestId });
}

export async function installOfficialCodexCli(requestId: string): Promise<DesktopCodexInstallResponse> {
  return invoke<DesktopCodexInstallResponse>("install_official_codex_cli", { requestId });
}

export async function connectCodexAppServer(requestId: string): Promise<DesktopCodexConnectionResponse> {
  return invoke<DesktopCodexConnectionResponse>("connect_codex_app_server", { requestId });
}

export async function refreshCodexAccount(requestId: string): Promise<DesktopCodexConnectionResponse> {
  return invoke<DesktopCodexConnectionResponse>("refresh_codex_account", { requestId });
}

export async function startAiProviderLogin(
  requestId: string,
  authMode: "chatgptDeviceCode" | "apiKey",
  apiKey?: string,
): Promise<DesktopAiProviderLoginResponse> {
  try {
    return await invoke<DesktopAiProviderLoginResponse>("start_ai_provider_login", { requestId, authMode, apiKey });
  } finally {
    apiKey = "";
  }
}

export async function cancelAiProviderLogin(requestId: string, loginId: string): Promise<DesktopAiProviderLoginResponse> {
  return invoke<DesktopAiProviderLoginResponse>("cancel_ai_provider_login", { requestId, loginId });
}

export async function logoutAiProvider(requestId: string): Promise<DesktopAiProviderLoginResponse> {
  return invoke<DesktopAiProviderLoginResponse>("logout_ai_provider", { requestId });
}

export async function previewAiContext(
  requestId: string,
  providerProfileId: string,
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
    providerProfileId,
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
  providerProfileId: string,
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
    providerProfileId,
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

export async function loadAiConversationArchive(
  requestId: string,
  projectSessionId: string,
  revisionId: string,
  zoneId: string,
): Promise<DesktopAiConversationArchiveResponse> {
  return invoke<DesktopAiConversationArchiveResponse>("load_ai_conversation_archive", {
    requestId,
    projectSessionId,
    revisionId,
    zoneId,
  });
}

export async function setAiConversationArchiveEnabled(
  requestId: string,
  enabled: boolean,
): Promise<DesktopAiActionResponse> {
  return invoke<DesktopAiActionResponse>("set_ai_conversation_archive_enabled", {
    requestId,
    enabled,
  });
}

export async function deleteAiConversationArchiveEntry(
  requestId: string,
  projectSessionId: string,
  revisionId: string,
  zoneId: string,
  archiveEntryId: string,
): Promise<DesktopAiActionResponse> {
  return invoke<DesktopAiActionResponse>("delete_ai_conversation_archive_entry", {
    requestId,
    projectSessionId,
    revisionId,
    zoneId,
    archiveEntryId,
  });
}

export async function clearAiConversationArchiveForZone(
  requestId: string,
  projectSessionId: string,
  revisionId: string,
  zoneId: string,
): Promise<DesktopAiActionResponse> {
  return invoke<DesktopAiActionResponse>("clear_ai_conversation_archive_for_zone", {
    requestId,
    projectSessionId,
    revisionId,
    zoneId,
  });
}

export async function clearAllAiConversationArchive(
  requestId: string,
): Promise<DesktopAiActionResponse> {
  return invoke<DesktopAiActionResponse>("clear_all_ai_conversation_archive", {
    requestId,
  });
}

export async function disconnectCodexAppServer(requestId: string): Promise<DesktopAiActionResponse> {
  return invoke<DesktopAiActionResponse>("disconnect_codex_app_server", { requestId });
}

export async function getStudioSetup(requestId: string): Promise<DesktopSetupResponse> {
  return invoke<DesktopSetupResponse>("get_studio_setup", { requestId });
}

export async function saveStudioSetup(
  requestId: string,
  language: string,
  theme: string,
  dataDirectory: string,
  contamxPath: string | null,
  simreadPath: string | null,
): Promise<DesktopSetupResponse> {
  return invoke<DesktopSetupResponse>("save_studio_setup", { requestId, language, theme, dataDirectory, contamxPath, simreadPath });
}

export async function selectDataDirectory(requestId: string): Promise<DesktopDirectoryResponse> {
  return invoke<DesktopDirectoryResponse>("select_data_directory", { requestId });
}

export async function selectAndProbeOfficialTool(requestId: string, toolKind: "contamx" | "simread"): Promise<DesktopToolProbeResponse> {
  return invoke<DesktopToolProbeResponse>("select_and_probe_official_tool", { requestId, toolKind });
}

export async function openStudioDirectory(requestId: string, directoryKind: "data" | "logs" | "cache"): Promise<DesktopActionResponse> {
  return invoke<DesktopActionResponse>("open_studio_directory", { requestId, directoryKind });
}

export async function clearStudioCache(requestId: string): Promise<DesktopActionResponse> {
  return invoke<DesktopActionResponse>("clear_studio_cache", { requestId });
}

export async function getDiagnosticsSummary(requestId: string): Promise<DesktopDiagnosticsResponse> {
  return invoke<DesktopDiagnosticsResponse>("get_diagnostics_summary", { requestId });
}

export async function exportSanitizedDiagnostics(requestId: string): Promise<DesktopDiagnosticsResponse> {
  return invoke<DesktopDiagnosticsResponse>("export_sanitized_diagnostics", { requestId });
}

export async function resolveAppClose(
  requestId: string,
  decision: "cancel" | "discard_draft" | "export_draft",
): Promise<CloseResolution> {
  return invoke<CloseResolution>("resolve_app_close", { requestId, decision });
}

export async function finishAppCloseDraftExport(
  requestId: string,
  succeeded: boolean,
): Promise<CloseResolution> {
  return invoke<CloseResolution>("finish_app_close_draft_export", { requestId, succeeded });
}
