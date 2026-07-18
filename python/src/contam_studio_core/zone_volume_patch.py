from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .prj_zone_models import ZoneDocumentRecord
from .prj_zone_reader import (
    ERROR_EXIT_CODES as READER_ERROR_EXIT_CODES,
    READER_MODE,
    PrjZoneReaderError,
    _parse_zone_line,
    read_simple_zones,
)
from .strict_numeric import parse_ascii_finite_float
from .zone_patch_models import (
    PatchApplicationResult,
    PatchDiagnostic,
    PatchPreconditions,
    PatchPreview,
    PatchReplacement,
    PatchTarget,
    ZoneVolumePatch,
)

SCHEMA_VERSION = "1.0"
PATCH_TYPE = "replace_zone_volume"
PATCH_STATUS_PLANNED = "planned"
PATCH_STATUS_APPLIED = "applied"
PATCH_FIELD = "volume_m3"
VOLUME_TOKEN_INDEX = 7
_SIMULATION_SUFFIXES = frozenset({".sim", ".log", ".xlog"})

PATCH_ERROR_EXIT_CODES = {
    **READER_ERROR_EXIT_CODES,
    "zone_not_found": 17,
    "zone_number_ambiguous": 18,
    "patch_field_unsupported": 19,
    "patch_new_value_invalid": 20,
    "patch_no_change": 21,
    "patch_target_not_locatable": 22,
    "patch_precondition_failed": 23,
    "patch_output_invalid": 24,
    "patch_output_exists": 25,
    "patch_application_failed": 26,
    "patch_verification_failed": 27,
    "patch_internal_error": 28,
}


class ZoneVolumePatchError(Exception):
    def __init__(self, diagnostic: PatchDiagnostic) -> None:
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic
        self.code = diagnostic.code
        self.exit_code = PATCH_ERROR_EXIT_CODES[diagnostic.code]


@dataclass(frozen=True, slots=True)
class _SourceSnapshot:
    data: bytes
    size: int
    sha256: str


@dataclass(frozen=True, slots=True)
class _LocatedZoneLine:
    record: ZoneDocumentRecord
    line_start: int
    line_bytes: bytes
    line_ending: bytes
    tokens: tuple[str, ...]
    token_spans: tuple[tuple[int, int], ...]


def _fail(
    code: str,
    message: str,
    line_number: int | None = None,
    context: dict[str, bool | float | int | str] | None = None,
) -> None:
    raise ZoneVolumePatchError(
        PatchDiagnostic(
            code=code,
            message=message,
            source_line_number=line_number,
            context=context,
        )
    )


def _raise_reader_error(error: PrjZoneReaderError) -> None:
    diagnostic = error.diagnostic
    _fail(
        diagnostic.code,
        diagnostic.message,
        diagnostic.source_line_number,
        diagnostic.context,
    )


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read_snapshot(source: Path) -> _SourceSnapshot:
    try:
        size_before = source.stat().st_size
        data = source.read_bytes()
        size_after = source.stat().st_size
    except OSError:
        _fail("source_changed_during_read", "读取PRJ时源文件状态发生变化。")
    if size_before != size_after or len(data) != size_after:
        _fail("source_changed_during_read", "读取PRJ时源文件大小发生变化。")
    return _SourceSnapshot(data=data, size=size_after, sha256=_sha256(data))


def _physical_line(data: bytes, line_number: int) -> tuple[int, bytes, bytes]:
    if line_number <= 0:
        _fail("patch_target_not_locatable", "目标源行号无效。")
    start = 0
    current = 1
    while current < line_number:
        newline = data.find(b"\n", start)
        if newline < 0:
            _fail(
                "patch_target_not_locatable",
                "无法在源PRJ中定位目标Zone物理行。",
                line_number,
            )
        start = newline + 1
        current += 1
    newline = data.find(b"\n", start)
    if newline < 0:
        segment = data[start:]
        ending = b""
    else:
        segment = data[start : newline + 1]
        ending = b"\r\n" if segment.endswith(b"\r\n") else b"\n"
    line_bytes = segment[: len(segment) - len(ending)] if ending else segment
    return start, line_bytes, ending


