from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import secrets
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .contamx_run_models import (
    ContamXSolverInfo,
    ContamXRunManifest,
    ContamXRunResult,
    RunArtifact,
    RunDiagnostic,
    RunInputSnapshot,
    RunStreamEvidence,
)

SCHEMA_VERSION = "1.0"
EXECUTION_MODE = "isolated_contamx_process"
SOLVER_ENVIRONMENT = "CONTAM_STUDIO_CONTAMX"
EXPECTED_SOLVER_NAME = "contamx3.exe"
EXPECTED_ARCHITECTURE = "windows-x64"
EXPECTED_RESULT_SUFFIX = ".sim"
RUN_TIMEOUT_SECONDS = 60
MAX_STREAM_BYTES = 4 * 1024 * 1024
ERROR_EXIT_CODES = {
    "contamx_solver_not_configured": 2,
    "contamx_solver_not_found": 3,
    "contamx_solver_path_invalid": 4,
    "contamx_solver_version_unavailable": 5,
    "contamx_solver_unsupported": 6,
    "run_source_not_found": 7,
    "run_source_invalid": 8,
    "run_root_invalid": 9,
    "run_workspace_exists": 10,
    "run_snapshot_failed": 11,
    "run_snapshot_mismatch": 12,
    "run_process_start_failed": 13,
    "run_process_timeout": 14,
    "run_process_failed": 15,
    "run_stdout_too_large": 16,
    "run_stderr_too_large": 17,
    "run_expected_artifact_missing": 18,
    "run_source_changed": 19,
    "run_manifest_write_failed": 20,
    "run_internal_error": 21,
}


class ContamXRunnerError(Exception):
    def __init__(self, diagnostic: RunDiagnostic):
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic
        self.code = diagnostic.code
        self.exit_code = ERROR_EXIT_CODES[diagnostic.code]


def _fail(code: str, message: str, **context: str | int | bool) -> None:
    raise ContamXRunnerError(RunDiagnostic(code=code, message=message, context=context or None))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _file_hash_and_size(path: Path) -> tuple[str, int]:
    return _sha256_file(path), path.stat().st_size


def _solver_path(explicit: Path | None) -> Path:
    if explicit is not None:
        candidate = explicit
    else:
        configured = os.environ.get(SOLVER_ENVIRONMENT)
        if not configured:
            _fail("contamx_solver_not_configured", "未配置ContamX可执行文件。")
        candidate = Path(configured)
    if not candidate.is_absolute():
        _fail("contamx_solver_path_invalid", "ContamX路径必须是绝对路径。")
    try:
        normalized = candidate.expanduser().resolve(strict=True)
    except OSError:
        _fail("contamx_solver_not_found", "ContamX可执行文件不存在。")
    if not normalized.is_file():
        _fail("contamx_solver_path_invalid", "ContamX路径不是普通文件。")
    if normalized.name.casefold() != EXPECTED_SOLVER_NAME:
        _fail("contamx_solver_unsupported", "ContamX文件名不是已验证的官方名称。")
    return normalized


def _windows_file_version(path: Path) -> str:
    if os.name != "nt":
        _fail("contamx_solver_version_unavailable", "当前平台无法读取Windows文件版本资源。")
    try:
        version = ctypes.windll.version
        size = version.GetFileVersionInfoSizeW(str(path), None)
        if not size:
            raise OSError
        buffer = ctypes.create_string_buffer(size)
        if not version.GetFileVersionInfoW(str(path), 0, size, buffer):
            raise OSError
        pointer = ctypes.c_void_p()
        length = ctypes.c_uint()
        if not version.VerQueryValueW(buffer, "\\", ctypes.byref(pointer), ctypes.byref(length)):
            raise OSError

        class FixedFileInfo(ctypes.Structure):
            _fields_ = [
                ("signature", ctypes.c_uint32),
                ("struct_version", ctypes.c_uint32),
                ("file_version_ms", ctypes.c_uint32),
                ("file_version_ls", ctypes.c_uint32),
                ("product_version_ms", ctypes.c_uint32),
                ("product_version_ls", ctypes.c_uint32),
            ]

        info = ctypes.cast(pointer, ctypes.POINTER(FixedFileInfo)).contents
        if info.signature != 0xFEEF04BD:
            raise OSError
        parts = (
            info.file_version_ms >> 16,
            info.file_version_ms & 0xFFFF,
            info.file_version_ls >> 16,
            info.file_version_ls & 0xFFFF,
        )
        return ".".join(str(part) for part in parts)
    except (AttributeError, OSError, ValueError):
        _fail("contamx_solver_version_unavailable", "无法可靠读取ContamX文件版本资源。")
    raise AssertionError("unreachable")


