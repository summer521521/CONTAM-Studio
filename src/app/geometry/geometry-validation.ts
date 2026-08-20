import {
  BUILDING_GEOMETRY_SCHEMA_VERSION,
  GEOMETRY_VALIDATION_SCHEMA_VERSION,
  GEOMETRY_HASH_PATTERN,
  geometrySha256,
  type BuildingGeometry,
  type GeometryDiagnostic,
  type GeometryLevel,
  type GeometryValidationResult,
  type GeometryVerticalOpening,
  type GeometryVertex,
  type GeometryWall,
} from "./geometry-model";
import {
  adjacentLevelPair,
  MAX_VERTICAL_FLOW_PATH_ANCHORS,
  MAX_VERTICAL_OPENINGS,
  verticalOpeningsOverlap,
  zonesContainingVerticalOpening,
} from "./geometry-vertical-connections";
import { isValidPlanUnderlay } from "./geometry-plan-underlay";

export const MAX_GEOMETRY_LEVELS = 256;
export const MAX_GEOMETRY_VERTICES = 100_000;
export const MAX_GEOMETRY_WALLS = 100_000;
export const MAX_GEOMETRY_OPENINGS = 50_000;
export const MAX_GEOMETRY_ZONE_REGIONS = 25_000;
export const MAX_GEOMETRY_FLOW_PATH_ANCHORS = 100_000;
export const MAX_GEOMETRY_COORDINATE = 1_000_000_000;
export const MAX_GEOMETRY_INTERSECTION_COMPARISONS = 2_000_000;
export const MAX_GEOMETRY_PAYLOAD_BYTES = 16 * 1024 * 1024;

interface ValidationContext {
  expectedProjectSessionId?: string;
  expectedRevisionId?: string;
}

function diagnostic(code: string, objectId: string | null = null): GeometryDiagnostic {
  return { code, severity: "error", object_id: objectId };
}

function coordinateValid(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= MAX_GEOMETRY_COORDINATE;
}

function wallLength(wall: GeometryWall, vertices: ReadonlyMap<string, GeometryVertex>): number | null {
  const start = vertices.get(wall.start_vertex_id);
  const end = vertices.get(wall.end_vertex_id);
  if (!start || !end) return null;
  return Math.abs(start.x - end.x) + Math.abs(start.y - end.y);
}

function orientation(a: GeometryVertex, b: GeometryVertex, c: GeometryVertex): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function onSegment(a: GeometryVertex, b: GeometryVertex, point: GeometryVertex): boolean {
  return point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
    && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
}

function segmentsIntersect(a: GeometryVertex, b: GeometryVertex, c: GeometryVertex, d: GeometryVertex): boolean {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (first !== second && third !== fourth) return true;
  return (first === 0 && onSegment(a, b, c))
    || (second === 0 && onSegment(a, b, d))
    || (third === 0 && onSegment(c, d, a))
    || (fourth === 0 && onSegment(c, d, b));
}

function segmentsCrossProperly(a: GeometryVertex, b: GeometryVertex, c: GeometryVertex, d: GeometryVertex): boolean {
  return orientation(a, b, c) * orientation(a, b, d) < 0
    && orientation(c, d, a) * orientation(c, d, b) < 0;
}

function polygonArea(vertices: readonly GeometryVertex[]): number {
  let twiceArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

function pointInPolygon(point: GeometryVertex, polygon: readonly GeometryVertex[]): boolean {
  let winding = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const first = polygon[index];
    const second = polygon[(index + 1) % polygon.length];
    if (first.y <= point.y && point.y < second.y && orientation(first, second, point) > 0) winding += 1;
    else if (second.y <= point.y && point.y < first.y && orientation(first, second, point) < 0) winding -= 1;
  }
  return winding !== 0;
}

