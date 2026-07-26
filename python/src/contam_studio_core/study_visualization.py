"""Deterministic, evidence-bound data shaping for study charts and reports.

The module deliberately returns plain bounded dictionaries.  It does not invent
values: missing values remain missing and samples without a trusted result hash
are excluded from visual analysis.
"""
from __future__ import annotations

import math
from collections.abc import Mapping, Sequence


MAX_VISUAL_POINTS = 512
MAX_SERIES_POINTS = 2048


def _finite(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def _downsample[T](items: Sequence[T], limit: int) -> tuple[T, ...]:
    if len(items) <= limit:
        return tuple(items)
    # Stable endpoint-preserving stride.  The same result set always yields
    # the same points and the UI cannot be forced to render an unbounded set.
    stride = (len(items) - 1) / (limit - 1)
    indices = [round(index * stride) for index in range(limit)]
    return tuple(items[index] for index in indices)


def _trusted(result: Mapping[str, object]) -> bool:
    return result.get("status") == "succeeded" and isinstance(result.get("result_hash"), str) and len(result["result_hash"]) == 64


def _result_value(
    result: Mapping[str, object],
    metric: str,
    *,
    zone_id: str | None = None,
    time_seconds: float | None = None,
) -> tuple[float | None, str | None, float | None]:
    statistics = result.get("statistics")
    if not isinstance(statistics, Mapping):
        return None, None, None
    direct_zone = statistics.get("zone_id") if isinstance(statistics.get("zone_id"), str) else None
    direct_time = _finite(statistics.get("time_seconds"))
    direct = _finite(statistics.get(metric))
    if direct is not None and (zone_id is None or direct_zone == zone_id) and (time_seconds is None or direct_time == time_seconds):
        return direct, direct_zone, direct_time
    raw_series = statistics.get("series")
    if not isinstance(raw_series, Sequence) or isinstance(raw_series, (str, bytes)):
        return None, None, None
    values: list[float] = []
    first_zone: str | None = None
    first_time: float | None = None
    for raw in raw_series[:MAX_SERIES_POINTS]:
        if not isinstance(raw, Mapping):
            continue
        candidate_time = _finite(raw.get("time_seconds"))
        if candidate_time is None or (time_seconds is not None and candidate_time != time_seconds):
            continue
        candidate_zone = raw.get("zone_id", direct_zone)
        if zone_id is not None and candidate_zone != zone_id:
            continue
        value = _finite(raw.get(metric))
        if value is None:
            continue
        values.append(value)
        if first_zone is None:
            first_zone = candidate_zone if isinstance(candidate_zone, str) else None
            first_time = candidate_time
    if not values:
        return None, None, None
    return sum(values) / len(values), first_zone, first_time


def build_relation_points(
    results: Sequence[Mapping[str, object]],
    parameter_id: str,
    *,
    metric: str = "value",
    zone_id: str | None = None,
    time_seconds: float | None = None,
    limit: int = MAX_VISUAL_POINTS,
) -> tuple[dict[str, object], ...]:
    """Build a real parameter/result scatter dataset with evidence references."""
    if not parameter_id or not 1 <= limit <= MAX_VISUAL_POINTS:
        return ()
    candidates: list[dict[str, object]] = []
    for result in results:
        if not _trusted(result):
            continue
        parameters = result.get("parameters")
        if not isinstance(parameters, Mapping):
            continue
        x = _finite(parameters.get(parameter_id))
        y, candidate_zone, candidate_time = _result_value(
            result, metric, zone_id=zone_id, time_seconds=time_seconds
        )
        if x is None or y is None:
            continue
        candidates.append(
            {
                "sample_id": result.get("sample_id"),
                "x": x,
                "y": y,
                "parameter_id": parameter_id,
                "metric": metric,
                "zone_id": candidate_zone,
                "timestamp": candidate_time,
                "result_hash": result.get("result_hash"),
                "study_hash": result.get("study_hash"),
                "project_sha256": result.get("project_sha256"),
            }
        )
    candidates.sort(key=lambda item: (str(item["sample_id"]), float(item["x"]), float(item["y"])))
    return _downsample(candidates, limit)


def build_time_series(
    results: Sequence[Mapping[str, object]],
    *,
    metric: str = "temperature_k",
    sample_ids: set[str] | None = None,
    zone_ids: set[str] | None = None,
    limit: int = MAX_VISUAL_POINTS,
) -> tuple[dict[str, object], ...]:
    """Flatten bounded SimRead series while preserving missing values as null."""
    if not 1 <= limit <= MAX_VISUAL_POINTS:
        return ()
    points: list[dict[str, object]] = []
    for result in results:
        if not _trusted(result):
            continue
        sample_id = result.get("sample_id")
        if not isinstance(sample_id, str) or (sample_ids is not None and sample_id not in sample_ids):
            continue
        statistics = result.get("statistics")
        if not isinstance(statistics, Mapping):
            continue
        raw_series = statistics.get("series")
        if not isinstance(raw_series, Sequence) or isinstance(raw_series, (str, bytes)):
            continue
        for raw in raw_series[:MAX_SERIES_POINTS]:
            if not isinstance(raw, Mapping):
                continue
            candidate_zone = raw.get("zone_id", statistics.get("zone_id"))
            if zone_ids is not None and candidate_zone not in zone_ids:
                continue
            time_seconds = _finite(raw.get("time_seconds"))
            if time_seconds is None:
                continue
            value = _finite(raw.get(metric))
            points.append(
                {
                    "sample_id": sample_id,
                    "zone_id": candidate_zone,
                    "metric": metric,
                    "time_seconds": time_seconds,
                    "value": value,
                    "result_hash": result.get("result_hash"),
                    "study_hash": result.get("study_hash"),
                    "project_sha256": result.get("project_sha256"),
                }
            )
    points.sort(key=lambda item: (str(item["sample_id"]), str(item.get("zone_id")), float(item["time_seconds"])))
    return _downsample(points, limit)


def visual_metrics(results: Sequence[Mapping[str, object]]) -> tuple[str, ...]:
    """Return only metrics present as finite values in trusted results."""
    known = ("value", "mean", "temperature_k", "reference_pressure_pa", "air_density_kg_m3", "flow_kg_s")
    return tuple(
        metric
        for metric in known
        if any(_result_value(result, metric)[0] is not None for result in results if _trusted(result))
    )
