from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contamx_runner import (
    EXPECTED_SOLVER_ARCHITECTURE,
    EXPECTED_SOLVER_NAME,
    EXPECTED_SOLVER_SHA256,
    EXPECTED_SOLVER_SIZE_BYTES,
    EXPECTED_SOLVER_VERSION,
    _controlled_environment,
    _pe_architecture,
    _sha256_file,
    _windows_file_version,
)
from .prj_zone_reader import PrjZoneReaderError, read_simple_zones
from .simread_models import (
    ResultDiagnostic,
    ResultExtractionManifest,
    RunManifestEvidence,
    SimReadToolInfo,
    ZoneAirStateSeries,
)
from .zone_air_state_results import ZoneResultError, parse_zone_air_state

SCHEMA_VERSION = "1.0"
EXECUTION_MODE = "isolated_simread_conversion"
PHASE4_EXECUTION_MODE = "isolated_contamx_process"
EXPECTED_SIMREAD_NAME = "simread.exe"
EXPECTED_SIMREAD_VERSION = "3.4.0.3"
EXPECTED_SIMREAD_SIZE_BYTES = 34816
EXPECTED_SIMREAD_SHA256 = "85af9b559debb6ecf9ba2f73705cef60f14d32c5f8ed9b524823fa3ac85a6958"
SIMREAD_INVOCATION_CONTRACT = "stdin_v1: blank dates; n; y; selected node; n"
# Compatibility aliases for the Phase 5A probe constants; the explicit names above
# are used by the hardened implementation.
EXPECTED_NAME = EXPECTED_SIMREAD_NAME
EXPECTED_VERSION = EXPECTED_SIMREAD_VERSION
EXPECTED_SIZE = EXPECTED_SIMREAD_SIZE_BYTES
EXPECTED_SHA256 = EXPECTED_SIMREAD_SHA256
SIMREAD_ENVIRONMENT = "CONTAM_STUDIO_SIMREAD"
PROBE_TIMEOUT_SECONDS = 5
EXTRACT_TIMEOUT_SECONDS = 30
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_STREAM_BYTES = 4 * 1024 * 1024
MAX_OUTPUT_BYTES = 16 * 1024 * 1024
ERROR_EXIT_CODES = {
    name: index + 2
    for index, name in enumerate(
        (
            "result_manifest_not_found",
            "result_manifest_invalid",
            "result_manifest_unsupported",
            "result_run_not_succeeded",
            "result_run_evidence_invalid",
            "result_artifact_missing",
            "result_artifact_ambiguous",
            "result_artifact_path_invalid",
            "result_artifact_hash_mismatch",
            "result_prj_snapshot_missing",
            "result_prj_snapshot_mismatch",
            "result_root_invalid",
            "result_root_conflicts_with_source",
            "result_workspace_exists",
            "result_snapshot_failed",
            "result_snapshot_mismatch",
            "simread_not_configured",
            "simread_not_found",
            "simread_path_invalid",
            "simread_unsupported",
            "simread_contract_unavailable",
            "simread_process_start_failed",
            "simread_process_timeout",
            "simread_process_failed",
            "simread_stream_capture_failed",
            "simread_process_termination_failed",
            "simread_stdin_failed",
            "simread_output_missing",
            "simread_output_ambiguous",
            "simread_output_too_large",
            "simread_output_invalid",
            "zone_result_not_found",
            "zone_result_ambiguous",
            "zone_result_contract_invalid",
            "result_manifest_write_failed",
            "result_internal_error",
        )
    )
}


class SimReadError(Exception):
    def __init__(self, diagnostic: ResultDiagnostic):
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic
        self.code = diagnostic.code
        self.exit_code = ERROR_EXIT_CODES[diagnostic.code]


def _fail(code: str, message: str, context: dict[str, str | int] | None = None) -> None:
    raise SimReadError(ResultDiagnostic(code, message, context))


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hash_size(path: Path, missing_code: str = "result_artifact_missing") -> tuple[str, int]:
    try:
        stat = path.stat()
        if not path.is_file() or stat.st_size < 0:
            _fail(missing_code, "证据文件不是普通文件。")
        return _sha256_file(path), stat.st_size
    except SimReadError:
        raise
    except OSError:
        _fail(missing_code, "证据文件不存在。")
    raise AssertionError


def _require_string(
    value: Any, field: str, *, nonempty: bool = True, max_length: int = 4096
) -> str:
    if not isinstance(value, str) or (nonempty and not value) or len(value) > max_length:
        _fail("result_manifest_invalid", f"Phase 4清单字段{field}类型无效。")
    return value


