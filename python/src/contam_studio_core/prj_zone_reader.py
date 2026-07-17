from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

from .prj_zone_models import PrjZoneDocument, ReaderDiagnostic, ZoneDocumentRecord

SCHEMA_VERSION = "1.0"
READER_MODE = "strict_contam_3_4_simple_zone_v1"
SUPPORTED_HEADER_VERSIONS = frozenset({"3.4.0.0", "3.4.0.4"})

_HEADER_PATTERN = re.compile(r"^ContamW +([^ ]+) +([+-]?[0-9]+)$")
_ZONE_MARKER_PATTERN = re.compile(r"^ *([^ ]*) +! *zones: *$")
_INTEGER_PATTERN = re.compile(r"^[+-]?[0-9]+$")

ERROR_EXIT_CODES = {
    "source_not_found": 2,
    "non_ascii_prj": 3,
    "unsupported_prj_version": 4,
    "zone_section_not_found": 5,
    "multiple_zone_sections": 6,
    "invalid_zone_count": 7,
    "zone_header_missing": 8,
    "zone_count_mismatch": 9,
    "zone_terminator_missing": 10,
    "unsupported_zone_layout": 11,
    "invalid_zone_field": 12,
    "duplicate_zone_number": 13,
    "unsupported_zone_name": 14,
    "unsupported_zone_conditional_fields": 15,
    "source_changed_during_read": 16,
}

_INTEGER_FIELDS = {
    0: "nr",
    1: "flags",
    2: "ps",
    3: "pc",
    4: "pk",
    5: "pl",
    11: "color",
    12: "u_Ht",
    13: "u_V",
    14: "u_T",
    15: "u_P",
    16: "cdaxis",
    17: "vf_type",
    18: "cfd",
}
_FLOAT_FIELDS = {
    6: "relHt",
    7: "Vol",
    8: "T0",
    9: "P0",
}


class PrjZoneReaderError(Exception):
    def __init__(self, diagnostic: ReaderDiagnostic) -> None:
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic
        self.code = diagnostic.code
        self.exit_code = ERROR_EXIT_CODES[diagnostic.code]


def _fail(
    code: str,
    message: str,
    line_number: int | None = None,
    context: dict[str, int | str] | None = None,
) -> None:
    raise PrjZoneReaderError(
        ReaderDiagnostic(
            code=code,
            message=message,
            source_line_number=line_number,
            context=context,
        )
    )


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read_bytes(path: Path) -> bytes:
    return path.read_bytes()


def _decode_ascii(data: bytes) -> str:
    try:
        return data.decode("ascii", errors="strict")
    except UnicodeDecodeError as error:
        line_number = data[: error.start].count(b"\n") + 1
        _fail(
            "non_ascii_prj",
            "PRJ包含非ASCII字节，严格读取已拒绝。",
            line_number,
            {"byte_offset": error.start},
        )
    raise AssertionError("unreachable")


def _split_supported_lines(text: str) -> list[str]:
    if "\r" in text.replace("\r\n", ""):
        _fail(
            "unsupported_zone_layout",
            "只支持LF或CRLF行尾，检测到独立回车符。",
        )
    return text.replace("\r\n", "\n").split("\n")


def _parse_header(line: str) -> tuple[str, int]:
    matched = _HEADER_PATTERN.fullmatch(line.strip(" "))
    if matched is None or matched.group(1) not in SUPPORTED_HEADER_VERSIONS:
        version = matched.group(1) if matched is not None else "unknown"
        _fail(
            "unsupported_prj_version",
            "只支持已验证的ContamW文件头版本。",
            1,
            {"header_version": version},
        )
    return matched.group(1), int(matched.group(2))


def _find_zone_section(lines: list[str]) -> tuple[int, int]:
    candidates: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        matched = _ZONE_MARKER_PATTERN.fullmatch(line)
        if matched is not None:
            candidates.append((index, matched.group(1)))

    if not candidates:
        _fail("zone_section_not_found", "未找到严格格式的Zone区块标记。")
    if len(candidates) > 1:
        _fail(
            "multiple_zone_sections",
            "检测到多个Zone区块候选，严格读取已拒绝。",
            candidates[1][0] + 1,
            {"candidate_count": len(candidates)},
        )

    index, count_token = candidates[0]
    if not count_token.isdecimal():
        _fail(
            "invalid_zone_count",
            "Zone声明数量必须是非负十进制整数。",
            index + 1,
            {"token": count_token[:80]},
        )
    return index, int(count_token)


