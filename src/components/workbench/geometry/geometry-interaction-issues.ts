import type { OrthogonalVertexMovePlan } from "../../../app/geometry/geometry-direct-manipulation";

export function directMoveIssueKey(
  plan: Extract<OrthogonalVertexMovePlan, { status: "blocked" }>,
): string {
  return manipulationIssueKey(plan.diagnosticCode);
}

export function manipulationIssueKey(diagnosticCode: string): string {
  if (diagnosticCode === "geometry_direct_move_coordinate_invalid") return "geometry.editor.issue.coordinateInvalid";
  if (diagnosticCode === "geometry_direct_move_scope_too_large") return "geometry.editor.issue.moveScopeTooLarge";
  if (diagnosticCode === "geometry_direct_move_duplicate_vertex") return "geometry.editor.issue.moveCollision";
  if (diagnosticCode === "geometry_opening_edit_value_invalid") return "geometry.editor.issue.openingValueInvalid";
  if (diagnosticCode === "geometry_opening_edit_out_of_bounds") return "geometry.editor.issue.openingOutOfBounds";
  if (diagnosticCode === "geometry_opening_edit_overlap") return "geometry.editor.issue.openingOverlap";
  if (diagnosticCode.startsWith("geometry_opening_edit_")) return "geometry.editor.issue.openingUnavailable";
  return "geometry.editor.issue.moveUnavailable";
}

export function wallTranslationIssueKey(diagnosticCode: string): string {
  const shared = manipulationIssueKey(diagnosticCode);
  return shared === "geometry.editor.issue.moveUnavailable"
    ? "geometry.editor.issue.wallMoveUnavailable"
    : shared;
}

export function wallFlowPathIssueKey(diagnosticCode: string): string {
  if (diagnosticCode === "geometry_wall_flow_path_opening_already_bound") return "geometry.editor.issue.wallFlowAlreadyBound";
  if (diagnosticCode === "geometry_wall_flow_path_boundary_unresolved"
    || diagnosticCode === "geometry_wall_flow_path_adjacency_invalid") return "geometry.editor.issue.wallFlowBoundaryUnresolved";
  if (diagnosticCode === "geometry_wall_flow_path_semantic_mismatch") return "geometry.editor.issue.wallFlowSemanticMismatch";
  if (diagnosticCode === "geometry_wall_flow_path_read_only") return "geometry.editor.issue.wallFlowReadOnly";
  return "geometry.editor.issue.wallFlowBindingInvalid";
}

export function topologyIssueKey(diagnosticCode: string): string {
  if (diagnosticCode === "geometry_wall_draw_zero_length") return "geometry.editor.issue.zeroLength";
  if (diagnosticCode === "geometry_wall_draw_collinear_overlap") return "geometry.editor.issue.wallOverlap";
  if (diagnosticCode === "geometry_wall_draw_split_crosses_opening"
    || diagnosticCode === "geometry_wall_split_crosses_opening") return "geometry.editor.issue.splitCrossesOpening";
  if (diagnosticCode === "geometry_wall_split_endpoint") return "geometry.editor.issue.splitEndpoint";
  if (diagnosticCode === "geometry_wall_split_vertex_exists") return "geometry.editor.issue.splitVertexExists";
  if (diagnosticCode === "geometry_wall_draw_intersection_limit"
    || diagnosticCode === "geometry_wall_draw_operation_limit") return "geometry.editor.issue.intersectionLimit";
  if (diagnosticCode === "geometry_wall_draw_coordinate_invalid"
    || diagnosticCode === "geometry_wall_split_coordinate_invalid") return "geometry.editor.issue.coordinateInvalid";
  return "geometry.editor.issue.topologyUnavailable";
}

export function geometryCommandIssueKey(diagnosticCode: string): string {
  if (diagnosticCode === "geometry_command_wall_has_openings"
    || diagnosticCode === "geometry_command_wall_bounds_zone") return "geometry.editor.issue.trimRejected";
  if (diagnosticCode === "geometry_command_split_crosses_opening") return "geometry.editor.issue.splitCrossesOpening";
  if (diagnosticCode === "geometry_command_zone_flow_path_conflict") return "geometry.editor.issue.zoneFlowPathConflict";
  if (diagnosticCode === "geometry_command_zone_merge_boundary_has_opening") return "geometry.editor.issue.zoneMergeOpeningConflict";
  if (diagnosticCode === "geometry_command_level_copy_target_not_empty") return "geometry.editor.issue.levelCopyTargetNotEmpty";
  if (diagnosticCode.startsWith("geometry_command_level_copy_")) return "geometry.editor.issue.levelCopyRejected";
  if (diagnosticCode === "geometry_command_vertical_opening_has_flow_path") return "geometry.editor.issue.verticalOpeningHasFlowPath";
  if (diagnosticCode === "geometry_vertical_flow_path_zone_mismatch") return "geometry.editor.issue.verticalFlowZoneMismatch";
  if (diagnosticCode.startsWith("geometry_vertical_")) return "geometry.editor.issue.verticalUnavailable";
  if (diagnosticCode === "geometry_wall_intersection_requires_split") return "geometry.editor.issue.topologyUnavailable";
  return "geometry.editor.issue.rejected";
}