def _pe_architecture(path: Path) -> str:
    try:
        with path.open("rb") as stream:
            stream.seek(0x3C)
            header_offset = struct.unpack("<I", stream.read(4))[0]
            stream.seek(header_offset + 4)
            machine = struct.unpack("<H", stream.read(2))[0]
    except (OSError, struct.error):
        _fail("contamx_solver_unsupported", "无法读取ContamX可执行文件架构。")
    if machine != 0x8664:
        _fail("contamx_solver_unsupported", "ContamX不是已验证的Windows x64可执行文件。")
    return EXPECTED_ARCHITECTURE


def probe_solver(solver: Path | None = None) -> ContamXSolverInfo:
    path = _solver_path(solver)
    sha256, size = _file_hash_and_size(path)
    return ContamXSolverInfo(
        path=str(path),
        name=path.name,
        version=_windows_file_version(path),
        sha256=sha256,
        size_bytes=size,
        architecture=_pe_architecture(path),
        provenance="NIST official CONTAM 3.4.0.8 Windows 64-bit package",
    )


def _directory_files(directory: Path) -> tuple[str, ...]:
    return tuple(sorted(item.name for item in directory.iterdir() if item.is_file()))


def _safe_relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _make_run_id() -> str:
    return _utc_now().strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4)