function validateLevel(
  level: GeometryLevel,
  globalIds: Set<string>,
  semanticZoneIds: Set<string>,
  semanticFlowPathIds: Set<string>,
  errors: GeometryDiagnostic[],
): number {
  const idCollections: Array<readonly { id: string }[]> = [
    level.vertices,
    level.walls,
    level.openings,
    level.zone_regions,
    level.flow_path_anchors,
    level.underlays,
  ];
  for (const item of [level, ...idCollections.flat()]) {
    if (!item.id || item.id.length > 128 || globalIds.has(item.id)) {
      errors.push(diagnostic("geometry_stable_id_invalid", item.id || null));
    }
    globalIds.add(item.id);
  }

  const vertices = new Map<string, GeometryVertex>();
  const coordinates = new Map<string, string>();
  for (const vertex of level.vertices) {
    if (!coordinateValid(vertex.x) || !coordinateValid(vertex.y)) {
      errors.push(diagnostic("geometry_coordinate_limit_exceeded", vertex.id));
    }
    const coordinateKey = `${vertex.x}:${vertex.y}`;
    if (coordinates.has(coordinateKey)) errors.push(diagnostic("geometry_duplicate_vertex_coordinate", vertex.id));
    coordinates.set(coordinateKey, vertex.id);
    vertices.set(vertex.id, vertex);
  }

  const walls = new Map(level.walls.map((wall) => [wall.id, wall]));
  const wallPairs = new Set<string>();
  const eligibleWalls: GeometryWall[] = [];
  for (const wall of level.walls) {
    const start = vertices.get(wall.start_vertex_id);
    const end = vertices.get(wall.end_vertex_id);
    if (!start || !end) {
      errors.push(diagnostic("geometry_wall_vertex_missing", wall.id));
      continue;
    }
    if (start.id === end.id || (start.x !== end.x && start.y !== end.y)) {
      errors.push(diagnostic("geometry_wall_not_orthogonal", wall.id));
      continue;
    }
    const pair = [start.id, end.id].sort().join(":");
    if (wallPairs.has(pair)) errors.push(diagnostic("geometry_duplicate_wall", wall.id));
    wallPairs.add(pair);
    eligibleWalls.push(wall);
  }

  let comparisons = 0;
  for (let left = 0; left < eligibleWalls.length; left += 1) {
    const first = eligibleWalls[left];
    const firstStart = vertices.get(first.start_vertex_id)!;
    const firstEnd = vertices.get(first.end_vertex_id)!;
    for (let right = left + 1; right < eligibleWalls.length; right += 1) {
      comparisons += 1;
      if (comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS) {
        errors.push(diagnostic("geometry_topology_complexity_limit_exceeded", level.id));
        break;
      }
      const second = eligibleWalls[right];
      if ([first.start_vertex_id, first.end_vertex_id].some((id) => id === second.start_vertex_id || id === second.end_vertex_id)) continue;
      const secondStart = vertices.get(second.start_vertex_id)!;
      const secondEnd = vertices.get(second.end_vertex_id)!;
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        errors.push(diagnostic("geometry_wall_intersection_requires_split", second.id));
      }
    }
    if (comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS) break;
  }

  const zoneIds = new Set(level.zone_regions.map((zone) => zone.semantic_zone_id));
  for (const opening of level.openings) {
    const wall = walls.get(opening.wall_id);
    const length = wall ? wallLength(wall, vertices) : null;
    if (!wall || length === null) errors.push(diagnostic("geometry_opening_wall_missing", opening.id));
    else if (!Number.isSafeInteger(opening.offset) || !Number.isSafeInteger(opening.width)
      || opening.offset < 0 || opening.width < 1 || opening.offset + opening.width > length) {
      errors.push(diagnostic("geometry_opening_out_of_bounds", opening.id));
    }
    if (opening.adjacent_zone_ids.some((id) => !zoneIds.has(id))) {
      errors.push(diagnostic("geometry_opening_zone_missing", opening.id));
    }
    if (new Set(opening.adjacent_zone_ids).size !== opening.adjacent_zone_ids.length
      || opening.adjacent_zone_ids.length > 2) {
      errors.push(diagnostic("geometry_opening_adjacent_zone_invalid", opening.id));
    }
  }

  const openingsByWall = new Map<string, typeof level.openings>();
  for (const opening of level.openings) {
    const current = openingsByWall.get(opening.wall_id) ?? [];
    current.push(opening);
    openingsByWall.set(opening.wall_id, current);
  }
  for (const openings of openingsByWall.values()) {
    openings.sort((left, right) => left.offset - right.offset || left.id.localeCompare(right.id));
    for (let index = 1; index < openings.length; index += 1) {
      const previous = openings[index - 1];
      if (previous.offset + previous.width > openings[index].offset) {
        errors.push(diagnostic("geometry_opening_overlap", openings[index].id));
      }
    }
  }

  const polygons: Array<{ regionId: string; vertices: GeometryVertex[] }> = [];
  for (const region of level.zone_regions) {
    if (semanticZoneIds.has(region.semantic_zone_id)) errors.push(diagnostic("geometry_zone_binding_duplicate", region.id));
    semanticZoneIds.add(region.semantic_zone_id);
    const polygon = region.outer_vertex_ids.map((id) => vertices.get(id)).filter((item): item is GeometryVertex => Boolean(item));
    if (polygon.length !== region.outer_vertex_ids.length || polygon.length < 3) {
      errors.push(diagnostic("geometry_zone_vertex_missing", region.id));
      continue;
    }
    if (new Set(region.outer_vertex_ids).size !== region.outer_vertex_ids.length) {
      errors.push(diagnostic("geometry_zone_loop_invalid", region.id));
      continue;
    }
    if (polygonArea(polygon) <= 0) errors.push(diagnostic("geometry_zone_orientation_invalid", region.id));
    let selfIntersects = false;
    for (let first = 0; first < polygon.length; first += 1) {
      const firstNext = (first + 1) % polygon.length;
      for (let second = first + 1; second < polygon.length; second += 1) {
        const secondNext = (second + 1) % polygon.length;
        if (first === second || firstNext === second || secondNext === first) continue;
        if (segmentsIntersect(polygon[first], polygon[firstNext], polygon[second], polygon[secondNext])) {
          errors.push(diagnostic("geometry_zone_self_intersection", region.id));
          selfIntersects = true;
          break;
        }
      }
      if (selfIntersects) break;
    }
    if (!selfIntersects) polygons.push({ regionId: region.id, vertices: polygon });
  }

  for (let first = 0; first < polygons.length; first += 1) {
    const firstPolygon = polygons[first].vertices;
    for (let second = first + 1; second < polygons.length; second += 1) {
      const secondPolygon = polygons[second].vertices;
      let overlaps = pointInPolygon(firstPolygon[0], secondPolygon) || pointInPolygon(secondPolygon[0], firstPolygon);
      for (let firstEdge = 0; firstEdge < firstPolygon.length && !overlaps; firstEdge += 1) {
        for (let secondEdge = 0; secondEdge < secondPolygon.length; secondEdge += 1) {
          comparisons += 1;
          if (comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS) break;
          if (segmentsCrossProperly(
            firstPolygon[firstEdge],
            firstPolygon[(firstEdge + 1) % firstPolygon.length],
            secondPolygon[secondEdge],
            secondPolygon[(secondEdge + 1) % secondPolygon.length],
          )) {
            overlaps = true;
            break;
          }
        }
      }
      if (comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS) {
        errors.push(diagnostic("geometry_topology_complexity_limit_exceeded", level.id));
        break;
      }
      if (overlaps) errors.push(diagnostic("geometry_zone_overlap", polygons[second].regionId));
    }
  }

  const openings = new Map(level.openings.map((opening) => [opening.id, opening]));
  const anchoredOpeningIds = new Set<string>();
  for (const anchor of level.flow_path_anchors) {
    if (semanticFlowPathIds.has(anchor.semantic_flow_path_id)) errors.push(diagnostic("geometry_flow_path_binding_duplicate", anchor.id));
    semanticFlowPathIds.add(anchor.semantic_flow_path_id);
    if (anchoredOpeningIds.has(anchor.opening_id)) errors.push(diagnostic("geometry_flow_path_opening_duplicate", anchor.id));
    anchoredOpeningIds.add(anchor.opening_id);
    const opening = openings.get(anchor.opening_id);
    if (!opening) {
      errors.push(diagnostic("geometry_flow_path_opening_missing", anchor.id));
      continue;
    }
    const wall = walls.get(opening.wall_id);
    const adjacentZones = new Set(opening.adjacent_zone_ids);
    const endpointZones = new Set([anchor.from_zone_id, anchor.to_zone_id].filter((item): item is string => item !== null));
    const zonesMatch = endpointZones.size === adjacentZones.size
      && [...endpointZones].every((id) => adjacentZones.has(id));
    if (!zonesMatch) errors.push(diagnostic("geometry_flow_path_zone_mismatch", anchor.id));
    const interiorValid = adjacentZones.size === 2 && wall?.kind === "interior"
      && anchor.exterior_side === "none"
      && anchor.from_zone_id !== null && anchor.to_zone_id !== null
      && anchor.from_zone_id !== anchor.to_zone_id;
    const exteriorValid = adjacentZones.size === 1 && wall?.kind === "exterior"
      && ((anchor.exterior_side === "from" && anchor.from_zone_id === null && anchor.to_zone_id !== null)
        || (anchor.exterior_side === "to" && anchor.from_zone_id !== null && anchor.to_zone_id === null));
    if (!interiorValid && !exteriorValid) {
      errors.push(diagnostic("geometry_flow_path_boundary_invalid", anchor.id));
    }
  }
  if (level.underlays.length > 1) errors.push(diagnostic("geometry_underlay_count_invalid", level.id));
  for (const underlay of level.underlays) {
    const underlayId = underlay.id;
    if (!isValidPlanUnderlay(underlay)) errors.push(diagnostic("geometry_underlay_invalid", underlayId));
  }
  return comparisons;
}

