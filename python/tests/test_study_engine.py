from __future__ import annotations

import json
from pathlib import Path

import pytest

from contam_studio_core.study_engine import (
    StudyError,
    StudyParameter,
    StudyResultStore,
    StudySampleResult,
    StudyExecutor,
    aggregate_study_status,
    analyze_study_results,
    create_study_plan,
    make_study_report,
    write_study_report,
)
from contam_studio_core.study_visualization import build_relation_points, build_time_series


HASH = "a" * 64


def zone_volume(parameter_id: str = "volume") -> StudyParameter:
    return StudyParameter(
        parameter_id, "zone_volume_m3", "zone-1", "Zone volume", "m3", 100, 200, 50, (), 100
    )


def flow_multiplier(parameter_id: str = "flow") -> StudyParameter:
    return StudyParameter(
        parameter_id,
        "flow_path_multiplier",
        "path-1",
        "FlowPath multiplier",
        "1",
        0.5,
        1.5,
        0.5,
        (),
        1.0,
    )


def test_plan_hash_is_stable_and_samples_are_deterministic() -> None:
    first = create_study_plan(
        baseline_project_sha256=HASH, revision_id="revision-1", parameters=(zone_volume(),)
    )
    second = create_study_plan(
        baseline_project_sha256=HASH, revision_id="revision-1", parameters=(zone_volume(),)
    )
    assert first.study_hash == second.study_hash
    assert first.study_id == second.study_id
    assert [item.sample_id for item in first.samples] == [item.sample_id for item in second.samples]


def test_parameter_bounds_and_combination_cap() -> None:
    with pytest.raises(StudyError, match="边界"):
        StudyParameter("bad", "zone_volume_m3", "zone-1", "bad", "m3", 2, 1, 1)
    with pytest.raises(StudyError, match="组合"):
        create_study_plan(
            baseline_project_sha256=HASH,
            revision_id="revision-1",
            parameters=(StudyParameter("v", "zone_volume_m3", "zone-1", "v", "m3", 1, 100, 1),),
        )


def test_cartesian_and_user_combinations() -> None:
    name = StudyParameter(
        "name", "zone_name", "zone-1", "Name", None, discrete_values=("A", "B"), default_value="A"
    )
    plan = create_study_plan(
        baseline_project_sha256=HASH,
        revision_id="revision-1",
        parameters=(zone_volume(), name),
        mode="cartesian",
    )
    assert len(plan.samples) == 6
    user = create_study_plan(
        baseline_project_sha256=HASH,
        revision_id="revision-1",
        parameters=(zone_volume(),),
        mode="user_combinations",
        user_combinations=({"volume": 150},),
    )
    assert user.samples[0].values["volume"] == 150


def test_schedule_and_species_parameters_fail_closed_before_official_run() -> None:
    schedule = StudyParameter("schedule", "schedule_value", "schedule-1", "Schedule", "1", 0, 1, 1)
    species = StudyParameter("species", "species_initial", "species-1", "Species", "kg/m3", 0, 1, 1)
    for parameter in (schedule, species):
        with pytest.raises(StudyError, match="只读"):
            create_study_plan(
                baseline_project_sha256=HASH,
                revision_id="revision-1",
                parameters=(parameter,),
            )


def test_cartesian_product_keeps_all_values_for_two_and_three_parameters() -> None:
    first = StudyParameter("a", "zone_volume_m3", "zone-1", "A", "m3", 10, 30, 10)
    second = flow_multiplier("b")
    third = StudyParameter(
        "c", "zone_name", "zone-1", "Name", None, discrete_values=("A", "B"), default_value="A"
    )
    two = create_study_plan(
        baseline_project_sha256=HASH,
        revision_id="revision-1",
        parameters=(first, second),
        mode="cartesian",
    )
    assert len(two.samples) == 9
    assert all(set(sample.values) == {"a", "b"} for sample in two.samples)
    assert [sample.values for sample in two.samples[:3]] == [
        {"a": 10.0, "b": 0.5},
        {"a": 10.0, "b": 1.0},
        {"a": 10.0, "b": 1.5},
    ]
    three = create_study_plan(
        baseline_project_sha256=HASH,
        revision_id="revision-1",
        parameters=(first, second, third),
        mode="cartesian",
    )
    assert len(three.samples) == 18
    assert all(set(sample.values) == {"a", "b", "c"} for sample in three.samples)