def _locate_zone_line(data: bytes, line_number: int) -> _LocatedZoneLine:
    line_start, line_bytes, line_ending = _physical_line(data, line_number)
    try:
        line = line_bytes.decode("ascii", errors="strict")
    except UnicodeDecodeError:
        _fail(
            "patch_target_not_locatable",
            "目标Zone行不是严格ASCII。",
            line_number,
        )
    try:
        record = _parse_zone_line(line, line_number)
    except PrjZoneReaderError:
        _fail(
            "patch_target_not_locatable",
            "目标Zone行不再符合严格简单Zone记录。",
            line_number,
        )

    comment_at = line_bytes.find(b"!")
    data_bytes = line_bytes if comment_at < 0 else line_bytes[:comment_at]
    matches = tuple(re.finditer(rb"[^ ]+", data_bytes))
    if len(matches) != 19:
        _fail(
            "patch_target_not_locatable",
            "目标Zone行无法无歧义定位19个基础字段。",
            line_number,
            {"field_count": len(matches)},
        )
    tokens = tuple(match.group().decode("ascii") for match in matches)
    token_spans = tuple((line_start + match.start(), line_start + match.end()) for match in matches)
    return _LocatedZoneLine(
        record=record,
        line_start=line_start,
        line_bytes=line_bytes,
        line_ending=line_ending,
        tokens=tokens,
        token_spans=token_spans,
    )


def _parse_new_volume(token: str) -> tuple[float, Decimal]:
    if not isinstance(token, str) or not token:
        _fail("patch_new_value_invalid", "新体积必须是非空ASCII数字面量字符串。")
    try:
        value = parse_ascii_finite_float(token)
        decimal_value = Decimal(token)
    except (InvalidOperation, ValueError):
        _fail(
            "patch_new_value_invalid",
            "新体积不是严格读取器支持的有限ASCII十进制数字面量。",
            context={"token": token[:80]},
        )
    return value, decimal_value


def _read_document(source: Path):
    try:
        return read_simple_zones(source)
    except PrjZoneReaderError as error:
        _raise_reader_error(error)
    raise AssertionError("unreachable")


def _matching_zone(document, contam_number: int) -> ZoneDocumentRecord:
    matches = [zone for zone in document.zones if zone.contam_number == contam_number]
    if not matches:
        _fail(
            "zone_not_found",
            "严格Zone读取结果中不存在目标CONTAM编号。",
            context={"contam_number": contam_number},
        )
    if len(matches) != 1:
        _fail(
            "zone_number_ambiguous",
            "目标CONTAM编号无法唯一确定Zone。",
            context={"contam_number": contam_number, "candidate_count": len(matches)},
        )
    return matches[0]


