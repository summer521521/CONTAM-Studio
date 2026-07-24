from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
import re


SECTION_SCHEMA_VERSION = "prj_sections.v1"
MAX_DOCUMENT_BYTES = 16 * 1024 * 1024
MAX_SECTION_LINES = 1_000_000
_MARKER = re.compile(r"^\s*(\d+)\s+!\s*([^:]+):\s*$")


class PrjSectionError(Exception):
    def __init__(self, code: str, message: str, line_number: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.line_number = line_number


@dataclass(frozen=True, slots=True)
class SectionLine:
    line_number: int
    text: str


@dataclass(frozen=True, slots=True)
class PrjSection:
    name: str
    declared_count: int
    marker_line_number: int
    lines: tuple[SectionLine, ...]
    terminator_line_number: int


@dataclass(frozen=True, slots=True)
class PrjSectionsDocument:
    source_path: str
    source_sha256: str
    source_size_bytes: int
    header_version: str
    header_variant: int
    sections: tuple[PrjSection, ...]

    def section(self, name: str) -> PrjSection | None:
        wanted = name.casefold()
        matches = [item for item in self.sections if item.name.casefold() == wanted]
        if len(matches) > 1:
            raise PrjSectionError("duplicate_section", f"重复的PRJ区块：{name}。")
        return matches[0] if matches else None


def _parse_header(line: str) -> tuple[str, int]:
    tokens = line.strip().split()
    if len(tokens) != 3 or tokens[0] != "ContamW":
        raise PrjSectionError("unsupported_prj_version", "PRJ文件头不是已验证的ContamW格式。", 1)
    try:
        variant = int(tokens[2])
    except ValueError as error:
        raise PrjSectionError("unsupported_prj_version", "PRJ文件头变体不是整数。", 1) from error
    if tokens[1] not in {"3.4.0.0", "3.4.0.4"}:
        raise PrjSectionError("unsupported_prj_version", "PRJ文件头版本不在已验证范围。", 1)
    return tokens[1], variant


def read_prj_sections(path: Path, *, max_bytes: int = MAX_DOCUMENT_BYTES) -> PrjSectionsDocument:
    source = Path(path).expanduser().resolve()
    try:
        before = source.stat().st_size
        data = source.read_bytes()
        after = source.stat().st_size
    except OSError as error:
        raise PrjSectionError("source_not_found", "PRJ文件不可读。") from error
    if before != after or len(data) != after:
        raise PrjSectionError("source_changed_during_read", "读取期间PRJ文件发生变化。")
    if len(data) > max_bytes:
        raise PrjSectionError("source_too_large", "PRJ文件超过资源限制。")
    try:
        text = data.decode("ascii", errors="strict")
    except UnicodeDecodeError as error:
        raise PrjSectionError("non_ascii_prj", "PRJ只接受严格ASCII编码。", data[: error.start].count(b"\n") + 1) from error
    if "\r" in text.replace("\r\n", ""):
        raise PrjSectionError("unsupported_newline", "PRJ包含不支持的独立回车符。")
    lines = text.replace("\r\n", "\n").splitlines()
    if not lines:
        raise PrjSectionError("unsupported_prj_version", "PRJ文件为空。", 1)
    header_version, header_variant = _parse_header(lines[0])
    sections: list[PrjSection] = []
    index = 0
    while index < len(lines):
        match = _MARKER.fullmatch(lines[index])
        if match is None:
            index += 1
            continue
        try:
            count = int(match.group(1))
        except ValueError as error:
            raise PrjSectionError("invalid_section_count", "区块数量不是整数。", index + 1) from error
        if count < 0 or count > MAX_SECTION_LINES:
            raise PrjSectionError("invalid_section_count", "区块数量超过安全范围。", index + 1)
        name = match.group(2).strip()
        content: list[SectionLine] = []
        cursor = index + 1
        while cursor < len(lines) and lines[cursor].strip() != "-999":
            if len(content) >= MAX_SECTION_LINES:
                raise PrjSectionError("section_too_large", "区块行数超过安全范围。", index + 1)
            content.append(SectionLine(cursor + 1, lines[cursor]))
            cursor += 1
        if cursor >= len(lines):
            raise PrjSectionError("section_terminator_missing", "区块缺少-999终止符。", index + 1)
        sections.append(PrjSection(name, count, index + 1, tuple(content), cursor + 1))
        index = cursor + 1
    try:
        final_size = source.stat().st_size
        final_data = source.read_bytes()
    except OSError as error:
        raise PrjSectionError("source_changed_during_read", "读取结束时PRJ文件不可复核。") from error
    if final_size != len(data) or final_data != data:
        raise PrjSectionError("source_changed_during_read", "解析期间PRJ文件发生变化。")
    return PrjSectionsDocument(
        source_path=str(source),
        source_sha256=hashlib.sha256(data).hexdigest(),
        source_size_bytes=len(data),
        header_version=header_version,
        header_variant=header_variant,
        sections=tuple(sections),
    )
