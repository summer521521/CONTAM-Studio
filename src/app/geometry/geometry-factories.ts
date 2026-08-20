import type { ProjectInspection } from "../project-state";
import { semanticNodeId, type SemanticSnapshot } from "../semantic-state";
import {
  BUILDING_GEOMETRY_SCHEMA_VERSION,
  type BuildingGeometry,
  type GeometryLevel,
} from "./geometry-model";
import { matchingWallFlowPathOptions } from "./geometry-wall-airflow";

export interface GeometryDraftContext {
  projectSessionId: string;
  revisionId: string;
  project: ProjectInspection;
  snapshot: SemanticSnapshot;
}

function identityHash(context: GeometryDraftContext): string {
  return context.snapshot.identity_sha256 ?? context.project.source_sha256;
}

function levelName(snapshot: SemanticSnapshot, index: number): string {
  const node = snapshot.levels[index];
  return node?.name ?? node?.label ?? `Level ${index + 1}`;
}

function emptyLevel(index: number, snapshot: SemanticSnapshot): GeometryLevel {
  const semantic = snapshot.levels[index];
  const levelNumber = typeof semantic?.level_number === "number" ? semantic.level_number : index + 1;
  return {
    id: `studio-level-${index + 1}`,
    level_number: levelNumber,
    name: levelName(snapshot, index),
    elevation: index * 3_200,
    height: 3_200,
    vertices: [],
    walls: [],
    openings: [],
    zone_regions: [],
    flow_path_anchors: [],
    underlays: [],
  };
}

function geometryShell(context: GeometryDraftContext): BuildingGeometry {
  const levelCount = Math.max(1, Math.min(16, context.snapshot.levels.length));
  return {
    schema_version: BUILDING_GEOMETRY_SCHEMA_VERSION,
    status: "available",
    geometry_id: `studio-geometry-${context.revisionId.slice(0, 24)}`,
    project_session_id: context.projectSessionId,
    identity_sha256: identityHash(context),
    source_sha256: context.project.source_sha256,
    revision_id: context.revisionId,
    geometry_revision: 0,
    coordinate_space: { kind: "studio_metric", unit: "mm", units_per_grid_cell: null, y_axis: "up" },
    provenance: { source_kind: "studio_metric_draft", application_owned: true, source_schema_version: null },
    capabilities: { geometry_editing: "studio_draft", prj_round_trip: "unsupported" },
    levels: Array.from({ length: levelCount }, (_, index) => emptyLevel(index, context.snapshot)),
    vertical_openings: [],
    vertical_flow_path_anchors: [],
    warnings: [],
    unavailable_reason: null,
  };
}

export function createBlankBuildingGeometry(context: GeometryDraftContext): BuildingGeometry {
  return geometryShell(context);
}

function semanticIds(snapshot: SemanticSnapshot): { zones: string[] } {
  return {
    zones: snapshot.zones.map(semanticNodeId).filter((id): id is string => Boolean(id)),
  };
}

/**
 * A deliberately explicit teaching layout. It is never inferred from the PRJ
 * SketchPad and must remain labelled as an application-owned example in UI.
 */