def plan_zone_volume_patch(
    source_path: Path,
    contam_number: int,
    new_volume_token: str,
) -> ZoneVolumePatch:
    source = Path(source_path).expanduser().resolve()
    document = _read_document(source)
    if document.reader_mode != READER_MODE:
        _fail("patch_precondition_failed", "源PRJ读取模式不受当前Patch支持。")
    target_zone = _matching_zone(document, contam_number)
    new_value, new_decimal = _parse_new_volume(new_volume_token)

    snapshot = _read_snapshot(source)
    if snapshot.sha256 != document.source_sha256 or snapshot.size != document.source_size_bytes:
        _fail("source_changed_during_read", "Patch计划期间源PRJ快照发生变化。")

    located = _locate_zone_line(snapshot.data, target_zone.source_line_number)
    if located.record != target_zone:
        _fail(
            "patch_target_not_locatable",
            "目标Zone行与严格读取结果不一致。",
            target_zone.source_line_number,
        )
    old_token = located.tokens[VOLUME_TOKEN_INDEX]
    try:
        old_value = parse_ascii_finite_float(old_token)
        old_decimal = Decimal(old_token)
    except (InvalidOperation, ValueError):
        _fail(
            "patch_target_not_locatable",
            "目标Vol记号不再符合严格数字语法。",
            target_zone.source_line_number,
        )
    if old_value != target_zone.volume_m3:
        _fail(
            "patch_target_not_locatable",
            "目标Vol记号与严格读取结果不一致。",
            target_zone.source_line_number,
        )
    if new_volume_token == old_token or new_decimal == old_decimal:
        _fail(
            "patch_no_change",
            "新体积与当前体积在数值语义上相同。",
            target_zone.source_line_number,
            {"old_token": old_token, "new_token": new_volume_token},
        )

    byte_start, byte_end = located.token_spans[VOLUME_TOKEN_INDEX]
    relative_start = byte_start - located.line_start
    relative_end = byte_end - located.line_start
    new_token_bytes = new_volume_token.encode("ascii")
    new_line_bytes = (
        located.line_bytes[:relative_start] + new_token_bytes + located.line_bytes[relative_end:]
    )
    old_line = located.line_bytes.decode("ascii")
    new_line = new_line_bytes.decode("ascii")
    target = PatchTarget(
        contam_number=target_zone.contam_number,
        zone_name=target_zone.name,
        source_line_number=target_zone.source_line_number,
        field=PATCH_FIELD,
        token_index=VOLUME_TOKEN_INDEX,
        byte_start=byte_start,
        byte_end=byte_end,
    )
    preconditions = PatchPreconditions(
        source_sha256=snapshot.sha256,
        source_size_bytes=snapshot.size,
        reader_mode=document.reader_mode,
        header_version=document.header_version,
        contam_number=target_zone.contam_number,
        source_line_number=target_zone.source_line_number,
        old_token=old_token,
        old_value=old_value,
    )
    return ZoneVolumePatch(
        schema_version=SCHEMA_VERSION,
        patch_type=PATCH_TYPE,
        source_path=str(source),
        source_sha256=snapshot.sha256,
        source_size_bytes=snapshot.size,
        reader_mode=document.reader_mode,
        header_version=document.header_version,
        target=target,
        preconditions=preconditions,
        replacement=PatchReplacement(new_token=new_volume_token, new_value=new_value),
        preview=PatchPreview(
            source_line_number=target_zone.source_line_number,
            old_token=old_token,
            new_token=new_volume_token,
            old_line=old_line,
            new_line=new_line,
        ),
        status=PATCH_STATUS_PLANNED,
    )


def render_zone_volume_patch_diff(patch: ZoneVolumePatch) -> str:
    source_name = Path(patch.source_path).name
    return "\n".join(
        (
            f"--- {source_name}",
            "+++ proposed-copy.prj",
            (
                f"@@ Zone {patch.target.contam_number}, "
                f"source line {patch.target.source_line_number}, field {PATCH_FIELD} @@"
            ),
            f"-{patch.preview.old_line}",
            f"+{patch.preview.new_line}",
        )
    )


def _validate_patch_contract(patch: ZoneVolumePatch) -> None:
    if patch.target.field != PATCH_FIELD:
        _fail("patch_field_unsupported", "当前Patch只支持volume_m3字段。")
    valid = (
        patch.schema_version == SCHEMA_VERSION
        and patch.patch_type == PATCH_TYPE
        and patch.status == PATCH_STATUS_PLANNED
        and patch.reader_mode == READER_MODE
        and patch.target.token_index == VOLUME_TOKEN_INDEX
        and patch.source_sha256 == patch.preconditions.source_sha256
        and patch.source_size_bytes == patch.preconditions.source_size_bytes
        and patch.reader_mode == patch.preconditions.reader_mode
        and patch.header_version == patch.preconditions.header_version
        and patch.target.contam_number == patch.preconditions.contam_number
        and patch.target.source_line_number == patch.preconditions.source_line_number
        and patch.preview.source_line_number == patch.target.source_line_number
        and patch.preview.old_token == patch.preconditions.old_token
        and patch.preview.new_token == patch.replacement.new_token
    )
    if not valid:
        _fail("patch_precondition_failed", "Patch结构或绑定前置条件不一致。")


