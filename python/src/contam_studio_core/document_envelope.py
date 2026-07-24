from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path


SCHEMA_VERSION = "document_envelope.v1"
DEFAULT_MAX_BYTES = 16 * 1024 * 1024
DEFAULT_MAX_LINE_BYTES = 1024 * 1024


class DocumentEnvelopeError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class LineSpan:
    line_number: int
    byte_start: int
    byte_end: int

    def to_dict(self) -> dict[str, int]:
        return {
            "line_number": self.line_number,
            "byte_start": self.byte_start,
            "byte_end": self.byte_end,
        }


@dataclass(frozen=True, slots=True)
class DocumentEnvelope:
    schema_version: str
    source_sha256: str
    source_size_bytes: int
    encoding: str
    newline_style: str
    final_newline: bool
    line_spans: tuple[LineSpan, ...]
    opaque_sections: tuple[str, ...]
    profile: str
    editable: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "source_sha256": self.source_sha256,
            "source_size_bytes": self.source_size_bytes,
            "encoding": self.encoding,
            "newline_style": self.newline_style,
            "final_newline": self.final_newline,
            "line_spans": [span.to_dict() for span in self.line_spans],
            "opaque_sections": list(self.opaque_sections),
            "profile": self.profile,
            "editable": self.editable,
        }


def _newline_style(data: bytes) -> str:
    crlf = data.count(b"\r\n")
    lf = data.replace(b"\r\n", b"").count(b"\n")
    if crlf and lf:
        return "mixed"
    if crlf:
        return "crlf"
    if lf:
        return "lf"
    return "none"


def _line_spans(data: bytes, max_line_bytes: int) -> tuple[LineSpan, ...]:
    spans: list[LineSpan] = []
    start = 0
    line_number = 1
    for index, byte in enumerate(data):
        if byte == 0x0A:
            end = index + 1
            if end - start > max_line_bytes:
                raise DocumentEnvelopeError("line_too_large", "Document line exceeds the configured limit.")
            spans.append(LineSpan(line_number, start, end))
            line_number += 1
            start = end
    if start < len(data):
        if len(data) - start > max_line_bytes:
            raise DocumentEnvelopeError("line_too_large", "Document line exceeds the configured limit.")
        spans.append(LineSpan(line_number, start, len(data)))
    return tuple(spans)


def read_document_envelope(
    path: Path,
    *,
    max_bytes: int = DEFAULT_MAX_BYTES,
    max_line_bytes: int = DEFAULT_MAX_LINE_BYTES,
) -> DocumentEnvelope:
    try:
        data = path.read_bytes()
    except OSError as error:
        raise DocumentEnvelopeError("source_not_found", "Document could not be read.") from error
    if len(data) > max_bytes:
        raise DocumentEnvelopeError("source_too_large", "Document exceeds the configured byte limit.")
    try:
        data.decode("ascii", errors="strict")
    except UnicodeDecodeError as error:
        raise DocumentEnvelopeError("non_ascii_document", "Document encoding is not supported by the conservative envelope.") from error
    return DocumentEnvelope(
        schema_version=SCHEMA_VERSION,
        source_sha256=hashlib.sha256(data).hexdigest(),
        source_size_bytes=len(data),
        encoding="ascii",
        newline_style=_newline_style(data),
        final_newline=data.endswith(b"\n"),
        line_spans=_line_spans(data, max_line_bytes),
        opaque_sections=("whole_document",),
        profile="opaque_preservation_v1",
        editable=False,
    )
