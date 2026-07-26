from __future__ import annotations

import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, NoReturn
from uuid import NAMESPACE_URL, uuid4, uuid5

from .attachment_broker import AttachmentBroker, AttachmentError
from .compatibility import classify_project
from .domain_projection import DomainProjectionError, project_levels_and_zones
from .document_envelope import read_document_envelope
from .prj_sections import read_prj_sections
from .contamx_runner import ContamXRunnerError, run_contamx
from .prj_zone_models import ReaderDiagnostic
from .prj_zone_reader import PrjZoneReaderError, read_simple_zones
from .zone_patch_models import (
    PatchPreconditions,
    PatchPreview,
    PatchReplacement,
    PatchTarget,
    ZoneVolumePatch,
)
from .simread_runner import SimReadError, extract_zone_air_state
from .zone_volume_patch import (
    ZoneVolumePatchError,
    apply_zone_volume_patch_to_copy,
    plan_zone_volume_patch,
    render_zone_volume_patch_diff,
)
from .semantic_patch import (
    PatchTransaction,
    SemanticOperation,
    SemanticPatchError,
    apply_transaction_to_copy,
    plan_zone_transaction,
    stable_zone_id,
)
from .study_engine import (
    StudyError,
    StudyParameter,
    StudyPlan,
    StudyResultStore,
    StudySampleResult,
    analyze_study_results,
    create_study_plan,
    make_study_report,
    write_study_report,
)

PROTOCOL_VERSION = "1.2"
OPERATION_READ_SIMPLE_ZONES = "read_simple_zones"
OPERATION_PLAN_ZONE_VOLUME_PATCH = "plan_zone_volume_patch"
OPERATION_APPLY_ZONE_VOLUME_PATCH = "apply_zone_volume_patch_to_copy"
OPERATION_EXTRACT_ZONE_AIR_STATE = "extract_zone_air_state"
OPERATION_RUN_ACTIVE_PROJECT = "run_active_project"
OPERATION_IMPORT_ATTACHMENT = "import_attachment"
OPERATION_READ_SEMANTIC_PROJECT = "read_semantic_project"
OPERATION_PLAN_SEMANTIC_PATCH = "plan_semantic_patch"
OPERATION_APPLY_SEMANTIC_PATCH = "apply_semantic_patch_to_copy"
OPERATION_CREATE_STUDY_PLAN = "create_study_plan"
OPERATION_RUN_STUDY = "run_study"
OPERATION_CANCEL_STUDY = "cancel_study"
OPERATION_PAGE_STUDY_RESULTS = "page_study_results"
OPERATION_ANALYZE_STUDY_RESULTS = "analyze_study_results"
OPERATION_EXPORT_STUDY_REPORT = "export_study_report"
MAX_REQUEST_BYTES = 128 * 1024
MAX_REQUEST_ID_LENGTH = 128
MAX_SOURCE_PATH_LENGTH = 32_768
MAX_VOLUME_TOKEN_LENGTH = 80


def _digest_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _semantic_object_id(identity_sha256: str, kind: str, external_identity: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"contam-studio:{identity_sha256}:{kind}:{external_identity}"))


class BridgeRequestError(Exception):
    def __init__(self, diagnostic: ReaderDiagnostic, request_id: str = "") -> None:
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic
        self.request_id = request_id


def _diagnostic(
    code: str,
    message: str,
    *,
    context: dict[str, int | str] | None = None,
) -> ReaderDiagnostic:
    return ReaderDiagnostic(code=code, message=message, context=context)


def _safe_request_id(value: object) -> str:
    if not isinstance(value, str):
        return ""
    if not 1 <= len(value) <= MAX_REQUEST_ID_LENGTH:
        return ""
    if not value.isascii() or any(
        ord(character) < 0x21 or ord(character) > 0x7E for character in value
    ):
        return ""
    return value


def _error_envelope(request_id: str, diagnostic: Any) -> dict[str, object]:
    return {
        "protocol_version": PROTOCOL_VERSION,
        "request_id": request_id,
        "ok": False,
        "result": None,
        "error": diagnostic.to_dict(),
    }


def _success_envelope(request_id: str, result: dict[str, object]) -> dict[str, object]:
    return {
        "protocol_version": PROTOCOL_VERSION,
        "request_id": request_id,
        "ok": True,
        "result": result,
        "error": None,
    }


def _fail_request(code: str, message: str, request_id: str = "") -> NoReturn:
    raise BridgeRequestError(_diagnostic(code, message), request_id)


def _require_object(value: object, name: str, keys: set[str], request_id: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        _fail_request("bridge_request_invalid", f"{name}结构无效。", request_id)
    return value


def _require_string(
    value: object,
    name: str,
    request_id: str,
    *,
    max_length: int = MAX_SOURCE_PATH_LENGTH,
    ascii_only: bool = False,
) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > max_length
        or "\0" in value
        or (ascii_only and not value.isascii())
    ):
        _fail_request("bridge_request_invalid", f"{name}缺失或格式无效。", request_id)
    return value


def _semantic_identity(request: dict[str, Any], document_sha256: str, request_id: str) -> str:
    value = request.get("baseline_sha256", document_sha256)
    return _require_string(
        value, "baseline_sha256", request_id, max_length=64, ascii_only=True
    ).lower()


