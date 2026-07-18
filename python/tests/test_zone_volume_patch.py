from __future__ import annotations

import ast
import hashlib
import os
from dataclasses import replace
from pathlib import Path

import pytest

import contam_studio_core.zone_volume_patch as patch_module
from contam_studio_core.inspect_prj import inspect_prj
from contam_studio_core.prj_zone_models import ReaderDiagnostic
from contam_studio_core.prj_zone_reader import PrjZoneReaderError, read_simple_zones
from contam_studio_core.zone_volume_patch import (
    PATCH_FIELD,
    PATCH_TYPE,
    VOLUME_TOKEN_INDEX,
    ZoneVolumePatchError,
    apply_zone_volume_patch_to_copy,
    plan_zone_volume_patch,
    render_zone_volume_patch_diff,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTAMXPY_FIXTURES = REPO_ROOT / "fixtures" / "contam" / "official-contamxpy"
NIST_FIXTURES = REPO_ROOT / "fixtures" / "contam" / "official-nist-tutorials"
PRIMARY_FIXTURE = CONTAMXPY_FIXTURES / "test_GetPrjInfo.prj"

OFFICIAL_CASES = (
    pytest.param(PRIMARY_FIXTURE, 1, "650.0", 600.0, 650.0, id="get-prj-info"),
    pytest.param(
        CONTAMXPY_FIXTURES / "valThreeZonesWthCtm-UseApi.prj",
        1,
        "325",
        300.0,
        325.0,
        id="three-zones",
    ),
    pytest.param(
        NIST_FIXTURES / "demo1c.prj",
        1,
        "95.5",
        90.0,
        95.5,
        id="demo1c",
    ),
)

SIMPLE_RECORD = "1 3 0 0 0 1 0.000 600 293.15 0 Zone -1 0 2 0 0 0 0 0"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _minimal_project(
    *,
    record: str = SIMPLE_RECORD,
    eol: str = "\n",
    inline_comment: str = "",
) -> bytes:
    lines = [
        "ContamW 3.4.0.4 0",
        "minimal patch test",
        "1 ! zones:",
        "! strict layout gate",
        record + inline_comment,
        "-999",
        "unparsed content remains byte-for-byte",
    ]
    return (eol.join(lines) + eol).encode("ascii")


def _write_source(tmp_path: Path, **kwargs) -> Path:
    source = tmp_path / "source.prj"
    source.write_bytes(_minimal_project(**kwargs))
    return source


def _assert_patch_error(code: str, function, *args) -> ZoneVolumePatchError:
    with pytest.raises(ZoneVolumePatchError) as captured:
        function(*args)
    assert captured.value.code == code
    return captured.value


def _single_replacement_expected(source: bytes, patch) -> bytes:
    return (
        source[: patch.target.byte_start]
        + patch.replacement.new_token.encode("ascii")
        + source[patch.target.byte_end :]
    )


def test_plan_binds_snapshot_target_and_exact_volume_span() -> None:
    patch = plan_zone_volume_patch(PRIMARY_FIXTURE, 1, "650.0")
    source = PRIMARY_FIXTURE.read_bytes()

    assert patch.schema_version == "1.0"
    assert patch.patch_type == PATCH_TYPE
    assert patch.status == "planned"
    assert patch.source_sha256 == _sha256(PRIMARY_FIXTURE)
    assert patch.source_size_bytes == len(source)
    assert patch.preconditions.source_sha256 == patch.source_sha256
    assert patch.preconditions.source_size_bytes == patch.source_size_bytes
    assert patch.target.contam_number == 1
    assert patch.target.zone_name == "One"
    assert patch.target.source_line_number == 243
    assert patch.target.field == PATCH_FIELD
    assert patch.target.token_index == VOLUME_TOKEN_INDEX
    assert source[patch.target.byte_start : patch.target.byte_end] == b"600"
    assert patch.preconditions.old_token == "600"
    assert patch.preconditions.old_value == 600.0
    assert patch.replacement.new_token == "650.0"


def test_diff_contains_only_headers_and_target_record() -> None:
    patch = plan_zone_volume_patch(PRIMARY_FIXTURE, 1, "650.0")
    diff = render_zone_volume_patch_diff(patch)

    assert diff.splitlines() == [
        "--- test_GetPrjInfo.prj",
        "+++ proposed-copy.prj",
        "@@ Zone 1, source line 243, field volume_m3 @@",
        f"-{patch.preview.old_line}",
        f"+{patch.preview.new_line}",
    ]
    assert "zones:" not in diff
    assert "-999" not in diff


@pytest.mark.parametrize(
    ("source", "zone_number", "new_token", "old_value", "new_value"), OFFICIAL_CASES
)
def test_three_official_fixtures_complete_copy_only_round_trip(
    tmp_path: Path,
    source: Path,
    zone_number: int,
    new_token: str,
    old_value: float,
    new_value: float,
) -> None:
    source_hash = _sha256(source)
    source_size = source.stat().st_size
    source_names = sorted(item.name for item in source.parent.iterdir())
    source_document = read_simple_zones(source)
    patch = plan_zone_volume_patch(source, zone_number, new_token)
    output = tmp_path / f"{source.stem}-copy.prj"

    result = apply_zone_volume_patch_to_copy(source, patch, output)
    output_document = read_simple_zones(output)

    assert result.status == "applied"
    assert result.source_unchanged is True
    assert result.old_value == old_value
    assert result.new_value == new_value
    assert result.generated_artifacts == ()
    assert _sha256(source) == source_hash
    assert source.stat().st_size == source_size
    assert sorted(item.name for item in source.parent.iterdir()) == source_names
    assert output.read_bytes() == _single_replacement_expected(source.read_bytes(), patch)
    assert len(output_document.zones) == len(source_document.zones)
    target = next(zone for zone in output_document.zones if zone.contam_number == zone_number)
    assert target.volume_m3 == new_value
    assert not list(tmp_path.glob("*.sim"))
    assert not list(tmp_path.glob("*.log"))
    assert not list(tmp_path.glob("*.xlog"))


@pytest.mark.parametrize("eol", ["\n", "\r\n"], ids=["lf", "crlf"])
def test_line_endings_and_inline_comment_are_preserved(tmp_path: Path, eol: str) -> None:
    source = _write_source(tmp_path, eol=eol, inline_comment="   ! keep this comment")
    patch = plan_zone_volume_patch(source, 1, "6.5e2")
    output = tmp_path / "copy.prj"

    apply_zone_volume_patch_to_copy(source, patch, output)

    expected = _single_replacement_expected(source.read_bytes(), patch)
    assert output.read_bytes() == expected
    assert output.read_bytes().count(eol.encode("ascii")) == source.read_bytes().count(
        eol.encode("ascii")
    )
    assert b"   ! keep this comment" in output.read_bytes()


def test_target_other_fields_and_other_zones_are_unchanged(tmp_path: Path) -> None:
    source = PRIMARY_FIXTURE
    before = read_simple_zones(source)
    patch = plan_zone_volume_patch(source, 1, "650")
    output = tmp_path / "copy.prj"
    apply_zone_volume_patch_to_copy(source, patch, output)
    after = read_simple_zones(output)

    assert before.zones[1:] == after.zones[1:]
    assert replace(before.zones[0], volume_m3=650.0) == after.zones[0]


def test_modified_copy_matches_isolated_contamxpy(tmp_path: Path, monkeypatch) -> None:
    output = tmp_path / "official-api-check.prj"
    patch = plan_zone_volume_patch(PRIMARY_FIXTURE, 1, "650.0")
    apply_zone_volume_patch_to_copy(PRIMARY_FIXTURE, patch, output)
    inspect_root = tmp_path / "contamxpy-isolation"
    monkeypatch.setenv("CONTAM_STUDIO_TEMP_ROOT", str(inspect_root))

    inspection = inspect_prj(output)

    assert inspection.source_unchanged is True
    assert inspection.first_zone.volume_m3 == pytest.approx(650.0)
    assert _sha256(output) == patch_module._sha256(output.read_bytes())
    assert not list(tmp_path.glob("*.sim"))
    assert not list(tmp_path.glob("*.log"))
    assert not list(tmp_path.glob("*.xlog"))


def test_missing_source_and_zone_are_rejected(tmp_path: Path) -> None:
    _assert_patch_error(
        "source_not_found",
        plan_zone_volume_patch,
        tmp_path / "missing.prj",
        1,
        "650",
    )
    _assert_patch_error("zone_not_found", plan_zone_volume_patch, PRIMARY_FIXTURE, 999, "650")


@pytest.mark.parametrize(
    "token",
    ["0", "-1", "+1", "1.0", ".5", "1.", "1e-5", "1.0E+03"],
)
def test_supported_numeric_literals_are_preserved_in_plan(token: str) -> None:
    patch = plan_zone_volume_patch(PRIMARY_FIXTURE, 1, token)
    assert patch.replacement.new_token == token


@pytest.mark.parametrize(
    "token",
    ["", "+", "1_000", "NaN", "Infinity", "0x1p2", "650x", "非ASCII"],
)
def test_invalid_new_volume_tokens_are_rejected(token: str) -> None:
    _assert_patch_error(
        "patch_new_value_invalid", plan_zone_volume_patch, PRIMARY_FIXTURE, 1, token
    )


@pytest.mark.parametrize("token", ["600", "600.0", "6e2", "+600.000"])
def test_numerically_unchanged_values_are_rejected(token: str) -> None:
    _assert_patch_error("patch_no_change", plan_zone_volume_patch, PRIMARY_FIXTURE, 1, token)


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        (
            lambda patch: replace(
                patch,
                source_sha256="0" * 64,
                preconditions=replace(patch.preconditions, source_sha256="0" * 64),
            ),
            "patch_precondition_failed",
        ),
        (
            lambda patch: replace(
                patch,
                source_size_bytes=patch.source_size_bytes + 1,
                preconditions=replace(
                    patch.preconditions,
                    source_size_bytes=patch.source_size_bytes + 1,
                ),
            ),
            "patch_precondition_failed",
        ),
        (
            lambda patch: replace(
                patch,
                preconditions=replace(patch.preconditions, old_token="601"),
                preview=replace(patch.preview, old_token="601"),
            ),
            "patch_precondition_failed",
        ),
        (
            lambda patch: replace(
                patch,
                target=replace(patch.target, byte_start=patch.target.byte_start - 1),
            ),
            "patch_precondition_failed",
        ),
        (
            lambda patch: replace(
                patch,
                target=replace(patch.target, byte_end=patch.target.byte_end + 1),
            ),
            "patch_precondition_failed",
        ),
        (
            lambda patch: replace(
                patch,
                target=replace(
                    patch.target,
                    source_line_number=patch.target.source_line_number + 1,
                ),
                preconditions=replace(
                    patch.preconditions,
                    source_line_number=patch.preconditions.source_line_number + 1,
                ),
                preview=replace(
                    patch.preview,
                    source_line_number=patch.preview.source_line_number + 1,
                ),
            ),
            "patch_precondition_failed",
        ),
        (
            lambda patch: replace(
                patch,
                target=replace(patch.target, contam_number=2),
                preconditions=replace(patch.preconditions, contam_number=2),
            ),
            "patch_precondition_failed",
        ),
        (
            lambda patch: replace(
                patch,
                reader_mode="other",
                preconditions=replace(patch.preconditions, reader_mode="other"),
            ),
            "patch_precondition_failed",
        ),
        (
            lambda patch: replace(
                patch,
                header_version="3.4.0.8",
                preconditions=replace(patch.preconditions, header_version="3.4.0.8"),
            ),
            "patch_precondition_failed",
        ),
        (
            lambda patch: replace(
                patch,
                target=replace(patch.target, field="name"),
            ),
            "patch_field_unsupported",
        ),
    ],
    ids=[
        "hash",
        "size",
        "old-token",
        "byte-start",
        "byte-end",
        "line-number",
        "contam-number",
        "reader-mode",
        "header-version",
        "unsupported-field",
    ],
)
def test_tampered_patch_preconditions_are_rejected_without_output(
    tmp_path: Path,
    mutation,
    expected_code: str,
) -> None:
    patch = mutation(plan_zone_volume_patch(PRIMARY_FIXTURE, 1, "650"))
    output = tmp_path / "copy.prj"

    _assert_patch_error(
        expected_code,
        apply_zone_volume_patch_to_copy,
        PRIMARY_FIXTURE,
        patch,
        output,
    )
    assert not output.exists()


