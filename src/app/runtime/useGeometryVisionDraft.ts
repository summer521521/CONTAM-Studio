import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateGeometryDraftFromImage, interruptReadonlyAiTurn } from "../desktop-api";
import {
  GEOMETRY_VISION_MODEL_ID,
  geometryAiCanvasPreview,
  geometryAiOperationIndices,
  toggleGeometryAiOperationSelection,
  isSafeGeometryAiDraft,
  selectGeometryAiOperations,
  type GeometryAiCanvasPreview,
  type GeometryAiDraft,
} from "../geometry/geometry-ai-draft";
import { sha256Text, type BuildingGeometry, type GeometryDiagnostic } from "../geometry/geometry-model";
import type { ProjectState } from "../project-state";
import {
  GEOMETRY_AI_OPERATION_APPROVAL_SCHEMA_VERSION,
  geometryOperationBatchSha256,
  previewGeometryOperationBatch,
  type GeometryAiOperationApproval,
  type GeometryWorkbenchController,
} from "./useGeometryWorkbench";

export type GeometryVisionDraftStatus = "idle" | "generating" | "ready" | "applying" | "applied" | "error";

export interface GeometryVisionDraftState {
  status: GeometryVisionDraftStatus;
  requestId: string | null;
  draft: GeometryAiDraft | null;
  previewGeometry: BuildingGeometry | null;
  canvasPreview: GeometryAiCanvasPreview | null;
  selectedOperationIndices: number[];
  autoIncludedOperationIndices: number[];
  diagnostics: GeometryDiagnostic[];
  issue: { code: string; message: string } | null;
  modelId: string;
  reasoningEffort: string | null;
}

export interface GeometryVisionDraftController extends GeometryVisionDraftState {
  generate: (attachmentId: string, prompt: string, language: "zh-CN" | "en") => Promise<void>;
  cancel: () => void;
  toggleOperation: (index: number) => void;
  setAllOperationsSelected: (selected: boolean) => void;
  confirm: () => boolean;
  dismiss: () => void;
}

const INITIAL_STATE: GeometryVisionDraftState = {
  status: "idle",
  requestId: null,
  draft: null,
  previewGeometry: null,
  canvasPreview: null,
  selectedOperationIndices: [],
  autoIncludedOperationIndices: [],
  diagnostics: [],
  issue: null,
  modelId: GEOMETRY_VISION_MODEL_ID,
  reasoningEffort: null,
};

function requestId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function selectionState(
  state: GeometryVisionDraftState,
  history: NonNullable<GeometryWorkbenchController["history"]>,
  selectedOperationIndices: number[],
  autoIncludedOperationIndices: number[] = [],
): GeometryVisionDraftState {
  if (!state.draft) return { ...state, selectedOperationIndices, autoIncludedOperationIndices };
  const operations = selectGeometryAiOperations(state.draft, selectedOperationIndices);
  if (!operations.length) {
    return {
      ...state,
      selectedOperationIndices,
      autoIncludedOperationIndices,
      previewGeometry: history.geometry,
      canvasPreview: null,
      diagnostics: [],
      issue: null,
    };
  }
  const preview = previewGeometryOperationBatch(history, operations);
  if (!preview.ready) {
    return {
      ...state,
      selectedOperationIndices,
      autoIncludedOperationIndices,
      previewGeometry: history.geometry,
      canvasPreview: null,
      diagnostics: preview.diagnostics,
      issue: { code: "geometry_ai_selection_invalid", message: "The selected geometry operations do not form a valid local draft." },
    };
  }
  return {
    ...state,
    selectedOperationIndices,
    autoIncludedOperationIndices,
    previewGeometry: preview.geometry,
    canvasPreview: geometryAiCanvasPreview(
      history.geometry,
      state.draft,
      geometryAiOperationIndices(state.draft),
      selectedOperationIndices,
    ),
    diagnostics: preview.diagnostics,
    issue: null,
  };
}