def test_parameter_order_is_canonical_and_duplicate_targets_are_rejected() -> None:
    first = StudyParameter("a", "zone_volume_m3", "zone-1", "A", "m3", 10, 30, 10)
    second = flow_multiplier("b")
    left = create_study_plan(
        baseline_project_sha256=HASH,
        revision_id="revision-1",
        parameters=(first, second),
        mode="cartesian",
    )
    right = create_study_plan(
        baseline_project_sha256=HASH,
        revision_id="revision-1",
        parameters=(second, first),
        mode="cartesian",
    )
    assert left.study_hash == right.study_hash
    assert [item.sample_id for item in left.samples] == [item.sample_id for item in right.samples]
    with pytest.raises(StudyError, match="同一对象"):
        create_study_plan(
            baseline_project_sha256=HASH,
            revision_id="revision-1",
            parameters=(
                zone_volume("volume-a"),
                zone_volume("volume-b"),
            ),
            mode="cartesian",
        )


def test_result_store_paging_filter_and_no_overwrite(tmp_path: Path) -> None:
    plan = create_study_plan(
        baseline_project_sha256=HASH, revision_id="revision-1", parameters=(zone_volume(),)
    )
    store = StudyResultStore(tmp_path)
    store.save_plan(plan)
    assert store.read_plan(plan.study_id).study_hash == plan.study_hash
    result = StudySampleResult(
        plan.study_id,
        plan.study_hash,
        plan.samples[0].sample_id,
        "succeeded",
        plan.samples[0].values,
        HASH,
        {"solver": "fixture"},
        {"value": 12.0, "zone_id": "zone-1", "time_seconds": 0.0},
        "b" * 64,
        generated_at="2026-01-01T00:00:00Z",
        evidence=(
            {
                "sample_id": plan.samples[0].sample_id,
                "result_hash": "b" * 64,
                "zone_id": "zone-1",
                "time_seconds": 0.0,
            },
        ),
    )
    store.save_result(result)
    with pytest.raises(StudyError, match="已存在"):
        store.save_result(result)
    page = store.page_results(plan.study_id, plan_hash=plan.study_hash, limit=1, object_id="zone-1")
    assert page["total"] == 1 and page["stale"] is False
    assert store.page_results(plan.study_id, plan_hash="c" * 64)["stale"] is True
    assert store.page_results(plan.study_id, plan_hash=plan.study_hash)["project_sha256"] == HASH
    with pytest.raises(StudyError, match="排序"):
        store.page_results(plan.study_id, sort_by="path")
    retry = StudySampleResult(
        result.study_id,
        result.study_hash,
        result.sample_id,
        result.status,
        result.parameters,
        result.project_sha256,
        result.solver_manifest,
        result.statistics,
        result.result_hash,
        result.error,
        "2026-01-01T00:00:01Z",
        result.provenance,
        result.evidence,
        "retry-1",
    )
    store.save_result(retry)
    assert store.page_results(plan.study_id, plan_hash=plan.study_hash, limit=10)["total"] == 1


def test_result_store_rejects_path_like_identifiers(tmp_path: Path) -> None:
    store = StudyResultStore(tmp_path)
    with pytest.raises(StudyError, match="标识"):
        store.page_results("../outside", limit=1)


def test_analysis_requires_evidence_and_cites_hashes() -> None:
    with pytest.raises(StudyError, match="证据"):
        analyze_study_results([])
    results = [
        StudySampleResult(
            "study",
            HASH,
            "s1",
            "succeeded",
            {"v": 1},
            HASH,
            {},
            {"value": 2.0, "zone_id": "zone-1", "time_seconds": 0.0},
            "b" * 64,
            generated_at="now",
            evidence=(
                {
                    "sample_id": "s1",
                    "result_hash": "b" * 64,
                    "zone_id": "zone-1",
                    "time_seconds": 0.0,
                },
            ),
        ),
        StudySampleResult(
            "study",
            HASH,
            "s2",
            "succeeded",
            {"v": 2},
            HASH,
            {},
            {"value": 5.0, "zone_id": "zone-1", "time_seconds": 0.0},
            "c" * 64,
            generated_at="now",
            evidence=(
                {
                    "sample_id": "s2",
                    "result_hash": "c" * 64,
                    "zone_id": "zone-1",
                    "time_seconds": 0.0,
                },
            ),
        ),
    ]
    analysis = analyze_study_results(results)
    assert analysis["minimum"] == 2.0
    assert all(item["evidence"] for item in analysis["conclusions"])


