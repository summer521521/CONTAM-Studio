import type { SemanticOperationRequest } from "../semantic-state";
import type {
  SketchpadProjectionMove,
  SketchpadProjectionPreview,
} from "./sketchpad-projection-preview";

export const MAX_SKETCHPAD_PROJECTION_PATCH_OPERATIONS = 128;

export interface SketchpadProjectionPatchPreparation {
  status: "ready" | "unavailable";
  operations: SemanticOperationRequest[];
  changed_icon_count: number;
  selected_semantic_zone_id: string | null;
  diagnostic: string | null;
}

const SHA256 = /^[a-f0-9]{64}$/i;

function safeAscii(value: string, maximum: number): boolean {
  return value.length > 0
    && value.length <= maximum
    && /^[\x20-\x7e]+$/.test(value)
    && !value.includes("\0");
}

function validCoordinate(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
}

function unavailable(diagnostic: string): SketchpadProjectionPatchPreparation {
  return {
    status: "unavailable",
    operations: [],
    changed_icon_count: 0,
    selected_semantic_zone_id: null,
    diagnostic,
  };
}

function stableMoves(moves: SketchpadProjectionMove[]): SketchpadProjectionMove[] {
  return [...moves].sort((left, right) => (
    left.level_number - right.level_number
    || left.icon_id.localeCompare(right.icon_id)
    || left.semantic_zone_id.localeCompare(right.semantic_zone_id)
  ));
}

/**
 * Converts a lossy, non-applicable comparison preview into reviewable semantic
 * operations. This function never calls the desktop bridge and deliberately
 * leaves the preview's `can_apply=false` boundary intact.
 */
export function prepareSketchpadProjectionPatch(
  preview: SketchpadProjectionPreview,
): SketchpadProjectionPatchPreparation {
  if (preview.schema_version !== "sketchpad_projection_preview.v1"
    || preview.method !== "zone_centroid_normalized_to_existing_icon_bounds"
    || preview.lossy !== true
    || preview.can_apply !== false) {
    return unavailable("sketchpad_projection_contract_invalid");
  }
  if (preview.status === "blocked") return unavailable("sketchpad_projection_candidate_collision");
  if (preview.status !== "preview") return unavailable("sketchpad_projection_unavailable");
  if (!safeAscii(preview.project_session_id, 128)
    || !safeAscii(preview.geometry_id, 160)
    || !safeAscii(preview.revision_id, 160)
    || !SHA256.test(preview.geometry_sha256)
    || !SHA256.test(preview.identity_sha256)
    || !SHA256.test(preview.source_sha256)) {
    return unavailable("sketchpad_projection_context_invalid");
  }
  if (!Array.isArray(preview.moves) || preview.moves.length > 4096) {
    return unavailable("sketchpad_projection_payload_invalid");
  }

  const iconIds = new Set<string>();
  const semanticZoneIds = new Set<string>();
  const targetCells = new Set<string>();
  const operations: SemanticOperationRequest[] = [];
  let changedIconCount = 0;
  let selectedSemanticZoneId: string | null = null;
  for (const move of stableMoves(preview.moves)) {
    if (!safeAscii(move.icon_id, 160)
      || !safeAscii(move.semantic_zone_id, 160)
      || !Number.isSafeInteger(move.level_number)
      || move.level_number < 0
      || move.level_number > 4096
      || !validCoordinate(move.from_column)
      || !validCoordinate(move.from_row)
      || !validCoordinate(move.to_column)
      || !validCoordinate(move.to_row)) {
      return unavailable("sketchpad_projection_move_invalid");
    }
    if (iconIds.has(move.icon_id) || semanticZoneIds.has(move.semantic_zone_id)) {
      return unavailable("sketchpad_projection_target_duplicate");
    }
    iconIds.add(move.icon_id);
    semanticZoneIds.add(move.semantic_zone_id);
    const targetCell = `${move.level_number}:${move.to_column}:${move.to_row}`;
    if (targetCells.has(targetCell)) return unavailable("sketchpad_projection_candidate_collision");
    targetCells.add(targetCell);

    const columnChanged = move.to_column !== move.from_column;
    const rowChanged = move.to_row !== move.from_row;
    if (move.changed !== (columnChanged || rowChanged)) {
      return unavailable("sketchpad_projection_change_flag_invalid");
    }
    if (!move.changed) continue;
    changedIconCount += 1;
    selectedSemanticZoneId ??= move.semantic_zone_id;
    if (columnChanged) {
      operations.push({
        operation: "set_spatial_icon_column",
        object_id: move.icon_id,
        new_value: String(move.to_column),
        unit: "grid_cell",
      });
    }
    if (rowChanged) {
      operations.push({
        operation: "set_spatial_icon_row",
        object_id: move.icon_id,
        new_value: String(move.to_row),
        unit: "grid_cell",
      });
    }
  }
  if (!operations.length) return unavailable("sketchpad_projection_no_change");
  if (operations.length > MAX_SKETCHPAD_PROJECTION_PATCH_OPERATIONS) {
    return unavailable("sketchpad_projection_operation_limit");
  }
  return {
    status: "ready",
    operations,
    changed_icon_count: changedIconCount,
    selected_semantic_zone_id: selectedSemanticZoneId,
    diagnostic: null,
  };
}
