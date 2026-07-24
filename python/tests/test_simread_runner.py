from __future__ import annotations

import hashlib
import io
import json
import subprocess
import shutil
import threading
from pathlib import Path

import pytest

from contam_studio_core import simread_runner
from contam_studio_core.simread_models import SimReadToolInfo
from contam_studio_core.zone_air_state_results import ZoneResultError


def test_simread_requires_explicit_or_environment_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(simread_runner.SIMREAD_ENVIRONMENT, raising=False)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.probe_simread(None)
    assert error.value.diagnostic.code == "simread_not_configured"


def test_simread_relative_path_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._resolve_tool(Path("simread.exe"))
    assert error.value.diagnostic.code == "simread_path_invalid"


def test_simread_tool_contract_is_structured() -> None:
    tool = SimReadToolInfo(
        "C:/simread.exe",
        "simread.exe",
        "3.4.0.3",
        "a" * 64,
        34816,
        "windows-x64",
        "NIST",
        "stdin_v1",
    )
    payload = tool.to_dict()
    assert payload["name"] == "simread.exe"
    assert payload["invocation_contract"] == "stdin_v1"


def test_result_root_conflict_diagnostic_code_is_stable() -> None:
    assert "result_root_conflicts_with_source" in simread_runner.ERROR_EXIT_CODES


def test_result_process_stability_uses_bounded_metadata() -> None:
    base = {
        "extraction_id": "extraction-1",
        "status": "failed",
        "started_at_utc": "2026-07-24T00:00:00Z",
        "ended_at_utc": "2026-07-24T00:00:01Z",
        "result_type": "zone_air_state",
        "zone_number": 1,
        "generated_outputs": [],
        "diagnostics": [],
    }
    cases = (
        ({"process_started": False}, None, None),
        ({"process_started": True}, None, False),
        ({"process_started": True}, 0, True),
    )
    for process, exit_code, expected in cases:
        payload = {**base, "process": process, "exit_code": exit_code}
        normalized = simread_runner._normalize_result_manifest(payload)
        assert normalized["process"]["generated_outputs_stable"] is expected


def _valid_manifest(tmp_path: Path) -> tuple[Path, dict]:
    run = tmp_path / "run"
    (run / "workspace").mkdir(parents=True)
    (run / "evidence").mkdir()
    source = tmp_path / "source.prj"
    source.write_bytes(b"source")
    prj = run / "workspace" / "model.prj"
    sim = run / "workspace" / "model.sim"
    prj.write_bytes(source.read_bytes())
    sim.write_bytes(b"sim")

    def sha(p: Path) -> str:
        return hashlib.sha256(p.read_bytes()).hexdigest()

    payload = {
        "schema_version": "1.0",
        "run_id": "run-1",
        "status": "succeeded",
        "execution_mode": "isolated_contamx_process",
        "timed_out": False,
        "exit_code": 0,
        "source": {
            "path": str(source),
            "sha256": sha(source),
            "size_bytes": source.stat().st_size,
            "unchanged": True,
        },
        "input_snapshots": [
            {
                "relative_path": "workspace/model.prj",
                "source_path": str(source),
                "source_sha256": sha(source),
                "source_size_bytes": source.stat().st_size,
                "snapshot_sha256": sha(prj),
                "snapshot_size_bytes": prj.stat().st_size,
                "source_unchanged": True,
                "classification": "input_snapshot",
            }
        ],
        "artifacts": [
            {
                "relative_path": "workspace/model.sim",
                "sha256": sha(sim),
                "size_bytes": sim.stat().st_size,
                "classification": "simulation_result",
            }
        ],
        "solver": {
            "name": "contamx3.exe",
            "version": "3.4.0.3",
            "architecture": "windows-x64",
            "size_bytes": 1605120,
            "sha256": "3b9a5ee9a6a3ea3cdc569df607f4ec2a1ad4e74e53fef8fbec0b7e540a5d3aad",
            "provenance": "NIST contam-x-3.4.0.3-win64.zip",
        },
        "diagnostics": [],
    }
    path = run / "evidence" / "manifest.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path, payload


def test_phase4_manifest_is_loaded_from_one_byte_snapshot(tmp_path: Path) -> None:
    path, _ = _valid_manifest(tmp_path)
    evidence = simread_runner._validate_phase4_manifest(path)
    assert evidence.manifest_sha256 == hashlib.sha256(path.read_bytes()).hexdigest()
    assert evidence.prj_size_bytes == 6
    assert evidence.sim_size_bytes == 3


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [
        ("schema_version", "9.0", "result_manifest_unsupported"),
        ("execution_mode", "other", "result_manifest_unsupported"),
        ("status", "failed", "result_run_not_succeeded"),
        ("timed_out", True, "result_run_not_succeeded"),
        ("exit_code", 1, "result_run_not_succeeded"),
        ("solver", {"name": "other"}, "result_run_evidence_invalid"),
    ],
)
def test_phase4_manifest_contract_failures_are_structured(
    tmp_path: Path, field: str, value, code: str
) -> None:
    path, payload = _valid_manifest(tmp_path)
    payload[field] = value
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._validate_phase4_manifest(path)
    assert error.value.diagnostic.code == code


