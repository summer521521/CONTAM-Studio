"""CONTAM Studio's minimal Python domain core."""

from .models import Diagnostic, ProjectInspection, ProjectMetadata, ZoneInspection
from .document_envelope import DocumentEnvelope, DocumentEnvelopeError, LineSpan, read_document_envelope
from .semantic_graph import GraphDiagnostic, GraphObject, GraphValidation, ReferenceEdge, validate_reference_graph

__all__ = [
    "Diagnostic",
    "DocumentEnvelope",
    "DocumentEnvelopeError",
    "GraphDiagnostic",
    "GraphObject",
    "GraphValidation",
    "LineSpan",
    "ProjectInspection",
    "ProjectMetadata",
    "ReferenceEdge",
    "ZoneInspection",
    "read_document_envelope",
    "validate_reference_graph",
]
