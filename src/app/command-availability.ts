import type { AiConnectionStatus } from "./ai-state";
import type { PatchStatus } from "./patch-state";
import type { ProjectStatus } from "./project-state";
import type { ResultExportStatus } from "./result-export-state";
import type { ZoneResultStatus } from "./result-state";
import type { RunStatus } from "./run-state";

export interface CommandAvailabilityInput {
  projectStatus: ProjectStatus;
  hasProject: boolean;
  hasProjectSession: boolean;
  hasDraft: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasZone: boolean;
  patchStatus: PatchStatus;
  hasPatchToken: boolean;
  hasPatchReview: boolean;
  resultStatus: ZoneResultStatus;
  hasResult: boolean;
  resultExportStatus: ResultExportStatus;
  runStatus: RunStatus;
  hasActiveRun: boolean;
  aiStatus: AiConnectionStatus;
  draftBusy: boolean;
}

export interface CommandAvailability {
  newProject: boolean;
  openProject: boolean;
  language: boolean;
  zoneSelect: boolean;
  startEditing: boolean;
  runProject: boolean;
  undoDraft: boolean;
  redoDraft: boolean;
  exportDraft: boolean;
  loadActiveResult: boolean;
  selectManifest: boolean;
  exportResult: boolean;
  patchInput: boolean;
  planPatch: boolean;
  patchBack: boolean;
  patchCancel: boolean;
  patchApply: boolean;
}

const CONTEXT_BLOCKING_PATCH_STATUSES: PatchStatus[] = [
  "editing",
  "error",
  "planning",
  "review",
  "applying",
];

export function deriveCommandAvailability(input: CommandAvailabilityInput): CommandAvailability {
  const projectBusy = input.projectStatus === "selecting" || input.projectStatus === "loading";
  const resultBusy = input.resultStatus === "selecting" || input.resultStatus === "loading";
  const resultExportBusy = input.resultExportStatus === "selecting_destination" || input.resultExportStatus === "exporting";
  const aiBusy = input.aiStatus === "generating" || input.aiStatus === "interrupting";
  const patchContextBusy = CONTEXT_BLOCKING_PATCH_STATUSES.includes(input.patchStatus);
  const externalCommandsAvailable = !(
    projectBusy
    || input.runStatus === "running"
    || resultBusy
    || resultExportBusy
    || input.draftBusy
    || aiBusy
    || patchContextBusy
  );
  const projectReady = input.projectStatus === "loaded"
    && input.hasProject
    && input.hasProjectSession
    && input.hasDraft;
  const patchEditing = input.patchStatus === "editing" || input.patchStatus === "error";
  const patchReview = input.patchStatus === "review" && input.hasPatchReview;

  return {
    newProject: externalCommandsAvailable,
    openProject: externalCommandsAvailable,
    language: externalCommandsAvailable,
    zoneSelect: externalCommandsAvailable && projectReady && input.hasZone,
    startEditing: externalCommandsAvailable
      && projectReady
      && input.hasZone
      && (input.patchStatus === "idle" || input.patchStatus === "success"),
    runProject: externalCommandsAvailable && projectReady,
    undoDraft: externalCommandsAvailable && projectReady && input.canUndo,
    redoDraft: externalCommandsAvailable && projectReady && input.canRedo,
    exportDraft: externalCommandsAvailable && projectReady,
    loadActiveResult: externalCommandsAvailable && projectReady && input.hasZone && input.hasActiveRun,
    selectManifest: externalCommandsAvailable && projectReady && input.hasZone,
    exportResult: externalCommandsAvailable && projectReady && input.hasZone && input.hasResult,
    patchInput: patchEditing && !input.draftBusy && projectReady && input.hasZone,
    planPatch: patchEditing && !input.draftBusy && projectReady && input.hasZone && input.hasPatchToken,
    patchBack: patchReview,
    patchCancel: patchEditing || patchReview,
    patchApply: patchReview,
  };
}