def test_phase4_manifest_hash_tocou_is_rejected(tmp_path: Path) -> None:
    path, _ = _valid_manifest(tmp_path)
    evidence = simread_runner._validate_phase4_manifest(path)
    path.write_text(path.read_text(encoding="utf-8") + " ", encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._recheck(evidence)
    assert error.value.diagnostic.code == "result_run_evidence_invalid"


def test_direct_nfr_cli_is_not_a_trusted_entry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "sys.argv",
        ["zone_air_state_results", "extract", str(tmp_path / "x.nfr"), "--zone-number", "1"],
    )
    with pytest.raises(SystemExit) as error:
        simread_runner._cli()
    assert error.value.code != 0


@pytest.mark.parametrize(
    "kind",
    ["oversized", "non_utf8", "non_object", "nan"],
)
def test_manifest_bytes_are_bounded_and_structured(tmp_path: Path, kind: str) -> None:
    data = {
        "oversized": b"{}" + b"x" * simread_runner.MAX_MANIFEST_BYTES,
        "non_utf8": b"\xff",
        "non_object": b"[]",
        "nan": b"{\"value\": NaN}",
    }[kind]
    path = tmp_path / "manifest.json"
    path.write_bytes(data)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._read_manifest_bytes(path)
    assert error.value.diagnostic.code == "result_manifest_invalid"


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [
        ("source", {"path": "relative.prj", "sha256": "a" * 64, "size_bytes": 1, "unchanged": True}, "result_manifest_invalid"),
        ("input_snapshots", ["bad"], "result_manifest_invalid"),
        ("artifacts", [{"classification": "simulation_result", "relative_path": "workspace/model.sim"}], "result_manifest_invalid"),
        ("solver", {"name": "contamx3.exe", "version": "3.4.0.3", "architecture": "windows-x64", "size_bytes": 1, "sha256": "a" * 64, "provenance": "NIST"}, "result_run_evidence_invalid"),
    ],
)
def test_manifest_field_errors_never_escape_as_key_errors(
    tmp_path: Path, field: str, value, code: str
) -> None:
    path, payload = _valid_manifest(tmp_path)
    payload[field] = value
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._validate_phase4_manifest(path)
    assert error.value.diagnostic.code == code


def test_manifest_artifact_hash_mismatch_is_structured(tmp_path: Path) -> None:
    path, payload = _valid_manifest(tmp_path)
    payload["artifacts"][0]["sha256"] = "0" * 64
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._validate_phase4_manifest(path)
    assert error.value.diagnostic.code == "result_artifact_hash_mismatch"


def test_probe_native_identity_errors_map_to_simread_codes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    tool = tmp_path / "simread.exe"
    tool.write_bytes(b"tool")
    monkeypatch.setattr(simread_runner, "_resolve_tool", lambda _: tool)
    monkeypatch.setattr(simread_runner, "_hash_size", lambda *_args: ("a" * 64, 34816))

    def unavailable(_path: Path):
        error = RuntimeError("native")
        error.code = "contamx_solver_version_unavailable"
        raise error

    monkeypatch.setattr(simread_runner, "_pe_architecture", unavailable)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.probe_simread(tool)
    assert error.value.diagnostic.code == "simread_contract_unavailable"

    monkeypatch.setattr(simread_runner, "_pe_architecture", lambda _path: (_ for _ in ()).throw(RuntimeError("bad")))
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.probe_simread(tool)
    assert error.value.diagnostic.code == "simread_unsupported"


class _WaitBroken:
    stdout = io.BytesIO()
    stderr = io.BytesIO()

    def wait(self, timeout=None):
        raise OSError("wait failed")


def test_process_wait_failure_is_structured() -> None:
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._capture_process(_WaitBroken(), timeout=1, evidence=None)
    assert error.value.diagnostic.code == "simread_process_termination_failed"


class _TerminateBroken:
    stdout = io.BytesIO()
    stderr = io.BytesIO()

    def wait(self, timeout=None):
        raise subprocess.TimeoutExpired("simread", timeout)

    def terminate(self):
        raise OSError("terminate failed")


def test_process_termination_failure_is_structured() -> None:
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._capture_process(_TerminateBroken(), timeout=1, evidence=None)
    assert error.value.diagnostic.code == "simread_process_termination_failed"


