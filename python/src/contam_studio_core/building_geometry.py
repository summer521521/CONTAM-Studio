from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from uuid import NAMESPACE_URL, UUID, uuid5

from .spatial_projection import SpatialProjection


BUILDING_GEOMETRY_SCHEMA_VERSION = "building_geometry.v1"
GEOMETRY_VALIDATION_SCHEMA_VERSION = "geometry_validation.v1"
MAX_GEOMETRY_LEVELS = 256
MAX_GEOMETRY_VERTICES = 100_000
MAX_GEOMETRY_WALLS = 100_000
MAX_GEOMETRY_OPENINGS = 50_000
MAX_GEOMETRY_ZONE_REGIONS = 25_000
MAX_GEOMETRY_FLOW_PATH_ANCHORS = 100_000
MAX_GEOMETRY_VERTICAL_OPENINGS = 25_000
MAX_GEOMETRY_VERTICAL_FLOW_PATH_ANCHORS = 25_000
MAX_GEOMETRY_STRING_BYTES = 512
MAX_GEOMETRY_COORDINATE = 1_000_000_000
MAX_GEOMETRY_PAYLOAD_BYTES = 16 * 1024 * 1024
MAX_GEOMETRY_INTERSECTION_COMPARISONS = 2_000_000

_WALL_OFFSETS: dict[int, tuple[tuple[int, int], ...]] = {
    11: ((1, 0), (-1, 0)),
    12: ((0, -1), (0, 1)),
    14: ((1, 0), (0, 1)),
    15: ((0, 1), (-1, 0)),
    16: ((0, -1), (-1, 0)),
    17: ((0, -1), (1, 0)),
    18: ((0, -1), (1, 0), (0, 1)),
    19: ((1, 0), (0, 1), (-1, 0)),
    20: ((0, -1), (0, 1), (-1, 0)),
    21: ((0, -1), (1, 0), (-1, 0)),
    22: ((0, -1), (1, 0), (0, 1), (-1, 0)),
}


class BuildingGeometryError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class GeometryDiagnostic:
    code: str
    severity: str
    object_id: str | None

    def to_dict(self) -> dict[str, object]:
        return {"code": self.code, "severity": self.severity, "object_id": self.object_id}


@dataclass(frozen=True, slots=True)
class GeometryCoordinateSpace:
    kind: str
    unit: str
    units_per_grid_cell: int | None
    y_axis: str = "up"

    def to_dict(self) -> dict[str, object]:
        return {
            "kind": self.kind,
            "unit": self.unit,
            "units_per_grid_cell": self.units_per_grid_cell,
            "y_axis": self.y_axis,
        }


@dataclass(frozen=True, slots=True)
class GeometryProvenance:
    source_kind: str
    application_owned: bool
    source_schema_version: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "source_kind": self.source_kind,
            "application_owned": self.application_owned,
            "source_schema_version": self.source_schema_version,
        }


@dataclass(frozen=True, slots=True)
class GeometryCapabilities:
    geometry_editing: str
    prj_round_trip: str

    def to_dict(self) -> dict[str, str]:
        return {
            "geometry_editing": self.geometry_editing,
            "prj_round_trip": self.prj_round_trip,
        }


@dataclass(frozen=True, slots=True)
class GeometryVertex:
    vertex_id: str
    x: int
    y: int

    def to_dict(self) -> dict[str, object]:
        return {"id": self.vertex_id, "x": self.x, "y": self.y}


@dataclass(frozen=True, slots=True)
class GeometryWall:
    wall_id: str
    start_vertex_id: str
    end_vertex_id: str
    kind: str
    thickness: int | None
    source_icon_id: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.wall_id,
            "start_vertex_id": self.start_vertex_id,
            "end_vertex_id": self.end_vertex_id,
            "kind": self.kind,
            "thickness": self.thickness,
            "source_icon_id": self.source_icon_id,
        }


@dataclass(frozen=True, slots=True)
class GeometryOpening:
    opening_id: str
    wall_id: str
    kind: str
    offset: int
    width: int
    swing: str
    adjacent_zone_ids: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.opening_id,
            "wall_id": self.wall_id,
            "kind": self.kind,
            "offset": self.offset,
            "width": self.width,
            "swing": self.swing,
            "adjacent_zone_ids": list(self.adjacent_zone_ids),
        }


@dataclass(frozen=True, slots=True)
class GeometryZoneRegion:
    region_id: str
    semantic_zone_id: str
    outer_vertex_ids: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.region_id,
            "semantic_zone_id": self.semantic_zone_id,
            "outer_vertex_ids": list(self.outer_vertex_ids),
        }


@dataclass(frozen=True, slots=True)
class GeometryFlowPathAnchor:
    anchor_id: str
    opening_id: str
    semantic_flow_path_id: str
    from_zone_id: str | None
    to_zone_id: str | None
    exterior_side: str

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.anchor_id,
            "opening_id": self.opening_id,
            "semantic_flow_path_id": self.semantic_flow_path_id,
            "from_zone_id": self.from_zone_id,
            "to_zone_id": self.to_zone_id,
            "exterior_side": self.exterior_side,
        }


