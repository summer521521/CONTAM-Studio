from __future__ import annotations

import io
import json
import subprocess
import sys
from pathlib import Path

import pytest

import contam_studio_core.contamx_runner as runner
from contam_studio_core.contamx_run_models import ContamXSolverInfo


FIXTURE = Path(__file__).parents[2] / "fixtures" / "contam" / "official-contamxpy" / "test_GetPrjInfo.prj"


def fake_solver() -> ContamXSolverInfo:
    return ContamXSolverInfo(
        path="C:/tools/contamx3.exe",
        name="contamx3.exe",
        version="3.4.0.3",
        sha256="a" * 64,
        size_bytes=123,
        architecture="windows-x64",
        provenance="test",
    )


def copy_fixture(tmp_path: Path) -> Path:
    source = tmp_path / "test_GetPrjInfo.prj"
    source.write_bytes(FIXTURE.read_bytes())
    return source


def fake_start(exit_code=0, timed_out=False, mutate_source=None):
    def start(_solver, snapshot_name, workspace, stdout_capture, stderr_capture):
        stdout_capture.path.write_bytes(b"fake stdout")
        stderr_capture.path.write_bytes(b"")
        (workspace / Path(snapshot_name).with_suffix(".sim").name).write_bytes(b"SIM")
        if mutate_source:
            mutate_source()
        return exit_code, timed_out

    return start


def test_solver_discovery_is_explicit_and_does_not_use_path(monkeypatch):
    monkeypatch.delenv(runner.SOLVER_ENVIRONMENT, raising=False)
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner.probe_solver()
    assert error.value.code == "contamx_solver_not_configured"

    with pytest.raises(runner.ContamXRunnerError) as error:
        runner.probe_solver(Path("contamx3.exe"))
    assert error.value.code == "contamx_solver_path_invalid"


def test_solver_probe_records_version_hash_and_architecture(tmp_path, monkeypatch):
    solver_path = tmp_path / "contamx3.exe"
    solver_path.write_bytes(b"fake")
    monkeypatch.setattr(runner, "_windows_file_version", lambda path: "3.4.0.3")
    monkeypatch.setattr(runner, "_pe_architecture", lambda path: "windows-x64")
    info = runner.probe_solver(solver_path)
    assert info.version == "3.4.0.3"
    assert info.architecture == "windows-x64"
    assert info.size_bytes == 4
    assert len(info.sha256) == 64


def test_explicit_solver_path_takes_priority_over_environment(tmp_path, monkeypatch):
    explicit = tmp_path / "contamx3.exe"
    from_environment = tmp_path / "env-contamx3.exe"
    explicit.write_bytes(b"explicit")
    from_environment.write_bytes(b"environment")
    monkeypatch.setenv(runner.SOLVER_ENVIRONMENT, str(from_environment))
    monkeypatch.setattr(runner, "_windows_file_version", lambda path: "3.4.0.3")
    monkeypatch.setattr(runner, "_pe_architecture", lambda path: "windows-x64")
    assert runner.probe_solver(explicit).path == str(explicit.resolve())


