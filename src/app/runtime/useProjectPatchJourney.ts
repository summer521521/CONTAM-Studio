import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject } from "react";
import type { TFunction } from "i18next";
import {
  applySemanticPatchToDraft,
  applyZoneVolumePatchToDraft,
  clearReadonlyAiSession,
  discardSemanticPatch,
  planSemanticPatch,
  planZoneVolumePatch,
  readSemanticProject,
} from "../desktop-api";
import type { AiAction, AiSemanticPatchSuggestion } from "../ai-state";
import type { CommandAvailability } from "../command-availability";
import { applyResponseIssue, patchResponseIssue, type PatchAction, type PatchState } from "../patch-state";
import { zoneSelectionKey, type ProjectAction, type ProjectState, type ZoneRecord } from "../project-state";
import type { ResultAction } from "../result-state";
import type { ResultExportAction } from "../result-export-state";
import type { RunAction } from "../run-state";
import {
  findSemanticNode,
  semanticApplyResponseIssue,
  semanticPlanResponseIssue,
  semanticReducer,
  type SemanticOperationRequest,
  type SemanticState,
} from "../semantic-state";
import type { SimulationActionState } from "../simulation-state";
import type { SketchpadProjectionPreview } from "../geometry/sketchpad-projection-preview";
import { prepareSketchpadProjectionPatch } from "../geometry/sketchpad-projection-patch";

interface UseProjectPatchJourneyOptions {
  commandAvailability: CommandAvailability;
  currentZone: ZoneRecord | null;
  projectState: ProjectState;
  patchState: PatchState;
  semanticState: SemanticState;
  simulationBusy: boolean;
  attachmentBusy: boolean;
  mounted: MutableRefObject<boolean>;
  dispatchProject: Dispatch<ProjectAction>;
  dispatchPatch: Dispatch<PatchAction>;
  dispatchResult: Dispatch<ResultAction>;
  dispatchResultExport: Dispatch<ResultExportAction>;
  dispatchRun: Dispatch<RunAction>;
  dispatchAi: Dispatch<AiAction>;
  dispatchSimulation: Dispatch<SimulationActionState>;
  dispatchSemantic: Dispatch<Parameters<typeof semanticReducer>[1]>;
  onNotice: (message: string) => void;
  onProjectDestination: () => void;
  onOpenInspector: () => void;
  t: TFunction;
}

