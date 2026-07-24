"""CONTAM Studio's minimal Python domain core."""

from .models import Diagnostic, ProjectInspection, ProjectMetadata, ZoneInspection
from .document_envelope import DocumentEnvelope, DocumentEnvelopeError, LineSpan, read_document_envelope

__all__ = [
    "Diagnostic",
    "DocumentEnvelope",
    "DocumentEnvelopeError",
    "LineSpan",
    "ProjectInspection",
    "ProjectMetadata",
    "ZoneInspection",
    "read_document_envelope",
]