def test_stream_capture_failure_cannot_be_success(tmp_path: Path) -> None:
    class Process:
        stdout = io.BytesIO(b"stdout")
        stderr = io.BytesIO(b"stderr")

        def wait(self, timeout=None):
            return 0

    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._capture_process(Process(), timeout=1, evidence=tmp_path / "missing")
    assert error.value.diagnostic.code == "simread_stream_capture_failed"


def test_stream_capture_is_bounded_and_marks_truncation(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(simread_runner, "MAX_STREAM_BYTES", 4)
    target = tmp_path / "stdout.bin"
    capture = simread_runner._BoundedCapture(io.BytesIO(b"123456"), target)
    capture.drain()
    assert capture.truncated is True
    assert bytes(capture.data) == b"1234"
    assert target.read_bytes() == b"1234"


def test_simread_environment_is_explicitly_filtered(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in {
        "CONTAM_STUDIO_SIMREAD": "custom-tool",
        "PYTHONPATH": "custom-pythonpath",
        "PYTHONHOME": "custom-pythonhome",
        "VIRTUAL_ENV": "custom-venv",
        "CONTAM_STUDIO_TEST": "custom-value",
    }.items():
        monkeypatch.setenv(name, value)
    environment = simread_runner._controlled_environment()
    assert "CONTAM_STUDIO_SIMREAD" not in environment
    assert "PYTHONPATH" not in environment
    assert "PYTHONHOME" not in environment
    assert "VIRTUAL_ENV" not in environment
    assert "CONTAM_STUDIO_TEST" not in environment


def test_direct_sim_cli_is_not_a_trusted_entry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        "sys.argv",
        [
            "zone_air_state_results",
            "extract",
            str(tmp_path / "model.sim"),
            "--result-root",
            str(tmp_path / "results"),
            "--zone-number",
            "1",
        ],
    )
    assert simread_runner._cli() == simread_runner.ERROR_EXIT_CODES["result_manifest_not_found"]
    captured = capsys.readouterr()
    assert captured.out == ""
    assert json.loads(captured.err)["code"] == "result_manifest_not_found"


def _orchestration_fixture(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    source_dir = tmp_path / "source"
    run_dir = tmp_path / "run"
    (run_dir / "workspace").mkdir(parents=True)
    (run_dir / "evidence").mkdir()
    source = source_dir / "model.prj"
    source_dir.mkdir()
    shutil.copy2(
        Path(__file__).parents[2]
        / "fixtures"
        / "contam"
        / "official-contamxpy"
        / "test_GetPrjInfo.prj",
        source,
    )
    prj = run_dir / "workspace" / "model.prj"
    sim = run_dir / "workspace" / "model.sim"
    shutil.copy2(source, prj)
    sim.write_bytes(b"sim-result")

    def sha(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    source_sha = sha(source)
    payload = {
        "schema_version": "1.0",
        "run_id": "orchestration-run",
        "status": "succeeded",
        "execution_mode": "isolated_contamx_process",
        "timed_out": False,
        "exit_code": 0,
        "source": {
            "path": str(source),
            "sha256": source_sha,
            "size_bytes": source.stat().st_size,
            "unchanged": True,
        },
        "input_snapshots": [
            {
                "relative_path": "workspace/model.prj",
                "source_path": str(source),
                "source_sha256": source_sha,
                "source_size_bytes": source.stat().st_size,
                "snapshot_sha256": sha(prj),
                "snapshot_size_bytes": prj.stat().st_size,
                "classification": "input_snapshot",
                "source_unchanged": True,
            }
        ],
        "artifacts": [
            {
                "relative_path": "workspace/model.sim",
                "sha256": sha(sim),
                "size_bytes": sim.stat().st_size,
                "classification": "simulation_result",
            }
        ],
        "solver": {
            "name": "contamx3.exe",
            "version": "3.4.0.3",
            "architecture": "windows-x64",
            "size_bytes": 1605120,
            "sha256": "3b9a5ee9a6a3ea3cdc569df607f4ec2a1ad4e74e53fef8fbec0b7e540a5d3aad",
            "provenance": "NIST contam-x-3.4.0.3-win64.zip",
        },
        "diagnostics": [],
    }
    manifest = run_dir / "evidence" / "manifest.json"
    manifest.write_text(json.dumps(payload), encoding="utf-8")
    return manifest, source, prj, sim


class _FakeStdin:
    def __init__(self, owner):
        self.owner = owner

    def write(self, data):
        self.owner.stdin_bytes += data
        return len(data)

    def flush(self):
        return None

    def close(self):
        return None


class _FakeSimReadProcess:
    def __init__(self, stdout=b"simread stdout", stderr=b"simread stderr"):
        self.stdout = io.BytesIO(stdout)
        self.stderr = io.BytesIO(stderr)
        self.stdin_bytes = b""
        self.stdin = _FakeStdin(self)

    def wait(self, timeout=None):
        return 0

    def terminate(self):
        return None

    def kill(self):
        return None


def _patch_fake_simread(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, calls: list) -> Path:
    tool_path = tmp_path / "tools" / "simread.exe"
    tool_path.parent.mkdir()
    tool_path.write_bytes(b"fake-simread")
    tool = SimReadToolInfo(
        str(tool_path),
        "simread.exe",
        "3.4.0.3",
        "a" * 64,
        tool_path.stat().st_size,
        "windows-x64",
        "NIST test double",
        simread_runner.SIMREAD_INVOCATION_CONTRACT,
    )
    monkeypatch.setattr(simread_runner, "probe_simread", lambda _path: tool)
    monkeypatch.setattr(simread_runner, "_recheck_simread_identity", lambda _tool: None)

    def popen(args, **kwargs):
        calls.append((args, kwargs))
        workspace = Path(kwargs["cwd"])
        (workspace / "model.nfr").write_text(
            "Date\tTime\tNode\tT (C)\tP (Pa)\tD (kg/m3)\n"
            "1/1\t00:00:00\t1\t20.000\t-1.4222e+00\t1.2041\n",
            encoding="ascii",
            newline="\n",
        )
        (workspace / "model.xrf").write_bytes(b"xrf")
        process = _FakeSimReadProcess()
        calls.append(process)
        return process

    monkeypatch.setattr(simread_runner.subprocess, "Popen", popen)
    return tool_path


def _assert_project_mismatch_prevents_simread(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    expected_source_path: Path,
    expected_source_sha256: str,
) -> None:
    manifest, source, _, sim = _orchestration_fixture(tmp_path)
    protected = {
        path: (path.stat().st_size, hashlib.sha256(path.read_bytes()).hexdigest())
        for path in (manifest, source, sim)
    }
    calls = {"probe": 0, "popen": 0}

    def unexpected_probe(_path):
        calls["probe"] += 1
        raise AssertionError("probe_simread must not run for a project mismatch")

    def unexpected_popen(*_args, **_kwargs):
        calls["popen"] += 1
        raise AssertionError("SimRead must not start for a project mismatch")

    monkeypatch.setattr(simread_runner, "probe_simread", unexpected_probe)
    monkeypatch.setattr(simread_runner.subprocess, "Popen", unexpected_popen)
    result_root = tmp_path / "results"
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest,
            simread_path=tmp_path / "simread.exe",
            result_root=result_root,
            zone_number=1,
            expected_source_path=expected_source_path,
            expected_source_sha256=expected_source_sha256,
        )
    assert error.value.diagnostic.code == "result_project_mismatch"
    assert calls == {"probe": 0, "popen": 0}
    assert not result_root.exists()
    for path, before in protected.items():
        assert (path.stat().st_size, hashlib.sha256(path.read_bytes()).hexdigest()) == before


def test_project_path_mismatch_is_rejected_before_simread(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    other = tmp_path / "other.prj"
    shutil.copy2(
        Path(__file__).parents[2]
        / "fixtures"
        / "contam"
        / "official-nist-tutorials"
        / "demo1c.prj",
        other,
    )
    source_sha256 = hashlib.sha256(
        (
            Path(__file__).parents[2]
            / "fixtures"
            / "contam"
            / "official-contamxpy"
            / "test_GetPrjInfo.prj"
        ).read_bytes()
    ).hexdigest()
    _assert_project_mismatch_prevents_simread(
        tmp_path,
        monkeypatch,
        expected_source_path=other,
        expected_source_sha256=source_sha256,
    )


def test_project_sha_mismatch_is_rejected_before_simread(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    expected_source = tmp_path / "source" / "model.prj"
    _assert_project_mismatch_prevents_simread(
        tmp_path,
        monkeypatch,
        expected_source_path=expected_source,
        expected_source_sha256="0" * 64,
    )


def test_extract_orchestration_success_has_bound_inputs_and_schema(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)
    monkeypatch.setenv("CONTAM_STUDIO_TEST", "must-not-propagate")
    result = simread_runner.extract_zone_air_state(
        manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
    )
    assert result["sample_count"] == 1
    process = calls[-1]
    args, kwargs = calls[0]
    assert args == [str(tool_path), "model.sim"]
    assert kwargs["shell"] is False
    assert Path(kwargs["cwd"]).name == "workspace"
    assert "CONTAM_STUDIO_TEST" not in kwargs["env"]
    assert process.stdin_bytes == b"\n\nn\ny\n1\nn\n"
    payload = json.loads(Path(result["result_manifest_path"]).read_text(encoding="utf-8"))
    assert isinstance(payload["run_manifest"], dict)
    assert payload["run_manifest"]["sha256"] == payload["source_run"]["run_manifest_sha256"]
    assert payload["source_run"]["solver"]["name"] == "contamx3.exe"
    assert payload["input_artifacts"][0]["classification"] == "input_snapshot"
    assert all(item["classification"] != "input_snapshot" for item in payload["generated_outputs"])
    assert payload["process"]["stream_capture_complete"] is True
    assert payload["process"]["stream_evidence_frozen"] is True
    assert payload["process"]["generated_outputs_stable"] is True
    assert payload["process"]["pipe_close_complete"] is True


def test_zone_missing_writes_manifest_without_starting_process(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=99
        )
    assert error.value.diagnostic.code == "zone_result_not_found"
    assert not any(isinstance(item, _FakeSimReadProcess) for item in calls)
    result_manifests = list((tmp_path / "results").rglob("result-manifest.json"))
    assert len(result_manifests) == 1
    payload = json.loads(result_manifests[0].read_text(encoding="utf-8"))
    assert payload["process"]["process_started"] is False
    assert payload["generated_outputs"] == []


def test_parse_failure_preserves_process_and_generated_evidence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)
    monkeypatch.setattr(
        simread_runner,
        "parse_zone_air_state",
        lambda *_args: (_ for _ in ()).throw(
            ZoneResultError(simread_runner.ResultDiagnostic("zone_result_contract_invalid", "bad"))
        ),
    )
    with pytest.raises(ZoneResultError):
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    result_manifests = list((tmp_path / "results").rglob("result-manifest.json"))
    assert len(result_manifests) == 1
    payload = json.loads(result_manifests[0].read_text(encoding="utf-8"))
    assert payload["process"]["process_started"] is True
    assert payload["exit_code"] == 0
    assert payload["parsed_result"] is None
    assert {item["suffix"] for item in payload["generated_outputs"]} == {".nfr", ".xrf"}
    assert payload["stdout"]["size_bytes"] > 0
    assert payload["stderr"]["size_bytes"] > 0
    assert payload["stdout"]["capture_complete"] is True


def test_phase4_snapshot_fields_and_diagnostics_are_required(tmp_path: Path) -> None:
    path, payload = _valid_manifest(tmp_path)
    del payload["input_snapshots"][0]["source_sha256"]
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._validate_phase4_manifest(path)
    assert error.value.diagnostic.code == "result_manifest_invalid"

    path, payload = _valid_manifest(tmp_path / "second")
    payload["diagnostics"] = [{"code": "unexpected", "message": "x"}]
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._validate_phase4_manifest(path)
    assert error.value.diagnostic.code == "result_run_evidence_invalid"

    path, payload = _valid_manifest(tmp_path / "third")
    del payload["input_snapshots"][0]["source_size_bytes"]
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._validate_phase4_manifest(path)
    assert error.value.diagnostic.code == "result_manifest_invalid"


@pytest.mark.parametrize("field", ["source_sha256", "snapshot_sha256"])
def test_phase4_source_and_snapshot_hashes_must_match(tmp_path: Path, field: str) -> None:
    path, payload = _valid_manifest(tmp_path)
    payload["input_snapshots"][0][field] = "0" * 64
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._validate_phase4_manifest(path)
    assert error.value.diagnostic.code == "result_prj_snapshot_mismatch"


def test_phase4_top_source_and_snapshot_sizes_must_match(tmp_path: Path) -> None:
    path, payload = _valid_manifest(tmp_path)
    payload["source"]["size_bytes"] += 1
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._validate_phase4_manifest(path)
    assert error.value.diagnostic.code == "result_run_evidence_invalid"

    path, payload = _valid_manifest(tmp_path / "mismatch")
    payload["input_snapshots"][0]["snapshot_size_bytes"] += 1
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner._validate_phase4_manifest(path)
    assert error.value.diagnostic.code == "result_prj_snapshot_mismatch"


def test_result_root_conflicts_are_rejected_before_creation(tmp_path: Path) -> None:
    manifest, source, _, _ = _orchestration_fixture(tmp_path)
    for root in (source.parent, source.parent / "nested"):
        with pytest.raises(simread_runner.SimReadError) as error:
            simread_runner.extract_zone_air_state(
                manifest, simread_path=tmp_path / "missing.exe", result_root=root, zone_number=1
            )
        assert error.value.diagnostic.code == "result_root_conflicts_with_source"
        assert not root.exists() if root != source.parent else True


def test_result_root_inside_phase4_run_is_rejected(tmp_path: Path) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    run_dir = manifest.parent.parent
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest,
            simread_path=tmp_path / "missing.exe",
            result_root=run_dir / "results",
            zone_number=1,
        )
    assert error.value.diagnostic.code == "result_root_conflicts_with_source"
    assert not (run_dir / "results").exists()


def test_workspace_sim_change_after_probe_blocks_popen(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)
    original = simread_runner._recheck_workspace_inputs
    count = 0

    def mutate_on_second(*args):
        nonlocal count
        count += 1
        if count == 2:
            Path(args[3]).write_bytes(b"changed")
        return original(*args)

    monkeypatch.setattr(simread_runner, "_recheck_workspace_inputs", mutate_on_second)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "result_snapshot_mismatch"
    assert not any(isinstance(item, _FakeSimReadProcess) for item in calls)


def test_simread_replacement_after_probe_blocks_formal_process(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)
    def replace_before_formal(_tool):
        tool_path.write_bytes(b"replaced")
        raise simread_runner.SimReadError(
            simread_runner.ResultDiagnostic("simread_unsupported", "identity changed")
        )

    monkeypatch.setattr(simread_runner, "_recheck_simread_identity", replace_before_formal)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_unsupported"
    assert not any(isinstance(item, _FakeSimReadProcess) for item in calls)


def test_workspace_input_change_after_process_is_recorded_as_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)
    original_capture = simread_runner._capture_process_outcome

    def capture_then_mutate(process, *, timeout, evidence, stdin_write_complete=True):
        outcome = original_capture(
            process,
            timeout=timeout,
            evidence=evidence,
            stdin_write_complete=stdin_write_complete,
        )
        Path(evidence.parent / "workspace" / "model.sim").write_bytes(b"changed-after-run")
        return outcome

    monkeypatch.setattr(simread_runner, "_capture_process_outcome", capture_then_mutate)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "result_snapshot_mismatch"
    result_manifests = list((tmp_path / "results").rglob("result-manifest.json"))
    assert len(result_manifests) == 1
    payload = json.loads(result_manifests[0].read_text(encoding="utf-8"))
    assert payload["process"]["process_started"] is True
    assert payload["stdout"]["capture_complete"] is True


def test_simread_identity_change_after_process_is_recorded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)
    count = 0

    def check_identity(_tool):
        nonlocal count
        count += 1
        if count == 2:
            raise simread_runner.SimReadError(
                simread_runner.ResultDiagnostic("simread_unsupported", "identity changed")
            )

    monkeypatch.setattr(simread_runner, "_recheck_simread_identity", check_identity)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_unsupported"
    payload = json.loads(
        next((tmp_path / "results").rglob("result-manifest.json")).read_text(encoding="utf-8")
    )
    assert payload["process"]["process_started"] is True
    assert payload["generated_outputs"]


