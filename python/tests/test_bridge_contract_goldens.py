from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

import contam_studio_core.zone_bridge as bridge
from contam_studio_core.contamx_run_models import (
    ContamXSolverInfo,
    ContamXRunManifest,
    ContamXRunResult,
    RunInputSnapshot,
    RunStreamEvidence,
)
from contam_studio_core.simread_models import ZoneAirStateSample, ZoneAirStateSeries
from contam_studio_core.zone_bridge import (
    OPERATION_APPLY_ZONE_VOLUME_PATCH,
    OPERATION_EXTRACT_ZONE_AIR_STATE,
    OPERATION_PLAN_ZONE_VOLUME_PATCH,
    OPERATION_READ_SIMPLE_ZONES,
    OPERATION_RUN_ACTIVE_PROJECT,
    handle_request,
)
from contam_studio_core.zone_volume_patch import plan_zone_volume_patch

REPO_ROOT = Path(__file__).parents[2]
CONTRACT_ROOT = REPO_ROOT / "contracts" / "python-rust-bridge" / "v1.2"
TRACKED_PRJ = REPO_ROOT / "fixtures" / "contam" / "official-contamxpy" / "valThreeZonesWthCtm-UseApi.prj"


def _replace_exact(value: Any, replacements: dict[str, str]) -> Any:
    if isinstance(value, dict):
        return {key: _replace_exact(item, replacements) for key, item in value.items()}
    if isinstance(value, list):
        return [_replace_exact(item, replacements) for item in value]
    if isinstance(value, str):
        return replacements.get(value, value)
    return value


def _assert_golden(operation: str, envelope: dict[str, object], replacements: dict[str, str]) -> None:
    normalized = _replace_exact(envelope, replacements)
    golden = json.loads((CONTRACT_ROOT / operation / "success.json").read_text(encoding="utf-8"))
    assert normalized == golden


def test_read_bridge_envelope_matches_golden() -> None:
    envelope = handle_request(
        {
            "operation": OPERATION_READ_SIMPLE_ZONES,
            "protocol_version": "1.2",
            "request_id": "read-success",
            "source_path": str(TRACKED_PRJ),
        }
    )
    _assert_golden("read", envelope, {str(TRACKED_PRJ): "${SOURCE_PRJ}"})


def test_plan_bridge_envelope_matches_golden() -> None:
    envelope = handle_request(
        {
            "contam_number": 1,
            "new_volume_token": "650",
            "operation": OPERATION_PLAN_ZONE_VOLUME_PATCH,
            "protocol_version": "1.2",
            "request_id": "plan-success",
            "source_path": str(TRACKED_PRJ),
        }
    )
    _assert_golden("plan", envelope, {str(TRACKED_PRJ): "${SOURCE_PRJ}"})


def test_apply_bridge_envelope_matches_golden(tmp_path: Path) -> None:
    output = tmp_path / "copy.prj"
    patch = plan_zone_volume_patch(TRACKED_PRJ, 1, "650").to_dict()
    envelope = handle_request(
        {
            "operation": OPERATION_APPLY_ZONE_VOLUME_PATCH,
            "output_path": str(output),
            "patch": patch,
            "protocol_version": "1.2",
            "request_id": "apply-success",
            "source_path": str(TRACKED_PRJ),
        }
    )
    _assert_golden(
        "apply",
        envelope,
        {str(TRACKED_PRJ): "${SOURCE_PRJ}", str(output): "${OUTPUT_PRJ}"},
    )