def _validate_output_path(source: Path, output_path: Path) -> Path:
    output = Path(output_path).expanduser().resolve(strict=False)
    if output.suffix.lower() != ".prj":
        _fail("patch_output_invalid", "输出路径必须使用.prj扩展名。")
    if output == source:
        _fail("patch_output_invalid", "输出路径不得指向源PRJ。")
    if output.exists():
        _fail("patch_output_exists", "输出文件已存在，当前操作不会覆盖。")
    if not output.parent.is_dir():
        _fail("patch_output_invalid", "输出文件的父目录不存在。")
    return output


def _write_new_copy(output: Path, data: bytes) -> None:
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".contam-studio-zone-patch-",
        suffix=".tmp",
        dir=output.parent,
    )
    temporary = Path(temporary_name)
    linked = False
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, output)
        linked = True
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            if linked:
                output.unlink(missing_ok=True)
            raise


def _simulation_artifacts(directory: Path) -> set[str]:
    return {
        item.name
        for item in directory.iterdir()
        if item.is_file() and item.suffix.lower() in _SIMULATION_SUFFIXES
    }


def _verify_zone_documents(
    source_document,
    output_document,
    patch: ZoneVolumePatch,
) -> None:
    if len(source_document.zones) != len(output_document.zones):
        _fail("patch_verification_failed", "输出副本的Zone数量发生变化。")
    for source_zone, output_zone in zip(
        source_document.zones,
        output_document.zones,
        strict=True,
    ):
        if source_zone.contam_number != output_zone.contam_number:
            _fail("patch_verification_failed", "输出副本的Zone编号发生变化。")
        if source_zone.contam_number == patch.target.contam_number:
            unchanged = (
                source_zone.name == output_zone.name
                and source_zone.flags == output_zone.flags
                and source_zone.level_number == output_zone.level_number
                and source_zone.relative_height == output_zone.relative_height
                and source_zone.source_line_number == output_zone.source_line_number
                and output_zone.volume_m3 == patch.replacement.new_value
            )
        else:
            unchanged = source_zone == output_zone
        if not unchanged:
            _fail(
                "patch_verification_failed",
                "输出副本中存在目标体积以外的已解析Zone字段变化。",
                output_zone.source_line_number,
                {"contam_number": output_zone.contam_number},
            )