def test_changed_source_snapshot_rejects_old_patch(tmp_path: Path) -> None:
    source = _write_source(tmp_path)
    patch = plan_zone_volume_patch(source, 1, "650")
    source.write_bytes(source.read_bytes().replace(b"600", b"601", 1))
    output = tmp_path / "copy.prj"

    _assert_patch_error(
        "patch_precondition_failed",
        apply_zone_volume_patch_to_copy,
        source,
        patch,
        output,
    )
    assert not output.exists()


def test_ambiguous_zone_number_is_structured_if_reader_contract_is_violated(
    monkeypatch,
) -> None:
    document = read_simple_zones(PRIMARY_FIXTURE)
    duplicated = replace(
        document,
        declared_zone_count=len(document.zones) + 1,
        zones=(document.zones[0], *document.zones),
    )
    monkeypatch.setattr(patch_module, "read_simple_zones", lambda _path: duplicated)

    _assert_patch_error(
        "zone_number_ambiguous",
        plan_zone_volume_patch,
        PRIMARY_FIXTURE,
        1,
        "650",
    )


def test_plan_rejects_snapshot_change_after_strict_read(monkeypatch) -> None:
    real_snapshot = patch_module._read_snapshot

    def changed_snapshot(source: Path):
        snapshot = real_snapshot(source)
        return replace(snapshot, sha256="0" * 64)

    monkeypatch.setattr(patch_module, "_read_snapshot", changed_snapshot)
    _assert_patch_error(
        "source_changed_during_read",
        plan_zone_volume_patch,
        PRIMARY_FIXTURE,
        1,
        "650",
    )


