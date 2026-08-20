import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exportSemanticAuthoringDraftCopy,
  loadProjectGeometryDocument,
  saveProjectGeometryDocument,
} from "../desktop-api";
import type { ProjectState } from "../project-state";
import { semanticNodeId, type SemanticSnapshot } from "../semantic-state";
import {
  createBlankBuildingGeometry,
  createTeachingBuildingGeometry,
  type GeometryDraftContext,
} from "../geometry/geometry-factories";
import {
  commitGeometryCommand,
  createGeometryHistory,
  redoGeometryCommand,
  undoGeometryCommand,
  type GeometryHistoryState,
} from "../geometry/geometry-history";
import { previewGeometryCommand } from "../geometry/geometry-commands";
import {
  GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION,
  canonicalJson,
  sha256Text,
  type GeometryDiagnostic,
  type GeometryEditCommand,
  type GeometryCommandOperation,
} from "../geometry/geometry-model";
import {
  INITIAL_GEOMETRY_PERSISTENCE_STATE,
  geometryDocumentResponseIssue,
  persistenceStateFromSummary,
  type GeometryPersistenceState,
} from "../geometry/geometry-document";
import {
  createEmptyContamSemanticDraft,
  semanticDraftSha256,
  validateContamSemanticDraft,
  type ContamSemanticDraft,
  type ContamSemanticDraftContext,
} from "../geometry/contam-semantic-draft";
import {
  INITIAL_SEMANTIC_AUTHORING_EXPORT_STATE,
  semanticAuthoringExportResponseIssue,
  type SemanticAuthoringExportState,
} from "../geometry/semantic-authoring-export";

export type GeometryWorkbenchMode = "studio" | "sketchpad" | "topology";
export type GeometryTool = "select" | "pan" | "wall" | "split" | "zone" | "partition" | "merge" | "door" | "window" | "vertical_opening" | "flow_path" | "dimension" | "calibrate_underlay";
export type GeometrySelectionKind = "vertex" | "wall" | "opening" | "zone" | "flow_path" | "vertical_opening" | "vertical_flow_path";
export interface GeometrySelection { kind: GeometrySelectionKind; id: string; }
export interface GeometryOperationInput { operation: GeometryCommandOperation; parameters: Record<string, unknown>; }
export interface GeometryOperationBatchResult {
  committed: boolean;
  state: GeometryHistoryState;
  diagnostics: GeometryDiagnostic[];
}
export interface GeometryOperationBatchPreview {
  ready: boolean;
  geometry: GeometryHistoryState["geometry"];
  geometryHash: string;
  diagnostics: GeometryDiagnostic[];
}

interface GeometryAuthoringHistoryEntry {
  commandCount: number;
  semanticBefore: ContamSemanticDraft | null;
  semanticAfter: ContamSemanticDraft | null;
}

export const GEOMETRY_AI_OPERATION_APPROVAL_SCHEMA_VERSION = "geometry_ai_operation_approval.v1" as const;

export interface GeometryAiOperationApproval {
  schemaVersion: typeof GEOMETRY_AI_OPERATION_APPROVAL_SCHEMA_VERSION;
  approvalId: string;
  approvedBy: "user";
  sourceRequestId: string;
  attachmentSha256: string;
  projectSessionId: string;
  revisionId: string;
  geometryId: string;
  baselineGeometryHash: string;
  operationsSha256: string;
}

export interface GeometryWorkbenchController {
  mode: GeometryWorkbenchMode;
  tool: GeometryTool;
  history: GeometryHistoryState | null;
  semanticDraft: ContamSemanticDraft | null;
  selection: GeometrySelection | null;
  selectedZoneId: string | null;
  selectedFlowPathId: string | null;
  teachingExample: boolean;
  diagnostics: GeometryDiagnostic[];
  persistence: GeometryPersistenceState;
  semanticExport: SemanticAuthoringExportState;
  canUndo: boolean;
  canRedo: boolean;
  setMode: (mode: GeometryWorkbenchMode) => void;
  setTool: (tool: GeometryTool) => void;
  setSelection: (selection: GeometrySelection | null) => void;
  setSelectedZoneId: (zoneId: string | null) => void;
  setSelectedFlowPathId: (flowPathId: string | null) => void;
  clearDiagnostics: () => void;
  createBlankDraft: () => void;
  loadTeachingExample: () => void;
  commitOperations: (operations: GeometryOperationInput[], selectAfter?: GeometrySelection | null) => boolean;
  commitSemanticAuthoring: (
    operations: GeometryOperationInput[],
    draft: ContamSemanticDraft,
    selectAfter?: GeometrySelection | null,
  ) => boolean;
  previewOperations: (operations: GeometryOperationInput[]) => GeometryOperationBatchPreview | null;
  commitAiOperations: (
    operations: GeometryOperationInput[],
    approval: GeometryAiOperationApproval,
    selectAfter?: GeometrySelection | null,
  ) => boolean;
  undo: () => void;
  redo: () => void;
  retryPersistence: () => void;
  exportSemanticDraft: () => void;
  replaceSemanticDraft: (draft: ContamSemanticDraft) => boolean;
}

