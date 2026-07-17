from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

import contam_studio_core.inspect_prj as inspect_module
from contam_studio_core.inspect_prj import (
    EXECUTION_MODE,
    InvalidProjectExtensionError,
    ProjectLoadError,
    SourceCopyMismatchError,
    SourceNotFoundError,
    _copy_verified_source,
    inspect_prj,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / "fixtures" / "contam" / "official-contamxpy"
OFFICIAL_PRJ = FIXTURE_DIR / "test_GetPrjInfo.prj"
EXPECTED_SHA256 = "ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture(scope="session")
def official_inspection():
    return inspect_prj(OFFICIAL_PRJ)


def test_official_prj_loads(official_inspection) -> None:
    assert official_inspection.source_unchanged is True
    assert official_inspection.execution_mode == EXECUTION_MODE
    assert official_inspection.contamxpy_version == "0.0.9"
    assert official_inspection.project.contamx_version == "3.4.1.7-64bit"


def test_generated_artifacts_are_reported(official_inspection) -> None:
    expected = {
        "inspection-source.ach",
        "inspection-source.cex",
        "inspection-source.csm",
        "inspection-source.log",
        "inspection-source.rst",
        "inspection-source.sim",
        "inspection-source.xlog",
        "inspection-source_sarin.cex",
    }
    assert expected.issubset(set(official_inspection.generated_artifacts))


def test_zone_count_and_first_zone_are_real(official_inspection) -> None:
    assert official_inspection.zone_count == 7
    assert official_inspection.first_zone.number == 1
    assert official_inspection.first_zone.name == "One"
    assert official_inspection.first_zone.volume_m3 == pytest.approx(600.0)
    assert official_inspection.first_zone.level_number == 1
    assert official_inspection.first_zone.level_name == "<1>"


def test_inspection_is_json_serializable(official_inspection) -> None:
    encoded = json.dumps(official_inspection.to_dict(), ensure_ascii=False)
    decoded = json.loads(encoded)
    assert decoded["schema_version"] == "1.0"
    assert decoded["first_zone"]["name"] == "One"


def test_source_hash_and_directory_are_unchanged() -> None:
    files_before = sorted(path.name for path in FIXTURE_DIR.iterdir())
    hashes_before = {path.name: _sha256(path) for path in FIXTURE_DIR.iterdir() if path.is_file()}

    inspection = inspect_prj(OFFICIAL_PRJ)

    files_after = sorted(path.name for path in FIXTURE_DIR.iterdir())
    hashes_after = {path.name: _sha256(path) for path in FIXTURE_DIR.iterdir() if path.is_file()}
    assert inspection.source_sha256 == EXPECTED_SHA256
    assert _sha256(OFFICIAL_PRJ) == EXPECTED_SHA256
    assert files_after == files_before
    assert hashes_after == hashes_before


def test_missing_file_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(SourceNotFoundError) as captured:
        inspect_prj(tmp_path / "missing.prj")
    assert captured.value.exit_code == 2


def test_non_prj_file_is_rejected(tmp_path: Path) -> None:
    text_file = tmp_path / "not-a-project.txt"
    text_file.write_text("not a project", encoding="utf-8")
    with pytest.raises(InvalidProjectExtensionError) as captured:
        inspect_prj(text_file)
    assert captured.value.exit_code == 3


def test_corrupt_prj_returns_controlled_error(tmp_path: Path) -> None:
    broken = tmp_path / "broken.prj"
    broken.write_bytes(b"not a CONTAM project")
    with pytest.raises(ProjectLoadError) as captured:
        inspect_prj(broken)
    assert captured.value.exit_code == 4
    assert "contamxpy" in str(captured.value)


def test_verified_copy_hash_matches_source(tmp_path: Path) -> None:
    source = tmp_path / "source.prj"
    destination = tmp_path / "copy.prj"
    source.write_bytes(b"trusted source bytes")
    expected = _sha256(source)

    _copy_verified_source(source, destination, expected)

    assert _sha256(destination) == expected


def test_copy_hash_mismatch_stops_before_worker(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "source.prj"
    source.write_bytes(b"trusted source bytes")
    worker_called = False

    def corrupt_copy(_source: Path, destination: Path) -> None:
        Path(destination).write_bytes(b"different copied bytes")

    def record_worker_call(_source: Path, _work_dir: Path):
        nonlocal worker_called
        worker_called = True
        raise AssertionError("worker must not run for a mismatched copy")

    monkeypatch.setattr(inspect_module.shutil, "copyfile", corrupt_copy)
    monkeypatch.setattr(inspect_module, "_run_worker", record_worker_call)

    with pytest.raises(SourceCopyMismatchError) as captured:
        inspect_prj(source)

    assert captured.value.code == "source_copy_mismatch"
    assert worker_called is False