export function validateBuildingGeometry(
  geometry: BuildingGeometry,
  context: ValidationContext = {},
): GeometryValidationResult {
  const errors: GeometryDiagnostic[] = [];
  if (new TextEncoder().encode(JSON.stringify(geometry)).byteLength > MAX_GEOMETRY_PAYLOAD_BYTES) {
    errors.push(diagnostic("geometry_payload_limit_exceeded", geometry.geometry_id));
  }
  if (geometry.schema_version !== BUILDING_GEOMETRY_SCHEMA_VERSION) errors.push(diagnostic("geometry_schema_unsupported"));
  if (!new Set(["available", "unavailable"]).has(geometry.status)) errors.push(diagnostic("geometry_status_invalid", geometry.geometry_id));
  if (!GEOMETRY_HASH_PATTERN.test(geometry.identity_sha256) || !GEOMETRY_HASH_PATTERN.test(geometry.source_sha256)) {
    errors.push(diagnostic("geometry_hash_invalid"));
  }
  if (context.expectedProjectSessionId && geometry.project_session_id !== context.expectedProjectSessionId) {
    errors.push(diagnostic("geometry_project_session_stale"));
  }
  if (context.expectedRevisionId && geometry.revision_id !== context.expectedRevisionId) {
    errors.push(diagnostic("geometry_revision_stale"));
  }
  if (!Number.isSafeInteger(geometry.geometry_revision) || geometry.geometry_revision < 0) {
    errors.push(diagnostic("geometry_revision_invalid"));
  }
  if (geometry.coordinate_space.y_axis !== "up") errors.push(diagnostic("geometry_y_axis_unsupported"));
  const projection = geometry.provenance.source_kind === "contam_sketchpad_projection";
  const studioDraft = geometry.provenance.source_kind === "studio_metric_draft";
  if (projection && (geometry.provenance.application_owned
    || geometry.coordinate_space.kind !== "contam_sketchpad_grid"
    || geometry.coordinate_space.unit !== "half_grid"
    || geometry.coordinate_space.units_per_grid_cell !== 2
    || geometry.provenance.source_schema_version !== "spatial_projection.v1"
    || geometry.capabilities.geometry_editing !== "read_only"
    || geometry.capabilities.prj_round_trip !== "read_only_projection")) {
    errors.push(diagnostic("geometry_projection_capability_invalid"));
  }
  if (!projection && (!studioDraft || !geometry.provenance.application_owned
    || geometry.coordinate_space.kind !== "studio_metric"
    || geometry.coordinate_space.unit !== "mm"
    || geometry.coordinate_space.units_per_grid_cell !== null
    || geometry.capabilities.geometry_editing !== "studio_draft"
    || !["unsupported", "verified_subset"].includes(geometry.capabilities.prj_round_trip))) {
    errors.push(diagnostic("geometry_draft_capability_invalid"));
  }
  if (geometry.status === "unavailable" && (
    geometry.levels.length > 0
    || geometry.vertical_openings.length > 0
    || geometry.vertical_flow_path_anchors.length > 0
  )) errors.push(diagnostic("geometry_unavailable_contains_levels"));
  if (geometry.status === "available" && geometry.unavailable_reason !== null) errors.push(diagnostic("geometry_available_has_reason"));

  const counts = geometry.levels.reduce((total, level) => ({
    vertices: total.vertices + level.vertices.length,
    walls: total.walls + level.walls.length,
    openings: total.openings + level.openings.length,
    zones: total.zones + level.zone_regions.length,
    anchors: total.anchors + level.flow_path_anchors.length,
  }), { vertices: 0, walls: 0, openings: 0, zones: 0, anchors: 0 });
  if (geometry.levels.length > MAX_GEOMETRY_LEVELS
    || counts.vertices > MAX_GEOMETRY_VERTICES
    || counts.walls > MAX_GEOMETRY_WALLS
    || counts.openings > MAX_GEOMETRY_OPENINGS
    || counts.zones > MAX_GEOMETRY_ZONE_REGIONS
    || counts.anchors > MAX_GEOMETRY_FLOW_PATH_ANCHORS
    || geometry.vertical_openings.length > MAX_VERTICAL_OPENINGS
    || geometry.vertical_flow_path_anchors.length > MAX_VERTICAL_FLOW_PATH_ANCHORS) {
    errors.push(diagnostic("geometry_count_limit_exceeded"));
  }

  const globalIds = new Set<string>();
  const levelNumbers = new Set<number>();
  const semanticZoneIds = new Set<string>();
  const semanticFlowPathIds = new Set<string>();
  let comparisons = 0;
  for (const level of geometry.levels) {
    if (!Number.isSafeInteger(level.level_number) || level.level_number < 1 || levelNumbers.has(level.level_number)) {
      errors.push(diagnostic("geometry_level_number_invalid", level.id));
    }
    levelNumbers.add(level.level_number);
    if (!level.name || level.name.length > 512 || (level.height !== null && (!Number.isSafeInteger(level.height) || level.height < 1))) {
      errors.push(diagnostic("geometry_level_metadata_invalid", level.id));
    }
    comparisons += validateLevel(level, globalIds, semanticZoneIds, semanticFlowPathIds, errors);
    if (comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS) break;
  }

  const verticalOpenings = new Map<string, GeometryVerticalOpening>();
  const openingPairs = new Map<string, GeometryVerticalOpening[]>();
  for (const opening of geometry.vertical_openings) {
    if (!opening.id || opening.id.length > 128 || globalIds.has(opening.id)) {
      errors.push(diagnostic("geometry_stable_id_invalid", opening.id || null));
    }
    globalIds.add(opening.id);
    const coordinatesValid = coordinateValid(opening.x) && coordinateValid(opening.y)
      && Number.isSafeInteger(opening.width) && opening.width > 0
      && Number.isSafeInteger(opening.depth) && opening.depth > 0
      && coordinateValid(opening.x + opening.width) && coordinateValid(opening.y + opening.depth);
    if (!coordinatesValid || !["floor_opening", "stair", "shaft"].includes(opening.kind)) {
      errors.push(diagnostic("geometry_vertical_opening_invalid", opening.id));
    }
    const pair = adjacentLevelPair(geometry, opening.lower_level_id, opening.upper_level_id);
    if (!pair || pair.lower.id !== opening.lower_level_id || pair.upper.id !== opening.upper_level_id) {
      errors.push(diagnostic("geometry_vertical_opening_levels_not_adjacent", opening.id));
      continue;
    }
    const lowerZones = coordinatesValid ? zonesContainingVerticalOpening(pair.lower, opening) : [];
    const upperZones = coordinatesValid ? zonesContainingVerticalOpening(pair.upper, opening) : [];
    if (lowerZones.length !== 1 || upperZones.length !== 1) {
      errors.push(diagnostic("geometry_vertical_opening_zone_coverage_invalid", opening.id));
    }
    const pairKey = `${opening.lower_level_id}:${opening.upper_level_id}`;
    const existing = openingPairs.get(pairKey) ?? [];
    for (const other of existing) {
      comparisons += 1;
      if (comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS) {
        errors.push(diagnostic("geometry_topology_complexity_limit_exceeded", opening.id));
        break;
      }
      if (verticalOpeningsOverlap(other, opening)) {
        errors.push(diagnostic("geometry_vertical_opening_overlap", opening.id));
      }
    }
    existing.push(opening);
    openingPairs.set(pairKey, existing);
    verticalOpenings.set(opening.id, opening);
  }

  const anchoredVerticalOpenings = new Set<string>();
  for (const anchor of geometry.vertical_flow_path_anchors) {
    if (!anchor.id || anchor.id.length > 128 || globalIds.has(anchor.id)) {
      errors.push(diagnostic("geometry_stable_id_invalid", anchor.id || null));
    }
    globalIds.add(anchor.id);
    const opening = verticalOpenings.get(anchor.vertical_opening_id);
    if (!opening) {
      errors.push(diagnostic("geometry_vertical_flow_path_opening_missing", anchor.id));
      continue;
    }
    if (anchoredVerticalOpenings.has(opening.id)) {
      errors.push(diagnostic("geometry_vertical_flow_path_opening_duplicate", anchor.id));
    }
    anchoredVerticalOpenings.add(opening.id);
    if (semanticFlowPathIds.has(anchor.semantic_flow_path_id)) {
      errors.push(diagnostic("geometry_flow_path_binding_duplicate", anchor.id));
    }
    semanticFlowPathIds.add(anchor.semantic_flow_path_id);
    const pair = adjacentLevelPair(geometry, opening.lower_level_id, opening.upper_level_id);
    const lowerZones = pair ? zonesContainingVerticalOpening(pair.lower, opening) : [];
    const upperZones = pair ? zonesContainingVerticalOpening(pair.upper, opening) : [];
    if (!pair || lowerZones.length !== 1 || upperZones.length !== 1
      || lowerZones[0] !== anchor.lower_zone_id || upperZones[0] !== anchor.upper_zone_id) {
      errors.push(diagnostic("geometry_vertical_flow_path_zone_mismatch", anchor.id));
    }
  }
  errors.sort((left, right) => left.code.localeCompare(right.code) || (left.object_id ?? "").localeCompare(right.object_id ?? ""));
  const uniqueErrors = errors.filter((item, index) => index === 0
    || item.code !== errors[index - 1].code
    || item.object_id !== errors[index - 1].object_id);
  return {
    schema_version: GEOMETRY_VALIDATION_SCHEMA_VERSION,
    geometry_id: geometry.geometry_id,
    revision_id: geometry.revision_id,
    geometry_hash: geometrySha256(geometry),
    status: geometry.status === "unavailable" ? "unavailable" : uniqueErrors.length === 0 ? "valid" : "invalid",
    diagnostics: [
      ...uniqueErrors,
      ...geometry.warnings,
    ].sort((left, right) => left.code.localeCompare(right.code) || (left.object_id ?? "").localeCompare(right.object_id ?? "")),
  };
}
