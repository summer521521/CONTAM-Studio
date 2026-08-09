from __future__ import annotations

from dataclasses import dataclass
import json
import math
from uuid import NAMESPACE_URL, uuid5

from .prj_sections import PrjSection, PrjSectionError, PrjSectionsDocument, SectionLine
from .strict_numeric import parse_ascii_finite_float


SPATIAL_SCHEMA_VERSION = "spatial_projection.v1"
MAX_SPATIAL_LEVELS = 256
MAX_SPATIAL_ICONS = 100_000
MAX_SPATIAL_STRING_BYTES = 512
MAX_SPATIAL_COORDINATE = 1_000_000
MAX_SPATIAL_LEVEL_NUMBER = 1_000_000
MAX_SPATIAL_ICON_TYPE = 1_000_000
MIN_SPATIAL_OBJECT_NUMBER = -1
MAX_SPATIAL_OBJECT_NUMBER = 1_000_000
SPATIAL_LEVEL_UNIT_CODES = frozenset({0, 1})
MAX_SPATIAL_WARNINGS = 1_024
MAX_SPATIAL_PAYLOAD_BYTES = 8 * 1024 * 1024

ZONE_ICON_TYPES = frozenset({5, 6, 7})
FLOW_ICON_TYPES = frozenset({1, 2, 3, 4})
WALL_ICON_TYPES = frozenset({11, 12, *range(14, 23)})
OPENING_ICON_TYPES = frozenset({23, 24, 25, 27})
FAN_ICON_TYPES = frozenset({28, 29, 30, 31})
NOTE_ICON_TYPES = frozenset({42})
FLOW_BINDABLE_ICON_TYPES = FLOW_ICON_TYPES | OPENING_ICON_TYPES | FAN_ICON_TYPES


class SpatialProjectionError(Exception):
    def __init__(self, code: str, message: str, line_number: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.line_number = line_number


@dataclass(frozen=True, slots=True)
class SpatialBinding:
    kind: str
    semantic_id: str | None
    status: str
    reason: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "kind": self.kind,
            "semantic_id": self.semantic_id,
            "status": self.status,
            "reason": self.reason,
        }


@dataclass(frozen=True, slots=True)
class SpatialIcon:
    icon_id: str
    icon_type: int
    kind: str
    column: int
    row: int
    object_number: int
    binding: SpatialBinding
    source_line: int

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.icon_id,
            "icon_type": self.icon_type,
            "kind": self.kind,
            "column": self.column,
            "row": self.row,
            "object_number": self.object_number,
            "binding": self.binding.to_dict(),
            "evidence": {"source_line": self.source_line},
        }


@dataclass(frozen=True, slots=True)
class SpatialBounds:
    min_column: int
    max_column: int
    min_row: int
    max_row: int

    def to_dict(self) -> dict[str, int]:
        return {
            "min_column": self.min_column,
            "max_column": self.max_column,
            "min_row": self.min_row,
            "max_row": self.max_row,
        }


@dataclass(frozen=True, slots=True)
class SpatialLevel:
    level_number: int
    name: str
    reference_height: float
    delta_height: float
    reference_height_unit: int
    delta_height_unit: int
    bounds: SpatialBounds | None
    icons: tuple[SpatialIcon, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "level_number": self.level_number,
            "name": self.name,
            "reference_height": self.reference_height,
            "delta_height": self.delta_height,
            "reference_height_unit": self.reference_height_unit,
            "delta_height_unit": self.delta_height_unit,
            "bounds": None if self.bounds is None else self.bounds.to_dict(),
            "icons": [icon.to_dict() for icon in self.icons],
        }


@dataclass(frozen=True, slots=True)
class SpatialWarning:
    code: str
    icon_id: str | None

    def to_dict(self) -> dict[str, object]:
        return {"code": self.code, "icon_id": self.icon_id}


