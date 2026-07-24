from __future__ import annotations

from pathlib import Path

import pytest

from contam_studio_core.companion_boundary import CompanionDeclaration, CompanionError, bind_companions
from contam_studio_core.compatibility import CompatibilityStatus, audit_domain, classify_project
from contam_studio_core.domain_network import NetworkProjectionError, read_and_project_airflow
from contam_studio_core.domain_schedule import ScheduleError, TimePoint, make_day_schedule, page_day_schedule
from contam_studio_core.draft_revisions import RevisionError, RevisionStore, ScenarioCatalog
from contam_studio_core.zone_volume_patch import plan_zone_volume_patch


ROOT = Path(__file__).resolve().parents[2]
VAL = ROOT / "fixtures/contam/official-contamxpy/valThreeZonesWthCtm-UseApi.prj"
INFO = ROOT / "fixtures/contam/official-contamxpy/test_GetPrjInfo.prj"
NIST = ROOT / "fixtures/contam/official-nist-tutorials/demo1c.prj"


def test_official_airflow_projection_has_stable_supported_paths() -> None:
    projection = read_and_project_airflow(VAL)
    assert projection.profile == "strict_contam_3_4_airflow_v1"
    assert len(projection.components) == 3
    assert len(projection.paths) == 4
    assert projection.diagnostics == ()
    assert {path.from_endpoint.category for path in projection.paths} == {"outdoor", "zone"}
    assert all(path.capability == "inspect" for path in projection.paths)
    assert all(path.flow_element_id for path in projection.paths)


def test_control_and_duct_fixture_is_readonly_instead_of_simplified() -> None:
    projection = read_and_project_airflow(INFO)
    assert len(projection.paths) == 18
    assert "unsupported_control_path" in projection.diagnostics
    assert any(path.capability == "opaque" for path in projection.paths)
    result = classify_project(INFO)
    assert result.status == CompatibilityStatus.SUPPORTED_READONLY
    assert result.baseline_sha256
    assert result.safe_filename == INFO.name
    assert str(INFO.parent) not in str(result.to_dict())


def test_nist_cfd_parameterization_is_explicitly_opaque() -> None:
    projection = read_and_project_airflow(NIST)
    assert "unsupported_parameterization" in projection.diagnostics
    assert all(path.rejection_code == "unsupported_parameterization" for path in projection.paths)


def test_schedule_requires_full_day_and_hash_bound_cursor() -> None:
    baseline = "a" * 64
    schedule = make_day_schedule(
        baseline,
        1,
        "Office",
        (TimePoint(0, 0.0), TimePoint(720, 1.0), TimePoint(1440, 0.0)),
        unit="1",
    )
    page = page_day_schedule(schedule, limit=2)
    assert len(page.points) == 2
    assert page.next_cursor
    assert len(page_day_schedule(schedule, cursor=page.next_cursor).points) == 1
    with pytest.raises(ScheduleError, match="游标"):
        page_day_schedule(schedule, cursor="wrong:2")
    with pytest.raises(ScheduleError) as error:
        make_day_schedule(baseline, 2, "Bad", (TimePoint(1, 0.0), TimePoint(1440, 0.0)))
    assert error.value.code == "coverage_incomplete"


def test_companion_binding_is_explicit_and_fail_closed(tmp_path: Path) -> None:
    source = tmp_path / "weather.ctm"
    source.write_bytes(b"weather")
    binding = bind_companions(tmp_path, (CompanionDeclaration("weather.ctm"),))
    assert binding[0].relative_name == "weather.ctm"
    assert len(binding[0].sha256) == 64
    with pytest.raises(CompanionError) as error:
        bind_companions(tmp_path, (CompanionDeclaration("../weather.ctm"),))
    assert error.value.code == "path_escape"
    with pytest.raises(CompanionError) as error:
        bind_companions(tmp_path, (CompanionDeclaration("WEATHER.CTM"), CompanionDeclaration("weather.ctm")))
    assert error.value.code == "case_collision"


def test_domain_audit_keeps_write_gate_passed() -> None:
    audit = audit_domain(VAL)
    assert audit.baseline_sha256
    assert audit.passed
    assert any(item.check_id == "write_gate" and item.status == "passed" for item in audit.checks)


def test_invalid_network_endpoint_rejects_whole_path(tmp_path: Path) -> None:
    text = VAL.read_text(encoding="ascii")
    text = text.replace("  -1   1   3", "  -2   1   3", 1)
    path = tmp_path / "invalid.prj"
    path.write_text(text, encoding="ascii")
    with pytest.raises(NetworkProjectionError) as error:
        read_and_project_airflow(path)
    assert error.value.code == "unsupported_endpoint"


def test_revision_store_commit_last_and_scenario_lineage(tmp_path: Path) -> None:
    source = tmp_path / "revision.prj"
    source.write_bytes(b"draft bytes")
    store = RevisionStore(tmp_path / "owned")
    record = store.commit_copy(source, baseline_sha256="b" * 64, parent_revision_id=None, revision_number=1, patch_type="replace_zone_volume")
    assert store.load(record.revision_id) == record
    catalog = ScenarioCatalog()
    baseline = catalog.create("b" * 64, "baseline", purpose="base", assumptions=(), variables=(), revision_id=record.revision_id)
    child = catalog.create("b" * 64, "variant", purpose="study", assumptions=("steady",), variables=(("volume_m3", "650"),), revision_id=record.revision_id, parent_scenario_id=baseline.scenario_id)
    assert child.parent_scenario_id == baseline.scenario_id
    with pytest.raises(RevisionError, match="跨基线"):
        catalog.create("c" * 64, "foreign", purpose="bad", assumptions=(), variables=(), revision_id=record.revision_id, parent_scenario_id=baseline.scenario_id)


def test_approved_zone_patch_creates_reread_verified_revision(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    source.write_bytes(VAL.read_bytes())
    patch = plan_zone_volume_patch(source, 1, "350")
    store = RevisionStore(tmp_path / "owned")
    record = store.commit_zone_volume_patch(source, patch, revision_number=1, parent_revision_id=None)
    assert record.patch_type == "replace_zone_volume"
    assert store.load(record.revision_id).revision_sha256 == record.revision_sha256