def _require_bool(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        _fail("result_manifest_invalid", f"Phase 4清单字段{field}类型无效。")
    return value


def _require_int(value: Any, field: str, *, nonnegative: bool = False) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or (nonnegative and value < 0):
        _fail("result_manifest_invalid", f"Phase 4清单字段{field}类型无效。")
    return value


def _resolve_tool(explicit: Path | None) -> Path:
    configured = os.environ.get(SIMREAD_ENVIRONMENT)
    candidate = explicit if explicit is not None else (Path(configured) if configured else None)
    if candidate is None:
        _fail("simread_not_configured", "未配置SimRead工具。")
    if not candidate.is_absolute():
        _fail("simread_path_invalid", "SimRead路径必须为绝对路径。")
    try:
        path = candidate.resolve(strict=True)
    except OSError:
        _fail("simread_not_found", "SimRead工具不存在。")
    if not path.is_file():
        _fail("simread_path_invalid", "SimRead路径不是普通文件。")
    if path.name.casefold() != EXPECTED_SIMREAD_NAME:
        _fail("simread_unsupported", "SimRead文件名不是已验证名称。")
    return path


class _BoundedCapture:
    def __init__(self, stream, target: Path | None):
        self.stream = stream
        self.target = target
        self.data = bytearray()
        self.truncated = False
        self.error: BaseException | None = None
        self.thread_finished = False

    def drain(self) -> None:
        try:
            output = self.target.open("wb") if self.target else None
            try:
                while True:
                    chunk = self.stream.read(65536)
                    if not chunk:
                        break
                    remaining = MAX_STREAM_BYTES - len(self.data)
                    if remaining > 0:
                        kept = chunk[:remaining]
                        self.data.extend(kept)
                        if output:
                            output.write(kept)
                    if len(chunk) > remaining:
                        self.truncated = True
            finally:
                if output:
                    output.flush()
                    os.fsync(output.fileno())
                    output.close()
        except BaseException as error:  # noqa: BLE001 - propagated as structured evidence error.
            self.error = error
        finally:
            self.thread_finished = True

    @property
    def capture_complete(self) -> bool:
        return self.thread_finished and self.error is None


@dataclass(frozen=True, slots=True)
class SimReadProcessOutcome:
    process_started: bool
    stdin_write_complete: bool
    exit_code: int | None
    timed_out: bool
    termination_attempted: bool
    terminate_requested: bool
    kill_requested: bool
    exit_confirmed: bool
    termination_succeeded: bool | None
    stdout: _BoundedCapture
    stderr: _BoundedCapture
    stream_capture_complete: bool
    diagnostic: ResultDiagnostic | None = None


def _capture_process_outcome(
    process: subprocess.Popen,
    *,
    timeout: int,
    evidence: Path | None,
    stdin_write_complete: bool = True,
) -> SimReadProcessOutcome:
    """Drain both streams and preserve all process evidence, including failures."""
    stdout = _BoundedCapture(process.stdout, evidence / "stdout.bin" if evidence else None)
    stderr = _BoundedCapture(process.stderr, evidence / "stderr.bin" if evidence else None)
    threads = [
        threading.Thread(target=stdout.drain, daemon=True),
        threading.Thread(target=stderr.drain, daemon=True),
    ]
    for thread in threads:
        thread.start()
    timed_out = False
    exit_code: int | None = None
    terminate_requested = False
    kill_requested = False
    exit_confirmed = False
    termination_succeeded: bool | None = None
    diagnostic: ResultDiagnostic | None = None

    initial_wait_error = False
    initial_wait_timeout = False

    def confirm_wait(wait_timeout: int) -> bool:
        nonlocal exit_code
        try:
            exit_code = process.wait(timeout=wait_timeout)
            return exit_code is not None
        except (subprocess.TimeoutExpired, OSError, AttributeError):
            return False

    try:
        exit_code = process.wait(timeout=timeout)
        exit_confirmed = exit_code is not None
    except subprocess.TimeoutExpired:
        initial_wait_timeout = True
    except (OSError, AttributeError):
        initial_wait_error = True
    if not exit_confirmed:
        try:
            poll = getattr(process, "poll", None)
            current_code = poll() if callable(poll) else getattr(process, "returncode", None)
            if current_code is not None:
                exit_code = current_code
                exit_confirmed = True
        except (OSError, AttributeError):
            pass
    if not exit_confirmed:
        timed_out = initial_wait_timeout
        terminate_requested = True
        try:
            process.terminate()
        except (OSError, AttributeError):
            pass
        exit_confirmed = confirm_wait(3)
        if not exit_confirmed:
            kill_requested = True
            try:
                process.kill()
            except (OSError, AttributeError):
                pass
            exit_confirmed = confirm_wait(3)
        termination_succeeded = exit_confirmed
        if not exit_confirmed:
            diagnostic = ResultDiagnostic(
                "simread_process_termination_failed", "SimRead进程终止状态无法可靠确认。"
            )
    for thread in threads:
        thread.join(timeout=3)
    stream_capture_complete = all(
        capture.capture_complete and not thread.is_alive()
        for thread, capture in zip(threads, (stdout, stderr), strict=True)
    )
    if diagnostic is None and not stream_capture_complete:
        diagnostic = ResultDiagnostic("simread_stream_capture_failed", "SimRead输出证据捕获失败。")
    elif diagnostic is None and initial_wait_error:
        diagnostic = ResultDiagnostic("simread_process_failed", "SimRead进程状态读取失败。")
    elif diagnostic is None and timed_out:
        diagnostic = ResultDiagnostic("simread_process_timeout", "SimRead进程超时。")
    return SimReadProcessOutcome(
        process_started=True,
        stdin_write_complete=stdin_write_complete,
        exit_code=exit_code,
        timed_out=timed_out,
        termination_attempted=terminate_requested or kill_requested,
        terminate_requested=terminate_requested,
        kill_requested=kill_requested,
        exit_confirmed=exit_confirmed,
        termination_succeeded=termination_succeeded,
        stdout=stdout,
        stderr=stderr,
        stream_capture_complete=stream_capture_complete,
        diagnostic=diagnostic,
    )


def _capture_process(
    process: subprocess.Popen, *, timeout: int, evidence: Path | None
) -> tuple[int | None, bool, _BoundedCapture, _BoundedCapture]:
    outcome = _capture_process_outcome(process, timeout=timeout, evidence=evidence)
    if outcome.diagnostic is not None:
        _fail(outcome.diagnostic.code, outcome.diagnostic.message)
    return outcome.exit_code, outcome.timed_out, outcome.stdout, outcome.stderr


def _probe_output(path: Path) -> None:
    try:
        process = subprocess.Popen(
            [str(path)],
            cwd=path.parent,
            env=_controlled_environment(),
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        exit_code, timed_out, stdout, stderr = _capture_process(
            process, timeout=PROBE_TIMEOUT_SECONDS, evidence=None
        )
    except SimReadError:
        raise
    except OSError:
        _fail("simread_contract_unavailable", "无法启动SimRead契约探测。")
    if timed_out or exit_code != 1 or stdout.data or stdout.truncated or stderr.truncated:
        _fail("simread_contract_unavailable", "SimRead无参数契约不匹配。")
    try:
        text = bytes(stderr.data).decode("ascii")
    except UnicodeDecodeError:
        _fail("simread_contract_unavailable", "SimRead帮助输出不是ASCII。")
    required = (
        "simread - Read a binary CONTAM SIM results file",
        "Usage: simread <input-file>",
        "Automated processing",
    )
    if not all(fragment in text for fragment in required):
        _fail("simread_contract_unavailable", "SimRead帮助输出不完整。")


def probe_simread(explicit: Path | None = None) -> SimReadToolInfo:
    path = _resolve_tool(explicit)
    before_sha, before_size = _hash_size(path, "simread_unsupported")
    try:
        architecture = _pe_architecture(path)
        version = _windows_file_version(path)
    except Exception as error:  # noqa: BLE001 - translate native evidence failures.
        if getattr(error, "code", "") == "contamx_solver_version_unavailable":
            _fail("simread_contract_unavailable", "无法读取SimRead版本资源。")
        _fail("simread_unsupported", "无法读取SimRead二进制身份。")
    if (
        before_size != EXPECTED_SIMREAD_SIZE_BYTES
        or before_sha.casefold() != EXPECTED_SIMREAD_SHA256
        or architecture != "windows-x64"
        or version != EXPECTED_SIMREAD_VERSION
    ):
        _fail("simread_unsupported", "SimRead身份与已验证官方版本不匹配。")
    _probe_output(path)
    after_sha, after_size = _hash_size(path, "simread_unsupported")
    if (before_sha, before_size) != (after_sha, after_size):
        _fail("simread_unsupported", "SimRead探测期间文件发生变化。")
    return SimReadToolInfo(
        str(path),
        EXPECTED_SIMREAD_NAME,
        EXPECTED_SIMREAD_VERSION,
        before_sha,
        before_size,
        "windows-x64",
        "NIST contam-x-3.4.0.3-win64.zip (SHA-256 verified)",
        SIMREAD_INVOCATION_CONTRACT,
    )


def _recheck_simread_identity(tool: SimReadToolInfo) -> None:
    """Confirm the executable used for formal extraction is the probed binary."""
    try:
        path = Path(tool.path).resolve(strict=True)
        digest, size = _hash_size(path, "simread_unsupported")
        architecture = _pe_architecture(path)
        version = _windows_file_version(path)
    except SimReadError:
        raise
    except Exception:
        _fail("simread_unsupported", "SimRead身份复核失败。")
    if (
        path.name.casefold() != EXPECTED_SIMREAD_NAME
        or digest.casefold() != EXPECTED_SIMREAD_SHA256
        or size != EXPECTED_SIMREAD_SIZE_BYTES
        or architecture != EXPECTED_SOLVER_ARCHITECTURE
        or version != EXPECTED_SIMREAD_VERSION
        or tool.path != str(path)
        or tool.sha256.casefold() != digest.casefold()
        or tool.size_bytes != size
        or tool.version != version
        or tool.architecture != architecture
    ):
        _fail("simread_unsupported", "SimRead身份与探测结果不一致。")


@dataclass(frozen=True, slots=True)
class ValidatedPhase4RunEvidence:
    manifest_path: Path
    manifest_bytes: bytes
    manifest_sha256: str
    run_directory: Path
    payload: dict[str, Any]
    run_id: str
    source: dict[str, Any]
    solver: dict[str, Any]
    prj_entry: dict[str, Any]
    sim_entry: dict[str, Any]
    prj_path: Path
    sim_path: Path
    prj_sha256: str
    prj_size_bytes: int
    sim_sha256: str
    sim_size_bytes: int


def _safe_relative(
    path_text: str, root: Path, invalid_code: str = "result_artifact_path_invalid"
) -> Path:
    if not isinstance(path_text, str) or not path_text or len(path_text) > 512:
        _fail(invalid_code, "证据相对路径无效。")
    relative = Path(path_text)
    if relative.is_absolute() or ".." in relative.parts:
        _fail(invalid_code, "证据路径不是安全相对路径。")
    resolved = (root / relative).resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError:
        _fail(invalid_code, "证据路径越界。")
    return resolved


def _validate_evidence_entry(entry: Any, *, snapshot: bool) -> dict[str, Any]:
    if not isinstance(entry, dict):
        _fail("result_manifest_invalid", "Phase 4文件证据项必须为对象。")
    relative_path = entry.get("relative_path")
    if not isinstance(relative_path, str) or not relative_path:
        _fail("result_manifest_invalid", "Phase 4文件证据路径无效。")
    sha_key = "snapshot_sha256" if snapshot else "sha256"
    size_key = "snapshot_size_bytes" if snapshot else "size_bytes"
    digest = entry.get(sha_key)
    size = entry.get(size_key)
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(char not in "0123456789abcdefABCDEF" for char in digest)
        or isinstance(size, bool)
        or not isinstance(size, int)
        or size < 0
    ):
        _fail("result_manifest_invalid", "Phase 4文件哈希或大小字段无效。")
    return entry


def _validate_prj_snapshot_entry(entry: Any) -> dict[str, Any]:
    """Validate every Phase 4 RunInputSnapshot field used by this trust boundary."""
    validated = _validate_evidence_entry(entry, snapshot=True)
    required = {
        "relative_path",
        "source_path",
        "source_sha256",
        "source_size_bytes",
        "snapshot_sha256",
        "snapshot_size_bytes",
        "classification",
        "source_unchanged",
    }
    if not required.issubset(validated):
        _fail("result_manifest_invalid", "Phase 4 PRJ输入快照缺少必需字段。")
    if validated.get("classification") != "input_snapshot":
        _fail("result_manifest_invalid", "Phase 4 PRJ输入快照分类无效。")
    if validated.get("source_unchanged") is not True:
        _fail("result_run_evidence_invalid", "Phase 4 PRJ源文件未保持不变。")
    _require_string(validated.get("source_path"), "input_snapshots.source_path")
    source_sha = _require_string(
        validated.get("source_sha256"), "input_snapshots.source_sha256", max_length=64
    )
    source_size = _require_int(
        validated.get("source_size_bytes"),
        "input_snapshots.source_size_bytes",
        nonnegative=True,
    )
    if len(source_sha) != 64 or any(char not in "0123456789abcdefABCDEF" for char in source_sha):
        _fail("result_manifest_invalid", "Phase 4 PRJ源哈希字段无效。")
    if source_size < 0:
        _fail("result_manifest_invalid", "Phase 4 PRJ源大小字段无效。")
    return validated


def _read_manifest_bytes(path: Path) -> tuple[bytes, dict[str, Any]]:
    if not path.exists():
        _fail("result_manifest_not_found", "Phase 4运行清单不存在。")
    if not path.is_file():
        _fail("result_manifest_invalid", "Phase 4运行清单不是普通文件。")
    try:
        data = path.read_bytes()
    except SimReadError:
        raise
    except OSError:
        _fail("result_manifest_invalid", "Phase 4运行清单无法读取。")
    if len(data) > MAX_MANIFEST_BYTES:
        _fail("result_manifest_invalid", "Phase 4运行清单过大。")
    try:
        text = data.decode("utf-8")
        payload = json.loads(
            text, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value))
        )
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError, ValueError):
        _fail("result_manifest_invalid", "Phase 4运行清单不是有效UTF-8 JSON。")
    if not isinstance(payload, dict):
        _fail("result_manifest_invalid", "Phase 4运行清单根必须是对象。")
    return data, payload