def _parse_integer(token: str, field: str, line_number: int) -> int:
    if _INTEGER_PATTERN.fullmatch(token) is None:
        _fail(
            "invalid_zone_field",
            f"Zone字段{field}不是有效整数。",
            line_number,
            {"field": field, "token": token[:80]},
        )
    return int(token)


def _parse_float(token: str, field: str, line_number: int) -> float:
    try:
        value = float(token)
    except ValueError:
        _fail(
            "invalid_zone_field",
            f"Zone字段{field}不是有效浮点数。",
            line_number,
            {"field": field, "token": token[:80]},
        )
    if not math.isfinite(value):
        _fail(
            "invalid_zone_field",
            f"Zone字段{field}必须是有限浮点数。",
            line_number,
            {"field": field, "token": token[:80]},
        )
    return value


def _looks_like_split_name(tokens: list[str]) -> bool:
    if len(tokens) <= 19:
        return False
    try:
        for index in range(6):
            if _INTEGER_PATTERN.fullmatch(tokens[index]) is None:
                return False
        for index in range(6, 10):
            if not math.isfinite(float(tokens[index])):
                return False
        if any(_INTEGER_PATTERN.fullmatch(token) is None for token in tokens[-8:]):
            return False
    except ValueError:
        return False
    return any(_INTEGER_PATTERN.fullmatch(token) is None for token in tokens[10:-8])


def _parse_zone_line(line: str, line_number: int) -> ZoneDocumentRecord:
    if not line or not line.strip(" ") or line.startswith("!"):
        _fail(
            "unsupported_zone_layout",
            "Zone记录中不允许空行或纯注释行。",
            line_number,
        )

    data = line.partition("!")[0].strip(" ")
    if any(character in data for character in "\t\v\f"):
        _fail(
            "unsupported_zone_layout",
            "Zone记录只允许普通ASCII空格分隔字段。",
            line_number,
        )
    tokens = data.split(" ")
    tokens = [token for token in tokens if token]
    if len(tokens) < 19:
        _fail(
            "unsupported_zone_layout",
            "简单Zone记录必须恰好包含19个字段。",
            line_number,
            {"field_count": len(tokens)},
        )

    integers: dict[int, int] = {}
    floats: dict[int, float] = {}
    try:
        for index, field in _INTEGER_FIELDS.items():
            integers[index] = _parse_integer(tokens[index], field, line_number)
        for index, field in _FLOAT_FIELDS.items():
            floats[index] = _parse_float(tokens[index], field, line_number)
    except PrjZoneReaderError as error:
        if error.code == "invalid_zone_field" and _looks_like_split_name(tokens):
            _fail(
                "unsupported_zone_name",
                "Zone名称必须是不含空白的单一ASCII记号。",
                line_number,
            )
        raise

    conditional_values = {
        "cdaxis": integers[16],
        "vf_type": integers[17],
        "cfd": integers[18],
    }
    if any(conditional_values.values()):
        _fail(
            "unsupported_zone_conditional_fields",
            "首版读取器不支持Zone条件字段或续行。",
            line_number,
            conditional_values,
        )
    if len(tokens) != 19:
        _fail(
            "unsupported_zone_layout",
            "简单Zone记录必须恰好包含19个字段且不得续行。",
            line_number,
            {"field_count": len(tokens)},
        )

    name = tokens[10]
    if len(name) > 15:
        _fail(
            "unsupported_zone_name",
            "Zone名称不得超过15个ASCII字符。",
            line_number,
            {"name_length": len(name)},
        )
    contam_number = integers[0]
    if contam_number <= 0:
        _fail(
            "invalid_zone_field",
            "Zone字段nr必须是正整数。",
            line_number,
            {"field": "nr", "token": tokens[0]},
        )

    return ZoneDocumentRecord(
        contam_number=contam_number,
        name=name,
        flags=integers[1],
        level_number=integers[5],
        relative_height=floats[6],
        volume_m3=floats[7],
        source_line_number=line_number,
    )


def _looks_like_extra_zone_record(line: str) -> bool:
    if not line or line.startswith("!"):
        return False
    return len(line.partition("!")[0].split()) >= 19


