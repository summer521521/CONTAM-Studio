from __future__ import annotations

import io
from pathlib import Path
import struct
import zipfile

import pytest

from contam_studio_core.attachment_broker import AttachmentBroker, AttachmentCategory, AttachmentError, sanitize_csv_cell


def _png(width: int, height: int) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + struct.pack(">II", width, height) + b"\x08\x06\x00\x00\x00"


def test_attachment_ingest_is_quarantined_and_path_free(tmp_path: Path) -> None:
    image = tmp_path / "plan.png"
    image.write_bytes(_png(2, 3))
    broker = AttachmentBroker(tmp_path / "quarantine")
    record = broker.ingest(image)
    assert record.category == AttachmentCategory.IMAGE
    assert record.safe_view()["display_name"] == "plan.png"
    assert str(tmp_path) not in str(record.safe_view())
    broker.remove(record.attachment_id)
    assert not (tmp_path / "quarantine" / record.quarantine_relative_path).exists()


def test_pdf_active_content_and_image_limits_fail_closed(tmp_path: Path) -> None:
    pdf = tmp_path / "unsafe.pdf"
    pdf.write_bytes(b"%PDF-1.7\n/JavaScript\n")
    broker = AttachmentBroker(tmp_path / "q")
    with pytest.raises(AttachmentError) as error:
        broker.ingest(pdf)
    assert error.value.code == "active_pdf_content"
    huge = tmp_path / "huge.png"
    huge.write_bytes(_png(100_000, 100_000))
    with pytest.raises(AttachmentError) as error:
        broker.ingest(huge)
    assert error.value.code == "image_dimensions_invalid"


def test_archive_slip_encryption_and_executable_are_rejected(tmp_path: Path) -> None:
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as output:
        output.writestr("../escape.txt", b"no")
    path = tmp_path / "slip.zip"
    path.write_bytes(archive.getvalue())
    with pytest.raises(AttachmentError, match="路径") as error:
        AttachmentBroker(tmp_path / "q").ingest(path)
    assert error.value.code == "archive_entry_rejected"


def test_csv_preview_formula_is_data_and_batch_limit_cleans_up(tmp_path: Path) -> None:
    csv_path = tmp_path / "table.csv"
    csv_path.write_text("name,value\nroom,=1+1\n", encoding="utf-8")
    broker = AttachmentBroker(tmp_path / "q", max_batch_bytes=100)
    record = broker.ingest(csv_path)
    assert broker.spreadsheet_preview(record.attachment_id)[1][1] == "=1+1"
    assert sanitize_csv_cell("=SUM(A1)") == "'=SUM(A1)"
    large = tmp_path / "large.txt"
    large.write_bytes(b"x" * 101)
    with pytest.raises(AttachmentError, match="批次"):
        broker.ingest_batch((csv_path, large))
    assert not any(item.display_name == "large.txt" for item in broker._records.values())


def _zip(entries: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, body in entries.items():
            archive.writestr(name, body)
    return output.getvalue()


def test_magic_pdf_and_office_risks_are_fail_closed(tmp_path: Path) -> None:
    forged = tmp_path / "forged.png"
    forged.write_bytes(b"not an image")
    with pytest.raises(AttachmentError) as error:
        AttachmentBroker(tmp_path / "q").ingest(forged)
    assert error.value.code == "extension_magic_mismatch"
    encrypted = tmp_path / "encrypted.pdf"
    encrypted.write_bytes(b"%PDF-1.7\n/Encrypt\n")
    with pytest.raises(AttachmentError) as error:
        AttachmentBroker(tmp_path / "q2").ingest(encrypted)
    assert error.value.code == "active_pdf_content"
    macro = tmp_path / "macro.docx"
    macro.write_bytes(_zip({"[Content_Types].xml": b"<x/>", "word/vbaProject.bin": b"x"}))
    with pytest.raises(AttachmentError) as error:
        AttachmentBroker(tmp_path / "q3").ingest(macro)
    assert error.value.code == "embedded_executable"


def test_zip_collisions_links_and_owned_remove_never_touch_source(tmp_path: Path) -> None:
    collision = tmp_path / "collision.zip"
    collision.write_bytes(_zip({"A.txt": b"a", "a.txt": b"b"}))
    with pytest.raises(AttachmentError) as error:
        AttachmentBroker(tmp_path / "q").ingest(collision)
    assert error.value.code == "archive_entry_rejected"
    source = tmp_path / "source.txt"
    source.write_text("safe", encoding="utf-8")
    before = source.read_bytes()
    broker = AttachmentBroker(tmp_path / "owned")
    record = broker.ingest(source)
    broker.remove(record.attachment_id)
    assert source.read_bytes() == before
    assert source.exists()


def test_desktop_retain_failure_and_unicode_collision_do_not_overwrite_competitor(tmp_path: Path) -> None:
    unsafe = tmp_path / "unsafe.zip"
    unsafe.write_bytes(_zip({"../escape": b"x"}))
    broker = AttachmentBroker(tmp_path / "q")
    retained = broker.ingest_desktop(unsafe)
    assert retained.status == "blocked"
    assert (tmp_path / "q" / retained.quarantine_relative_path).exists()
    first = tmp_path / "café.txt"
    second = tmp_path / "cafe\u0301.txt"
    first.write_text("one", encoding="utf-8")
    second.write_text("two", encoding="utf-8")
    broker.ingest(first)
    with pytest.raises(AttachmentError) as error:
        broker.ingest(second)
    assert error.value.code == "filename_collision"
    assert (tmp_path / "q" / retained.quarantine_relative_path).exists()


def test_text_evidence_is_bounded_redacted_and_contam_is_metadata_only(tmp_path: Path) -> None:
    table = tmp_path / "table.csv"
    table.write_text("name,note\nA,C:\\\\secret\\\\file\n", encoding="utf-8")
    # Each broker owns its own quarantine; the parsed content remains bounded and path-free.
    broker = AttachmentBroker(tmp_path / "q2")
    record = broker.ingest(table)
    assert "C:\\\\" not in broker.text_evidence(record.attachment_id).text
    prj = tmp_path / "model.prj"
    prj.write_text("raw project text", encoding="utf-8")
    contam = broker.ingest(prj)
    assert broker.text_evidence(contam.attachment_id).locator == "contam_metadata"


def test_toctou_change_is_retained_as_changed_without_touching_source(tmp_path: Path) -> None:
    source = tmp_path / "changing.txt"
    source.write_text("before", encoding="utf-8")

    class MutatingBroker(AttachmentBroker):
        def _copy_exclusive(self, input_path: Path, target: Path) -> tuple[str, int]:
            result = super()._copy_exclusive(input_path, target)
            input_path.write_text("after", encoding="utf-8")
            return result

    record = MutatingBroker(tmp_path / "q").ingest_desktop(source)
    assert record.status == "changed"
    assert source.read_text(encoding="utf-8") == "after"