export function useProjectPatchJourney(options: UseProjectPatchJourneyOptions) {
  const {
    commandAvailability,
    currentZone,
    projectState,
    patchState,
    semanticState,
    simulationBusy,
    attachmentBusy,
    mounted,
    dispatchProject,
    dispatchPatch,
    dispatchResult,
    dispatchResultExport,
    dispatchRun,
    dispatchAi,
    dispatchSimulation,
    dispatchSemantic,
    onNotice,
    onProjectDestination,
    onOpenInspector,
    t,
  } = options;

  const snapshotSourceSha256 = semanticState.snapshot?.source_sha256 ?? null;
  const snapshotIdentitySha256 = semanticState.snapshot?.identity_sha256 ?? snapshotSourceSha256;
  const semanticContextKey = projectState.projectSessionId
    && projectState.draft?.revision_id
    && snapshotSourceSha256
    && snapshotIdentitySha256
    ? `${projectState.projectSessionId}:${projectState.draft.revision_id}:${snapshotSourceSha256.toLowerCase()}:${snapshotIdentitySha256.toLowerCase()}`
    : null;
  const activeSemanticContextRef = useRef<string | null>(semanticContextKey);
  const semanticPlanOriginRef = useRef<"manual" | "sketchpad_projection">("manual");
  activeSemanticContextRef.current = semanticContextKey;

  useEffect(() => {
    semanticPlanOriginRef.current = "manual";
  }, [semanticContextKey]);

  useEffect(() => {
    const sessionId = projectState.projectSessionId;
    const revisionId = projectState.draft?.revision_id;
    if (!sessionId || !revisionId) {
      dispatchSemantic({ type: "context_changed" });
      return;
    }
    let disposed = false;
    const requestId = crypto.randomUUID();
    dispatchSemantic({ type: "snapshot_loading" });
    void (async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await readSemanticProject(requestId, sessionId, revisionId);
        if (disposed) return;
        if (response.error?.code === "project_operation_busy" && attempt < 3) {
          await new Promise((resolve) => window.setTimeout(resolve, 100 * (attempt + 1)));
          continue;
        }
        if (
          response.request_id !== requestId
          || response.project_session_id !== sessionId
          || response.revision_id !== revisionId
          || response.error
          || !response.snapshot
          || response.snapshot.result_type !== "semantic_project_snapshot"
          || response.snapshot.spatial_projection.revision_id !== revisionId
          || response.snapshot.spatial_projection.source_sha256 !== response.snapshot.source_sha256
        ) {
          dispatchSemantic({ type: "failed", issue: response.error ?? { code: "semantic_snapshot_invalid", message: "Semantic project snapshot invalid", source_line_number: null, context: {} } });
          return;
        }
        dispatchSemantic({ type: "snapshot_received", snapshot: response.snapshot });
        return;
      }
    })().catch(() => {
      if (!disposed) dispatchSemantic({ type: "failed", issue: { code: "semantic_snapshot_failed", message: "Semantic project snapshot failed", source_line_number: null, context: {} } });
    });
    return () => { disposed = true; };
  }, [dispatchSemantic, projectState.draft?.revision_id, projectState.projectSessionId]);

  const startVolumeEdit = useCallback(() => {
    if (!commandAvailability.startEditing || !currentZone || !projectState.projectSessionId) return;
    dispatchPatch({ type: "start_editing", projectSessionId: projectState.projectSessionId, zoneId: currentZone.zone_id, token: String(currentZone.volume_m3) });
  }, [commandAvailability.startEditing, currentZone, dispatchPatch, projectState.projectSessionId]);

  const planVolumePatch = useCallback(async () => {
    if (!commandAvailability.planPatch || !patchState.projectSessionId || patchState.zoneId === null) return;
    const requestId = crypto.randomUUID();
    dispatchProject({ type: "issue_cleared" });
    dispatchPatch({ type: "plan_started", requestId });
    try {
      const response = await planZoneVolumePatch(requestId, patchState.projectSessionId, patchState.zoneId, patchState.newVolumeToken);
      if (!mounted.current) return;
      const issue = patchResponseIssue(response, requestId);
      if (issue || !response.review) {
        const safeIssue = issue ?? { code: "patch_response_contract_invalid", message: "Patch response contract invalid", source_line_number: null, context: {} };
        dispatchPatch({ type: "plan_failed", requestId, issue: safeIssue });
        dispatchProject({ type: "issue_reported", issue: safeIssue });
        return;
      }
      if (response.review.project_session_id !== patchState.projectSessionId || response.review.zone_id !== patchState.zoneId || response.review.new_token !== patchState.newVolumeToken) {
        const mismatch = { code: "patch_response_contract_invalid", message: "Patch review did not match current input", source_line_number: null, context: {} };
        dispatchPatch({ type: "plan_failed", requestId, issue: mismatch });
        dispatchProject({ type: "issue_reported", issue: mismatch });
        return;
      }
      dispatchPatch({ type: "plan_succeeded", requestId, review: response.review });
    } catch {
      if (!mounted.current) return;
      const issue = { code: "desktop_bridge_invoke_failed", message: "Desktop bridge invocation failed", source_line_number: null, context: {} };
      dispatchPatch({ type: "plan_failed", requestId, issue });
      dispatchProject({ type: "issue_reported", issue });
    }
  }, [commandAvailability.planPatch, dispatchPatch, dispatchProject, mounted, patchState.newVolumeToken, patchState.projectSessionId, patchState.zoneId]);

  const applyVolumePatch = useCallback(async () => {
    if (!commandAvailability.patchApply || !patchState.projectSessionId || !patchState.patchId) return;
    const requestId = crypto.randomUUID();
    dispatchProject({ type: "issue_cleared" });
    dispatchPatch({ type: "apply_started", requestId });
    try {
      const response = await applyZoneVolumePatchToDraft(requestId, patchState.projectSessionId, patchState.patchId);
      if (!mounted.current) return;
      const issue = applyResponseIssue(response, requestId);
      if (issue || !response.project || !response.project_session_id || !response.target_zone_id || !response.draft) {
        const safeIssue = issue ?? { code: "patch_apply_response_invalid", message: "Patch apply response invalid", source_line_number: null, context: {} };
        const invalidate = ["patch_precondition_failed", "patch_verification_failed", "patch_session_mismatch", "project_session_mismatch"].includes(safeIssue.code);
        dispatchPatch({ type: "apply_failed", requestId, issue: safeIssue, invalidate });
        dispatchProject({ type: "issue_reported", issue: safeIssue });
        return;
      }
      dispatchProject({ type: "draft_replaced", project: response.project, projectSessionId: response.project_session_id, targetZoneId: response.target_zone_id, draft: response.draft });
      dispatchResult({ type: "project_or_zone_changed" });
      dispatchResultExport({ type: "result_changed" });
      dispatchRun({ type: "project_changed" });
      dispatchPatch({ type: "apply_succeeded", requestId });
      dispatchAi({ type: "context_changed" });
      dispatchSimulation({ type: "context_changed" });
      onNotice(t("patch.draftAppliedSuccess", { revision: response.draft.revision_number }));
    } catch {
      if (!mounted.current) return;
      const issue = { code: "desktop_bridge_invoke_failed", message: "Desktop bridge invocation failed", source_line_number: null, context: {} };
      dispatchPatch({ type: "apply_failed", requestId, issue, invalidate: false });
      dispatchProject({ type: "issue_reported", issue });
    }
  }, [commandAvailability.patchApply, dispatchAi, dispatchPatch, dispatchProject, dispatchResult, dispatchResultExport, dispatchRun, dispatchSimulation, mounted, onNotice, patchState.patchId, patchState.projectSessionId, t]);

  const selectZoneById = useCallback((zoneId: string) => {
    if (!commandAvailability.zoneSelect || !projectState.project) return;
    const zone = projectState.project.zones.find((candidate) => candidate.zone_id === zoneId);
    if (!zone) return;
    dispatchProject({ type: "zone_selected", zoneKey: zoneSelectionKey(projectState.project, zone) });
    dispatchPatch({ type: "project_or_zone_changed" });
    dispatchResult({ type: "project_or_zone_changed" });
    dispatchResultExport({ type: "result_changed" });
    dispatchAi({ type: "context_changed" });
    dispatchSimulation({ type: "context_changed" });
    onProjectDestination();
    void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
  }, [commandAvailability.zoneSelect, dispatchAi, dispatchPatch, dispatchProject, dispatchResult, dispatchResultExport, dispatchSimulation, onProjectDestination, projectState.project]);

  const selectedSemanticNode = findSemanticNode(semanticState.snapshot, semanticState.selectedObjectId);
  const selectedSemanticNodes = semanticState.selectedObjectIds.map((objectId) => findSemanticNode(semanticState.snapshot, objectId)).filter((node): node is NonNullable<typeof node> => Boolean(node));

  const selectSemanticObject = useCallback((objectId: string, additive = false) => {
    dispatchSemantic({ type: "object_selected", objectId, append: additive });
    const zone = projectState.project?.zones.find((candidate) => candidate.zone_id === objectId);
    if (zone && !additive) selectZoneById(zone.zone_id);
  }, [dispatchSemantic, projectState.project, selectZoneById]);

  const editSemanticOperations = useCallback((operations: SemanticOperationRequest[]) => {
    if (simulationBusy || attachmentBusy) return;
    dispatchSemantic({ type: "edit", operations });
    dispatchAi({ type: "context_changed" });
    dispatchSimulation({ type: "context_changed" });
  }, [attachmentBusy, dispatchAi, dispatchSemantic, dispatchSimulation, simulationBusy]);

  const useAiSemanticPatch = useCallback((suggestion: AiSemanticPatchSuggestion) => {
    const snapshot = semanticState.snapshot;
    const identity = snapshot && typeof snapshot.identity_sha256 === "string" ? snapshot.identity_sha256 : snapshot?.source_sha256;
    if (!snapshot || !identity || identity.toLowerCase() !== suggestion.baseline_source_sha256.toLowerCase()) {
      dispatchSemantic({ type: "failed", issue: { code: "semantic_ai_patch_stale", message: "AI语义Patch基线已变化，必须重新生成。", source_line_number: null, context: {} } });
      return;
    }
    const operations: SemanticOperationRequest[] = suggestion.operations.map((item) => ({ operation: item.operation, object_id: item.object_id, new_value: item.new_value, unit: item.unit }));
    const invalid = suggestion.operations.some((item) => {
      const node = findSemanticNode(snapshot, item.object_id);
      if (!node) return true;
      const expectedKind = item.operation.startsWith("set_zone_") ? "Zone" : "FlowPath";
      const expectedField = item.operation === "set_zone_name" ? "name" : item.operation === "set_zone_volume" ? "volume_m3" : "multiplier";
      return node.object_kind !== expectedKind || item.field !== expectedField || node.capabilities?.[expectedField]?.state !== "editable_via_patch";
    });
    if (invalid) {
      dispatchSemantic({ type: "failed", issue: { code: "semantic_ai_patch_unsupported", message: "AI语义Patch包含未识别或只读对象。", source_line_number: null, context: {} } });
      return;
    }
    editSemanticOperations(operations);
    onProjectDestination();
    onOpenInspector();
  }, [dispatchSemantic, editSemanticOperations, onOpenInspector, onProjectDestination, semanticState.snapshot]);

  const planSemanticOperationSet = useCallback(async (
    operations: SemanticOperationRequest[],
    origin: "manual" | "sketchpad_projection",
  ): Promise<boolean> => {
    const projectSessionId = projectState.projectSessionId;
    const revisionId = projectState.draft?.revision_id;
    const snapshot = semanticState.snapshot;
    const sourceSha256 = snapshot?.source_sha256;
    const identitySha256 = snapshot?.identity_sha256 ?? sourceSha256;
    const contextKey = activeSemanticContextRef.current;
    if (!projectSessionId
      || !revisionId
      || !snapshot
      || !sourceSha256
      || !identitySha256
      || !contextKey
      || !operations.length
      || operations.length > 128
      || ["planning", "applying", "review"].includes(semanticState.status)) return false;
    const requestId = crypto.randomUUID();
    semanticPlanOriginRef.current = origin;
    if (origin === "sketchpad_projection") dispatchSemantic({ type: "edit", operations });
    dispatchSemantic({ type: "plan_started" });
    try {
      const response = await planSemanticPatch(requestId, projectSessionId, revisionId, operations);
      if (!mounted.current || activeSemanticContextRef.current !== contextKey) return false;
      const issue = semanticPlanResponseIssue(response, {
        requestId,
        projectSessionId,
        revisionId,
        sourceSha256,
        operationCount: operations.length,
      });
      if (issue) {
        semanticPlanOriginRef.current = "manual";
        dispatchSemantic({ type: "failed", issue });
        if (origin === "sketchpad_projection") {
          onProjectDestination();
          onOpenInspector();
        }
        return false;
      }
      dispatchSemantic({ type: "plan_received", plan: response });
      if (origin === "sketchpad_projection") {
        onProjectDestination();
        onOpenInspector();
      }
      return true;
    } catch {
      if (mounted.current && activeSemanticContextRef.current === contextKey) {
        semanticPlanOriginRef.current = "manual";
        dispatchSemantic({ type: "failed", issue: { code: "semantic_plan_failed", message: "Semantic patch plan failed", source_line_number: null, context: {} } });
        if (origin === "sketchpad_projection") {
          onProjectDestination();
          onOpenInspector();
        }
      }
      return false;
    }
  }, [dispatchSemantic, mounted, onOpenInspector, onProjectDestination, projectState.draft?.revision_id, projectState.projectSessionId, semanticState.snapshot, semanticState.status]);

  const planSemanticOperations = useCallback(async () => {
    if (!semanticState.operations.length) return false;
    return planSemanticOperationSet(semanticState.operations, "manual");
  }, [planSemanticOperationSet, semanticState.operations]);

  const reviewSketchpadProjection = useCallback(async (
    preview: SketchpadProjectionPreview,
  ): Promise<boolean> => {
    const prepared = prepareSketchpadProjectionPatch(preview);
    const snapshot = semanticState.snapshot;
    const identitySha256 = snapshot?.identity_sha256 ?? snapshot?.source_sha256;
    const contextMatches = prepared.status === "ready"
      && preview.project_session_id === projectState.projectSessionId
      && preview.revision_id === projectState.draft?.revision_id
      && preview.source_sha256.toLowerCase() === snapshot?.source_sha256.toLowerCase()
      && preview.source_sha256.toLowerCase() === projectState.project?.source_sha256.toLowerCase()
      && preview.identity_sha256.toLowerCase() === identitySha256?.toLowerCase();
    const busy = simulationBusy || attachmentBusy || semanticState.operations.length > 0 || semanticState.status !== "idle";
    if (!contextMatches || busy) {
      const code = !contextMatches
        ? prepared.diagnostic ?? "sketchpad_projection_context_stale"
        : "sketchpad_projection_review_busy";
      dispatchSemantic({ type: "failed", issue: { code, message: code, source_line_number: null, context: {} } });
      onProjectDestination();
      onOpenInspector();
      return false;
    }
    if (prepared.selected_semantic_zone_id) {
      dispatchSemantic({ type: "object_selected", objectId: prepared.selected_semantic_zone_id });
    }
    return planSemanticOperationSet(prepared.operations, "sketchpad_projection");
  }, [attachmentBusy, dispatchSemantic, onOpenInspector, onProjectDestination, planSemanticOperationSet, projectState.draft?.revision_id, projectState.project?.source_sha256, projectState.projectSessionId, semanticState.operations.length, semanticState.snapshot, semanticState.status, simulationBusy]);

  const applySemanticOperations = useCallback(async () => {
    const plan = semanticState.plan;
    const projectSessionId = projectState.projectSessionId;
    const revisionId = projectState.draft?.revision_id;
    const sourceSha256 = semanticState.snapshot?.source_sha256;
    const contextKey = activeSemanticContextRef.current;
    if (!plan?.patch_id || semanticState.status !== "review" || !projectSessionId || !revisionId || !sourceSha256 || !contextKey) return;
    const currentPlanIssue = semanticPlanResponseIssue(plan, {
      requestId: plan.request_id,
      projectSessionId,
      revisionId,
      sourceSha256,
      operationCount: semanticState.operations.length,
    });
    if (currentPlanIssue) {
      dispatchSemantic({ type: "failed", issue: currentPlanIssue });
      return;
    }
    const requestId = crypto.randomUUID();
    const patchId = plan.patch_id;
    dispatchSemantic({ type: "apply_started" });
    try {
      const response = await applySemanticPatchToDraft(requestId, projectSessionId, patchId);
      if (!mounted.current || activeSemanticContextRef.current !== contextKey) return;
      const issue = semanticApplyResponseIssue(response, { requestId, projectSessionId, patchId });
      if (issue || !response.project || !response.draft || !response.project_session_id) {
        dispatchSemantic({ type: "failed", issue: issue ?? { code: "semantic_apply_invalid", message: "Semantic patch application invalid", source_line_number: null, context: {} } });
        return;
      }
      dispatchProject({ type: "draft_replaced", project: response.project, projectSessionId: response.project_session_id, targetZoneId: currentZone?.zone_id ?? response.project.zones[0]?.zone_id ?? "", draft: response.draft });
      dispatchSemantic({ type: "applied" });
      dispatchPatch({ type: "project_or_zone_changed" });
      dispatchResult({ type: "project_or_zone_changed" });
      dispatchResultExport({ type: "result_changed" });
      dispatchRun({ type: "project_changed" });
      dispatchAi({ type: "context_changed" });
      dispatchSimulation({ type: "context_changed" });
      const noticeKey = semanticPlanOriginRef.current === "sketchpad_projection"
        ? "geometry.projectionPreview.applied"
        : "patch.draftAppliedSuccess";
      semanticPlanOriginRef.current = "manual";
      onNotice(t(noticeKey, { revision: response.draft.revision_number }));
    } catch {
      if (mounted.current && activeSemanticContextRef.current === contextKey) {
        dispatchSemantic({ type: "failed", issue: { code: "semantic_apply_failed", message: "Semantic patch application failed", source_line_number: null, context: {} } });
      }
    }
  }, [currentZone?.zone_id, dispatchAi, dispatchPatch, dispatchProject, dispatchResult, dispatchResultExport, dispatchRun, dispatchSemantic, dispatchSimulation, mounted, onNotice, projectState.draft?.revision_id, projectState.projectSessionId, semanticState.operations.length, semanticState.plan, semanticState.snapshot?.source_sha256, semanticState.status, t]);

  const discardSemanticOperations = useCallback(async () => {
    const plan = semanticState.plan;
    if (plan?.patch_id && projectState.projectSessionId) {
      try { await discardSemanticPatch(crypto.randomUUID(), projectState.projectSessionId, plan.patch_id); } catch { /* Local discard still clears the review. */ }
    }
    semanticPlanOriginRef.current = "manual";
    dispatchSemantic({ type: "discarded" });
  }, [dispatchSemantic, projectState.projectSessionId, semanticState.plan]);

  return {
    startVolumeEdit,
    planVolumePatch,
    applyVolumePatch,
    selectZoneById,
    selectedSemanticNode,
    selectedSemanticNodes,
    selectSemanticObject,
    editSemanticOperations,
    useAiSemanticPatch,
    planSemanticOperations,
    reviewSketchpadProjection,
    applySemanticOperations,
    discardSemanticOperations,
  };
}
