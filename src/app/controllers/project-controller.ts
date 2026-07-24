import { useCallback, useRef, type Dispatch, type MutableRefObject, type Dispatch as StateDispatch, type SetStateAction } from "react";
import {
  exportActiveProjectDraftCopy,
  redoProjectDraft,
  selectAndReadPrjZones,
  undoProjectDraft,
} from "../desktop-api";
import {
  desktopOpenIssue,
  envelopeIssue,
  isDraftExportSummaryValid,
  isDraftSummaryValid,
  isSafeProjectInspection,
  type DesktopDraftExportResponse,
  type ProjectAction,
  type ProjectState,
  type ZoneRecord,
} from "../project-state";
import type { CommandAvailability } from "../command-availability";
import { type PatchAction } from "../patch-state";
import { type ResultAction } from "../result-state";
import { type ResultExportAction } from "../result-export-state";
import { type RunAction } from "../run-state";
import { type AiAction } from "../ai-state";

interface ProjectControllerOptions {
  projectState: ProjectState;
  availability: Pick<CommandAvailability, "openProject" | "undoDraft" | "redoDraft" | "exportDraft">;
  currentZone: ZoneRecord | null;
  mounted: MutableRefObject<boolean>;
  dispatchProject: Dispatch<ProjectAction>;
  dispatchPatch: Dispatch<PatchAction>;
  dispatchResult: Dispatch<ResultAction>;
  dispatchResultExport: Dispatch<ResultExportAction>;
  dispatchRun: Dispatch<RunAction>;
  dispatchAi: Dispatch<AiAction>;
  onProjectOpened: () => void;
  onNotice: (message: string) => void;
  translate: (key: string, options?: Record<string, unknown>) => string;
  draftBusy: boolean;
  setDraftBusy: StateDispatch<SetStateAction<boolean>>;
  draftGuardBusy: boolean;
  setDraftGuardBusy: StateDispatch<SetStateAction<boolean>>;
  setDraftGuardOpen: StateDispatch<SetStateAction<boolean>>;
}