@dataclass(frozen=True, slots=True)
class SpatialProjection:
    status: str
    identity_sha256: str
    source_sha256: str
    revision_id: str
    levels: tuple[SpatialLevel, ...]
    warnings: tuple[SpatialWarning, ...]
    unavailable_reason: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": SPATIAL_SCHEMA_VERSION,
            "status": self.status,
            "identity_sha256": self.identity_sha256,
            "source_sha256": self.source_sha256,
            "revision_id": self.revision_id,
            "levels": [level.to_dict() for level in self.levels],
            "warnings": [warning.to_dict() for warning in self.warnings],
            "unavailable_reason": self.unavailable_reason,
        }


def unavailable_spatial_projection(
    identity_sha256: str,
    source_sha256: str,
    revision_id: str,
    reason: str,
) -> SpatialProjection:
    return SpatialProjection(
        status="unavailable",
        identity_sha256=identity_sha256,
        source_sha256=source_sha256,
        revision_id=revision_id,
        levels=(),
        warnings=(),
        unavailable_reason=reason,
    )


def classify_icon_type(icon_type: int) -> str:
    if icon_type in FLOW_ICON_TYPES:
        return "flow_path"
    if icon_type in ZONE_ICON_TYPES:
        return "zone"
    if icon_type in WALL_ICON_TYPES:
        return "wall"
    if icon_type in OPENING_ICON_TYPES:
        return "opening"
    if icon_type in FAN_ICON_TYPES:
        return "fan"
    if icon_type in NOTE_ICON_TYPES:
        return "note"
    return "unknown"


def _tokens(line: SectionLine) -> list[str]:
    text = line.text.partition("!")[0].strip()
    return text.split() if text else []


def _data_lines(section: PrjSection) -> tuple[SectionLine, ...]:
    return tuple(line for line in section.lines if _tokens(line))


def _parse_int(token: str, code: str, line_number: int) -> int:
    try:
        return int(token)
    except ValueError as error:
        raise SpatialProjectionError(code, "空间投影整数域无效。", line_number) from error


def _parse_float(token: str, code: str, line_number: int) -> float:
    try:
        value = parse_ascii_finite_float(token)
    except ValueError as error:
        raise SpatialProjectionError(code, "空间投影数值域无效。", line_number) from error
    if not math.isfinite(value):
        raise SpatialProjectionError(code, "空间投影数值域无效。", line_number)
    return value


def _validate_string(value: str, code: str, line_number: int) -> str:
    if not value or len(value.encode("utf-8")) > MAX_SPATIAL_STRING_BYTES:
        raise SpatialProjectionError(code, "空间投影字符串超过安全范围。", line_number)
    return value


def _binding_for(
    icon_type: int,
    object_number: int,
    zone_semantic_ids: dict[int, str],
    flow_path_semantic_ids: dict[int, str],
) -> SpatialBinding:
    if icon_type in ZONE_ICON_TYPES:
        semantic_id = zone_semantic_ids.get(object_number)
        return SpatialBinding(
            kind="zone",
            semantic_id=semantic_id,
            status="bound" if semantic_id else "unbound",
            reason=None if semantic_id else "spatial_zone_binding_missing",
        )
    if icon_type in FLOW_BINDABLE_ICON_TYPES:
        semantic_id = flow_path_semantic_ids.get(object_number)
        return SpatialBinding(
            kind="flow_path",
            semantic_id=semantic_id,
            status="bound" if semantic_id else "unbound",
            reason=None if semantic_id else "spatial_flow_path_binding_missing",
        )
    return SpatialBinding(
        kind="none",
        semantic_id=None,
        status="unbound",
        reason="spatial_icon_not_bindable",
    )


def _icon_id(
    identity_sha256: str,
    level_number: int,
    icon_type: int,
    column: int,
    row: int,
    object_number: int,
    duplicate_ordinal: int,
) -> str:
    external_identity = (
        f"{level_number}:{icon_type}:{column}:{row}:{object_number}:{duplicate_ordinal}"
    )
    return str(
        uuid5(
            NAMESPACE_URL,
            f"contam-studio:{identity_sha256}:spatial-icon:{external_identity}",
        )
    )