def _validate_phase4_manifest(path: Path) -> ValidatedPhase4RunEvidence:
    manifest_path = path.resolve()
    data, payload = _read_manifest_bytes(manifest_path)
    if (
        payload.get("schema_version") != "1.0"
        or payload.get("execution_mode") != PHASE4_EXECUTION_MODE
    ):
        _fail("result_manifest_unsupported", "Phase 4运行清单版本或执行模式不受支持。")
    if (
        payload.get("status") != "succeeded"
        or payload.get("timed_out") is not False
        or payload.get("exit_code") != 0
    ):
        _fail("result_run_not_succeeded", "Phase 4运行未成功完成。")
    run_id = _require_string(payload.get("run_id"), "run_id", max_length=128)
    source = payload.get("source")
    snapshots = payload.get("input_snapshots")
    artifacts = payload.get("artifacts")
    if (
        not isinstance(source, dict)
        or not isinstance(snapshots, list)
        or not snapshots
        or not isinstance(artifacts, list)
        or not artifacts
    ):
        _fail("result_manifest_invalid", "Phase 4运行清单基础字段类型无效。")
    source_sha = source.get("sha256")
    source_size = source.get("size_bytes")
    if (
        not isinstance(source_sha, str)
        or len(source_sha) != 64
        or any(char not in "0123456789abcdefABCDEF" for char in source_sha)
        or not isinstance(source_size, int)
        or isinstance(source_size, bool)
        or source_size < 0
    ):
        _fail("result_manifest_invalid", "Phase 4 source evidence is invalid.")
    if not _require_bool(source.get("unchanged"), "source.unchanged"):
        _fail("result_run_evidence_invalid", "Phase 4源项目未保持不变。")
    for item in snapshots:
        if not isinstance(item, dict):
            _fail("result_manifest_invalid", "Phase 4输入快照项必须为对象。")
        if item.get("source_unchanged") is not True:
            _fail("result_run_evidence_invalid", "Phase 4输入快照证据无效。")
    if "diagnostics" in payload and not isinstance(payload["diagnostics"], list):
        _fail("result_manifest_invalid", "Phase 4诊断字段类型无效。")
    diagnostics = payload.get("diagnostics")
    if not isinstance(diagnostics, list):
        _fail("result_manifest_invalid", "Phase 4诊断字段类型无效。")
    if diagnostics:
        _fail("result_run_evidence_invalid", "成功Phase 4清单不得包含诊断。")
    solver = payload.get("solver")
    if not isinstance(solver, dict):
        _fail("result_run_evidence_invalid", "Phase 4求解器身份缺失。")
    if (
        solver.get("name"),
        solver.get("version"),
        solver.get("architecture"),
        solver.get("size_bytes"),
        str(solver.get("sha256", "")).casefold(),
    ) != (
        EXPECTED_SOLVER_NAME,
        EXPECTED_SOLVER_VERSION,
        EXPECTED_SOLVER_ARCHITECTURE,
        EXPECTED_SOLVER_SIZE_BYTES,
        EXPECTED_SOLVER_SHA256,
    ):
        _fail("result_run_evidence_invalid", "Phase 4官方ContamX身份不匹配。")
    if not isinstance(solver.get("provenance"), str) or "NIST" not in solver["provenance"]:
        _fail("result_run_evidence_invalid", "Phase 4官方来源证据缺失。")
    run_directory = manifest_path.parent.parent
    sims = [
        item
        for item in artifacts
        if isinstance(item, dict)
        and item.get("classification") == "simulation_result"
        and isinstance(item.get("relative_path"), str)
        and item["relative_path"].casefold().endswith(".sim")
    ]
    prjs = [
        item
        for item in snapshots
        if isinstance(item, dict)
        and item.get("classification") == "input_snapshot"
        and isinstance(item.get("relative_path"), str)
        and item["relative_path"].casefold().endswith(".prj")
    ]
    if len(sims) != 1:
        _fail(
            "result_artifact_ambiguous" if len(sims) > 1 else "result_artifact_missing",
            "Phase 4主SIM证据不明确。",
        )
    if len(prjs) != 1:
        _fail(
            "result_artifact_ambiguous" if len(prjs) > 1 else "result_prj_snapshot_missing",
            "Phase 4主PRJ快照不明确。",
        )
    sim_entry = _validate_evidence_entry(sims[0], snapshot=False)
    prj_entry = _validate_prj_snapshot_entry(prjs[0])
    if sim_entry.get("classification") != "simulation_result":
        _fail("result_manifest_invalid", "Phase 4 SIM证据分类无效。")
    if prj_entry.get("classification") != "input_snapshot":
        _fail("result_manifest_invalid", "Phase 4 PRJ证据分类无效。")
    if sim_entry.get("size_bytes") == 0:
        _fail("result_artifact_missing", "Phase 4 SIM结果不能为空。")
    sim_path = _safe_relative(sim_entry["relative_path"], run_directory)
    prj_path = _safe_relative(prj_entry["relative_path"], run_directory)
    for entry, actual, sha_field, size_field, code in (
        (sim_entry, sim_path, "sha256", "size_bytes", "result_artifact_hash_mismatch"),
        (
            prj_entry,
            prj_path,
            "snapshot_sha256",
            "snapshot_size_bytes",
            "result_prj_snapshot_mismatch",
        ),
    ):
        sha, size = _hash_size(actual, code)
        expected_sha = entry.get(sha_field)
        expected_size = entry.get(size_field)
        if (
            not isinstance(expected_sha, str)
            or len(expected_sha) != 64
            or any(c not in "0123456789abcdefABCDEF" for c in expected_sha)
            or not isinstance(expected_size, int)
            or isinstance(expected_size, bool)
            or expected_size < 0
        ):
            _fail("result_manifest_invalid", "Phase 4文件证据字段无效。")
        if sha.casefold() != expected_sha.casefold() or size != expected_size:
            _fail(code, "Phase 4文件哈希或大小不匹配。")
    source_path_text = _require_string(source.get("path"), "source.path")
    if not Path(source_path_text).is_absolute():
        _fail("result_manifest_invalid", "Phase 4 source.path必须是绝对路径。")
    source_path = Path(source_path_text).resolve()
    source_actual_sha, source_actual_size = _hash_size(source_path, "result_run_evidence_invalid")
    if source_actual_sha.casefold() != source_sha.casefold() or source_actual_size != source_size:
        _fail("result_run_evidence_invalid", "Phase 4源文件哈希或大小不匹配。")
    prj_source_path = prj_entry.get("source_path")
    if not isinstance(prj_source_path, str) or not prj_source_path:
        _fail("result_manifest_invalid", "Phase 4 PRJ source_path字段无效。")
    if not Path(prj_source_path).is_absolute():
        _fail("result_manifest_invalid", "Phase 4 PRJ source_path必须是绝对路径。")
    if prj_source_path != source_path_text:
        _fail("result_prj_snapshot_mismatch", "Phase 4 source.path与PRJ source_path不一致。")
    if Path(prj_source_path).resolve() != source_path:
        _fail("result_prj_snapshot_mismatch", "Phase 4源PRJ路径不匹配。")
    if (
        prj_entry["source_sha256"].casefold() != source_sha.casefold()
        or prj_entry["snapshot_sha256"].casefold() != source_sha.casefold()
        or prj_entry["source_size_bytes"] != source_size
        or prj_entry["snapshot_size_bytes"] != source_size
    ):
        _fail("result_prj_snapshot_mismatch", "Phase 4 PRJ源证据与运行快照不一致。")
    if Path(prj_entry["source_path"]).resolve() != source_path:
        _fail("result_prj_snapshot_mismatch", "Phase 4 PRJ source_path不匹配。")
    if prj_entry["source_sha256"].casefold() != prj_entry["snapshot_sha256"].casefold():
        _fail("result_prj_snapshot_mismatch", "Phase 4 PRJ源哈希与快照哈希不一致。")
    if prj_entry["source_size_bytes"] != prj_entry["snapshot_size_bytes"]:
        _fail("result_prj_snapshot_mismatch", "Phase 4 PRJ源大小与快照大小不一致。")
    if sim_path.stem.casefold() != prj_path.stem.casefold():
        _fail("result_run_evidence_invalid", "Phase 4 PRJ与SIM基名不匹配。")
    return ValidatedPhase4RunEvidence(
        manifest_path,
        data,
        _sha256_bytes(data),
        run_directory,
        payload,
        run_id,
        source,
        solver,
        prj_entry,
        sim_entry,
        prj_path,
        sim_path,
        prj_entry["snapshot_sha256"].lower(),
        prj_entry["snapshot_size_bytes"],
        sim_entry["sha256"].lower(),
        sim_entry["size_bytes"],
    )


