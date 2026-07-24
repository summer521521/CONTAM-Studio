from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from statistics import fmean
from uuid import uuid4


MAX_RESULT_SAMPLES = 1_000_000
MAX_PAGE_SIZE = 512


class ResultError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class ResultSample:
    index: int
    object_id: str
    time_seconds: float
    value: float | None

    def to_dict(self) -> dict[str, object]:
        return {"index": self.index, "object_id": self.object_id, "time_seconds": self.time_seconds, "value": self.value}


@dataclass(frozen=True, slots=True)
class ResultRecord:
    result_id: str
    run_id: str
    scenario_id: str
    baseline_sha256: str
    revision_id: str
    profile: str
    result_type: str
    unit: str
    time_basis: str
    parser_identity: str
    calculator_version: str
    samples: tuple[ResultSample, ...]
    sha256: str
    status: str
    missing_policy: str

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": "trusted_result.v1",
            "result_id": self.result_id,
            "run_id": self.run_id,
            "scenario_id": self.scenario_id,
            "baseline_sha256": self.baseline_sha256,
            "revision_id": self.revision_id,
            "profile": self.profile,
            "result_type": self.result_type,
            "unit": self.unit,
            "time_basis": self.time_basis,
            "parser_identity": self.parser_identity,
            "calculator_version": self.calculator_version,
            "sample_count": len(self.samples),
            "sha256": self.sha256,
            "status": self.status,
            "missing_policy": self.missing_policy,
        }


@dataclass(frozen=True, slots=True)
class ResultPage:
    result_id: str
    cursor: str | None
    next_cursor: str | None
    samples: tuple[ResultSample, ...]

    def to_dict(self) -> dict[str, object]:
        return {"result_id": self.result_id, "cursor": self.cursor, "next_cursor": self.next_cursor, "samples": [item.to_dict() for item in self.samples]}


@dataclass(frozen=True, slots=True)
class ResultStatistics:
    result_id: str
    count: int
    missing_count: int
    minimum: float | None
    maximum: float | None
    mean: float | None
    first_min_index: int | None
    first_max_index: int | None
    calculator_version: str

    def to_dict(self) -> dict[str, object]:
        return {"result_id": self.result_id, "count": self.count, "missing_count": self.missing_count, "minimum": self.minimum, "maximum": self.maximum, "mean": self.mean, "first_min_index": self.first_min_index, "first_max_index": self.first_max_index, "calculator_version": self.calculator_version}


@dataclass(frozen=True, slots=True)
class ComparisonRecord:
    comparison_id: str
    a_result_id: str
    b_result_id: str
    unit: str
    values: tuple[tuple[int, float | None, float | None, float | None, float | None], ...]
    sign_policy: str
    percent_zero_policy: str
    missing_policy: str
    evidence_hash: str

    def to_dict(self) -> dict[str, object]:
        return {"schema_version": "comparison.v1", "comparison_id": self.comparison_id, "a_result_id": self.a_result_id, "b_result_id": self.b_result_id, "unit": self.unit, "values": [list(item) for item in self.values], "sign_policy": self.sign_policy, "percent_zero_policy": self.percent_zero_policy, "missing_policy": self.missing_policy, "evidence_hash": self.evidence_hash}


def create_result(*, run_id: str, scenario_id: str, baseline_sha256: str, revision_id: str, profile: str, result_type: str, unit: str, time_basis: str, parser_identity: str, calculator_version: str, samples: tuple[ResultSample, ...], missing_policy: str = "exclude_missing") -> ResultRecord:
    if not samples or len(samples) > MAX_RESULT_SAMPLES:
        raise ResultError("result_limit", "结果样本为空或超过上限。")
    if missing_policy not in {"exclude_missing", "preserve_missing"}:
        raise ResultError("invalid_missing_policy", "缺失值策略不受支持。")
    previous_index = -1
    for sample in samples:
        if sample.index <= previous_index or not math.isfinite(sample.time_seconds):
            raise ResultError("invalid_result_grid", "结果索引和时间网格必须严格递增且有限。")
        if sample.value is not None and not math.isfinite(sample.value):
            raise ResultError("invalid_result_value", "结果值必须是有限数字或明确缺失。")
        previous_index = sample.index
    result_id = str(uuid4())
    canonical = json.dumps([item.to_dict() for item in samples], ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return ResultRecord(result_id, run_id, scenario_id, baseline_sha256, revision_id, profile, result_type, unit, time_basis, parser_identity, calculator_version, samples, digest, "trusted", missing_policy)


def page_result(result: ResultRecord, *, cursor: str | None = None, limit: int = MAX_PAGE_SIZE) -> ResultPage:
    if not 1 <= limit <= MAX_PAGE_SIZE:
        raise ResultError("invalid_page_limit", "结果页大小超出限制。")
    binding = hashlib.sha256(f"{result.result_id}:{result.sha256}".encode("ascii")).hexdigest()[:24]
    start = 0
    if cursor is not None:
        prefix, _, token = cursor.partition(":")
        if prefix != binding or not token.isdigit():
            raise ResultError("stale_cursor", "结果游标不属于当前Result。")
        start = int(token)
        if start < 0 or start >= len(result.samples):
            raise ResultError("stale_cursor", "结果游标超出当前数据。")
    end = min(start + limit, len(result.samples))
    return ResultPage(result.result_id, cursor, None if end == len(result.samples) else f"{binding}:{end}", result.samples[start:end])


def compute_statistics(result: ResultRecord) -> ResultStatistics:
    values = [(sample.index, sample.value) for sample in result.samples if sample.value is not None]
    if not values:
        return ResultStatistics(result.result_id, 0, len(result.samples), None, None, None, None, None, result.calculator_version)
    minimum = min(value for _, value in values)
    maximum = max(value for _, value in values)
    return ResultStatistics(result.result_id, len(values), len(result.samples) - len(values), minimum, maximum, fmean(value for _, value in values), next(index for index, value in values if value == minimum), next(index for index, value in values if value == maximum), result.calculator_version)


def compare_results(a: ResultRecord, b: ResultRecord) -> ComparisonRecord:
    for field in ("baseline_sha256", "profile", "result_type", "unit", "time_basis", "parser_identity", "calculator_version"):
        if getattr(a, field) != getattr(b, field):
            raise ResultError("comparison_incompatible", f"Result的{field}不一致，禁止静默比较。")
    if len(a.samples) != len(b.samples) or any(x.time_seconds != y.time_seconds or x.object_id != y.object_id for x, y in zip(a.samples, b.samples, strict=True)):
        raise ResultError("comparison_grid_mismatch", "Result对象或时间网格不一致。")
    values: list[tuple[int, float | None, float | None, float | None, float | None]] = []
    for left, right in zip(a.samples, b.samples, strict=True):
        delta = None if left.value is None or right.value is None else right.value - left.value
        percent = None if delta is None or left.value == 0 else (delta / abs(left.value)) * 100.0
        values.append((left.index, left.value, right.value, delta, percent))
    comparison_id = str(uuid4())
    evidence_hash = hashlib.sha256(f"{comparison_id}:{a.sha256}:{b.sha256}".encode("ascii")).hexdigest()
    return ComparisonRecord(comparison_id, a.result_id, b.result_id, a.unit, tuple(values), "b_minus_a", "zero_is_null", "preserve_missing", evidence_hash)
