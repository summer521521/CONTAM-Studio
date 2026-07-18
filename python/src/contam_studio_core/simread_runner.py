from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contamx_runner import (
    _controlled_environment,
    _pe_architecture,
    _sha256_file,
    _windows_file_version,
)
from .prj_zone_reader import read_simple_zones
from .zone_air_state_results import ZoneResultError, parse_zone_air_state
from .simread_models import (
    ResultDiagnostic,
    SimReadToolInfo,
    ZoneAirStateSeries,
)

SCHEMA_VERSION = "1.0"
EXECUTION_MODE = "isolated_simread_conversion"
EXPECTED_NAME = "simread.exe"
EXPECTED_VERSION = "3.4.0.3"
EXPECTED_SIZE = 34816
EXPECTED_SHA256 = "85af9b559debb6ecf9ba2f73705cef60f14d32c5f8ed9b524823fa3ac85a6958"
SIMREAD_ENVIRONMENT = "CONTAM_STUDIO_SIMREAD"
PROBE_TIMEOUT_SECONDS = 5
EXTRACT_TIMEOUT_SECONDS = 30
MAX_STREAM_BYTES = 4 * 1024 * 1024
MAX_OUTPUT_BYTES = 16 * 1024 * 1024
ERROR_EXIT_CODES = {
    name: 2 + index
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
        self.exit_code = ERROR_EXIT_CODES[diagnostic.code]


def _fail(code: str, message: str, context: dict[str, str | int] | None = None) -> None:
    raise SimReadError(ResultDiagnostic(code, message, context))


def _hash_size(path: Path) -> tuple[str, int]:
    try:
        return _sha256_file(path), path.stat().st_size
    except OSError:
        _fail("result_artifact_missing", "结果证据文件不存在。")
    raise AssertionError


def _resolve_tool(explicit: Path | None) -> Path:
    candidate = explicit or (
        Path(os.environ[SIMREAD_ENVIRONMENT]) if os.environ.get(SIMREAD_ENVIRONMENT) else None
    )
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
    if path.name.casefold() != EXPECTED_NAME:
        _fail("simread_unsupported", "SimRead文件名不是已验证名称。")
    return path


def _probe_output(path: Path) -> None:
    try:
        process = subprocess.run(
            [str(path)],
            cwd=path.parent,
            env=_controlled_environment(),
            shell=False,
            capture_output=True,
            timeout=PROBE_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired):
        _fail("simread_contract_unavailable", "无法验证SimRead调用契约。")
    if process.returncode != 1 or process.stdout:
        _fail("simread_contract_unavailable", "SimRead无参数契约不匹配。")
    try:
        text = process.stderr.decode("ascii")
    except UnicodeDecodeError:
        _fail("simread_contract_unavailable", "SimRead帮助输出不是ASCII。")
    required = (
        "simread - Read a binary CONTAM SIM results file",
        "Usage: simread <input-file>",
        "Automated processing",
    )
    if not all(item in text for item in required):
        _fail("simread_contract_unavailable", "SimRead帮助输出不完整。")


def probe_simread(explicit: Path | None = None) -> SimReadToolInfo:
    path = _resolve_tool(explicit)
    try:
        size = path.stat().st_size
        sha = _sha256_file(path)
        architecture = _pe_architecture(path)
        version = _windows_file_version(path)
    except SimReadError as exc:
        if exc.code == "contamx_solver_version_unavailable":
            _fail("simread_contract_unavailable", "无法读取SimRead版本资源。")
        raise
    if (
        size != EXPECTED_SIZE
        or sha.casefold() != EXPECTED_SHA256
        or architecture != "windows-x64"
        or version != EXPECTED_VERSION
    ):
        _fail("simread_unsupported", "SimRead身份与已验证官方版本不匹配。")
    _probe_output(path)
    return SimReadToolInfo(
        str(path),
        EXPECTED_NAME,
        EXPECTED_VERSION,
        sha,
        size,
        architecture,
        "NIST contam-x-3.4.0.3-win64.zip (SHA-256 verified)",
        "stdin_v1: blank dates; n; y; selected node; n",
    )


class _Capture:
    def __init__(self, stream, target: Path):
        self.stream, self.target = stream, target
        self.data = bytearray()
        self.truncated = False
        self.error: BaseException | None = None

    def drain(self) -> None:
        try:
            with self.target.open("wb") as output:
                while True:
                    chunk = self.stream.read(65536)
                    if not chunk:
                        break
                    remaining = MAX_STREAM_BYTES - len(self.data)
                    if remaining > 0:
                        self.data.extend(chunk[:remaining])
                    if len(chunk) > remaining:
                        self.truncated = True
                    output.write(chunk[: max(0, remaining)])
        except BaseException as exc:  # noqa: BLE001
            self.error = exc


def _run_process(
    tool: SimReadToolInfo, workspace: Path, sim_name: str, zone: int, evidence: Path
) -> tuple[int | None, bool, dict[str, Any], dict[str, Any]]:
    stdout_path, stderr_path = evidence / "stdout.bin", evidence / "stderr.bin"
    stdin = b"\n\nn\ny\n" + str(zone).encode("ascii") + b"\nn\n"
    try:
        process = subprocess.Popen(
            [tool.path, sim_name],
            cwd=workspace,
            env=_controlled_environment(),
            shell=False,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        out, err = _Capture(process.stdout, stdout_path), _Capture(process.stderr, stderr_path)
        threads = [threading.Thread(target=out.drain), threading.Thread(target=err.drain)]
        for thread in threads:
            thread.start()
        try:
            process.stdin.write(stdin)
            process.stdin.close()
        except OSError:
            pass
        try:
            exit_code = process.wait(timeout=EXTRACT_TIMEOUT_SECONDS)
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
            process.terminate()
            try:
                exit_code = process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                try:
                    exit_code = process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    _fail("simread_process_termination_failed", "无法确认SimRead进程已退出。")
        for thread in threads:
            thread.join(timeout=3)
        if any(thread.is_alive() for thread in threads) or out.error or err.error:
            _fail("simread_stream_capture_failed", "SimRead输出证据捕获失败。")
    except SimReadError:
        raise
    except (OSError, ValueError):
        _fail("simread_process_start_failed", "SimRead进程启动失败。")
    return (
        exit_code,
        timed_out,
        {
            "relative_path": "evidence/stdout.bin",
            "size_bytes": stdout_path.stat().st_size,
            "sha256": _sha256_file(stdout_path),
            "truncated": out.truncated,
        },
        {
            "relative_path": "evidence/stderr.bin",
            "size_bytes": stderr_path.stat().st_size,
            "sha256": _sha256_file(stderr_path),
            "truncated": err.truncated,
        },
    )


def _safe_relative(path_text: str, root: Path) -> Path:
    relative = Path(path_text)
    if relative.is_absolute() or ".." in relative.parts:
        _fail("result_artifact_path_invalid", "运行证据路径不安全。")
    resolved = (root / relative).resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError:
        _fail("result_artifact_path_invalid", "运行证据路径越界。")
    return resolved


def _load_run_manifest(path: Path) -> tuple[dict[str, Any], Path, dict[str, Any], dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        _fail("result_manifest_invalid", "Phase 4运行清单无法读取。")
    if (
        payload.get("schema_version") != "1.0"
        or payload.get("execution_mode") != "isolated_contamx_process"
    ):
        _fail("result_manifest_unsupported", "Phase 4运行清单版本或执行模式不受支持。")
    if (
        payload.get("status") != "succeeded"
        or payload.get("timed_out")
        or payload.get("exit_code") != 0
    ):
        _fail("result_run_not_succeeded", "Phase 4运行未成功完成。")
    if not payload.get("source", {}).get("unchanged") or any(
        not item.get("source_unchanged") for item in payload.get("input_snapshots", [])
    ):
        _fail("result_run_evidence_invalid", "Phase 4输入完整性证据无效。")
    solver = payload.get("solver", {})
    if solver.get("version") != EXPECTED_VERSION or solver.get("architecture") != "windows-x64":
        _fail("result_run_evidence_invalid", "Phase 4求解器身份证据无效。")
    run_root = path.resolve().parent.parent
    sims = [
        item
        for item in payload.get("artifacts", [])
        if item.get("classification") == "simulation_result"
        and str(item.get("relative_path", "")).casefold().endswith(".sim")
    ]
    if len(sims) != 1:
        _fail(
            "result_artifact_ambiguous" if len(sims) > 1 else "result_artifact_missing",
            "Phase 4主要SIM证据不明确。",
        )
    inputs = [
        item
        for item in payload.get("input_snapshots", [])
        if item.get("classification") == "input_snapshot"
        and str(item.get("relative_path", "")).casefold().endswith(".prj")
    ]
    if len(inputs) != 1:
        _fail("result_prj_snapshot_missing", "Phase 4 PRJ快照不明确。")
    sim, prj = sims[0], inputs[0]
    for item in (sim, prj):
        actual = _safe_relative(item["relative_path"], run_root)
        sha, size = _hash_size(actual)
        if sha.casefold() != str(
            item.get("sha256", item.get("snapshot_sha256", ""))
        ).casefold() or size != item.get("size_bytes", item.get("snapshot_size_bytes")):
            _fail("result_artifact_hash_mismatch", "Phase 4输入或SIM哈希不匹配。")
    if Path(sim["relative_path"]).stem.casefold() != Path(prj["relative_path"]).stem.casefold():
        _fail("result_run_evidence_invalid", "PRJ与SIM基名不匹配。")
    return payload, run_root, prj, sim


def _write_manifest(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, delete=False, newline="\n"
        ) as handle:
            temp = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, allow_nan=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temp, path)
        except FileExistsError:
            _fail("result_manifest_write_failed", "结果清单已存在。")
        finally:
            temp.unlink(missing_ok=True)
    except SimReadError:
        raise
    except (OSError, TypeError, ValueError):
        _fail("result_manifest_write_failed", "结果清单写入失败。")


def extract_zone_air_state(
    run_manifest_path: Path, *, simread_path: Path | None, result_root: Path, zone_number: int
) -> dict[str, Any]:
    started = time.time()
    started_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload, run_root, prj_entry, sim_entry = _load_run_manifest(run_manifest_path)
    source_prj = Path(payload["source"]["path"]).resolve()
    result_root = result_root.resolve()
    for forbidden in (source_prj.parent, run_root):
        try:
            result_root.relative_to(forbidden)
        except ValueError:
            continue
        _fail("result_root_conflicts_with_source", "结果工作区不能位于源项目或Phase 4运行目录内。")
    tool = probe_simread(simread_path)
    result_root.mkdir(parents=True, exist_ok=True)
    extraction_id = (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4)
    )
    extraction = result_root / extraction_id
    try:
        extraction.mkdir()
    except FileExistsError:
        _fail("result_workspace_exists", "结果提取目录已存在。")
    workspace, evidence = extraction / "workspace", extraction / "evidence"
    workspace.mkdir()
    evidence.mkdir()
    nfr = workspace / (Path(sim_entry["relative_path"]).stem + ".nfr")
    prj_src, sim_src = (
        _safe_relative(prj_entry["relative_path"], run_root),
        _safe_relative(sim_entry["relative_path"], run_root),
    )
    try:
        shutil.copy2(prj_src, workspace / prj_src.name)
        shutil.copy2(sim_src, workspace / sim_src.name)
        for src, entry in ((prj_src, prj_entry), (sim_src, sim_entry)):
            before = _hash_size(src)
            copied = _hash_size(workspace / src.name)
            after = _hash_size(src)
            expected = (
                entry.get("snapshot_sha256", entry.get("sha256")),
                entry.get("snapshot_size_bytes", entry.get("size_bytes")),
            )
            if before != after or before != expected or copied != expected:
                _fail("result_snapshot_mismatch", "结果输入快照校验失败。")
        exit_code, timed_out, stdout, stderr = _run_process(
            tool, workspace, sim_src.name, zone_number, evidence
        )
        if timed_out:
            _fail("simread_process_timeout", "SimRead进程超时。")
        if exit_code != 0:
            _fail("simread_process_failed", "SimRead进程失败。")
        nfr_candidates = list(workspace.glob("*.nfr"))
        if not nfr_candidates:
            _fail("simread_output_missing", "SimRead未生成节点结果文件。")
        if len(nfr_candidates) != 1:
            _fail("simread_output_ambiguous", "SimRead生成了多个节点结果文件。")
        nfr = nfr_candidates[0]
        if nfr.stat().st_size > MAX_OUTPUT_BYTES:
            _fail("simread_output_too_large", "SimRead结果文件过大。")
        zones = read_simple_zones(workspace / prj_src.name)
        selected = [z for z in zones.zones if z.contam_number == zone_number]
        if len(selected) != 1:
            _fail("zone_result_not_found", "目标Zone不存在。")
        samples = parse_zone_air_state(nfr, zone_number)
        series = ZoneAirStateSeries(
            SCHEMA_VERSION,
            "zone_air_state",
            payload["run_id"],
            extraction_id,
            zone_number,
            selected[0].name,
            selected[0].source_line_number,
            "SI",
            len(samples),
            samples,
            {
                "relative_path": f"workspace/{nfr.name}",
                "sha256": _sha256_file(nfr),
                "size_bytes": nfr.stat().st_size,
            },
        )
        outputs = []
        for file in workspace.iterdir():
            if file.is_file():
                outputs.append(
                    {
                        "relative_path": f"workspace/{file.name}",
                        "size_bytes": file.stat().st_size,
                        "sha256": _sha256_file(file),
                        "suffix": file.suffix,
                        "classification": "simulation_result"
                        if file.suffix == ".nfr"
                        else "other_generated_file",
                    }
                )
        manifest = {
            "schema_version": SCHEMA_VERSION,
            "extraction_id": extraction_id,
            "status": "succeeded",
            "execution_mode": EXECUTION_MODE,
            "started_at_utc": started_at,
            "ended_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "duration_ms": int((time.time() - started) * 1000),
            "source_run": {
                "run_id": payload["run_id"],
                "run_status": payload["status"],
                "solver_version": tool.version,
                "source_prj_sha256": payload["source"]["sha256"],
                "run_manifest_sha256": _sha256_file(run_manifest_path),
            },
            "run_manifest": str(run_manifest_path),
            "input_artifacts": [
                {
                    "relative_path": prj_entry["relative_path"],
                    "sha256": prj_entry.get("snapshot_sha256", prj_entry.get("sha256")),
                    "size_bytes": prj_entry.get("snapshot_size_bytes", prj_entry.get("size_bytes")),
                },
                {
                    "relative_path": sim_entry["relative_path"],
                    "sha256": sim_entry.get("sha256"),
                    "size_bytes": sim_entry.get("size_bytes"),
                },
            ],
            "simread": tool.to_dict(),
            "command": {
                "executable": tool.name,
                "arguments": [tool.name, sim_src.name],
                "stdin_contract": tool.invocation_contract,
            },
            "working_directory": "workspace",
            "stdout": stdout,
            "stderr": stderr,
            "generated_outputs": outputs,
            "result_type": "zone_air_state",
            "zone_number": zone_number,
            "parsed_result": {
                "zone_number": zone_number,
                "zone_name": selected[0].name,
                "sample_count": len(samples),
                "first_timestamp": samples[0].sim_time_seconds,
                "last_timestamp": samples[-1].sim_time_seconds,
                "output_contract_version": "1.0",
            },
            "diagnostics": [],
        }
        result_manifest_path = evidence / "result-manifest.json"
        _write_manifest(result_manifest_path, manifest)
        return {
            "extraction_id": extraction_id,
            "status": "succeeded",
            "result_manifest_path": str(result_manifest_path),
            "run_id": payload["run_id"],
            "zone_number": zone_number,
            "zone_name": selected[0].name,
            "sample_count": len(samples),
            "first_sample": samples[0].to_dict(),
            "parsed_result": series.to_dict(),
        }
    except (SimReadError, ZoneResultError) as exc:
        diagnostic = exc.diagnostic
        failure = {
            "schema_version": SCHEMA_VERSION,
            "extraction_id": extraction_id,
            "status": "failed",
            "execution_mode": EXECUTION_MODE,
            "started_at_utc": started_at,
            "ended_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "duration_ms": int((time.time() - started) * 1000),
            "source_run": {"run_id": payload["run_id"], "run_status": payload["status"]},
            "run_manifest": str(run_manifest_path),
            "input_artifacts": [],
            "simread": tool.to_dict(),
            "command": {},
            "working_directory": "workspace",
            "stdout": {},
            "stderr": {},
            "generated_outputs": [],
            "result_type": "zone_air_state",
            "zone_number": zone_number,
            "parsed_result": None,
            "diagnostics": [diagnostic.to_dict()],
        }
        try:
            _write_manifest(evidence / "result-manifest.json", failure)
        except SimReadError:
            pass
        raise


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
    except (SimReadError, ZoneResultError) as exc:
        print(json.dumps(exc.diagnostic.to_dict(), ensure_ascii=False), file=sys.stderr)
        return exc.exit_code if hasattr(exc, "exit_code") else 2
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
