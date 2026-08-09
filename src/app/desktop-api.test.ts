import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import {
  applyZoneVolumePatchToDraft,
  cancelAiProviderLogin,
  clearAiConversationArchiveForZone,
  clearAllAiConversationArchive,
  clearReadonlyAiSession,
  connectCodexAppServer,
  deleteAiConversationArchiveEntry,
  deleteAiProviderProfile,
  deleteAiProviderSecret,
  disconnectCodexAppServer,
  finishAppCloseDraftExport,
  exportActiveProjectDraftCopy,
  exportActiveZoneAirStateCsv,
  extractActiveRunZoneAirState,
  installOfficialCodexCli,
  interruptReadonlyAiTurn,
  loadAiConversationArchive,
  listAiProviderProfiles,
  planZoneVolumePatch,
  previewAiContext,
  probeCodexAppServer,
  redoProjectDraft,
  refreshCodexAccount,
  refreshAiProviderModels,
  runActiveContamProject,
  resolveAppClose,
  saveStudioPreferences,
  selectAndExtractZoneAirState,
  selectAndReadPrjZones,
  setAiConversationArchiveEnabled,
  setAiProviderSecret,
  saveAiProviderProfile,
  startReadonlyAiTurn,
  startAiProviderLogin,
  testAiProviderConnection,
  logoutAiProvider,
  undoProjectDraft,
} from "./desktop-api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const providerProfile = {
  profile_id: "00000000-0000-4000-8000-000000000001",
  preset_id: null,
  display_name: "Local provider",
  protocol: "openai_chat_completions" as const,
  base_url: "http://127.0.0.1:11434/v1/",
  auth_kind: "api_key" as const,
  built_in: false,
  manual_model_ids: ["local-model"],
  selected_model_id: "local-model",
  capabilities: { model_catalog: true, streaming: true, token_usage: false, structured_json_schema: false },
  config_revision: 1,
};