@dataclass(frozen=True, slots=True)
class GeometryPlanUnderlay:
    underlay_id: str
    resource_id: str
    display_name: str
    sha256: str
    mime_type: str
    page_number: int | None
    pixel_width: int
    pixel_height: int
    pixel_origin_x_milli: int
    pixel_origin_y_milli: int
    origin_x_mm: int
    origin_y_mm: int
    micrometres_per_pixel: int
    rotation_millidegrees: int
    opacity_percent: int
    visible: bool
    locked: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.underlay_id,
            "resource_id": self.resource_id,
            "display_name": self.display_name,
            "sha256": self.sha256,
            "mime_type": self.mime_type,
            "page_number": self.page_number,
            "pixel_width": self.pixel_width,
            "pixel_height": self.pixel_height,
            "pixel_origin_x_milli": self.pixel_origin_x_milli,
            "pixel_origin_y_milli": self.pixel_origin_y_milli,
            "origin_x_mm": self.origin_x_mm,
            "origin_y_mm": self.origin_y_mm,
            "micrometres_per_pixel": self.micrometres_per_pixel,
            "rotation_millidegrees": self.rotation_millidegrees,
            "opacity_percent": self.opacity_percent,
            "visible": self.visible,
            "locked": self.locked,
        }


@dataclass(frozen=True, slots=True)
class GeometryVerticalOpening:
    opening_id: str
    lower_level_id: str
    upper_level_id: str
    x: int
    y: int
    width: int
    depth: int
    kind: str

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.opening_id,
            "lower_level_id": self.lower_level_id,
            "upper_level_id": self.upper_level_id,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "depth": self.depth,
            "kind": self.kind,
        }


@dataclass(frozen=True, slots=True)
class GeometryVerticalFlowPathAnchor:
    anchor_id: str
    vertical_opening_id: str
    semantic_flow_path_id: str
    lower_zone_id: str
    upper_zone_id: str

    def to_dict(self) -> dict[str, str]:
        return {
            "id": self.anchor_id,
            "vertical_opening_id": self.vertical_opening_id,
            "semantic_flow_path_id": self.semantic_flow_path_id,
            "lower_zone_id": self.lower_zone_id,
            "upper_zone_id": self.upper_zone_id,
        }


@dataclass(frozen=True, slots=True)
class GeometryLevel:
    level_id: str
    level_number: int
    name: str
    elevation: int | None
    height: int | None
    vertices: tuple[GeometryVertex, ...]
    walls: tuple[GeometryWall, ...]
    openings: tuple[GeometryOpening, ...] = ()
    zone_regions: tuple[GeometryZoneRegion, ...] = ()
    flow_path_anchors: tuple[GeometryFlowPathAnchor, ...] = ()
    underlays: tuple[GeometryPlanUnderlay, ...] = ()

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.level_id,
            "level_number": self.level_number,
            "name": self.name,
            "elevation": self.elevation,
            "height": self.height,
            "vertices": [item.to_dict() for item in self.vertices],
            "walls": [item.to_dict() for item in self.walls],
            "openings": [item.to_dict() for item in self.openings],
            "zone_regions": [item.to_dict() for item in self.zone_regions],
            "flow_path_anchors": [item.to_dict() for item in self.flow_path_anchors],
            "underlays": [item.to_dict() for item in self.underlays],
        }


@dataclass(frozen=True, slots=True)
class BuildingGeometry:
    status: str
    geometry_id: str
    project_session_id: str
    identity_sha256: str
    source_sha256: str
    revision_id: str
    geometry_revision: int
    coordinate_space: GeometryCoordinateSpace
    provenance: GeometryProvenance
    capabilities: GeometryCapabilities
    levels: tuple[GeometryLevel, ...]
    vertical_openings: tuple[GeometryVerticalOpening, ...]
    vertical_flow_path_anchors: tuple[GeometryVerticalFlowPathAnchor, ...]
    warnings: tuple[GeometryDiagnostic, ...]
    unavailable_reason: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": BUILDING_GEOMETRY_SCHEMA_VERSION,
            "status": self.status,
            "geometry_id": self.geometry_id,
            "project_session_id": self.project_session_id,
            "identity_sha256": self.identity_sha256,
            "source_sha256": self.source_sha256,
            "revision_id": self.revision_id,
            "geometry_revision": self.geometry_revision,
            "coordinate_space": self.coordinate_space.to_dict(),
            "provenance": self.provenance.to_dict(),
            "capabilities": self.capabilities.to_dict(),
            "levels": [level.to_dict() for level in self.levels],
            "vertical_openings": [item.to_dict() for item in self.vertical_openings],
            "vertical_flow_path_anchors": [
                item.to_dict() for item in self.vertical_flow_path_anchors
            ],
            "warnings": [warning.to_dict() for warning in self.warnings],
            "unavailable_reason": self.unavailable_reason,
        }


