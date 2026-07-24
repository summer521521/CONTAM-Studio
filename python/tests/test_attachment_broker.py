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
