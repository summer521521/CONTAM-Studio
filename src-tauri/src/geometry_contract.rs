use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub const BUILDING_GEOMETRY_SCHEMA_VERSION: &str = "building_geometry.v1";
pub const MAX_GEOMETRY_LEVELS: usize = 256;
pub const MAX_GEOMETRY_VERTICES: usize = 100_000;
pub const MAX_GEOMETRY_WALLS: usize = 100_000;
pub const MAX_GEOMETRY_OPENINGS: usize = 50_000;
pub const MAX_GEOMETRY_ZONE_REGIONS: usize = 25_000;
pub const MAX_GEOMETRY_FLOW_PATH_ANCHORS: usize = 100_000;
pub const MAX_GEOMETRY_VERTICAL_OPENINGS: usize = 25_000;
pub const MAX_GEOMETRY_VERTICAL_FLOW_PATH_ANCHORS: usize = 25_000;
pub const MAX_GEOMETRY_COORDINATE: i64 = 1_000_000_000;
pub const MAX_GEOMETRY_PAYLOAD_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_GEOMETRY_INTERSECTION_COMPARISONS: usize = 2_000_000;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GeometryContractDiagnostic {
    pub code: &'static str,
    pub object_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct BuildingGeometryPayload {
    schema_version: String,
    status: String,
    geometry_id: String,
    project_session_id: String,
    identity_sha256: String,
    source_sha256: String,
    revision_id: String,
    geometry_revision: u64,
    coordinate_space: GeometryCoordinateSpace,
    provenance: GeometryProvenance,
    capabilities: GeometryCapabilities,
    levels: Vec<GeometryLevel>,
    vertical_openings: Vec<GeometryVerticalOpening>,
    vertical_flow_path_anchors: Vec<GeometryVerticalFlowPathAnchor>,
    warnings: Vec<GeometryWarning>,
    unavailable_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryCoordinateSpace {
    kind: String,
    unit: String,
    units_per_grid_cell: Option<u64>,
    y_axis: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryProvenance {
    source_kind: String,
    application_owned: bool,
    source_schema_version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryCapabilities {
    geometry_editing: String,
    prj_round_trip: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryWarning {
    code: String,
    severity: String,
    object_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryLevel {
    id: String,
    level_number: i64,
    name: String,
    elevation: Option<i64>,
    height: Option<i64>,
    vertices: Vec<GeometryVertex>,
    walls: Vec<GeometryWall>,
    openings: Vec<GeometryOpening>,
    zone_regions: Vec<GeometryZoneRegion>,
    flow_path_anchors: Vec<GeometryFlowPathAnchor>,
    underlays: Vec<GeometryPlanUnderlay>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryVertex {
    id: String,
    x: i64,
    y: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryWall {
    id: String,
    start_vertex_id: String,
    end_vertex_id: String,
    kind: String,
    thickness: Option<i64>,
    source_icon_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryOpening {
    id: String,
    wall_id: String,
    kind: String,
    offset: i64,
    width: i64,
    swing: String,
    adjacent_zone_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryZoneRegion {
    id: String,
    semantic_zone_id: String,
    outer_vertex_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryFlowPathAnchor {
    id: String,
    opening_id: String,
    semantic_flow_path_id: String,
    from_zone_id: Option<String>,
    to_zone_id: Option<String>,
    exterior_side: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryPlanUnderlay {
    id: String,
    resource_id: String,
    display_name: String,
    sha256: String,
    mime_type: String,
    page_number: Option<u64>,
    pixel_width: u64,
    pixel_height: u64,
    pixel_origin_x_milli: i64,
    pixel_origin_y_milli: i64,
    origin_x_mm: i64,
    origin_y_mm: i64,
    micrometres_per_pixel: u64,
    rotation_millidegrees: i64,
    opacity_percent: u64,
    visible: bool,
    locked: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryVerticalOpening {
    id: String,
    lower_level_id: String,
    upper_level_id: String,
    x: i64,
    y: i64,
    width: i64,
    depth: i64,
    kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryVerticalFlowPathAnchor {
    id: String,
    vertical_opening_id: String,
    semantic_flow_path_id: String,
    lower_zone_id: String,
    upper_zone_id: String,
}

#[derive(Clone, Debug, Deserialize)]
struct SemanticBindingSnapshot {
    result_type: String,
    zones: Vec<SemanticBindingZone>,
    flow_paths: Vec<SemanticBindingFlowPath>,
}

#[derive(Clone, Debug, Deserialize)]
struct SemanticBindingZone {
    object_id: Option<String>,
    zone_id: Option<String>,
    contam_number: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
struct SemanticBindingFlowPath {
    object_id: Option<String>,
    path_id: Option<String>,
    from_endpoint: Option<SemanticBindingEndpoint>,
    to_endpoint: Option<SemanticBindingEndpoint>,
}

#[derive(Clone, Debug, Deserialize)]
struct SemanticBindingEndpoint {
    category: String,
    contam_number: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum ResolvedSemanticEndpoint {
    Zone(String),
    Outdoor,
}

fn diagnostic(
    code: &'static str,
    object_id: impl Into<Option<String>>,
) -> GeometryContractDiagnostic {
    GeometryContractDiagnostic {
        code,
        object_id: object_id.into(),
    }
}

fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn orientation(first: &GeometryVertex, second: &GeometryVertex, third: &GeometryVertex) -> i8 {
    let first_dx = i128::from(second.x) - i128::from(first.x);
    let first_dy = i128::from(second.y) - i128::from(first.y);
    let second_dx = i128::from(third.x) - i128::from(first.x);
    let second_dy = i128::from(third.y) - i128::from(first.y);
    (first_dx * second_dy - first_dy * second_dx).cmp(&0) as i8
}

fn on_segment(first: &GeometryVertex, middle: &GeometryVertex, second: &GeometryVertex) -> bool {
    middle.x >= first.x.min(second.x)
        && middle.x <= first.x.max(second.x)
        && middle.y >= first.y.min(second.y)
        && middle.y <= first.y.max(second.y)
}

fn segments_intersect(
    first_start: &GeometryVertex,
    first_end: &GeometryVertex,
    second_start: &GeometryVertex,
    second_end: &GeometryVertex,
) -> bool {
    let orientations = [
        orientation(first_start, first_end, second_start),
        orientation(first_start, first_end, second_end),
        orientation(second_start, second_end, first_start),
        orientation(second_start, second_end, first_end),
    ];
    if orientations[0] != orientations[1] && orientations[2] != orientations[3] {
        return true;
    }
    (orientations[0] == 0 && on_segment(first_start, second_start, first_end))
        || (orientations[1] == 0 && on_segment(first_start, second_end, first_end))
        || (orientations[2] == 0 && on_segment(second_start, first_start, second_end))
        || (orientations[3] == 0 && on_segment(second_start, first_end, second_end))
}

fn segments_cross_properly(
    first_start: &GeometryVertex,
    first_end: &GeometryVertex,
    second_start: &GeometryVertex,
    second_end: &GeometryVertex,
) -> bool {
    orientation(first_start, first_end, second_start)
        * orientation(first_start, first_end, second_end)
        < 0
        && orientation(second_start, second_end, first_start)
            * orientation(second_start, second_end, first_end)
            < 0
}

fn signed_area(vertices: &[&GeometryVertex]) -> i128 {
    vertices
        .iter()
        .zip(vertices.iter().cycle().skip(1))
        .take(vertices.len())
        .map(|(current, next)| {
            i128::from(current.x) * i128::from(next.y) - i128::from(next.x) * i128::from(current.y)
        })
        .sum()
}

fn point_in_polygon(point: &GeometryVertex, polygon: &[&GeometryVertex]) -> bool {
    let mut winding = 0_i32;
    for (first, second) in polygon
        .iter()
        .zip(polygon.iter().cycle().skip(1))
        .take(polygon.len())
    {
        if first.y <= point.y && point.y < second.y && orientation(first, second, point) > 0 {
            winding += 1;
        } else if second.y <= point.y && point.y < first.y && orientation(first, second, point) < 0
        {
            winding -= 1;
        }
    }
    winding != 0
}

fn point_strictly_in_polygon(point: &GeometryVertex, polygon: &[&GeometryVertex]) -> bool {
    if polygon
        .iter()
        .zip(polygon.iter().cycle().skip(1))
        .take(polygon.len())
        .any(|(first, second)| {
            orientation(first, second, point) == 0 && on_segment(first, point, second)
        })
    {
        return false;
    }
    point_in_polygon(point, polygon)
}

fn vertical_opening_corners(opening: &GeometryVerticalOpening) -> [GeometryVertex; 4] {
    [
        GeometryVertex {
            id: "corner-1".into(),
            x: opening.x,
            y: opening.y,
        },
        GeometryVertex {
            id: "corner-2".into(),
            x: opening.x.saturating_add(opening.width),
            y: opening.y,
        },
        GeometryVertex {
            id: "corner-3".into(),
            x: opening.x.saturating_add(opening.width),
            y: opening.y.saturating_add(opening.depth),
        },
        GeometryVertex {
            id: "corner-4".into(),
            x: opening.x,
            y: opening.y.saturating_add(opening.depth),
        },
    ]
}

fn zones_containing_vertical_opening(
    level: &GeometryLevel,
    opening: &GeometryVerticalOpening,
) -> Vec<String> {
    let vertices: BTreeMap<_, _> = level
        .vertices
        .iter()
        .map(|vertex| (vertex.id.as_str(), vertex))
        .collect();
    let corners = vertical_opening_corners(opening);
    let mut matches = Vec::new();
    for region in &level.zone_regions {
        let polygon: Option<Vec<_>> = region
            .outer_vertex_ids
            .iter()
            .map(|id| vertices.get(id.as_str()).copied())
            .collect();
        if polygon.is_some_and(|polygon| {
            corners
                .iter()
                .all(|corner| point_strictly_in_polygon(corner, &polygon))
        }) {
            matches.push(region.semantic_zone_id.clone());
        }
    }
    matches.sort();
    matches
}

fn vertical_openings_overlap(
    first: &GeometryVerticalOpening,
    second: &GeometryVerticalOpening,
) -> bool {
    first.lower_level_id == second.lower_level_id
        && first.upper_level_id == second.upper_level_id
        && first.x < second.x.saturating_add(second.width)
        && second.x < first.x.saturating_add(first.width)
        && first.y < second.y.saturating_add(second.depth)
        && second.y < first.y.saturating_add(first.depth)
}

fn consume_geometry_comparisons(comparisons: &mut usize, amount: usize) -> bool {
    let Some(next) = comparisons.checked_add(amount) else {
        return false;
    };
    if next > MAX_GEOMETRY_INTERSECTION_COMPARISONS {
        return false;
    }
    *comparisons = next;
    true
}

fn mark_geometry_complexity_exhausted(
    diagnostics: &mut Vec<GeometryContractDiagnostic>,
    exhausted: &mut bool,
    object_id: &str,
) {
    if !*exhausted {
        diagnostics.push(diagnostic(
            "geometry_topology_complexity_limit_exceeded",
            Some(object_id.to_string()),
        ));
        *exhausted = true;
    }
}

fn push_unique_id(
    ids: &mut BTreeSet<String>,
    diagnostics: &mut Vec<GeometryContractDiagnostic>,
    value: &str,
) {
    if !valid_id(value) || !ids.insert(value.to_string()) {
        diagnostics.push(diagnostic(
            "geometry_stable_id_invalid",
            (!value.is_empty()).then(|| value.to_string()),
        ));
    }
}

pub fn validate_building_geometry_value(
    value: &Value,
    expected_project_session_id: Option<&str>,
    expected_revision_id: Option<&str>,
) -> Result<(), Vec<GeometryContractDiagnostic>> {
    let payload_bytes = serde_json::to_vec(value)
        .map_err(|_| vec![diagnostic("geometry_payload_serialization_invalid", None)])?;
    if payload_bytes.len() > MAX_GEOMETRY_PAYLOAD_BYTES {
        return Err(vec![diagnostic("geometry_payload_limit_exceeded", None)]);
    }
    let payload: BuildingGeometryPayload = serde_json::from_value(value.clone())
        .map_err(|_| vec![diagnostic("geometry_schema_invalid", None)])?;
    let mut diagnostics = Vec::new();
    if payload.schema_version != BUILDING_GEOMETRY_SCHEMA_VERSION {
        diagnostics.push(diagnostic(
            "geometry_schema_version_invalid",
            Some(payload.geometry_id.clone()),
        ));
    }
    if !valid_id(&payload.geometry_id)
        || !valid_id(&payload.project_session_id)
        || !valid_id(&payload.revision_id)
        || !valid_sha256(&payload.identity_sha256)
        || !valid_sha256(&payload.source_sha256)
    {
        diagnostics.push(diagnostic(
            "geometry_identity_invalid",
            Some(payload.geometry_id.clone()),
        ));
    }
    if expected_project_session_id.is_some_and(|expected| expected != payload.project_session_id) {
        diagnostics.push(diagnostic(
            "geometry_project_session_stale",
            Some(payload.geometry_id.clone()),
        ));
    }
    if expected_revision_id.is_some_and(|expected| expected != payload.revision_id) {
        diagnostics.push(diagnostic(
            "geometry_revision_stale",
            Some(payload.geometry_id.clone()),
        ));
    }
    if payload.geometry_revision > u64::from(u32::MAX) {
        diagnostics.push(diagnostic(
            "geometry_revision_number_invalid",
            Some(payload.geometry_id.clone()),
        ));
    }
    if payload.status == "unavailable" {
        if !payload.levels.is_empty()
            || !payload.vertical_openings.is_empty()
            || !payload.vertical_flow_path_anchors.is_empty()
            || payload
                .unavailable_reason
                .as_deref()
                .is_none_or(str::is_empty)
        {
            diagnostics.push(diagnostic(
                "geometry_unavailable_payload_invalid",
                Some(payload.geometry_id.clone()),
            ));
        }
        diagnostics.sort_by(|left, right| {
            (left.code, left.object_id.as_deref()).cmp(&(right.code, right.object_id.as_deref()))
        });
        return if diagnostics.is_empty() {
            Ok(())
        } else {
            Err(diagnostics)
        };
    }
    if payload.status != "available" || payload.unavailable_reason.is_some() {
        diagnostics.push(diagnostic(
            "geometry_status_invalid",
            Some(payload.geometry_id.clone()),
        ));
    }
    let coordinate_valid = match payload.coordinate_space.kind.as_str() {
        "contam_sketchpad_grid" => {
            payload.coordinate_space.unit == "half_grid"
                && payload.coordinate_space.units_per_grid_cell == Some(2)
                && payload.capabilities.geometry_editing == "read_only"
                && payload.capabilities.prj_round_trip == "read_only_projection"
                && payload.provenance.source_kind == "contam_sketchpad_projection"
                && !payload.provenance.application_owned
                && payload.provenance.source_schema_version.as_deref()
                    == Some("spatial_projection.v1")
        }
        "studio_metric" => {
            payload.coordinate_space.unit == "mm"
                && payload.coordinate_space.units_per_grid_cell.is_none()
                && payload.capabilities.geometry_editing == "studio_draft"
                && matches!(
                    payload.capabilities.prj_round_trip.as_str(),
                    "unsupported" | "verified_subset"
                )
                && payload.provenance.source_kind == "studio_metric_draft"
                && payload.provenance.application_owned
        }
        _ => false,
    };
    if !coordinate_valid || payload.coordinate_space.y_axis != "up" {
        diagnostics.push(diagnostic(
            "geometry_coordinate_capability_invalid",
            Some(payload.geometry_id.clone()),
        ));
    }
    if payload.levels.len() > MAX_GEOMETRY_LEVELS {
        diagnostics.push(diagnostic(
            "geometry_level_limit_exceeded",
            Some(payload.geometry_id.clone()),
        ));
    }
    for warning in &payload.warnings {
        if warning.code.is_empty()
            || warning.code.len() > 80
            || !matches!(warning.severity.as_str(), "warning" | "error")
            || warning.object_id.as_deref().is_some_and(|id| !valid_id(id))
        {
            diagnostics.push(diagnostic(
                "geometry_warning_invalid",
                warning.object_id.clone(),
            ));
        }
    }

    let mut all_ids = BTreeSet::new();
    let mut level_numbers = BTreeSet::new();
    let mut semantic_zone_ids = BTreeSet::new();
    let mut semantic_flow_ids = BTreeSet::new();
    let mut total_vertices = 0_usize;
    let mut total_walls = 0_usize;
    let mut total_openings = 0_usize;
    let mut total_zones = 0_usize;
    let mut total_anchors = 0_usize;
    let mut comparisons = 0_usize;
    let mut topology_complexity_exhausted = false;

    for level in &payload.levels {
        push_unique_id(&mut all_ids, &mut diagnostics, &level.id);
        if level.level_number <= 0 || !level_numbers.insert(level.level_number) {
            diagnostics.push(diagnostic(
                "geometry_level_number_invalid",
                Some(level.id.clone()),
            ));
        }
        if level.name.is_empty()
            || level.name.len() > 512
            || level.height.is_some_and(|height| height <= 0)
        {
            diagnostics.push(diagnostic(
                "geometry_level_metadata_invalid",
                Some(level.id.clone()),
            ));
        }
        if level
            .elevation
            .is_some_and(|value| value.unsigned_abs() > MAX_GEOMETRY_COORDINATE as u64)
        {
            diagnostics.push(diagnostic(
                "geometry_level_metadata_invalid",
                Some(level.id.clone()),
            ));
        }
        total_vertices = total_vertices.saturating_add(level.vertices.len());
        total_walls = total_walls.saturating_add(level.walls.len());
        total_openings = total_openings.saturating_add(level.openings.len());
        total_zones = total_zones.saturating_add(level.zone_regions.len());
        total_anchors = total_anchors.saturating_add(level.flow_path_anchors.len());

        let mut vertices = BTreeMap::new();
        let mut coordinates = BTreeSet::new();
        for vertex in &level.vertices {
            push_unique_id(&mut all_ids, &mut diagnostics, &vertex.id);
            if vertex.x.unsigned_abs() > MAX_GEOMETRY_COORDINATE as u64
                || vertex.y.unsigned_abs() > MAX_GEOMETRY_COORDINATE as u64
            {
                diagnostics.push(diagnostic(
                    "geometry_coordinate_limit_exceeded",
                    Some(vertex.id.clone()),
                ));
            }
            if !coordinates.insert((vertex.x, vertex.y)) {
                diagnostics.push(diagnostic(
                    "geometry_duplicate_vertex_coordinate",
                    Some(vertex.id.clone()),
                ));
            }
            vertices.insert(vertex.id.clone(), vertex);
        }

        let mut wall_edges = BTreeSet::new();
        let mut walls = BTreeMap::new();
        let mut wall_segments = Vec::new();
        for wall in &level.walls {
            push_unique_id(&mut all_ids, &mut diagnostics, &wall.id);
            if !matches!(wall.kind.as_str(), "exterior" | "interior" | "unknown")
                || wall.thickness.is_some_and(|value| value <= 0)
                || wall
                    .source_icon_id
                    .as_deref()
                    .is_some_and(|id| !valid_id(id))
            {
                diagnostics.push(diagnostic(
                    "geometry_wall_metadata_invalid",
                    Some(wall.id.clone()),
                ));
            }
            let Some(start) = vertices.get(&wall.start_vertex_id) else {
                diagnostics.push(diagnostic(
                    "geometry_wall_vertex_missing",
                    Some(wall.id.clone()),
                ));
                continue;
            };
            let Some(end) = vertices.get(&wall.end_vertex_id) else {
                diagnostics.push(diagnostic(
                    "geometry_wall_vertex_missing",
                    Some(wall.id.clone()),
                ));
                continue;
            };
            if start.id == end.id || (start.x == end.x && start.y == end.y) {
                diagnostics.push(diagnostic(
                    "geometry_wall_zero_length",
                    Some(wall.id.clone()),
                ));
                continue;
            }
            if start.x != end.x && start.y != end.y {
                diagnostics.push(diagnostic(
                    "geometry_wall_not_orthogonal",
                    Some(wall.id.clone()),
                ));
            }
            let edge = if start.id < end.id {
                (start.id.clone(), end.id.clone())
            } else {
                (end.id.clone(), start.id.clone())
            };
            if !wall_edges.insert(edge) {
                diagnostics.push(diagnostic("geometry_duplicate_wall", Some(wall.id.clone())));
            }
            walls.insert(wall.id.clone(), (wall, *start, *end));
            wall_segments.push((wall, *start, *end));
        }
        wall_segments.sort_by(|left, right| {
            (left.1.x.min(left.2.x), left.1.x.max(left.2.x), &left.0.id).cmp(&(
                right.1.x.min(right.2.x),
                right.1.x.max(right.2.x),
                &right.0.id,
            ))
        });
        if !topology_complexity_exhausted {
            let mut active: Vec<(&GeometryWall, &GeometryVertex, &GeometryVertex)> = Vec::new();
            'wall_intersections: for (wall, start, end) in &wall_segments {
                let min_x = start.x.min(end.x);
                active
                    .retain(|(_, other_start, other_end)| other_start.x.max(other_end.x) >= min_x);
                for (other, other_start, other_end) in &active {
                    if !consume_geometry_comparisons(&mut comparisons, 1) {
                        mark_geometry_complexity_exhausted(
                            &mut diagnostics,
                            &mut topology_complexity_exhausted,
                            &level.id,
                        );
                        break 'wall_intersections;
                    }
                    let shared = start.id == other_start.id
                        || start.id == other_end.id
                        || end.id == other_start.id
                        || end.id == other_end.id;
                    if !shared && segments_intersect(start, end, other_start, other_end) {
                        diagnostics.push(diagnostic(
                            "geometry_wall_intersection_requires_split",
                            Some(wall.id.clone()),
                        ));
                    }
                    let _ = other;
                }
                active.push((wall, start, end));
            }
        }

        let mut openings = BTreeMap::new();
        let mut openings_by_wall: BTreeMap<String, Vec<&GeometryOpening>> = BTreeMap::new();
        let level_zone_ids: BTreeSet<&str> = level
            .zone_regions
            .iter()
            .map(|region| region.semantic_zone_id.as_str())
            .collect();
        for opening in &level.openings {
            push_unique_id(&mut all_ids, &mut diagnostics, &opening.id);
            if !matches!(
                opening.kind.as_str(),
                "door" | "window" | "exterior_opening" | "other"
            ) || !matches!(opening.swing.as_str(), "none" | "left" | "right" | "double")
            {
                diagnostics.push(diagnostic(
                    "geometry_opening_metadata_invalid",
                    Some(opening.id.clone()),
                ));
            }
            let Some((_, start, end)) = walls.get(&opening.wall_id) else {
                diagnostics.push(diagnostic(
                    "geometry_opening_wall_missing",
                    Some(opening.id.clone()),
                ));
                continue;
            };
            let length = (start.x - end.x).unsigned_abs() + (start.y - end.y).unsigned_abs();
            if opening.offset < 0
                || opening.width <= 0
                || u64::try_from(opening.offset.saturating_add(opening.width)).unwrap_or(u64::MAX)
                    > length
            {
                diagnostics.push(diagnostic(
                    "geometry_opening_out_of_bounds",
                    Some(opening.id.clone()),
                ));
            }
            let unique_adjacent: BTreeSet<_> = opening.adjacent_zone_ids.iter().collect();
            if unique_adjacent.len() != opening.adjacent_zone_ids.len()
                || opening.adjacent_zone_ids.len() > 2
            {
                diagnostics.push(diagnostic(
                    "geometry_opening_adjacent_zone_invalid",
                    Some(opening.id.clone()),
                ));
            }
            if opening
                .adjacent_zone_ids
                .iter()
                .any(|zone_id| !level_zone_ids.contains(zone_id.as_str()))
            {
                diagnostics.push(diagnostic(
                    "geometry_opening_zone_missing",
                    Some(opening.id.clone()),
                ));
            }
            openings_by_wall
                .entry(opening.wall_id.clone())
                .or_default()
                .push(opening);
            openings.insert(opening.id.clone(), opening);
        }
        for wall_openings in openings_by_wall.values_mut() {
            wall_openings.sort_by_key(|opening| (opening.offset, opening.id.as_str()));
            for pair in wall_openings.windows(2) {
                if pair[0].offset.saturating_add(pair[0].width) > pair[1].offset {
                    diagnostics.push(diagnostic(
                        "geometry_opening_overlap",
                        Some(pair[1].id.clone()),
                    ));
                }
            }
        }

        let mut polygons = Vec::new();
        for region in &level.zone_regions {
            push_unique_id(&mut all_ids, &mut diagnostics, &region.id);
            if !valid_id(&region.semantic_zone_id)
                || !semantic_zone_ids.insert(region.semantic_zone_id.clone())
            {
                diagnostics.push(diagnostic(
                    "geometry_zone_binding_duplicate",
                    Some(region.id.clone()),
                ));
            }
            let unique_vertices: BTreeSet<_> = region.outer_vertex_ids.iter().collect();
            if region.outer_vertex_ids.len() < 3 || unique_vertices.len() < 3 {
                diagnostics.push(diagnostic(
                    "geometry_zone_loop_invalid",
                    Some(region.id.clone()),
                ));
                continue;
            }
            let polygon: Option<Vec<_>> = region
                .outer_vertex_ids
                .iter()
                .map(|id| vertices.get(id).copied())
                .collect();
            let Some(polygon) = polygon else {
                diagnostics.push(diagnostic(
                    "geometry_zone_vertex_missing",
                    Some(region.id.clone()),
                ));
                continue;
            };
            if signed_area(&polygon) <= 0 {
                diagnostics.push(diagnostic(
                    "geometry_zone_orientation_invalid",
                    Some(region.id.clone()),
                ));
            }
            if !topology_complexity_exhausted {
                'self_intersections: for first_index in 0..polygon.len() {
                    let first_start = polygon[first_index];
                    let first_end = polygon[(first_index + 1) % polygon.len()];
                    for second_index in (first_index + 1)..polygon.len() {
                        if second_index == first_index + 1
                            || (first_index == 0 && second_index == polygon.len() - 1)
                        {
                            continue;
                        }
                        if !consume_geometry_comparisons(&mut comparisons, 1) {
                            mark_geometry_complexity_exhausted(
                                &mut diagnostics,
                                &mut topology_complexity_exhausted,
                                &region.id,
                            );
                            break 'self_intersections;
                        }
                        let second_start = polygon[second_index];
                        let second_end = polygon[(second_index + 1) % polygon.len()];
                        if segments_intersect(first_start, first_end, second_start, second_end) {
                            diagnostics.push(diagnostic(
                                "geometry_zone_self_intersection",
                                Some(region.id.clone()),
                            ));
                            break;
                        }
                    }
                }
            }
            polygons.push((region, polygon));
        }

        if !topology_complexity_exhausted {
            'region_pairs: for first_index in 0..polygons.len() {
                let (_, first_polygon) = &polygons[first_index];
                for (second_region, second_polygon) in polygons.iter().skip(first_index + 1) {
                    let point_checks = first_polygon.len().saturating_add(second_polygon.len());
                    let edge_checks = first_polygon.len().saturating_mul(second_polygon.len());
                    if !consume_geometry_comparisons(
                        &mut comparisons,
                        point_checks.saturating_add(edge_checks),
                    ) {
                        mark_geometry_complexity_exhausted(
                            &mut diagnostics,
                            &mut topology_complexity_exhausted,
                            &level.id,
                        );
                        break 'region_pairs;
                    }
                    let mut overlaps = point_in_polygon(first_polygon[0], second_polygon)
                        || point_in_polygon(second_polygon[0], first_polygon);
                    'edges: for first_edge in 0..first_polygon.len() {
                        for second_edge in 0..second_polygon.len() {
                            if segments_cross_properly(
                                first_polygon[first_edge],
                                first_polygon[(first_edge + 1) % first_polygon.len()],
                                second_polygon[second_edge],
                                second_polygon[(second_edge + 1) % second_polygon.len()],
                            ) {
                                overlaps = true;
                                break 'edges;
                            }
                        }
                    }
                    if overlaps {
                        diagnostics.push(diagnostic(
                            "geometry_zone_overlap",
                            Some(second_region.id.clone()),
                        ));
                    }
                }
            }
        }

        let mut anchored_opening_ids = BTreeSet::new();
        for anchor in &level.flow_path_anchors {
            push_unique_id(&mut all_ids, &mut diagnostics, &anchor.id);
            if !valid_id(&anchor.semantic_flow_path_id)
                || !semantic_flow_ids.insert(anchor.semantic_flow_path_id.clone())
            {
                diagnostics.push(diagnostic(
                    "geometry_flow_path_binding_duplicate",
                    Some(anchor.id.clone()),
                ));
            }
            if !anchored_opening_ids.insert(anchor.opening_id.clone()) {
                diagnostics.push(diagnostic(
                    "geometry_flow_path_opening_duplicate",
                    Some(anchor.id.clone()),
                ));
            }
            let Some(opening) = openings.get(&anchor.opening_id) else {
                diagnostics.push(diagnostic(
                    "geometry_flow_path_opening_missing",
                    Some(anchor.id.clone()),
                ));
                continue;
            };
            let endpoint_zones: BTreeSet<_> = [&anchor.from_zone_id, &anchor.to_zone_id]
                .into_iter()
                .filter_map(Option::as_ref)
                .collect();
            let adjacent_zones: BTreeSet<_> = opening.adjacent_zone_ids.iter().collect();
            if endpoint_zones != adjacent_zones {
                diagnostics.push(diagnostic(
                    "geometry_flow_path_zone_mismatch",
                    Some(anchor.id.clone()),
                ));
            }
            let wall_kind = walls
                .get(&opening.wall_id)
                .map(|(wall, _, _)| wall.kind.as_str());
            let interior_valid = adjacent_zones.len() == 2
                && wall_kind == Some("interior")
                && anchor.exterior_side == "none"
                && anchor.from_zone_id.is_some()
                && anchor.to_zone_id.is_some()
                && anchor.from_zone_id != anchor.to_zone_id;
            let exterior_valid = adjacent_zones.len() == 1
                && wall_kind == Some("exterior")
                && match anchor.exterior_side.as_str() {
                    "from" => anchor.from_zone_id.is_none() && anchor.to_zone_id.is_some(),
                    "to" => anchor.from_zone_id.is_some() && anchor.to_zone_id.is_none(),
                    _ => false,
                };
            if !interior_valid && !exterior_valid {
                diagnostics.push(diagnostic(
                    "geometry_flow_path_boundary_invalid",
                    Some(anchor.id.clone()),
                ));
            }
        }
        if level.underlays.len() > 1 {
            diagnostics.push(diagnostic(
                "geometry_underlay_count_invalid",
                Some(level.id.clone()),
            ));
        }
        for underlay in &level.underlays {
            push_unique_id(&mut all_ids, &mut diagnostics, &underlay.id);
            let display_name_valid = !underlay.display_name.is_empty()
                && underlay.display_name.len() <= 160
                && !underlay.display_name.contains(['/', '\\'])
                && !underlay.display_name.chars().any(char::is_control);
            let page_valid = match underlay.mime_type.as_str() {
                "application/pdf" => underlay
                    .page_number
                    .is_some_and(|page| (1..=10_000).contains(&page)),
                "image/png" | "image/jpeg" => underlay.page_number.is_none(),
                _ => false,
            };
            let coordinates_valid = underlay.origin_x_mm.unsigned_abs()
                <= MAX_GEOMETRY_COORDINATE as u64
                && underlay.origin_y_mm.unsigned_abs() <= MAX_GEOMETRY_COORDINATE as u64;
            if Uuid::parse_str(&underlay.resource_id).is_err()
                || !display_name_valid
                || !valid_sha256(&underlay.sha256)
                || !page_valid
                || !(1..=20_000).contains(&underlay.pixel_width)
                || !(1..=20_000).contains(&underlay.pixel_height)
                || !(-20_000_000..=20_000_000).contains(&underlay.pixel_origin_x_milli)
                || !(-20_000_000..=20_000_000).contains(&underlay.pixel_origin_y_milli)
                || !coordinates_valid
                || !(1..=1_000_000_000).contains(&underlay.micrometres_per_pixel)
                || !(-359_999..=359_999).contains(&underlay.rotation_millidegrees)
                || !(5..=100).contains(&underlay.opacity_percent)
            {
                diagnostics.push(diagnostic(
                    "geometry_underlay_invalid",
                    Some(underlay.id.clone()),
                ));
            }
            let _display_flags = (underlay.visible, underlay.locked);
        }
    }

    let mut ordered_levels: Vec<&GeometryLevel> = payload.levels.iter().collect();
    ordered_levels.sort_by(|left, right| {
        (left.level_number, left.id.as_str()).cmp(&(right.level_number, right.id.as_str()))
    });
    let level_by_id: BTreeMap<&str, &GeometryLevel> = ordered_levels
        .iter()
        .map(|level| (level.id.as_str(), *level))
        .collect();
    let level_index: BTreeMap<&str, usize> = ordered_levels
        .iter()
        .enumerate()
        .map(|(index, level)| (level.id.as_str(), index))
        .collect();
    let mut vertical_openings: BTreeMap<&str, &GeometryVerticalOpening> = BTreeMap::new();
    let mut openings_by_pair: BTreeMap<(&str, &str), Vec<&GeometryVerticalOpening>> =
        BTreeMap::new();
    for opening in &payload.vertical_openings {
        push_unique_id(&mut all_ids, &mut diagnostics, &opening.id);
        let lower = level_by_id.get(opening.lower_level_id.as_str()).copied();
        let upper = level_by_id.get(opening.upper_level_id.as_str()).copied();
        let adjacent = lower.zip(upper).is_some_and(|(lower, upper)| {
            level_index[upper.id.as_str()] == level_index[lower.id.as_str()] + 1
        });
        if !adjacent {
            diagnostics.push(diagnostic(
                "geometry_vertical_opening_levels_not_adjacent",
                Some(opening.id.clone()),
            ));
            continue;
        }
        let maximum = i128::from(MAX_GEOMETRY_COORDINATE);
        let end_x = i128::from(opening.x) + i128::from(opening.width);
        let end_y = i128::from(opening.y) + i128::from(opening.depth);
        let dimensions_valid = opening.width > 0
            && opening.depth > 0
            && matches!(opening.kind.as_str(), "floor_opening" | "stair" | "shaft")
            && i128::from(opening.x).abs() <= maximum
            && i128::from(opening.y).abs() <= maximum
            && end_x.abs() <= maximum
            && end_y.abs() <= maximum;
        if !dimensions_valid {
            diagnostics.push(diagnostic(
                "geometry_vertical_opening_invalid",
                Some(opening.id.clone()),
            ));
        }
        let lower = lower.expect("adjacent lower Level exists");
        let upper = upper.expect("adjacent upper Level exists");
        if zones_containing_vertical_opening(lower, opening).len() != 1
            || zones_containing_vertical_opening(upper, opening).len() != 1
        {
            diagnostics.push(diagnostic(
                "geometry_vertical_opening_zone_coverage_invalid",
                Some(opening.id.clone()),
            ));
        }
        let pair = (
            opening.lower_level_id.as_str(),
            opening.upper_level_id.as_str(),
        );
        let existing = openings_by_pair.entry(pair).or_default();
        for other in existing.iter() {
            if !consume_geometry_comparisons(&mut comparisons, 1) {
                mark_geometry_complexity_exhausted(
                    &mut diagnostics,
                    &mut topology_complexity_exhausted,
                    &opening.id,
                );
                break;
            }
            if vertical_openings_overlap(other, opening) {
                diagnostics.push(diagnostic(
                    "geometry_vertical_opening_overlap",
                    Some(opening.id.clone()),
                ));
            }
        }
        existing.push(opening);
        vertical_openings.insert(opening.id.as_str(), opening);
    }

    let mut anchored_vertical_openings = BTreeSet::new();
    for anchor in &payload.vertical_flow_path_anchors {
        push_unique_id(&mut all_ids, &mut diagnostics, &anchor.id);
        let Some(opening) = vertical_openings
            .get(anchor.vertical_opening_id.as_str())
            .copied()
        else {
            diagnostics.push(diagnostic(
                "geometry_vertical_flow_path_opening_missing",
                Some(anchor.id.clone()),
            ));
            continue;
        };
        if !anchored_vertical_openings.insert(opening.id.as_str()) {
            diagnostics.push(diagnostic(
                "geometry_vertical_flow_path_opening_duplicate",
                Some(anchor.id.clone()),
            ));
        }
        if !valid_id(&anchor.semantic_flow_path_id)
            || !semantic_flow_ids.insert(anchor.semantic_flow_path_id.clone())
        {
            diagnostics.push(diagnostic(
                "geometry_flow_path_binding_duplicate",
                Some(anchor.id.clone()),
            ));
        }
        let lower = level_by_id[opening.lower_level_id.as_str()];
        let upper = level_by_id[opening.upper_level_id.as_str()];
        if zones_containing_vertical_opening(lower, opening) != [anchor.lower_zone_id.clone()]
            || zones_containing_vertical_opening(upper, opening) != [anchor.upper_zone_id.clone()]
        {
            diagnostics.push(diagnostic(
                "geometry_vertical_flow_path_zone_mismatch",
                Some(anchor.id.clone()),
            ));
        }
    }
    for (actual, maximum, code) in [
        (
            total_vertices,
            MAX_GEOMETRY_VERTICES,
            "geometry_vertex_limit_exceeded",
        ),
        (
            total_walls,
            MAX_GEOMETRY_WALLS,
            "geometry_wall_limit_exceeded",
        ),
        (
            total_openings,
            MAX_GEOMETRY_OPENINGS,
            "geometry_opening_limit_exceeded",
        ),
        (
            total_zones,
            MAX_GEOMETRY_ZONE_REGIONS,
            "geometry_zone_limit_exceeded",
        ),
        (
            total_anchors,
            MAX_GEOMETRY_FLOW_PATH_ANCHORS,
            "geometry_flow_path_limit_exceeded",
        ),
        (
            payload.vertical_openings.len(),
            MAX_GEOMETRY_VERTICAL_OPENINGS,
            "geometry_vertical_opening_limit_exceeded",
        ),
        (
            payload.vertical_flow_path_anchors.len(),
            MAX_GEOMETRY_VERTICAL_FLOW_PATH_ANCHORS,
            "geometry_vertical_flow_path_limit_exceeded",
        ),
    ] {
        if actual > maximum {
            diagnostics.push(diagnostic(code, Some(payload.geometry_id.clone())));
        }
    }
    diagnostics.sort_by(|left, right| {
        (left.code, left.object_id.as_deref()).cmp(&(right.code, right.object_id.as_deref()))
    });
    diagnostics.dedup();
    if diagnostics.is_empty() {
        Ok(())
    } else {
        Err(diagnostics)
    }
}

fn semantic_stable_id(object_id: &Option<String>, alternate_id: &Option<String>) -> Option<String> {
    object_id.clone().or_else(|| alternate_id.clone())
}

fn resolve_semantic_endpoint(
    endpoint: &Option<SemanticBindingEndpoint>,
    zone_ids_by_number: &BTreeMap<i64, Option<String>>,
) -> Option<ResolvedSemanticEndpoint> {
    let endpoint = endpoint.as_ref()?;
    match endpoint.category.as_str() {
        "zone" => endpoint
            .contam_number
            .and_then(|number| zone_ids_by_number.get(&number))
            .and_then(Clone::clone)
            .map(ResolvedSemanticEndpoint::Zone),
        "outdoor" if endpoint.contam_number.is_none() => Some(ResolvedSemanticEndpoint::Outdoor),
        _ => None,
    }
}

pub(crate) fn geometry_has_flow_path_bindings(value: &Value) -> bool {
    value
        .get("levels")
        .and_then(Value::as_array)
        .is_some_and(|levels| {
            levels.iter().any(|level| {
                level
                    .get("flow_path_anchors")
                    .and_then(Value::as_array)
                    .is_some_and(|anchors| !anchors.is_empty())
            })
        })
        || value
            .get("vertical_flow_path_anchors")
            .and_then(Value::as_array)
            .is_some_and(|anchors| !anchors.is_empty())
}

pub(crate) fn validate_geometry_semantic_flow_bindings(
    geometry: &Value,
    snapshot: &Value,
) -> Result<(), Vec<GeometryContractDiagnostic>> {
    validate_building_geometry_value(geometry, None, None)?;
    let payload: BuildingGeometryPayload = serde_json::from_value(geometry.clone())
        .map_err(|_| vec![diagnostic("geometry_schema_invalid", None)])?;
    let semantic: SemanticBindingSnapshot = serde_json::from_value(snapshot.clone())
        .map_err(|_| vec![diagnostic("geometry_semantic_snapshot_invalid", None)])?;
    if semantic.result_type != "semantic_project_snapshot" {
        return Err(vec![diagnostic("geometry_semantic_snapshot_invalid", None)]);
    }

    let mut zone_ids_by_number = BTreeMap::<i64, Option<String>>::new();
    for zone in semantic.zones {
        let Some(id) = semantic_stable_id(&zone.object_id, &zone.zone_id) else {
            continue;
        };
        let Some(number) = zone.contam_number else {
            continue;
        };
        zone_ids_by_number.insert(
            number,
            if zone_ids_by_number.contains_key(&number) {
                None
            } else {
                Some(id)
            },
        );
    }

    let mut flows = BTreeMap::<String, Option<SemanticBindingFlowPath>>::new();
    for flow in semantic.flow_paths {
        let Some(id) = semantic_stable_id(&flow.object_id, &flow.path_id) else {
            continue;
        };
        flows.insert(
            id.clone(),
            if flows.contains_key(&id) {
                None
            } else {
                Some(flow)
            },
        );
    }

    let mut diagnostics = Vec::new();
    for level in &payload.levels {
        for anchor in &level.flow_path_anchors {
            let Some(Some(flow)) = flows.get(&anchor.semantic_flow_path_id) else {
                diagnostics.push(diagnostic(
                    "geometry_flow_path_semantic_missing",
                    Some(anchor.id.clone()),
                ));
                continue;
            };
            let from = resolve_semantic_endpoint(&flow.from_endpoint, &zone_ids_by_number);
            let to = resolve_semantic_endpoint(&flow.to_endpoint, &zone_ids_by_number);
            let valid = match (&from, &to) {
                (
                    Some(ResolvedSemanticEndpoint::Zone(from)),
                    Some(ResolvedSemanticEndpoint::Zone(to)),
                ) => {
                    anchor.exterior_side == "none"
                        && anchor.from_zone_id.as_ref() == Some(from)
                        && anchor.to_zone_id.as_ref() == Some(to)
                }
                (
                    Some(ResolvedSemanticEndpoint::Outdoor),
                    Some(ResolvedSemanticEndpoint::Zone(to)),
                ) => {
                    anchor.exterior_side == "from"
                        && anchor.from_zone_id.is_none()
                        && anchor.to_zone_id.as_ref() == Some(to)
                }
                (
                    Some(ResolvedSemanticEndpoint::Zone(from)),
                    Some(ResolvedSemanticEndpoint::Outdoor),
                ) => {
                    anchor.exterior_side == "to"
                        && anchor.from_zone_id.as_ref() == Some(from)
                        && anchor.to_zone_id.is_none()
                }
                _ => false,
            };
            if !valid {
                diagnostics.push(diagnostic(
                    "geometry_flow_path_semantic_mismatch",
                    Some(anchor.id.clone()),
                ));
            }
        }
    }

    for anchor in &payload.vertical_flow_path_anchors {
        let Some(Some(flow)) = flows.get(&anchor.semantic_flow_path_id) else {
            diagnostics.push(diagnostic(
                "geometry_flow_path_semantic_missing",
                Some(anchor.id.clone()),
            ));
            continue;
        };
        let endpoints = [
            resolve_semantic_endpoint(&flow.from_endpoint, &zone_ids_by_number),
            resolve_semantic_endpoint(&flow.to_endpoint, &zone_ids_by_number),
        ];
        let endpoint_zones: BTreeSet<_> = endpoints
            .into_iter()
            .filter_map(|endpoint| match endpoint {
                Some(ResolvedSemanticEndpoint::Zone(id)) => Some(id),
                _ => None,
            })
            .collect();
        let expected = BTreeSet::from([anchor.lower_zone_id.clone(), anchor.upper_zone_id.clone()]);
        if endpoint_zones != expected {
            diagnostics.push(diagnostic(
                "geometry_vertical_flow_path_semantic_mismatch",
                Some(anchor.id.clone()),
            ));
        }
    }

    if diagnostics.is_empty() {
        Ok(())
    } else {
        Err(diagnostics)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn valid_geometry() -> Value {
        json!({
            "schema_version": "building_geometry.v1",
            "status": "available",
            "geometry_id": "geometry-1",
            "project_session_id": "project-1",
            "identity_sha256": "a".repeat(64),
            "source_sha256": "b".repeat(64),
            "revision_id": "revision-1",
            "geometry_revision": 0,
            "coordinate_space": {"kind": "studio_metric", "unit": "mm", "units_per_grid_cell": null, "y_axis": "up"},
            "provenance": {"source_kind": "studio_metric_draft", "application_owned": true, "source_schema_version": null},
            "capabilities": {"geometry_editing": "studio_draft", "prj_round_trip": "unsupported"},
            "levels": [{
                "id": "level-1", "level_number": 1, "name": "Level 1", "elevation": 0, "height": 3000,
                "vertices": [
                    {"id": "v1", "x": 0, "y": 0}, {"id": "v2", "x": 4000, "y": 0},
                    {"id": "v3", "x": 4000, "y": 3000}, {"id": "v4", "x": 0, "y": 3000}
                ],
                "walls": [
                    {"id": "w1", "start_vertex_id": "v1", "end_vertex_id": "v2", "kind": "exterior", "thickness": 200, "source_icon_id": null},
                    {"id": "w2", "start_vertex_id": "v2", "end_vertex_id": "v3", "kind": "exterior", "thickness": 200, "source_icon_id": null},
                    {"id": "w3", "start_vertex_id": "v3", "end_vertex_id": "v4", "kind": "exterior", "thickness": 200, "source_icon_id": null},
                    {"id": "w4", "start_vertex_id": "v4", "end_vertex_id": "v1", "kind": "exterior", "thickness": 200, "source_icon_id": null}
                ],
                "openings": [{"id": "door-1", "wall_id": "w1", "kind": "door", "offset": 1000, "width": 900, "swing": "right", "adjacent_zone_ids": ["zone-1"]}],
                "zone_regions": [{"id": "region-1", "semantic_zone_id": "zone-1", "outer_vertex_ids": ["v1", "v2", "v3", "v4"]}],
                "flow_path_anchors": [],
                "underlays": []
            }],
            "vertical_openings": [],
            "vertical_flow_path_anchors": [],
            "warnings": [],
            "unavailable_reason": null
        })
    }

    fn codes(result: Result<(), Vec<GeometryContractDiagnostic>>) -> BTreeSet<&'static str> {
        result
            .expect_err("mutation must be rejected")
            .into_iter()
            .map(|item| item.code)
            .collect()
    }

    fn add_second_level(value: &mut Value) {
        value["levels"]
            .as_array_mut()
            .expect("levels")
            .push(json!({
                "id": "level-2", "level_number": 2, "name": "Level 2", "elevation": 3000, "height": 3000,
                "vertices": [
                    {"id": "l2-v1", "x": 0, "y": 0}, {"id": "l2-v2", "x": 4000, "y": 0},
                    {"id": "l2-v3", "x": 4000, "y": 3000}, {"id": "l2-v4", "x": 0, "y": 3000}
                ],
                "walls": [
                    {"id": "l2-w1", "start_vertex_id": "l2-v1", "end_vertex_id": "l2-v2", "kind": "exterior", "thickness": 200, "source_icon_id": null},
                    {"id": "l2-w2", "start_vertex_id": "l2-v2", "end_vertex_id": "l2-v3", "kind": "exterior", "thickness": 200, "source_icon_id": null},
                    {"id": "l2-w3", "start_vertex_id": "l2-v3", "end_vertex_id": "l2-v4", "kind": "exterior", "thickness": 200, "source_icon_id": null},
                    {"id": "l2-w4", "start_vertex_id": "l2-v4", "end_vertex_id": "l2-v1", "kind": "exterior", "thickness": 200, "source_icon_id": null}
                ],
                "openings": [],
                "zone_regions": [{"id": "l2-region", "semantic_zone_id": "zone-2", "outer_vertex_ids": ["l2-v1", "l2-v2", "l2-v3", "l2-v4"]}],
                "flow_path_anchors": [],
                "underlays": []
            }));
    }

    #[test]
    fn accepts_valid_metric_geometry() {
        let shared: Value = serde_json::from_str(include_str!(
            "../../contracts/geometry/examples/studio-metric-valid.json"
        ))
        .expect("shared geometry fixture must be valid JSON");
        assert_eq!(shared, valid_geometry());
        assert!(
            validate_building_geometry_value(&shared, Some("project-1"), Some("revision-1"))
                .is_ok()
        );
    }

    #[test]
    fn accepts_vertical_opening_and_explicit_cross_level_flow_path_anchor() {
        let mut value = valid_geometry();
        add_second_level(&mut value);
        value["vertical_openings"] = json!([{
            "id": "vertical-opening-1", "lower_level_id": "level-1", "upper_level_id": "level-2",
            "x": 1500, "y": 1000, "width": 1000, "depth": 1000, "kind": "stair"
        }]);
        value["vertical_flow_path_anchors"] = json!([{
            "id": "vertical-anchor-1", "vertical_opening_id": "vertical-opening-1",
            "semantic_flow_path_id": "flow-between-levels", "lower_zone_id": "zone-1", "upper_zone_id": "zone-2"
        }]);
        assert!(validate_building_geometry_value(&value, None, None).is_ok());
    }

    #[test]
    fn rejects_vertical_level_zone_and_semantic_binding_mutations() {
        let mut value = valid_geometry();
        add_second_level(&mut value);
        value["levels"]
            .as_array_mut()
            .expect("levels")
            .push(json!({
                "id": "level-3", "level_number": 3, "name": "Level 3", "elevation": 6000, "height": 3000,
                "vertices": [], "walls": [], "openings": [], "zone_regions": [], "flow_path_anchors": [], "underlays": []
            }));
        value["vertical_openings"] = json!([
            {"id": "vertical-opening-1", "lower_level_id": "level-1", "upper_level_id": "level-3", "x": 1500, "y": 1000, "width": 1000, "depth": 1000, "kind": "shaft"},
            {"id": "vertical-opening-2", "lower_level_id": "level-1", "upper_level_id": "level-2", "x": -250, "y": 1000, "width": 1000, "depth": 1000, "kind": "floor_opening"}
        ]);
        let rejected = codes(validate_building_geometry_value(&value, None, None));
        assert!(rejected.contains("geometry_vertical_opening_levels_not_adjacent"));
        assert!(rejected.contains("geometry_vertical_opening_zone_coverage_invalid"));

        let mut binding = valid_geometry();
        add_second_level(&mut binding);
        binding["levels"][0]["flow_path_anchors"] = json!([{
            "id": "wall-anchor-1", "opening_id": "door-1", "semantic_flow_path_id": "flow-between-levels",
            "from_zone_id": "zone-1", "to_zone_id": null, "exterior_side": "to"
        }]);
        binding["vertical_openings"] = json!([{
            "id": "vertical-opening-1", "lower_level_id": "level-1", "upper_level_id": "level-2",
            "x": 1500, "y": 1000, "width": 1000, "depth": 1000, "kind": "floor_opening"
        }]);
        binding["vertical_flow_path_anchors"] = json!([{
            "id": "vertical-anchor-1", "vertical_opening_id": "vertical-opening-1",
            "semantic_flow_path_id": "flow-between-levels", "lower_zone_id": "wrong-zone", "upper_zone_id": "zone-2"
        }]);
        let rejected = codes(validate_building_geometry_value(&binding, None, None));
        assert!(rejected.contains("geometry_flow_path_binding_duplicate"));
        assert!(rejected.contains("geometry_vertical_flow_path_zone_mismatch"));
    }

    #[test]
    fn wall_flow_path_requires_explicit_boundary_and_unique_opening_binding() {
        let mut valid = valid_geometry();
        valid["levels"][0]["flow_path_anchors"] = json!([{
            "id": "anchor-1", "opening_id": "door-1", "semantic_flow_path_id": "flow-1",
            "from_zone_id": "zone-1", "to_zone_id": null, "exterior_side": "to"
        }]);
        assert!(validate_building_geometry_value(&valid, None, None).is_ok());

        let mut wrong_wall = valid.clone();
        wrong_wall["levels"][0]["walls"][0]["kind"] = json!("interior");
        assert!(
            codes(validate_building_geometry_value(&wrong_wall, None, None))
                .contains("geometry_flow_path_boundary_invalid")
        );

        let mut duplicate = valid;
        duplicate["levels"][0]["flow_path_anchors"]
            .as_array_mut()
            .expect("anchors")
            .push(json!({
                "id": "anchor-2", "opening_id": "door-1", "semantic_flow_path_id": "flow-2",
                "from_zone_id": "zone-1", "to_zone_id": null, "exterior_side": "to"
            }));
        assert!(
            codes(validate_building_geometry_value(&duplicate, None, None))
                .contains("geometry_flow_path_opening_duplicate")
        );
    }

    #[test]
    fn trusted_semantic_snapshot_proves_wall_and_vertical_flow_path_endpoints() {
        let snapshot = json!({
            "result_type": "semantic_project_snapshot",
            "zones": [
                {"object_id": "zone-1", "contam_number": 1},
                {"object_id": "zone-2", "contam_number": 2}
            ],
            "flow_paths": [
                {"object_id": "flow-wall", "from_endpoint": {"category": "zone", "contam_number": 1}, "to_endpoint": {"category": "outdoor", "contam_number": null}},
                {"object_id": "flow-vertical", "from_endpoint": {"category": "zone", "contam_number": 2}, "to_endpoint": {"category": "zone", "contam_number": 1}}
            ]
        });
        let mut wall = valid_geometry();
        wall["levels"][0]["flow_path_anchors"] = json!([{
            "id": "anchor-1", "opening_id": "door-1", "semantic_flow_path_id": "flow-wall",
            "from_zone_id": "zone-1", "to_zone_id": null, "exterior_side": "to"
        }]);
        assert!(validate_geometry_semantic_flow_bindings(&wall, &snapshot).is_ok());

        let mut wrong_direction = wall.clone();
        wrong_direction["levels"][0]["flow_path_anchors"][0]["exterior_side"] = json!("from");
        wrong_direction["levels"][0]["flow_path_anchors"][0]["from_zone_id"] = Value::Null;
        wrong_direction["levels"][0]["flow_path_anchors"][0]["to_zone_id"] = json!("zone-1");
        assert!(codes(validate_geometry_semantic_flow_bindings(
            &wrong_direction,
            &snapshot
        ))
        .contains("geometry_flow_path_semantic_mismatch"));

        let mut missing = wall.clone();
        missing["levels"][0]["flow_path_anchors"][0]["semantic_flow_path_id"] =
            json!("missing-flow");
        assert!(codes(validate_geometry_semantic_flow_bindings(
            &missing, &snapshot
        ))
        .contains("geometry_flow_path_semantic_missing"));

        let mut vertical = valid_geometry();
        add_second_level(&mut vertical);
        vertical["vertical_openings"] = json!([{
            "id": "vertical-opening-1", "lower_level_id": "level-1", "upper_level_id": "level-2",
            "x": 1500, "y": 1000, "width": 1000, "depth": 1000, "kind": "floor_opening"
        }]);
        vertical["vertical_flow_path_anchors"] = json!([{
            "id": "vertical-anchor-1", "vertical_opening_id": "vertical-opening-1",
            "semantic_flow_path_id": "flow-vertical", "lower_zone_id": "zone-1", "upper_zone_id": "zone-2"
        }]);
        assert!(validate_geometry_semantic_flow_bindings(&vertical, &snapshot).is_ok());
    }

    #[test]
    fn comparison_budget_rejects_overflow_without_advancing() {
        let mut comparisons = MAX_GEOMETRY_INTERSECTION_COMPARISONS - 1;
        assert!(consume_geometry_comparisons(&mut comparisons, 1));
        assert_eq!(comparisons, MAX_GEOMETRY_INTERSECTION_COMPARISONS);
        assert!(!consume_geometry_comparisons(&mut comparisons, 1));
        assert_eq!(comparisons, MAX_GEOMETRY_INTERSECTION_COMPARISONS);
        assert!(!consume_geometry_comparisons(&mut comparisons, usize::MAX));
    }

    #[test]
    fn rejects_unknown_fields_and_stale_identity() {
        let mut unknown = valid_geometry();
        unknown["source_path"] = json!("C:\\secret\\project.prj");
        assert!(
            codes(validate_building_geometry_value(&unknown, None, None))
                .contains("geometry_schema_invalid")
        );

        let stale = codes(validate_building_geometry_value(
            &valid_geometry(),
            Some("other-project"),
            Some("other-revision"),
        ));
        assert!(stale.contains("geometry_project_session_stale"));
        assert!(stale.contains("geometry_revision_stale"));
    }

    #[test]
    fn rejects_dangling_opening_and_self_intersecting_zone() {
        let mut value = valid_geometry();
        value["levels"][0]["openings"][0]["wall_id"] = json!("missing-wall");
        value["levels"][0]["zone_regions"][0]["outer_vertex_ids"] = json!(["v1", "v3", "v2", "v4"]);
        let rejected = codes(validate_building_geometry_value(&value, None, None));
        assert!(rejected.contains("geometry_opening_wall_missing"));
        assert!(rejected.contains("geometry_zone_self_intersection"));
    }

    #[test]
    fn rejects_zone_anchor_as_polygon_and_invalid_projection_capability() {
        let mut value = valid_geometry();
        value["coordinate_space"] = json!({
            "kind": "contam_sketchpad_grid", "unit": "half_grid", "units_per_grid_cell": 2, "y_axis": "up"
        });
        value["provenance"] = json!({
            "source_kind": "contam_sketchpad_projection", "application_owned": false, "source_schema_version": "spatial_projection.v1"
        });
        value["capabilities"] =
            json!({"geometry_editing": "studio_draft", "prj_round_trip": "verified_subset"});
        value["levels"][0]["zone_regions"] = json!([{
            "id": "region-anchor", "semantic_zone_id": "zone-1", "outer_vertex_ids": ["v1", "v1", "v1"]
        }]);
        let rejected = codes(validate_building_geometry_value(&value, None, None));
        assert!(rejected.contains("geometry_coordinate_capability_invalid"));
        assert!(rejected.contains("geometry_zone_loop_invalid"));
    }

    #[test]
    fn shared_zone_boundary_is_allowed_but_interior_overlap_is_rejected() {
        let mut adjacent = valid_geometry();
        adjacent["levels"][0]["vertices"]
            .as_array_mut()
            .expect("vertices")
            .extend([
                json!({"id": "v5", "x": 8000, "y": 0}),
                json!({"id": "v6", "x": 8000, "y": 3000}),
            ]);
        adjacent["levels"][0]["zone_regions"]
            .as_array_mut()
            .expect("regions")
            .push(json!({"id": "region-2", "semantic_zone_id": "zone-2", "outer_vertex_ids": ["v2", "v5", "v6", "v3"]}));
        assert!(validate_building_geometry_value(&adjacent, None, None).is_ok());

        let mut overlapping = valid_geometry();
        overlapping["levels"][0]["vertices"]
            .as_array_mut()
            .expect("vertices")
            .extend([
                json!({"id": "v5", "x": 1000, "y": 1000}),
                json!({"id": "v6", "x": 2000, "y": 1000}),
                json!({"id": "v7", "x": 2000, "y": 2000}),
                json!({"id": "v8", "x": 1000, "y": 2000}),
            ]);
        overlapping["levels"][0]["zone_regions"]
            .as_array_mut()
            .expect("regions")
            .push(json!({"id": "region-2", "semantic_zone_id": "zone-2", "outer_vertex_ids": ["v5", "v6", "v7", "v8"]}));
        assert!(
            codes(validate_building_geometry_value(&overlapping, None, None))
                .contains("geometry_zone_overlap")
        );
    }
}