def _recheck(evidence: ValidatedPhase4RunEvidence) -> None:
    current_bytes, _ = _read_manifest_bytes(evidence.manifest_path)
    if (
        _sha256_bytes(current_bytes) != evidence.manifest_sha256
        or current_bytes != evidence.manifest_bytes
    ):
        _fail("result_run_evidence_invalid", "Phase 4运行清单在提取期间发生变化。")
    for path, expected_sha, expected_size in (
        (evidence.prj_path, evidence.prj_sha256, evidence.prj_size_bytes),
        (evidence.sim_path, evidence.sim_sha256, evidence.sim_size_bytes),
    ):
        sha, size = _hash_size(path, "result_artifact_hash_mismatch")
        if sha.casefold() != expected_sha.casefold() or size != expected_size:
            _fail("result_run_evidence_invalid", "Phase 4 PRJ或SIM在提取期间发生变化。")


def _recheck_workspace_inputs(
    workspace_prj: Path,
    expected_prj_sha256: str,
    expected_prj_size: int,
    workspace_sim: Path,
    expected_sim_sha256: str,
    expected_sim_size: int,
) -> None:
    """Recheck the exact PRJ and SIM bytes passed to SimRead."""
    for path, expected_sha, expected_size in (
        (workspace_prj, expected_prj_sha256, expected_prj_size),
        (workspace_sim, expected_sim_sha256, expected_sim_size),
    ):
        actual_sha, actual_size = _hash_size(path, "result_snapshot_mismatch")
        if actual_sha.casefold() != expected_sha.casefold() or actual_size != expected_size:
            _fail("result_snapshot_mismatch", "SimRead工作区输入快照已变化。")