def canonical_geometry_bytes(geometry: BuildingGeometry) -> bytes:
    return json.dumps(
        geometry.to_dict(), ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def geometry_sha256(geometry: BuildingGeometry) -> str:
    return sha256(canonical_geometry_bytes(geometry)).hexdigest().upper()


def _stable_id(identity: str, category: str, external_identity: str) -> str:
    return str(
        uuid5(
            NAMESPACE_URL,
            f"contam-studio:{identity}:building-geometry:{category}:{external_identity}",
        )
    )


def _validate_payload_size(geometry: BuildingGeometry) -> None:
    if len(canonical_geometry_bytes(geometry)) > MAX_GEOMETRY_PAYLOAD_BYTES:
        raise BuildingGeometryError("geometry_payload_limit_exceeded", "建筑几何负载超过安全上限。")


def project_read_only_geometry(
    projection: SpatialProjection,
    *,
    project_session_id: str,
) -> BuildingGeometry:
    geometry_id = _stable_id(
        projection.identity_sha256,
        "geometry",
        f"{project_session_id}:{projection.revision_id}:sketchpad",
    )
    coordinate_space = GeometryCoordinateSpace(
        kind="contam_sketchpad_grid",
        unit="half_grid",
        units_per_grid_cell=2,
    )
    provenance = GeometryProvenance(
        source_kind="contam_sketchpad_projection",
        application_owned=False,
        source_schema_version="spatial_projection.v1",
    )
    capabilities = GeometryCapabilities(
        geometry_editing="read_only",
        prj_round_trip="read_only_projection",
    )
    if projection.status != "available":
        geometry = BuildingGeometry(
            status="unavailable",
            geometry_id=geometry_id,
            project_session_id=project_session_id,
            identity_sha256=projection.identity_sha256,
            source_sha256=projection.source_sha256,
            revision_id=projection.revision_id,
            geometry_revision=0,
            coordinate_space=coordinate_space,
            provenance=provenance,
            capabilities=capabilities,
            levels=(),
            vertical_openings=(),
            vertical_flow_path_anchors=(),
            warnings=(),
            unavailable_reason=projection.unavailable_reason or "geometry_projection_unavailable",
        )
        _validate_payload_size(geometry)
        return geometry

    levels: list[GeometryLevel] = []
    warnings: list[GeometryDiagnostic] = []
    for level in projection.levels:
        level_id = _stable_id(projection.identity_sha256, "level", str(level.level_number))
        vertices_by_coordinate: dict[tuple[int, int], GeometryVertex] = {}
        walls_by_edge: dict[tuple[str, str], GeometryWall] = {}
        bound_zone_count = 0
        for icon in level.icons:
            if icon.kind == "zone" and icon.binding.status == "bound":
                bound_zone_count += 1
            offsets = _WALL_OFFSETS.get(icon.icon_type, ())
            center = (icon.column * 2, -icon.row * 2)
            for offset_index, (offset_x, offset_y) in enumerate(offsets):
                endpoint = (center[0] + offset_x, center[1] - offset_y)
                for coordinate in (center, endpoint):
                    if coordinate not in vertices_by_coordinate:
                        vertices_by_coordinate[coordinate] = GeometryVertex(
                            vertex_id=_stable_id(
                                projection.identity_sha256,
                                "vertex",
                                f"{level.level_number}:{coordinate[0]}:{coordinate[1]}",
                            ),
                            x=coordinate[0],
                            y=coordinate[1],
                        )
                start_id = vertices_by_coordinate[center].vertex_id
                end_id = vertices_by_coordinate[endpoint].vertex_id
                edge = tuple(sorted((start_id, end_id)))
                wall = GeometryWall(
                    wall_id=_stable_id(
                        projection.identity_sha256,
                        "wall",
                        f"{level.level_number}:{edge[0]}:{edge[1]}",
                    ),
                    start_vertex_id=start_id,
                    end_vertex_id=end_id,
                    kind="unknown",
                    thickness=None,
                    source_icon_id=icon.icon_id,
                )
                if edge in walls_by_edge:
                    warnings.append(
                        GeometryDiagnostic(
                            "geometry_duplicate_projected_wall", "warning", icon.icon_id
                        )
                    )
                else:
                    walls_by_edge[edge] = wall
        if bound_zone_count:
            warnings.append(
                GeometryDiagnostic("geometry_zone_regions_not_inferred", "warning", level_id)
            )
        levels.append(
            GeometryLevel(
                level_id=level_id,
                level_number=level.level_number,
                name=level.name,
                elevation=None,
                height=None,
                vertices=tuple(
                    sorted(
                        vertices_by_coordinate.values(),
                        key=lambda item: (item.x, item.y, item.vertex_id),
                    )
                ),
                walls=tuple(sorted(walls_by_edge.values(), key=lambda item: item.wall_id)),
            )
        )

    geometry = BuildingGeometry(
        status="available",
        geometry_id=geometry_id,
        project_session_id=project_session_id,
        identity_sha256=projection.identity_sha256,
        source_sha256=projection.source_sha256,
        revision_id=projection.revision_id,
        geometry_revision=0,
        coordinate_space=coordinate_space,
        provenance=provenance,
        capabilities=capabilities,
        levels=tuple(sorted(levels, key=lambda item: (item.level_number, item.level_id))),
        vertical_openings=(),
        vertical_flow_path_anchors=(),
        warnings=tuple(sorted(warnings, key=lambda item: (item.code, item.object_id or ""))),
        unavailable_reason=None,
    )
    _validate_payload_size(geometry)
    return geometry


def _is_sha256(value: str) -> bool:
    return len(value) == 64 and all(character in "0123456789abcdefABCDEF" for character in value)


def _orientation(first: GeometryVertex, second: GeometryVertex, third: GeometryVertex) -> int:
    value = (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x)
    return (value > 0) - (value < 0)


def _on_segment(first: GeometryVertex, middle: GeometryVertex, second: GeometryVertex) -> bool:
    return min(first.x, second.x) <= middle.x <= max(first.x, second.x) and min(
        first.y, second.y
    ) <= middle.y <= max(first.y, second.y)


def _segments_intersect(
    first_start: GeometryVertex,
    first_end: GeometryVertex,
    second_start: GeometryVertex,
    second_end: GeometryVertex,
) -> bool:
    orientations = (
        _orientation(first_start, first_end, second_start),
        _orientation(first_start, first_end, second_end),
        _orientation(second_start, second_end, first_start),
        _orientation(second_start, second_end, first_end),
    )
    if orientations[0] != orientations[1] and orientations[2] != orientations[3]:
        return True
    return (
        (orientations[0] == 0 and _on_segment(first_start, second_start, first_end))
        or (orientations[1] == 0 and _on_segment(first_start, second_end, first_end))
        or (orientations[2] == 0 and _on_segment(second_start, first_start, second_end))
        or (orientations[3] == 0 and _on_segment(second_start, first_end, second_end))
    )


def _signed_area(vertices: tuple[GeometryVertex, ...]) -> int:
    return sum(
        current.x * following.y - following.x * current.y
        for current, following in zip(vertices, vertices[1:] + vertices[:1], strict=True)
    )


def _point_in_polygon(point: GeometryVertex, polygon: tuple[GeometryVertex, ...]) -> bool:
    winding = 0
    for first, second in zip(polygon, polygon[1:] + polygon[:1], strict=True):
        if first.y <= point.y < second.y and _orientation(first, second, point) > 0:
            winding += 1
        elif second.y <= point.y < first.y and _orientation(first, second, point) < 0:
            winding -= 1
    return winding != 0


def _point_strictly_in_polygon(
    point: GeometryVertex, polygon: tuple[GeometryVertex, ...]
) -> bool:
    if any(
        _orientation(first, second, point) == 0 and _on_segment(first, point, second)
        for first, second in zip(polygon, polygon[1:] + polygon[:1], strict=True)
    ):
        return False
    return _point_in_polygon(point, polygon)


def _vertical_opening_corners(
    opening: GeometryVerticalOpening,
) -> tuple[GeometryVertex, ...]:
    return (
        GeometryVertex("corner-1", opening.x, opening.y),
        GeometryVertex("corner-2", opening.x + opening.width, opening.y),
        GeometryVertex("corner-3", opening.x + opening.width, opening.y + opening.depth),
        GeometryVertex("corner-4", opening.x, opening.y + opening.depth),
    )


def _zones_containing_vertical_opening(
    level: GeometryLevel, opening: GeometryVerticalOpening
) -> tuple[str, ...]:
    vertices = {item.vertex_id: item for item in level.vertices}
    corners = _vertical_opening_corners(opening)
    matches: list[str] = []
    for region in level.zone_regions:
        try:
            polygon = tuple(vertices[item] for item in region.outer_vertex_ids)
        except KeyError:
            continue
        if all(_point_strictly_in_polygon(corner, polygon) for corner in corners):
            matches.append(region.semantic_zone_id)
    return tuple(sorted(matches))


def _vertical_openings_overlap(
    first: GeometryVerticalOpening, second: GeometryVerticalOpening
) -> bool:
    if (
        first.lower_level_id != second.lower_level_id
        or first.upper_level_id != second.upper_level_id
    ):
        return False
    return (
        first.x < second.x + second.width
        and second.x < first.x + first.width
        and first.y < second.y + second.depth
        and second.y < first.y + first.depth
    )


def validate_building_geometry(
    geometry: BuildingGeometry,
    *,
    expected_project_session_id: str | None = None,
    expected_revision_id: str | None = None,
) -> tuple[GeometryDiagnostic, ...]:
    diagnostics: list[GeometryDiagnostic] = []

    def add(code: str, object_id: str | None = None) -> None:
        diagnostics.append(GeometryDiagnostic(code, "error", object_id))

    if geometry.status not in {"available", "unavailable"}:
        add("geometry_status_invalid", geometry.geometry_id)
    if not _is_sha256(geometry.identity_sha256) or not _is_sha256(geometry.source_sha256):
        add("geometry_identity_invalid", geometry.geometry_id)
    if expected_project_session_id is not None and (
        geometry.project_session_id != expected_project_session_id
    ):
        add("geometry_project_session_stale", geometry.geometry_id)
    if expected_revision_id is not None and geometry.revision_id != expected_revision_id:
        add("geometry_revision_stale", geometry.geometry_id)
    if geometry.status == "unavailable":
        if (
            geometry.levels
            or geometry.vertical_openings
            or geometry.vertical_flow_path_anchors
            or not geometry.unavailable_reason
        ):
            add("geometry_unavailable_payload_invalid", geometry.geometry_id)
        return tuple(sorted(diagnostics, key=lambda item: (item.code, item.object_id or "")))
    if geometry.unavailable_reason is not None:
        add("geometry_available_reason_invalid", geometry.geometry_id)
    if len(geometry.levels) > MAX_GEOMETRY_LEVELS:
        add("geometry_level_limit_exceeded", geometry.geometry_id)
    if geometry.coordinate_space.kind == "contam_sketchpad_grid":
        if (
            geometry.coordinate_space.unit != "half_grid"
            or geometry.coordinate_space.units_per_grid_cell != 2
            or geometry.capabilities.geometry_editing != "read_only"
            or geometry.capabilities.prj_round_trip != "read_only_projection"
            or geometry.provenance.source_kind != "contam_sketchpad_projection"
            or geometry.provenance.application_owned
            or geometry.provenance.source_schema_version != "spatial_projection.v1"
        ):
            add("geometry_coordinate_capability_invalid", geometry.geometry_id)
    elif geometry.coordinate_space.kind == "studio_metric":
        if (
            geometry.coordinate_space.unit != "mm"
            or geometry.coordinate_space.units_per_grid_cell is not None
            or geometry.capabilities.geometry_editing != "studio_draft"
            or geometry.capabilities.prj_round_trip not in {"unsupported", "verified_subset"}
            or geometry.provenance.source_kind != "studio_metric_draft"
            or not geometry.provenance.application_owned
        ):
            add("geometry_coordinate_capability_invalid", geometry.geometry_id)
    else:
        add("geometry_coordinate_space_invalid", geometry.geometry_id)
    if geometry.coordinate_space.y_axis != "up":
        add("geometry_coordinate_axis_invalid", geometry.geometry_id)

    global_ids: set[str] = set()
    level_numbers: set[int] = set()
    semantic_zone_ids: set[str] = set()
    semantic_flow_ids: set[str] = set()
    total_vertices = total_walls = total_openings = total_zones = total_anchors = 0
    comparisons = 0

    for level in geometry.levels:
        if level.level_number <= 0 or level.level_number in level_numbers:
            add("geometry_level_number_invalid", level.level_id)
        level_numbers.add(level.level_number)
        if not level.name or len(level.name.encode("utf-8")) > MAX_GEOMETRY_STRING_BYTES:
            add("geometry_level_name_invalid", level.level_id)
        total_vertices += len(level.vertices)
        total_walls += len(level.walls)
        total_openings += len(level.openings)
        total_zones += len(level.zone_regions)
        total_anchors += len(level.flow_path_anchors)
        for object_id in (
            [level.level_id]
            + [item.vertex_id for item in level.vertices]
            + [item.wall_id for item in level.walls]
            + [item.opening_id for item in level.openings]
            + [item.region_id for item in level.zone_regions]
            + [item.anchor_id for item in level.flow_path_anchors]
            + [item.underlay_id for item in level.underlays]
        ):
            if not object_id or len(object_id.encode("utf-8")) > 128 or object_id in global_ids:
                add("geometry_stable_id_invalid", object_id or None)
            global_ids.add(object_id)

        vertices = {item.vertex_id: item for item in level.vertices}
        coordinates: set[tuple[int, int]] = set()
        for vertex in level.vertices:
            if abs(vertex.x) > MAX_GEOMETRY_COORDINATE or abs(vertex.y) > MAX_GEOMETRY_COORDINATE:
                add("geometry_coordinate_limit_exceeded", vertex.vertex_id)
            coordinate = (vertex.x, vertex.y)
            if coordinate in coordinates:
                add("geometry_duplicate_vertex_coordinate", vertex.vertex_id)
            coordinates.add(coordinate)

        wall_edges: set[tuple[str, str]] = set()
        wall_segments: list[tuple[GeometryWall, GeometryVertex, GeometryVertex]] = []
        for wall in level.walls:
            start = vertices.get(wall.start_vertex_id)
            end = vertices.get(wall.end_vertex_id)
            if start is None or end is None:
                add("geometry_wall_vertex_missing", wall.wall_id)
                continue
            if start == end:
                add("geometry_wall_zero_length", wall.wall_id)
                continue
            if start.x != end.x and start.y != end.y:
                add("geometry_wall_not_orthogonal", wall.wall_id)
            edge = tuple(sorted((start.vertex_id, end.vertex_id)))
            if edge in wall_edges:
                add("geometry_duplicate_wall", wall.wall_id)
            wall_edges.add(edge)
            wall_segments.append((wall, start, end))

        sorted_segments = sorted(
            wall_segments,
            key=lambda item: (
                min(item[1].x, item[2].x),
                max(item[1].x, item[2].x),
                item[0].wall_id,
            ),
        )
        active: list[tuple[GeometryWall, GeometryVertex, GeometryVertex]] = []
        for wall, start, end in sorted_segments:
            min_x = min(start.x, end.x)
            active = [item for item in active if max(item[1].x, item[2].x) >= min_x]
            for other, other_start, other_end in active:
                comparisons += 1
                if comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS:
                    add("geometry_topology_complexity_limit_exceeded", level.level_id)
                    active = []
                    break
                shared = {
                    start.vertex_id,
                    end.vertex_id,
                } & {other_start.vertex_id, other_end.vertex_id}
                if not shared and _segments_intersect(start, end, other_start, other_end):
                    add("geometry_wall_intersection_requires_split", wall.wall_id)
            active.append((wall, start, end))

        openings_by_wall: dict[str, list[GeometryOpening]] = {}
        wall_by_id = {item[0].wall_id: item for item in wall_segments}
        level_zone_ids = {region.semantic_zone_id for region in level.zone_regions}
        for opening in level.openings:
            wall_record = wall_by_id.get(opening.wall_id)
            if wall_record is None:
                add("geometry_opening_wall_missing", opening.opening_id)
                continue
            _, start, end = wall_record
            length = abs(start.x - end.x) + abs(start.y - end.y)
            if opening.offset < 0 or opening.width <= 0 or opening.offset + opening.width > length:
                add("geometry_opening_out_of_bounds", opening.opening_id)
            if len(set(opening.adjacent_zone_ids)) != len(opening.adjacent_zone_ids):
                add("geometry_opening_adjacent_zone_invalid", opening.opening_id)
            if not set(opening.adjacent_zone_ids).issubset(level_zone_ids):
                add("geometry_opening_zone_missing", opening.opening_id)
            openings_by_wall.setdefault(opening.wall_id, []).append(opening)
        for wall_id, openings in openings_by_wall.items():
            ordered = sorted(openings, key=lambda item: (item.offset, item.opening_id))
            for previous, current in zip(ordered, ordered[1:]):
                if previous.offset + previous.width > current.offset:
                    add("geometry_opening_overlap", current.opening_id)

        polygons: list[tuple[GeometryZoneRegion, tuple[GeometryVertex, ...]]] = []
        for region in level.zone_regions:
            if region.semantic_zone_id in semantic_zone_ids:
                add("geometry_zone_binding_duplicate", region.region_id)
            semantic_zone_ids.add(region.semantic_zone_id)
            if len(region.outer_vertex_ids) < 3 or len(set(region.outer_vertex_ids)) < 3:
                add("geometry_zone_loop_invalid", region.region_id)
                continue
            try:
                polygon = tuple(vertices[vertex_id] for vertex_id in region.outer_vertex_ids)
            except KeyError:
                add("geometry_zone_vertex_missing", region.region_id)
                continue
            if _signed_area(polygon) <= 0:
                add("geometry_zone_orientation_invalid", region.region_id)
            edges = list(zip(polygon, polygon[1:] + polygon[:1], strict=True))
            for first_index, (first_start, first_end) in enumerate(edges):
                for second_index in range(first_index + 1, len(edges)):
                    if second_index in {first_index, first_index + 1} or (
                        first_index == 0 and second_index == len(edges) - 1
                    ):
                        continue
                    comparisons += 1
                    if comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS:
                        add("geometry_topology_complexity_limit_exceeded", region.region_id)
                        break
                    second_start, second_end = edges[second_index]
                    if _segments_intersect(first_start, first_end, second_start, second_end):
                        add("geometry_zone_self_intersection", region.region_id)
                        break
            polygons.append((region, polygon))

        for index, (first_region, first_polygon) in enumerate(polygons):
            for second_region, second_polygon in polygons[index + 1 :]:
                comparisons += 1
                if comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS:
                    add("geometry_topology_complexity_limit_exceeded", level.level_id)
                    break
                proper_crossing = any(
                    _orientation(first_start, first_end, second_start)
                    * _orientation(first_start, first_end, second_end)
                    < 0
                    and _orientation(second_start, second_end, first_start)
                    * _orientation(second_start, second_end, first_end)
                    < 0
                    for first_start, first_end in zip(
                        first_polygon, first_polygon[1:] + first_polygon[:1], strict=True
                    )
                    for second_start, second_end in zip(
                        second_polygon, second_polygon[1:] + second_polygon[:1], strict=True
                    )
                )
                if (
                    proper_crossing
                    or _point_in_polygon(first_polygon[0], second_polygon)
                    or _point_in_polygon(second_polygon[0], first_polygon)
                ):
                    add("geometry_zone_overlap", second_region.region_id)

        opening_by_id = {item.opening_id: item for item in level.openings}
        anchored_opening_ids: set[str] = set()
        for anchor in level.flow_path_anchors:
            if anchor.semantic_flow_path_id in semantic_flow_ids:
                add("geometry_flow_path_binding_duplicate", anchor.anchor_id)
            semantic_flow_ids.add(anchor.semantic_flow_path_id)
            if anchor.opening_id in anchored_opening_ids:
                add("geometry_flow_path_opening_duplicate", anchor.anchor_id)
            anchored_opening_ids.add(anchor.opening_id)
            opening = opening_by_id.get(anchor.opening_id)
            if opening is None:
                add("geometry_flow_path_opening_missing", anchor.anchor_id)
                continue
            endpoint_zones = {item for item in (anchor.from_zone_id, anchor.to_zone_id) if item}
            adjacent_zones = set(opening.adjacent_zone_ids)
            if endpoint_zones != adjacent_zones:
                add("geometry_flow_path_zone_mismatch", anchor.anchor_id)
            wall_record = wall_by_id.get(opening.wall_id)
            wall_kind = wall_record[0].kind if wall_record else None
            interior_valid = (
                len(adjacent_zones) == 2
                and wall_kind == "interior"
                and anchor.exterior_side == "none"
                and anchor.from_zone_id is not None
                and anchor.to_zone_id is not None
                and anchor.from_zone_id != anchor.to_zone_id
            )
            exterior_valid = (
                (
                    len(adjacent_zones) == 1
                    and wall_kind == "exterior"
                    and anchor.exterior_side == "from"
                    and anchor.from_zone_id is None
                    and anchor.to_zone_id is not None
                )
                or (
                    len(adjacent_zones) == 1
                    and wall_kind == "exterior"
                    and anchor.exterior_side == "to"
                    and anchor.from_zone_id is not None
                    and anchor.to_zone_id is None
                )
            )
            if not interior_valid and not exterior_valid:
                add("geometry_flow_path_boundary_invalid", anchor.anchor_id)

        if len(level.underlays) > 1:
            add("geometry_underlay_count_invalid", level.level_id)
        for underlay in level.underlays:
            try:
                resource_uuid_valid = UUID(underlay.resource_id).version in {1, 2, 3, 4, 5}
            except (ValueError, AttributeError):
                resource_uuid_valid = False
            page_valid = (
                1 <= underlay.page_number <= 10_000
                if underlay.mime_type == "application/pdf" and underlay.page_number is not None
                else underlay.page_number is None and underlay.mime_type in {"image/png", "image/jpeg"}
            )
            underlay_valid = (
                resource_uuid_valid
                and bool(underlay.display_name)
                and len(underlay.display_name) <= 160
                and "/" not in underlay.display_name
                and "\\" not in underlay.display_name
                and not any(ord(character) < 32 or ord(character) == 127 for character in underlay.display_name)
                and _is_sha256(underlay.sha256)
                and page_valid
                and 1 <= underlay.pixel_width <= 20_000
                and 1 <= underlay.pixel_height <= 20_000
                and -20_000_000 <= underlay.pixel_origin_x_milli <= 20_000_000
                and -20_000_000 <= underlay.pixel_origin_y_milli <= 20_000_000
                and abs(underlay.origin_x_mm) <= MAX_GEOMETRY_COORDINATE
                and abs(underlay.origin_y_mm) <= MAX_GEOMETRY_COORDINATE
                and 1 <= underlay.micrometres_per_pixel <= 1_000_000_000
                and -359_999 <= underlay.rotation_millidegrees <= 359_999
                and 5 <= underlay.opacity_percent <= 100
                and isinstance(underlay.visible, bool)
                and isinstance(underlay.locked, bool)
            )
            if not underlay_valid:
                add("geometry_underlay_invalid", underlay.underlay_id)

    ordered_levels = sorted(geometry.levels, key=lambda item: (item.level_number, item.level_id))
    level_by_id = {item.level_id: item for item in ordered_levels}
    level_index = {item.level_id: index for index, item in enumerate(ordered_levels)}
    vertical_openings: dict[str, GeometryVerticalOpening] = {}
    openings_by_pair: dict[tuple[str, str], list[GeometryVerticalOpening]] = {}
    for opening in geometry.vertical_openings:
        if (
            not opening.opening_id
            or len(opening.opening_id.encode("utf-8")) > 128
            or opening.opening_id in global_ids
        ):
            add("geometry_stable_id_invalid", opening.opening_id or None)
        global_ids.add(opening.opening_id)
        lower = level_by_id.get(opening.lower_level_id)
        upper = level_by_id.get(opening.upper_level_id)
        adjacent = (
            lower is not None
            and upper is not None
            and level_index[upper.level_id] == level_index[lower.level_id] + 1
        )
        if not adjacent:
            add("geometry_vertical_opening_levels_not_adjacent", opening.opening_id)
            continue
        coordinate_valid = (
            opening.kind in {"floor_opening", "stair", "shaft"}
            and opening.width > 0
            and opening.depth > 0
            and abs(opening.x) <= MAX_GEOMETRY_COORDINATE
            and abs(opening.y) <= MAX_GEOMETRY_COORDINATE
            and abs(opening.x + opening.width) <= MAX_GEOMETRY_COORDINATE
            and abs(opening.y + opening.depth) <= MAX_GEOMETRY_COORDINATE
        )
        if not coordinate_valid:
            add("geometry_vertical_opening_invalid", opening.opening_id)
        lower_zones = _zones_containing_vertical_opening(lower, opening)
        upper_zones = _zones_containing_vertical_opening(upper, opening)
        if len(lower_zones) != 1 or len(upper_zones) != 1:
            add("geometry_vertical_opening_zone_coverage_invalid", opening.opening_id)
        pair_key = (opening.lower_level_id, opening.upper_level_id)
        existing = openings_by_pair.setdefault(pair_key, [])
        for other in existing:
            comparisons += 1
            if comparisons > MAX_GEOMETRY_INTERSECTION_COMPARISONS:
                add("geometry_topology_complexity_limit_exceeded", opening.opening_id)
                break
            if _vertical_openings_overlap(other, opening):
                add("geometry_vertical_opening_overlap", opening.opening_id)
        existing.append(opening)
        vertical_openings[opening.opening_id] = opening

    anchored_vertical_openings: set[str] = set()
    for anchor in geometry.vertical_flow_path_anchors:
        if (
            not anchor.anchor_id
            or len(anchor.anchor_id.encode("utf-8")) > 128
            or anchor.anchor_id in global_ids
        ):
            add("geometry_stable_id_invalid", anchor.anchor_id or None)
        global_ids.add(anchor.anchor_id)
        opening = vertical_openings.get(anchor.vertical_opening_id)
        if opening is None:
            add("geometry_vertical_flow_path_opening_missing", anchor.anchor_id)
            continue
        if opening.opening_id in anchored_vertical_openings:
            add("geometry_vertical_flow_path_opening_duplicate", anchor.anchor_id)
        anchored_vertical_openings.add(opening.opening_id)
        if anchor.semantic_flow_path_id in semantic_flow_ids:
            add("geometry_flow_path_binding_duplicate", anchor.anchor_id)
        semantic_flow_ids.add(anchor.semantic_flow_path_id)
        lower = level_by_id[opening.lower_level_id]
        upper = level_by_id[opening.upper_level_id]
        if (
            _zones_containing_vertical_opening(lower, opening) != (anchor.lower_zone_id,)
            or _zones_containing_vertical_opening(upper, opening) != (anchor.upper_zone_id,)
        ):
            add("geometry_vertical_flow_path_zone_mismatch", anchor.anchor_id)

    if total_vertices > MAX_GEOMETRY_VERTICES:
        add("geometry_vertex_limit_exceeded", geometry.geometry_id)
    if total_walls > MAX_GEOMETRY_WALLS:
        add("geometry_wall_limit_exceeded", geometry.geometry_id)
    if total_openings > MAX_GEOMETRY_OPENINGS:
        add("geometry_opening_limit_exceeded", geometry.geometry_id)
    if total_zones > MAX_GEOMETRY_ZONE_REGIONS:
        add("geometry_zone_limit_exceeded", geometry.geometry_id)
    if total_anchors > MAX_GEOMETRY_FLOW_PATH_ANCHORS:
        add("geometry_flow_path_limit_exceeded", geometry.geometry_id)
    if len(geometry.vertical_openings) > MAX_GEOMETRY_VERTICAL_OPENINGS:
        add("geometry_vertical_opening_limit_exceeded", geometry.geometry_id)
    if len(geometry.vertical_flow_path_anchors) > MAX_GEOMETRY_VERTICAL_FLOW_PATH_ANCHORS:
        add("geometry_vertical_flow_path_limit_exceeded", geometry.geometry_id)
    try:
        _validate_payload_size(geometry)
    except BuildingGeometryError as error:
        add(error.code, geometry.geometry_id)

    return tuple(sorted(diagnostics, key=lambda item: (item.code, item.object_id or "")))


def geometry_validation_result(
    geometry: BuildingGeometry,
    *,
    expected_project_session_id: str | None = None,
    expected_revision_id: str | None = None,
) -> dict[str, object]:
    diagnostics = validate_building_geometry(
        geometry,
        expected_project_session_id=expected_project_session_id,
        expected_revision_id=expected_revision_id,
    )
    return {
        "schema_version": GEOMETRY_VALIDATION_SCHEMA_VERSION,
        "geometry_id": geometry.geometry_id,
        "revision_id": geometry.revision_id,
        "geometry_hash": geometry_sha256(geometry),
        "status": (
            "invalid"
            if diagnostics
            else "unavailable"
            if geometry.status == "unavailable"
            else "valid"
        ),
        "diagnostics": [item.to_dict() for item in diagnostics],
    }
