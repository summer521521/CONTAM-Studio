from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from contam_studio_core.inspect_prj import (
    InvalidProjectExtensionError,
    ProjectLoadError,
    SourceNotFoundError,
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
    assert official_inspection.read_only is True
    assert official_inspection.contamxpy_version == "0.0.9"
    assert official_inspection.project.contamx_version == "3.4.1.7-64bit"


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