def _parse_zone_section(lines: list[str], marker_index: int, count: int) -> tuple[ZoneDocumentRecord, ...]:
    header_index = marker_index + 1
    if header_index >= len(lines) or not lines[header_index].startswith("!"):
        _fail(
            "zone_header_missing",
            "Zone数量行后必须紧跟以!开头的字段说明行。",
            header_index + 1,
        )

    first_record_index = header_index + 1
    zones: list[ZoneDocumentRecord] = []
    numbers: set[int] = set()
    for offset in range(count):
        index = first_record_index + offset
        if index >= len(lines) or lines[index].strip(" ") == "-999":
            _fail(
                "zone_count_mismatch",
                "Zone记录少于声明数量。",
                index + 1,
                {"declared_count": count, "parsed_count": len(zones)},
            )
        zone = _parse_zone_line(lines[index], index + 1)
        if zone.contam_number in numbers:
            _fail(
                "duplicate_zone_number",
                "同一PRJ中的Zone编号不得重复。",
                index + 1,
                {"contam_number": zone.contam_number},
            )
        numbers.add(zone.contam_number)
        zones.append(zone)

    terminator_index = first_record_index + count
    if terminator_index >= len(lines):
        _fail(
            "zone_terminator_missing",
            "Zone区块缺少独立的-999终止符。",
            terminator_index + 1,
        )
    terminator = lines[terminator_index]
    if terminator.strip(" ") != "-999":
        if _looks_like_extra_zone_record(terminator):
            _fail(
                "zone_count_mismatch",
                "Zone记录多于声明数量。",
                terminator_index + 1,
                {"declared_count": count},
            )
        _fail(
            "zone_terminator_missing",
            "全部Zone记录后必须立即出现独立的-999终止符。",
            terminator_index + 1,
        )
    return tuple(zones)


def read_simple_zones(path: Path) -> PrjZoneDocument:
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        _fail("source_not_found", f"PRJ文件不存在：{source}")

    try:
        initial_size = source.stat().st_size
        initial_bytes = _read_bytes(source)
    except OSError as error:
        _fail("source_changed_during_read", f"读取PRJ时源文件状态发生变化：{error}")
    if len(initial_bytes) != initial_size:
        _fail("source_changed_during_read", "读取PRJ时源文件大小发生变化。")

    source_sha256 = _sha256(initial_bytes)
    lines = _split_supported_lines(_decode_ascii(initial_bytes))
    if not lines:
        _fail("unsupported_prj_version", "PRJ缺少ContamW文件头。", 1)
    header_version, header_variant = _parse_header(lines[0])
    marker_index, declared_count = _find_zone_section(lines)
    zones = _parse_zone_section(lines, marker_index, declared_count)

    try:
        final_bytes = _read_bytes(source)
        final_size = source.stat().st_size
    except OSError as error:
        _fail("source_changed_during_read", f"读取PRJ后源文件状态发生变化：{error}")
    if (
        final_size != initial_size
        or len(final_bytes) != final_size
        or _sha256(final_bytes) != source_sha256
    ):
        _fail("source_changed_during_read", "读取前后源PRJ的大小或SHA-256不一致。")

    diagnostics = (
        ReaderDiagnostic(
            code="strict_subset_read",
            message="仅识别经验证的CONTAM 3.4简单Zone子集；未解析其他PRJ区块。",
        ),
    )
    return PrjZoneDocument(
        schema_version=SCHEMA_VERSION,
        reader_mode=READER_MODE,
        source_path=str(source),
        source_sha256=source_sha256,
        source_size_bytes=initial_size,
        source_unchanged=True,
        header_version=header_version,
        header_variant=header_variant,
        declared_zone_count=declared_count,
        zones=zones,
        diagnostics=diagnostics,
    )


def _configure_utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "纯文档读取CONTAM 3.4严格简单Zone子集；"
            "不调用contamxpy、ContamX或仿真初始化。"
        )
    )
    parser.add_argument("path", type=Path, help="CONTAM PRJ文件路径")
    parser.add_argument("--json", action="store_true", required=True, help="输出UTF-8 JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    _configure_utf8_streams()
    args = _parser().parse_args(argv)
    try:
        document = read_simple_zones(args.path)
    except PrjZoneReaderError as error:
        print(json.dumps(error.diagnostic.to_dict(), ensure_ascii=False), file=sys.stderr)
        return error.exit_code
    print(json.dumps(document.to_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
