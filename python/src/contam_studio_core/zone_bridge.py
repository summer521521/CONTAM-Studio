from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from .prj_zone_models import ReaderDiagnostic
from .prj_zone_reader import PrjZoneReaderError, read_simple_zones

PROTOCOL_VERSION = "1.0"
OPERATION_READ_SIMPLE_ZONES = "read_simple_zones"
MAX_REQUEST_BYTES = 64 * 1024
MAX_REQUEST_ID_LENGTH = 128
MAX_SOURCE_PATH_LENGTH = 32_768


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


def _error_envelope(request_id: str, diagnostic: ReaderDiagnostic) -> dict[str, object]:
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


def _require_request(payload: object) -> tuple[str, Path]:
    if not isinstance(payload, dict):
        raise BridgeRequestError(
            _diagnostic("bridge_request_invalid", "桥接请求必须是JSON对象。")
        )

    request: dict[str, Any] = payload
    request_id = _safe_request_id(request.get("request_id"))
    if not request_id:
        raise BridgeRequestError(
            _diagnostic("bridge_request_invalid", "request_id缺失或格式无效。")
        )

    if request.get("protocol_version") != PROTOCOL_VERSION:
        raise BridgeRequestError(
            _diagnostic(
                "bridge_protocol_version_unsupported",
                "桥接协议版本不受支持。",
                context={"expected": PROTOCOL_VERSION},
            ),
            request_id,
        )

    if request.get("operation") != OPERATION_READ_SIMPLE_ZONES:
        raise BridgeRequestError(
            _diagnostic("bridge_operation_unsupported", "桥接操作不受支持。"),
            request_id,
        )

    source_path = request.get("source_path")
    if (
        not isinstance(source_path, str)
        or not source_path
        or len(source_path) > MAX_SOURCE_PATH_LENGTH
        or "\0" in source_path
    ):
        raise BridgeRequestError(
            _diagnostic("bridge_request_invalid", "source_path缺失或格式无效。"),
            request_id,
        )
    return request_id, Path(source_path)


def handle_request(payload: object) -> dict[str, object]:
    request_id = ""
    try:
        request_id, source_path = _require_request(payload)
        document = read_simple_zones(source_path)
        return _success_envelope(request_id, document.to_dict())
    except BridgeRequestError as error:
        return _error_envelope(error.request_id, error.diagnostic)
    except PrjZoneReaderError as error:
        return _error_envelope(request_id, error.diagnostic)
    except Exception:
        return _error_envelope(
            request_id,
            _diagnostic(
                "bridge_internal_error",
                "Zone读取桥发生未预期内部错误。",
            ),
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
            _diagnostic("bridge_internal_error", "Zone读取桥发生未预期内部错误。"),
        )
    sys.stdout.write(json.dumps(envelope, ensure_ascii=False, separators=(",", ":")) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