def apply_zone_volume_patch_to_copy(
    source_path: Path,
    patch: ZoneVolumePatch,
    output_path: Path,
) -> PatchApplicationResult:
    _validate_patch_contract(patch)
    source = Path(source_path).expanduser().resolve()
    if not source.is_file():
        _fail("source_not_found", "源PRJ文件不存在。")
    try:
        patch_source = Path(patch.source_path).expanduser().resolve(strict=True)
    except OSError:
        _fail("patch_precondition_failed", "Patch绑定的源PRJ路径不可验证。")
    if patch_source != source:
        _fail("patch_precondition_failed", "Patch未绑定到本次指定的源PRJ。")
    output = _validate_output_path(source, output_path)

    try:
        source_document = read_simple_zones(source)
    except PrjZoneReaderError:
        _fail("patch_precondition_failed", "应用前源PRJ不再满足严格读取条件。")
    snapshot = _read_snapshot(source)
    preconditions_match = (
        snapshot.sha256 == patch.source_sha256
        and snapshot.size == patch.source_size_bytes
        and source_document.source_sha256 == patch.source_sha256
        and source_document.source_size_bytes == patch.source_size_bytes
        and source_document.reader_mode == patch.reader_mode
        and source_document.header_version == patch.header_version
    )
    if not preconditions_match:
        _fail("patch_precondition_failed", "源PRJ哈希、大小或读取契约已变化。")
    matches = [
        zone for zone in source_document.zones if zone.contam_number == patch.target.contam_number
    ]
    if len(matches) != 1:
        _fail("patch_precondition_failed", "目标Zone不再唯一存在。")
    target_zone = matches[0]
    if (
        target_zone.name != patch.target.zone_name
        or target_zone.source_line_number != patch.target.source_line_number
        or target_zone.contam_number != patch.preconditions.contam_number
        or target_zone.volume_m3 != patch.preconditions.old_value
    ):
        _fail("patch_precondition_failed", "目标Zone字段前置条件已变化。")

    try:
        located = _locate_zone_line(snapshot.data, patch.target.source_line_number)
    except ZoneVolumePatchError:
        _fail("patch_precondition_failed", "目标Zone行无法按Patch前置条件定位。")
    expected_span = located.token_spans[VOLUME_TOKEN_INDEX]
    if (
        located.record != target_zone
        or expected_span != (patch.target.byte_start, patch.target.byte_end)
        or located.tokens[VOLUME_TOKEN_INDEX] != patch.preconditions.old_token
    ):
        _fail("patch_precondition_failed", "目标Vol记号位置或旧值已变化。")
    if not (0 <= patch.target.byte_start < patch.target.byte_end <= snapshot.size):
        _fail("patch_precondition_failed", "Patch字节范围无效。")
    if snapshot.data[
        patch.target.byte_start : patch.target.byte_end
    ] != patch.preconditions.old_token.encode("ascii"):
        _fail("patch_precondition_failed", "Patch字节范围不再对应旧Vol记号。")

    new_value, new_decimal = _parse_new_volume(patch.replacement.new_token)
    try:
        old_decimal = Decimal(patch.preconditions.old_token)
    except InvalidOperation:
        _fail("patch_precondition_failed", "Patch旧Vol记号无效。")
    if (
        new_value != patch.replacement.new_value
        or new_decimal == old_decimal
        or patch.replacement.new_token == patch.preconditions.old_token
    ):
        _fail("patch_precondition_failed", "Patch替换值不符合已批准计划。")

    relative_start = patch.target.byte_start - located.line_start
    relative_end = patch.target.byte_end - located.line_start
    expected_new_line = (
        located.line_bytes[:relative_start]
        + patch.replacement.new_token.encode("ascii")
        + located.line_bytes[relative_end:]
    ).decode("ascii")
    if (
        patch.preview.old_line != located.line_bytes.decode("ascii")
        or patch.preview.new_line != expected_new_line
    ):
        _fail("patch_precondition_failed", "Patch单行Diff预览与源字节不一致。")

    expected = (
        snapshot.data[: patch.target.byte_start]
        + patch.replacement.new_token.encode("ascii")
        + snapshot.data[patch.target.byte_end :]
    )
    artifacts_before = _simulation_artifacts(output.parent)
    output_created = False
    try:
        if output.exists():
            _fail("patch_output_exists", "输出文件已存在，当前操作不会覆盖。")
        try:
            _write_new_copy(output, expected)
        except FileExistsError:
            _fail("patch_output_exists", "输出文件在写入期间已由其他操作创建。")
        except OSError:
            _fail("patch_application_failed", "无法安全创建新的PRJ副本。")
        output_created = True

        source_after = _read_snapshot(source)
        if source_after.sha256 != snapshot.sha256 or source_after.size != snapshot.size:
            _fail("patch_verification_failed", "应用后源PRJ哈希或大小发生变化。")
        output_bytes = output.read_bytes()
        if output_bytes != expected:
            _fail("patch_verification_failed", "输出副本不等于计划的单记号替换字节。")
        replacement_length = len(patch.replacement.new_token.encode("ascii"))
        if (
            output_bytes[: patch.target.byte_start] != snapshot.data[: patch.target.byte_start]
            or output_bytes[patch.target.byte_start + replacement_length :]
            != snapshot.data[patch.target.byte_end :]
        ):
            _fail("patch_verification_failed", "输出副本存在目标记号以外的字节变化。")
        try:
            output_document = read_simple_zones(output)
        except PrjZoneReaderError:
            _fail("patch_verification_failed", "严格Zone读取器无法重新读取输出副本。")
        _verify_zone_documents(source_document, output_document, patch)
        generated_artifacts = _simulation_artifacts(output.parent) - artifacts_before
        if generated_artifacts:
            _fail("patch_verification_failed", "Patch应用产生了非预期仿真结果文件。")
    except ZoneVolumePatchError:
        if output_created:
            output.unlink(missing_ok=True)
        raise
    except OSError:
        if output_created:
            output.unlink(missing_ok=True)
        _fail("patch_verification_failed", "输出副本后置验证失败。")
    except Exception:  # noqa: BLE001 - unverified output must be removed at this boundary.
        if output_created:
            output.unlink(missing_ok=True)
        _fail("patch_verification_failed", "输出副本后置验证发生内部失败。")

    output_sha256 = _sha256(expected)
    return PatchApplicationResult(
        schema_version=SCHEMA_VERSION,
        patch_type=PATCH_TYPE,
        status=PATCH_STATUS_APPLIED,
        source_path=str(source),
        source_sha256=snapshot.sha256,
        source_size_bytes=snapshot.size,
        source_unchanged=True,
        output_path=str(output),
        output_sha256=output_sha256,
        output_size_bytes=len(expected),
        target=patch.target,
        old_token=patch.preconditions.old_token,
        new_token=patch.replacement.new_token,
        old_value=patch.preconditions.old_value,
        new_value=patch.replacement.new_value,
        verification=(
            "source_snapshot_unchanged",
            "single_token_byte_replacement_verified",
            "strict_zone_reread_verified",
            "parsed_zone_fields_verified",
        ),
        generated_artifacts=(),
        diagnostics=(
            PatchDiagnostic(
                code="copy_only_patch_applied",
                message="已创建并验证新的PRJ副本；源PRJ未修改。",
                source_line_number=patch.target.source_line_number,
            ),
        ),
    )


