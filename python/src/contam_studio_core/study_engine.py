"""受控多参数研究、结果证据和报告核心。

该模块只处理结构化数据和拥有的研究目录。求解器由调用方显式注入，
因此离线测试可以使用确定性夹具，而生产路径仍必须走官方 ContamX/SimRead。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import csv
from datetime import datetime, timezone
import hashlib
import html
import itertools
import json
import math
import os
from pathlib import Path
import statistics
import threading
from typing import Callable, Iterable, Mapping, Sequence
from uuid import NAMESPACE_URL, uuid4, uuid5

from .study_visualization import build_relation_points, build_time_series


MAX_STUDY_CASES = 32
MAX_PARAMETER_COUNT = 16
MAX_RESULT_PAGE = 512
SUPPORTED_PARAMETER_TYPES = {
    "zone_volume_m3",
    "zone_name",
    "flow_path_multiplier",
    "schedule_value",
    "species_initial",
}
# These are the only parameter kinds for which the official runner currently
# has a verified byte-local semantic Patch. Schedule/Species remain visible in
# the domain model but fail closed before a runnable study is created.
EXECUTABLE_PARAMETER_TYPES = frozenset({"zone_volume_m3", "zone_name", "flow_path_multiplier"})
STUDY_MODES = {"single_scan", "cartesian", "user_combinations"}
SAMPLE_STATUSES = {"queued", "running", "succeeded", "failed", "cancelled"}
AGGREGATE_STATUSES = {"queued", "running", "succeeded", "failed", "cancelled", "partial"}


def _safe_storage_component(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 128
        or value in {".", ".."}
        or any(ch not in "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_" for ch in value)
    ):
        raise StudyError("storage_identifier_invalid", f"{label}标识无效。")
    return value


class StudyError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _canonical(value: object) -> bytes:
    return json.dumps(
        value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def _sha(value: object) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _hash(value: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(ch not in "0123456789abcdefABCDEF" for ch in value)
    ):
        raise StudyError("hash_invalid", "项目或研究哈希必须是SHA-256。")
    return value.lower()


def _finite(value: object, code: str = "parameter_invalid") -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
    ):
        raise StudyError(code, "参数必须是有限数字。")
    return float(value)


@dataclass(frozen=True, slots=True)
class StudyParameter:
    parameter_id: str
    parameter_type: str
    object_id: str
    name: str
    unit: str | None = None
    minimum: float | None = None
    maximum: float | None = None
    step: float | None = None
    discrete_values: tuple[str | float, ...] = ()
    default_value: str | float | None = None

    def __post_init__(self) -> None:
        if not self.parameter_id or len(self.parameter_id) > 80 or not self.parameter_id.isascii():
            raise StudyError("parameter_id_invalid", "参数ID无效。")
        if self.parameter_type not in SUPPORTED_PARAMETER_TYPES:
            raise StudyError("unsupported_parameter", "该参数类型尚未接入安全语义Patch。")
        if (
            not self.object_id
            or len(self.object_id) > 160
            or "\\" in self.object_id
            or "/" in self.object_id
        ):
            raise StudyError("object_id_invalid", "参数对象ID无效。")
        if not self.name or len(self.name) > 160:
            raise StudyError("parameter_name_invalid", "参数名称无效。")
        numeric = self.parameter_type != "zone_name"
        if numeric:
            if self.unit is None or self.unit == "":
                raise StudyError("unit_required", "数值参数必须声明单位。")
            if self.discrete_values:
                values = tuple(_finite(value) for value in self.discrete_values)
                if len(set(values)) != len(values):
                    raise StudyError("duplicate_parameter_value", "离散参数值不能重复。")
                object.__setattr__(self, "discrete_values", values)
            else:
                minimum = _finite(self.minimum)
                maximum = _finite(self.maximum)
                step = _finite(self.step)
                if minimum > maximum or step <= 0 or maximum - minimum > 1e12:
                    raise StudyError("parameter_bounds_invalid", "参数边界或步长无效。")
                object.__setattr__(self, "minimum", minimum)
                object.__setattr__(self, "maximum", maximum)
                object.__setattr__(self, "step", step)
            if self.default_value is not None:
                _finite(self.default_value)
        else:
            if self.unit not in (None, ""):
                raise StudyError("unit_mismatch", "Zone名称不接受数值单位。")
            values = tuple(
                value
                for value in self.discrete_values
                if isinstance(value, str) and 0 < len(value) <= 80
            )
            if len(values) != len(self.discrete_values) or len(set(values)) != len(values):
                raise StudyError("parameter_values_invalid", "名称离散值必须是唯一有界文本。")
            if not values:
                raise StudyError("parameter_values_required", "Zone名称必须提供离散候选值。")
            object.__setattr__(self, "discrete_values", values)
            if self.default_value is not None and not isinstance(self.default_value, str):
                raise StudyError("parameter_default_invalid", "默认名称无效。")

    def values(self) -> tuple[str | float, ...]:
        if self.discrete_values:
            return self.discrete_values
        assert self.minimum is not None and self.maximum is not None and self.step is not None
        values: list[float] = []
        value = self.minimum
        for _ in range(MAX_STUDY_CASES + 1):
            if value > self.maximum + max(1e-12, abs(self.step) * 1e-9):
                break
            values.append(round(value, 12))
            value += self.step
        if not values or values[-1] < self.maximum - max(1e-12, abs(self.step) * 1e-9):
            if self.maximum not in values:
                values.append(self.maximum)
        if len(values) > MAX_STUDY_CASES:
            raise StudyError("combination_limit", "参数扫描组合数超过受控上限。")
        return tuple(values)

    def to_dict(self) -> dict[str, object]:
        return {
            "parameter_id": self.parameter_id,
            "parameter_type": self.parameter_type,
            "object_id": self.object_id,
            "name": self.name,
            "unit": self.unit,
            "minimum": self.minimum,
            "maximum": self.maximum,
            "step": self.step,
            "discrete_values": list(self.discrete_values),
            "default_value": self.default_value,
        }


@dataclass(frozen=True, slots=True)
class StudySample:
    sample_id: str
    ordinal: int
    values: Mapping[str, str | float]
    status: str = "queued"

    def __post_init__(self) -> None:
        if not self.sample_id or self.ordinal < 0 or self.status not in SAMPLE_STATUSES:
            raise StudyError("sample_invalid", "研究样本状态无效。")

    def to_dict(self) -> dict[str, object]:
        return {
            "sample_id": self.sample_id,
            "ordinal": self.ordinal,
            "values": dict(self.values),
            "status": self.status,
        }


@dataclass(frozen=True, slots=True)
class StudyPlan:
    study_id: str
    baseline_project_sha256: str
    revision_id: str
    parameters: tuple[StudyParameter, ...]
    mode: str
    samples: tuple[StudySample, ...]
    study_hash: str
    patch_sha256: str | None = None
    max_combinations: int = MAX_STUDY_CASES
    created_at: str = ""

    def __post_init__(self) -> None:
        _hash(self.baseline_project_sha256)
        if self.mode not in STUDY_MODES or not self.samples:
            raise StudyError("study_invalid", "研究方案模式或样本无效。")
        if len(self.samples) > self.max_combinations or len(self.samples) > MAX_STUDY_CASES:
            raise StudyError("combination_limit", "研究组合数超过受控上限。")
        if self.patch_sha256 is not None:
            _hash(self.patch_sha256)

    def canonical_definition(self) -> dict[str, object]:
        return {
            "schema_version": "study_plan.v1",
            "baseline_project_sha256": self.baseline_project_sha256.lower(),
            "revision_id": self.revision_id,
            "patch_sha256": self.patch_sha256.lower() if self.patch_sha256 else None,
            "parameters": [item.to_dict() for item in self.parameters],
            "mode": self.mode,
            "combinations": [dict(item.values) for item in self.samples],
            "max_combinations": self.max_combinations,
        }

    def is_current(
        self, *, project_sha256: str, revision_id: str, patch_sha256: str | None = None
    ) -> bool:
        try:
            return (
                _hash(project_sha256) == self.baseline_project_sha256.lower()
                and revision_id == self.revision_id
                and (patch_sha256 or None) == self.patch_sha256
            )
        except StudyError:
            return False

    def to_dict(self) -> dict[str, object]:
        payload = self.canonical_definition()
        payload.pop("combinations", None)
        payload.update(
            {
                "study_id": self.study_id,
                "study_hash": self.study_hash,
                "created_at": self.created_at,
                "samples": [item.to_dict() for item in self.samples],
            }
        )
        return payload


def _sample_values(parameter: StudyParameter, value: object) -> str | float:
    if parameter.parameter_type == "zone_name":
        if not isinstance(value, str) or value not in parameter.discrete_values:
            raise StudyError("parameter_value_invalid", "名称值不在已声明的离散集合中。")
        return value
    number = _finite(value, "parameter_value_invalid")
    if parameter.discrete_values:
        values = tuple(float(item) for item in parameter.discrete_values)
        if number not in values:
            raise StudyError("parameter_value_invalid", "数值不在已声明的离散集合中。")
    else:
        assert parameter.minimum is not None and parameter.maximum is not None
        if number < parameter.minimum or number > parameter.maximum:
            raise StudyError("parameter_value_out_of_bounds", "数值超出参数边界。")
    return number


def create_study_plan(
    *,
    baseline_project_sha256: str,
    revision_id: str,
    parameters: Sequence[StudyParameter],
    mode: str = "single_scan",
    user_combinations: Sequence[Mapping[str, object]] | None = None,
    patch_sha256: str | None = None,
    max_combinations: int = MAX_STUDY_CASES,
) -> StudyPlan:
    baseline = _hash(baseline_project_sha256)
    if not revision_id or len(revision_id) > 128 or "\\" in revision_id or "/" in revision_id:
        raise StudyError("revision_invalid", "Revision标识无效。")
    if mode not in STUDY_MODES:
        raise StudyError("study_mode_invalid", "研究组合模式不受支持。")
    if not 1 <= len(parameters) <= MAX_PARAMETER_COUNT or len(
        {item.parameter_id for item in parameters}
    ) != len(parameters):
        raise StudyError("parameter_count_invalid", "参数数量或ID重复。")
    if not 1 <= max_combinations <= MAX_STUDY_CASES:
        raise StudyError("combination_limit", "研究组合上限无效。")
    # Canonicalize parameter order so UI reordering cannot change the study
    # identity or sample enumeration. The ID is deterministic and already
    # bounded to the safe storage alphabet by the bridge contract.
    params = tuple(sorted(parameters, key=lambda item: item.parameter_id))
    unsupported = tuple(item.parameter_type for item in params if item.parameter_type not in EXECUTABLE_PARAMETER_TYPES)
    if unsupported:
        raise StudyError(
            "unsupported_parameter",
            "Schedule和Species参数尚未通过官方PRJ字节Patch验证，当前仅支持只读查看。",
        )
    targets = {(item.parameter_type, item.object_id) for item in params}
    if len(targets) != len(params):
        raise StudyError("duplicate_parameter_target", "同一对象的同一参数不能重复添加。")
    choices = [item.values() for item in params]
    combinations: list[dict[str, str | float]] = []
    if mode == "single_scan":
        if len(params) != 1:
            raise StudyError("single_scan_requires_one_parameter", "单参数扫描只能包含一个参数。")
        combinations = [
            {params[0].parameter_id: _sample_values(params[0], value)} for value in choices[0]
        ]
    elif mode == "cartesian":
        combinations = [
            {
                param.parameter_id: _sample_values(param, value)
                for param, value in zip(params, values, strict=True)
            }
            for values in itertools.product(*choices)
        ]
    else:
        if not user_combinations:
            raise StudyError("combinations_required", "用户组合模式必须提供组合列表。")
        expected = {item.parameter_id for item in params}
        for row in user_combinations:
            if set(row) != expected:
                raise StudyError("combination_invalid", "用户组合字段与参数定义不一致。")
            combinations.append(
                {
                    param.parameter_id: _sample_values(param, row[param.parameter_id])
                    for param in params
                }
            )
    if not combinations or len(combinations) > max_combinations:
        raise StudyError("combination_limit", "研究组合数超过受控上限。")
    definition = {
        "schema_version": "study_plan.v1",
        "baseline_project_sha256": baseline,
        "revision_id": revision_id,
        "patch_sha256": _hash(patch_sha256) if patch_sha256 else None,
        "parameters": [item.to_dict() for item in params],
        "mode": mode,
        "combinations": combinations,
        "max_combinations": max_combinations,
    }
    study_hash = _sha(definition)
    study_id = str(uuid5(NAMESPACE_URL, f"contam-studio:study:{study_hash}"))
    samples = tuple(
        StudySample(str(uuid5(NAMESPACE_URL, f"{study_hash}:sample:{index}")), index, row)
        for index, row in enumerate(combinations)
    )
    return StudyPlan(
        study_id,
        baseline,
        revision_id,
        params,
        mode,
        samples,
        study_hash,
        _hash(patch_sha256) if patch_sha256 else None,
        max_combinations,
        datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


@dataclass(frozen=True, slots=True)
class StudySampleResult:
    study_id: str
    study_hash: str
    sample_id: str
    status: str
    parameters: Mapping[str, str | float]
    project_sha256: str
    solver_manifest: Mapping[str, str]
    statistics: Mapping[str, object] = field(default_factory=dict)
    result_hash: str | None = None
    error: Mapping[str, str] | None = None
    generated_at: str = ""
    provenance: str = "synthetic fixture"
    evidence: tuple[Mapping[str, object], ...] = ()
    attempt_id: str | None = None

    def __post_init__(self) -> None:
        if self.status not in SAMPLE_STATUSES:
            raise StudyError("sample_status_invalid", "样本状态无效。")
        _hash(self.study_hash)
        _hash(self.project_sha256)
        if self.result_hash is not None:
            _hash(self.result_hash)
        if self.provenance not in {
            "synthetic fixture",
            "official tool result",
            "user project result",
        }:
            raise StudyError("provenance_invalid", "结果来源标识无效。")
        if self.attempt_id is not None:
            _safe_storage_component(self.attempt_id, "运行尝试")
        raw_series = self.statistics.get("series") if isinstance(self.statistics, Mapping) else None
        if raw_series is not None:
            if not isinstance(raw_series, Sequence) or isinstance(raw_series, (str, bytes)) or len(raw_series) > 512:
                raise StudyError("series_limit", "时间序列超过单样本资源上限。")
            for point in raw_series:
                if not isinstance(point, Mapping):
                    raise StudyError("series_invalid", "时间序列点必须是结构化对象。")
                timestamp = point.get("time_seconds")
                if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(float(timestamp)):
                    raise StudyError("series_invalid", "时间序列时间必须是有限数字。")
                for key, value in point.items():
                    if key in {"zone_id", "metric"}:
                        continue
                    if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value))):
                        raise StudyError("series_invalid", "时间序列值必须是有限数字或明确缺失。")

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": "study_sample_result.v1",
            "study_id": self.study_id,
            "study_hash": self.study_hash,
            "sample_id": self.sample_id,
            "status": self.status,
            "parameters": dict(self.parameters),
            "project_sha256": self.project_sha256,
            "solver_manifest": dict(self.solver_manifest),
            "statistics": dict(self.statistics),
            "result_hash": self.result_hash,
            "error": dict(self.error) if self.error else None,
            "generated_at": self.generated_at,
            "provenance": self.provenance,
            "evidence": [dict(item) for item in self.evidence],
            "attempt_id": self.attempt_id,
        }


def aggregate_study_status(results: Iterable[StudySampleResult], total: int) -> str:
    items = list(results)
    if total <= 0:
        return "queued"
    if not items or all(item.status == "queued" for item in items):
        return "queued"
    if any(item.status == "running" for item in items):
        return "running"
    if len(items) < total:
        return "running"
    statuses = {item.status for item in items}
    if statuses == {"succeeded"}:
        return "succeeded"
    if statuses == {"cancelled"}:
        return "cancelled"
    if statuses == {"failed"}:
        return "failed"
    return "partial"


class StudyResultStore:
    """拥有目录中的不可覆盖研究结果存储。"""

    def __init__(self, root: Path) -> None:
        self.root = Path(root).expanduser().resolve()
        self._lock = threading.RLock()
        self.root.mkdir(parents=True, exist_ok=True)

    def _commit_exclusive(self, target: Path, payload: bytes) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.with_name(f".{target.name}.{uuid4().hex}.tmp")
        try:
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            try:
                os.link(temp, target)
            except FileExistsError as error:
                raise StudyError("result_exists", "研究结果目标已存在，拒绝覆盖。") from error
            except OSError as error:
                if target.exists():
                    raise StudyError("result_exists", "研究结果目标已存在，拒绝覆盖。") from error
                fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "wb") as handle:
                    handle.write(payload)
                    handle.flush()
                    os.fsync(handle.fileno())
        except FileExistsError as error:
            raise StudyError("result_exists", "研究结果目标已存在，拒绝覆盖。") from error
        except OSError as error:
            raise StudyError("result_commit_failed", "研究结果无法安全提交。") from error
        finally:
            try:
                temp.unlink()
            except OSError:
                pass

    def save_plan(self, plan: StudyPlan) -> Path:
        _safe_storage_component(plan.study_id, "研究")
        target = self.root / "studies" / f"{plan.study_id}.json"
        self._commit_exclusive(target, _canonical(plan.to_dict()))
        return target

    def save_result(self, result: StudySampleResult) -> Path:
        _safe_storage_component(result.study_id, "研究")
        _safe_storage_component(result.sample_id, "样本")
        suffix = f"-{result.attempt_id}" if result.attempt_id else ""
        target = self.root / "studies" / result.study_id / "results" / f"{result.sample_id}{suffix}.json"
        self._commit_exclusive(target, _canonical(result.to_dict()))
        return target

    def read_plan(self, study_id: str) -> StudyPlan:
        _safe_storage_component(study_id, "研究")
        path = self.root / "studies" / f"{study_id}.json"
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise StudyError("study_not_found", "研究方案不存在或损坏。") from error
        params = tuple(StudyParameter(**item) for item in raw["parameters"])
        samples = tuple(
            StudySample(
                item["sample_id"],
                int(item["ordinal"]),
                item["values"],
                item.get("status", "queued"),
            )
            for item in raw["samples"]
        )
        plan = StudyPlan(
            raw["study_id"],
            raw["baseline_project_sha256"],
            raw["revision_id"],
            params,
            raw["mode"],
            samples,
            raw["study_hash"],
            raw.get("patch_sha256"),
            int(raw.get("max_combinations", MAX_STUDY_CASES)),
            raw.get("created_at", ""),
        )
        if plan.study_hash != _sha(plan.canonical_definition()):
            raise StudyError("study_hash_mismatch", "研究方案哈希校验失败。")
        return plan

    def page_results(
        self,
        study_id: str,
        *,
        plan_hash: str | None = None,
        page: int = 0,
        limit: int = MAX_RESULT_PAGE,
        parameter: str | None = None,
        value: str | float | None = None,
        object_id: str | None = None,
        time_seconds: float | None = None,
        sort_by: str = "sample_id",
        descending: bool = False,
    ) -> dict[str, object]:
        if not 0 <= page or not 1 <= limit <= MAX_RESULT_PAGE:
            raise StudyError("page_invalid", "结果分页参数无效。")
        if sort_by not in {
            "sample_id",
            "status",
            "generated_at",
            "value",
            "mean",
            "time_seconds",
            "parameter",
        }:
            raise StudyError("sort_invalid", "结果排序字段不受支持。")
        _safe_storage_component(study_id, "研究")
        plan = self.read_plan(study_id)
        stale = plan_hash is not None and plan_hash != plan.study_hash
        paths = sorted((self.root / "studies" / study_id / "results").glob("*.json"))
        latest: dict[str, tuple[tuple[str, str], dict[str, object]]] = {}
        for path in paths:
            try:
                item = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            sample_id = item.get("sample_id")
            if not isinstance(sample_id, str):
                continue
            if parameter is not None and item.get("parameters", {}).get(parameter) != value:
                continue
            if object_id is not None and object_id not in json.dumps(
                item.get("statistics", {}), ensure_ascii=False
            ):
                continue
            if (
                time_seconds is not None
                and item.get("statistics", {}).get("time_seconds") != time_seconds
            ):
                continue
            marker = (str(item.get("generated_at", "")), path.name)
            previous = latest.get(sample_id)
            if previous is None or marker >= previous[0]:
                latest[sample_id] = (marker, item)
        rows = [item for _, item in latest.values()]
        def sort_key(item: Mapping[str, object]) -> tuple[int, float | str]:
            if sort_by in {"value", "mean", "time_seconds"}:
                raw: object = item.get("statistics", {}).get(sort_by)
                if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                    return (0, float(raw))
                return (1, "")
            if sort_by == "parameter":
                raw = item.get("parameters", {})
                value = next(iter(raw.values()), "") if isinstance(raw, Mapping) else ""
            else:
                value = item.get(sort_by, item.get("sample_id", ""))
            return (0, str(value))

        rows.sort(key=sort_key, reverse=descending)
        start = page * limit
        return {
            "study_id": study_id,
            "study_hash": plan.study_hash,
            "project_sha256": plan.baseline_project_sha256,
            "stale": stale,
            "page": page,
            "limit": limit,
            "total": len(rows),
            "items": rows[start : start + limit],
        }


def _evidence_for(result: StudySampleResult) -> tuple[dict[str, object], ...]:
    return tuple(
        item
        for item in result.evidence
        if item.get("sample_id") == result.sample_id
        and item.get("result_hash") == result.result_hash
    )


def analyze_study_results(
    results: Sequence[StudySampleResult], *, baseline_sample_id: str | None = None
) -> dict[str, object]:
    trusted = [
        item
        for item in results
        if item.status == "succeeded" and item.result_hash and _evidence_for(item)
    ]
    if not trusted:
        raise StudyError(
            "evidence_insufficient", "没有带完整证据引用的成功样本，不能生成仿真结论。"
        )
    values: list[tuple[StudySampleResult, float]] = []
    for item in trusted:
        raw = item.statistics.get("value", item.statistics.get("mean"))
        if isinstance(raw, (int, float)) and math.isfinite(float(raw)):
            values.append((item, float(raw)))
    if not values:
        raise StudyError("evidence_insufficient", "成功样本没有可比较的有限结果值。")
    minimum_item, minimum = min(values, key=lambda pair: pair[1])
    maximum_item, maximum = max(values, key=lambda pair: pair[1])
    mean = statistics.fmean(value for _, value in values)
    spread = maximum - minimum
    baseline = next((item for item in trusted if item.sample_id == baseline_sample_id), trusted[0])
    baseline_value = next(value for item, value in values if item.sample_id == baseline.sample_id)

    def evidence(item: StudySampleResult, *, timestamp: object | None = None, metric: str = "value") -> dict[str, object]:
        return {
            "sample_id": item.sample_id,
            "parameter_values": dict(item.parameters),
            "result_hash": item.result_hash,
            "zone_id": item.statistics.get("zone_id"),
            "metric": metric,
            "timestamp": item.statistics.get("time_seconds") if timestamp is None else timestamp,
        }

    conclusions = [
        {
            "kind": "minimum",
            "text": f"最低值为{minimum:g}，来自样本{minimum_item.sample_id}。",
            "evidence": [evidence(minimum_item)],
        },
        {
            "kind": "maximum",
            "text": f"最高值为{maximum:g}，来自样本{maximum_item.sample_id}。",
            "evidence": [evidence(maximum_item)],
        },
        {
            "kind": "baseline_delta",
            "text": f"基准样本与研究范围的最大绝对差为{max(abs(minimum - baseline_value), abs(maximum - baseline_value)):g}。",
            "evidence": [evidence(baseline), evidence(minimum_item), evidence(maximum_item)],
        },
    ]
    # A bounded, descriptive influence signal is useful for research review,
    # but is deliberately labelled correlation rather than causal impact.
    influence: list[tuple[str, float, list[StudySampleResult]]] = []
    def numeric(value: object) -> float | None:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        number = float(value)
        return number if math.isfinite(number) else None

    for parameter in sorted({key for item in trusted for key in item.parameters}):
        pairs = [
            (numeric(item.parameters.get(parameter)), value, item)
            for item, value in values
            if numeric(item.parameters.get(parameter)) is not None
        ]
        if len(pairs) < 2 or len({pair[0] for pair in pairs}) < 2:
            continue
        x_mean = statistics.fmean(float(pair[0]) for pair in pairs)
        y_mean = statistics.fmean(pair[1] for pair in pairs)
        numerator = sum((float(x) - x_mean) * (y - y_mean) for x, y, _ in pairs)
        x_denominator = math.sqrt(sum((float(x) - x_mean) ** 2 for x, _, _ in pairs))
        y_denominator = math.sqrt(sum((y - y_mean) ** 2 for _, y, _ in pairs))
        if x_denominator == 0 or y_denominator == 0:
            continue
        correlation = numerator / (x_denominator * y_denominator)
        influence.append((parameter, correlation, [pair[2] for pair in pairs]))
    if influence:
        parameter, correlation, witnesses = max(influence, key=lambda item: (abs(item[1]), item[0]))
        witness_evidence = [evidence(item) for item in sorted(witnesses, key=lambda item: item.sample_id)[:8]]
        conclusions.append(
            {
                "kind": "parameter_influence",
                "text": f"参数{parameter}与value呈现相关性（r={correlation:.3f}）；这不是因果关系。",
                "evidence": witness_evidence,
            }
        )
    series_points = build_time_series([item.to_dict() for item in trusted], limit=MAX_RESULT_PAGE)
    if series_points:
        finite_points = [item for item in series_points if isinstance(item.get("value"), (int, float))]
        if finite_points:
            peak = max(finite_points, key=lambda item: float(item["value"]))
            peak_result = next((item for item in trusted if item.sample_id == peak.get("sample_id")), None)
            if peak_result is not None:
                conclusions.append(
                    {
                        "kind": "time_peak",
                        "text": f"时间序列峰值为{float(peak['value']):g}，位于{float(peak['time_seconds']):g}s；缺失值未被当作零。",
                        "evidence": [evidence(peak_result, timestamp=peak.get("time_seconds"), metric="temperature_k")],
                    }
                )
    return {
        "schema_version": "study_analysis.v1",
        "sample_count": len(values),
        "mean": mean,
        "minimum": minimum,
        "maximum": maximum,
        "spread": spread,
        "conclusions": conclusions,
        "limitations": ["相关性不等于因果关系。", "仅分析带有可信结果哈希和样本证据的成功样本。"],
        "trace": {
            "evidence_refs": [evidence(item) for item, _ in values],
            "analysis_hash": _sha([item.to_dict() for item, _ in values]),
        },
    }


@dataclass(frozen=True, slots=True)
class StudyReportModel:
    report_id: str
    study_id: str
    study_hash: str
    project_sha256: str
    solver_manifest: Mapping[str, str]
    parameters: tuple[Mapping[str, object], ...]
    results: tuple[StudySampleResult, ...]
    analysis: Mapping[str, object] | None
    generated_at: str
    provenance: str
    report_title: str = "CONTAM Studio Study Report"

    def to_dict(self) -> dict[str, object]:
        counts = {
            status: sum(1 for item in self.results if item.status == status)
            for status in sorted(SAMPLE_STATUSES)
        }
        return {
            "schema_version": "study_report.v1",
            "report_id": self.report_id,
            "study_id": self.study_id,
            "study_hash": self.study_hash,
            "project_sha256": self.project_sha256,
            "solver_manifest": dict(self.solver_manifest),
            "parameters": [dict(item) for item in self.parameters],
            "status_counts": counts,
            "results": [item.to_dict() for item in self.results],
            "analysis": dict(self.analysis) if self.analysis else None,
            "generated_at": self.generated_at,
            "provenance": self.provenance,
            "report_title": self.report_title,
        }


def make_study_report(
    *,
    plan: StudyPlan,
    results: Sequence[StudySampleResult],
    solver_manifest: Mapping[str, str],
    analysis: Mapping[str, object] | None = None,
    provenance: str = "synthetic fixture",
) -> StudyReportModel:
    if provenance not in {"synthetic fixture", "official tool result", "user project result"}:
        raise StudyError("provenance_invalid", "报告来源标识无效。")
    return StudyReportModel(
        str(uuid4()),
        plan.study_id,
        plan.study_hash,
        plan.baseline_project_sha256,
        dict(sorted(solver_manifest.items())),
        tuple(item.to_dict() for item in plan.parameters),
        tuple(results),
        analysis,
        datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        provenance,
    )


def render_study_report_html(model: StudyReportModel) -> str:
    payload = json.dumps(model.to_dict(), ensure_ascii=False, sort_keys=True, indent=2)
    rows = "".join(
        f"<tr><td>{html.escape(item.sample_id)}</td><td>{html.escape(item.status)}</td><td>{html.escape(json.dumps(dict(item.parameters), ensure_ascii=False))}</td><td>{html.escape(str(item.statistics.get('value', '')))}</td><td>{html.escape(item.result_hash or '')}</td></tr>"
        for item in model.results
    )
    parameter_id = str(model.parameters[0].get("parameter_id", "")) if model.parameters else ""
    relation = build_relation_points([item.to_dict() for item in model.results], parameter_id)
    series = build_time_series([item.to_dict() for item in model.results])

    def svg(points: Sequence[Mapping[str, object]], x_key: str, y_key: str, title: str) -> str:
        finite = [item for item in points if isinstance(item.get(x_key), (int, float)) and isinstance(item.get(y_key), (int, float))]
        if not finite:
            return f"<section><h3>{html.escape(title)}</h3><svg viewBox='0 0 560 120' role='img' aria-label='{html.escape(title)}'><text x='30' y='62'>证据不足：没有可绘制的可信结果。</text></svg></section>"
        xs = [float(item[x_key]) for item in finite]
        ys = [float(item[y_key]) for item in finite]
        xmin, xmax = min(xs), max(xs)
        ymin, ymax = min(ys), max(ys)
        dx = xmax - xmin or 1.0
        dy = ymax - ymin or 1.0
        coords = " ".join(f"{30 + (float(item[x_key]) - xmin) / dx * 500:.1f},{170 - (float(item[y_key]) - ymin) / dy * 130:.1f}" for item in finite)
        return f"<section><h3>{html.escape(title)}</h3><svg viewBox='0 0 560 200' role='img' aria-label='{html.escape(title)}'><rect x='30' y='20' width='500' height='150' fill='none' stroke='#778899'/><polyline points='{coords}' fill='none' stroke='#1769c2' stroke-width='2'/></svg><p>数据点：{len(finite)}；结果哈希由每个样本单独绑定。</p></section>"

    return f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(model.report_title)}</title><style>body{{font-family:system-ui,sans-serif;margin:32px;color:#18212b}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #cfd6de;padding:6px;text-align:left}}svg{{max-width:100%;height:auto;background:#f7f9fb}}.meta{{font-family:monospace}}</style></head><body><h1>{html.escape(model.report_title)}</h1><p>来源：{html.escape(model.provenance)}</p><p class='meta'>项目哈希：{html.escape(model.project_sha256)}<br/>研究哈希：{html.escape(model.study_hash)}</p>{svg(relation, 'x', 'y', '参数关系图')}{svg(series, 'time_seconds', 'value', '时间序列图')}<table><thead><tr><th>样本</th><th>状态</th><th>参数</th><th>value</th><th>结果哈希</th></tr></thead><tbody>{rows}</tbody></table><h2>结构化数据</h2><pre>{html.escape(payload)}</pre></body></html>"


def render_study_report_csv(model: StudyReportModel) -> str:
    from io import StringIO

    output = StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "study_id",
            "study_hash",
            "sample_id",
            "status",
            "parameters",
            "value",
            "result_hash",
            "provenance",
        ]
    )
    for item in model.results:
        writer.writerow(
            [
                model.study_id,
                model.study_hash,
                item.sample_id,
                item.status,
                json.dumps(dict(item.parameters), ensure_ascii=False, sort_keys=True),
                item.statistics.get("value", ""),
                item.result_hash or "",
                item.provenance,
            ]
        )
    return output.getvalue()


def render_study_report_pdf(model: StudyReportModel) -> bytes:
    records = [item.to_dict() for item in model.results]
    parameter_id = str(model.parameters[0].get("parameter_id", "")) if model.parameters else ""
    relation = build_relation_points(records, parameter_id)
    series = build_time_series(records)

    def text(value: object, x: float, y: float, size: float = 9) -> str:
        value_text = str(value).replace("\n", " ")[:240]
        chunks: list[tuple[str, bool]] = []
        for character in value_text:
            is_cjk = ord(character) > 127
            if chunks and chunks[-1][1] == is_cjk:
                chunks[-1] = (chunks[-1][0] + character, is_cjk)
            else:
                chunks.append((character, is_cjk))
        commands: list[str] = []
        cursor = x
        for chunk, is_cjk in chunks:
            if is_cjk:
                encoded = chunk.encode("utf-16-be").hex().upper()
                commands.append(f"BT /F1 {size:g} Tf 1 0 0 1 {cursor:g} {y:g} Tm <FEFF{encoded}> Tj ET\n")
                cursor += len(chunk) * size
            else:
                escaped = chunk.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
                commands.append(f"BT /F2 {size:g} Tf 1 0 0 1 {cursor:g} {y:g} Tm ({escaped}) Tj ET\n")
                cursor += len(chunk) * size * 0.52
        return "".join(commands)

    def wrap_text(value: object, max_width: float, size: float, max_lines: int = 2) -> list[str]:
        """Wrap mixed CJK/ASCII text before placing it in the fixed PDF page."""
        value_text = str(value).replace("\n", " ")[:480]
        lines: list[str] = []
        current: list[str] = []
        width = 0.0
        for character in value_text:
            character_width = size if ord(character) > 127 else size * 0.52
            if current and width + character_width > max_width:
                lines.append("".join(current))
                if len(lines) >= max_lines:
                    break
                current = []
                width = 0.0
            current.append(character)
            width += character_width
        if len(lines) < max_lines and current:
            lines.append("".join(current))
        if not lines:
            lines = [""]
        if len(lines) == max_lines and sum(len(item) for item in lines) < len(value_text):
            lines[-1] = lines[-1].rstrip() + "..."
        return lines

    def chart(points: Sequence[Mapping[str, object]], x_key: str, y_key: str, x: float, y: float, width: float, height: float, title: str) -> str:
        commands = [f"0.35 0.42 0.50 RG 0.8 w {x:g} {y:g} {width:g} {height:g} re S\n", text(title, x, y + height + 14, 10)]
        finite = [item for item in points if isinstance(item.get(x_key), (int, float)) and isinstance(item.get(y_key), (int, float))]
        if not finite:
            commands.append(text("证据不足：没有可绘制的可信结果。", x + 8, y + height / 2, 8))
            return "".join(commands)
        xs = [float(item[x_key]) for item in finite]
        ys = [float(item[y_key]) for item in finite]
        xmin, xmax = min(xs), max(xs)
        ymin, ymax = min(ys), max(ys)
        dx = xmax - xmin or 1.0
        dy = ymax - ymin or 1.0
        commands.append("0.09 0.41 0.76 RG 1.4 w\n")
        for index, item in enumerate(finite):
            px = x + (float(item[x_key]) - xmin) / dx * width
            py = y + (float(item[y_key]) - ymin) / dy * height
            commands.append(f"{px - 1:.2f} {py - 1:.2f} 2 2 re f\n")
            if index > 0:
                previous = finite[index - 1]
                ppx = x + (float(previous[x_key]) - xmin) / dx * width
                ppy = y + (float(previous[y_key]) - ymin) / dy * height
                commands.append(f"{ppx:.2f} {ppy:.2f} m {px:.2f} {py:.2f} l S\n")
        commands.extend([text(f"x: {xmin:g} .. {xmax:g}", x, y - 14, 7), text(f"y: {ymin:g} .. {ymax:g}", x + width - 120, y - 14, 7)])
        return "".join(commands)

    pages: list[str] = []
    status_counts = {status: sum(1 for item in model.results if item.status == status) for status in sorted(SAMPLE_STATUSES)}
    first_page = [
        text(model.report_title, 36, 756, 16),
        text(f"来源：{model.provenance}", 36, 736),
        text(f"项目哈希：{model.project_sha256}", 36, 716, 8),
        text(f"研究哈希：{model.study_hash}", 36, 700, 8),
        text(f"生成时间：{model.generated_at}", 36, 684, 8),
        text("样本状态：" + "；".join(f"{key}={value}" for key, value in status_counts.items()), 36, 662),
    ]
    parameter_pages: list[str] = []
    parameter_page = first_page + [text("参数定义", 36, 640, 11)]
    y_cursor = 618
    for parameter in model.parameters[:64]:
        summary = json.dumps(dict(parameter), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        wrapped = wrap_text(summary, 520, 7, max_lines=2)
        if y_cursor - len(wrapped) * 10 < 62:
            parameter_pages.append("".join(parameter_page))
            parameter_page = [text(model.report_title + " · 参数定义（续）", 36, 756, 14)]
            y_cursor = 720
        for line in wrapped:
            parameter_page.append(text(line, 42, y_cursor, 7))
            y_cursor -= 10
        y_cursor -= 3
    parameter_pages.append("".join(parameter_page))
    pages.extend(parameter_pages)

    relation_page = [
        text(model.report_title + " · 参数关系", 36, 756, 14),
        text(f"项目哈希：{model.project_sha256}", 36, 736, 8),
        text(f"研究哈希：{model.study_hash}", 36, 722, 8),
    ]
    relation_page.append(chart(relation, "x", "y", 36, 275, 540, 390, "参数关系图（真实结果）"))
    pages.append("".join(relation_page))

    second_page = [
        text(model.report_title + " · 时间序列", 36, 756, 14),
        text(f"项目哈希：{model.project_sha256}", 36, 736, 8),
        text(f"研究哈希：{model.study_hash}", 36, 722, 8),
        text("缺失值保持为空，不替换为零。时间单位：秒。", 36, 704, 9),
    ]
    second_page.append(chart(series, "time_seconds", "value", 36, 300, 540, 360, "时间序列图（SimRead结果）"))
    second_page.append(text(f"可信时间序列点数：{len(series)}", 36, 275, 9))
    if model.analysis:
        second_page.append(text("AI分析仅引用带结果哈希的证据；相关性不等于因果关系。", 36, 258, 8))
    pages.append("".join(second_page))
    for start in range(0, len(model.results), 20):
        chunk = model.results[start : start + 20]
        content = [text(model.report_title + " · 样本表", 36, 756, 14), text("sample_id | status | parameters | value | result_hash", 36, 732, 8)]
        y = 712
        for item in chunk:
            row = f"{item.sample_id[:12]} | {item.status} | {json.dumps(dict(item.parameters), ensure_ascii=False, separators=(',', ':'))} | {item.statistics.get('value', '')} | {(item.result_hash or '')[:16]}"
            for line in wrap_text(row, 540, 7, max_lines=2):
                content.append(text(line, 36, y, 7))
                y -= 9
            y -= 17
        pages.append("".join(content))

    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [] /Count 0 >>",
        b"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>",
        b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    page_ids: list[int] = []
    for content in pages:
        page_id = len(objects) + 1
        content_id = page_id + 1
        page_ids.append(page_id)
        stream = content.encode("ascii")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 5 0 R >> >> /Contents {content_id} 0 R >>".encode("ascii"))
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {len(page_ids)} >>".encode("ascii")
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    output.extend("".join(f"{offset:010d} 00000 n \n" for offset in offsets[1:]).encode("ascii"))
    output.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii"))
    return bytes(output)


def write_study_report(model: StudyReportModel, output: Path) -> Path:
    target = Path(output).expanduser().resolve()
    if target.suffix.lower() not in {".html", ".pdf", ".csv", ".json"}:
        raise StudyError("report_output_invalid", "研究报告格式必须是HTML、PDF、CSV或JSON。")
    if target.exists():
        raise StudyError("report_exists", "报告目标已存在，拒绝覆盖。")
    content: bytes
    if target.suffix.lower() == ".html":
        content = render_study_report_html(model).encode("utf-8")
    elif target.suffix.lower() == ".csv":
        content = render_study_report_csv(model).encode("utf-8")
    elif target.suffix.lower() == ".pdf":
        content = render_study_report_pdf(model)
    else:
        content = json.dumps(model.to_dict(), ensure_ascii=False, sort_keys=True, indent=2).encode(
            "utf-8"
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(f".{target.name}.{uuid4().hex}.tmp")
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temp, target)
        except FileExistsError as error:
            raise StudyError("report_exists", "报告目标已存在，拒绝覆盖。") from error
        except OSError as error:
            if target.exists():
                raise StudyError("report_exists", "报告目标已存在，拒绝覆盖。") from error
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
    except OSError as error:
        if isinstance(error, StudyError):
            raise
        raise StudyError("report_commit_failed", "研究报告无法安全提交。") from error
    finally:
        try:
            temp.unlink()
        except OSError:
            pass
    return target


class StudyExecutor:
    """确定性批量状态机；runner 必须由官方工具生产路径提供。"""

    def __init__(
        self,
        plan: StudyPlan,
        *,
        workspace_root: Path,
        runner: Callable[[StudySample, Path], Mapping[str, object]] | None = None,
    ) -> None:
        self.plan = plan
        self.workspace_root = Path(workspace_root).resolve()
        self.runner = runner
        self._cancel = threading.Event()
        self._pause = threading.Event()
        self.results: list[StudySampleResult] = []

    def pause(self) -> None:
        self._pause.set()

    def resume(self) -> None:
        self._pause.clear()

    def cancel(self) -> None:
        self._cancel.set()

    def run(self, *, retry_failed: bool = False) -> tuple[StudySampleResult, ...]:
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        completed = {
            item.sample_id
            for item in self.results
            if item.status == "succeeded" or (item.status == "failed" and not retry_failed)
        }
        for sample in self.plan.samples:
            if sample.sample_id in completed:
                continue
            if self._cancel.is_set():
                self.results.append(
                    StudySampleResult(
                        self.plan.study_id,
                        self.plan.study_hash,
                        sample.sample_id,
                        "cancelled",
                        sample.values,
                        self.plan.baseline_project_sha256,
                        {},
                        error={"code": "cancelled", "message": "研究已取消。"},
                        generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    )
                )
                continue
            while self._pause.is_set() and not self._cancel.is_set():
                self._pause.wait(0.05)
            if self._cancel.is_set():
                continue
            workspace = self.workspace_root / f"sample-{sample.sample_id}"
            workspace.mkdir(parents=True, exist_ok=False)
            try:
                if self.runner is None:
                    raise StudyError(
                        "official_runner_required", "批量模拟必须通过官方ContamX/SimRead runner。"
                    )
                payload = dict(self.runner(sample, workspace))
                result_hash = payload.get("result_hash")
                if not isinstance(result_hash, str):
                    result_hash = _sha(payload)
                self.results.append(
                    StudySampleResult(
                        self.plan.study_id,
                        self.plan.study_hash,
                        sample.sample_id,
                        "succeeded",
                        sample.values,
                        self.plan.baseline_project_sha256,
                        {
                            str(k): str(v)
                            for k, v in dict(payload.get("solver_manifest", {})).items()
                        },
                        dict(payload.get("statistics", {})),
                        result_hash,
                        None,
                        datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                        str(payload.get("provenance", "official tool result")),
                        tuple(payload.get("evidence", ())),
                    )
                )
            except StudyError as error:
                self.results.append(
                    StudySampleResult(
                        self.plan.study_id,
                        self.plan.study_hash,
                        sample.sample_id,
                        "failed",
                        sample.values,
                        self.plan.baseline_project_sha256,
                        {},
                        error={"code": error.code, "message": str(error)},
                        generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    )
                )
            except Exception as error:  # noqa: BLE001 - each sample is isolated and recorded.
                self.results.append(
                    StudySampleResult(
                        self.plan.study_id,
                        self.plan.study_hash,
                        sample.sample_id,
                        "failed",
                        sample.values,
                        self.plan.baseline_project_sha256,
                        {},
                        error={"code": "sample_failed", "message": str(error)[:240]},
                        generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    )
                )
        return tuple(self.results)
