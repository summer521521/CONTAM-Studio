from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from .models import Diagnostic, ProjectInspection, ProjectMetadata, ZoneInspection

SCHEMA_VERSION = "1.0"
EXECUTION_MODE = "isolated_steady_initialization"
WORKER_FLAG = "--_contamxpy-worker"
WORKER_RESULT_NAME = "inspection-result.json"
WORKER_SOURCE_NAME = "inspection-source.prj"


class InspectionError(Exception):
    exit_code = 6
    code = "inspection_error"


class SourceNotFoundError(InspectionError):
    exit_code = 2
    code = "source_not_found"


class InvalidProjectExtensionError(InspectionError):
    exit_code = 3
    code = "invalid_project_extension"


class ProjectLoadError(InspectionError):
    exit_code = 4
    code = "project_load_failed"


class NoZonesError(InspectionError):
    exit_code = 5
    code = "no_zones"


class SourceCopyMismatchError(InspectionError):
    code = "source_copy_mismatch"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _temp_root() -> Path | None:
    configured = os.environ.get("CONTAM_STUDIO_TEMP_ROOT")
    if not configured:
        return None
    root = Path(configured).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _worker_command(source: Path, result: Path) -> list[str]:
    return [
        sys.executable,
        "-m",
        "contam_studio_core.inspect_prj",
        WORKER_FLAG,
        str(source),
        str(result),
    ]


def _copy_verified_source(source: Path, destination: Path, expected_sha256: str) -> None:
    shutil.copyfile(source, destination)
    copied_sha256 = _sha256(destination)
    if copied_sha256 != expected_sha256:
        raise SourceCopyMismatchError(
            "临时PRJ副本的SHA-256与源文件不一致，已禁止调用contamxpy。"
        )


def _run_worker(source: Path, work_dir: Path) -> tuple[dict[str, object], bytes, bytes]:
    result_path = work_dir / WORKER_RESULT_NAME
    try:
        completed = subprocess.run(
            _worker_command(source, result_path),
            cwd=work_dir,
            capture_output=True,
            check=False,
            timeout=60,
        )
    except subprocess.TimeoutExpired as error:
        raise ProjectLoadError("contamxpy加载PRJ超时。") from error

    payload: dict[str, object] | None = None
    if result_path.is_file():
        try:
            parsed = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise ProjectLoadError("contamxpy工作进程返回了无效结果。") from error
        if isinstance(parsed, dict):
            payload = parsed

    if completed.returncode != 0 or payload is None or payload.get("ok") is not True:
        detail = payload.get("message") if payload else None
        if not isinstance(detail, str) or not detail:
            detail = f"本机工作进程退出码为{completed.returncode}。"
        raise ProjectLoadError(f"contamxpy无法加载PRJ：{detail}")

    return payload, completed.stdout, completed.stderr