def test_stdin_failure_keeps_real_process_stream_evidence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)

    class FailingStdin(_FakeStdin):
        def write(self, data):
            raise OSError("stdin closed")

    def popen(args, **kwargs):
        process = _FakeSimReadProcess(b"real stdout", b"real stderr")
        process.stdin = FailingStdin(process)
        calls.append(process)
        return process

    monkeypatch.setattr(simread_runner.subprocess, "Popen", popen)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_stdin_failed"
    result_manifests = list((tmp_path / "results").rglob("result-manifest.json"))
    payload = json.loads(result_manifests[0].read_text(encoding="utf-8"))
    assert payload["process"]["process_started"] is True
    assert payload["process"]["stdin_write_complete"] is False
    assert payload["stdout"]["size_bytes"] == len(b"real stdout")
    assert payload["stderr"]["size_bytes"] == len(b"real stderr")


def test_timeout_records_termination_and_stream_evidence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)

    class TimeoutProcess(_FakeSimReadProcess):
        def __init__(self):
            super().__init__(b"timeout stdout", b"timeout stderr")
            self.wait_calls = 0

        def wait(self, timeout=None):
            self.wait_calls += 1
            if self.wait_calls == 1:
                raise subprocess.TimeoutExpired("simread", timeout)
            return -15

    def popen(args, **kwargs):
        process = TimeoutProcess()
        calls.append(process)
        return process

    monkeypatch.setattr(simread_runner.subprocess, "Popen", popen)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_process_timeout"
    payload = json.loads(
        next((tmp_path / "results").rglob("result-manifest.json")).read_text(encoding="utf-8")
    )
    assert payload["timed_out"] is True
    assert payload["process"]["termination_attempted"] is True
    assert payload["stdout"]["size_bytes"] == len(b"timeout stdout")


