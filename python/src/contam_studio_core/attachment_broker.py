from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import csv
import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import unicodedata
from uuid import uuid4
import xml.etree.ElementTree as ET
import zipfile


MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_BATCH_BYTES = 100 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_PDF_PAGES = 200
MAX_OFFICE_EXPANDED_BYTES = 64 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 1_000
MAX_ARCHIVE_EXPANDED_BYTES = 500 * 1024 * 1024
MAX_ARCHIVE_RATIO = 20
MAX_NESTING = 2
MAX_TEXT_BYTES = 64 * 1024
MAX_TEXT_ROWS = 100
MAX_TEXT_COLUMNS = 20
MAX_CELL_CHARS = 1_024
MAX_XML_FILES = 24

_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}
_OFFICE_SUFFIXES = {".docx", ".pptx", ".xlsx", ".odt"}
_TEXT_SUFFIXES = {".txt", ".csv", ".tsv", ".json"}
_CONTAM_SUFFIXES = {".prj", ".sim", ".nfr"}
_EXECUTABLE_SUFFIXES = {".exe", ".dll", ".msi", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jar", ".com", ".scr"}


class AttachmentError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class AttachmentCategory(StrEnum):
    IMAGE = "image"
    PDF = "pdf"
    OFFICE = "office"
    SPREADSHEET = "spreadsheet"
    TEXT = "text"
    STRUCTURED = "structured"
    ARCHIVE = "archive"
    CONTAM_PROJECT = "contam_project"
    CONTAM_ARTIFACT = "contam_artifact"
    UNSUPPORTED = "unsupported_binary"


@dataclass(frozen=True, slots=True)
class AttachmentRecord:
    attachment_id: str
    display_name: str
    category: AttachmentCategory
    size_bytes: int
    sha256: str
    status: str
    quarantine_relative_path: str
    active_content_rejected: bool
    risk_summary: str
    metadata: dict[str, object]
    evidence_kind: str | None
    evidence_text: str | None

    def safe_view(self) -> dict[str, object]:
        return {
            "attachment_id": self.attachment_id,
            "display_name": self.display_name,
            "category": self.category.value,
            "size_bytes": self.size_bytes,
            "sha256_prefix": self.sha256[:12],
            "status": self.status,
            "active_content_rejected": self.active_content_rejected,
            "risk_summary": self.risk_summary,
            "metadata": self.metadata,
            "evidence_kind": self.evidence_kind,
        }


@dataclass(frozen=True, slots=True)
class AttachmentEvidence:
    attachment_id: str
    evidence_id: str
    locator: str
    text: str
    sha256: str

    def to_dict(self) -> dict[str, object]:
        return {
            "attachment_id": self.attachment_id,
            "evidence_id": self.evidence_id,
            "locator": self.locator,
            "text": self.text,
            "sha256": self.sha256,
        }


@dataclass(frozen=True, slots=True)
class ArchiveEntry:
    relative_name: str
    compressed_bytes: int
    expanded_bytes: int
    sha256: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "relative_name": self.relative_name,
            "compressed_bytes": self.compressed_bytes,
            "expanded_bytes": self.expanded_bytes,
            "sha256": self.sha256,
        }


@dataclass(frozen=True, slots=True)
class _Inspection:
    category: AttachmentCategory
    active_content_rejected: bool
    risk_summary: str
    metadata: dict[str, object]
    evidence_kind: str | None
    evidence_text: str | None


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def _hash_path(path: Path) -> tuple[str, int]:
    hasher = hashlib.sha256()
    total = 0
    with path.open("rb") as source:
        while chunk := source.read(64 * 1024):
            hasher.update(chunk)
            total += len(chunk)
    return hasher.hexdigest().upper(), total


def _safe_name(name: str) -> str:
    candidate = unicodedata.normalize("NFC", Path(name).name).strip()
    if not candidate or candidate in {".", ".."} or len(candidate) > 160:
        raise AttachmentError("filename_invalid", "附件文件名无效。")
    if any(ord(character) < 32 for character in candidate) or any(character in candidate for character in "/\\:"):
        raise AttachmentError("filename_invalid", "附件文件名包含控制字符。")
    return candidate