def _artifact_records(workspace: Path, excluded_names: set[str] | None = None) -> list[dict[str, Any]]:
    excluded = {name.casefold() for name in (excluded_names or set())}
    records = []
    for path in sorted(workspace.iterdir(), key=lambda value: value.name.casefold()):
        if not path.is_file() or path.name.casefold() in excluded:
            continue
        records.append(
            {
                "relative_path": f"workspace/{path.name}",
                "size_bytes": path.stat().st_size,
                "sha256": _sha256_file(path),
                "suffix": path.suffix,
                "classification": "simulation_result"
                if path.suffix.casefold() == ".nfr"
                else "other_generated_file",
            }
        )
    return records


def _stream_evidence(capture: _BoundedCapture, evidence_path: Path) -> dict[str, Any]:
    size = evidence_path.stat().st_size if evidence_path.exists() else 0
    return {
        "relative_path": f"evidence/{evidence_path.name}",
        "size_bytes": size,
        "sha256": _sha256_file(evidence_path) if evidence_path.exists() else _sha256_bytes(b""),
        "truncated": capture.truncated,
        "capture_complete": capture.capture_complete,
    }


def _collect_final_evidence(
    evidence: ValidatedPhase4RunEvidence,
    workspace_prj: Path | None,
    workspace_sim: Path | None,
    tool: SimReadToolInfo | None,
) -> dict[str, bool | None]:
    """Collect all final evidence without allowing a second failure to erase a manifest."""
    status: dict[str, bool | None] = {
        "phase4_manifest_unchanged": False,
        "phase4_prj_unchanged": False,
        "phase4_sim_unchanged": False,
        "workspace_prj_unchanged": False,
        "workspace_sim_unchanged": False,
        "simread_unchanged": None,
    }
    try:
        current_manifest = evidence.manifest_path.read_bytes()
        status["phase4_manifest_unchanged"] = (
            current_manifest == evidence.manifest_bytes
            and _sha256_bytes(current_manifest) == evidence.manifest_sha256
        )
    except OSError:
        pass
    for key, path, expected_sha, expected_size in (
        ("phase4_prj_unchanged", evidence.prj_path, evidence.prj_sha256, evidence.prj_size_bytes),
        ("phase4_sim_unchanged", evidence.sim_path, evidence.sim_sha256, evidence.sim_size_bytes),
    ):
        try:
            actual_sha, actual_size = _hash_size(path)
            status[key] = actual_sha.casefold() == expected_sha.casefold() and actual_size == expected_size
        except SimReadError:
            pass
    for key, path, expected_sha, expected_size in (
        ("workspace_prj_unchanged", workspace_prj, evidence.prj_sha256, evidence.prj_size_bytes),
        ("workspace_sim_unchanged", workspace_sim, evidence.sim_sha256, evidence.sim_size_bytes),
    ):
        if path is None:
            continue
        try:
            actual_sha, actual_size = _hash_size(path)
            status[key] = actual_sha.casefold() == expected_sha.casefold() and actual_size == expected_size
        except SimReadError:
            pass
    if tool is not None:
        try:
            _recheck_simread_identity(tool)
            status["simread_unchanged"] = True
        except SimReadError:
            status["simread_unchanged"] = False
    return status


def _normalize_result_manifest(payload: dict[str, Any]) -> dict[str, Any]:
    """Build both success and failure JSON through the same declared model."""
    source_run = dict(payload.get("source_run") or {})
    if "solver" not in source_run:
        source_run["solver"] = {
            "name": source_run.pop("contamx_solver_name", None),
            "version": source_run.pop("contamx_solver_version", None),
            "architecture": source_run.pop("contamx_solver_architecture", EXPECTED_SOLVER_ARCHITECTURE),
            "size_bytes": source_run.pop("contamx_solver_size_bytes", EXPECTED_SOLVER_SIZE_BYTES),
            "sha256": source_run.pop("contamx_solver_sha256", None),
            "provenance": source_run.pop("contamx_solver_provenance", "NIST official package"),
        }
    source_run.setdefault("phase4_prj_unchanged", True)
    source_run.setdefault("phase4_sim_unchanged", True)
    run_manifest = payload.get("run_manifest")
    if isinstance(run_manifest, dict):
        run_manifest_model = RunManifestEvidence(
            str(run_manifest.get("path", "")),
            str(run_manifest.get("sha256", source_run.get("run_manifest_sha256", ""))),
            bool(run_manifest.get("unchanged", source_run.get("run_manifest_unchanged", False))),
        )
    else:
        run_manifest_model = RunManifestEvidence(
            str(run_manifest or ""),
            str(source_run.get("run_manifest_sha256", "")),
            bool(source_run.get("run_manifest_unchanged", False)),
        )
    command = dict(payload.get("command") or {})
    process = dict(payload.get("process") or {})
    process.setdefault("process_started", bool(command.get("process_started", False)))
    process.setdefault("stdin_write_complete", False)
    process.setdefault("termination_attempted", False)
    process.setdefault("terminate_requested", process.get("termination_attempted", False))
    process.setdefault("kill_requested", False)
    process.setdefault("exit_confirmed", payload.get("exit_code") is not None)
    process.setdefault("termination_succeeded", None)
    process.setdefault("stream_capture_complete", bool(process["process_started"]))
    process.setdefault("diagnostic_code", None)
    return ResultExtractionManifest(
        schema_version=str(payload.get("schema_version", SCHEMA_VERSION)),
        extraction_id=str(payload["extraction_id"]),
        status=str(payload["status"]),
        execution_mode=str(payload.get("execution_mode", EXECUTION_MODE)),
        started_at_utc=str(payload["started_at_utc"]),
        ended_at_utc=str(payload["ended_at_utc"]),
        duration_ms=int(payload.get("duration_ms", 0)),
        source_run=source_run,
        run_manifest=run_manifest_model,
        input_artifacts=tuple(payload.get("input_artifacts") or ()),
        simread=payload.get("simread"),
        command=command,
        process=process,
        working_directory=str(payload.get("working_directory", "workspace")),
        exit_code=payload.get("exit_code"),
        timed_out=bool(payload.get("timed_out", False)),
        stdout=dict(payload.get("stdout") or {}),
        stderr=dict(payload.get("stderr") or {}),
        generated_outputs=tuple(payload.get("generated_outputs") or ()),
        result_type=str(payload.get("result_type", "zone_air_state")),
        zone_number=int(payload.get("zone_number", 0)),
        parsed_result=payload.get("parsed_result"),
        final_evidence=dict(payload.get("final_evidence") or {}),
        diagnostics=tuple(
            ResultDiagnostic(
                str(item.get("code", "result_internal_error")),
                str(item.get("message", "Result extraction failed.")),
                item.get("context"),
            )
            for item in (payload.get("diagnostics") or ())
            if isinstance(item, dict)
        ),
    ).to_dict()


