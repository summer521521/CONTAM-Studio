from __future__ import annotations

import hashlib
import io
import json
import subprocess
from pathlib import Path

import pytest

from contam_studio_core import simread_runner
from contam_studio_core.simread_models import SimReadToolInfo


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
    assert error.value.diagnostic.code == "simread_process_failed"


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