def test_unlocatable_target_is_structured(monkeypatch) -> None:
    def fail_location(_data: bytes, line_number: int):
        patch_module._fail(
            "patch_target_not_locatable",
            "simulated",
            line_number,
        )

    monkeypatch.setattr(patch_module, "_locate_zone_line", fail_location)
    _assert_patch_error(
        "patch_target_not_locatable",
        plan_zone_volume_patch,
        PRIMARY_FIXTURE,
        1,
        "650",
    )


def test_output_path_guards_reject_source_existing_extension_and_parent(tmp_path: Path) -> None:
    source = _write_source(tmp_path)
    patch = plan_zone_volume_patch(source, 1, "650")
    existing = tmp_path / "existing.prj"
    existing.write_bytes(b"existing")

    _assert_patch_error(
        "patch_output_invalid", apply_zone_volume_patch_to_copy, source, patch, source
    )
    _assert_patch_error(
        "patch_output_invalid",
        apply_zone_volume_patch_to_copy,
        source,
        patch,
        source.parent / "." / source.name,
    )
    _assert_patch_error(
        "patch_output_exists", apply_zone_volume_patch_to_copy, source, patch, existing
    )
    _assert_patch_error(
        "patch_output_invalid",
        apply_zone_volume_patch_to_copy,
        source,
        patch,
        tmp_path / "copy.txt",
    )
    _assert_patch_error(
        "patch_output_invalid",
        apply_zone_volume_patch_to_copy,
        source,
        patch,
        tmp_path / "missing-parent" / "copy.prj",
    )
    assert existing.read_bytes() == b"existing"


