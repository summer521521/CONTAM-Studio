import { describe, expect, it } from "vitest";
import {
  applyZoneVolumePatchToDraft,
  exportActiveProjectDraftCopy,
  redoProjectDraft,
  extractActiveRunZoneAirState,
  exportActiveZoneAirStateCsv,
  planZoneVolumePatch,
  selectAndExtractZoneAirState,
  selectAndReadPrjZones,
  runActiveContamProject,
  undoProjectDraft,
  connectCodexAppServer,
  clearAiConversationArchiveForZone,
  clearAllAiConversationArchive,
  deleteAiConversationArchiveEntry,
  installOfficialCodexCli,
  loadAiConversationArchive,
  previewAiContext,
  setAiConversationArchiveEnabled,
  startReadonlyAiTurn,
  interruptReadonlyAiTurn,
} from "./desktop-api";

describe("desktop API boundary", () => {
  it("accepts only requestId and cannot receive a source path", () => {
    expect(selectAndReadPrjZones).toHaveLength(1);
  });

  it("accepts only identifiers and volume input for Patch operations", () => {
    expect(planZoneVolumePatch).toHaveLength(4);
    expect(applyZoneVolumePatchToDraft).toHaveLength(3);
    expect(planZoneVolumePatch.toString()).not.toContain("sourcePath");
    expect(applyZoneVolumePatchToDraft.toString()).not.toContain("outputPath");
    expect(applyZoneVolumePatchToDraft.toString()).not.toContain("contamNumber");
  });

  it("exposes draft history and copy export without accepting paths or project data", () => {
    expect(undoProjectDraft).toHaveLength(2);
    expect(redoProjectDraft).toHaveLength(2);
    expect(exportActiveProjectDraftCopy).toHaveLength(3);
    for (const api of [undoProjectDraft, redoProjectDraft, exportActiveProjectDraftCopy]) {
      const source = api.toString();
      for (const forbidden of ["sourcePath", "outputPath", "draftRoot", "projectJson", "patchJson"]) expect(source).not.toContain(forbidden);
    }
  });

  it("sends only session and Zone identity for result extraction", () => {
    expect(selectAndExtractZoneAirState).toHaveLength(3);
    expect(selectAndExtractZoneAirState.toString()).not.toContain("manifestPath");
    expect(selectAndExtractZoneAirState.toString()).not.toContain("resultRoot");
    expect(selectAndExtractZoneAirState.toString()).not.toContain("sourcePath");
    expect(selectAndExtractZoneAirState.toString()).not.toContain("simreadPath");
  });

  it("loads the Rust-held active run without accepting paths or run objects", () => {
    expect(extractActiveRunZoneAirState).toHaveLength(3);
    const source = extractActiveRunZoneAirState.toString();
    for (const forbidden of ["manifestPath", "sourcePath", "resultRoot", "runId", "simreadPath"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("extract_active_run_zone_air_state");
  });

  it("exports only the Rust-held result identity without paths, samples, or CSV", () => {
    expect(exportActiveZoneAirStateCsv).toHaveLength(5);
    const source = exportActiveZoneAirStateCsv.toString();
    for (const forbidden of ["outputPath", "sourcePath", "manifestPath", "samples", "csvBody", "resultRoot"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("export_active_zone_air_state_csv");
  });

  it("sends only request and project session identity for ContamX runs", () => {
    expect(runActiveContamProject).toHaveLength(2);
    const source = runActiveContamProject.toString();
    for (const forbidden of ["sourcePath", "solverPath", "runRoot", "manifestPath", "environment"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps Codex process and paths behind the Rust boundary", () => {
    expect(connectCodexAppServer).toHaveLength(1);
    expect(interruptReadonlyAiTurn).toHaveLength(1);
    expect(previewAiContext).toHaveLength(8);
    expect(startReadonlyAiTurn).toHaveLength(10);
    for (const api of [connectCodexAppServer, previewAiContext, startReadonlyAiTurn, interruptReadonlyAiTurn]) {
      const source = api.toString();
      for (const forbidden of ["codexPath", "sourcePath", "draftRoot", "manifestPath", "simPath", "prjText", "projectJson", "runJson", "resultJson", "shellCommand"]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("starts only the fixed Rust-held Codex installer action", () => {
    expect(installOfficialCodexCli).toHaveLength(1);
    const source = installOfficialCodexCli.toString();
    expect(source).toContain("install_official_codex_cli");
    for (const forbidden of ["downloadUrl", "shellCommand", "arguments", "installerPath", "powershell"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the optional local conversation archive behind the Rust boundary", () => {
    expect(loadAiConversationArchive).toHaveLength(4);
    expect(setAiConversationArchiveEnabled).toHaveLength(2);
    expect(deleteAiConversationArchiveEntry).toHaveLength(5);
    expect(clearAiConversationArchiveForZone).toHaveLength(4);
    expect(clearAllAiConversationArchive).toHaveLength(1);

    const archiveApis = [
      loadAiConversationArchive,
      setAiConversationArchiveEnabled,
      deleteAiConversationArchiveEntry,
      clearAiConversationArchiveForZone,
      clearAllAiConversationArchive,
    ];
    for (const api of archiveApis) {
      const source = api.toString();
      for (const forbidden of ["sourcePath", "outputPath", "archivePath", "draftRoot", "prjText", "projectJson", "shellCommand"]) {
        expect(source).not.toContain(forbidden);
      }
    }
    expect(loadAiConversationArchive.toString()).toContain("load_ai_conversation_archive");
    expect(setAiConversationArchiveEnabled.toString()).toContain("set_ai_conversation_archive_enabled");
    expect(deleteAiConversationArchiveEntry.toString()).toContain("delete_ai_conversation_archive_entry");
    expect(clearAiConversationArchiveForZone.toString()).toContain("clear_ai_conversation_archive_for_zone");
    expect(clearAllAiConversationArchive.toString()).toContain("clear_all_ai_conversation_archive");
  });
});