def _write_manifest(path: Path, payload: dict[str, Any]) -> None:
    try:
        payload = _normalize_result_manifest(payload)
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", newline="\n", dir=path.parent, delete=False
        ) as handle:
            temporary = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, allow_nan=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            _fail("result_manifest_write_failed", "结果清单已存在。")
        finally:
            temporary.unlink(missing_ok=True)
    except SimReadError:
        raise
    except (OSError, TypeError, ValueError, KeyError, AttributeError):
        _fail("result_manifest_write_failed", "结果清单写入失败。")


def _failure_manifest(
    evidence: ValidatedPhase4RunEvidence,
    tool: SimReadToolInfo | None,
    extraction_id: str,
    started_at: str,
    extraction: Path,
    zone_number: int,
    diagnostic: ResultDiagnostic,
    *,
    command: dict[str, Any],
    process_started: bool,
    exit_code: int | None,
    timed_out: bool,
    input_artifacts: list[dict[str, Any]],
    stdout: dict[str, Any],
    stderr: dict[str, Any],
    duration_ms: int = 0,
    process_outcome: SimReadProcessOutcome | None = None,
    final_evidence: dict[str, bool | None] | None = None,
) -> dict[str, Any]:
    workspace = extraction / "workspace"
    try:
        manifest_unchanged = evidence.manifest_path.read_bytes() == evidence.manifest_bytes
    except OSError:
        manifest_unchanged = False
    try:
        prj_unchanged = _hash_size(evidence.prj_path) == (
            evidence.prj_sha256,
            evidence.prj_size_bytes,
        )
    except SimReadError:
        prj_unchanged = False
    try:
        sim_unchanged = _hash_size(evidence.sim_path) == (
            evidence.sim_sha256,
            evidence.sim_size_bytes,
        )
    except SimReadError:
        sim_unchanged = False
    source_run = {
        "run_id": evidence.run_id,
        "run_status": evidence.payload["status"],
        "contamx_solver_name": evidence.solver["name"],
        "contamx_solver_version": evidence.solver["version"],
        "contamx_solver_architecture": evidence.solver["architecture"],
        "contamx_solver_size_bytes": evidence.solver["size_bytes"],
        "contamx_solver_sha256": evidence.solver["sha256"],
        "contamx_solver_provenance": evidence.solver["provenance"],
        "source_prj_sha256": evidence.source["sha256"],
        "run_manifest_sha256": evidence.manifest_sha256,
        "run_manifest_unchanged": manifest_unchanged,
        "phase4_prj_unchanged": prj_unchanged,
        "phase4_sim_unchanged": sim_unchanged,
    }
    process = {
        "process_started": process_started,
        "stdin_write_complete": False,
        "termination_attempted": False,
        "terminate_requested": False,
        "kill_requested": False,
        "exit_confirmed": exit_code is not None,
        "termination_succeeded": None,
        "stream_capture_complete": stdout.get("capture_complete", True)
        and stderr.get("capture_complete", True),
        "diagnostic_code": diagnostic.code,
    }
    if process_outcome is not None:
        process = {
            "process_started": process_outcome.process_started,
            "stdin_write_complete": process_outcome.stdin_write_complete,
            "termination_attempted": process_outcome.termination_attempted,
            "terminate_requested": process_outcome.terminate_requested,
            "kill_requested": process_outcome.kill_requested,
            "exit_confirmed": process_outcome.exit_confirmed,
            "termination_succeeded": process_outcome.termination_succeeded,
            "stream_capture_complete": process_outcome.stream_capture_complete,
            "diagnostic_code": diagnostic.code,
        }
    return {
        "schema_version": SCHEMA_VERSION,
        "extraction_id": extraction_id,
        "status": "failed",
        "execution_mode": EXECUTION_MODE,
        "started_at_utc": started_at,
        "ended_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "duration_ms": duration_ms,
        "source_run": source_run,
        "run_manifest": str(evidence.manifest_path),
        "input_artifacts": input_artifacts,
        "simread": tool.to_dict() if tool is not None else None,
        "command": {**command, "process_started": process_started},
        "process": process,
        "working_directory": "workspace",
        "exit_code": exit_code,
        "timed_out": timed_out,
        "stdout": stdout,
        "stderr": stderr,
        "generated_outputs": (
            _artifact_records(workspace, {evidence.prj_path.name, evidence.sim_path.name})
            if workspace.exists()
            else []
        ),
        "result_type": "zone_air_state",
        "zone_number": zone_number,
        "parsed_result": None,
        "final_evidence": final_evidence or _collect_final_evidence(
            evidence,
            workspace / evidence.prj_path.name,
            workspace / evidence.sim_path.name,
            tool,
        ),
        "diagnostics": [diagnostic.to_dict()],
    }