def _require_int(value: object, name: str, request_id: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail_request("bridge_request_invalid", f"{name}必须是整数。", request_id)
    return value


def _require_number(value: object, name: str, request_id: str) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        _fail_request("bridge_request_invalid", f"{name}必须是数字。", request_id)
    return float(value)


def _require_common(payload: object) -> tuple[dict[str, Any], str, str]:
    if not isinstance(payload, dict):
        _fail_request("bridge_request_invalid", "桥接请求必须是JSON对象。")
    request: dict[str, Any] = payload
    request_id = _safe_request_id(request.get("request_id"))
    if not request_id:
        _fail_request("bridge_request_invalid", "request_id缺失或格式无效。")
    if request.get("protocol_version") != PROTOCOL_VERSION:
        raise BridgeRequestError(
            _diagnostic(
                "bridge_protocol_version_unsupported",
                "桥接协议版本不受支持。",
                context={"expected": PROTOCOL_VERSION},
            ),
            request_id,
        )
    operation = request.get("operation")
    if operation not in {
        OPERATION_READ_SIMPLE_ZONES,
        OPERATION_PLAN_ZONE_VOLUME_PATCH,
        OPERATION_APPLY_ZONE_VOLUME_PATCH,
        OPERATION_EXTRACT_ZONE_AIR_STATE,
        OPERATION_RUN_ACTIVE_PROJECT,
        OPERATION_IMPORT_ATTACHMENT,
        OPERATION_READ_SEMANTIC_PROJECT,
        OPERATION_PLAN_SEMANTIC_PATCH,
        OPERATION_APPLY_SEMANTIC_PATCH,
        OPERATION_CREATE_STUDY_PLAN,
        OPERATION_RUN_STUDY,
        OPERATION_CANCEL_STUDY,
        OPERATION_PAGE_STUDY_RESULTS,
        OPERATION_ANALYZE_STUDY_RESULTS,
        OPERATION_EXPORT_STUDY_REPORT,
    }:
        _fail_request("bridge_operation_unsupported", "桥接操作不受支持。", request_id)
    return request, request_id, operation


def _decode_patch(value: object, request_id: str) -> ZoneVolumePatch:
    patch = _require_object(
        value,
        "patch",
        {
            "schema_version",
            "patch_type",
            "source_path",
            "source_sha256",
            "source_size_bytes",
            "reader_mode",
            "header_version",
            "target",
            "preconditions",
            "replacement",
            "preview",
            "status",
        },
        request_id,
    )
    target = _require_object(
        patch["target"],
        "patch.target",
        {
            "contam_number",
            "zone_name",
            "source_line_number",
            "field",
            "token_index",
            "byte_start",
            "byte_end",
        },
        request_id,
    )
    preconditions = _require_object(
        patch["preconditions"],
        "patch.preconditions",
        {
            "source_sha256",
            "source_size_bytes",
            "reader_mode",
            "header_version",
            "contam_number",
            "source_line_number",
            "old_token",
            "old_value",
        },
        request_id,
    )
    replacement = _require_object(
        patch["replacement"],
        "patch.replacement",
        {"new_token", "new_value"},
        request_id,
    )
    preview = _require_object(
        patch["preview"],
        "patch.preview",
        {"source_line_number", "old_token", "new_token", "old_line", "new_line"},
        request_id,
    )
    return ZoneVolumePatch(
        schema_version=_require_string(
            patch["schema_version"], "schema_version", request_id, max_length=16, ascii_only=True
        ),
        patch_type=_require_string(
            patch["patch_type"], "patch_type", request_id, max_length=80, ascii_only=True
        ),
        source_path=_require_string(patch["source_path"], "source_path", request_id),
        source_sha256=_require_string(
            patch["source_sha256"], "source_sha256", request_id, max_length=64, ascii_only=True
        ),
        source_size_bytes=_require_int(patch["source_size_bytes"], "source_size_bytes", request_id),
        reader_mode=_require_string(
            patch["reader_mode"], "reader_mode", request_id, max_length=80, ascii_only=True
        ),
        header_version=_require_string(
            patch["header_version"], "header_version", request_id, max_length=32, ascii_only=True
        ),
        target=PatchTarget(
            contam_number=_require_int(target["contam_number"], "target.contam_number", request_id),
            zone_name=_require_string(
                target["zone_name"], "target.zone_name", request_id, max_length=64, ascii_only=True
            ),
            source_line_number=_require_int(
                target["source_line_number"], "target.source_line_number", request_id
            ),
            field=_require_string(
                target["field"], "target.field", request_id, max_length=32, ascii_only=True
            ),
            token_index=_require_int(target["token_index"], "target.token_index", request_id),
            byte_start=_require_int(target["byte_start"], "target.byte_start", request_id),
            byte_end=_require_int(target["byte_end"], "target.byte_end", request_id),
        ),
        preconditions=PatchPreconditions(
            source_sha256=_require_string(
                preconditions["source_sha256"],
                "preconditions.source_sha256",
                request_id,
                max_length=64,
                ascii_only=True,
            ),
            source_size_bytes=_require_int(
                preconditions["source_size_bytes"], "preconditions.source_size_bytes", request_id
            ),
            reader_mode=_require_string(
                preconditions["reader_mode"],
                "preconditions.reader_mode",
                request_id,
                max_length=80,
                ascii_only=True,
            ),
            header_version=_require_string(
                preconditions["header_version"],
                "preconditions.header_version",
                request_id,
                max_length=32,
                ascii_only=True,
            ),
            contam_number=_require_int(
                preconditions["contam_number"], "preconditions.contam_number", request_id
            ),
            source_line_number=_require_int(
                preconditions["source_line_number"], "preconditions.source_line_number", request_id
            ),
            old_token=_require_string(
                preconditions["old_token"],
                "preconditions.old_token",
                request_id,
                max_length=80,
                ascii_only=True,
            ),
            old_value=_require_number(
                preconditions["old_value"], "preconditions.old_value", request_id
            ),
        ),
        replacement=PatchReplacement(
            new_token=_require_string(
                replacement["new_token"],
                "replacement.new_token",
                request_id,
                max_length=80,
                ascii_only=True,
            ),
            new_value=_require_number(
                replacement["new_value"], "replacement.new_value", request_id
            ),
        ),
        preview=PatchPreview(
            source_line_number=_require_int(
                preview["source_line_number"], "preview.source_line_number", request_id
            ),
            old_token=_require_string(
                preview["old_token"],
                "preview.old_token",
                request_id,
                max_length=80,
                ascii_only=True,
            ),
            new_token=_require_string(
                preview["new_token"],
                "preview.new_token",
                request_id,
                max_length=80,
                ascii_only=True,
            ),
            old_line=_require_string(
                preview["old_line"],
                "preview.old_line",
                request_id,
                max_length=4096,
                ascii_only=True,
            ),
            new_line=_require_string(
                preview["new_line"],
                "preview.new_line",
                request_id,
                max_length=4096,
                ascii_only=True,
            ),
        ),
        status=_require_string(
            patch["status"], "status", request_id, max_length=32, ascii_only=True
        ),
    )


def _build_apply_result(application: Any, project: Any) -> dict[str, object]:
    return {
        "result_type": "zone_volume_patch_application",
        "application": application.to_dict(),
        "project": project.to_dict(),
    }


def _cleanup_verified_output(output: Path, output_sha256: str) -> None:
    try:
        if output.is_file() and hashlib.sha256(output.read_bytes()).hexdigest() == output_sha256:
            output.unlink()
    except OSError:
        pass


def _decode_study_parameter(raw: object, request_id: str) -> StudyParameter:
    if not isinstance(raw, dict):
        _fail_request("study_parameter_invalid", "研究参数必须是对象。", request_id)
    allowed = {
        "parameter_id",
        "parameter_type",
        "object_id",
        "name",
        "unit",
        "minimum",
        "maximum",
        "step",
        "discrete_values",
        "default_value",
    }
    if set(raw) != allowed:
        _fail_request("study_parameter_invalid", "研究参数字段不完整或包含未知字段。", request_id)
    values = raw["discrete_values"]
    if not isinstance(values, list):
        _fail_request("study_parameter_invalid", "研究参数离散值必须是数组。", request_id)
    try:
        return StudyParameter(
            parameter_id=raw["parameter_id"],
            parameter_type=raw["parameter_type"],
            object_id=raw["object_id"],
            name=raw["name"],
            unit=raw["unit"],
            minimum=raw["minimum"],
            maximum=raw["maximum"],
            step=raw["step"],
            discrete_values=tuple(values),
            default_value=raw["default_value"],
        )
    except StudyError as error:
        _fail_request(error.code, str(error), request_id)
    raise AssertionError("unreachable")


def _decode_study_plan(
    raw: object, request_id: str, *, baseline_sha256: str | None = None
) -> StudyPlan:
    if not isinstance(raw, dict):
        _fail_request("study_plan_invalid", "研究方案必须是对象。", request_id)
    expected = {
        "schema_version",
        "study_id",
        "baseline_project_sha256",
        "revision_id",
        "patch_sha256",
        "parameters",
        "mode",
        "max_combinations",
        "samples",
        "study_hash",
        "created_at",
    }
    if set(raw) != expected or raw["schema_version"] != "study_plan.v1":
        _fail_request("study_plan_invalid", "研究方案字段不完整或包含未知字段。", request_id)
    parameters = raw["parameters"]
    samples = raw["samples"]
    if not isinstance(parameters, list) or not isinstance(samples, list):
        _fail_request("study_plan_invalid", "研究方案参数或样本不是数组。", request_id)
    decoded_parameters = tuple(_decode_study_parameter(item, request_id) for item in parameters)
    combinations: list[dict[str, object]] = []
    for sample in samples:
        if not isinstance(sample, dict) or set(sample) != {
            "sample_id",
            "ordinal",
            "values",
            "status",
        }:
            _fail_request("study_plan_invalid", "研究样本字段无效。", request_id)
        if not isinstance(sample["values"], dict) or sample["status"] != "queued":
            _fail_request("study_plan_invalid", "研究方案只能接收尚未执行的样本。", request_id)
        combinations.append(sample["values"])
    if baseline_sha256 is not None and raw["baseline_project_sha256"] != baseline_sha256:
        _fail_request("study_project_mismatch", "研究方案与当前项目哈希不一致。", request_id)
    try:
        plan = create_study_plan(
            baseline_project_sha256=raw["baseline_project_sha256"],
            revision_id=raw["revision_id"],
            parameters=decoded_parameters,
            mode=raw["mode"],
            user_combinations=combinations,
            patch_sha256=raw["patch_sha256"],
            max_combinations=raw["max_combinations"],
        )
    except StudyError as error:
        _fail_request(error.code, str(error), request_id)
    if plan.study_id != raw["study_id"] or plan.study_hash != raw["study_hash"]:
        _fail_request("study_hash_mismatch", "研究方案哈希或ID不匹配。", request_id)
    return plan


def _run_official_study(
    plan: StudyPlan,
    source_path: Path,
    run_root: Path,
    solver_path: Path | None,
    simread_path: Path | None,
    request_id: str,
    cancel_path: Path | None = None,
) -> tuple[dict[str, object], ...]:
    """用现有 ContamX/SimRead runner执行每个样本，任何失败只隔离该样本。"""
    source = source_path.resolve(strict=True)
    source_hash = _digest_file(source)
    if source_hash != plan.baseline_project_sha256:
        _fail_request("study_project_mismatch", "研究方案与当前项目源哈希不一致。", request_id)
    result_store = StudyResultStore(run_root / "study-results")
    attempt_id = uuid4().hex
    try:
        result_store.save_plan(plan)
    except StudyError as error:
        if error.code != "result_exists":
            raise
        if result_store.read_plan(plan.study_id).study_hash != plan.study_hash:
            _fail_request("study_hash_mismatch", "已有研究方案与当前研究哈希不一致。", request_id)
    results: list[dict[str, object]] = []
    base_document = read_simple_zones(source)

    def cancellation_requested() -> bool:
        return cancel_path is not None and cancel_path.is_file()

    for sample in plan.samples:
        if cancellation_requested():
            result = StudySampleResult(
                plan.study_id,
                plan.study_hash,
                sample.sample_id,
                "cancelled",
                sample.values,
                plan.baseline_project_sha256,
                {},
                error={"code": "cancelled", "message": "研究已取消。"},
                generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                provenance="official tool result",
                attempt_id=attempt_id,
            )
            result_store.save_result(result)
            results.append(result.to_dict())
            continue
        sample_workspace = run_root / f"sample-{sample.sample_id}-{attempt_id}"
        try:
            sample_workspace.mkdir(parents=True, exist_ok=False)
            requests: list[dict[str, str | None]] = []
            for parameter in plan.parameters:
                value = sample.values[parameter.parameter_id]
                operation = {
                    "zone_volume_m3": ("set_zone_volume", "m3"),
                    "zone_name": ("set_zone_name", None),
                    "flow_path_multiplier": ("set_flow_path_multiplier", "1"),
                }.get(parameter.parameter_type)
                if operation is None:
                    raise StudyError("unsupported_parameter", "该参数尚未实现可验证的PRJ Patch。")
                requests.append(
                    {
                        "operation": operation[0],
                        "object_id": parameter.object_id,
                        "new_value": str(value),
                        "unit": operation[1],
                    }
                )
            transaction = plan_zone_transaction(
                source,
                plan.revision_id,
                tuple(requests),
                identity_sha256=plan.baseline_project_sha256,
            )
            sample_source = sample_workspace / source.name
            apply_transaction_to_copy(source, sample_source, transaction)
            run = run_contamx(
                sample_source,
                solver=solver_path,
                run_root=run_root / "contamx" / f"{sample.sample_id}-{attempt_id}",
            )
            if run.status != "succeeded":
                diagnostics = (
                    run.manifest.diagnostics[0].to_dict()
                    if run.manifest.diagnostics
                    else {"code": "run_failed", "message": "ContamX运行失败。"}
                )
                raise StudyError(
                    str(diagnostics.get("code", "run_failed")),
                    str(diagnostics.get("message", "ContamX运行失败。")),
                )
            if cancellation_requested():
                raise StudyError("cancelled", "研究已取消。")
            first_zone = base_document.zones[0].contam_number if base_document.zones else 1
            extraction = extract_zone_air_state(
                Path(run.manifest_path),
                simread_path=simread_path,
                result_root=run_root / "simread" / f"{sample.sample_id}-{attempt_id}",
                zone_number=first_zone,
                expected_source_path=sample_source,
                expected_source_sha256=_digest_file(sample_source),
            )
            series = extraction.get("parsed_result") or {}
            samples = series.get("samples", []) if isinstance(series, dict) else []
            first = samples[0] if samples else {}
            value = first.get("temperature_k") if isinstance(first, dict) else None
            result_hash = _sha256_json(extraction)
            # Keep a bounded, read-only projection for charts. The full
            # SimRead extraction remains represented by result_hash and is
            # never copied into the AI request.
            bounded_series = []
            if isinstance(samples, list):
                for raw_sample in samples[:512]:
                    if not isinstance(raw_sample, dict):
                        continue
                    timestamp = raw_sample.get("sim_time_seconds")
                    if not isinstance(timestamp, (int, float)) or not math.isfinite(float(timestamp)):
                        continue
                    bounded_series.append(
                        {
                            "time_seconds": float(timestamp),
                            "zone_id": plan.parameters[0].object_id if plan.parameters else None,
                            "temperature_k": raw_sample.get("temperature_k"),
                            "reference_pressure_pa": raw_sample.get("reference_pressure_pa"),
                            "air_density_kg_m3": raw_sample.get("air_density_kg_m3"),
                        }
                    )
            evidence = (
                {
                    "sample_id": sample.sample_id,
                    "result_hash": result_hash,
                    "zone_id": plan.parameters[0].object_id if plan.parameters else None,
                    "time_seconds": first.get("sim_time_seconds")
                    if isinstance(first, dict)
                    else None,
                },
            )
            result = StudySampleResult(
                plan.study_id,
                plan.study_hash,
                sample.sample_id,
                "succeeded",
                sample.values,
                plan.baseline_project_sha256,
                {"solver_version": run.solver_version, "architecture": "windows-x64"},
                {
                    "value": value,
                    "mean": value,
                    "zone_id": evidence[0]["zone_id"],
                    "time_seconds": evidence[0]["time_seconds"],
                    "sample_count": len(samples),
                    "series": bounded_series,
                },
                result_hash,
                None,
                datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "official tool result",
                evidence,
                attempt_id,
            )
        except (StudyError, ContamXRunnerError, SimReadError, SemanticPatchError, OSError) as error:
            code = getattr(error, "code", "sample_failed")
            message = str(error)
            status = "cancelled" if code == "cancelled" else "failed"
            result = StudySampleResult(
                plan.study_id,
                plan.study_hash,
                sample.sample_id,
                status,
                sample.values,
                plan.baseline_project_sha256,
                {},
                error={"code": code, "message": message[:240]},
                generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                provenance="official tool result",
                attempt_id=attempt_id,
            )
        result_store.save_result(result)
        results.append(result.to_dict())
    return tuple(results)


def _sha256_json(value: object) -> str:
    return hashlib.sha256(
        json.dumps(
            value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")
    ).hexdigest()


def handle_request(payload: object) -> dict[str, object]:
    request_id = ""
    created_output: tuple[Path, str] | None = None
    try:
        request, request_id, operation = _require_common(payload)
        if operation == OPERATION_IMPORT_ATTACHMENT:
            _require_object(
                request,
                "request",
                {"protocol_version", "request_id", "operation", "source_path", "quarantine_root"},
                request_id,
            )
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            quarantine_root = Path(
                _require_string(request["quarantine_root"], "quarantine_root", request_id)
            )
            broker = AttachmentBroker(quarantine_root)
            try:
                record = broker.ingest_desktop(source_path)
            except AttachmentError as error:
                return _error_envelope(
                    request_id, _diagnostic(error.code, "附件导入被安全策略拒绝。")
                )
            try:
                evidence = broker.text_evidence(record.attachment_id).to_dict()
            except AttachmentError:
                evidence = None
            return _success_envelope(
                request_id,
                {
                    "result_type": "attachment_import",
                    "attachment": {**record.safe_view(), "sha256": record.sha256},
                    "quarantine_relative_path": record.quarantine_relative_path,
                    "evidence": evidence,
                },
            )
        if operation == OPERATION_READ_SIMPLE_ZONES:
            _require_object(
                request,
                "request",
                {"protocol_version", "request_id", "operation", "source_path"},
                request_id,
            )
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            document = read_simple_zones(source_path)
            return _success_envelope(
                request_id,
                {"result_type": "read_zones", "project": document.to_dict()},
            )
        if operation == OPERATION_READ_SEMANTIC_PROJECT:
            if not isinstance(request, dict) or set(request) not in (
                {"protocol_version", "request_id", "operation", "source_path"},
                {"protocol_version", "request_id", "operation", "source_path", "baseline_sha256"},
            ):
                _fail_request("bridge_request_invalid", "request结构无效。", request_id)
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            document = read_simple_zones(source_path)
            identity_sha256 = _semantic_identity(request, document.source_sha256, request_id)
            projection = None
            try:
                projection = project_levels_and_zones(document)
                projection_reason = None
            except DomainProjectionError as error:
                projection_reason = error.code
            sections = read_prj_sections(source_path)
            compatibility = classify_project(source_path)
            envelope = read_document_envelope(source_path)
            line_spans = {span.line_number: span.to_dict() for span in envelope.line_spans}

            def source_span(line_number: int | None) -> dict[str, int] | None:
                return None if line_number is None else line_spans.get(line_number)

            section_views = [
                {
                    "name": item.name,
                    "marker_line_number": item.marker_line_number,
                    "terminator_line_number": item.terminator_line_number,
                    "declared_count": item.declared_count,
                    "editable": False,
                }
                for item in sections.sections
            ]
            zone_views = []
            for item in document.zones:
                zone_id = stable_zone_id(
                    identity_sha256, item.contam_number, item.source_line_number
                )
                zone_views.append(
                    {
                        "object_id": zone_id,
                        "object_kind": "Zone",
                        "contam_number": item.contam_number,
                        "name": item.name,
                        "section": "Zones",
                        "source_line_number": item.source_line_number,
                        "source_span": source_span(item.source_line_number),
                        "source_sha256": document.source_sha256,
                        "revision_state": "baseline",
                        "fields": {
                            "name": item.name,
                            "flags": item.flags,
                            "level_number": item.level_number,
                            "relative_height": item.relative_height,
                            "volume_m3": item.volume_m3,
                        },
                        "capabilities": {
                            "name": {"state": "editable_via_patch", "unit": None},
                            "volume_m3": {"state": "editable_via_patch", "unit": "m3"},
                            "flags": {"state": "read_only", "unit": None},
                            "level_number": {"state": "read_only", "unit": None},
                            "relative_height": {"state": "read_only", "unit": "m"},
                        },
                        "editable": projection_reason is None,
                    }
                )
            level_views = []
            if projection_reason is None:
                try:
                    level_views = [
                        {
                            **item.to_dict(),
                            "object_id": _semantic_object_id(
                                identity_sha256, "level", str(item.level_number)
                            ),
                            "zone_ids": [
                                str(zone["object_id"])
                                for zone in zone_views
                                if int(zone["fields"]["level_number"]) == item.level_number
                            ],
                            "object_kind": "Level",
                            "section": "Levels",
                            "source_sha256": document.source_sha256,
                            "source_line_number": item.evidence.source_line_number,
                            "source_span": source_span(item.evidence.source_line_number),
                            "editable": False,
                        }
                        for item in projection.levels
                    ]
                except AttributeError:
                    level_views = []
            if not level_views:
                by_level: dict[int, list[str]] = {}
                for item in zone_views:
                    by_level.setdefault(int(item["fields"]["level_number"]), []).append(
                        str(item["object_id"])
                    )
                level_views = [
                    {
                        "object_id": _semantic_object_id(identity_sha256, "level", str(number)),
                        "object_kind": "Level",
                        "level_number": number,
                        "label": f"Level {number}",
                        "zone_ids": identifiers,
                        "section": "Levels plus icon data",
                        "source_line_number": min(
                            (int(item["source_line_number"]) for item in zone_views), default=1
                        ),
                        "source_span": source_span(
                            min((int(item["source_line_number"]) for item in zone_views), default=1)
                        ),
                        "source_sha256": document.source_sha256,
                        "editable": False,
                    }
                    for number, identifiers in sorted(by_level.items())
                ]
            return _success_envelope(
                request_id,
                {
                    "result_type": "semantic_project_snapshot",
                    "source_sha256": document.source_sha256,
                    "identity_sha256": identity_sha256,
                    "revision_state": "baseline_readonly"
                    if compatibility.status.value != "supported_editable" or projection_reason
                    else "baseline_editable",
                    "project": {
                        "object_id": f"project-{identity_sha256[:16]}",
                        "name": source_path.name,
                        "source_sha256": document.source_sha256,
                        "source_span": {
                            "line_number": 1,
                            "byte_start": 0,
                            "byte_end": envelope.source_size_bytes,
                        },
                        "editable": False,
                    },
                    "levels": level_views,
                    "zones": zone_views,
                    "read_only_reason": projection_reason,
                    "flow_paths": []
                    if compatibility.airflow is None
                    else [
                        {
                            **item.to_dict(),
                            "object_id": _semantic_object_id(
                                identity_sha256,
                                "flow-path",
                                f"{item.contam_number}:{item.source_line_number}",
                            ),
                            "path_id": _semantic_object_id(
                                identity_sha256,
                                "flow-path",
                                f"{item.contam_number}:{item.source_line_number}",
                            ),
                            "object_kind": "FlowPath",
                            "section": "Flow Paths",
                            "source_sha256": document.source_sha256,
                            "source_span": source_span(item.source_line_number),
                            "editable": item.capability == "inspect",
                            "fields": {
                                "multiplier": item.multiplier,
                                "flags": item.flags,
                                "direction": item.direction,
                            },
                            "capabilities": {
                                "multiplier": {
                                    "state": "editable_via_patch"
                                    if item.capability == "inspect"
                                    else "read_only",
                                    "unit": "1",
                                },
                                "flags": {"state": "read_only", "unit": None},
                                "direction": {"state": "read_only", "unit": None},
                            },
                        }
                        for item in compatibility.airflow.paths
                    ],
                    "flow_elements": []
                    if compatibility.airflow is None
                    else [item.to_dict() for item in compatibility.airflow.components],
                    "schedules": [],
                    "sources": [],
                    "species": [
                        {
                            **item.to_dict(),
                            "species_id": _semantic_object_id(
                                identity_sha256,
                                "species",
                                f"{item.contam_number}:{item.source_line_number}",
                            ),
                            "object_kind": "Species",
                            "section": "Species",
                            "source_sha256": document.source_sha256,
                            "source_span": source_span(item.source_line_number),
                            "editable": False,
                        }
                        for item in compatibility.species
                    ],
                    "sections": section_views,
                    "document_envelope": {
                        "schema_version": envelope.schema_version,
                        "source_sha256": envelope.source_sha256,
                        "source_size_bytes": envelope.source_size_bytes,
                        "encoding": envelope.encoding,
                        "newline_style": envelope.newline_style,
                        "final_newline": envelope.final_newline,
                        "opaque_sections": list(envelope.opaque_sections),
                        "profile": envelope.profile,
                        "editable": False,
                    },
                    "unknown_content": {
                        "preserved": True,
                        "reason": "unsupported_or_unverified_sections_remain_byte_opaque",
                    },
                },
            )
        if operation == OPERATION_PLAN_SEMANTIC_PATCH:
            if not isinstance(request, dict) or set(request) not in (
                {
                    "protocol_version",
                    "request_id",
                    "operation",
                    "source_path",
                    "revision_id",
                    "operations",
                },
                {
                    "protocol_version",
                    "request_id",
                    "operation",
                    "source_path",
                    "revision_id",
                    "operations",
                    "baseline_sha256",
                },
            ):
                _fail_request("bridge_request_invalid", "request结构无效。", request_id)
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            revision_id = _require_string(
                request["revision_id"], "revision_id", request_id, max_length=64, ascii_only=True
            )
            identity_sha256 = _semantic_identity(request, _digest_file(source_path), request_id)
            raw_operations = request["operations"]
            if not isinstance(raw_operations, list) or not 1 <= len(raw_operations) <= 128:
                _fail_request("operation_invalid", "Patch操作列表无效。", request_id)
            operations: list[dict[str, str | None]] = []
            for raw in raw_operations:
                item = _require_object(
                    raw, "operation", {"operation", "object_id", "new_value", "unit"}, request_id
                )
                operations.append(
                    {
                        "operation": _require_string(
                            item["operation"],
                            "operation",
                            request_id,
                            max_length=80,
                            ascii_only=True,
                        ),
                        "object_id": _require_string(
                            item["object_id"],
                            "object_id",
                            request_id,
                            max_length=128,
                            ascii_only=True,
                        ),
                        "new_value": _require_string(
                            item["new_value"],
                            "new_value",
                            request_id,
                            max_length=80,
                            ascii_only=True,
                        ),
                        "unit": item["unit"]
                        if item["unit"] is None
                        else _require_string(
                            item["unit"], "unit", request_id, max_length=16, ascii_only=True
                        ),
                    }
                )
            transaction = plan_zone_transaction(
                source_path, revision_id, tuple(operations), identity_sha256=identity_sha256
            )
            return _success_envelope(
                request_id,
                {
                    "result_type": "semantic_patch_plan",
                    "transaction": transaction.to_dict(),
                    "diff": [
                        {**item.to_dict(), "source_sha256": transaction.source_sha256}
                        for item in transaction.operations
                    ],
                },
            )
        if operation == OPERATION_APPLY_SEMANTIC_PATCH:
            _require_object(
                request,
                "request",
                {
                    "protocol_version",
                    "request_id",
                    "operation",
                    "source_path",
                    "output_path",
                    "transaction",
                },
                request_id,
            )
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            output_path = Path(_require_string(request["output_path"], "output_path", request_id))
            raw = _require_object(
                request["transaction"],
                "transaction",
                {
                    "schema_version",
                    "source_sha256",
                    "identity_sha256",
                    "revision_id",
                    "operations",
                    "patch_sha256",
                },
                request_id,
            )
            raw_ops = raw["operations"]
            if (
                raw["schema_version"] != "semantic_patch.v1"
                or not isinstance(raw_ops, list)
                or not raw_ops
            ):
                _fail_request("patch_contract_invalid", "语义Patch事务契约无效。", request_id)
            ops: list[SemanticOperation] = []
            for raw_op in raw_ops:
                item = _require_object(
                    raw_op,
                    "transaction.operation",
                    {
                        "operation",
                        "operation_id",
                        "object_id",
                        "field",
                        "old_value",
                        "new_value",
                        "unit",
                        "evidence_span",
                    },
                    request_id,
                )
                span = item["evidence_span"]
                if (
                    not isinstance(span, list)
                    or len(span) != 2
                    or any(isinstance(value, bool) or not isinstance(value, int) for value in span)
                ):
                    _fail_request("patch_contract_invalid", "语义Patch证据范围无效。", request_id)
                ops.append(
                    SemanticOperation(
                        _require_string(
                            item["operation"],
                            "operation",
                            request_id,
                            max_length=80,
                            ascii_only=True,
                        ),
                        _require_string(
                            item["operation_id"],
                            "operation_id",
                            request_id,
                            max_length=128,
                            ascii_only=True,
                        ),
                        _require_string(
                            item["object_id"],
                            "object_id",
                            request_id,
                            max_length=128,
                            ascii_only=True,
                        ),
                        _require_string(
                            item["field"], "field", request_id, max_length=64, ascii_only=True
                        ),
                        _require_string(
                            item["old_value"],
                            "old_value",
                            request_id,
                            max_length=80,
                            ascii_only=True,
                        ),
                        _require_string(
                            item["new_value"],
                            "new_value",
                            request_id,
                            max_length=80,
                            ascii_only=True,
                        ),
                        item["unit"]
                        if item["unit"] is None
                        else _require_string(
                            item["unit"], "unit", request_id, max_length=16, ascii_only=True
                        ),
                        (span[0], span[1]),
                    )
                )
            transaction = PatchTransaction(
                _require_string(
                    raw["source_sha256"],
                    "source_sha256",
                    request_id,
                    max_length=64,
                    ascii_only=True,
                ).lower(),
                _require_string(
                    raw["identity_sha256"],
                    "identity_sha256",
                    request_id,
                    max_length=64,
                    ascii_only=True,
                ).lower(),
                _require_string(
                    raw["revision_id"], "revision_id", request_id, max_length=64, ascii_only=True
                ),
                tuple(ops),
                _require_string(
                    raw["patch_sha256"], "patch_sha256", request_id, max_length=64, ascii_only=True
                ),
            )
            expected = plan_zone_transaction(
                source_path,
                transaction.revision_id,
                tuple(
                    {
                        "operation": op.operation,
                        "object_id": op.object_id,
                        "new_value": op.new_value,
                        "unit": op.unit,
                    }
                    for op in transaction.operations
                ),
                identity_sha256=transaction.identity_sha256,
            )
            if (
                expected.patch_sha256 != transaction.patch_sha256
                or expected.source_sha256 != transaction.source_sha256
                or expected.identity_sha256 != transaction.identity_sha256
            ):
                _fail_request(
                    "patch_hash_mismatch", "语义Patch哈希或源文件哈希不匹配。", request_id
                )
            apply_transaction_to_copy(source_path, output_path, transaction)
            snapshot = read_simple_zones(output_path)
            return _success_envelope(
                request_id,
                {
                    "result_type": "semantic_patch_application",
                    "transaction": transaction.to_dict(),
                    "output_sha256": snapshot.source_sha256,
                    "output_size_bytes": snapshot.source_size_bytes,
                    "source_unchanged": _digest_file(source_path) == transaction.source_sha256,
                    "project": {
                        "source_sha256": snapshot.source_sha256,
                        "source_size_bytes": snapshot.source_size_bytes,
                        "declared_zone_count": snapshot.declared_zone_count,
                    },
                },
            )
        if operation == OPERATION_CREATE_STUDY_PLAN:
            allowed = {
                "protocol_version",
                "request_id",
                "operation",
                "baseline_project_sha256",
                "revision_id",
                "parameters",
                "mode",
                "user_combinations",
                "patch_sha256",
                "max_combinations",
            }
            if set(request) != allowed:
                _fail_request(
                    "study_request_invalid", "研究方案请求字段不完整或包含未知字段。", request_id
                )
            raw_parameters = request["parameters"]
            if not isinstance(raw_parameters, list):
                _fail_request("study_request_invalid", "研究参数必须是数组。", request_id)
            parameters = tuple(_decode_study_parameter(item, request_id) for item in raw_parameters)
            combinations = request["user_combinations"]
            if combinations is not None and (
                not isinstance(combinations, list)
                or any(not isinstance(item, dict) for item in combinations)
            ):
                _fail_request("study_request_invalid", "用户组合必须是对象数组。", request_id)
            try:
                plan = create_study_plan(
                    baseline_project_sha256=_require_string(
                        request["baseline_project_sha256"],
                        "baseline_project_sha256",
                        request_id,
                        max_length=64,
                        ascii_only=True,
                    ),
                    revision_id=_require_string(
                        request["revision_id"],
                        "revision_id",
                        request_id,
                        max_length=128,
                        ascii_only=True,
                    ),
                    parameters=parameters,
                    mode=_require_string(
                        request["mode"], "mode", request_id, max_length=32, ascii_only=True
                    ),
                    user_combinations=tuple(combinations) if combinations is not None else None,
                    patch_sha256=request["patch_sha256"],
                    max_combinations=_require_int(
                        request["max_combinations"], "max_combinations", request_id
                    ),
                )
            except StudyError as error:
                _fail_request(error.code, str(error), request_id)
            return _success_envelope(
                request_id, {"result_type": "study_plan", "plan": plan.to_dict()}
            )
        if operation == OPERATION_RUN_STUDY:
            allowed = {
                "protocol_version",
                "request_id",
                "operation",
                "source_path",
                "source_sha256",
                "run_root",
                "plan",
                "solver_path",
                "simread_path",
                "cancel_path",
            }
            if set(request) != allowed:
                _fail_request(
                    "study_request_invalid", "研究运行请求字段不完整或包含未知字段。", request_id
                )
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            source_sha256 = _require_string(
                request["source_sha256"],
                "source_sha256",
                request_id,
                max_length=64,
                ascii_only=True,
            ).lower()
            plan = _decode_study_plan(request["plan"], request_id, baseline_sha256=source_sha256)
            solver_raw = request["solver_path"]
            simread_raw = request["simread_path"]
            solver_path = Path(solver_raw) if isinstance(solver_raw, str) and solver_raw else None
            simread_path = (
                Path(simread_raw) if isinstance(simread_raw, str) and simread_raw else None
            )
            cancel_raw = request["cancel_path"]
            cancel_path = Path(cancel_raw) if isinstance(cancel_raw, str) and cancel_raw else None
            run_root = Path(_require_string(request["run_root"], "run_root", request_id))
            try:
                results = _run_official_study(
                    plan, source_path, run_root, solver_path, simread_path, request_id, cancel_path
                )
            except BridgeRequestError:
                raise
            return _success_envelope(
                request_id,
                {
                    "result_type": "study_run",
                    "study_id": plan.study_id,
                    "study_hash": plan.study_hash,
                    "status": (
                        "succeeded"
                        if results and all(item.get("status") == "succeeded" for item in results)
                        else "failed"
                        if results and all(item.get("status") == "failed" for item in results)
                        else "cancelled"
                        if results and all(item.get("status") == "cancelled" for item in results)
                        else "partial"
                    ),
                    "results": list(results),
                },
            )
        if operation == OPERATION_CANCEL_STUDY:
            allowed = {"protocol_version", "request_id", "operation", "study_id"}
            if set(request) != allowed:
                _fail_request("study_request_invalid", "研究取消请求字段无效。", request_id)
            return _success_envelope(
                request_id,
                {
                    "result_type": "study_cancel",
                    "study_id": _require_string(
                        request["study_id"], "study_id", request_id, max_length=128, ascii_only=True
                    ),
                    "status": "cancelled",
                },
            )
        if operation == OPERATION_PAGE_STUDY_RESULTS:
            allowed = {
                "protocol_version",
                "request_id",
                "operation",
                "results_root",
                "study_id",
                "plan_hash",
                "page",
                "limit",
                "parameter",
                "value",
                "object_id",
                "time_seconds",
                "sort_by",
                "descending",
            }
            if set(request) != allowed:
                _fail_request("study_request_invalid", "研究结果分页请求字段无效。", request_id)
            store = StudyResultStore(
                Path(_require_string(request["results_root"], "results_root", request_id))
            )
            page = store.page_results(
                _require_string(
                    request["study_id"], "study_id", request_id, max_length=128, ascii_only=True
                ),
                plan_hash=_require_string(
                    request["plan_hash"], "plan_hash", request_id, max_length=64, ascii_only=True
                ),
                page=_require_int(request["page"], "page", request_id),
                limit=_require_int(request["limit"], "limit", request_id),
                parameter=request["parameter"],
                value=request["value"],
                object_id=request["object_id"],
                time_seconds=request["time_seconds"],
                sort_by=_require_string(
                    request["sort_by"], "sort_by", request_id, max_length=32, ascii_only=True
                ),
                descending=bool(request["descending"]),
            )
            return _success_envelope(
                request_id, {"result_type": "study_results_page", "page": page}
            )
        if operation == OPERATION_ANALYZE_STUDY_RESULTS:
            allowed = {
                "protocol_version",
                "request_id",
                "operation",
                "results",
                "baseline_sample_id",
            }
            if set(request) != allowed or not isinstance(request["results"], list):
                _fail_request("study_request_invalid", "研究分析请求字段无效。", request_id)
            decoded: list[StudySampleResult] = []
            for raw_result in request["results"]:
                if not isinstance(raw_result, dict):
                    _fail_request("study_result_invalid", "研究结果必须是对象。", request_id)
                try:
                    decoded.append(
                        StudySampleResult(
                            study_id=raw_result["study_id"],
                            study_hash=raw_result["study_hash"],
                            sample_id=raw_result["sample_id"],
                            status=raw_result["status"],
                            parameters=raw_result["parameters"],
                            project_sha256=raw_result["project_sha256"],
                            solver_manifest=raw_result["solver_manifest"],
                            statistics=raw_result["statistics"],
                            result_hash=raw_result["result_hash"],
                            error=raw_result["error"],
                            generated_at=raw_result["generated_at"],
                            provenance=raw_result["provenance"],
                            evidence=tuple(raw_result["evidence"]),
                            attempt_id=raw_result.get("attempt_id"),
                        )
                    )
                except (KeyError, StudyError) as error:
                    _fail_request("study_result_invalid", str(error), request_id)
            try:
                analysis = analyze_study_results(
                    decoded, baseline_sample_id=request["baseline_sample_id"]
                )
            except StudyError as error:
                _fail_request(error.code, str(error), request_id)
            return _success_envelope(
                request_id, {"result_type": "study_analysis", "analysis": analysis}
            )
        if operation == OPERATION_EXPORT_STUDY_REPORT:
            allowed = {
                "protocol_version",
                "request_id",
                "operation",
                "output_path",
                "plan",
                "results",
                "solver_manifest",
                "analysis",
                "provenance",
            }
            if (
                set(request) != allowed
                or not isinstance(request["results"], list)
                or not isinstance(request["solver_manifest"], dict)
            ):
                _fail_request("study_request_invalid", "研究报告请求字段无效。", request_id)
            plan = _decode_study_plan(request["plan"], request_id)
            decoded: list[StudySampleResult] = []
            for raw_result in request["results"]:
                if not isinstance(raw_result, dict):
                    _fail_request("study_result_invalid", "研究结果必须是对象。", request_id)
                decoded.append(
                    StudySampleResult(
                        raw_result["study_id"],
                        raw_result["study_hash"],
                        raw_result["sample_id"],
                        raw_result["status"],
                        raw_result["parameters"],
                        raw_result["project_sha256"],
                        raw_result["solver_manifest"],
                        raw_result["statistics"],
                        raw_result["result_hash"],
                        raw_result["error"],
                        raw_result["generated_at"],
                        raw_result["provenance"],
                        tuple(raw_result["evidence"]),
                        raw_result.get("attempt_id"),
                    )
                )
            report = make_study_report(
                plan=plan,
                results=decoded,
                solver_manifest=request["solver_manifest"],
                analysis=request["analysis"],
                provenance=request["provenance"],
            )
            output = write_study_report(
                report, Path(_require_string(request["output_path"], "output_path", request_id))
            )
            return _success_envelope(
                request_id,
                {
                    "result_type": "study_report",
                    "file_name": output.name,
                    "format": output.suffix.lower(),
                    "report_id": report.report_id,
                    "study_hash": report.study_hash,
                },
            )
        if operation == OPERATION_PLAN_ZONE_VOLUME_PATCH:
            _require_object(
                request,
                "request",
                {
                    "protocol_version",
                    "request_id",
                    "operation",
                    "source_path",
                    "contam_number",
                    "new_volume_token",
                },
                request_id,
            )
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            contam_number = _require_int(request["contam_number"], "contam_number", request_id)
            new_volume_token = _require_string(
                request["new_volume_token"],
                "new_volume_token",
                request_id,
                max_length=MAX_VOLUME_TOKEN_LENGTH,
                ascii_only=True,
            )
            patch = plan_zone_volume_patch(source_path, contam_number, new_volume_token)
            return _success_envelope(
                request_id,
                {
                    "result_type": "zone_volume_patch_plan",
                    "patch": patch.to_dict(),
                    "diff_text": render_zone_volume_patch_diff(patch),
                },
            )

        if operation == OPERATION_EXTRACT_ZONE_AIR_STATE:
            _require_object(
                request,
                "request",
                {
                    "protocol_version",
                    "request_id",
                    "operation",
                    "manifest_path",
                    "source_path",
                    "source_sha256",
                    "result_root",
                    "zone_number",
                },
                request_id,
            )
            manifest_path = Path(
                _require_string(request["manifest_path"], "manifest_path", request_id)
            )
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            source_sha256 = _require_string(
                request["source_sha256"],
                "source_sha256",
                request_id,
                max_length=64,
                ascii_only=True,
            )
            result_root = Path(_require_string(request["result_root"], "result_root", request_id))
            zone_number = _require_int(request["zone_number"], "zone_number", request_id)
            result = extract_zone_air_state(
                manifest_path,
                simread_path=None,
                result_root=result_root,
                zone_number=zone_number,
                expected_source_path=source_path,
                expected_source_sha256=source_sha256,
            )
            return _success_envelope(
                request_id,
                {"result_type": "zone_air_state_extraction", **result},
            )

        if operation == OPERATION_RUN_ACTIVE_PROJECT:
            _require_object(
                request,
                "request",
                {
                    "protocol_version",
                    "request_id",
                    "operation",
                    "source_path",
                    "source_sha256",
                    "run_root",
                },
                request_id,
            )
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            source_sha256 = _require_string(
                request["source_sha256"],
                "source_sha256",
                request_id,
                max_length=64,
                ascii_only=True,
            )
            run_root = Path(_require_string(request["run_root"], "run_root", request_id))
            run = run_contamx(
                source_path,
                run_root=run_root,
                expected_source_path=source_path,
                expected_source_sha256=source_sha256,
            )
            return _success_envelope(
                request_id,
                {"result_type": "contamx_run", "run": run.to_dict()},
            )

        _require_object(
            request,
            "request",
            {
                "protocol_version",
                "request_id",
                "operation",
                "source_path",
                "output_path",
                "patch",
            },
            request_id,
        )
        source_path = Path(_require_string(request["source_path"], "source_path", request_id))
        output_path = Path(_require_string(request["output_path"], "output_path", request_id))
        patch = _decode_patch(request["patch"], request_id)
        application = apply_zone_volume_patch_to_copy(source_path, patch, output_path)
        created_output = (Path(application.output_path), application.output_sha256)
        project = read_simple_zones(created_output[0])
        if (
            project.source_sha256 != application.output_sha256
            or project.source_size_bytes != application.output_size_bytes
        ):
            raise RuntimeError("application result and project snapshot mismatch")
        target = next(
            (zone for zone in project.zones if zone.contam_number == patch.target.contam_number),
            None,
        )
        if target is None or target.volume_m3 != patch.replacement.new_value:
            raise RuntimeError("application target verification failed")
        result = _build_apply_result(application, project)
        created_output = None
        return _success_envelope(request_id, result)
    except BridgeRequestError as error:
        if created_output:
            _cleanup_verified_output(*created_output)
        return _error_envelope(error.request_id, error.diagnostic)
    except (PrjZoneReaderError, ZoneVolumePatchError, SimReadError, ContamXRunnerError) as error:
        if created_output:
            _cleanup_verified_output(*created_output)
        return _error_envelope(request_id, error.diagnostic)
    except SemanticPatchError as error:
        if created_output:
            _cleanup_verified_output(*created_output)
        return _error_envelope(request_id, _diagnostic(error.code, str(error)))
    except Exception:
        if created_output:
            _cleanup_verified_output(*created_output)
        return _error_envelope(
            request_id,
            _diagnostic("bridge_internal_error", "Zone桥发生未预期内部错误。"),
        )


def _decode_request(data: bytes) -> object:
    if len(data) > MAX_REQUEST_BYTES:
        raise BridgeRequestError(
            _diagnostic(
                "bridge_request_too_large",
                "桥接请求超过大小限制。",
                context={"max_bytes": MAX_REQUEST_BYTES},
            )
        )
    try:
        text = data.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        raise BridgeRequestError(
            _diagnostic("bridge_request_invalid_utf8", "桥接请求不是有效UTF-8。")
        ) from None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        raise BridgeRequestError(
            _diagnostic("bridge_request_invalid_json", "桥接请求不是有效JSON。")
        ) from None


def _configure_utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def main() -> int:
    _configure_utf8_streams()
    try:
        data = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
        payload = _decode_request(data)
        envelope = handle_request(payload)
    except BridgeRequestError as error:
        envelope = _error_envelope(error.request_id, error.diagnostic)
    except Exception:
        envelope = _error_envelope(
            "",
            _diagnostic("bridge_internal_error", "Zone桥发生未预期内部错误。"),
        )
    sys.stdout.write(json.dumps(envelope, ensure_ascii=False, separators=(",", ":")) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