def _name_key(name: str) -> str:
    return unicodedata.normalize("NFC", name).casefold()


def _suffix(path: Path) -> str:
    return path.suffix.casefold()


def _is_png(data: bytes) -> bool:
    return data.startswith(b"\x89PNG\r\n\x1a\n")


def _is_jpeg(data: bytes) -> bool:
    return data.startswith(b"\xff\xd8\xff")


def _is_pdf(data: bytes) -> bool:
    return data.startswith(b"%PDF-")


def _is_zip(data: bytes) -> bool:
    return data.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"))


def _extension_matches(path: Path, data: bytes) -> bool:
    suffix = _suffix(path)
    if suffix == ".png":
        return _is_png(data)
    if suffix in {".jpg", ".jpeg"}:
        return _is_jpeg(data)
    if suffix == ".pdf":
        return _is_pdf(data)
    if suffix in _OFFICE_SUFFIXES or suffix == ".zip":
        return _is_zip(data)
    return True


def _category(path: Path, data: bytes) -> AttachmentCategory:
    suffix = _suffix(path)
    if suffix == ".prj":
        return AttachmentCategory.CONTAM_PROJECT
    if suffix in {".sim", ".nfr"}:
        return AttachmentCategory.CONTAM_ARTIFACT
    if suffix in _IMAGE_SUFFIXES:
        return AttachmentCategory.IMAGE
    if suffix == ".pdf":
        return AttachmentCategory.PDF
    if suffix in {".docx", ".pptx", ".odt"}:
        return AttachmentCategory.OFFICE
    if suffix == ".xlsx":
        return AttachmentCategory.SPREADSHEET
    if suffix in {".csv", ".tsv"}:
        return AttachmentCategory.SPREADSHEET
    if suffix == ".txt":
        return AttachmentCategory.TEXT
    if suffix == ".json":
        return AttachmentCategory.STRUCTURED
    if suffix == ".zip":
        return AttachmentCategory.ARCHIVE
    return AttachmentCategory.UNSUPPORTED


def _sanitize_evidence_text(value: str) -> str:
    value = re.sub(r"(?i)(?:[a-z]:[\\/]|file://|\\\\)[^\s\"'<>]{1,512}", "[redacted path]", value)
    value = re.sub(r"(?im)^([^\n]*(?:password|secret|api[_-]?key|token)[^\n:=]{0,80}[:=]\s*)[^\n]{1,512}$", r"\1[redacted]", value)
    return value[:MAX_TEXT_BYTES]