def extract_zone_air_state(
    run_manifest_path: Path, *, simread_path: Path | None, result_root: Path, zone_number: int
) -> dict[str, Any]:
    started = time.time()
    started_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    evidence = _validate_phase4_manifest(run_manifest_path)
    if isinstance(zone_number, bool) or not isinstance(zone_number, int) or zone_number <= 0:
        _fail("zone_result_not_found", "Zone编号必须为正整数。")
    source_directory = Path(evidence.source["path"]).resolve().parent
    run_directory = evidence.run_directory.resolve()
    root = result_root.resolve()
    for forbidden in (source_directory, run_directory):
        try:
            root.relative_to(forbidden)
        except ValueError:
            continue
        _fail(
            "result_root_conflicts_with_source", "结果工作区不能位于源项目或Phase 4运行目录树内。"
        )
    _recheck(evidence)
    try:
        result_root.mkdir(parents=True, exist_ok=True)
        root = result_root.resolve(strict=True)
        for forbidden in (source_directory, run_directory):
            try:
                root.relative_to(forbidden)
            except ValueError:
                continue
            _fail("result_root_conflicts_with_source", "结果工作区规范化后与受保护目录冲突。")
    except SimReadError:
        raise
    except OSError:
        _fail("result_root_invalid", "结果工作区无法创建。")
    _recheck(evidence)
    extraction_id = (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4)
    )
    extraction = root / extraction_id
    try:
        extraction.mkdir()
        workspace, evidence_dir = extraction / "workspace", extraction / "evidence"
        workspace.mkdir()
        evidence_dir.mkdir()
    except FileExistsError:
        _fail("result_workspace_exists", "结果提取目录已存在。")
    except OSError:
        _fail("result_root_invalid", "结果提取目录无法创建。")
    stdout_meta = {
        "relative_path": "evidence/stdout.bin",
        "size_bytes": 0,
        "sha256": _sha256_bytes(b""),
        "truncated": False,
        "capture_complete": True,
    }
    stderr_meta = {
        "relative_path": "evidence/stderr.bin",
        "size_bytes": 0,
        "sha256": _sha256_bytes(b""),
        "truncated": False,
        "capture_complete": True,
    }
    (evidence_dir / "stdout.bin").write_bytes(b"")
    (evidence_dir / "stderr.bin").write_bytes(b"")
    workspace_prj = workspace / evidence.prj_path.name
    workspace_sim = workspace / evidence.sim_path.name
    tool: SimReadToolInfo | None = None
    command = {
        "executable": EXPECTED_SIMREAD_NAME,
        "arguments": [EXPECTED_SIMREAD_NAME, evidence.sim_path.name],
        "stdin_contract": SIMREAD_INVOCATION_CONTRACT,
    }
    input_artifacts: list[dict[str, Any]] = []
    process_started = False
    exit_code: int | None = None
    timed_out = False
    process_outcome: SimReadProcessOutcome | None = None
    try:
        _recheck(evidence)
        for source, entry, name, expected_sha, expected_size in (
            (
                evidence.prj_path,
                evidence.prj_entry,
                evidence.prj_path.name,
                evidence.prj_sha256,
                evidence.prj_size_bytes,
            ),
            (
                evidence.sim_path,
                evidence.sim_entry,
                evidence.sim_path.name,
                evidence.sim_sha256,
                evidence.sim_size_bytes,
            ),
        ):
            destination = workspace / name
            before = _hash_size(source, "result_snapshot_mismatch")
            shutil.copy2(source, destination)
            copied = _hash_size(destination, "result_snapshot_mismatch")
            after = _hash_size(source, "result_snapshot_mismatch")
            if before != after or copied != (expected_sha, expected_size):
                _fail("result_snapshot_mismatch", "结果输入快照三方校验失败。")
            input_artifacts.append(
                {
                    "relative_path": entry["relative_path"],
                    "classification": "input_snapshot",
                    "source_sha256": expected_sha,
                    "source_size_bytes": expected_size,
                    "workspace_relative_path": f"workspace/{name}",
                    "snapshot_sha256": copied[0],
                    "snapshot_size_bytes": copied[1],
                    "source_unchanged": True,
                }
            )
        _recheck_workspace_inputs(
            workspace_prj,
            evidence.prj_sha256,
            evidence.prj_size_bytes,
            workspace_sim,
            evidence.sim_sha256,
            evidence.sim_size_bytes,
        )
        _recheck(evidence)
        zones = read_simple_zones(workspace_prj)
        selected = [zone for zone in zones.zones if zone.contam_number == zone_number]
        if len(selected) != 1:
            diagnostic = ResultDiagnostic("zone_result_not_found", "目标Zone不存在。")
            failure = _failure_manifest(
                evidence,
                tool,
                extraction_id,
                started_at,
                extraction,
                zone_number,
                diagnostic,
                command=command,
                process_started=False,
                exit_code=None,
                timed_out=False,
                input_artifacts=input_artifacts,
                stdout=stdout_meta,
                stderr=stderr_meta,
                duration_ms=int((time.time() - started) * 1000),
                process_outcome=process_outcome,
                final_evidence=_collect_final_evidence(evidence, workspace_prj, workspace_sim, tool),
            )
            _write_manifest(evidence_dir / "result-manifest.json", failure)
            raise SimReadError(diagnostic)
        _recheck(evidence)
        tool = probe_simread(simread_path)
        command = {
            "executable": tool.name,
            "arguments": [tool.name, evidence.sim_path.name],
            "stdin_contract": SIMREAD_INVOCATION_CONTRACT,
        }
        _recheck_workspace_inputs(
            workspace / evidence.prj_path.name,
            evidence.prj_sha256,
            evidence.prj_size_bytes,
            workspace / evidence.sim_path.name,
            evidence.sim_sha256,
            evidence.sim_size_bytes,
        )
        _recheck(evidence)
        _recheck_simread_identity(tool)
        try:
            process = subprocess.Popen(
                [tool.path, evidence.sim_path.name],
                cwd=workspace,
                env=_controlled_environment(),
                shell=False,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except OSError:
            _fail("simread_process_start_failed", "SimRead进程启动失败。")
        process_started = True
        stdin = b"\n\nn\ny\n" + str(zone_number).encode("ascii") + b"\nn\n"
        try:
            process.stdin.write(stdin)
            process.stdin.flush()
        except OSError:
            try:
                process.stdin.close()
            except OSError:
                pass
            try:
                process_outcome = _capture_process_outcome(
                    process, timeout=3, evidence=evidence_dir, stdin_write_complete=False
                )
                exit_code = process_outcome.exit_code
                timed_out = process_outcome.timed_out
                stdout_meta = _stream_evidence(process_outcome.stdout, evidence_dir / "stdout.bin")
                stderr_meta = _stream_evidence(process_outcome.stderr, evidence_dir / "stderr.bin")
            except SimReadError:
                pass
            if process_outcome.diagnostic is not None:
                _fail(process_outcome.diagnostic.code, process_outcome.diagnostic.message)
            _fail("simread_stdin_failed", "SimRead固定输入写入失败。")
        finally:
            try:
                process.stdin.close()
            except OSError:
                pass
        process_outcome = _capture_process_outcome(
            process, timeout=EXTRACT_TIMEOUT_SECONDS, evidence=evidence_dir
        )
        exit_code = process_outcome.exit_code
        timed_out = process_outcome.timed_out
        stdout_capture = process_outcome.stdout
        stderr_capture = process_outcome.stderr
        stdout_meta = _stream_evidence(stdout_capture, evidence_dir / "stdout.bin")
        stderr_meta = _stream_evidence(stderr_capture, evidence_dir / "stderr.bin")
        _recheck_workspace_inputs(
            workspace_prj,
            evidence.prj_sha256,
            evidence.prj_size_bytes,
            workspace_sim,
            evidence.sim_sha256,
            evidence.sim_size_bytes,
        )
        _recheck_simread_identity(tool)
        if process_outcome.diagnostic is not None:
            _fail(process_outcome.diagnostic.code, process_outcome.diagnostic.message)
        if stdout_capture.truncated or stderr_capture.truncated:
            _fail("simread_output_too_large", "SimRead标准流超过证据上限。")
        if timed_out:
            _fail("simread_process_timeout", "SimRead进程超时。")
        if exit_code != 0:
            _fail("simread_process_failed", "SimRead进程失败。")
        _recheck(evidence)
        nfrs = sorted(workspace.glob("*.nfr"), key=lambda value: value.name.casefold())
        if not nfrs:
            _fail("simread_output_missing", "SimRead未生成节点结果文件。")
        if len(nfrs) != 1:
            _fail("simread_output_ambiguous", "SimRead生成了多个节点结果文件。")
        if nfrs[0].stat().st_size > MAX_OUTPUT_BYTES:
            _fail("simread_output_too_large", "SimRead结果文件过大。")
        samples = parse_zone_air_state(nfrs[0], zone_number)
        series = ZoneAirStateSeries(
            SCHEMA_VERSION,
            "zone_air_state",
            evidence.run_id,
            extraction_id,
            zone_number,
            selected[0].name,
            selected[0].source_line_number,
            "SI",
            len(samples),
            samples,
            {
                "relative_path": f"workspace/{nfrs[0].name}",
                "sha256": _sha256_file(nfrs[0]),
                "size_bytes": nfrs[0].stat().st_size,
            },
            day_type_source="not_available_in_simread_nfr_v1",
            time_contract="elapsed_seconds_from_first_sample",
            diagnostics=(
                ResultDiagnostic(
                    "day_type_not_available", "官方NFR未提供CONTAM日类型，未进行推断。"
                ),
            ),
        )
        _recheck_workspace_inputs(
            workspace_prj,
            evidence.prj_sha256,
            evidence.prj_size_bytes,
            workspace_sim,
            evidence.sim_sha256,
            evidence.sim_size_bytes,
        )
        _recheck_simread_identity(tool)
        _recheck(evidence)
        final_evidence = _collect_final_evidence(evidence, workspace_prj, workspace_sim, tool)
        if not all(
            final_evidence.get(key) is True
            for key in (
                "phase4_manifest_unchanged",
                "phase4_prj_unchanged",
                "phase4_sim_unchanged",
                "workspace_prj_unchanged",
                "workspace_sim_unchanged",
                "simread_unchanged",
            )
        ):
            _fail("result_run_evidence_invalid", "结果提取最终证据复核失败。")
        result_manifest = {
            "schema_version": SCHEMA_VERSION,
            "extraction_id": extraction_id,
            "status": "succeeded",
            "execution_mode": EXECUTION_MODE,
            "started_at_utc": started_at,
            "ended_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "duration_ms": int((time.time() - started) * 1000),
            "source_run": {
                "run_id": evidence.run_id,
                "run_status": evidence.payload["status"],
                "contamx_solver_name": evidence.solver["name"],
                "contamx_solver_version": evidence.solver["version"],
                "contamx_solver_architecture": evidence.solver["architecture"],
                "contamx_solver_size_bytes": evidence.solver["size_bytes"],
                "contamx_solver_sha256": evidence.solver["sha256"],
                "contamx_solver_provenance": evidence.solver["provenance"],
                "source_prj_sha256": evidence.source["sha256"],
                "run_manifest_sha256": evidence.manifest_sha256,
                "run_manifest_unchanged": True,
            },
            "run_manifest": str(evidence.manifest_path),
            "input_artifacts": input_artifacts,
            "simread": tool.to_dict(),
            "command": {**command, "process_started": True},
            "process": {
                "process_started": process_outcome.process_started if process_outcome else True,
                "stdin_write_complete": process_outcome.stdin_write_complete if process_outcome else True,
                "termination_attempted": process_outcome.termination_attempted if process_outcome else False,
                "terminate_requested": process_outcome.terminate_requested if process_outcome else False,
                "kill_requested": process_outcome.kill_requested if process_outcome else False,
                "exit_confirmed": process_outcome.exit_confirmed if process_outcome else True,
                "termination_succeeded": process_outcome.termination_succeeded if process_outcome else None,
                "stream_capture_complete": process_outcome.stream_capture_complete if process_outcome else True,
                "diagnostic_code": None,
            },
            "working_directory": "workspace",
            "exit_code": exit_code,
            "timed_out": timed_out,
            "stdout": stdout_meta,
            "stderr": stderr_meta,
            "generated_outputs": _artifact_records(
                workspace, {evidence.prj_path.name, evidence.sim_path.name}
            ),
            "result_type": "zone_air_state",
            "zone_number": zone_number,
            "parsed_result": {
                "zone_number": zone_number,
                "zone_name": selected[0].name,
                "sample_count": len(samples),
                "first_timestamp": samples[0].sim_time_seconds,
                "last_timestamp": samples[-1].sim_time_seconds,
                "output_contract_version": "1.0",
                "day_type_source": "not_available_in_simread_nfr_v1",
                "time_contract": "elapsed_seconds_from_first_sample",
            },
            "final_evidence": final_evidence,
            "diagnostics": [item.to_dict() for item in series.diagnostics],
        }
        result_manifest_path = evidence_dir / "result-manifest.json"
        _write_manifest(result_manifest_path, result_manifest)
        return {
            "extraction_id": extraction_id,
            "status": "succeeded",
            "result_manifest_path": str(result_manifest_path),
            "run_id": evidence.run_id,
            "zone_number": zone_number,
            "zone_name": selected[0].name,
            "sample_count": len(samples),
            "first_sample": samples[0].to_dict(),
            "parsed_result": series.to_dict(),
        }
    except (SimReadError, ZoneResultError) as error:
        diagnostic = error.diagnostic
        if not (evidence_dir / "result-manifest.json").exists():
            failure = _failure_manifest(
                evidence,
                tool,
                extraction_id,
                started_at,
                extraction,
                zone_number,
                diagnostic,
                command=command,
                process_started=process_started,
                exit_code=exit_code,
                timed_out=timed_out,
                input_artifacts=input_artifacts,
                stdout=stdout_meta,
                stderr=stderr_meta,
                duration_ms=int((time.time() - started) * 1000),
                process_outcome=process_outcome,
            )
            try:
                _write_manifest(evidence_dir / "result-manifest.json", failure)
            except SimReadError:
                pass
        raise
    except PrjZoneReaderError:
        diagnostic = ResultDiagnostic(
            "result_prj_snapshot_mismatch", "绑定的Phase 4 PRJ快照不符合严格Zone读取契约。"
        )
        if not (evidence_dir / "result-manifest.json").exists():
            failure = _failure_manifest(
                evidence,
                tool,
                extraction_id,
                started_at,
                extraction,
                zone_number,
                diagnostic,
                command=command,
                process_started=process_started,
                exit_code=exit_code,
                timed_out=timed_out,
                input_artifacts=input_artifacts,
                stdout=stdout_meta,
                stderr=stderr_meta,
                duration_ms=int((time.time() - started) * 1000),
                process_outcome=process_outcome,
            )
            try:
                _write_manifest(evidence_dir / "result-manifest.json", failure)
            except SimReadError:
                pass
        raise SimReadError(diagnostic)
    except Exception:
        diagnostic = ResultDiagnostic("result_internal_error", "结果提取失败。")
        if not (evidence_dir / "result-manifest.json").exists():
            failure = _failure_manifest(
                evidence,
                tool,
                extraction_id,
                started_at,
                extraction,
                zone_number,
                diagnostic,
                command=command,
                process_started=process_started,
                exit_code=exit_code,
                timed_out=timed_out,
                input_artifacts=input_artifacts,
                stdout=stdout_meta,
                stderr=stderr_meta,
                duration_ms=int((time.time() - started) * 1000),
                process_outcome=process_outcome,
            )
            try:
                _write_manifest(evidence_dir / "result-manifest.json", failure)
            except SimReadError:
                pass
        raise SimReadError(diagnostic)


def _cli() -> int:
    parser = argparse.ArgumentParser(prog="zone_air_state_results")
    sub = parser.add_subparsers(dest="command", required=True)
    probe = sub.add_parser("probe-simread")
    probe.add_argument("--simread", type=Path)
    probe.add_argument("--json", action="store_true")
    extract = sub.add_parser("extract")
    extract.add_argument("manifest", type=Path)
    extract.add_argument("--simread", type=Path)
    extract.add_argument("--result-root", type=Path, required=True)
    extract.add_argument("--zone-number", type=int, required=True)
    extract.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        result = (
            probe_simread(args.simread).to_dict()
            if args.command == "probe-simread"
            else extract_zone_air_state(
                args.manifest,
                simread_path=args.simread,
                result_root=args.result_root,
                zone_number=args.zone_number,
            )
        )
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 0
    except (SimReadError, ZoneResultError) as error:
        print(json.dumps(error.diagnostic.to_dict(), ensure_ascii=False), file=sys.stderr)
        return error.exit_code
    except Exception:
        print(
            json.dumps(
                {"code": "result_internal_error", "message": "结果提取失败。", "context": None},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        return ERROR_EXIT_CODES["result_internal_error"]


if __name__ == "__main__":
    raise SystemExit(_cli())