def _atomic_manifest_write(path: Path, manifest: ContamXRunManifest) -> None:
    data = json.dumps(manifest.to_dict(), ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
    fd, temporary_name = tempfile.mkstemp(prefix=".manifest-", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    linked = False
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path)
        linked = True
    except FileExistsError:
        _fail("run_manifest_write_failed", "运行清单已存在，拒绝覆盖既有运行证据。")
    except OSError:
        _fail("run_manifest_write_failed", "无法安全写入运行清单。")
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            if linked:
                path.unlink(missing_ok=True)


@dataclass(slots=True)
class _StreamCapture:
    path: Path
    buffer_limit: int = MAX_STREAM_BYTES
    total_bytes: int = 0
    truncated: bool = False
    digest: object = None

    def __post_init__(self) -> None:
        self.digest = hashlib.sha256()

    def read(self, stream) -> None:
        with self.path.open("wb") as output:
            while True:
                chunk = stream.read(64 * 1024)
                if not chunk:
                    break
                self.total_bytes += len(chunk)
                if self.total_bytes <= self.buffer_limit:
                    output.write(chunk)
                    self.digest.update(chunk)
                else:
                    allowed = max(0, self.buffer_limit - (self.total_bytes - len(chunk)))
                    if allowed:
                        output.write(chunk[:allowed])
                        self.digest.update(chunk[:allowed])
                    self.truncated = True

    def evidence(self, root: Path) -> RunStreamEvidence:
        return RunStreamEvidence(
            relative_path=_safe_relative(self.path, root),
            size_bytes=self.path.stat().st_size,
            sha256=self.digest.hexdigest(),
            truncated=self.truncated,
        )


def _classify_artifact(path: Path) -> str:
    suffix = path.suffix.casefold()
    if suffix == ".sim":
        return "simulation_result"
    if suffix in {".log", ".xlog"}:
        return "solver_log"
    return "other_generated_file"


def _collect_artifacts(workspace: Path, snapshot_names: set[str]) -> tuple[RunArtifact, ...]:
    artifacts: list[RunArtifact] = []
    for path in sorted(item for item in workspace.rglob("*") if item.is_file()):
        if path.name in snapshot_names:
            classification = "input_snapshot"
        else:
            classification = _classify_artifact(path)
        sha256, size = _file_hash_and_size(path)
        artifacts.append(
            RunArtifact(
                relative_path=_safe_relative(path, workspace.parent),
                size_bytes=size,
                sha256=sha256,
                suffix=path.suffix.casefold(),
                classification=classification,
            )
        )
    return tuple(artifacts)


def _process_environment() -> dict[str, str]:
    environment = os.environ.copy()
    for key in (SOLVER_ENVIRONMENT, "CONTAM_STUDIO_PYTHON", "PYTHONPATH", "PYTHONHOME"):
        environment.pop(key, None)
    return environment


def _start_process(
    solver: ContamXSolverInfo,
    snapshot_name: str,
    workspace: Path,
    stdout_capture: _StreamCapture,
    stderr_capture: _StreamCapture,
) -> tuple[int | None, bool]:
    try:
        process = subprocess.Popen(
            [solver.path, snapshot_name],
            cwd=workspace,
            env=_process_environment(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=False,
        )
    except OSError:
        _fail("run_process_start_failed", "无法启动ContamX进程。")
    assert process.stdout is not None and process.stderr is not None
    stdout_thread = threading.Thread(target=stdout_capture.read, args=(process.stdout,), daemon=True)
    stderr_thread = threading.Thread(target=stderr_capture.read, args=(process.stderr,), daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    timed_out = False
    try:
        process.wait(timeout=RUN_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        timed_out = True
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    stdout_thread.join(timeout=5)
    stderr_thread.join(timeout=5)
    return process.returncode, timed_out


def _manifest_result(
    manifest: ContamXRunManifest,
    run_directory: Path,
    manifest_path: Path,
) -> ContamXRunResult:
    primary = tuple(item for item in manifest.artifacts if item.suffix == EXPECTED_RESULT_SUFFIX)
    return ContamXRunResult(
        run_id=manifest.run_id,
        status=manifest.status,
        run_directory=str(run_directory),
        manifest_path=str(manifest_path),
        solver_version=manifest.solver.version,
        exit_code=manifest.exit_code,
        timed_out=manifest.timed_out,
        primary_artifacts=primary,
        manifest=manifest,
    )


def run_contamx(
    source_path: Path,
    *,
    solver: Path | None = None,
    run_root: Path,
    companion_paths: Iterable[Path] = (),
) -> ContamXRunResult:
    source = Path(source_path).expanduser().resolve()
    if source.suffix.casefold() != ".prj":
        _fail("run_source_invalid", "运行输入必须是.prj文件。")
    if not source.is_file():
        _fail("run_source_not_found", "运行源PRJ不存在。")
    root = Path(run_root).expanduser().resolve()
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError:
        _fail("run_root_invalid", "运行根目录无法创建或访问。")
    if not root.is_dir():
        _fail("run_root_invalid", "运行根目录不是目录。")
    solver_info = probe_solver(solver)
    run_id = _make_run_id()
    run_directory = root / run_id
    try:
        run_directory.mkdir()
        workspace = run_directory / "workspace"
        evidence = run_directory / "evidence"
        workspace.mkdir()
        evidence.mkdir()
    except FileExistsError:
        _fail("run_workspace_exists", "运行目录已存在，拒绝复用。")
    except OSError:
        _fail("run_root_invalid", "无法创建独立运行工作区。")

    source_hash, source_size = _file_hash_and_size(source)
    source_files_before = _directory_files(source.parent)
    started = _utc_now()
    snapshot_records: list[RunInputSnapshot] = []
    input_paths = [source, *[Path(item).expanduser().resolve() for item in companion_paths]]
    for input_path in input_paths:
        if not input_path.is_file():
            _fail("run_snapshot_failed", "显式配套输入文件不存在。", path=input_path.name)
        if input_path.parent != source.parent and input_path != source:
            _fail("run_snapshot_failed", "配套输入文件必须来自源PRJ目录。", path=input_path.name)
        destination = workspace / input_path.name
        try:
            shutil.copy2(input_path, destination)
            copied_hash, copied_size = _file_hash_and_size(destination)
            original_hash, original_size = _file_hash_and_size(input_path)
        except OSError:
            _fail("run_snapshot_failed", "无法复制输入快照。", path=input_path.name)
        if copied_hash != original_hash or copied_size != original_size:
            _fail("run_snapshot_mismatch", "输入快照哈希或大小与源文件不一致。", path=input_path.name)
        snapshot_records.append(
            RunInputSnapshot(
                relative_path=f"workspace/{input_path.name}",
                source_path=str(input_path),
                source_sha256=original_hash,
                source_size_bytes=original_size,
                snapshot_sha256=copied_hash,
                snapshot_size_bytes=copied_size,
            )
        )

    stdout_capture = _StreamCapture(evidence / "stdout.bin")
    stderr_capture = _StreamCapture(evidence / "stderr.bin")
    stdout_capture.path.touch()
    stderr_capture.path.touch()
    exit_code: int | None = None
    timed_out = False
    diagnostics: list[RunDiagnostic] = []
    try:
        exit_code, timed_out = _start_process(
            solver_info,
            source.name,
            workspace,
            stdout_capture,
            stderr_capture,
        )
    except ContamXRunnerError as error:
        diagnostics.append(error.diagnostic)
    ended = _utc_now()
    source_hash_after, source_size_after = _file_hash_and_size(source)
    source_files_after = _directory_files(source.parent)
    unchanged = (
        source_hash_after == source_hash
        and source_size_after == source_size
        and source_files_after == source_files_before
    )
    if not unchanged:
        diagnostics.append(RunDiagnostic("run_source_changed", "源PRJ或其目录内容在运行期间发生变化。"))
    if timed_out:
        diagnostics.append(RunDiagnostic("run_process_timeout", "ContamX运行超过固定超时并已终止。"))
    elif exit_code not in (None, 0):
        diagnostics.append(RunDiagnostic("run_process_failed", "ContamX返回非零退出码。", {"exit_code": exit_code}))
    stdout_evidence = stdout_capture.evidence(run_directory)
    stderr_evidence = stderr_capture.evidence(run_directory)
    if stdout_capture.truncated:
        diagnostics.append(RunDiagnostic("run_stdout_too_large", "ContamX标准输出超过证据上限并已截断。"))
    if stderr_capture.truncated:
        diagnostics.append(RunDiagnostic("run_stderr_too_large", "ContamX标准错误超过证据上限并已截断。"))
    artifacts = _collect_artifacts(workspace, {item.name for item in input_paths})
    primary = tuple(item for item in artifacts if item.suffix == EXPECTED_RESULT_SUFFIX and item.size_bytes > 0)
    if not primary:
        diagnostics.append(RunDiagnostic("run_expected_artifact_missing", "未发现非空的官方主要SIM结果文件。"))
    if unchanged and not timed_out and exit_code == 0 and primary and not stdout_capture.truncated and not stderr_capture.truncated:
        status = "succeeded"
    elif timed_out:
        status = "timed_out"
    else:
        status = "failed"
    source_dict = {
        "path": str(source),
        "sha256": source_hash,
        "size_bytes": source_size,
        "unchanged": unchanged,
        "directory_files_before": list(source_files_before),
        "directory_files_after": list(source_files_after),
    }
    manifest = ContamXRunManifest(
        schema_version=SCHEMA_VERSION,
        run_id=run_id,
        status=status,
        execution_mode=EXECUTION_MODE,
        started_at_utc=_iso(started),
        ended_at_utc=_iso(ended),
        duration_ms=max(0, int((ended - started).total_seconds() * 1000)),
        source=source_dict,
        input_snapshots=tuple(snapshot_records),
        solver=solver_info,
        command={"executable": solver_info.name, "arguments": [source.name]},
        working_directory="workspace",
        exit_code=exit_code,
        timed_out=timed_out,
        stdout=stdout_evidence,
        stderr=stderr_evidence,
        artifacts=artifacts,
        diagnostics=tuple(diagnostics),
    )
    manifest_path = evidence / "manifest.json"
    try:
        _atomic_manifest_write(manifest_path, manifest)
    except ContamXRunnerError:
        raise
    return _manifest_result(manifest, run_directory, manifest_path)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="在隔离工作区运行官方ContamX并生成可追溯运行清单。")
    subparsers = parser.add_subparsers(dest="operation", required=True)
    probe = subparsers.add_parser("probe", help="验证ContamX路径和版本")
    probe.add_argument("--solver", type=Path)
    probe.add_argument("--json", action="store_true", required=True)
    run = subparsers.add_parser("run", help="复制PRJ快照并在隔离工作区运行ContamX")
    run.add_argument("source", type=Path)
    run.add_argument("--solver", type=Path)
    run.add_argument("--run-root", type=Path, required=True)
    run.add_argument("--json", action="store_true", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8")
    args = _parser().parse_args(argv)
    try:
        if args.operation == "probe":
            print(json.dumps(probe_solver(args.solver).to_dict(), ensure_ascii=False, indent=2))
        else:
            result = run_contamx(args.source, solver=args.solver, run_root=args.run_root)
            print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
            if result.status != "succeeded":
                return ERROR_EXIT_CODES.get(result.manifest.diagnostics[0].code, 21) if result.manifest.diagnostics else 21
    except ContamXRunnerError as error:
        print(json.dumps(error.diagnostic.to_dict(), ensure_ascii=False), file=sys.stderr)
        return error.exit_code
    except Exception:
        print(json.dumps({"code": "run_internal_error", "message": "运行核心发生未公开的内部错误。", "context": {}}, ensure_ascii=False), file=sys.stderr)
        return ERROR_EXIT_CODES["run_internal_error"]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