function randomId(prefix: string): string {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function draftContext(projectState: ProjectState, snapshot: SemanticSnapshot | null): GeometryDraftContext | null {
  if (!projectState.project || !projectState.projectSessionId || !projectState.draft || !snapshot) return null;
  return {
    projectSessionId: projectState.projectSessionId,
    revisionId: projectState.draft.revision_id,
    project: projectState.project,
    snapshot,
  };
}

function semanticDraftContext(
  context: GeometryDraftContext,
  snapshot: SemanticSnapshot,
  geometry: GeometryHistoryState["geometry"],
): ContamSemanticDraftContext {
  return {
    projectSessionId: context.projectSessionId,
    identitySha256: context.snapshot.identity_sha256 ?? context.project.source_sha256,
    sourceSha256: context.project.source_sha256,
    revisionId: context.revisionId,
    levelNumbers: new Set([
      ...geometry.levels.map((level) => level.level_number),
      ...snapshot.levels.map((level) => level.level_number).filter((value): value is number => Number.isSafeInteger(value)),
    ]),
    existingZoneIds: new Set(snapshot.zones.map(semanticNodeId).filter((value): value is string => Boolean(value))),
    supportedFlowElementIds: new Set((snapshot.flow_elements ?? [])
      .filter((element) => element.supported === true)
      .map((element) => typeof element.element_id === "string" ? element.element_id : null)
      .filter((value): value is string => Boolean(value))),
    geometry,
  };
}

export function commitGeometryOperationBatch(
  history: GeometryHistoryState,
  operations: GeometryOperationInput[],
  commandIdFactory: (prefix: string) => string = randomId,
): GeometryOperationBatchResult {
  if (!operations.length) return { committed: false, state: history, diagnostics: [] };
  let candidate = history;
  for (const input of operations) {
    const command: GeometryEditCommand = {
      schema_version: GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION,
      command_id: commandIdFactory("geometry-command"),
      sequence: candidate.geometry.geometry_revision + 1,
      project_session_id: candidate.geometry.project_session_id,
      geometry_id: candidate.geometry.geometry_id,
      baseline_revision_id: candidate.geometry.revision_id,
      baseline_geometry_hash: candidate.geometry_hash,
      actor: "user",
      operation: input.operation,
      parameters: input.parameters,
    };
    const transition = commitGeometryCommand(candidate, command);
    if (transition.status !== "committed") {
      return {
        committed: false,
        state: history,
        diagnostics: transition.result?.diagnostics ?? [{ code: `geometry_command_${transition.status}`, severity: "error", object_id: null }],
      };
    }
    candidate = transition.state;
  }
  return { committed: true, state: candidate, diagnostics: [] };
}

export function geometryOperationBatchSha256(operations: GeometryOperationInput[]): string {
  return sha256Text(canonicalJson(operations));
}

function rejectedAiBatch(
  history: GeometryHistoryState,
  code: string,
): GeometryOperationBatchResult {
  return {
    committed: false,
    state: history,
    diagnostics: [{ code, severity: "error", object_id: null }],
  };
}

function safeApprovalId(value: string): boolean {
  return /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
}

export function commitApprovedAiGeometryOperationBatch(
  history: GeometryHistoryState,
  operations: GeometryOperationInput[],
  approval: GeometryAiOperationApproval | null,
): GeometryOperationBatchResult {
  if (!operations.length) return rejectedAiBatch(history, "geometry_ai_operations_empty");
  if (!approval
    || approval.schemaVersion !== GEOMETRY_AI_OPERATION_APPROVAL_SCHEMA_VERSION
    || approval.approvedBy !== "user"
    || !safeApprovalId(approval.approvalId)
    || !safeApprovalId(approval.sourceRequestId)
    || !/^[a-f0-9]{64}$/i.test(approval.attachmentSha256)
    || !/^[a-f0-9]{64}$/i.test(approval.baselineGeometryHash)
    || !/^[a-f0-9]{64}$/i.test(approval.operationsSha256)) {
    return rejectedAiBatch(history, "geometry_ai_approval_required");
  }
  if (approval.projectSessionId !== history.geometry.project_session_id
    || approval.revisionId !== history.geometry.revision_id
    || approval.geometryId !== history.geometry.geometry_id
    || approval.baselineGeometryHash.toLowerCase() !== history.geometry_hash.toLowerCase()) {
    return rejectedAiBatch(history, "geometry_ai_approval_stale");
  }
  if (approval.operationsSha256.toLowerCase() !== geometryOperationBatchSha256(operations)) {
    return rejectedAiBatch(history, "geometry_ai_approval_scope_mismatch");
  }

  const approvalToken = sha256Text(approval.approvalId).slice(0, 24);
  let candidate = history;
  for (let index = 0; index < operations.length; index += 1) {
    const input = operations[index];
    const command: GeometryEditCommand = {
      schema_version: GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION,
      command_id: `geometry-ai-${approvalToken}-${index + 1}`,
      sequence: candidate.geometry.geometry_revision + 1,
      project_session_id: candidate.geometry.project_session_id,
      geometry_id: candidate.geometry.geometry_id,
      baseline_revision_id: candidate.geometry.revision_id,
      baseline_geometry_hash: candidate.geometry_hash,
      actor: "ai_suggestion",
      operation: input.operation,
      parameters: input.parameters,
    };
    const transition = commitGeometryCommand(candidate, command, {
      command_id: command.command_id,
      baseline_geometry_hash: candidate.geometry_hash,
      approved_by: "user",
    });
    if (transition.status !== "committed") {
      return {
        committed: false,
        state: history,
        diagnostics: transition.result?.diagnostics
          ?? [{ code: `geometry_command_${transition.status}`, severity: "error", object_id: null }],
      };
    }
    candidate = transition.state;
  }
  return { committed: true, state: candidate, diagnostics: [] };
}

export function previewGeometryOperationBatch(
  history: GeometryHistoryState,
  operations: GeometryOperationInput[],
  commandIdFactory: (prefix: string) => string = randomId,
): GeometryOperationBatchPreview {
  if (!operations.length) {
    return { ready: false, geometry: history.geometry, geometryHash: history.geometry_hash, diagnostics: [] };
  }
  let geometry = history.geometry;
  let geometryHash = history.geometry_hash;
  for (const input of operations) {
    const command: GeometryEditCommand = {
      schema_version: GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION,
      command_id: commandIdFactory("geometry-ai-preview"),
      sequence: geometry.geometry_revision + 1,
      project_session_id: geometry.project_session_id,
      geometry_id: geometry.geometry_id,
      baseline_revision_id: geometry.revision_id,
      baseline_geometry_hash: geometryHash,
      actor: "ai_suggestion",
      operation: input.operation,
      parameters: input.parameters,
    };
    const result = previewGeometryCommand(geometry, command);
    if (result.status !== "ready") {
      return { ready: false, geometry: history.geometry, geometryHash: history.geometry_hash, diagnostics: result.diagnostics };
    }
    geometry = result.after;
    geometryHash = result.geometry_hash;
  }
  return { ready: true, geometry, geometryHash, diagnostics: [] };
}

export function undoGeometryOperationBatch(
  history: GeometryHistoryState,
  commandCount: number,
): GeometryHistoryState {
  let candidate = history;
  for (let index = 0; index < commandCount; index += 1) {
    candidate = undoGeometryCommand(candidate);
  }
  return candidate;
}

export function redoGeometryOperationBatch(
  history: GeometryHistoryState,
  commandCount: number,
): GeometryHistoryState {
  let candidate = history;
  for (let index = 0; index < commandCount; index += 1) {
    candidate = redoGeometryCommand(candidate);
  }
  return candidate;
}

export function useGeometryWorkbench(
  projectState: ProjectState,
  snapshot: SemanticSnapshot | null,
): GeometryWorkbenchController {
  const context = useMemo(() => draftContext(projectState, snapshot), [projectState, snapshot]);
  const contextKey = context
    ? `${context.projectSessionId}:${context.project.source_sha256}:${context.revisionId}:${context.snapshot.identity_sha256 ?? "none"}`
    : "none";
  const [mode, setMode] = useState<GeometryWorkbenchMode>("studio");
  const [tool, setTool] = useState<GeometryTool>("select");
  const [history, setHistory] = useState<GeometryHistoryState | null>(null);
  const [semanticDraft, setSemanticDraft] = useState<ContamSemanticDraft | null>(null);
  const [selection, setSelection] = useState<GeometrySelection | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedFlowPathId, setSelectedFlowPathId] = useState<string | null>(null);
  const [teachingExample, setTeachingExample] = useState(false);
  const [diagnostics, setDiagnostics] = useState<GeometryDiagnostic[]>([]);
  const [undoEntries, setUndoEntries] = useState<GeometryAuthoringHistoryEntry[]>([]);
  const [redoEntries, setRedoEntries] = useState<GeometryAuthoringHistoryEntry[]>([]);
  const [persistence, setPersistence] = useState<GeometryPersistenceState>(INITIAL_GEOMETRY_PERSISTENCE_STATE);
  const [semanticExport, setSemanticExport] = useState<SemanticAuthoringExportState>(INITIAL_SEMANTIC_AUTHORING_EXPORT_STATE);
  const [loadEpoch, setLoadEpoch] = useState(0);
  const persistenceSequence = useRef(0);
  const exportSequence = useRef(0);
  const activeContextKey = useRef(contextKey);
  activeContextKey.current = contextKey;

  useEffect(() => {
    persistenceSequence.current += 1;
    exportSequence.current += 1;
    setHistory(null);
    setSemanticDraft(null);
    setSelection(null);
    setSelectedZoneId(null);
    setSelectedFlowPathId(null);
    setTeachingExample(false);
    setDiagnostics([]);
    setUndoEntries([]);
    setRedoEntries([]);
    setTool("select");
    setPersistence(context ? { ...INITIAL_GEOMETRY_PERSISTENCE_STATE, status: "loading" } : INITIAL_GEOMETRY_PERSISTENCE_STATE);
    setSemanticExport(INITIAL_SEMANTIC_AUTHORING_EXPORT_STATE);
  }, [contextKey]);

  const contextProjectSessionId = context?.projectSessionId ?? null;
  const contextRevisionId = context?.revisionId ?? null;
  useEffect(() => {
    if (!contextProjectSessionId || !contextRevisionId) return;
    const expectedContextKey = contextKey;
    const sequence = ++persistenceSequence.current;
    const requestId = randomId("geometry-document-load");
    setPersistence({ ...INITIAL_GEOMETRY_PERSISTENCE_STATE, status: "loading" });
    void loadProjectGeometryDocument(requestId, contextProjectSessionId, contextRevisionId)
      .then((response) => {
        if (sequence !== persistenceSequence.current || activeContextKey.current !== expectedContextKey) return;
        const issue = geometryDocumentResponseIssue(response, requestId, contextProjectSessionId, contextRevisionId);
        if (issue) {
          setPersistence({ ...INITIAL_GEOMETRY_PERSISTENCE_STATE, status: "error", issue });
          return;
        }
        if (response.status === "not_found") {
          setPersistence({ ...INITIAL_GEOMETRY_PERSISTENCE_STATE, status: "not_found" });
          return;
        }
        if (response.status !== "restored" || !response.geometry || !response.summary) return;
        setHistory(createGeometryHistory(response.geometry));
        setSemanticDraft(response.semantic_draft);
        setTeachingExample(response.geometry.warnings.some((warning) => warning.code === "geometry_teaching_example_not_prj"));
        setPersistence(persistenceStateFromSummary("restored", response.summary));
      })
      .catch(() => {
        if (sequence !== persistenceSequence.current || activeContextKey.current !== expectedContextKey) return;
        setPersistence({
          ...INITIAL_GEOMETRY_PERSISTENCE_STATE,
          status: "error",
          issue: { code: "geometry_document_transport_failed", message: "Geometry document transport failed", source_line_number: null, context: {} },
        });
      });
  }, [contextKey, contextProjectSessionId, contextRevisionId, loadEpoch]);

  const geometryHash = history?.geometry_hash ?? null;
  const semanticHash = semanticDraft ? semanticDraftSha256(semanticDraft) : null;
  useEffect(() => {
    if (!contextProjectSessionId || !contextRevisionId || !history || !geometryHash) return undefined;
    if (persistence.status === "loading" || persistence.status === "saving" || persistence.status === "error") return undefined;
    if (persistence.geometryHash === geometryHash.toLowerCase()
      && persistence.semanticDraftHash === (semanticHash?.toLowerCase() ?? null)
      && (persistence.status === "restored" || persistence.status === "saved")) return undefined;
    const expectedContextKey = contextKey;
    const expectedDocumentRevision = persistence.documentRevision;
    const geometry = history.geometry;
    const timer = window.setTimeout(() => {
      const sequence = ++persistenceSequence.current;
      const requestId = randomId("geometry-document-save");
      setPersistence((current) => ({ ...current, status: "saving", issue: null }));
      void saveProjectGeometryDocument(
        requestId,
        contextProjectSessionId,
        contextRevisionId,
        geometry,
        semanticDraft,
        expectedDocumentRevision,
      ).then((response) => {
        if (sequence !== persistenceSequence.current || activeContextKey.current !== expectedContextKey) return;
        const issue = geometryDocumentResponseIssue(response, requestId, contextProjectSessionId, contextRevisionId);
        if (issue || response.status !== "saved" || !response.summary) {
          setPersistence((current) => ({ ...current, status: "error", issue: issue ?? {
            code: "geometry_document_response_invalid",
            message: "Geometry document save response was invalid",
            source_line_number: null,
            context: {},
          } }));
          return;
        }
        setPersistence(persistenceStateFromSummary("saved", response.summary));
      }).catch(() => {
        if (sequence !== persistenceSequence.current || activeContextKey.current !== expectedContextKey) return;
        setPersistence((current) => ({ ...current, status: "error", issue: {
          code: "geometry_document_transport_failed",
          message: "Geometry document transport failed",
          source_line_number: null,
          context: {},
        } }));
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [contextKey, contextProjectSessionId, contextRevisionId, geometryHash, history, persistence.documentRevision, persistence.geometryHash, persistence.semanticDraftHash, persistence.status, semanticDraft, semanticHash]);

  const createBlankDraft = useCallback(() => {
    if (!context) return;
    setHistory(createGeometryHistory(createBlankBuildingGeometry(context)));
    setSemanticDraft(createEmptyContamSemanticDraft({
      projectSessionId: context.projectSessionId,
      identitySha256: context.snapshot.identity_sha256 ?? context.project.source_sha256,
      sourceSha256: context.project.source_sha256,
      revisionId: context.revisionId,
    }, randomId("semantic-draft")));
    setTeachingExample(false);
    setDiagnostics([]);
    setUndoEntries([]);
    setRedoEntries([]);
    setSelection(null);
    setTool("wall");
    setPersistence((current) => current.status === "error"
      ? { ...INITIAL_GEOMETRY_PERSISTENCE_STATE, status: "not_found" }
      : current);
  }, [context]);

  const loadTeachingExample = useCallback(() => {
    if (!context) return;
    setHistory(createGeometryHistory(createTeachingBuildingGeometry(context)));
    setSemanticDraft(createEmptyContamSemanticDraft({
      projectSessionId: context.projectSessionId,
      identitySha256: context.snapshot.identity_sha256 ?? context.project.source_sha256,
      sourceSha256: context.project.source_sha256,
      revisionId: context.revisionId,
    }, randomId("semantic-draft")));
    setTeachingExample(true);
    setDiagnostics([]);
    setUndoEntries([]);
    setRedoEntries([]);
    setSelection(null);
    setTool("select");
    setPersistence((current) => current.status === "error"
      ? { ...INITIAL_GEOMETRY_PERSISTENCE_STATE, status: "not_found" }
      : current);
  }, [context]);

  const commitOperations = useCallback((operations: GeometryOperationInput[], selectAfter: GeometrySelection | null = null): boolean => {
    if (!operations.length || !history) return false;
    const result = commitGeometryOperationBatch(history, operations);
    if (!result.committed) {
      setDiagnostics(result.diagnostics);
      return false;
    }
    if (semanticDraft && context && snapshot) {
      const semanticValidation = validateContamSemanticDraft(
        semanticDraft,
        semanticDraftContext(context, snapshot, result.state.geometry),
      );
      if (semanticValidation.status !== "valid") {
        setDiagnostics(semanticValidation.diagnostics.map((code) => ({ code, severity: "error", object_id: null })));
        return false;
      }
    }
    setHistory(result.state);
    setUndoEntries((current) => [...current, {
      commandCount: operations.length,
      semanticBefore: semanticDraft,
      semanticAfter: semanticDraft,
    }]);
    setRedoEntries([]);
    setDiagnostics([]);
    setSelection(selectAfter);
    return true;
  }, [context, history, semanticDraft, snapshot]);
  const commitSemanticAuthoring = useCallback((
    operations: GeometryOperationInput[],
    draft: ContamSemanticDraft,
    selectAfter: GeometrySelection | null = null,
  ): boolean => {
    if (!context || !snapshot || !history) return false;
    const result = operations.length
      ? commitGeometryOperationBatch(history, operations)
      : { committed: true, state: history, diagnostics: [] };
    if (!result.committed) {
      setDiagnostics(result.diagnostics);
      return false;
    }
    const validation = validateContamSemanticDraft(
      draft,
      semanticDraftContext(context, snapshot, result.state.geometry),
    );
    if (validation.status !== "valid") {
      setDiagnostics(validation.diagnostics.map((code) => ({ code, severity: "error", object_id: null })));
      return false;
    }
    if (!operations.length && semanticDraft && semanticDraftSha256(semanticDraft) === validation.draft_sha256) {
      setDiagnostics([]);
      return true;
    }
    setHistory(result.state);
    setSemanticDraft(draft);
    setUndoEntries((current) => [...current, {
      commandCount: operations.length,
      semanticBefore: semanticDraft,
      semanticAfter: draft,
    }]);
    setRedoEntries([]);
    setDiagnostics([]);
    setSelection(selectAfter);
    return true;
  }, [context, history, semanticDraft, snapshot]);
  const previewOperations = useCallback((operations: GeometryOperationInput[]): GeometryOperationBatchPreview | null => {
    return history ? previewGeometryOperationBatch(history, operations) : null;
  }, [history]);
  const commitAiOperations = useCallback((
    operations: GeometryOperationInput[],
    approval: GeometryAiOperationApproval,
    selectAfter: GeometrySelection | null = null,
  ): boolean => {
    if (!operations.length || !history) return false;
    const result = commitApprovedAiGeometryOperationBatch(history, operations, approval);
    if (!result.committed) {
      setDiagnostics(result.diagnostics);
      return false;
    }
    if (semanticDraft && context && snapshot) {
      const semanticValidation = validateContamSemanticDraft(
        semanticDraft,
        semanticDraftContext(context, snapshot, result.state.geometry),
      );
      if (semanticValidation.status !== "valid") {
        setDiagnostics(semanticValidation.diagnostics.map((code) => ({ code, severity: "error", object_id: null })));
        return false;
      }
    }
    setHistory(result.state);
    setUndoEntries((current) => [...current, {
      commandCount: operations.length,
      semanticBefore: semanticDraft,
      semanticAfter: semanticDraft,
    }]);
    setRedoEntries([]);
    setDiagnostics([]);
    setSelection(selectAfter);
    return true;
  }, [context, history, semanticDraft, snapshot]);

  const undo = useCallback(() => {
    const entry = undoEntries.at(-1);
    if (!entry) return;
    setHistory((current) => current ? undoGeometryOperationBatch(current, entry.commandCount) : current);
    setSemanticDraft(entry.semanticBefore);
    setUndoEntries((current) => current.slice(0, -1));
    setRedoEntries((current) => [...current, entry]);
    setSelection(null);
    setDiagnostics([]);
  }, [undoEntries]);
  const redo = useCallback(() => {
    const entry = redoEntries.at(-1);
    if (!entry) return;
    setHistory((current) => current ? redoGeometryOperationBatch(current, entry.commandCount) : current);
    setSemanticDraft(entry.semanticAfter);
    setRedoEntries((current) => current.slice(0, -1));
    setUndoEntries((current) => [...current, entry]);
    setSelection(null);
    setDiagnostics([]);
  }, [redoEntries]);
  const retryPersistence = useCallback(() => {
    if (persistence.status !== "error") return;
    if (history) {
      setPersistence((current) => ({
        ...current,
        status: current.documentRevision === null ? "not_found" : "restored",
        issue: null,
      }));
      return;
    }
    setLoadEpoch((current) => current + 1);
  }, [history, persistence.status]);
  const exportSemanticDraft = useCallback(() => {
    if (!contextProjectSessionId || !contextRevisionId || !semanticDraft || !history) return;
    const expectedSemanticHash = semanticDraftSha256(semanticDraft).toLowerCase();
    const persisted = (persistence.status === "saved" || persistence.status === "restored")
      && persistence.geometryHash === history.geometry_hash.toLowerCase()
      && persistence.semanticDraftHash === expectedSemanticHash;
    if (!persisted) {
      setSemanticExport({
        status: "error",
        summary: null,
        issue: {
          code: "semantic_authoring_export_persistence_pending",
          message: "Save the current Geometry Workbench draft before export",
          source_line_number: null,
          context: {},
        },
      });
      return;
    }
    const zoneIds = semanticDraft.zones.map((zone) => zone.id);
    const flowPathIds = semanticDraft.flow_paths.map((path) => path.id);
    if (zoneIds.length + flowPathIds.length === 0) {
      setSemanticExport({
        status: "error",
        summary: null,
        issue: {
          code: "semantic_draft_empty",
          message: "The semantic authoring draft has no new CONTAM objects",
          source_line_number: null,
          context: {},
        },
      });
      return;
    }
    const sequence = ++exportSequence.current;
    const expectedContextKey = contextKey;
    const requestId = randomId("semantic-authoring-export");
    setSemanticExport({ status: "exporting", summary: null, issue: null });
    void exportSemanticAuthoringDraftCopy(requestId, contextProjectSessionId, contextRevisionId)
      .then((response) => {
        if (sequence !== exportSequence.current || activeContextKey.current !== expectedContextKey) return;
        const responseIssue = semanticAuthoringExportResponseIssue(
          response,
          requestId,
          contextProjectSessionId,
          contextRevisionId,
          zoneIds,
          flowPathIds,
        );
        if (responseIssue) {
          setSemanticExport({ status: "error", summary: null, issue: responseIssue });
          return;
        }
        if (response.cancelled) {
          setSemanticExport({ status: "cancelled", summary: null, issue: null });
          return;
        }
        setSemanticExport({ status: "success", summary: response.export, issue: null });
      })
      .catch(() => {
        if (sequence !== exportSequence.current || activeContextKey.current !== expectedContextKey) return;
        setSemanticExport({
          status: "error",
          summary: null,
          issue: {
            code: "semantic_authoring_export_transport_failed",
            message: "Semantic authoring export transport failed",
            source_line_number: null,
            context: {},
          },
        });
      });
  }, [contextKey, contextProjectSessionId, contextRevisionId, history, persistence.geometryHash, persistence.semanticDraftHash, persistence.status, semanticDraft]);
  const replaceSemanticDraft = useCallback((draft: ContamSemanticDraft): boolean => {
    if (!context || !snapshot || !history) return false;
    const validation = validateContamSemanticDraft(
      draft,
      semanticDraftContext(context, snapshot, history.geometry),
    );
    if (validation.status !== "valid") {
      setDiagnostics(validation.diagnostics.map((code) => ({ code, severity: "error", object_id: null })));
      return false;
    }
    return commitSemanticAuthoring([], draft, selection);
  }, [commitSemanticAuthoring, context, history, selection, snapshot]);
  const clearDiagnostics = useCallback(() => setDiagnostics([]), []);

  return {
    mode,
    tool,
    history,
    semanticDraft,
    selection,
    selectedZoneId,
    selectedFlowPathId,
    teachingExample,
    diagnostics,
    persistence,
    semanticExport,
    canUndo: undoEntries.length > 0,
    canRedo: redoEntries.length > 0,
    setMode,
    setTool,
    setSelection,
    setSelectedZoneId,
    setSelectedFlowPathId,
    clearDiagnostics,
    createBlankDraft,
    loadTeachingExample,
    commitOperations,
    commitSemanticAuthoring,
    previewOperations,
    commitAiOperations,
    undo,
    redo,
    retryPersistence,
    exportSemanticDraft,
    replaceSemanticDraft,
  };
}
