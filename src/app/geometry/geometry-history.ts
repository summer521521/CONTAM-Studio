import { geometrySha256, type BuildingGeometry, type GeometryEditCommand } from "./geometry-model";
import { previewGeometryCommand, type GeometryCommandResult } from "./geometry-commands";

export interface GeometryHistoryEntry {
  command: GeometryEditCommand;
  before: BuildingGeometry;
  after: BuildingGeometry;
  before_hash: string;
  after_hash: string;
}

export interface GeometryHistoryState {
  geometry: BuildingGeometry;
  geometry_hash: string;
  entries: GeometryHistoryEntry[];
  cursor: number;
  committed_command_ids: string[];
}

export interface GeometryCommitApproval {
  command_id: string;
  baseline_geometry_hash: string;
  approved_by: "user";
}

export interface GeometryHistoryTransition {
  status: "committed" | "rejected" | "duplicate" | "approval_required" | "unavailable";
  state: GeometryHistoryState;
  result: GeometryCommandResult | null;
}

export function createGeometryHistory(geometry: BuildingGeometry): GeometryHistoryState {
  return {
    geometry,
    geometry_hash: geometrySha256(geometry),
    entries: [],
    cursor: 0,
    committed_command_ids: [],
  };
}

export function commitGeometryCommand(
  state: GeometryHistoryState,
  command: GeometryEditCommand,
  approval?: GeometryCommitApproval,
): GeometryHistoryTransition {
  if (state.committed_command_ids.includes(command.command_id)) {
    return { status: "duplicate", state, result: null };
  }
  if (command.actor !== "user" && (!approval
    || approval.approved_by !== "user"
    || approval.command_id !== command.command_id
    || approval.baseline_geometry_hash.toLowerCase() !== state.geometry_hash.toLowerCase())) {
    return { status: "approval_required", state, result: null };
  }
  const result = previewGeometryCommand(state.geometry, command);
  if (result.status === "rejected") return { status: "rejected", state, result };
  const entries = state.entries.slice(0, state.cursor);
  entries.push({
    command,
    before: result.before,
    after: result.after,
    before_hash: state.geometry_hash,
    after_hash: result.geometry_hash,
  });
  return {
    status: "committed",
    result,
    state: {
      geometry: result.after,
      geometry_hash: result.geometry_hash,
      entries,
      cursor: entries.length,
      committed_command_ids: [...state.committed_command_ids, command.command_id],
    },
  };
}

export function undoGeometryCommand(state: GeometryHistoryState): GeometryHistoryState {
  if (state.cursor === 0) return state;
  const entry = state.entries[state.cursor - 1];
  return { ...state, geometry: entry.before, geometry_hash: entry.before_hash, cursor: state.cursor - 1 };
}

export function redoGeometryCommand(state: GeometryHistoryState): GeometryHistoryState {
  if (state.cursor >= state.entries.length) return state;
  const entry = state.entries[state.cursor];
  return { ...state, geometry: entry.after, geometry_hash: entry.after_hash, cursor: state.cursor + 1 };
}

export function resetGeometryHistory(
  state: GeometryHistoryState,
  geometry: BuildingGeometry,
): GeometryHistoryState {
  if (state.geometry.project_session_id === geometry.project_session_id
    && state.geometry.revision_id === geometry.revision_id
    && state.geometry.geometry_id === geometry.geometry_id
    && state.geometry.identity_sha256 === geometry.identity_sha256
    && state.geometry.source_sha256 === geometry.source_sha256) return state;
  return createGeometryHistory(geometry);
}