def test_stream_failure_cannot_produce_success_manifest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)

    class BrokenStream:
        def read(self, _size):
            raise OSError("pipe failed")

    def popen(args, **kwargs):
        process = _FakeSimReadProcess()
        process.stdout = BrokenStream()
        calls.append(process)
        return process

    monkeypatch.setattr(simread_runner.subprocess, "Popen", popen)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_stream_capture_failed"
    payload = json.loads(
        next((tmp_path / "results").rglob("result-manifest.json")).read_text(encoding="utf-8")
    )
    assert payload["status"] == "failed"
    assert payload["parsed_result"] is None
    assert payload["stdout"]["capture_complete"] is False


def test_confirmed_exit_keeps_generated_artifact_hashes_when_stream_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)

    class BrokenStream:
        def read(self, _size):
            raise OSError("pipe failed")

    def popen(_args, **kwargs):
        process = _FakeSimReadProcess()
        process.stdout = BrokenStream()
        workspace = Path(kwargs["cwd"])
        (workspace / "model.nfr").write_bytes(b"stable-output")
        (workspace / "model.xrf").write_bytes(b"stable-xrf")
        calls.append(process)
        return process

    monkeypatch.setattr(simread_runner.subprocess, "Popen", popen)
    with pytest.raises(simread_runner.SimReadError):
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    payload = json.loads(next((tmp_path / "results").rglob("result-manifest.json")).read_text(encoding="utf-8"))
    assert payload["process"]["exit_confirmed"] is True
    assert payload["process"]["generated_outputs_stable"] is True
    assert all(item["stable"] is True for item in payload["generated_outputs"])