export function useProjectController({
  projectState,
  availability,
  currentZone,
  mounted,
  dispatchProject,
  dispatchPatch,
  dispatchResult,
  dispatchResultExport,
  dispatchRun,
  dispatchAi,
  onProjectOpened,
  onNotice,
  translate: t,
  draftBusy,
  setDraftBusy,
  draftGuardBusy,
  setDraftGuardBusy,
  setDraftGuardOpen,
}: ProjectControllerOptions) {
  const requestSequence = useRef(0);

  const invalidateProjectContext = useCallback(() => {
    dispatchPatch({ type: "project_or_zone_changed" });
    dispatchResult({ type: "project_or_zone_changed" });
    dispatchResultExport({ type: "result_changed" });
    dispatchRun({ type: "project_changed" });
    dispatchAi({ type: "context_changed" });
  }, [dispatchAi, dispatchPatch, dispatchResult, dispatchResultExport, dispatchRun]);

  const openProjectNow = useCallback(async () => {
    if (!availability.openProject) return;
    const sequence = ++requestSequence.current;
    dispatchProject({ type: "selection_started", sequence });
    const requestId = crypto.randomUUID();
    dispatchProject({ type: "loading_started", sequence, requestId });
    try {
      const response = await selectAndReadPrjZones(requestId);
      if (!mounted.current || sequence !== requestSequence.current) return;
      const desktopIssue = desktopOpenIssue(response, requestId);
      if (desktopIssue) {
        dispatchProject({ type: "loading_failed", sequence, requestId, issue: desktopIssue });
        return;
      }
      if (response.cancelled) {
        dispatchProject({ type: "selection_cancelled", sequence });
        return;
      }
      const envelope = response.envelope;
      if (!envelope) return;
      const issue = envelopeIssue(envelope, requestId);
      if (issue || !envelope.result) {
        dispatchProject({
          type: "loading_failed",
          sequence,
          requestId,
          issue: issue ?? {
            code: "python_response_contract_invalid",
            message: "Bridge response contract invalid",
            source_line_number: null,
            context: {},
          },
        });
        return;
      }
      if (!response.project_session_id || !response.draft || !isDraftSummaryValid(response.draft)) {
        dispatchProject({
          type: "loading_failed",
          sequence,
          requestId,
          issue: {
            code: "desktop_response_contract_invalid",
            message: "Desktop open response contract invalid",
            source_line_number: null,
            context: {},
          },
        });
        return;
      }
      dispatchProject({
        type: "loading_succeeded",
        sequence,
        requestId,
        project: envelope.result,
        projectSessionId: response.project_session_id,
        draft: response.draft,
      });
      invalidateProjectContext();
      onProjectOpened();
    } catch {
      if (!mounted.current || sequence !== requestSequence.current) return;
      dispatchProject({
        type: "loading_failed",
        sequence,
        requestId,
        issue: {
          code: "desktop_bridge_invoke_failed",
          message: "Desktop bridge invocation failed",
          source_line_number: null,
          context: {},
        },
      });
    }
  }, [availability.openProject, dispatchProject, invalidateProjectContext, mounted, onProjectOpened]);

  const openProject = useCallback(async () => {
    if (!availability.openProject) return;
    if (projectState.draft?.dirty && !projectState.draft.exported) {
      setDraftGuardOpen(true);
      return;
    }
    await openProjectNow();
  }, [availability.openProject, openProjectNow, projectState.draft]);

  const switchDraft = useCallback(async (direction: "undo" | "redo") => {
    const available = direction === "undo" ? availability.undoDraft : availability.redoDraft;
    if (!available || !projectState.projectSessionId || draftBusy) return;
    const requestId = crypto.randomUUID();
    setDraftBusy(true);
    dispatchProject({ type: "issue_cleared" });
    try {
      const response = await (direction === "undo" ? undoProjectDraft : redoProjectDraft)(requestId, projectState.projectSessionId);
      if (!mounted.current) return;
      if (response.request_id !== requestId || response.error || !response.project || !isSafeProjectInspection(response.project) || !response.draft || !isDraftSummaryValid(response.draft) || response.project_session_id !== projectState.projectSessionId) {
        dispatchProject({ type: "issue_reported", issue: response.error ?? { code: "draft_identity_mismatch", message: "Draft transition response invalid", source_line_number: null, context: {} } });
        return;
      }
      const targetZoneId = currentZone && response.project.zones.some((zone) => zone.zone_id === currentZone.zone_id)
        ? currentZone.zone_id
        : response.project.zones[0]?.zone_id ?? "";
      dispatchProject({ type: "draft_replaced", project: response.project, projectSessionId: response.project_session_id, targetZoneId, draft: response.draft });
      invalidateProjectContext();
      onNotice(t(direction === "undo" ? "draft.undoSuccess" : "draft.redoSuccess", { revision: response.draft.revision_number }));
    } catch {
      if (mounted.current) dispatchProject({ type: "issue_reported", issue: { code: "desktop_bridge_invoke_failed", message: "Draft transition failed", source_line_number: null, context: {} } });
    } finally {
      if (mounted.current) setDraftBusy(false);
    }
  }, [availability.redoDraft, availability.undoDraft, currentZone, dispatchProject, draftBusy, invalidateProjectContext, mounted, onNotice, projectState.projectSessionId, t]);

  const exportDraft = useCallback(async (): Promise<boolean> => {
    if (!availability.exportDraft || !projectState.projectSessionId || !projectState.draft || draftBusy) return false;
    const requestId = crypto.randomUUID();
    setDraftBusy(true);
    dispatchProject({ type: "issue_cleared" });
    try {
      const response: DesktopDraftExportResponse = await exportActiveProjectDraftCopy(requestId, projectState.projectSessionId, projectState.draft.revision_id);
      if (!mounted.current) return false;
      if (response.cancelled) {
        onNotice(t("draft.exportCancelled"));
        return false;
      }
      if (response.error || !response.export || !isDraftExportSummaryValid(response.export) || response.project_session_id !== projectState.projectSessionId) {
        dispatchProject({ type: "issue_reported", issue: response.error ?? { code: "draft_export_verification_failed", message: "Draft export response invalid", source_line_number: null, context: {} } });
        return false;
      }
      dispatchProject({ type: "draft_exported", revisionId: projectState.draft.revision_id });
      onNotice(t("draft.exportSuccess", { file: response.export.file_name }));
      return true;
    } catch {
      if (mounted.current) dispatchProject({ type: "issue_reported", issue: { code: "desktop_bridge_invoke_failed", message: "Draft export failed", source_line_number: null, context: {} } });
      return false;
    } finally {
      if (mounted.current) setDraftBusy(false);
    }
  }, [availability.exportDraft, dispatchProject, draftBusy, mounted, onNotice, projectState.draft, projectState.projectSessionId, t]);

  const exportDraftAndOpen = useCallback(async () => {
    if (draftGuardBusy) return;
    setDraftGuardBusy(true);
    try {
      if (await exportDraft()) {
        setDraftGuardOpen(false);
        await openProjectNow();
      }
    } finally {
      if (mounted.current) setDraftGuardBusy(false);
    }
  }, [draftGuardBusy, exportDraft, mounted, openProjectNow]);

  const discardDraftAndOpen = useCallback(async () => {
    if (draftGuardBusy) return;
    setDraftGuardOpen(false);
    await openProjectNow();
  }, [draftGuardBusy, openProjectNow]);

  return {
    openProject,
    openProjectNow,
    switchDraft,
    exportDraft,
    exportDraftAndOpen,
    discardDraftAndOpen,
  };
}
