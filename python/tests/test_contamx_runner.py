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
    project = tmp_path / "project"
    project.mkdir()
    source = project / "test_GetPrjInfo.prj"
    source.write_bytes(FIXTURE.read_bytes())
    return source


def run_root(tmp_path: Path) -> Path:
    return tmp_path / "runs"


def patch_valid_solver_identity(monkeypatch) -> None:
    monkeypatch.setattr(
        runner,
        "_file_hash_and_size",
        lambda path: (runner.EXPECTED_SOLVER_SHA256, runner.EXPECTED_SOLVER_SIZE_BYTES),
    )
    monkeypatch.setattr(runner, "_windows_file_version", lambda path: runner.EXPECTED_SOLVER_VERSION)
    monkeypatch.setattr(runner, "_pe_architecture", lambda path: runner.EXPECTED_ARCHITECTURE)
    monkeypatch.setattr(runner, "_probe_version_command", lambda path: "3.4.0.3 64 bit")


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
    patch_valid_solver_identity(monkeypatch)
    info = runner.probe_solver(solver_path)
    assert info.version == "3.4.0.3"
    assert info.architecture == "windows-x64"
    assert info.size_bytes == runner.EXPECTED_SOLVER_SIZE_BYTES
    assert info.sha256 == runner.EXPECTED_SOLVER_SHA256
    assert "NIST" in info.provenance


def test_explicit_solver_path_takes_priority_over_environment(tmp_path, monkeypatch):
    explicit = tmp_path / "contamx3.exe"
    from_environment = tmp_path / "env-contamx3.exe"
    explicit.write_bytes(b"explicit")
    from_environment.write_bytes(b"environment")
    monkeypatch.setenv(runner.SOLVER_ENVIRONMENT, str(from_environment))
    patch_valid_solver_identity(monkeypatch)
    assert runner.probe_solver(explicit).path == str(explicit.resolve())


