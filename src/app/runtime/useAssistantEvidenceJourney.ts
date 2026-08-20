import { useCallback, useEffect, type Dispatch, type MutableRefObject } from "react";
import {
  approveAndRunSimulationPlan,
  prepareSimulationPlan,
  previewAttachmentEvidence,
  removeStudioAttachment,
  selectAndImportAttachments,
  setAttachmentAiSelection,
} from "../desktop-api";
import type { AiAction } from "../ai-state";
import { isSafeAttachmentView, isSafeEvidenceBundle, type AttachmentAction, type AttachmentState, type AttachmentView } from "../attachment-state";
import type { PatchAction } from "../patch-state";
import type { ProjectAction, ProjectState, ZoneRecord } from "../project-state";
import type { ResultExportAction } from "../result-export-state";
import type { ResultAction } from "../result-state";
import type { RunAction } from "../run-state";
import { isSafeSimulationExecutionResponse, isSafeSimulationPlan, type SimulationActionState, type SimulationState } from "../simulation-state";
import type { AppLanguage } from "../workbench-state";

interface UseAssistantEvidenceJourneyOptions {
  attachmentState: AttachmentState;
  simulationState: SimulationState;
  aiModelId: string;
  language: AppLanguage;
  projectState: ProjectState;
  currentZone: ZoneRecord | null;
  mounted: MutableRefObject<boolean>;
  dispatchAttachment: Dispatch<AttachmentAction>;
  dispatchAi: Dispatch<AiAction>;
  dispatchSimulation: Dispatch<SimulationActionState>;
  dispatchProject: Dispatch<ProjectAction>;
  dispatchPatch: Dispatch<PatchAction>;
  dispatchResult: Dispatch<ResultAction>;
  dispatchResultExport: Dispatch<ResultExportAction>;
  dispatchRun: Dispatch<RunAction>;
}

