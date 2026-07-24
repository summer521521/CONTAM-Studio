from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import csv
import hashlib
import io
from pathlib import Path, PurePosixPath
import struct
import zipfile
from uuid import uuid4
import xml.etree.ElementTree as ET


MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_BATCH_BYTES = 100 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_PDF_PAGES = 200
MAX_WORKBOOK_SHEETS = 20
MAX_ROWS = 100_000
MAX_COLUMNS = 200
MAX_CELLS = 1_000_000
MAX_ARCHIVE_ENTRIES = 1_000
MAX_ARCHIVE_EXPANDED_BYTES = 500 * 1024 * 1024
MAX_ARCHIVE_RATIO = 20
MAX_NESTING = 2
MAX_TEXT_BYTES = 4 * 1024 * 1024


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

    def safe_view(self) -> dict[str, object]:
        return {"attachment_id": self.attachment_id, "display_name": self.display_name, "category": self.category.value, "size_bytes": self.size_bytes, "sha256_prefix": self.sha256[:12], "status": self.status, "active_content_rejected": self.active_content_rejected}


@dataclass(frozen=True, slots=True)
class AttachmentEvidence:
    attachment_id: str
    evidence_id: str
    locator: str
    text: str
    sha256: str

    def to_dict(self) -> dict[str, object]:
        return {"attachment_id": self.attachment_id, "evidence_id": self.evidence_id, "locator": self.locator, "text": self.text, "sha256": self.sha256}


@dataclass(frozen=True, slots=True)
class ArchiveEntry:
    relative_name: str
    compressed_bytes: int
    expanded_bytes: int
    sha256: str | None

    def to_dict(self) -> dict[str, object]:
        return {"relative_name": self.relative_name, "compressed_bytes": self.compressed_bytes, "expanded_bytes": self.expanded_bytes, "sha256": self.sha256}


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _magic_category(path: Path, data: bytes) -> AttachmentCategory:
    suffix = path.suffix.casefold()
    if suffix in {".prj"}:
        return AttachmentCategory.CONTAM_PROJECT
    if suffix in {".sim", ".nfr", ".log", ".xlog"}:
        return AttachmentCategory.CONTAM_ARTIFACT
    if data.startswith(b"%PDF-") or suffix == ".pdf":
        return AttachmentCategory.PDF
    if data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff") or suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return AttachmentCategory.IMAGE
    if suffix in {".docx", ".pptx", ".odt"}:
        return AttachmentCategory.OFFICE
    if suffix in {".xlsx", ".xls", ".tsv", ".csv"}:
        return AttachmentCategory.SPREADSHEET
    if suffix in {".txt", ".md", ".json", ".xml", ".yaml", ".yml"}:
        return AttachmentCategory.STRUCTURED if suffix in {".json", ".xml", ".yaml", ".yml"} else AttachmentCategory.TEXT
    if suffix in {".zip", ".7z", ".tar", ".gz"} or data.startswith(b"PK\x03\x04"):
        return AttachmentCategory.ARCHIVE
    return AttachmentCategory.UNSUPPORTED


