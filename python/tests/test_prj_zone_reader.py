from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path

import pytest

import contam_studio_core.prj_zone_reader as reader_module
from contam_studio_core.inspect_prj import inspect_prj
from contam_studio_core.prj_zone_reader import (
    ERROR_EXIT_CODES,
    READER_MODE,
    PrjZoneReaderError,
    read_simple_zones,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTAMXPY_FIXTURES = REPO_ROOT / "fixtures" / "contam" / "official-contamxpy"
NIST_FIXTURES = REPO_ROOT / "fixtures" / "contam" / "official-nist-tutorials"

OFFICIAL_CASES = (
    pytest.param(
        CONTAMXPY_FIXTURES / "test_GetPrjInfo.prj",
        "ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e",
        "3.4.0.4",
        3,
        7,
        (1, "One", 3, 1, 0.0, 600.0),
        id="contamxpy-get-prj-info",
    ),
    pytest.param(
        CONTAMXPY_FIXTURES / "valThreeZonesWthCtm-UseApi.prj",
        "1cafb2f0fef511f19ef88358238a1c1175c593187691ff7545db982f5e6e75ed",
        "3.4.0.4",
        0,
        3,
        (1, "one", 3, 1, 0.0, 300.0),
        id="contamxpy-three-zones",
    ),
    pytest.param(
        NIST_FIXTURES / "demo1c.prj",
        "1e2623d8904c0d37f0eb207099782ad2c1895dba4032e0511b9c8a188748f406",
        "3.4.0.0",
        0,
        7,
        (1, "Attic", 19, 3, 0.0, 90.0),
        id="nist-tutorial-demo1c",
    ),
)

SIMPLE_RECORD = "1 3 0 0 0 1 0.000 600 293.15 0 Zone -1 0 2 0 0 0 0 0"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _project(
    records: list[str] | None = None,
    *,
    version: str = "3.4.0.4",
    variant: str = "0",
    count_token: str | None = None,
    include_marker: bool = True,
    include_header: bool = True,
    include_terminator: bool = True,
    eol: str = "\n",
) -> str:
    records = [SIMPLE_RECORD] if records is None else records
    lines = [f"ContamW {version} {variant}", "minimal strict reader test"]
    if include_marker:
        count = str(len(records)) if count_token is None else count_token
        lines.append(f"{count} ! zones:")
    if include_header:
        lines.append("! strict layout gate; labels are not parsed")
    lines.extend(records)
    if include_terminator:
        lines.append("-999")
    lines.append("after zone section")
    return eol.join(lines) + eol


def _write_project(tmp_path: Path, text: str, name: str = "sample.prj") -> Path:
    path = tmp_path / name
    path.write_bytes(text.encode("ascii"))
    return path


def _assert_error(path: Path, code: str) -> PrjZoneReaderError:
    with pytest.raises(PrjZoneReaderError) as captured:
        read_simple_zones(path)
    assert captured.value.code == code
    assert captured.value.exit_code == ERROR_EXIT_CODES[code]
    return captured.value


@pytest.mark.parametrize(
    ("path", "expected_hash", "version", "variant", "zone_count", "first"),
    OFFICIAL_CASES,
)
def test_reads_official_simple_zone_documents(
    path: Path,
    expected_hash: str,
    version: str,
    variant: int,
    zone_count: int,
    first: tuple[int, str, int, int, float, float],
) -> None:
    document = read_simple_zones(path)

    assert document.reader_mode == READER_MODE
    assert document.header_version == version
    assert document.header_variant == variant
    assert document.declared_zone_count == zone_count
    assert len(document.zones) == zone_count
    assert document.source_sha256 == expected_hash
    assert document.source_size_bytes == path.stat().st_size
    assert document.source_unchanged is True
    assert document.first_zone is not None
    assert (
        document.first_zone.contam_number,
        document.first_zone.name,
        document.first_zone.flags,
        document.first_zone.level_number,
        document.first_zone.relative_height,
        document.first_zone.volume_m3,
    ) == first


def test_output_is_json_serializable() -> None:
    document = read_simple_zones(CONTAMXPY_FIXTURES / "test_GetPrjInfo.prj")
    payload = json.loads(json.dumps(document.to_dict(), ensure_ascii=False))

    assert payload["reader_mode"] == READER_MODE
    assert len(payload["zones"]) == 7
    assert payload["first_zone"]["name"] == "One"


def test_official_sources_and_directories_are_unchanged() -> None:
    directories = (CONTAMXPY_FIXTURES, NIST_FIXTURES)
    names_before = {directory: sorted(path.name for path in directory.iterdir()) for directory in directories}
    hashes_before = {
        directory: {path.name: _sha256(path) for path in directory.iterdir() if path.is_file()}
        for directory in directories
    }

    for case in OFFICIAL_CASES:
        read_simple_zones(case.values[0])

    assert {
        directory: sorted(path.name for path in directory.iterdir()) for directory in directories
    } == names_before
    assert {
        directory: {path.name: _sha256(path) for path in directory.iterdir() if path.is_file()}
        for directory in directories
    } == hashes_before


@pytest.mark.parametrize("eol", ["\n", "\r\n"], ids=["lf", "crlf"])
def test_supported_line_endings(tmp_path: Path, eol: str) -> None:
    document = read_simple_zones(_write_project(tmp_path, _project(eol=eol)))
    assert document.declared_zone_count == 1


def test_zero_zone_section_is_supported(tmp_path: Path) -> None:
    document = read_simple_zones(_write_project(tmp_path, _project(records=[])))
    assert document.zones == ()
    assert document.first_zone is None


def test_missing_source_is_rejected(tmp_path: Path) -> None:
    _assert_error(tmp_path / "missing.prj", "source_not_found")


def test_non_ascii_source_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "non-ascii.prj"
    path.write_bytes(_project().encode("ascii") + b"\xff")
    error = _assert_error(path, "non_ascii_prj")
    assert error.diagnostic.source_line_number is not None


@pytest.mark.parametrize(
    ("version", "variant"),
    [("3.4.0.8", "0"), ("3.3.0.0", "0"), ("3.4.0.4", "not-an-integer")],
)
def test_unsupported_headers_are_rejected(tmp_path: Path, version: str, variant: str) -> None:
    path = _write_project(tmp_path, _project(version=version, variant=variant))
    _assert_error(path, "unsupported_prj_version")


def test_missing_zone_section_is_rejected(tmp_path: Path) -> None:
    path = _write_project(
        tmp_path,
        _project(include_marker=False, include_header=False, records=[]),
    )
    _assert_error(path, "zone_section_not_found")


def test_zone_marker_allows_ordinary_spaces(tmp_path: Path) -> None:
    text = _project().replace("1 ! zones:", "   1    !   zones:   ")
    document = read_simple_zones(_write_project(tmp_path, text))
    assert document.declared_zone_count == 1


@pytest.mark.parametrize("marker", ["1 ! Zones:", "1 ! zones"])
def test_zone_marker_requires_lowercase_and_colon(tmp_path: Path, marker: str) -> None:
    text = _project().replace("1 ! zones:", marker)
    _assert_error(_write_project(tmp_path, text), "zone_section_not_found")


def test_multiple_zone_sections_are_rejected(tmp_path: Path) -> None:
    text = _project() + "0 ! zones:\n! fields\n-999\n"
    _assert_error(_write_project(tmp_path, text), "multiple_zone_sections")


@pytest.mark.parametrize("count_token", ["many", "-1"], ids=["not-integer", "negative"])
def test_invalid_zone_count_is_rejected(tmp_path: Path, count_token: str) -> None:
    _assert_error(
        _write_project(tmp_path, _project(count_token=count_token)),
        "invalid_zone_count",
    )


def test_missing_zone_header_is_rejected(tmp_path: Path) -> None:
    path = _write_project(tmp_path, _project(include_header=False))
    _assert_error(path, "zone_header_missing")


def test_fewer_records_than_declared_are_rejected(tmp_path: Path) -> None:
    path = _write_project(tmp_path, _project(count_token="2"))
    _assert_error(path, "zone_count_mismatch")


def test_more_records_than_declared_are_rejected(tmp_path: Path) -> None:
    second = SIMPLE_RECORD.replace("1 3", "2 3", 1).replace(" Zone ", " Zone2 ")
    path = _write_project(tmp_path, _project([SIMPLE_RECORD, second], count_token="1"))
    _assert_error(path, "zone_count_mismatch")


def test_missing_terminator_is_rejected(tmp_path: Path) -> None:
    path = _write_project(tmp_path, _project(include_terminator=False))
    _assert_error(path, "zone_terminator_missing")


@pytest.mark.parametrize(
    "record",
    [
        " ".join(SIMPLE_RECORD.split()[:-1]),
        SIMPLE_RECORD + " 0",
        SIMPLE_RECORD.replace("1 3", "1\t3", 1),
    ],
    ids=["too-few-fields", "too-many-fields", "tab-separated"],
)
def test_wrong_field_count_is_rejected(tmp_path: Path, record: str) -> None:
    path = _write_project(tmp_path, _project([record]))
    _assert_error(path, "unsupported_zone_layout")


@pytest.mark.parametrize(
    "record",
    [
        SIMPLE_RECORD.replace("1 3 0", "1 invalid 0", 1),
        SIMPLE_RECORD.replace("0.000 600", "0.000 infinity", 1),
        SIMPLE_RECORD.replace("1 3", "0 3", 1),
    ],
    ids=["invalid-integer", "non-finite-float", "non-positive-number"],
)
def test_invalid_fields_are_rejected(tmp_path: Path, record: str) -> None:
    path = _write_project(tmp_path, _project([record]))
    _assert_error(path, "invalid_zone_field")


def test_duplicate_zone_numbers_are_rejected(tmp_path: Path) -> None:
    duplicate = SIMPLE_RECORD.replace(" Zone ", " Other ")
    path = _write_project(tmp_path, _project([SIMPLE_RECORD, duplicate]))
    _assert_error(path, "duplicate_zone_number")


@pytest.mark.parametrize(
    "record",
    [
        SIMPLE_RECORD.replace(" Zone ", " NameLongerThan15 "),
        SIMPLE_RECORD.replace(" Zone ", " Class Room "),
    ],
    ids=["name-too-long", "name-has-space"],
)
def test_unsupported_names_are_rejected(tmp_path: Path, record: str) -> None:
    path = _write_project(tmp_path, _project([record]))
    _assert_error(path, "unsupported_zone_name")


@pytest.mark.parametrize("field_index", [16, 17, 18], ids=["cdaxis", "vf-type", "cfd"])
def test_conditional_fields_are_rejected(tmp_path: Path, field_index: int) -> None:
    tokens = SIMPLE_RECORD.split()
    tokens[field_index] = "1"
    path = _write_project(tmp_path, _project([" ".join(tokens)]))
    _assert_error(path, "unsupported_zone_conditional_fields")


@pytest.mark.parametrize("record", ["", "! comment"], ids=["blank", "comment"])
def test_blank_or_comment_record_is_rejected(tmp_path: Path, record: str) -> None:
    path = _write_project(tmp_path, _project([record]))
    _assert_error(path, "unsupported_zone_layout")


def test_source_change_during_read_is_rejected(tmp_path: Path, monkeypatch) -> None:
    path = _write_project(tmp_path, _project())
    original = path.read_bytes()
    calls = 0

    def changed_after_parse(_path: Path) -> bytes:
        nonlocal calls
        calls += 1
        return original if calls == 1 else original + b" "

    monkeypatch.setattr(reader_module, "_read_bytes", changed_after_parse)
    _assert_error(path, "source_changed_during_read")


def test_reader_has_no_execution_imports() -> None:
    source_path = Path(reader_module.__file__)
    tree = ast.parse(source_path.read_text(encoding="utf-8"))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])

    assert imported.isdisjoint({"contamxpy", "subprocess", "inspect_prj", "tempfile"})
    assert len(set(ERROR_EXIT_CODES.values())) == len(ERROR_EXIT_CODES)


@pytest.mark.parametrize(
    ("path", "expected_hash", "version", "variant", "zone_count", "first"),
    OFFICIAL_CASES,
)
def test_reader_matches_isolated_contamxpy_for_official_samples(
    path: Path,
    expected_hash: str,
    version: str,
    variant: int,
    zone_count: int,
    first: tuple[int, str, int, int, float, float],
) -> None:
    del expected_hash, version, variant, zone_count, first
    source_hash_before = _sha256(path)
    document = read_simple_zones(path)
    inspection = inspect_prj(path)

    assert inspection.source_unchanged is True
    assert inspection.source_sha256 == source_hash_before
    assert _sha256(path) == source_hash_before
    assert document.declared_zone_count == inspection.zone_count
    assert document.first_zone is not None
    assert document.first_zone.contam_number == inspection.first_zone.number
    assert document.first_zone.name == inspection.first_zone.name
    assert document.first_zone.flags == inspection.first_zone.flags
    assert document.first_zone.volume_m3 == pytest.approx(inspection.first_zone.volume_m3)
    assert document.first_zone.level_number == inspection.first_zone.level_number
