import type { DraftSummary, ProjectInspection, ReaderDiagnostic } from "./project-state";
import type { SpatialProjection } from "./spatial-model";

export type SemanticOperationKind =
  | "set_zone_volume"
  | "set_zone_name"
  | "set_flow_path_multiplier"
  | "set_flow_path_coefficient"
  | "set_spatial_icon_column"
  | "set_spatial_icon_row";
export interface SemanticOperationRequest { operation: SemanticOperationKind; object_id: string; new_value: string; unit: string | null; }
export interface SemanticOperationView extends SemanticOperationRequest { operation_id: string; field: string; old_value: string; evidence_span: [number, number]; source_sha256: string; }
export interface SemanticNode { object_id?: string; zone_id?: string; level_id?: string; path_id?: string; species_id?: string; source_id?: string; object_kind?: string; name?: string; label?: string; contam_number?: number; level_number?: number; from_endpoint?: { category: string; contam_number: number | null }; to_endpoint?: { category: string; contam_number: number | null }; flow_element_id?: string; direction?: number; multiplier?: number; fields?: Record<string, unknown>; capabilities?: Record<string, { state: string; unit: string | null; reason?: string }>; editable?: boolean; source_line_number?: number; section?: string; [key: string]: unknown; }
export interface SemanticSnapshot { result_type: "semantic_project_snapshot"; source_sha256: string; identity_sha256?: string; revision_state: string; project: SemanticNode; levels: SemanticNode[]; zones: SemanticNode[]; flow_paths: SemanticNode[]; flow_elements?: SemanticNode[]; schedules: SemanticNode[]; species: SemanticNode[]; sources: SemanticNode[]; sections: SemanticNode[]; spatial_projection: SpatialProjection; document_envelope?: Record<string, unknown>; unknown_content?: { preserved: boolean; reason: string }; read_only_reason: string | null; [key: string]: unknown; }
export interface DesktopSemanticSnapshotResponse { request_id: string; project_session_id: string | null; revision_id: string | null; snapshot: SemanticSnapshot | { result_type: "semantic_object"; object: SemanticNode } | null; error: ReaderDiagnostic | null; }
export interface DesktopSemanticPatchPlanResponse { request_id: string; project_session_id: string | null; revision_id: string | null; patch_id: string | null; source_sha256: string | null; patch_sha256: string | null; diff: SemanticOperationView[] | null; error: ReaderDiagnostic | null; }
export interface DesktopSemanticApplyResponse { request_id: string; project_session_id: string | null; project: ProjectInspection | null; draft: DraftSummary | null; patch_id: string | null; error: ReaderDiagnostic | null; }

export interface SemanticPlanExpectation {
  requestId: string;
  projectSessionId: string;
  revisionId: string;
  sourceSha256: string;
  operationCount: number;
}

export interface SemanticApplyExpectation {
  requestId: string;
  projectSessionId: string;
  patchId: string;
}

export type SemanticStatus = "idle" | "loading" | "editing" | "planning" | "review" | "applying" | "error";
export interface SemanticState { status: SemanticStatus; snapshot: SemanticSnapshot | null; selectedObjectId: string | null; selectedObjectIds: string[]; operations: SemanticOperationRequest[]; plan: DesktopSemanticPatchPlanResponse | null; issue: ReaderDiagnostic | null; undo: SemanticOperationRequest[][]; redo: SemanticOperationRequest[][]; }
export const INITIAL_SEMANTIC_STATE: SemanticState = { status: "idle", snapshot: null, selectedObjectId: null, selectedObjectIds: [], operations: [], plan: null, issue: null, undo: [], redo: [] };

const semanticContractIssue = (code: string, message: string): ReaderDiagnostic => ({
  code,
  message,
  source_line_number: null,
  context: {},
});

export function semanticPlanResponseIssue(
  response: DesktopSemanticPatchPlanResponse,
  expected: SemanticPlanExpectation,
): ReaderDiagnostic | null {
  if (response.error) return response.error;
  if (response.request_id !== expected.requestId
    || response.project_session_id !== expected.projectSessionId
    || response.revision_id !== expected.revisionId
    || response.source_sha256?.toLowerCase() !== expected.sourceSha256.toLowerCase()
    || !response.patch_id
    || !response.patch_sha256
    || !response.diff
    || response.diff.length !== expected.operationCount) {
    return semanticContractIssue("semantic_plan_invalid", "Semantic patch plan did not match the active project context");
  }
  return null;
}

