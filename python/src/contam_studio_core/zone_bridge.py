from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any, NoReturn

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

PROTOCOL_VERSION = "1.2"
OPERATION_READ_SIMPLE_ZONES = "read_simple_zones"
OPERATION_PLAN_ZONE_VOLUME_PATCH = "plan_zone_volume_patch"
OPERATION_APPLY_ZONE_VOLUME_PATCH = "apply_zone_volume_patch_to_copy"
OPERATION_EXTRACT_ZONE_AIR_STATE = "extract_zone_air_state"
OPERATION_RUN_ACTIVE_PROJECT = "run_active_project"
MAX_REQUEST_BYTES = 128 * 1024
MAX_REQUEST_ID_LENGTH = 128
MAX_SOURCE_PATH_LENGTH = 32_768
MAX_VOLUME_TOKEN_LENGTH = 80


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
    if not value.isascii() or any(ord(character) < 0x21 or ord(character) > 0x7E for character in value):
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
        schema_version=_require_string(patch["schema_version"], "schema_version", request_id, max_length=16, ascii_only=True),
        patch_type=_require_string(patch["patch_type"], "patch_type", request_id, max_length=80, ascii_only=True),
        source_path=_require_string(patch["source_path"], "source_path", request_id),
        source_sha256=_require_string(patch["source_sha256"], "source_sha256", request_id, max_length=64, ascii_only=True),
        source_size_bytes=_require_int(patch["source_size_bytes"], "source_size_bytes", request_id),
        reader_mode=_require_string(patch["reader_mode"], "reader_mode", request_id, max_length=80, ascii_only=True),
        header_version=_require_string(patch["header_version"], "header_version", request_id, max_length=32, ascii_only=True),
        target=PatchTarget(
            contam_number=_require_int(target["contam_number"], "target.contam_number", request_id),
            zone_name=_require_string(target["zone_name"], "target.zone_name", request_id, max_length=64, ascii_only=True),
            source_line_number=_require_int(target["source_line_number"], "target.source_line_number", request_id),
            field=_require_string(target["field"], "target.field", request_id, max_length=32, ascii_only=True),
            token_index=_require_int(target["token_index"], "target.token_index", request_id),
            byte_start=_require_int(target["byte_start"], "target.byte_start", request_id),
            byte_end=_require_int(target["byte_end"], "target.byte_end", request_id),
        ),
        preconditions=PatchPreconditions(
            source_sha256=_require_string(preconditions["source_sha256"], "preconditions.source_sha256", request_id, max_length=64, ascii_only=True),
            source_size_bytes=_require_int(preconditions["source_size_bytes"], "preconditions.source_size_bytes", request_id),
            reader_mode=_require_string(preconditions["reader_mode"], "preconditions.reader_mode", request_id, max_length=80, ascii_only=True),
            header_version=_require_string(preconditions["header_version"], "preconditions.header_version", request_id, max_length=32, ascii_only=True),
            contam_number=_require_int(preconditions["contam_number"], "preconditions.contam_number", request_id),
            source_line_number=_require_int(preconditions["source_line_number"], "preconditions.source_line_number", request_id),
            old_token=_require_string(preconditions["old_token"], "preconditions.old_token", request_id, max_length=80, ascii_only=True),
            old_value=_require_number(preconditions["old_value"], "preconditions.old_value", request_id),
        ),
        replacement=PatchReplacement(
            new_token=_require_string(replacement["new_token"], "replacement.new_token", request_id, max_length=80, ascii_only=True),
            new_value=_require_number(replacement["new_value"], "replacement.new_value", request_id),
        ),
        preview=PatchPreview(
            source_line_number=_require_int(preview["source_line_number"], "preview.source_line_number", request_id),
            old_token=_require_string(preview["old_token"], "preview.old_token", request_id, max_length=80, ascii_only=True),
            new_token=_require_string(preview["new_token"], "preview.new_token", request_id, max_length=80, ascii_only=True),
            old_line=_require_string(preview["old_line"], "preview.old_line", request_id, max_length=4096, ascii_only=True),
            new_line=_require_string(preview["new_line"], "preview.new_line", request_id, max_length=4096, ascii_only=True),
        ),
        status=_require_string(patch["status"], "status", request_id, max_length=32, ascii_only=True),
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


def handle_request(payload: object) -> dict[str, object]:
    request_id = ""
    created_output: tuple[Path, str] | None = None
    try:
        request, request_id, operation = _require_common(payload)
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
            manifest_path = Path(_require_string(request["manifest_path"], "manifest_path", request_id))
            source_path = Path(_require_string(request["source_path"], "source_path", request_id))
            source_sha256 = _require_string(
                request["source_sha256"], "source_sha256", request_id, max_length=64, ascii_only=True
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
