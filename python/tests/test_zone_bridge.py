from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import contam_studio_core.zone_bridge as bridge_module
from contam_studio_core.zone_bridge import (
    MAX_REQUEST_BYTES,
    PROTOCOL_VERSION,
    handle_request,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
OFFICIAL_PRJ = (
    REPO_ROOT
    / "fixtures"
    / "contam"
    / "official-contamxpy"
    / "test_GetPrjInfo.prj"
)


def _request(default_source_path: Path, **overrides: object) -> dict[str, object]:
    request: dict[str, object] = {
        "protocol_version": PROTOCOL_VERSION,
        "request_id": "f643e5e0-5770-4b10-95bf-caf5e674f581",
        "operation": "read_simple_zones",
        "source_path": str(default_source_path),
    }
    request.update(overrides)
    return request


def _run_bridge(data: bytes) -> subprocess.CompletedProcess[bytes]:
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    return subprocess.run(
        [sys.executable, "-m", "contam_studio_core.zone_bridge"],
        cwd=REPO_ROOT,
        input=data,
        capture_output=True,
        check=False,
        timeout=30,
        env=environment,
    )


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_success_envelope_preserves_request_id_and_source() -> None:
    before_hash = _sha256(OFFICIAL_PRJ)
    before_names = sorted(path.name for path in OFFICIAL_PRJ.parent.iterdir())

    envelope = handle_request(_request(OFFICIAL_PRJ))

    assert envelope["protocol_version"] == PROTOCOL_VERSION
    assert envelope["request_id"] == "f643e5e0-5770-4b10-95bf-caf5e674f581"
    assert envelope["ok"] is True
    assert envelope["error"] is None
    result = envelope["result"]
    assert isinstance(result, dict)
    assert result["declared_zone_count"] == 7
    assert result["first_zone"]["name"] == "One"
    assert result["source_unchanged"] is True
    assert _sha256(OFFICIAL_PRJ) == before_hash
    assert sorted(path.name for path in OFFICIAL_PRJ.parent.iterdir()) == before_names


def test_reader_error_uses_failure_envelope(tmp_path: Path) -> None:
    source = tmp_path / "unsupported.prj"
    source.write_text("ContamW 3.4.0.8 0\n", encoding="ascii")

    envelope = handle_request(_request(source))

    assert envelope["ok"] is False
    assert envelope["result"] is None
    assert envelope["request_id"] == "f643e5e0-5770-4b10-95bf-caf5e674f581"
    assert envelope["error"]["code"] == "unsupported_prj_version"


@pytest.mark.parametrize(
    ("overrides", "expected_code"),
    [
        ({"protocol_version": "2.0"}, "bridge_protocol_version_unsupported"),
        ({"operation": "unknown"}, "bridge_operation_unsupported"),
        ({"source_path": ""}, "bridge_request_invalid"),
        ({"request_id": ""}, "bridge_request_invalid"),
    ],
)
def test_invalid_request_fields_are_structured(
    overrides: dict[str, object], expected_code: str
) -> None:
    envelope = handle_request(_request(OFFICIAL_PRJ, **overrides))
    assert envelope["ok"] is False
    assert envelope["error"]["code"] == expected_code


def test_missing_fields_and_non_object_are_structured() -> None:
    for payload in ({}, [], None):
        envelope = handle_request(payload)
        assert envelope["ok"] is False
        assert envelope["request_id"] == ""
        assert envelope["error"]["code"] == "bridge_request_invalid"


def test_internal_exception_does_not_leak_traceback(monkeypatch) -> None:
    def fail(_path: Path):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(bridge_module, "read_simple_zones", fail)
    envelope = handle_request(_request(OFFICIAL_PRJ))
    serialized = json.dumps(envelope)

    assert envelope["ok"] is False
    assert envelope["error"]["code"] == "bridge_internal_error"
    assert "secret internal detail" not in serialized
    assert "Traceback" not in serialized


@pytest.mark.parametrize(
    ("data", "expected_code"),
    [
        (b"not-json", "bridge_request_invalid_json"),
        (b"\xff", "bridge_request_invalid_utf8"),
        (b" " * (MAX_REQUEST_BYTES + 1), "bridge_request_too_large"),
    ],
    ids=["invalid-json", "invalid-utf8", "oversized"],
)
def test_cli_invalid_stdin_outputs_one_json_envelope(
    data: bytes, expected_code: str
) -> None:
    completed = _run_bridge(data)

    assert completed.returncode == 0
    assert completed.stderr == b""
    assert completed.stdout.count(b"\n") == 1
    envelope = json.loads(completed.stdout)
    assert envelope["ok"] is False
    assert envelope["error"]["code"] == expected_code
    assert b"Traceback" not in completed.stdout


def test_cli_success_stdout_is_only_json_and_stderr_is_empty() -> None:
    completed = _run_bridge(json.dumps(_request(OFFICIAL_PRJ)).encode("utf-8"))

    assert completed.returncode == 0
    assert completed.stderr == b""
    assert completed.stdout.count(b"\n") == 1
    envelope = json.loads(completed.stdout)
    assert envelope["ok"] is True
    assert envelope["result"]["declared_zone_count"] == 7
