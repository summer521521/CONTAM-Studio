from __future__ import annotations

from pathlib import Path

import pytest

from contam_studio_core.document_envelope import DocumentEnvelopeError, read_document_envelope


def test_envelope_records_lf_spans_and_preserves_noop_identity(tmp_path: Path) -> None:
    source = tmp_path / "lf.prj"
    data = b"header\nbody\n"
    source.write_bytes(data)
    envelope = read_document_envelope(source)
    assert envelope.encoding == "ascii"
    assert envelope.newline_style == "lf"
    assert envelope.final_newline is True
    assert envelope.source_size_bytes == len(data)
    assert envelope.source_sha256
    assert envelope.line_spans[-1].byte_end == len(data)
    assert envelope.opaque_sections == ("whole_document",)
    assert envelope.editable is False


@pytest.mark.parametrize(
    ("data", "style", "final_newline"),
    [(b"a\r\nb\r\n", "crlf", True), (b"a\r\nb\n", "mixed", True), (b"a\nlast", "lf", False), (b"single", "none", False)],
)
def test_envelope_distinguishes_newline_evidence(data: bytes, style: str, final_newline: bool, tmp_path: Path) -> None:
    source = tmp_path / "newlines.prj"
    source.write_bytes(data)
    envelope = read_document_envelope(source)
    assert envelope.newline_style == style
    assert envelope.final_newline is final_newline


def test_envelope_rejects_non_ascii_and_resource_overflow(tmp_path: Path) -> None:
    source = tmp_path / "unsafe.prj"
    source.write_bytes("中文".encode("utf-8"))
    with pytest.raises(DocumentEnvelopeError, match="encoding") as error:
        read_document_envelope(source)
    assert error.value.code == "non_ascii_document"
    source.write_bytes(b"a" * 20)
    with pytest.raises(DocumentEnvelopeError, match="byte limit") as error:
        read_document_envelope(source, max_bytes=19)
    assert error.value.code == "source_too_large"


def test_envelope_rejects_oversized_line(tmp_path: Path) -> None:
    source = tmp_path / "line.prj"
    source.write_bytes(b"a" * 10)
    with pytest.raises(DocumentEnvelopeError) as error:
        read_document_envelope(source, max_line_bytes=9)
    assert error.value.code == "line_too_large"