export function createTeachingBuildingGeometry(context: GeometryDraftContext): BuildingGeometry {
  const geometry = geometryShell(context);
  const ids = semanticIds(context.snapshot);
  const zoneIds = [0, 1, 2].map((index) => ids.zones[index] ?? `studio-teaching-zone-${index + 1}`);
  const level = geometry.levels[0];
  level.vertices = [
    { id: "demo-v-a", x: 0, y: 0 },
    { id: "demo-v-b", x: 7_000, y: 0 },
    { id: "demo-v-c", x: 12_000, y: 0 },
    { id: "demo-v-d", x: 12_000, y: 8_000 },
    { id: "demo-v-e", x: 7_000, y: 8_000 },
    { id: "demo-v-f", x: 0, y: 8_000 },
    { id: "demo-v-g", x: 0, y: 4_500 },
    { id: "demo-v-h", x: 7_000, y: 4_500 },
  ];
  level.walls = [
    { id: "demo-w-1", start_vertex_id: "demo-v-a", end_vertex_id: "demo-v-b", kind: "exterior", thickness: 240, source_icon_id: null },
    { id: "demo-w-2", start_vertex_id: "demo-v-b", end_vertex_id: "demo-v-c", kind: "exterior", thickness: 240, source_icon_id: null },
    { id: "demo-w-3", start_vertex_id: "demo-v-c", end_vertex_id: "demo-v-d", kind: "exterior", thickness: 240, source_icon_id: null },
    { id: "demo-w-4", start_vertex_id: "demo-v-d", end_vertex_id: "demo-v-e", kind: "exterior", thickness: 240, source_icon_id: null },
    { id: "demo-w-5", start_vertex_id: "demo-v-e", end_vertex_id: "demo-v-f", kind: "exterior", thickness: 240, source_icon_id: null },
    { id: "demo-w-6", start_vertex_id: "demo-v-f", end_vertex_id: "demo-v-g", kind: "exterior", thickness: 240, source_icon_id: null },
    { id: "demo-w-7", start_vertex_id: "demo-v-g", end_vertex_id: "demo-v-a", kind: "exterior", thickness: 240, source_icon_id: null },
    { id: "demo-w-8", start_vertex_id: "demo-v-b", end_vertex_id: "demo-v-h", kind: "interior", thickness: 120, source_icon_id: null },
    { id: "demo-w-9", start_vertex_id: "demo-v-h", end_vertex_id: "demo-v-e", kind: "interior", thickness: 120, source_icon_id: null },
    { id: "demo-w-10", start_vertex_id: "demo-v-g", end_vertex_id: "demo-v-h", kind: "interior", thickness: 120, source_icon_id: null },
  ];
  level.zone_regions = [
    { id: "demo-region-1", semantic_zone_id: zoneIds[0], outer_vertex_ids: ["demo-v-a", "demo-v-b", "demo-v-h", "demo-v-g"] },
    { id: "demo-region-2", semantic_zone_id: zoneIds[1], outer_vertex_ids: ["demo-v-g", "demo-v-h", "demo-v-e", "demo-v-f"] },
    { id: "demo-region-3", semantic_zone_id: zoneIds[2], outer_vertex_ids: ["demo-v-b", "demo-v-c", "demo-v-d", "demo-v-e", "demo-v-h"] },
  ];
  level.openings = [
    { id: "demo-door-1", wall_id: "demo-w-10", kind: "door", offset: 2_850, width: 900, swing: "right", adjacent_zone_ids: [zoneIds[0], zoneIds[1]] },
    { id: "demo-door-2", wall_id: "demo-w-8", kind: "door", offset: 1_650, width: 900, swing: "left", adjacent_zone_ids: [zoneIds[0], zoneIds[2]] },
    { id: "demo-window-1", wall_id: "demo-w-2", kind: "window", offset: 1_600, width: 1_800, swing: "none", adjacent_zone_ids: [zoneIds[2]] },
    { id: "demo-window-2", wall_id: "demo-w-5", kind: "window", offset: 1_800, width: 1_800, swing: "none", adjacent_zone_ids: [zoneIds[1]] },
  ];
  const teachingFlow = matchingWallFlowPathOptions(
    level,
    context.snapshot.zones,
    context.snapshot.flow_paths,
    "demo-door-1",
    new Set(),
  )[0];
  if (teachingFlow) {
    level.flow_path_anchors.push({
      id: "demo-flow-anchor-1",
      opening_id: "demo-door-1",
      semantic_flow_path_id: teachingFlow.id,
      from_zone_id: teachingFlow.fromZoneId,
      to_zone_id: teachingFlow.toZoneId,
      exterior_side: teachingFlow.exteriorSide,
    });
  }
  geometry.warnings = [{ code: "geometry_teaching_example_not_prj", severity: "warning", object_id: geometry.geometry_id }];
  return geometry;
}