def _warning_for(icon: SpatialIcon) -> SpatialWarning | None:
    if icon.kind == "unknown":
        return SpatialWarning("spatial_unknown_icon_type", icon.icon_id)
    if icon.binding.status == "unbound" and icon.binding.kind != "none":
        return SpatialWarning(icon.binding.reason or "spatial_binding_missing", icon.icon_id)
    return None


def _bounded_warnings(warnings: list[SpatialWarning]) -> tuple[SpatialWarning, ...]:
    if len(warnings) <= MAX_SPATIAL_WARNINGS:
        return tuple(warnings)
    visible = warnings[: MAX_SPATIAL_WARNINGS - 1]
    visible.append(SpatialWarning("spatial_warnings_truncated", None))
    return tuple(visible)


def project_spatial(
    document: PrjSectionsDocument,
    *,
    identity_sha256: str,
    revision_id: str,
    zone_semantic_ids: dict[int, str],
    flow_path_semantic_ids: dict[int, str],
) -> SpatialProjection:
    try:
        section = document.section("levels plus icon data")
    except PrjSectionError as error:
        raise SpatialProjectionError("spatial_duplicate_section", "空间区块重复。") from error
    if section is None:
        raise SpatialProjectionError("spatial_section_missing", "项目没有SketchPad空间区块。")
    if section.declared_count < 0 or section.declared_count > MAX_SPATIAL_LEVELS:
        raise SpatialProjectionError(
            "spatial_level_limit_exceeded",
            "空间层数超过安全范围。",
            section.marker_line_number,
        )

    lines = _data_lines(section)
    cursor = 0
    levels: list[SpatialLevel] = []
    level_numbers: set[int] = set()
    total_icons = 0
    duplicate_counts: dict[tuple[int, int, int, int, int], int] = {}
    all_ids: set[str] = set()
    warnings: list[SpatialWarning] = []

    for _ in range(section.declared_count):
        if cursor >= len(lines):
            raise SpatialProjectionError(
                "spatial_level_truncated",
                "空间层记录被截断。",
                section.marker_line_number,
            )
        header = lines[cursor]
        cursor += 1
        parts = header.text.partition("!")[0].strip().split(maxsplit=6)
        if len(parts) != 7:
            raise SpatialProjectionError(
                "spatial_level_record_invalid",
                "空间层记录字段数量无效。",
                header.line_number,
            )
        level_number = _parse_int(parts[0], "spatial_level_number_invalid", header.line_number)
        if (
            level_number <= 0
            or level_number > MAX_SPATIAL_LEVEL_NUMBER
            or level_number in level_numbers
        ):
            raise SpatialProjectionError(
                "spatial_level_number_invalid",
                "空间层编号必须唯一且为正数。",
                header.line_number,
            )
        level_numbers.add(level_number)
        reference_height = _parse_float(
            parts[1], "spatial_reference_height_invalid", header.line_number
        )
        delta_height = _parse_float(
            parts[2], "spatial_delta_height_invalid", header.line_number
        )
        icon_count = _parse_int(parts[3], "spatial_icon_count_invalid", header.line_number)
        if icon_count < 0 or total_icons + icon_count > MAX_SPATIAL_ICONS:
            raise SpatialProjectionError(
                "spatial_icon_limit_exceeded",
                "空间图标数量超过安全范围。",
                header.line_number,
            )
        reference_unit = _parse_int(
            parts[4], "spatial_level_unit_invalid", header.line_number
        )
        delta_unit = _parse_int(parts[5], "spatial_level_unit_invalid", header.line_number)
        if (
            reference_unit not in SPATIAL_LEVEL_UNIT_CODES
            or delta_unit not in SPATIAL_LEVEL_UNIT_CODES
        ):
            raise SpatialProjectionError(
                "spatial_level_unit_invalid",
                "空间层单位代码不受支持。",
                header.line_number,
            )
        name = _validate_string(parts[6].strip(), "spatial_level_name_invalid", header.line_number)

        icons: list[SpatialIcon] = []
        for _icon_offset in range(icon_count):
            if cursor >= len(lines):
                raise SpatialProjectionError(
                    "spatial_icon_count_mismatch",
                    "空间图标记录少于声明数量。",
                    header.line_number,
                )
            line = lines[cursor]
            cursor += 1
            tokens = _tokens(line)
            if len(tokens) != 4:
                raise SpatialProjectionError(
                    "spatial_icon_record_invalid",
                    "空间图标记录必须包含四个整数。",
                    line.line_number,
                )
            icon_type, column, row, object_number = (
                _parse_int(token, "spatial_icon_integer_invalid", line.line_number)
                for token in tokens
            )
            if not 0 <= icon_type <= MAX_SPATIAL_ICON_TYPE:
                raise SpatialProjectionError(
                    "spatial_icon_type_invalid",
                    "空间图标类型超过安全范围。",
                    line.line_number,
                )
            if not MIN_SPATIAL_OBJECT_NUMBER <= object_number <= MAX_SPATIAL_OBJECT_NUMBER:
                raise SpatialProjectionError(
                    "spatial_object_number_invalid",
                    "空间图标对象编号超过安全范围。",
                    line.line_number,
                )
            if abs(column) > MAX_SPATIAL_COORDINATE or abs(row) > MAX_SPATIAL_COORDINATE:
                raise SpatialProjectionError(
                    "spatial_coordinate_limit_exceeded",
                    "空间图标坐标超过安全范围。",
                    line.line_number,
                )
            identity_tuple = (level_number, icon_type, column, row, object_number)
            duplicate_ordinal = duplicate_counts.get(identity_tuple, 0)
            duplicate_counts[identity_tuple] = duplicate_ordinal + 1
            icon_id = _icon_id(
                identity_sha256,
                level_number,
                icon_type,
                column,
                row,
                object_number,
                duplicate_ordinal,
            )
            if icon_id in all_ids:
                raise SpatialProjectionError(
                    "spatial_duplicate_icon_id",
                    "空间图标稳定标识重复。",
                    line.line_number,
                )
            all_ids.add(icon_id)
            icon = SpatialIcon(
                icon_id=icon_id,
                icon_type=icon_type,
                kind=classify_icon_type(icon_type),
                column=column,
                row=row,
                object_number=object_number,
                binding=_binding_for(
                    icon_type,
                    object_number,
                    zone_semantic_ids,
                    flow_path_semantic_ids,
                ),
                source_line=line.line_number,
            )
            icons.append(icon)
            warning = _warning_for(icon)
            if warning is not None:
                warnings.append(warning)

        total_icons += len(icons)
        bounds = None
        if icons:
            bounds = SpatialBounds(
                min_column=min(icon.column for icon in icons),
                max_column=max(icon.column for icon in icons),
                min_row=min(icon.row for icon in icons),
                max_row=max(icon.row for icon in icons),
            )
        levels.append(
            SpatialLevel(
                level_number=level_number,
                name=name,
                reference_height=reference_height,
                delta_height=delta_height,
                reference_height_unit=reference_unit,
                delta_height_unit=delta_unit,
                bounds=bounds,
                icons=tuple(icons),
            )
        )

    if cursor != len(lines):
        raise SpatialProjectionError(
            "spatial_extra_records",
            "空间区块包含声明范围之外的记录。",
            lines[cursor].line_number,
        )
    if len(levels) != section.declared_count:
        raise SpatialProjectionError(
            "spatial_level_count_mismatch",
            "空间层数量与区块声明不一致。",
            section.marker_line_number,
        )

    projection = SpatialProjection(
        status="available",
        identity_sha256=identity_sha256,
        source_sha256=document.source_sha256,
        revision_id=revision_id,
        levels=tuple(levels),
        warnings=_bounded_warnings(warnings),
        unavailable_reason=None,
    )
    payload_size = len(
        json.dumps(projection.to_dict(), ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
    )
    if payload_size > MAX_SPATIAL_PAYLOAD_BYTES:
        raise SpatialProjectionError(
            "spatial_payload_limit_exceeded",
            "空间投影超过安全负载上限。",
            section.marker_line_number,
        )
    return projection
