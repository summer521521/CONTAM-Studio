from __future__ import annotations

from dataclasses import dataclass
import hashlib
import html
import json
from pathlib import Path
from uuid import uuid4


class StudyError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class SweepCase:
    case_id: str
    parameter: str
    value: float
    unit: str
    scenario_id: str
    status: str = "pending"

    def to_dict(self) -> dict[str, object]:
        return {"case_id": self.case_id, "parameter": self.parameter, "value": self.value, "unit": self.unit, "scenario_id": self.scenario_id, "status": self.status}


@dataclass(frozen=True, slots=True)
class SweepPlan:
    study_id: str
    parameter: str
    unit: str
    values: tuple[float, ...]
    cases: tuple[SweepCase, ...]
    max_runs: int
    max_storage_bytes: int
    approval_hash: str

    def to_dict(self) -> dict[str, object]:
        return {"schema_version": "sweep_plan.v1", "study_id": self.study_id, "parameter": self.parameter, "unit": self.unit, "values": list(self.values), "cases": [case.to_dict() for case in self.cases], "max_runs": self.max_runs, "max_storage_bytes": self.max_storage_bytes, "approval_hash": self.approval_hash}


def make_sweep_plan(*, baseline_sha256: str, parameter: str, unit: str, values: tuple[float, ...], scenario_ids: tuple[str, ...], max_runs: int = 32, max_storage_bytes: int = 256 * 1024 * 1024) -> SweepPlan:
    if parameter not in {"volume_m3"} or unit != "m3":
        raise StudyError("unsupported_parameter", "Sensitivity study只允许已注册参数和单位。")
    if not values or len(values) != len(scenario_ids) or len(values) > max_runs or len(values) > 32:
        raise StudyError("sweep_limit", "Sensitivity study大小超过受控上限。")
    if any(value <= 0 or value > 1e12 for value in values) or len(set(values)) != len(values):
        raise StudyError("invalid_sweep_values", "Sensitivity study值必须为唯一正数。")
    if max_storage_bytes <= 0 or max_storage_bytes > 2 * 1024**30:
        raise StudyError("invalid_storage_budget", "Sensitivity study存储预算无效。")
    study_id = str(uuid4())
    cases = tuple(SweepCase(str(uuid4()), parameter, value, unit, scenario_id) for value, scenario_id in zip(values, scenario_ids, strict=True))
    approval_hash = hashlib.sha256(json.dumps({"study_id": study_id, "parameter": parameter, "unit": unit, "values": values, "scenario_ids": scenario_ids, "max_runs": max_runs, "max_storage_bytes": max_storage_bytes}, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return SweepPlan(study_id, parameter, unit, values, cases, max_runs, max_storage_bytes, approval_hash)


@dataclass(frozen=True, slots=True)
class ReportModel:
    report_id: str
    purpose: str
    profile: str
    baseline_sha256: str
    scenario_id: str
    revision_id: str
    assumptions: tuple[str, ...]
    tool_identity: dict[str, str]
    run_ids: tuple[str, ...]
    result_ids: tuple[str, ...]
    comparison_ids: tuple[str, ...]
    limitations: tuple[str, ...]
    evidence_hashes: tuple[str, ...]
    ai_narrative: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {"schema_version": "report_model.v1", "report_id": self.report_id, "purpose": self.purpose, "profile": self.profile, "baseline_sha256": self.baseline_sha256, "scenario_id": self.scenario_id, "revision_id": self.revision_id, "assumptions": list(self.assumptions), "tool_identity": self.tool_identity, "run_ids": list(self.run_ids), "result_ids": list(self.result_ids), "comparison_ids": list(self.comparison_ids), "limitations": list(self.limitations), "evidence_hashes": list(self.evidence_hashes), "ai_narrative": self.ai_narrative}


def render_report_html(model: ReportModel) -> str:
    payload = json.dumps(model.to_dict(), ensure_ascii=False, sort_keys=True, indent=2)
    return "<!doctype html><meta charset=\"utf-8\"><title>CONTAM Studio Report</title><h1>CONTAM Studio Report</h1><pre>" + html.escape(payload) + "</pre>"


def write_report(model: ReportModel, output: Path) -> Path:
    target = Path(output).expanduser().resolve()
    if target.exists() or target.suffix.lower() not in {".html", ".json"}:
        raise StudyError("report_output_invalid", "报告必须写入新的HTML或JSON文件，不覆盖现有文件。")
    target.parent.mkdir(parents=True, exist_ok=True)
    content = render_report_html(model) if target.suffix.lower() == ".html" else json.dumps(model.to_dict(), ensure_ascii=False, sort_keys=True, indent=2)
    temp = target.with_suffix(target.suffix + ".tmp")
    temp.write_text(content, encoding="utf-8")
    temp.replace(target)
    return target


def make_report_model(*, purpose: str, profile: str, baseline_sha256: str, scenario_id: str, revision_id: str, assumptions: tuple[str, ...], tool_identity: dict[str, str], run_ids: tuple[str, ...], result_ids: tuple[str, ...], comparison_ids: tuple[str, ...], limitations: tuple[str, ...], evidence_hashes: tuple[str, ...], ai_narrative: str | None = None) -> ReportModel:
    if ai_narrative is not None and len(ai_narrative) > 100_000:
        raise StudyError("narrative_too_large", "AI叙述超过报告限制。")
    return ReportModel(str(uuid4()), purpose, profile, baseline_sha256, scenario_id, revision_id, assumptions, dict(sorted(tool_identity.items())), run_ids, result_ids, comparison_ids, limitations, tuple(sorted(evidence_hashes)), ai_narrative)


# Multi-parameter study reports use the closed, evidence-bound implementation.
from .study_engine import (  # noqa: E402,F401
    StudyReportModel,
    analyze_study_results,
    make_study_report,
    render_study_report_csv,
    render_study_report_html,
    render_study_report_pdf,
    write_study_report,
)