def _zone_from_payload(value: object) -> ZoneInspection:
    if not isinstance(value, dict):
        raise ProjectLoadError("contamxpy未返回有效的首个Zone数据。")
    try:
        return ZoneInspection(
            number=int(value["number"]),
            name=str(value["name"]),
            flags=int(value["flags"]),
            volume_m3=float(value["volume_m3"]),
            level_number=int(value["level_number"]),
            level_name=str(value["level_name"]),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise ProjectLoadError("contamxpy返回的Zone字段不完整。") from error


def inspect_prj(path: Path) -> ProjectInspection:
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise SourceNotFoundError(f"PRJ文件不存在：{source}")
    if source.suffix.lower() != ".prj":
        raise InvalidProjectExtensionError(f"只接受.prj文件：{source}")

    source_hash_before = _sha256(source)
    source_size = source.stat().st_size

    with tempfile.TemporaryDirectory(
        prefix="contam-studio-inspect-",
        dir=_temp_root(),
    ) as temporary:
        work_dir = Path(temporary)
        isolated_source = work_dir / WORKER_SOURCE_NAME
        _copy_verified_source(source, isolated_source, source_hash_before)
        payload, native_stdout, native_stderr = _run_worker(isolated_source, work_dir)
        generated = sorted(
            item.name
            for item in work_dir.iterdir()
            if item.is_file()
            and item.name not in {WORKER_SOURCE_NAME, WORKER_RESULT_NAME}
        )

    source_hash_after = _sha256(source)
    if source_hash_after != source_hash_before:
        raise InspectionError("读取后源PRJ的SHA-256发生变化。")

    zone_count = int(payload.get("zone_count", 0))
    if zone_count <= 0:
        raise NoZonesError("contamxpy已加载PRJ，但没有返回Zone。")

    first_zone = _zone_from_payload(payload.get("first_zone"))
    contamxpy_version = str(payload.get("contamxpy_version", ""))
    contamx_version = str(payload.get("contamx_version", ""))
    if not contamxpy_version or not contamx_version:
        raise ProjectLoadError("contamxpy未返回完整的版本信息。")

    diagnostics = [
        Diagnostic(
            code="contamxpy_setup_required",
            severity="warning",
            message=(
                "contamxpy 0.0.9通过setupSimulation(1)读取Zone；"
                "官方文档说明该调用会执行稳态初始化。"
            ),
        ),
        Diagnostic(
            code="source_hash_unchanged",
            severity="info",
            message=f"读取前后源PRJ的SHA-256一致：{source_hash_before}",
        ),
    ]
    if generated:
        diagnostics.append(
            Diagnostic(
                code="generated_artifacts_isolated",
                severity="warning",
                message="contamxpy生成的临时文件已隔离并清理：" + ", ".join(generated),
            )
        )
    if native_stdout or native_stderr:
        diagnostics.append(
            Diagnostic(
                code="native_output_captured",
                severity="info",
                message=(
                    "contamxpy原生输出已从CLI标准输出隔离"
                    f"（stdout={len(native_stdout)}字节，stderr={len(native_stderr)}字节）。"
                ),
            )
        )

    return ProjectInspection(
        schema_version=SCHEMA_VERSION,
        source_path=str(source),
        source_sha256=source_hash_before,
        source_size_bytes=source_size,
        source_unchanged=True,
        execution_mode=EXECUTION_MODE,
        generated_artifacts=tuple(generated),
        contamxpy_version=contamxpy_version,
        project=ProjectMetadata(contamx_version=contamx_version),
        zone_count=zone_count,
        first_zone=first_zone,
        diagnostics=tuple(diagnostics),
    )


def _worker_payload(source: Path) -> dict[str, object]:
    import contamxpy

    engine = contamxpy.cxLib(str(source), cb_option=True)
    setup_completed = False
    try:
        contamx_version = engine.getVersion()
        setup_result = engine.setupSimulation(1)
        setup_completed = True
        if setup_result != 0:
            raise RuntimeError(f"setupSimulation(1)返回{setup_result}")
        first = engine.zones[0] if engine.zones else None
        return {
            "ok": True,
            "contamxpy_version": importlib.metadata.version("contamxpy"),
            "contamx_version": contamx_version,
            "zone_count": engine.nZones,
            "first_zone": None
            if first is None
            else {
                "number": first.nr,
                "name": first.name,
                "flags": first.flags,
                "volume_m3": first.volume,
                "level_number": first.level_nr,
                "level_name": first.level_name,
            },
        }
    finally:
        if setup_completed:
            engine.endSimulation()


def _worker_main(source_arg: str, result_arg: str) -> int:
    result_path = Path(result_arg)
    try:
        payload = _worker_payload(Path(source_arg))
        exit_code = 0
    except Exception as error:  # noqa: BLE001 - this boundary reports native-wrapper failures.
        payload = {
            "ok": False,
            "error_type": type(error).__name__,
            "message": str(error),
        }
        exit_code = 20
    result_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return exit_code


def _configure_utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="在隔离临时副本上执行稳态初始化并检查CONTAM PRJ的首个Zone。"
    )
    parser.add_argument("path", type=Path, help="CONTAM PRJ文件路径")
    parser.add_argument("--json", action="store_true", required=True, help="输出UTF-8 JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    _configure_utf8_streams()
    args = _parser().parse_args(argv)
    try:
        inspection = inspect_prj(args.path)
    except InspectionError as error:
        print(f"{error.code}: {error}", file=sys.stderr)
        return error.exit_code
    print(json.dumps(inspection.to_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == WORKER_FLAG:
        raise SystemExit(_worker_main(sys.argv[2], sys.argv[3]))
    raise SystemExit(main())