def _run_dataclass(source: Path, run_root: Path) -> ContamXRunResult:
    source_sha256 = "a" * 64
    solver = ContamXSolverInfo(
        path="C:/tools/contamx3.exe",
        name="contamx3.exe",
        version="3.4.0.3",
        sha256="b" * 64,
        size_bytes=100,
        architecture="windows-x64",
        provenance="deterministic contract mock",
    )
    snapshot = RunInputSnapshot(
        relative_path="workspace/model.prj",
        source_path=str(source),
        source_sha256=source_sha256,
        source_size_bytes=1,
        snapshot_sha256=source_sha256,
        snapshot_size_bytes=1,
    )
    stdout = RunStreamEvidence("evidence/stdout.bin", 0, "c" * 64, False)
    stderr = RunStreamEvidence("evidence/stderr.bin", 0, "d" * 64, False)
    manifest = ContamXRunManifest(
        schema_version="1.0",
        run_id="run-1",
        status="succeeded",
        execution_mode="isolated_contamx_process",
        started_at_utc="2026-01-01T00:00:00Z",
        ended_at_utc="2026-01-01T00:00:01Z",
        duration_ms=1000,
        source={
            "directory_entries_after": [],
            "directory_entries_before": [],
            "path": str(source),
            "sha256": source_sha256,
            "size_bytes": 1,
            "unchanged": True,
        },
        input_snapshots=(snapshot,),
        solver=solver,
        command={"arguments": ["model.prj"], "executable": "contamx3.exe"},
        working_directory=str(run_root),
        exit_code=0,
        timed_out=False,
        stdout=stdout,
        stderr=stderr,
        artifacts=(),
        diagnostics=(),
    )
    return ContamXRunResult(
        run_id="run-1",
        status="succeeded",
        run_directory=str(run_root),
        manifest_path=str(run_root / "evidence" / "manifest.json"),
        solver_version="3.4.0.3",
        exit_code=0,
        timed_out=False,
        primary_artifacts=(),
        manifest=manifest,
    )


def test_run_bridge_envelope_matches_deterministic_dataclass_golden(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    run_root = tmp_path / "run"
    monkeypatch.setattr(bridge, "run_contamx", lambda *args, **kwargs: _run_dataclass(TRACKED_PRJ, run_root))
    envelope = handle_request(
        {
            "operation": OPERATION_RUN_ACTIVE_PROJECT,
            "protocol_version": "1.2",
            "request_id": "run-success",
            "run_root": str(run_root),
            "source_path": str(TRACKED_PRJ),
            "source_sha256": "a" * 64,
        }
    )
    _assert_golden(
        "run",
        envelope,
        {
            str(TRACKED_PRJ): "${SOURCE_PRJ}",
            str(run_root): "${RUN_ROOT}",
            str(run_root / "evidence" / "manifest.json"): "${MANIFEST}",
        },
    )


def test_extract_bridge_envelope_matches_deterministic_result_golden(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    manifest = tmp_path / "run" / "evidence" / "manifest.json"
    result_root = tmp_path / "results"
    sample = ZoneAirStateSample(
        index=0,
        day_of_year=1,
        day_type=None,
        sim_time_seconds=0.0,
        temperature_k=293.15,
        reference_pressure_pa=101325.0,
        air_density_kg_m3=1.2041,
    )
    series = ZoneAirStateSeries(
        schema_version="1.0",
        result_type="zone_air_state",
        run_id="run-1",
        extraction_id="extract-1",
        zone_number=1,
        zone_name="one",
        source_line_number=362,
        unit_system="SI",
        sample_count=1,
        samples=(sample,),
        source_evidence={
            "relative_path": "workspace/zone.nfr",
            "sha256": "e" * 64,
            "size_bytes": 1,
        },
    )
    monkeypatch.setattr(
        bridge,
        "extract_zone_air_state",
        lambda *args, **kwargs: {
            "extraction_id": "extract-1",
            "first_sample": sample.to_dict(),
            "parsed_result": series.to_dict(),
            "result_manifest_path": str(manifest),
            "run_id": "run-1",
            "sample_count": 1,
            "status": "succeeded",
            "zone_name": "one",
            "zone_number": 1,
        },
    )
    envelope = handle_request(
        {
            "manifest_path": str(manifest),
            "operation": OPERATION_EXTRACT_ZONE_AIR_STATE,
            "protocol_version": "1.2",
            "request_id": "extract-success",
            "result_root": str(result_root),
            "source_path": str(TRACKED_PRJ),
            "source_sha256": "e" * 64,
            "zone_number": 1,
        }
    )
    _assert_golden(
        "extract",
        envelope,
        {
            str(TRACKED_PRJ): "${SOURCE_PRJ}",
            str(manifest): "${MANIFEST}",
            str(result_root): "${RUN_ROOT}",
        },
    )
