import { describe, expect, it } from "vitest";
import { deriveCommandAvailability, type CommandAvailabilityInput } from "./command-availability";

const loaded: CommandAvailabilityInput = {
  projectStatus: "loaded",
  hasProject: true,
  hasProjectSession: true,
  hasDraft: true,
  canUndo: true,
  canRedo: true,
  hasZone: true,
  patchStatus: "idle",
  hasPatchToken: false,
  hasPatchReview: false,
  resultStatus: "loaded",
  hasResult: true,
  resultExportStatus: "idle",
  runStatus: "succeeded",
  hasActiveRun: true,
  aiStatus: "available",
  draftBusy: false,
};

const externalCommands = [
  "newProject",
  "openProject",
  "language",
  "zoneSelect",
  "startEditing",
  "runProject",
  "undoDraft",
  "redoDraft",
  "exportDraft",
  "loadActiveResult",
  "selectManifest",
  "exportResult",
] as const;

describe("deriveCommandAvailability", () => {
  it("enables the loaded-project commands from one ready state", () => {
    expect(deriveCommandAvailability(loaded)).toMatchObject({
      newProject: true,
      openProject: true,
      language: true,
      zoneSelect: true,
      startEditing: true,
      runProject: true,
      undoDraft: true,
      redoDraft: true,
      exportDraft: true,
      loadActiveResult: true,
      selectManifest: true,
      exportResult: true,
      patchInput: false,
      planPatch: false,
      patchBack: false,
      patchCancel: false,
      patchApply: false,
    });
  });

  it.each([
    ["project selection", { projectStatus: "selecting" as const }],
    ["project loading", { projectStatus: "loading" as const }],
    ["run", { runStatus: "running" as const }],
    ["result selection", { resultStatus: "selecting" as const }],
    ["result loading", { resultStatus: "loading" as const }],
    ["result export selection", { resultExportStatus: "selecting_destination" as const }],
    ["result export", { resultExportStatus: "exporting" as const }],
    ["draft transition", { draftBusy: true }],
    ["AI generation", { aiStatus: "generating" as const }],
    ["AI interrupt", { aiStatus: "interrupting" as const }],
    ["Patch editing", { patchStatus: "editing" as const, hasPatchToken: true }],
    ["Patch error", { patchStatus: "error" as const, hasPatchToken: true }],
    ["Patch planning", { patchStatus: "planning" as const, hasPatchToken: true }],
    ["Patch review", { patchStatus: "review" as const, hasPatchReview: true }],
    ["Patch applying", { patchStatus: "applying" as const, hasPatchReview: true }],
  ] as const)("blocks external context commands during %s", (_label, changes) => {
    const availability = deriveCommandAvailability({ ...loaded, ...changes });
    for (const command of externalCommands) {
      expect(availability[command], command).toBe(false);
    }
  });

  it("keeps the Patch editing controls local while the external commands are blocked", () => {
    expect(deriveCommandAvailability({ ...loaded, patchStatus: "editing", hasPatchToken: true })).toMatchObject({
      patchInput: true,
      planPatch: true,
      patchBack: false,
      patchCancel: true,
      patchApply: false,
    });
  });

  it("closes Patch input in review and leaves only Back, Cancel, and Apply", () => {
    expect(deriveCommandAvailability({ ...loaded, patchStatus: "review", hasPatchReview: true })).toMatchObject({
      patchInput: false,
      planPatch: false,
      patchBack: true,
      patchCancel: true,
      patchApply: true,
    });
  });

  it("does not expose project commands before a loaded project has a session, draft, and Zone", () => {
    const availability = deriveCommandAvailability({
      ...loaded,
      projectStatus: "idle",
      hasProject: false,
      hasProjectSession: false,
      hasDraft: false,
      hasZone: false,
      hasResult: false,
      hasActiveRun: false,
      canUndo: false,
      canRedo: false,
    });
    expect(availability.newProject).toBe(true);
    expect(availability.openProject).toBe(true);
    expect(availability.language).toBe(true);
    expect(availability.zoneSelect).toBe(false);
    expect(availability.runProject).toBe(false);
    expect(availability.selectManifest).toBe(false);
  });
});