export function zoneTopologyIssueKey(diagnosticCode: string): string {
  if (diagnosticCode === "geometry_zone_target_missing") return "geometry.editor.issue.zoneTargetMissing";
  if (diagnosticCode === "geometry_zone_partition_source_missing") return "geometry.editor.issue.zonePartitionSourceMissing";
  if (diagnosticCode === "geometry_zone_semantic_already_bound") return "geometry.editor.issue.zoneSemanticBound";
  if (diagnosticCode === "geometry_zone_point_on_boundary") return "geometry.editor.issue.zonePointOnBoundary";
  if (diagnosticCode === "geometry_zone_face_not_found") return "geometry.editor.issue.zoneFaceNotFound";
  if (diagnosticCode === "geometry_zone_face_already_bound") return "geometry.editor.issue.zoneFaceBound";
  if (diagnosticCode === "geometry_zone_partition_target_bound") return "geometry.editor.issue.zonePartitionTargetBound";
  if (diagnosticCode === "geometry_zone_partition_point_outside") return "geometry.editor.issue.zonePartitionOutside";
  if (diagnosticCode === "geometry_zone_partition_not_divided") return "geometry.editor.issue.zonePartitionNotDivided";
  if (diagnosticCode === "geometry_zone_partition_not_binary") return "geometry.editor.issue.zonePartitionNotBinary";
  if (diagnosticCode === "geometry_zone_partition_flow_path_conflict") return "geometry.editor.issue.zoneFlowPathConflict";
  if (diagnosticCode === "geometry_zone_merge_same_region") return "geometry.editor.issue.zoneMergeSame";
  if (diagnosticCode === "geometry_zone_merge_not_adjacent") return "geometry.editor.issue.zoneMergeNotAdjacent";
  if (diagnosticCode === "geometry_zone_merge_boundary_has_opening") return "geometry.editor.issue.zoneMergeOpeningConflict";
  if (diagnosticCode === "geometry_zone_merge_flow_path_conflict") return "geometry.editor.issue.zoneFlowPathConflict";
  return "geometry.editor.issue.zoneTopologyUnavailable";
}

export function levelConstructionIssueKey(diagnosticCode: string): string {
  if (diagnosticCode === "geometry_level_copy_target_not_empty") return "geometry.editor.issue.levelCopyTargetNotEmpty";
  if (diagnosticCode === "geometry_level_copy_source_empty") return "geometry.editor.issue.levelCopySourceEmpty";
  if (diagnosticCode === "geometry_level_copy_same_level") return "geometry.editor.issue.levelCopySameLevel";
  if (diagnosticCode === "geometry_level_copy_limit_exceeded") return "geometry.editor.issue.levelCopyLimit";
  return "geometry.editor.issue.levelCopyRejected";
}

export function verticalOpeningIssueKey(diagnosticCode: string): string {
  if (diagnosticCode === "geometry_vertical_opening_levels_not_adjacent") return "geometry.editor.issue.verticalLevelsNotAdjacent";
  if (diagnosticCode === "geometry_vertical_opening_zone_coverage_invalid") return "geometry.editor.issue.verticalZoneCoverage";
  if (diagnosticCode === "geometry_vertical_opening_overlap") return "geometry.editor.issue.verticalOverlap";
  if (diagnosticCode === "geometry_vertical_flow_path_zone_mismatch") return "geometry.editor.issue.verticalFlowZoneMismatch";
  if (diagnosticCode === "geometry_vertical_flow_path_already_bound") return "geometry.editor.issue.verticalFlowAlreadyBound";
  if (diagnosticCode === "geometry_vertical_flow_path_binding_invalid") return "geometry.editor.issue.verticalFlowBindingInvalid";
  return "geometry.editor.issue.verticalUnavailable";
}