export function semanticApplyResponseIssue(
  response: DesktopSemanticApplyResponse,
  expected: SemanticApplyExpectation,
): ReaderDiagnostic | null {
  if (response.error) return response.error;
  if (response.request_id !== expected.requestId
    || response.project_session_id !== expected.projectSessionId
    || response.patch_id !== expected.patchId
    || !response.project
    || !response.draft) {
    return semanticContractIssue("semantic_apply_invalid", "Semantic patch application did not match the active project context");
  }
  return null;
}

function sameOperations(left: SemanticOperationRequest[], right: SemanticOperationRequest[]) { return JSON.stringify(left) === JSON.stringify(right); }
export function semanticReducer(state: SemanticState, action: { type: string; [key: string]: unknown }): SemanticState {
  switch (action.type) {
    case "snapshot_loading": return { ...INITIAL_SEMANTIC_STATE, status: "loading" };
    case "snapshot_received": return { ...state, status: "idle", snapshot: action.snapshot as SemanticSnapshot, selectedObjectId: null, selectedObjectIds: [], operations: [], plan: null, issue: null, undo: [], redo: [] };
    case "object_selected": {
      const objectId = typeof action.objectId === "string" ? action.objectId : null;
      if (!objectId) return { ...state, selectedObjectId: null, selectedObjectIds: [] };
      if (action.append === true) {
        const selectedObjectIds = state.selectedObjectIds.includes(objectId)
          ? state.selectedObjectIds.filter((item) => item !== objectId)
          : [...state.selectedObjectIds, objectId];
        return { ...state, selectedObjectId: selectedObjectIds.at(-1) ?? null, selectedObjectIds };
      }
      return { ...state, selectedObjectId: objectId, selectedObjectIds: [objectId] };
    }
    case "edit": {
      const operations = action.operations as SemanticOperationRequest[];
      if (!Array.isArray(operations) || operations.some((item) => !item.object_id || !item.operation || !item.new_value)) return state;
      if (sameOperations(operations, state.operations)) return state;
      return { ...state, status: "editing", operations, plan: null, issue: null, undo: [...state.undo, state.operations], redo: [] };
    }
    case "plan_started": return { ...state, status: "planning", issue: null };
    case "plan_received": return { ...state, status: "review", plan: action.plan as DesktopSemanticPatchPlanResponse, issue: null };
    case "apply_started": return { ...state, status: "applying", issue: null };
    case "applied": return { ...INITIAL_SEMANTIC_STATE, status: "idle", snapshot: state.snapshot };
    case "discarded": return { ...state, status: "idle", operations: [], plan: null, issue: null, undo: [], redo: [] };
    case "undo": { const previous = state.undo.at(-1); if (!previous) return state; return { ...state, status: previous.length ? "editing" : "idle", operations: previous, plan: null, undo: state.undo.slice(0, -1), redo: [...state.redo, state.operations] }; }
    case "redo": { const next = state.redo.at(-1); if (!next) return state; return { ...state, status: "editing", operations: next, plan: null, undo: [...state.undo, state.operations], redo: state.redo.slice(0, -1) }; }
    case "context_changed": return INITIAL_SEMANTIC_STATE;
    case "failed": return { ...state, status: "error", issue: action.issue as ReaderDiagnostic };
    default: return state;
  }
}

export function semanticNodeId(node: SemanticNode): string | null { return node.object_id ?? node.zone_id ?? node.level_id ?? node.path_id ?? node.species_id ?? node.source_id ?? null; }
export function semanticNodes(snapshot: SemanticSnapshot): SemanticNode[] { return [snapshot.project, ...snapshot.levels, ...snapshot.zones, ...snapshot.flow_paths, ...snapshot.schedules, ...snapshot.species, ...snapshot.sources]; }
export function findSemanticNode(snapshot: SemanticSnapshot | null, objectId: string | null): SemanticNode | null { if (!snapshot || !objectId) return null; return semanticNodes(snapshot).find((node) => semanticNodeId(node) === objectId) ?? null; }