def _configure_utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="计划或应用仅写新副本的严格Zone体积结构化Patch。")
    subparsers = parser.add_subparsers(dest="operation", required=True)

    plan = subparsers.add_parser("plan", help="只读生成尚未应用的Patch")
    plan.add_argument("source", type=Path)
    plan.add_argument("--zone-number", type=int, required=True)
    plan.add_argument("--new-volume", required=True)
    plan_output = plan.add_mutually_exclusive_group(required=True)
    plan_output.add_argument("--json", action="store_true")
    plan_output.add_argument("--diff", action="store_true")

    apply = subparsers.add_parser("apply", help="重新验证后应用到不存在的新PRJ副本")
    apply.add_argument("source", type=Path)
    apply.add_argument("--zone-number", type=int, required=True)
    apply.add_argument("--new-volume", required=True)
    apply.add_argument("--output", type=Path, required=True)
    apply.add_argument("--json", action="store_true", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    _configure_utf8_streams()
    args = _parser().parse_args(argv)
    try:
        patch = plan_zone_volume_patch(args.source, args.zone_number, args.new_volume)
        if args.operation == "plan":
            if args.diff:
                print(render_zone_volume_patch_diff(patch))
            else:
                print(json.dumps(patch.to_dict(), ensure_ascii=False, indent=2))
        else:
            result = apply_zone_volume_patch_to_copy(args.source, patch, args.output)
            print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    except ZoneVolumePatchError as error:
        print(json.dumps(error.diagnostic.to_dict(), ensure_ascii=False), file=sys.stderr)
        return error.exit_code
    except Exception:  # noqa: BLE001 - CLI boundary must not leak a traceback.
        diagnostic = PatchDiagnostic(
            code="patch_internal_error",
            message="Zone体积Patch处理发生未公开的内部错误。",
        )
        print(json.dumps(diagnostic.to_dict(), ensure_ascii=False), file=sys.stderr)
        return PATCH_ERROR_EXIT_CODES[diagnostic.code]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