def test_write_failure_leaves_no_output_or_temporary_file(tmp_path: Path, monkeypatch) -> None:
    source = _write_source(tmp_path)
    patch = plan_zone_volume_patch(source, 1, "650")
    output = tmp_path / "copy.prj"

    def fail_link(_source, _destination) -> None:
        raise PermissionError("simulated")

    monkeypatch.setattr(os, "link", fail_link)
    _assert_patch_error(
        "patch_application_failed",
        apply_zone_volume_patch_to_copy,
        source,
        patch,
        output,
    )
    assert not output.exists()
    assert not list(tmp_path.glob(".contam-studio-zone-patch-*.tmp"))


def test_post_write_verification_failure_removes_output(tmp_path: Path, monkeypatch) -> None:
    source = _write_source(tmp_path)
    patch = plan_zone_volume_patch(source, 1, "650")
    output = tmp_path / "copy.prj"
    real_reader = patch_module.read_simple_zones

    def fail_for_output(path: Path):
        if Path(path).resolve() == output.resolve():
            raise PrjZoneReaderError(
                ReaderDiagnostic(code="unsupported_zone_layout", message="simulated")
            )
        return real_reader(path)

    monkeypatch.setattr(patch_module, "read_simple_zones", fail_for_output)
    _assert_patch_error(
        "patch_verification_failed",
        apply_zone_volume_patch_to_copy,
        source,
        patch,
        output,
    )
    assert not output.exists()