export function useAssistantEvidenceJourney(options: UseAssistantEvidenceJourneyOptions) {
  const {
    attachmentState,
    simulationState,
    aiModelId,
    language,
    projectState,
    currentZone,
    mounted,
    dispatchAttachment,
    dispatchAi,
    dispatchSimulation,
    dispatchProject,
    dispatchPatch,
    dispatchResult,
    dispatchResultExport,
    dispatchRun,
  } = options;

  const updateAttachments = useCallback((attachments: AttachmentView[]) => {
    if (!attachments.every(isSafeAttachmentView)) {
      dispatchAttachment({ type: "operation_failed", issue: { code: "attachment_response_invalid", message: "Attachment response invalid", source_line_number: null, context: {} } });
      return;
    }
    dispatchAttachment({ type: "attachments_received", attachments });
    dispatchAi({ type: "context_changed" });
    dispatchSimulation({ type: "context_changed" });
  }, [dispatchAi, dispatchAttachment, dispatchSimulation]);

  const importAttachments = useCallback(async () => {
    if (attachmentState.busy) return;
    dispatchAttachment({ type: "operation_started" });
    try {
      const requestId = crypto.randomUUID();
      const response = await selectAndImportAttachments(requestId);
      if (!mounted.current) return;
      if (response.request_id !== requestId || response.error) throw response.error ?? new Error("attachment response invalid");
      updateAttachments(response.attachments);
    } catch {
      if (mounted.current) dispatchAttachment({ type: "operation_failed", issue: { code: "attachment_import_failed", message: "Attachment import failed", source_line_number: null, context: {} } });
    }
  }, [attachmentState.busy, dispatchAttachment, mounted, updateAttachments]);

  const selectAttachmentEvidence = useCallback(async (attachment: AttachmentView, selected: boolean) => {
    if (attachmentState.busy) return;
    dispatchAttachment({ type: "operation_started" });
    try {
      const requestId = crypto.randomUUID();
      const response = await setAttachmentAiSelection(requestId, attachment.attachment_id, selected);
      if (!mounted.current) return;
      if (response.request_id !== requestId || response.error) throw response.error ?? new Error("attachment response invalid");
      updateAttachments(response.attachments);
    } catch {
      if (mounted.current) dispatchAttachment({ type: "operation_failed", issue: { code: "attachment_selection_failed", message: "Attachment selection failed", source_line_number: null, context: {} } });
    }
  }, [attachmentState.busy, dispatchAttachment, mounted, updateAttachments]);

  const previewAttachmentDisclosure = useCallback(async () => {
    if (attachmentState.busy || !projectState.projectSessionId || !projectState.draft || !aiModelId) return;
    dispatchAttachment({ type: "operation_started" });
    try {
      const requestId = crypto.randomUUID();
      const response = await previewAttachmentEvidence(requestId, projectState.projectSessionId, projectState.draft.revision_id, language, aiModelId);
      if (!mounted.current) return;
      if (response.request_id !== requestId || response.error || !isSafeEvidenceBundle(response.bundle)) throw response.error ?? new Error("attachment evidence invalid");
      dispatchAttachment({ type: "bundle_received", bundle: response.bundle });
      dispatchAi({ type: "context_changed" });
      dispatchSimulation({ type: "context_changed" });
    } catch {
      if (mounted.current) dispatchAttachment({ type: "operation_failed", issue: { code: "attachment_evidence_invalid", message: "Attachment evidence preview failed", source_line_number: null, context: {} } });
    }
  }, [aiModelId, attachmentState.busy, dispatchAi, dispatchAttachment, dispatchSimulation, language, mounted, projectState.draft, projectState.projectSessionId]);

  const removeAttachment = useCallback(async (attachment: AttachmentView) => {
    if (attachmentState.busy) return;
    dispatchAttachment({ type: "operation_started" });
    try {
      const requestId = crypto.randomUUID();
      const response = await removeStudioAttachment(requestId, attachment.attachment_id);
      if (!mounted.current) return;
      if (response.request_id !== requestId || response.error) throw response.error ?? new Error("attachment response invalid");
      updateAttachments(response.attachments);
    } catch {
      if (mounted.current) dispatchAttachment({ type: "operation_failed", issue: { code: "attachment_remove_failed", message: "Attachment removal failed", source_line_number: null, context: {} } });
    }
  }, [attachmentState.busy, dispatchAttachment, mounted, updateAttachments]);

  useEffect(() => {
    dispatchAttachment({ type: "context_changed" });
  }, [aiModelId, dispatchAttachment, language, projectState.draft?.revision_id, projectState.projectSessionId]);

  const createSimulationPlan = useCallback(async () => {
    if (simulationState.status === "executing" || !projectState.projectSessionId || !projectState.draft || !currentZone || !simulationState.goal.trim()) return;
    const requestId = crypto.randomUUID();
    dispatchSimulation({ type: "plan_started", requestId });
    try {
      const response = await prepareSimulationPlan(requestId, projectState.projectSessionId, projectState.draft.revision_id, currentZone.zone_id, simulationState.goal);
      if (!mounted.current) return;
      if (!isSafeSimulationPlan(response.plan) || response.request_id !== requestId || response.error) {
        dispatchSimulation({ type: "plan_failed", requestId, issue: response.error ?? { code: "simulation_plan_invalid", message: "Simulation plan response invalid", source_line_number: null, context: {} } });
        return;
      }
      const plan = response.plan;
      if (plan.project_session_id !== projectState.projectSessionId || plan.revision_id !== projectState.draft.revision_id || (plan.status === "ready" && plan.zone_id !== currentZone.zone_id)) {
        dispatchSimulation({ type: "plan_failed", requestId, issue: { code: "simulation_context_stale", message: "Simulation plan context changed", source_line_number: null, context: {} } });
        return;
      }
      dispatchSimulation({ type: "plan_received", requestId, plan });
    } catch {
      if (!mounted.current) return;
      dispatchSimulation({ type: "plan_failed", requestId, issue: { code: "desktop_bridge_invoke_failed", message: "Simulation plan invocation failed", source_line_number: null, context: {} } });
    }
  }, [currentZone, dispatchSimulation, mounted, projectState.draft, projectState.projectSessionId, simulationState.goal, simulationState.status]);

  const approveAndRunSimulation = useCallback(async () => {
    const plan = simulationState.plan;
    if (simulationState.status !== "ready" || plan?.status !== "ready" || !projectState.projectSessionId || !currentZone || plan.project_session_id !== projectState.projectSessionId || plan.revision_id !== projectState.draft?.revision_id || plan.zone_id !== currentZone.zone_id) return;
    const requestId = crypto.randomUUID();
    dispatchSimulation({ type: "execution_started", requestId });
    try {
      const response = await approveAndRunSimulationPlan(requestId, projectState.projectSessionId, plan.plan_id, currentZone.zone_id);
      if (!mounted.current) return;
      if (!isSafeSimulationExecutionResponse(response, requestId)) {
        dispatchSimulation({ type: "execution_finished", requestId, response: { request_id: requestId, status: "failed", timeline: simulationState.timeline.map((step, index) => index === 0 ? { ...step, status: "failed" } : step), execution: null, project_session_id: null, project: null, target_zone_id: null, draft: null, run: null, result: null, error: { code: "simulation_execution_invalid", message: "Simulation execution response invalid", source_line_number: null, context: {} } } });
        return;
      }
      if (response.project && response.draft && response.project_session_id === projectState.projectSessionId && response.target_zone_id && response.project.zones.some((zone) => zone.zone_id === response.target_zone_id)) {
        dispatchProject({ type: "draft_replaced", project: response.project, projectSessionId: response.project_session_id, targetZoneId: response.target_zone_id, draft: response.draft });
        dispatchPatch({ type: "project_or_zone_changed" });
        dispatchResult({ type: "project_or_zone_changed" });
        dispatchResultExport({ type: "result_changed" });
        dispatchRun({ type: "project_changed" });
        dispatchAi({ type: "context_changed" });
      }
      dispatchSimulation({ type: "execution_finished", requestId, response });
    } catch {
      if (!mounted.current) return;
      dispatchSimulation({ type: "execution_finished", requestId, response: { request_id: requestId, status: "failed", timeline: simulationState.timeline.map((step, index) => index === 0 ? { ...step, status: "failed" } : step), execution: null, project_session_id: null, project: null, target_zone_id: null, draft: null, run: null, result: null, error: { code: "desktop_bridge_invoke_failed", message: "Simulation execution invocation failed", source_line_number: null, context: {} } } });
    }
  }, [currentZone, dispatchAi, dispatchPatch, dispatchProject, dispatchResult, dispatchResultExport, dispatchRun, dispatchSimulation, mounted, projectState.draft?.revision_id, projectState.projectSessionId, simulationState.plan, simulationState.status, simulationState.timeline]);

  return {
    importAttachments,
    acceptImportedAttachments: updateAttachments,
    selectAttachmentEvidence,
    previewAttachmentDisclosure,
    removeAttachment,
    createSimulationPlan,
    approveAndRunSimulation,
  };
}