def test_wait_oserror_still_terminates_and_records_exit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)

    class Process(_FakeSimReadProcess):
        def __init__(self):
            super().__init__()
            self.wait_calls = 0
            self.terminate_calls = 0

        def wait(self, timeout=None):
            self.wait_calls += 1
            if self.wait_calls == 1:
                raise OSError("wait unavailable")
            return 0

        def terminate(self):
            self.terminate_calls += 1

    def popen(_args, **_kwargs):
        process = Process()
        calls.append(process)
        return process

    monkeypatch.setattr(simread_runner.subprocess, "Popen", popen)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_process_failed"
    payload = json.loads(next((tmp_path / "results").rglob("result-manifest.json")).read_text(encoding="utf-8"))
    assert calls[-1].terminate_calls == 1
    assert payload["process"]["terminate_requested"] is True
    assert payload["process"]["exit_confirmed"] is True
    assert payload["process"]["termination_succeeded"] is True


def test_wait_and_terminate_failure_falls_back_to_kill(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)

    class Process(_FakeSimReadProcess):
        def __init__(self):
            super().__init__()
            self.wait_calls = 0
            self.kill_calls = 0

        def wait(self, timeout=None):
            self.wait_calls += 1
            if self.wait_calls < 3:
                raise OSError("wait unavailable")
            return -9

        def terminate(self):
            raise OSError("terminate unavailable")

        def kill(self):
            self.kill_calls += 1

    def popen(_args, **_kwargs):
        process = Process()
        calls.append(process)
        return process

    monkeypatch.setattr(simread_runner.subprocess, "Popen", popen)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_process_failed"
    payload = json.loads(next((tmp_path / "results").rglob("result-manifest.json")).read_text(encoding="utf-8"))
    assert calls[-1].kill_calls == 1
    assert payload["process"]["kill_requested"] is True
    assert payload["process"]["exit_confirmed"] is True
    assert payload["process"]["termination_succeeded"] is True