def test_run_success_creates_snapshot_manifest_and_artifact(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    root = run_root(tmp_path)
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(runner, "_start_process", fake_start())

    result = runner.run_contamx(source, solver=Path("C:/tools/contamx3.exe"), run_root=root)

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
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
    assert result.status == "failed"
    assert result.exit_code == 7
    assert any(item.code == "run_process_failed" for item in result.manifest.diagnostics)
    assert Path(result.manifest_path).is_file()


def test_timeout_generates_timed_out_manifest(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(runner, "_start_process", fake_start(exit_code=None, timed_out=True))
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
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
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
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
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
    assert result.status == "failed"
    assert any(item.code == "run_snapshot_mismatch" for item in result.manifest.diagnostics)
    assert Path(result.manifest_path).is_file()
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


def test_start_process_uses_argument_array_cwd_no_shell_and_controlled_env(monkeypatch, tmp_path):
    calls = {}
    monkeypatch.setenv("CUSTOM_PARENT_VALUE", "secret")
    monkeypatch.setenv(runner.SOLVER_ENVIRONMENT, "secret")
    monkeypatch.setenv("PYTHONPATH", "secret")

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
    assert "CUSTOM_PARENT_VALUE" not in calls["env"]
    assert runner.SOLVER_ENVIRONMENT not in calls["env"]
    assert "PYTHONPATH" not in calls["env"]


def test_probe_rejects_hash_before_executing_unknown_binary(tmp_path, monkeypatch):
    solver_path = tmp_path / "contamx3.exe"
    solver_path.write_bytes(b"unknown")
    called = False

    def version_command(_path):
        nonlocal called
        called = True
        return "3.4.0.3 64 bit"

    monkeypatch.setattr(runner, "_probe_version_command", version_command)
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner.probe_solver(solver_path)
    assert error.value.code == "contamx_solver_unsupported"
    assert called is False


@pytest.mark.parametrize(
    ("attribute", "value"),
    [
        ("_windows_file_version", "3.4.0.2"),
        ("_pe_architecture", "windows-x86"),
        ("_probe_version_command", "3.4.0.3 32 bit"),
    ],
)
def test_probe_rejects_mismatched_identity_evidence(tmp_path, monkeypatch, attribute, value):
    solver_path = tmp_path / "contamx3.exe"
    solver_path.write_bytes(b"fake")
    patch_valid_solver_identity(monkeypatch)
    monkeypatch.setattr(runner, attribute, lambda path: value)
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner.probe_solver(solver_path)
    assert error.value.code == "contamx_solver_unsupported"


def test_version_probe_uses_bounded_argument_array_and_cwd(tmp_path, monkeypatch):
    solver_path = tmp_path / "contamx3.exe"
    solver_path.write_bytes(b"fake")
    calls = {}

    class FakeProcess:
        returncode = 0
        stdout = io.BytesIO(b"")
        stderr = io.BytesIO(b"3.4.0.3 64 bit\r\n")

        def wait(self, timeout=None):
            calls["timeout"] = timeout

    def popen(args, **kwargs):
        calls["args"] = args
        calls.update(kwargs)
        return FakeProcess()

    monkeypatch.setattr(runner.subprocess, "Popen", popen)
    assert runner._probe_version_command(solver_path) == "3.4.0.3 64 bit"
    assert calls["args"] == [str(solver_path), "--Version"]
    assert calls["cwd"] == solver_path.parent
    assert calls["shell"] is False
    assert calls["timeout"] == runner.VERSION_TIMEOUT_SECONDS


def test_version_probe_does_not_expose_raw_output(tmp_path, monkeypatch):
    solver_path = tmp_path / "contamx3.exe"
    solver_path.write_bytes(b"fake")

    class FakeProcess:
        returncode = 0
        stdout = io.BytesIO(b"SECRET-PATH TRACEBACK")
        stderr = io.BytesIO(b"")

        def wait(self, timeout=None):
            return None

    monkeypatch.setattr(runner.subprocess, "Popen", lambda *args, **kwargs: FakeProcess())
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner._probe_version_command(solver_path)
    assert error.value.code == "contamx_solver_unsupported"
    assert "SECRET" not in error.value.diagnostic.message
    assert "TRACEBACK" not in error.value.diagnostic.message


def test_controlled_environment_drops_parent_custom_and_python_values(monkeypatch):
    monkeypatch.setenv("SystemRoot", r"C:\Windows")
    monkeypatch.setenv("WINDIR", r"C:\Windows")
    monkeypatch.setenv("TEMP", r"C:\Temp")
    monkeypatch.setenv("TMP", r"C:\Temp")
    monkeypatch.setenv("CUSTOM_PARENT_VALUE", "secret")
    monkeypatch.setenv(runner.SOLVER_ENVIRONMENT, r"C:\solver\contamx3.exe")
    monkeypatch.setenv("CONTAM_STUDIO_OTHER", "secret")
    monkeypatch.setenv("PYTHONPATH", "secret")
    monkeypatch.setenv("PYTHONHOME", "secret")
    monkeypatch.setenv("VIRTUAL_ENV", "secret")
    environment = runner._controlled_environment()
    assert set(environment) == {"SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"}
    assert "System32" in environment["PATH"]
    assert "CUSTOM_PARENT_VALUE" not in environment
    assert runner.SOLVER_ENVIRONMENT not in environment
    assert "CONTAM_STUDIO_OTHER" not in environment
    assert "PYTHONPATH" not in environment
    assert "PYTHONHOME" not in environment
    assert "VIRTUAL_ENV" not in environment


@pytest.mark.parametrize("relative", [Path("."), Path("runs"), Path("nested") / ".." / "runs"])
def test_run_root_inside_source_tree_is_rejected_without_creation(tmp_path, monkeypatch, relative):
    source = copy_fixture(tmp_path)
    candidate = source.parent / relative
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner.run_contamx(source, run_root=candidate)
    assert error.value.code == "run_root_conflicts_with_source"
    if candidate.resolve(strict=False) != source.parent:
        assert not candidate.resolve(strict=False).exists()


def test_external_run_root_succeeds_and_source_inventory_has_files_and_directories(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    (source.parent / "notes").mkdir()
    (source.parent / "companion.txt").write_text("input", encoding="ascii")
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(runner, "_start_process", fake_start())
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
    assert result.status == "succeeded"
    before = result.manifest.source["directory_entries_before"]
    assert "file:test_GetPrjInfo.prj" in before
    assert "file:companion.txt" in before
    assert "directory:notes" in before
    assert before == sorted(before)


def test_main_source_change_before_snapshot_prevents_process_and_writes_manifest(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    called = False

    def probe(_solver=None):
        source.write_bytes(source.read_bytes() + b"changed")
        return fake_solver()

    def start(*args):
        nonlocal called
        called = True
        return 0, False

    monkeypatch.setattr(runner, "probe_solver", probe)
    monkeypatch.setattr(runner, "_start_process", start)
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
    assert result.status == "failed"
    assert called is False
    assert any(item.code == "run_snapshot_mismatch" for item in result.manifest.diagnostics)
    assert Path(result.manifest_path).is_file()


def test_source_change_during_copy_prevents_process(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    original_copy = runner.shutil.copy2
    called = False

    def changing_copy(source_path, destination):
        original_copy(source_path, destination)
        Path(source_path).write_bytes(Path(source_path).read_bytes() + b"changed")

    def start(*args):
        nonlocal called
        called = True
        return 0, False

    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(runner.shutil, "copy2", changing_copy)
    monkeypatch.setattr(runner, "_start_process", start)
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
    assert result.status == "failed"
    assert called is False
    assert any(item.code == "run_snapshot_mismatch" for item in result.manifest.diagnostics)


def test_source_change_after_copy_before_process_prevents_start(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    original_copy = runner._copy_verified_input
    called = False

    def copy_then_change(input_path, destination, expected):
        record = original_copy(input_path, destination, expected)
        Path(input_path).write_bytes(Path(input_path).read_bytes() + b"changed")
        return record

    def start(*args):
        nonlocal called
        called = True
        return 0, False

    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(runner, "_copy_verified_input", copy_then_change)
    monkeypatch.setattr(runner, "_start_process", start)
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
    assert result.status == "failed"
    assert called is False
    assert any(item.code == "run_snapshot_mismatch" for item in result.manifest.diagnostics)


def test_companion_change_after_process_marks_run_failed(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    companion = source.parent / "weather.wth"
    companion.write_bytes(b"weather")
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(
        runner,
        "_start_process",
        fake_start(mutate_source=lambda: companion.write_bytes(b"changed")),
    )
    result = runner.run_contamx(source, run_root=run_root(tmp_path), companion_paths=[companion])
    assert result.status == "failed"
    companion_record = next(item for item in result.manifest.input_snapshots if item.source_path == str(companion))
    assert companion_record.source_unchanged is False
    assert any(item.code == "run_source_changed" for item in result.manifest.diagnostics)


def test_companion_change_before_snapshot_prevents_process(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    companion = source.parent / "weather.wth"
    companion.write_bytes(b"weather")
    called = False

    def probe(_solver=None):
        companion.write_bytes(b"changed")
        return fake_solver()

    def start(*args):
        nonlocal called
        called = True
        return 0, False

    monkeypatch.setattr(runner, "probe_solver", probe)
    monkeypatch.setattr(runner, "_start_process", start)
    result = runner.run_contamx(source, run_root=run_root(tmp_path), companion_paths=[companion])
    assert result.status == "failed"
    assert called is False
    assert any(item.code == "run_snapshot_mismatch" for item in result.manifest.diagnostics)


@pytest.mark.parametrize("companions", [["source"], ["duplicate"]])
def test_duplicate_or_main_companion_is_rejected_before_run_directory(tmp_path, monkeypatch, companions):
    source = copy_fixture(tmp_path)
    companion = source.parent / "weather.wth"
    companion.write_bytes(b"weather")
    paths = [source] if companions == ["source"] else [companion, companion]
    root = run_root(tmp_path)
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner.run_contamx(source, run_root=root, companion_paths=paths)
    assert error.value.code == "run_snapshot_failed"
    assert not root.exists()


def test_same_target_filename_conflict_is_rejected_before_run_directory(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    external = tmp_path / "other" / source.name
    external.parent.mkdir()
    external.write_bytes(b"other")
    root = run_root(tmp_path)
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner.run_contamx(source, run_root=root, companion_paths=[external])
    assert error.value.code == "run_snapshot_failed"
    assert not root.exists()


def test_source_directory_change_is_recorded_as_failure(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())
    monkeypatch.setattr(
        runner,
        "_start_process",
        fake_start(mutate_source=lambda: (source.parent / "unexpected").mkdir()),
    )
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
    assert result.status == "failed"
    assert result.manifest.source["directory_entries_before"] != result.manifest.source["directory_entries_after"]
    assert any(item.code == "run_source_changed" for item in result.manifest.diagnostics)


def test_stream_capture_failure_is_structured(tmp_path):
    class BrokenStream:
        def read(self, _size):
            raise OSError("do not expose")

    capture = runner._StreamCapture(tmp_path / "stdout.bin")
    capture.read(BrokenStream())
    assert isinstance(capture.capture_error, OSError)


def test_start_process_rejects_stream_thread_failure(monkeypatch, tmp_path):
    class BrokenStream:
        def read(self, _size):
            raise OSError("do not expose")

    class FakeProcess:
        returncode = 0
        stdout = BrokenStream()
        stderr = io.BytesIO(b"")

        def wait(self, timeout=None):
            return None

    monkeypatch.setattr(runner.subprocess, "Popen", lambda *args, **kwargs: FakeProcess())
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner._start_process(
            fake_solver(),
            "model.prj",
            tmp_path,
            runner._StreamCapture(tmp_path / "stdout.bin"),
            runner._StreamCapture(tmp_path / "stderr.bin"),
        )
    assert error.value.code == "run_stream_capture_failed"


def test_stream_capture_failure_after_run_directory_writes_failed_manifest(tmp_path, monkeypatch):
    source = copy_fixture(tmp_path)
    monkeypatch.setattr(runner, "probe_solver", lambda solver=None: fake_solver())

    def fail_start(*args):
        runner._fail("run_stream_capture_failed", "controlled")

    monkeypatch.setattr(runner, "_start_process", fail_start)
    result = runner.run_contamx(source, run_root=run_root(tmp_path))
    assert result.status == "failed"
    assert Path(result.manifest_path).is_file()
    assert any(item.code == "run_stream_capture_failed" for item in result.manifest.diagnostics)


def test_termination_failure_is_structured(monkeypatch, tmp_path):
    class FakeProcess:
        returncode = None
        stdout = io.BytesIO(b"")
        stderr = io.BytesIO(b"")

        def wait(self, timeout=None):
            raise subprocess.TimeoutExpired("contamx3.exe", timeout)

        def terminate(self):
            raise OSError("terminate failed")

        def kill(self):
            raise OSError("kill failed")

    monkeypatch.setattr(runner.subprocess, "Popen", lambda *args, **kwargs: FakeProcess())
    with pytest.raises(runner.ContamXRunnerError) as error:
        runner._start_process(
            fake_solver(),
            "model.prj",
            tmp_path,
            runner._StreamCapture(tmp_path / "stdout.bin"),
            runner._StreamCapture(tmp_path / "stderr.bin"),
        )
    assert error.value.code == "run_process_termination_failed"


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