class AttachmentBroker:
    def __init__(self, quarantine_root: Path, *, max_file_bytes: int = MAX_FILE_BYTES, max_batch_bytes: int = MAX_BATCH_BYTES) -> None:
        self.root = Path(quarantine_root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.max_file_bytes = min(max_file_bytes, MAX_FILE_BYTES)
        self.max_batch_bytes = min(max_batch_bytes, MAX_BATCH_BYTES)
        self._records: dict[str, AttachmentRecord] = {}

    def ingest(self, source: Path) -> AttachmentRecord:
        raw_path = Path(source).expanduser()
        if raw_path.is_symlink():
            raise AttachmentError("source_link_rejected", "附件符号链接不受支持。")
        path = raw_path.resolve(strict=False)
        if not path.is_file():
            raise AttachmentError("source_missing", "附件来源文件不存在。")
        size = path.stat().st_size
        if size > self.max_file_bytes:
            raise AttachmentError("file_too_large", "附件超过文件大小限制。")
        data = path.read_bytes()
        category = _magic_category(path, data)
        if category == AttachmentCategory.UNSUPPORTED:
            raise AttachmentError("unsupported_binary", "附件格式不在安全分类范围。")
        active_rejected = False
        if category == AttachmentCategory.ARCHIVE:
            self._inspect_archive(data)
        if category == AttachmentCategory.PDF:
            active_rejected = self._inspect_pdf(data)
        if category == AttachmentCategory.OFFICE or path.suffix.casefold() in {".xlsx", ".xls", ".xlsm", ".doc", ".docm", ".ppt", ".pptm"}:
            active_rejected = self._inspect_office(data, path)
        if category == AttachmentCategory.IMAGE:
            self._inspect_image(data, path)
        attachment_id = str(uuid4())
        relative = f"{attachment_id}-{path.name}"
        target = self.root / relative
        target.write_bytes(data)
        record = AttachmentRecord(attachment_id, path.name[:160], category, len(data), _sha256(data), "quarantined", relative, active_rejected)
        self._records[attachment_id] = record
        return record

    def ingest_batch(self, sources: tuple[Path, ...]) -> tuple[AttachmentRecord, ...]:
        if not sources:
            raise AttachmentError("empty_batch", "附件批次不能为空。")
        total = 0
        records: list[AttachmentRecord] = []
        try:
            for source in sources:
                size = Path(source).stat().st_size
                total += size
                if total > self.max_batch_bytes:
                    raise AttachmentError("batch_too_large", "附件批次超过总大小限制。")
                records.append(self.ingest(source))
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
        target.relative_to(self.root)
        target.unlink(missing_ok=True)
        del self._records[attachment_id]

    def text_evidence(self, attachment_id: str, *, max_bytes: int = MAX_TEXT_BYTES) -> AttachmentEvidence:
        record = self.get(attachment_id)
        if record.category not in {AttachmentCategory.TEXT, AttachmentCategory.STRUCTURED, AttachmentCategory.PDF, AttachmentCategory.OFFICE, AttachmentCategory.SPREADSHEET}:
            raise AttachmentError("evidence_unsupported", "当前附件类别没有安全文本衍生物。")
        data = (self.root / record.quarantine_relative_path).read_bytes()
        if record.category == AttachmentCategory.PDF:
            text = data[:max_bytes].decode("latin-1", errors="replace")
        elif record.category in {AttachmentCategory.OFFICE, AttachmentCategory.SPREADSHEET}:
            text = self._extract_xml_text(data)[:max_bytes]
        else:
            try:
                text = data[:max_bytes].decode("utf-8", errors="strict")
            except UnicodeDecodeError as error:
                raise AttachmentError("unsupported_encoding", "文本附件不是受支持的UTF-8编码。") from error
        evidence_id = f"ev-{hashlib.sha256(f'{record.attachment_id}:text'.encode('ascii')).hexdigest()[:16]}"
        return AttachmentEvidence(record.attachment_id, evidence_id, "text:bounded", text, _sha256(text.encode("utf-8")))

    def spreadsheet_preview(self, attachment_id: str, *, max_rows: int = 100) -> tuple[tuple[str, ...], ...]:
        record = self.get(attachment_id)
        if record.category != AttachmentCategory.SPREADSHEET:
            raise AttachmentError("spreadsheet_required", "只有表格附件可预览表格数据。")
        if Path(record.display_name).suffix.casefold() not in {".csv", ".tsv"}:
            raise AttachmentError("spreadsheet_parser_unavailable", "当前候选不执行Office公式或二进制工作簿。")
        data = (self.root / record.quarantine_relative_path).read_bytes()
        delimiter = "\t" if record.display_name.casefold().endswith(".tsv") else ","
        rows = list(csv.reader(io.StringIO(data.decode("utf-8", errors="strict")), delimiter=delimiter))
        if len(rows) > MAX_ROWS or any(len(row) > MAX_COLUMNS for row in rows):
            raise AttachmentError("table_limit", "表格行列超过限制。")
        if len(rows) * (max((len(row) for row in rows), default=0)) > MAX_CELLS:
            raise AttachmentError("cell_limit", "表格非空单元格超过限制。")
        return tuple(tuple(cell[:4096] for cell in row) for row in rows[:max_rows])

    def enumerate_archive(self, attachment_id: str) -> tuple[ArchiveEntry, ...]:
        record = self.get(attachment_id)
        if record.category != AttachmentCategory.ARCHIVE:
            raise AttachmentError("archive_required", "只有ZIP附件可以枚举条目。")
        return self._inspect_archive((self.root / record.quarantine_relative_path).read_bytes())

    def _inspect_image(self, data: bytes, path: Path) -> None:
        width = height = None
        if data.startswith(b"\x89PNG") and len(data) >= 24:
            width, height = struct.unpack(">II", data[16:24])
        elif data.startswith(b"\xff\xd8\xff"):
            index = 2
            while index + 9 < len(data):
                if data[index] != 0xFF:
                    index += 1
                    continue
                marker = data[index + 1]
                length = int.from_bytes(data[index + 2 : index + 4], "big")
                if marker in range(0xC0, 0xC4) and index + 9 < len(data):
                    height = int.from_bytes(data[index + 5 : index + 7], "big")
                    width = int.from_bytes(data[index + 7 : index + 9], "big")
                    break
                index += max(length + 2, 2)
        if width is None or height is None or width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
            raise AttachmentError("image_dimensions_invalid", "图片尺寸无法验证或超过像素限制。")

    def _inspect_pdf(self, data: bytes) -> bool:
        lowered = data[: min(len(data), 8 * 1024 * 1024)].lower()
        if b"/encrypt" in lowered or b"/javascript" in lowered or b"/embeddedfile" in lowered:
            raise AttachmentError("active_pdf_content", "加密、JavaScript或嵌入文件PDF被拒绝。")
        if lowered.count(b"/type /page") > MAX_PDF_PAGES:
            raise AttachmentError("pdf_page_limit", "PDF页数超过限制。")
        return False

    def _inspect_office(self, data: bytes, path: Path) -> bool:
        if path.suffix.casefold() in {".xls", ".doc", ".ppt", ".xlsm", ".docm", ".pptm"}:
            raise AttachmentError("legacy_or_macro_office", "旧式或宏Office文件被拒绝。")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = [item.filename for item in archive.infolist()]
                if any("vbaProject.bin".casefold() in name.casefold() or "externalLinks".casefold() in name for name in names):
                    raise AttachmentError("active_office_content", "Office宏或外部链接被拒绝。")
        except zipfile.BadZipFile as error:
            raise AttachmentError("malformed_office", "Office容器损坏。") from error
        return False

    def _inspect_archive(self, data: bytes) -> tuple[ArchiveEntry, ...]:
        try:
            archive = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as error:
            raise AttachmentError("malformed_archive", "ZIP容器损坏。") from error
        with archive:
            infos = archive.infolist()
            if len(infos) > MAX_ARCHIVE_ENTRIES:
                raise AttachmentError("archive_entry_limit", "ZIP条目数量超过限制。")
            seen: set[str] = set()
            total = 0
            entries: list[ArchiveEntry] = []
            for info in infos:
                name = info.filename.replace("\\", "/")
                pure = PurePosixPath(name)
                if pure.is_absolute() or ".." in pure.parts or name.casefold() in seen or info.flag_bits & 0x1:
                    raise AttachmentError("archive_entry_rejected", "ZIP包含路径逃逸、重复、绝对路径或加密条目。")
                seen.add(name.casefold())
                total += info.file_size
                if total > MAX_ARCHIVE_EXPANDED_BYTES or (info.compress_size and info.file_size / info.compress_size > MAX_ARCHIVE_RATIO):
                    raise AttachmentError("archive_expansion_limit", "ZIP压缩比或展开大小超过限制。")
                if name.casefold().endswith((".exe", ".dll", ".msi", ".bat", ".ps1", ".vbs")):
                    raise AttachmentError("embedded_executable", "ZIP包含可执行内容。")
                entries.append(ArchiveEntry(name, info.compress_size, info.file_size, None))
            return tuple(entries)

    @staticmethod
    def _extract_xml_text(data: bytes) -> str:
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                chunks: list[str] = []
                for info in archive.infolist()[:MAX_WORKBOOK_SHEETS * 100]:
                    if info.filename.casefold().endswith((".xml", ".rels")):
                        try:
                            root = ET.fromstring(archive.read(info)[:MAX_TEXT_BYTES])
                        except (ET.ParseError, KeyError):
                            continue
                        chunks.extend(item.text or "" for item in root.iter() if item.text)
                return "\n".join(chunks)
        except zipfile.BadZipFile as error:
            raise AttachmentError("malformed_office", "Office容器损坏。") from error


def sanitize_csv_cell(value: str) -> str:
    return "'" + value if value[:1] in {"=", "+", "-", "@"} else value
