from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from uuid import NAMESPACE_URL, uuid5


SCHEDULE_SCHEMA_VERSION = "domain_schedule.v1"
MAX_POINTS = 10_000
MAX_DAY_TYPES = 64


class ScheduleError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class TimePoint:
    minute: int
    value: float

    def to_dict(self) -> dict[str, int | float]:
        return {"minute": self.minute, "value": self.value}


@dataclass(frozen=True, slots=True)
class DaySchedule:
    schedule_id: str
    label: str
    unit: str
    time_basis: str
    interpolation: str
    points: tuple[TimePoint, ...]
    capability: str
    evidence_id: str

    def to_dict(self) -> dict[str, object]:
        return {
            "schedule_id": self.schedule_id,
            "label": self.label,
            "unit": self.unit,
            "time_basis": self.time_basis,
            "interpolation": self.interpolation,
            "points": [point.to_dict() for point in self.points],
            "capability": self.capability,
            "evidence_id": self.evidence_id,
        }


@dataclass(frozen=True, slots=True)
class WeekSchedule:
    schedule_id: str
    label: str
    day_schedule_ids: tuple[str, ...]
    capability: str
    evidence_id: str

    def to_dict(self) -> dict[str, object]:
        return {
            "schedule_id": self.schedule_id,
            "label": self.label,
            "day_schedule_ids": list(self.day_schedule_ids),
            "capability": self.capability,
            "evidence_id": self.evidence_id,
        }


@dataclass(frozen=True, slots=True)
class SchedulePage:
    schedule_id: str
    cursor: str | None
    next_cursor: str | None
    points: tuple[TimePoint, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "schedule_id": self.schedule_id,
            "cursor": self.cursor,
            "next_cursor": self.next_cursor,
            "points": [point.to_dict() for point in self.points],
        }


def _evidence(schedule_id: str, label: str, points: tuple[TimePoint, ...]) -> str:
    payload = json.dumps([schedule_id, label, [point.to_dict() for point in points]], separators=(",", ":"))
    return f"ev-{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16]}"


def make_day_schedule(
    baseline_sha256: str,
    number: int,
    label: str,
    points: tuple[TimePoint, ...],
    *,
    unit: str = "1",
    interpolation: str = "step",
    capability: str = "inspect",
) -> DaySchedule:
    if len(baseline_sha256) != 64 or any(character not in "0123456789abcdef" for character in baseline_sha256.lower()):
        raise ScheduleError("invalid_baseline_hash", "Schedule基线哈希无效。")
    if not label or len(label) > 80 or not label.isascii() or any(character.isspace() for character in label):
        raise ScheduleError("invalid_schedule_label", "Schedule名称必须是有限ASCII标识。")
    if unit not in {"1", "kg/s", "mg/s", "kg/m3", "mg/m3"}:
        raise ScheduleError("unsupported_schedule_unit", "Schedule单位不在首版Profile内。")
    if interpolation not in {"step", "linear"}:
        raise ScheduleError("unsupported_interpolation", "Schedule插值规则不受支持。")
    if capability not in {"inspect", "edit", "ai_propose", "opaque"}:
        raise ScheduleError("invalid_capability", "Schedule能力状态无效。")
    if not points or len(points) > MAX_POINTS:
        raise ScheduleError("point_limit", "Schedule点数为空或超过资源上限。")
    previous = -1
    for point in points:
        if not 0 <= point.minute <= 1440:
            raise ScheduleError("time_out_of_range", "Schedule时间必须位于0到1440分钟。")
        if point.minute <= previous:
            raise ScheduleError("non_monotonic_time", "Schedule时间点必须严格递增且不重复。")
        if not math.isfinite(point.value) or abs(point.value) > 1e15:
            raise ScheduleError("value_out_of_range", "Schedule值必须是有限且有界数字。")
        previous = point.minute
    if points[0].minute != 0 or points[-1].minute != 1440:
        raise ScheduleError("coverage_incomplete", "Schedule必须覆盖完整的午夜到午夜边界。")
    schedule_id = str(uuid5(NAMESPACE_URL, f"contam-studio:{baseline_sha256}:day-schedule:{number}:{label}"))
    return DaySchedule(schedule_id, label, unit, "minutes_since_midnight", interpolation, points, capability, _evidence(schedule_id, label, points))


def make_week_schedule(
    baseline_sha256: str,
    number: int,
    label: str,
    day_schedule_ids: tuple[str, ...],
    known_day_ids: frozenset[str],
    *,
    capability: str = "inspect",
) -> WeekSchedule:
    if len(day_schedule_ids) != 7:
        raise ScheduleError("day_type_count", "Week schedule必须明确提供7个day type。")
    if any(identifier not in known_day_ids for identifier in day_schedule_ids):
        raise ScheduleError("stale_schedule_reference", "Week schedule引用了不存在的day schedule。")
    if not label or len(label) > 80 or not label.isascii() or any(character.isspace() for character in label):
        raise ScheduleError("invalid_schedule_label", "Week schedule名称无效。")
    schedule_id = str(uuid5(NAMESPACE_URL, f"contam-studio:{baseline_sha256}:week-schedule:{number}:{label}"))
    return WeekSchedule(schedule_id, label, day_schedule_ids, capability, _evidence(schedule_id, label, tuple()))


def page_day_schedule(schedule: DaySchedule, *, cursor: str | None = None, limit: int = 128) -> SchedulePage:
    if not 1 <= limit <= 512:
        raise ScheduleError("invalid_page_limit", "Schedule分页大小超出限制。")
    binding = hashlib.sha256(schedule.schedule_id.encode("ascii")).hexdigest()[:24]
    start = 0
    if cursor is not None:
        prefix, _, offset_token = cursor.partition(":")
        if prefix != binding or not offset_token.isdigit():
            raise ScheduleError("stale_cursor", "Schedule分页游标已失效。")
        start = int(offset_token)
        if start < 0 or start >= len(schedule.points):
            raise ScheduleError("stale_cursor", "Schedule分页游标超出当前Revision。")
    end = min(start + limit, len(schedule.points))
    next_cursor = None if end == len(schedule.points) else f"{binding}:{end}"
    return SchedulePage(schedule.schedule_id, cursor, next_cursor, schedule.points[start:end])