export function useGeometryVisionDraft(
  projectState: ProjectState,
  geometryController: GeometryWorkbenchController,
): GeometryVisionDraftController {
  const [state, setState] = useState<GeometryVisionDraftState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const generationRef = useRef(0);
  const historyRef = useRef(geometryController.history);
  const controllerRef = useRef(geometryController);
  historyRef.current = geometryController.history;
  controllerRef.current = geometryController;

  const contextKey = useMemo(() => {
    const history = geometryController.history;
    return projectState.projectSessionId && projectState.draft && history
      ? `${projectState.projectSessionId}:${projectState.draft.revision_id}:${history.geometry_hash}`
      : "none";
  }, [geometryController.history, projectState.draft, projectState.projectSessionId]);

  const stableIdentityRef = useRef(contextKey);
  useEffect(() => {
    if (stableIdentityRef.current === contextKey) return;
    stableIdentityRef.current = contextKey;
    generationRef.current += 1;
    if (stateRef.current.status === "generating") {
      void interruptReadonlyAiTurn(requestId("geometry-ai-context-change"));
    }
    setState(INITIAL_STATE);
  }, [contextKey]);

  const generate = useCallback(async (
    attachmentId: string,
    prompt: string,
    language: "zh-CN" | "en",
  ) => {
    const history = historyRef.current;
    const projectSessionId = projectState.projectSessionId;
    const revisionId = projectState.draft?.revision_id;
    if (!history || !projectSessionId || !revisionId) {
      setState({ ...INITIAL_STATE, status: "error", issue: { code: "geometry_ai_baseline_missing", message: "Create or load a metric geometry draft first." } });
      return;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const id = requestId("geometry-ai");
    const baselineHash = history.geometry_hash;
    setState({ ...INITIAL_STATE, status: "generating", requestId: id });
    try {
      const response = await generateGeometryDraftFromImage(
        id,
        projectSessionId,
        revisionId,
        attachmentId,
        history.geometry,
        prompt,
        language,
      );
      if (generationRef.current !== generation) return;
      const current = historyRef.current;
      if (!current || current.geometry_hash !== baselineHash
        || response.request_id !== id || response.model_id !== GEOMETRY_VISION_MODEL_ID) {
        setState({ ...INITIAL_STATE, status: "error", issue: { code: "geometry_ai_context_stale", message: "The geometry changed while Codex was reading the image." } });
        return;
      }
      if (response.status !== "completed" || response.error || !isSafeGeometryAiDraft(response.draft)
        || response.draft.project_session_id !== projectSessionId
        || response.draft.revision_id !== revisionId
        || response.draft.baseline_geometry_hash.toLowerCase() !== baselineHash.toLowerCase()) {
        setState({
          ...INITIAL_STATE,
          status: "error",
          issue: response.error ?? { code: "geometry_ai_response_contract_invalid", message: "Codex returned an invalid geometry draft." },
          reasoningEffort: response.reasoning_effort,
        });
        return;
      }
      const preview = previewGeometryOperationBatch(current, response.draft.operations);
      if (!preview.ready && response.draft.operations.length > 0) {
        setState({
          ...INITIAL_STATE,
          status: "error",
          draft: response.draft,
          diagnostics: preview.diagnostics,
          issue: { code: "geometry_ai_draft_rejected", message: "The local geometry validator rejected the Codex draft." },
          reasoningEffort: response.reasoning_effort,
        });
        return;
      }
      setState({
        status: "ready",
        requestId: id,
        draft: response.draft,
        previewGeometry: preview.ready ? preview.geometry : current.geometry,
        canvasPreview: geometryAiCanvasPreview(
          current.geometry,
          response.draft,
          geometryAiOperationIndices(response.draft),
          geometryAiOperationIndices(response.draft),
        ),
        selectedOperationIndices: geometryAiOperationIndices(response.draft),
        autoIncludedOperationIndices: [],
        diagnostics: preview.diagnostics,
        issue: null,
        modelId: response.model_id,
        reasoningEffort: response.reasoning_effort,
      });
    } catch {
      if (generationRef.current === generation) {
        setState({ ...INITIAL_STATE, status: "error", issue: { code: "geometry_ai_request_failed", message: "The Codex geometry request failed." } });
      }
    }
  }, [projectState.draft?.revision_id, projectState.projectSessionId]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    const generating = stateRef.current.status === "generating";
    setState(INITIAL_STATE);
    if (generating) void interruptReadonlyAiTurn(requestId("geometry-ai-interrupt"));
  }, []);

  const dismiss = useCallback(() => {
    generationRef.current += 1;
    setState(INITIAL_STATE);
  }, []);

  const toggleOperation = useCallback((index: number) => {
    const currentState = stateRef.current;
    const history = historyRef.current;
    if (currentState.status !== "ready" || !currentState.draft || !history
      || !Number.isSafeInteger(index) || index < 0 || index >= currentState.draft.operations.length) return;
    const currentSelection = new Set(currentState.selectedOperationIndices);
    const change = toggleGeometryAiOperationSelection(
      currentState.draft,
      history.geometry,
      [...currentSelection],
      index,
    );
    const nextState = selectionState(currentState, history, change.selectedIndices, change.autoIncludedIndices);
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const setAllOperationsSelected = useCallback((selected: boolean) => {
    const currentState = stateRef.current;
    const history = historyRef.current;
    if (currentState.status !== "ready" || !currentState.draft || !history) return;
    const nextSelection = selected ? geometryAiOperationIndices(currentState.draft) : [];
    const nextState = selectionState(currentState, history, nextSelection, []);
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const confirm = useCallback((): boolean => {
    const currentState = stateRef.current;
    const current = historyRef.current;
    const draft = currentState.draft;
    if (currentState.status !== "ready" || !current || !draft || !currentState.requestId
      || current.geometry_hash.toLowerCase() !== draft.baseline_geometry_hash.toLowerCase()) {
      setState((value) => ({ ...value, status: "error", issue: { code: "geometry_ai_context_stale", message: "The geometry changed before the draft was confirmed." } }));
      return false;
    }
    const operations = selectGeometryAiOperations(draft, currentState.selectedOperationIndices);
    if (!operations.length) {
      setState((value) => ({ ...value, status: "error", issue: { code: "geometry_ai_operations_empty", message: "Select at least one geometry operation before confirming." } }));
      return false;
    }
    const preview = previewGeometryOperationBatch(current, operations);
    const operationsSha256 = geometryOperationBatchSha256(operations);
    const approvalSeed = `${currentState.requestId}:${draft.attachment_sha256}:${current.geometry_hash}:${operationsSha256}`;
    const approval: GeometryAiOperationApproval = {
      schemaVersion: GEOMETRY_AI_OPERATION_APPROVAL_SCHEMA_VERSION,
      approvalId: `geometry-ai-approval-${sha256Text(approvalSeed).slice(0, 32)}`,
      approvedBy: "user",
      sourceRequestId: currentState.requestId,
      attachmentSha256: draft.attachment_sha256,
      projectSessionId: current.geometry.project_session_id,
      revisionId: current.geometry.revision_id,
      geometryId: current.geometry.geometry_id,
      baselineGeometryHash: current.geometry_hash,
      operationsSha256,
    };
    const applyingState = { ...currentState, status: "applying" as const };
    stateRef.current = applyingState;
    setState(applyingState);
    if (!preview.ready || !controllerRef.current.commitAiOperations(operations, approval)) {
      setState((value) => ({ ...value, status: "error", diagnostics: preview.diagnostics, issue: { code: "geometry_ai_draft_rejected", message: "The local geometry validator rejected the Codex draft." } }));
      return false;
    }
    setState((value) => ({ ...value, status: "applied", selectedOperationIndices: [], autoIncludedOperationIndices: [], previewGeometry: null, canvasPreview: null, issue: null }));
    return true;
  }, []);

  return { ...state, generate, cancel, toggleOperation, setAllOperationsSelected, confirm, dismiss };
}