describe("desktop API boundary", () => {
  it("invokes every registered command with the exact complete payload", async () => {
    invokeMock.mockResolvedValue({});
    const cases = [
      ["select_and_read_prj_zones", selectAndReadPrjZones("request-001"), { requestId: "request-001" }],
      [
        "plan_zone_volume_patch",
        planZoneVolumePatch("request-002", "session-001", "zone-001", "650"),
        { requestId: "request-002", projectSessionId: "session-001", zoneId: "zone-001", newVolumeToken: "650" },
      ],
      [
        "apply_zone_volume_patch_to_draft",
        applyZoneVolumePatchToDraft("request-003", "session-001", "patch-001"),
        { requestId: "request-003", projectSessionId: "session-001", patchId: "patch-001" },
      ],
      ["undo_project_draft", undoProjectDraft("request-004", "session-001"), { requestId: "request-004", projectSessionId: "session-001" }],
      ["redo_project_draft", redoProjectDraft("request-005", "session-001"), { requestId: "request-005", projectSessionId: "session-001" }],
      [
        "export_active_project_draft_copy",
        exportActiveProjectDraftCopy("request-006", "session-001", "revision-001"),
        { requestId: "request-006", projectSessionId: "session-001", revisionId: "revision-001" },
      ],
      [
        "select_and_extract_zone_air_state",
        selectAndExtractZoneAirState("request-007", "session-001", "zone-001"),
        { requestId: "request-007", projectSessionId: "session-001", zoneId: "zone-001" },
      ],
      [
        "extract_active_run_zone_air_state",
        extractActiveRunZoneAirState("request-008", "session-001", "zone-001"),
        { requestId: "request-008", projectSessionId: "session-001", zoneId: "zone-001" },
      ],
      [
        "export_active_zone_air_state_csv",
        exportActiveZoneAirStateCsv("request-009", "session-001", "zone-001", "run-001", "extraction-001"),
        { requestId: "request-009", projectSessionId: "session-001", zoneId: "zone-001", runId: "run-001", extractionId: "extraction-001" },
      ],
      ["run_active_contam_project", runActiveContamProject("request-010", "session-001"), { requestId: "request-010", projectSessionId: "session-001" }],
      ["probe_codex_app_server", probeCodexAppServer("request-011"), { requestId: "request-011" }],
      ["install_official_codex_cli", installOfficialCodexCli("request-012"), { requestId: "request-012" }],
      ["connect_codex_app_server", connectCodexAppServer("request-013"), { requestId: "request-013" }],
      ["refresh_codex_account", refreshCodexAccount("request-014"), { requestId: "request-014" }],
      ["list_ai_provider_profiles", listAiProviderProfiles("request-025"), { requestId: "request-025" }],
      ["save_ai_provider_profile", saveAiProviderProfile("request-026", providerProfile), { requestId: "request-026", profile: providerProfile }],
      ["delete_ai_provider_profile", deleteAiProviderProfile("request-027", providerProfile.profile_id), { requestId: "request-027", profileId: providerProfile.profile_id }],
      ["set_ai_provider_secret", setAiProviderSecret("request-028", providerProfile.profile_id, "unit-test-secret-not-real"), { requestId: "request-028", profileId: providerProfile.profile_id, secret: "unit-test-secret-not-real" }],
      ["delete_ai_provider_secret", deleteAiProviderSecret("request-029", providerProfile.profile_id), { requestId: "request-029", profileId: providerProfile.profile_id }],
      ["test_ai_provider_connection", testAiProviderConnection("request-030", providerProfile.profile_id), { requestId: "request-030", profileId: providerProfile.profile_id }],
      ["refresh_ai_provider_models", refreshAiProviderModels("request-031", providerProfile.profile_id), { requestId: "request-031", profileId: providerProfile.profile_id }],
      ["start_ai_provider_login", startAiProviderLogin("request-032", "apiKey", "unit-test-codex-key-not-real"), { requestId: "request-032", authMode: "apiKey", apiKey: "unit-test-codex-key-not-real" }],
      ["cancel_ai_provider_login", cancelAiProviderLogin("request-033", "00000000-0000-4000-8000-000000000002"), { requestId: "request-033", loginId: "00000000-0000-4000-8000-000000000002" }],
      ["logout_ai_provider", logoutAiProvider("request-034"), { requestId: "request-034" }],
      [
        "preview_ai_context",
        previewAiContext("request-015", "codex-profile", "session-001", "revision-001", "zone-001", ["selected_zone"], "zh-CN", "model-001", "medium", { intent: "explain_object", result_dataset_fingerprint: null, metric: null, selected_time_seconds: null }),
        {
          requestId: "request-015",
          providerProfileId: "codex-profile",
          projectSessionId: "session-001",
          revisionId: "revision-001",
          zoneId: "zone-001",
          scopes: ["selected_zone"],
          language: "zh-CN",
          modelId: "model-001",
          reasoningEffort: "medium",
          analysisSelection: { intent: "explain_object", result_dataset_fingerprint: null, metric: null, selected_time_seconds: null },
        },
      ],
      [
        "start_readonly_ai_turn",
        startReadonlyAiTurn("request-016", "codex-profile", "session-001", "revision-001", "zone-001", "preview-001", "status", ["selected_zone"], "zh-CN", "model-001", "medium", { intent: "explain_object", result_dataset_fingerprint: null, metric: null, selected_time_seconds: null }),
        {
          requestId: "request-016",
          providerProfileId: "codex-profile",
          projectSessionId: "session-001",
          revisionId: "revision-001",
          zoneId: "zone-001",
          previewId: "preview-001",
          question: "status",
          scopes: ["selected_zone"],
          language: "zh-CN",
          modelId: "model-001",
          reasoningEffort: "medium",
          analysisSelection: { intent: "explain_object", result_dataset_fingerprint: null, metric: null, selected_time_seconds: null },
        },
      ],
      [
        "load_ai_conversation_archive",
        loadAiConversationArchive("request-017", "session-001", "revision-001", "zone-001"),
        { requestId: "request-017", projectSessionId: "session-001", revisionId: "revision-001", zoneId: "zone-001" },
      ],
      ["set_ai_conversation_archive_enabled", setAiConversationArchiveEnabled("request-018", true), { requestId: "request-018", enabled: true }],
      [
        "delete_ai_conversation_archive_entry",
        deleteAiConversationArchiveEntry("request-019", "session-001", "revision-001", "zone-001", "entry-001"),
        { requestId: "request-019", projectSessionId: "session-001", revisionId: "revision-001", zoneId: "zone-001", archiveEntryId: "entry-001" },
      ],
      [
        "clear_ai_conversation_archive_for_zone",
        clearAiConversationArchiveForZone("request-020", "session-001", "revision-001", "zone-001"),
        { requestId: "request-020", projectSessionId: "session-001", revisionId: "revision-001", zoneId: "zone-001" },
      ],
      ["clear_all_ai_conversation_archive", clearAllAiConversationArchive("request-021"), { requestId: "request-021" }],
      ["interrupt_readonly_ai_turn", interruptReadonlyAiTurn("request-022"), { requestId: "request-022" }],
      ["clear_readonly_ai_session", clearReadonlyAiSession("request-023"), { requestId: "request-023" }],
      ["disconnect_codex_app_server", disconnectCodexAppServer("request-024"), { requestId: "request-024" }],
      ["save_studio_setup", saveStudioPreferences("request-035", "zh-CN", "light", "data"), { requestId: "request-035", language: "zh-CN", theme: "light", dataDirectory: "data" }],
      ["resolve_app_close", resolveAppClose("close-1", "cancel"), { requestId: "close-1", decision: "cancel" }],
      ["finish_app_close_draft_export", finishAppCloseDraftExport("close-1", true), { requestId: "close-1", succeeded: true }],
    ] as const;

    await Promise.all(cases.map(([, call]) => call));
    expect(invokeMock).toHaveBeenCalledTimes(cases.length);
    cases.forEach(([command, , payload], index) => {
      expect(invokeMock).toHaveBeenNthCalledWith(index + 1, command, payload);
      expect(Object.keys(invokeMock.mock.calls[index]?.[1] as object)).toEqual(Object.keys(payload));
    });
  });

  it("never sends paths, PRJ text, samples, shell commands, or extra fields", () => {
    for (const call of invokeMock.mock.calls) {
      const payload = JSON.stringify(call[1]);
      for (const forbidden of ["C:\\", "sourcePath", "outputPath", ".prj", "prjText", "samples", "shellCommand", "powershell", "cmd.exe", "projectJson", "runJson", "resultJson", "contamxPath", "simreadPath"]) {
        expect(payload).not.toContain(forbidden);
      }
    }
  });
});