def test_non_ascii_and_complex_zone_records_are_rejected(tmp_path: Path) -> None:
    non_ascii = tmp_path / "non-ascii.prj"
    non_ascii.write_bytes(_minimal_project() + b"\xff")
    _assert_patch_error("non_ascii_prj", plan_zone_volume_patch, non_ascii, 1, "650")

    tokens = SIMPLE_RECORD.split()
    tokens[16] = "1"
    complex_source = tmp_path / "complex.prj"
    complex_source.write_bytes(_minimal_project(record=" ".join(tokens)))
    _assert_patch_error(
        "unsupported_zone_conditional_fields",
        plan_zone_volume_patch,
        complex_source,
        1,
        "650",
    )


def test_patch_module_has_no_execution_or_full_rewrite_dependencies() -> None:
    source_path = Path(patch_module.__file__)
    source = source_path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])

    assert imported.isdisjoint({"contamxpy", "subprocess", "inspect_prj", "react", "tauri", "rust"})
    assert "os.replace" not in source
    assert "overwrite" not in source.lower()
    assert "ContamX" not in source
    assert "_parse_zone_line" in source
    assert len(set(patch_module.PATCH_ERROR_EXIT_CODES.values())) == len(
        patch_module.PATCH_ERROR_EXIT_CODES
    )


def test_official_fixture_directories_remain_unchanged_after_failures(tmp_path: Path) -> None:
    directories = (CONTAMXPY_FIXTURES, NIST_FIXTURES)
    before = {
        directory: {item.name: _sha256(item) for item in directory.iterdir() if item.is_file()}
        for directory in directories
    }

    patch = plan_zone_volume_patch(PRIMARY_FIXTURE, 1, "650")
    existing = tmp_path / "existing.prj"
    existing.write_bytes(b"keep")
    _assert_patch_error(
        "patch_output_exists",
        apply_zone_volume_patch_to_copy,
        PRIMARY_FIXTURE,
        patch,
        existing,
    )

    after = {
        directory: {item.name: _sha256(item) for item in directory.iterdir() if item.is_file()}
        for directory in directories
    }
    assert after == before