class AttachmentBroker:
    """Owns only Studio quarantine copies; source paths never leave this boundary."""

    def __init__(self, quarantine_root: Path, *, max_file_bytes: int = MAX_FILE_BYTES, max_batch_bytes: int = MAX_BATCH_BYTES) -> None:
        self.root = Path(quarantine_root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.max_file_bytes = min(max_file_bytes, MAX_FILE_BYTES)
        self.max_batch_bytes = min(max_batch_bytes, MAX_BATCH_BYTES)
        self._records: dict[str, AttachmentRecord] = {}

    def ingest(self, source: Path, *, retain_rejected: bool = False) -> AttachmentRecord:
        raw_path = Path(source).expanduser()
        if raw_path.is_symlink():
            raise AttachmentError("source_link_rejected", "附件符号链接不受支持。")
        path = raw_path.resolve(strict=False)
        if not path.is_file():
            raise AttachmentError("source_missing", "附件来源文件不存在。")
        initial_hash, initial_size = _hash_path(path)
        if initial_size > self.max_file_bytes:
            raise AttachmentError("file_too_large", "附件超过文件大小限制。")
        display_name = _safe_name(path.name)
        attachment_id = str(uuid4())
        relative = f"{attachment_id}-{display_name}"
        target = self.root / relative
        try:
            target.relative_to(self.root)
        except ValueError as error:
            raise AttachmentError("quarantine_boundary", "附件隔离目标无效。") from error
        copied_hash, copied_size = self._copy_exclusive(path, target)
        try:
            final_hash, final_size = _hash_path(path)
        except OSError:
            final_hash, final_size = "", -1
        if (initial_hash, initial_size) != (copied_hash, copied_size) or (initial_hash, initial_size) != (final_hash, final_size):
            return self._retain_or_raise(
                attachment_id, display_name, target, copied_hash, copied_size, AttachmentCategory.UNSUPPORTED,
                AttachmentError("source_changed", "附件在读取期间发生变化。"), retain_rejected,
            )
        try:
            if any(_name_key(existing.display_name) == _name_key(display_name) for existing in self._records.values()):
                raise AttachmentError("filename_collision", "附件文件名在Unicode规范化后发生冲突。")
            inspection = self._inspect(target, display_name)
        except AttachmentError as error:
            return self._retain_or_raise(
                attachment_id, display_name, target, copied_hash, copied_size, _category(path, target.read_bytes()[:16]), error, retain_rejected,
            )
        status = "unsupported" if inspection.category == AttachmentCategory.UNSUPPORTED else "ready"
        record = AttachmentRecord(
            attachment_id, display_name, inspection.category, copied_size, copied_hash, status, relative,
            inspection.active_content_rejected, inspection.risk_summary, inspection.metadata,
            inspection.evidence_kind, inspection.evidence_text,
        )
        self._records[attachment_id] = record
        return record

    def ingest_desktop(self, source: Path) -> AttachmentRecord:
        return self.ingest(source, retain_rejected=True)

    def ingest_batch(self, sources: tuple[Path, ...], *, retain_rejected: bool = False) -> tuple[AttachmentRecord, ...]:
        if not sources:
            raise AttachmentError("empty_batch", "附件批次不能为空。")
        try:
            total = sum(Path(source).stat().st_size for source in sources)
        except OSError as error:
            raise AttachmentError("source_missing", "附件来源文件不存在。") from error
        if total > self.max_batch_bytes:
            raise AttachmentError("batch_too_large", "附件批次超过总大小限制。")
        records: list[AttachmentRecord] = []
        try:
            for source in sources:
                records.append(self.ingest(source, retain_rejected=retain_rejected))
        except Exception:
            for record in records:
                self.remove(record.attachment_id)
            raise
        return tuple(records)

    def get(self, attachment_id: str) -> AttachmentRecord:
        try:
            return self._records[attachment_id]
        except KeyError as error:
            raise AttachmentError("attachment_missing", "附件记录不存在。") from error

    def remove(self, attachment_id: str) -> None:
        record = self.get(attachment_id)
        target = (self.root / record.quarantine_relative_path).resolve()
        if target.parent != self.root or not target.name.startswith(f"{attachment_id}-"):
            raise AttachmentError("owned_attachment_required", "只能删除Studio拥有的附件副本。")
        target.unlink(missing_ok=True)
        del self._records[attachment_id]

    def text_evidence(self, attachment_id: str, *, max_bytes: int = MAX_TEXT_BYTES) -> AttachmentEvidence:
        record = self.get(attachment_id)
        if record.status != "ready" or not record.evidence_kind or record.evidence_text is None:
            raise AttachmentError("evidence_unsupported", "当前附件类别没有安全文本衍生物。")
        text = record.evidence_text[:max_bytes]
        evidence_id = f"ev-{hashlib.sha256(f'{record.attachment_id}:{record.evidence_kind}'.encode('ascii')).hexdigest()[:16]}"
        return AttachmentEvidence(record.attachment_id, evidence_id, record.evidence_kind, text, _sha256(text.encode("utf-8")))

    def spreadsheet_preview(self, attachment_id: str, *, max_rows: int = MAX_TEXT_ROWS) -> tuple[tuple[str, ...], ...]:
        record = self.get(attachment_id)
        if record.category != AttachmentCategory.SPREADSHEET or _suffix(Path(record.display_name)) not in {".csv", ".tsv"}:
            raise AttachmentError("spreadsheet_parser_unavailable", "当前附件不执行Office公式或二进制工作簿。")
        data = self._owned_path(record).read_bytes()
        return self._csv_preview(data, "\t" if record.display_name.casefold().endswith(".tsv") else ",", max_rows)

    def enumerate_archive(self, attachment_id: str) -> tuple[ArchiveEntry, ...]:
        record = self.get(attachment_id)
        if record.category != AttachmentCategory.ARCHIVE:
            raise AttachmentError("archive_required", "只有ZIP附件可以枚举条目。")
        return self._inspect_zip(self._owned_path(record).read_bytes(), depth=0)[0]

    def _retain_or_raise(self, attachment_id: str, display_name: str, target: Path, sha256: str, size: int, category: AttachmentCategory, error: AttachmentError, retain: bool) -> AttachmentRecord:
        if not retain:
            target.unlink(missing_ok=True)
            raise error
        status = "changed" if error.code == "source_changed" else "blocked"
        record = AttachmentRecord(
            attachment_id, display_name, category, size, sha256, status, target.name, True,
            error.code, {"reason": error.code}, None, None,
        )
        self._records[attachment_id] = record
        return record

    def _copy_exclusive(self, source: Path, target: Path) -> tuple[str, int]:
        hasher = hashlib.sha256()
        total = 0
        try:
            with source.open("rb") as input_file, target.open("xb") as output_file:
                while chunk := input_file.read(64 * 1024):
                    total += len(chunk)
                    if total > self.max_file_bytes:
                        raise AttachmentError("file_too_large", "附件超过文件大小限制。")
                    hasher.update(chunk)
                    output_file.write(chunk)
                output_file.flush()
                os.fsync(output_file.fileno())
        except AttachmentError:
            target.unlink(missing_ok=True)
            raise
        except FileExistsError as error:
            raise AttachmentError("quarantine_collision", "附件隔离目标已存在。") from error
        except OSError as error:
            target.unlink(missing_ok=True)
            raise AttachmentError("quarantine_copy_failed", "附件无法复制到Studio隔离区。") from error
        return hasher.hexdigest().upper(), total

    def _owned_path(self, record: AttachmentRecord) -> Path:
        path = (self.root / record.quarantine_relative_path).resolve()
        if path.parent != self.root or not path.name.startswith(f"{record.attachment_id}-") or not path.is_file():
            raise AttachmentError("owned_attachment_required", "Studio附件副本不可用。")
        return path

    def _inspect(self, target: Path, display_name: str) -> _Inspection:
        data = target.read_bytes()
        if not _extension_matches(Path(display_name), data):
            raise AttachmentError("extension_magic_mismatch", "附件扩展名与magic bytes不匹配。")
        category = _category(Path(display_name), data)
        if category == AttachmentCategory.IMAGE:
            width, height = self._image_dimensions(data)
            return _Inspection(category, False, "image_local_only", {"width": width, "height": height, "pixels": width * height, "delivery": "metadata_only_unverified"}, "image_metadata", f"Image exists: {width}x{height}; pixels withheld from AI.")
        if category == AttachmentCategory.PDF:
            pages = self._inspect_pdf(data)
            return _Inspection(category, False, "pdf_metadata_only", {"page_count": pages, "delivery": "metadata_only"}, "pdf_metadata", f"PDF exists with {pages} pages; local content is not sent by default.")
        if category in {AttachmentCategory.OFFICE, AttachmentCategory.SPREADSHEET} and _suffix(Path(display_name)) in _OFFICE_SUFFIXES:
            entries, xml_text = self._inspect_zip(data, depth=0)
            return _Inspection(category, False, "office_text_bounded", {"entry_count": len(entries), "delivery": "bounded_text"}, "office_text", _sanitize_evidence_text(xml_text))
        if category == AttachmentCategory.ARCHIVE:
            entries, _ = self._inspect_zip(data, depth=0)
            return _Inspection(category, False, "archive_metadata_only", {"entry_count": len(entries), "delivery": "metadata_only"}, "archive_metadata", f"ZIP exists with {len(entries)} inspected entries; contents withheld from AI.")
        if category == AttachmentCategory.SPREADSHEET:
            delimiter = "\t" if display_name.casefold().endswith(".tsv") else ","
            rows = self._csv_preview(data, delimiter, MAX_TEXT_ROWS)
            preview = _sanitize_evidence_text("\n".join("\t".join(row) for row in rows))
            return _Inspection(category, False, "table_text_bounded", {"preview_rows": len(rows), "preview_columns": max((len(row) for row in rows), default=0), "delivery": "bounded_text"}, "table_text", preview)
        if category in {AttachmentCategory.TEXT, AttachmentCategory.STRUCTURED}:
            text = data[:MAX_TEXT_BYTES].decode("utf-8", errors="strict")
            if category == AttachmentCategory.STRUCTURED:
                try:
                    import json
                    json.loads(text)
                except Exception as error:
                    raise AttachmentError("structured_text_invalid", "JSON附件无效或超过安全预览范围。") from error
            text = _sanitize_evidence_text(text)
            return _Inspection(category, False, "text_bounded", {"preview_bytes": len(text.encode('utf-8')), "delivery": "bounded_text"}, "text", text)
        if category in {AttachmentCategory.CONTAM_PROJECT, AttachmentCategory.CONTAM_ARTIFACT}:
            return _Inspection(category, False, "contam_metadata_only", {"delivery": "metadata_only"}, "contam_metadata", "CONTAM attachment exists; raw project and simulation content are withheld.")
        return _Inspection(AttachmentCategory.UNSUPPORTED, False, "unsupported_binary", {"delivery": "not_sent"}, None, None)

    @staticmethod
    def _image_dimensions(data: bytes) -> tuple[int, int]:
        width = height = 0
        if _is_png(data) and len(data) >= 24:
            width, height = struct.unpack(">II", data[16:24])
        elif _is_jpeg(data):
            index = 2
            while index + 9 < len(data):
                if data[index] != 0xFF:
                    index += 1
                    continue
                marker = data[index + 1]
                if marker in {0xD8, 0xD9}:
                    index += 2
                    continue
                length = int.from_bytes(data[index + 2:index + 4], "big")
                if length < 2 or index + 2 + length > len(data):
                    break
                if marker in {*range(0xC0, 0xC4), *range(0xC5, 0xC8), *range(0xC9, 0xCC), *range(0xCD, 0xD0)}:
                    height = int.from_bytes(data[index + 5:index + 7], "big")
                    width = int.from_bytes(data[index + 7:index + 9], "big")
                    break
                index += 2 + length
        if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
            raise AttachmentError("image_dimensions_invalid", "图片尺寸无法验证或超过像素限制。")
        return width, height

    @staticmethod
    def _inspect_pdf(data: bytes) -> int:
        lowered = data[:8 * 1024 * 1024].lower()
        if any(marker in lowered for marker in (b"/encrypt", b"/javascript", b"/embeddedfile")):
            raise AttachmentError("active_pdf_content", "加密、JavaScript或嵌入文件PDF被拒绝。")
        pages = lowered.count(b"/type /page") - lowered.count(b"/type /pages")
        if pages < 1:
            pages = 1
        if pages > MAX_PDF_PAGES:
            raise AttachmentError("pdf_page_limit", "PDF页数超过限制。")
        return pages

    def _inspect_zip(self, data: bytes, *, depth: int) -> tuple[tuple[ArchiveEntry, ...], str]:
        if depth > MAX_NESTING:
            raise AttachmentError("archive_nesting_limit", "ZIP嵌套深度超过限制。")
        try:
            archive = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as error:
            raise AttachmentError("malformed_archive", "ZIP容器损坏。") from error
        with archive:
            infos = archive.infolist()
            if len(infos) > MAX_ARCHIVE_ENTRIES:
                raise AttachmentError("archive_entry_limit", "ZIP条目数量超过限制。")
            names: set[str] = set()
            total = 0
            xml_parts: list[str] = []
            entries: list[ArchiveEntry] = []
            for index, info in enumerate(infos):
                name = info.filename.replace("\\", "/")
                normalized = unicodedata.normalize("NFC", name)
                pure = PurePosixPath(normalized)
                mode = (info.external_attr >> 16) & 0o177777
                if pure.is_absolute() or ".." in pure.parts or not normalized or _name_key(normalized) in names or info.flag_bits & 0x1 or stat.S_ISLNK(mode):
                    raise AttachmentError("archive_entry_rejected", "ZIP包含路径逃逸、Unicode冲突、符号链接或加密条目。")
                names.add(_name_key(normalized))
                total += info.file_size
                if total > MAX_ARCHIVE_EXPANDED_BYTES or (info.compress_size and info.file_size / info.compress_size > MAX_ARCHIVE_RATIO):
                    raise AttachmentError("archive_expansion_limit", "ZIP压缩比或展开大小超过限制。")
                lower = normalized.casefold()
                if lower.endswith(tuple(_EXECUTABLE_SUFFIXES)) or "vbaproject.bin" in lower:
                    raise AttachmentError("embedded_executable", "ZIP包含可执行内容或Office宏。")
                if lower.endswith(".rels"):
                    relationship = archive.read(info)[:MAX_TEXT_BYTES].decode("utf-8", errors="ignore").casefold()
                    if "targetmode=\"external\"" in relationship or "targetmode='external'" in relationship:
                        raise AttachmentError("external_office_link", "Office外部关系被拒绝。")
                if lower.endswith(".zip"):
                    if depth >= MAX_NESTING:
                        raise AttachmentError("archive_nesting_limit", "ZIP嵌套深度超过限制。")
                    if info.file_size <= MAX_TEXT_BYTES:
                        self._inspect_zip(archive.read(info), depth=depth + 1)
                if lower.endswith(".xml") and index < MAX_XML_FILES and sum(len(part) for part in xml_parts) < MAX_TEXT_BYTES:
                    raw = archive.read(info)[:MAX_TEXT_BYTES]
                    if b"<!doctype" in raw.lower() or b"<!entity" in raw.lower():
                        raise AttachmentError("office_xml_unsafe", "Office XML包含不受支持的实体声明。")
                    try:
                        root = ET.fromstring(raw)
                    except ET.ParseError:
                        root = None
                    if root is not None:
                        xml_parts.extend(item.text.strip() for item in root.iter() if item.text and item.text.strip())
                entries.append(ArchiveEntry(normalized, info.compress_size, info.file_size, None))
            if total > MAX_OFFICE_EXPANDED_BYTES and any(name.casefold().endswith(".xml") for name in names):
                raise AttachmentError("office_expansion_limit", "Office XML展开大小超过限制。")
            return tuple(entries), "\n".join(xml_parts)[:MAX_TEXT_BYTES]

    @staticmethod
    def _csv_preview(data: bytes, delimiter: str, max_rows: int) -> tuple[tuple[str, ...], ...]:
        try:
            reader = csv.reader(io.StringIO(data[:MAX_TEXT_BYTES].decode("utf-8", errors="strict")), delimiter=delimiter)
            rows: list[tuple[str, ...]] = []
            for row in reader:
                if len(row) > MAX_TEXT_COLUMNS:
                    raise AttachmentError("table_limit", "表格列数超过限制。")
                rows.append(tuple(cell[:MAX_CELL_CHARS] for cell in row))
                if len(rows) >= max_rows:
                    break
            return tuple(rows)
        except UnicodeDecodeError as error:
            raise AttachmentError("unsupported_encoding", "文本附件不是受支持的UTF-8编码。") from error


def sanitize_csv_cell(value: str) -> str:
    return "'" + value if value[:1] in {"=", "+", "-", "@"} else value
