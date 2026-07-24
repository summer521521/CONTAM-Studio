from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from contam_studio_core.artifact_store import ArtifactError, OwnedArtifactStore
from contam_studio_core.process_controller import ProcessController, ProcessError, ProcessStatus
from contam_studio_core.result_store import ResultError, ResultSample, compare_results, compute_statistics, create_result, page_result
from contam_studio_core.run_history import make_run_record, write_run_record
from contam_studio_core.study_report import StudyError, make_report_model, make_sweep_plan, write_report
from contam_studio_core.tool_registry import ToolRegistry, ToolState


def test_process_lease_requires_job_pid_stream_and_cleanup_proof() -> None:
    now = [100.0]
    controller = ProcessController(total_budget_seconds=10, now=lambda: now[0])
    lease = controller.queue(("contamx.exe", "snapshot.prj"), run_id="run-1")
    with pytest.raises(ProcessError, match="Job"):
        controller.mark_starting(lease.evidence.operation_id, job_proof=False)
    controller.mark_starting(lease.evidence.operation_id, job_proof=True)
    controller.mark_running(lease.evidence.operation_id, pid_proof=True)
    now[0] = 111
    timed_out = controller.finish(lease.evidence.operation_id, exit_code=0, pid_proof=True, stream_frozen=True, cleanup_proof=True)
    assert timed_out.status == ProcessStatus.TIMED_OUT


def test_tool_registry_is_explicit_and_detects_replacement(tmp_path: Path) -> None:
    tool = tmp_path / "ContamX.exe"
    tool.write_bytes(b"one")
    registry = ToolRegistry()
    first = registry.probe("contamx", tool, expected_name="ContamX.exe", version="1", architecture="x64", provenance="user_selected")
    assert first.state == ToolState.VERIFIED
    tool.write_bytes(b"two")
    changed = registry.probe("contamx", tool, expected_name="ContamX.exe", version="1", architecture="x64", provenance="user_selected")
    assert changed.state == ToolState.CHANGED
    assert "sha256_prefix" in changed.identity.safe_view(changed.state)


def test_owned_store_quarantine_cleanup_requires_preview_confirmation(tmp_path: Path) -> None:
    store = OwnedArtifactStore(tmp_path / "owned", soft_quota_bytes=10, hard_quota_bytes=100)
    manifest = store.put("temporary", "stale.bin", b"123")
    old = datetime.now(timezone.utc) - timedelta(hours=25)
    path = store.manifest_root / f"{manifest.artifact_id}.json"
    payload = path.read_text(encoding="utf-8").replace(manifest.last_used_at_utc, old.isoformat().replace("+00:00", "Z"))
    path.write_text(payload, encoding="utf-8")
    preview = store.preview_cleanup()
    assert [item.artifact_id for item in preview] == [manifest.artifact_id]
    with pytest.raises(ArtifactError, match="确认"):
        store.delete_owned((manifest.artifact_id,), confirm=False)
    assert store.delete_owned((manifest.artifact_id,), confirm=True) == (manifest.artifact_id,)


def test_result_paging_statistics_and_exact_comparison() -> None:
    samples_a = (ResultSample(0, "zone-1", 0.0, 1.0), ResultSample(1, "zone-1", 60.0, None), ResultSample(2, "zone-1", 120.0, 3.0))
    samples_b = (ResultSample(0, "zone-1", 0.0, 2.0), ResultSample(1, "zone-1", 60.0, None), ResultSample(2, "zone-1", 120.0, 5.0))
    kwargs = dict(run_id="run", scenario_id="scenario", baseline_sha256="a" * 64, revision_id="revision", profile="profile", result_type="zone_air_state", unit="K", time_basis="seconds", parser_identity="simread@1", calculator_version="stats@1")
    a = create_result(**kwargs, samples=samples_a)
    b = create_result(**kwargs, samples=samples_b)
    page = page_result(a, limit=2)
    assert len(page.samples) == 2 and page.next_cursor
    assert compute_statistics(a).mean == 2.0
    comparison = compare_results(a, b)
    assert comparison.values[0][3] == 1.0 and comparison.values[1][3] is None
    with pytest.raises(ResultError, match="不一致"):
        compare_results(a, create_result(**{**kwargs, "unit": "Pa"}, samples=samples_b))


def test_run_history_and_report_are_non_overwriting(tmp_path: Path) -> None:
    record = make_run_record(baseline_sha256="b" * 64, revision_id="rev", scenario_id="scenario", status="succeeded", tool_id="contamx", tool_sha256="c" * 64, input_hashes=("d" * 64,), result_available=True)
    path = write_run_record(tmp_path / "runs", record)
    assert path.is_file()
    model = make_report_model(purpose="study", profile="profile", baseline_sha256="b" * 64, scenario_id="scenario", revision_id="rev", assumptions=(), tool_identity={"tool": "contamx"}, run_ids=(record.run_id,), result_ids=(), comparison_ids=(), limitations=("GUI pending",), evidence_hashes=(record.evidence_hash,))
    report = write_report(model, tmp_path / "report.html")
    assert report.is_file()
    with pytest.raises(StudyError):
        write_report(model, report)
    plan = make_sweep_plan(baseline_sha256="b" * 64, parameter="volume_m3", unit="m3", values=(300.0, 600.0), scenario_ids=("a", "b"))
    assert len(plan.cases) == 2