def test_termination_unconfirmed_is_not_successful(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)

    class Process(_FakeSimReadProcess):
        def wait(self, timeout=None):
            raise OSError("wait unavailable")

        def terminate(self):
            raise OSError("terminate unavailable")

        def kill(self):
            raise OSError("kill unavailable")

    monkeypatch.setattr(simread_runner.subprocess, "Popen", lambda *_a, **_k: Process())
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_process_termination_failed"
    payload = json.loads(next((tmp_path / "results").rglob("result-manifest.json")).read_text(encoding="utf-8"))
    assert payload["process"]["exit_confirmed"] is False
    assert payload["process"]["termination_succeeded"] is False


def test_live_stream_thread_is_not_reported_complete(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)

    class StuckThread:
        def __init__(self, *_args, **_kwargs):
            pass

        def start(self):
            pass

        def join(self, timeout=None):
            pass

        def is_alive(self):
            return True

    monkeypatch.setattr(simread_runner.threading, "Thread", StuckThread)
    monkeypatch.setattr(simread_runner.subprocess, "Popen", lambda *_a, **_k: _FakeSimReadProcess())
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_stream_capture_failed"
    payload = json.loads(next((tmp_path / "results").rglob("result-manifest.json")).read_text(encoding="utf-8"))
    assert payload["process"]["stream_capture_complete"] is False
    assert payload["stdout"]["capture_complete"] is False