def test_run_success_creates_snapshot_manifest_and_artifact(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    run_root = tmp_path / "runs"
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(runner, "_start_process", fake_start())

    result = runner.run_contamx(source, solver=Path("C:/tools/contamx3.exe"), run_root=run_root)

    assert result.status == "succeeded"
    assert result.exit_code == 0
    assert result.manifest.solver.version == "3.4.0.3"
    assert result.manifest.source["unchanged"] is True
    assert result.manifest.input_snapshots[0].source_sha256 == result.manifest.input_snapshots[0].snapshot_sha256
    assert result.primary_artifacts[0].suffix == ".sim"
    assert result.primary_artifacts[0].relative_path.startswith("workspace/")
    assert Path(result.manifest_path).is_file()
    manifest = json.loads(Path(result.manifest_path).read_text(encoding="utf-8"))
    assert manifest["execution_mode"] == "isolated_contamx_process"
    assert Path(result.run_directory, "evidence", "stdout.bin").is_file()
    assert Path(result.run_directory, "evidence", "stderr.bin").is_file()
    assert source.read_bytes() == FIXTURE.read_bytes()


def test_nonzero_exit_generates_failed_manifest(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(runner, "_start_process", fake_start(exit_code=7))
    result = runner.run_contamx(source, run_root=tmp_path / "runs")
    assert result.status == "failed"
    assert result.exit_code == 7
    assert any(item.code == "run_process_failed" for item in result.manifest.diagnostics)
    assert Path(result.manifest_path).is_file()


def test_timeout_generates_timed_out_manifest(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(runner, "_start_process", fake_start(exit_code=None, timed_out=True))
    result = runner.run_contamx(source, run_root=tmp_path / "runs")
    assert result.status == "timed_out"
    assert result.timed_out is True
    assert any(item.code == "run_process_timeout" for item in result.manifest.diagnostics)


def test_source_change_is_recorded_as_failure(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(
        runner,
        "_start_process",
        fake_start(mutate_source=lambda: source.write_bytes(source.read_bytes() + b"x")),
    )
    result = runner.run_contamx(source, run_root=tmp_path / "runs")
    assert result.status == "failed"
    assert result.manifest.source["unchanged"] is False
    assert any(item.code == "run_source_changed" for item in result.manifest.diagnostics)


def test_snapshot_mismatch_prevents_process_start(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    called = False

    def corrupt_copy(_source, destination):
        nonlocal called
        called = True
        destination.write_bytes(b"different")

    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(runner.shutil, "copy2", corrupt_copy)
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner.run_contamx(source, run_root=tmp_path / "runs")
    assert error.value.code == "run_snapshot_mismatch"
    assert called is True


def test_stream_capture_keeps_raw_bytes_and_marks_truncation(tmp_path):
    capture = runner._StreamCapture(tmp_path / "stderr.bin", buffer_limit=3)
    capture.read(io.BytesIO(b"\xff\x00abcd"))
    assert capture.path.read_bytes() == b"\xff\x00a"
    assert capture.truncated is True


def test_runner_module_has_no_contamxpy_or_shell_commands():
    source = Path(runner.__file__).read_text(encoding="utf-8")
    assert "contamxpy" not in source
    assert "cmd /c" not in source.casefold()
    assert "shell=False" in source


def test_start_process_uses_argument_array_cwd_and_no_shell(monkeypatch, tmp_path):
    calls = {}

    class FakeProcess:
        returncode = 0
        stdout = io.BytesIO(b"out")
        stderr = io.BytesIO(b"err")

        def wait(self, timeout=None):
            calls["timeout"] = timeout

    def fake_popen(args, **kwargs):
        calls["args"] = args
        calls.update(kwargs)
        return FakeProcess()

    monkeypatch.setattr(runner.subprocess, "Popen", fake_popen)
    stdout = runner._StreamCapture(tmp_path / "stdout.bin")
    stderr = runner._StreamCapture(tmp_path / "stderr.bin")
    result = runner._start_process(fake_solver(), "model.prj", tmp_path, stdout, stderr)
    assert result == (0, False)
    assert calls["args"] == ["C:/tools/contamx3.exe", "model.prj"]
    assert calls["cwd"] == tmp_path
    assert calls["shell"] is False


def test_manifest_does_not_overwrite_existing_file(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text("original", encoding="utf-8")
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner._atomic_manifest_write(path, runner.ContamXRunManifest(
            schema_version="1.0", run_id="r", status="failed", execution_mode="isolated_contamx_process",
            started_at_utc="", ended_at_utc="", duration_ms=0, source={}, input_snapshots=(),
            solver=fake_solver(), command={}, working_directory="workspace", exit_code=1, timed_out=False,
            stdout=runner.RunStreamEvidence("evidence/stdout.bin", 0, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", False),
            stderr=runner.RunStreamEvidence("evidence/stderr.bin", 0, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", False),
            artifacts=(), diagnostics=(),
        ))
    assert error.value.code == "run_manifest_write_failed"
    assert path.read_text(encoding="utf-8") == "original"


def test_cli_failure_is_json_without_traceback(tmp_path):
    process = subprocess.run(
        [
            sys.executable,
            "-m",
            "contam_studio_core.contamx_runner",
            "probe",
            "--solver",
            str(tmp_path / "missing.exe"),
            "--json",
        ],
        cwd=Path(__file__).parents[1],
        capture_output=True,
        text=False,
    )
    assert process.returncode == runner.ERROR_EXIT_CODES["contamx_solver_not_found"]
    assert process.stdout == b""
    stderr = process.stderr.decode("utf-8")
    payload = json.loads(stderr)
    assert payload["code"] == "contamx_solver_not_found"
    assert "Traceback" not in stderr