def test_visualization_preserves_series_missing_values_and_evidence() -> None:
    result = StudySampleResult(
        "study",
        HASH,
        "s1",
        "succeeded",
        {"v": 10},
        HASH,
        {},
        {
            "value": 2.0,
            "zone_id": "zone-1",
            "time_seconds": 0.0,
            "series": [
                {"time_seconds": 0.0, "zone_id": "zone-1", "temperature_k": 293.1},
                {"time_seconds": 60.0, "zone_id": "zone-1", "temperature_k": None},
            ],
        },
        "b" * 64,
        generated_at="now",
        evidence=({"sample_id": "s1", "result_hash": "b" * 64},),
    )
    raw = result.to_dict()
    relation = build_relation_points([raw], "v")
    assert relation[0]["x"] == 10 and relation[0]["y"] == 2
    temperature_relation = build_relation_points(
        [raw], "v", metric="temperature_k", zone_id="zone-1", time_seconds=0.0
    )
    assert temperature_relation[0]["y"] == 293.1
    assert not build_relation_points([raw], "v", metric="temperature_k", time_seconds=60.0)
    series = build_time_series([raw], metric="temperature_k")
    assert len(series) == 2 and series[1]["value"] is None

    analysis = analyze_study_results([result])
    assert all("parameter_values" in ref and "metric" in ref and "timestamp" in ref for item in analysis["conclusions"] for ref in item["evidence"])


def test_executor_isolates_failure_and_supports_cancel(tmp_path: Path) -> None:
    plan = create_study_plan(
        baseline_project_sha256=HASH, revision_id="revision-1", parameters=(zone_volume(),)
    )

    def runner(sample, workspace):
        assert workspace.is_dir()
        if sample.ordinal == 1:
            raise StudyError("fixture_failure", "fixture failed")
        return {
            "statistics": {"value": float(sample.ordinal)},
            "solver_manifest": {"version": "fixture"},
        }

    executor = StudyExecutor(plan, workspace_root=tmp_path / "runs", runner=runner)
    results = executor.run()
    assert [item.status for item in results] == ["succeeded", "failed", "succeeded"]
    assert aggregate_study_status(results, len(plan.samples)) == "partial"
    executor.cancel()
    assert executor.run()[-1].status == "succeeded"


def test_aggregate_status_distinguishes_all_failed_and_cancelled() -> None:
    failed = StudySampleResult("study", HASH, "failed-1", "failed", {}, HASH, {})
    cancelled = StudySampleResult("study", HASH, "cancelled-1", "cancelled", {}, HASH, {})
    assert aggregate_study_status([failed], 1) == "failed"
    assert aggregate_study_status([cancelled], 1) == "cancelled"


def test_reports_are_consistent_and_non_overwriting(tmp_path: Path) -> None:
    plan = create_study_plan(
        baseline_project_sha256=HASH, revision_id="revision-1", parameters=(zone_volume(),)
    )
    result = StudySampleResult(
        plan.study_id,
        plan.study_hash,
        plan.samples[0].sample_id,
        "failed",
        plan.samples[0].values,
        HASH,
        {},
        error={"code": "failed", "message": "fixture"},
        generated_at="now",
    )
    report = make_study_report(
        plan=plan,
        results=(result,),
        solver_manifest={"version": "fixture"},
        provenance="synthetic fixture",
    )
    outputs = [
        write_study_report(report, tmp_path / f"report{suffix}")
        for suffix in (".html", ".pdf", ".csv", ".json")
    ]
    assert (tmp_path / "report.pdf").read_bytes().startswith(b"%PDF-")
    pdf = (tmp_path / "report.pdf").read_bytes()
    assert pdf.count(b"/Type /Page") >= 2
    assert b"STSong-Light" in pdf
    assert b"/Contents" in pdf
    html_report = (tmp_path / "report.html").read_text(encoding="utf-8")
    assert "<svg" in html_report and "参数关系图" in html_report
    assert (
        json.loads((tmp_path / "report.json").read_text(encoding="utf-8"))["study_hash"]
        == plan.study_hash
    )
    assert all(item.exists() for item in outputs)
    with pytest.raises(StudyError, match="覆盖"):
        write_study_report(report, tmp_path / "report.json")