def test_unconfirmed_process_closes_blocked_streams_and_freezes_evidence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)

    class BlockingStream:
        def __init__(self):
            self.started = threading.Event()
            self.closed = threading.Event()
            self.done = threading.Event()

        def read(self, _size):
            self.started.set()
            self.closed.wait(0.5)
            self.done.set()
            return b""

        def close(self):
            self.closed.set()

    class Process:
        def __init__(self):
            self.stdout = BlockingStream()
            self.stderr = BlockingStream()
            self.stdin_bytes = b""
            self.stdin = _FakeStdin(self)

        def wait(self, timeout=None):
            raise OSError("wait unavailable")

        def terminate(self):
            raise OSError("terminate unavailable")

        def kill(self):
            raise OSError("kill unavailable")

    def popen(_args, **_kwargs):
        process = Process()
        workspace = Path(_kwargs["cwd"])
        (workspace / "model.nfr").write_bytes(b"partial")
        (workspace / "model.xrf").write_bytes(b"partial")
        calls.append(process)
        return process

    monkeypatch.setattr(simread_runner.subprocess, "Popen", popen)
    monkeypatch.setattr(simread_runner, "STREAM_JOIN_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(simread_runner, "STREAM_CLOSE_JOIN_TIMEOUT_SECONDS", 0.5)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "simread_process_termination_failed"
    process = calls[-1]
    assert process.stdout.started.wait(1)
    assert process.stderr.started.wait(1)
    assert process.stdout.closed.is_set() and process.stderr.closed.is_set()
    assert process.stdout.done.wait(1) and process.stderr.done.wait(1)
    result_manifest = next((tmp_path / "results").rglob("result-manifest.json"))
    payload = json.loads(result_manifest.read_text(encoding="utf-8"))
    assert payload["process"]["exit_confirmed"] is False
    assert payload["process"]["termination_succeeded"] is False
    assert payload["process"]["stream_evidence_frozen"] is True
    assert payload["process"]["generated_outputs_stable"] is False
    artifacts = {item["relative_path"]: item for item in payload["generated_outputs"]}
    assert artifacts["workspace/model.nfr"]["sha256"] is None
    assert artifacts["workspace/model.nfr"]["size_bytes"] is None
    assert artifacts["workspace/model.nfr"]["stable"] is False
    assert artifacts["workspace/model.nfr"]["evidence_semantics"] == "snapshot_at_manifest_creation"
    stdout_path = result_manifest.parent / "stdout.bin"
    before = (stdout_path.stat().st_mtime_ns, stdout_path.stat().st_size, hashlib.sha256(stdout_path.read_bytes()).hexdigest())
    assert process.stdout.done.wait(1)
    after = (stdout_path.stat().st_mtime_ns, stdout_path.stat().st_size, hashlib.sha256(stdout_path.read_bytes()).hexdigest())
    assert before == after


def test_final_evidence_records_workspace_mutation_after_parse(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)
    original_parse = simread_runner.parse_zone_air_state

    def mutate_parse(path: Path, zone_number: int):
        (path.parent / "model.sim").write_bytes(b"changed-after-parse")
        return original_parse(path, zone_number)

    monkeypatch.setattr(simread_runner, "parse_zone_air_state", mutate_parse)
    with pytest.raises(simread_runner.SimReadError) as error:
        simread_runner.extract_zone_air_state(
            manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
        )
    assert error.value.diagnostic.code == "result_snapshot_mismatch"
    payload = json.loads(next((tmp_path / "results").rglob("result-manifest.json")).read_text(encoding="utf-8"))
    assert payload["final_evidence"]["workspace_sim_unchanged"] is False
    assert payload["generated_outputs"]


def test_success_records_all_final_evidence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest, _, _, _ = _orchestration_fixture(tmp_path)
    calls: list = []
    tool_path = _patch_fake_simread(monkeypatch, tmp_path, calls)
    result = simread_runner.extract_zone_air_state(
        manifest, simread_path=tool_path, result_root=tmp_path / "results", zone_number=1
    )
    payload = json.loads(Path(result["result_manifest_path"]).read_text(encoding="utf-8"))
    assert payload["final_evidence"] == {
        "phase4_manifest_unchanged": True,
        "phase4_prj_unchanged": True,
        "phase4_sim_unchanged": True,
        "workspace_prj_unchanged": True,
        "workspace_sim_unchanged": True,
        "simread_unchanged": True,
    }


def test_result_model_matches_written_schema() -> None:
    from contam_studio_core.simread_models import ResultExtractionManifest, RunManifestEvidence

    model = ResultExtractionManifest(
        "1.0",
        "x",
        "failed",
        "isolated_simread_conversion",
        "start",
        "end",
        1,
        {"solver": {"name": "contamx3.exe"}},
        RunManifestEvidence("evidence/manifest.json", "a" * 64, True),
        (),
        None,
        {"executable": "simread.exe", "arguments": []},
        {
            "process_started": False,
            "stdin_write_complete": False,
            "termination_attempted": False,
            "termination_succeeded": None,
            "stream_capture_complete": True,
            "diagnostic_code": "x",
        },
        "workspace",
        None,
        False,
        {},
        {},
        (),
        "zone_air_state",
        1,
        None,
        (),
    ).to_dict()
    assert isinstance(model["run_manifest"], dict)
    assert "process" in model and "exit_code" in model and "timed_out" in model
    assert "final_evidence" in model
