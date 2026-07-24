"""CONTAM Studio's minimal Python domain core."""

from .models import Diagnostic, ProjectInspection, ProjectMetadata, ZoneInspection
from .document_envelope import DocumentEnvelope, DocumentEnvelopeError, LineSpan, read_document_envelope
from .semantic_graph import GraphDiagnostic, GraphObject, GraphValidation, ReferenceEdge, validate_reference_graph
from .companion_boundary import CompanionBinding, CompanionDeclaration, CompanionError, bind_companions
from .domain_network import AirflowProjection, Endpoint, FlowElement, FlowPath, NetworkProjectionError, project_airflow, read_and_project_airflow
from .domain_schedule import DaySchedule, ScheduleError, SchedulePage, TimePoint, WeekSchedule, make_day_schedule, make_week_schedule, page_day_schedule
from .domain_sources import SourceProjection, SourceProjectionError, SpeciesProjection, make_source_projection, parse_species_section
from .prj_sections import PrjSection, PrjSectionError, PrjSectionsDocument, read_prj_sections
from .draft_revisions import RevisionError, RevisionRecord, RevisionStore, ScenarioCatalog, ScenarioRecord, TemplateManifest, load_trusted_template
from .artifact_store import ArtifactError, ArtifactManifest, OwnedArtifactStore
from .process_controller import ProcessController, ProcessError, ProcessEvidence, ProcessLease, ProcessStatus
from .result_store import ComparisonRecord, ResultError, ResultPage, ResultRecord, ResultSample, ResultStatistics, compare_results, compute_statistics, create_result, page_result
from .run_history import RunHistoryError, RunRecord, make_run_record, write_run_record
from .study_report import ReportModel, StudyError, SweepCase, SweepPlan, make_report_model, make_sweep_plan, render_report_html, write_report
from .tool_registry import ToolError, ToolIdentity, ToolRecord, ToolRegistry, ToolState
from .ai_gateway import AiError, AiEvidenceBundle, AiTrace, ApprovalBroker, ApprovalRecord, ApprovalRisk, DisclosureClass, DomainToolGateway, EvidenceItem, SimulationPlan, make_evidence_bundle, make_simulation_plan, write_ai_trace
from .attachment_broker import AttachmentBroker, AttachmentCategory, AttachmentError, AttachmentEvidence, AttachmentRecord, ArchiveEntry, sanitize_csv_cell

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
    "AirflowProjection",
    "CompanionBinding",
    "CompanionDeclaration",
    "CompanionError",
    "CompatibilityResult",
    "CompatibilityStatus",
    "DaySchedule",
    "DomainAudit",
    "Endpoint",
    "FlowElement",
    "FlowPath",
    "NetworkProjectionError",
    "PrjSection",
    "PrjSectionError",
    "PrjSectionsDocument",
    "ScheduleError",
    "SchedulePage",
    "SourceProjection",
    "SourceProjectionError",
    "SpeciesProjection",
    "TimePoint",
    "WeekSchedule",
    "audit_domain",
    "bind_companions",
    "classify_project",
    "make_day_schedule",
    "make_source_projection",
    "make_week_schedule",
    "page_day_schedule",
    "parse_species_section",
    "project_airflow",
    "read_and_project_airflow",
    "read_prj_sections",
    "RevisionError",
    "RevisionRecord",
    "RevisionStore",
    "ScenarioCatalog",
    "ScenarioRecord",
    "TemplateManifest",
    "load_trusted_template",
    "ArtifactError",
    "ArtifactManifest",
    "ComparisonRecord",
    "OwnedArtifactStore",
    "ProcessController",
    "ProcessError",
    "ProcessEvidence",
    "ProcessLease",
    "ProcessStatus",
    "ReportModel",
    "ResultError",
    "ResultPage",
    "ResultRecord",
    "ResultSample",
    "ResultStatistics",
    "RunHistoryError",
    "RunRecord",
    "StudyError",
    "SweepCase",
    "SweepPlan",
    "ToolError",
    "ToolIdentity",
    "ToolRecord",
    "ToolRegistry",
    "ToolState",
    "compare_results",
    "compute_statistics",
    "create_result",
    "make_report_model",
    "make_run_record",
    "make_sweep_plan",
    "page_result",
    "render_report_html",
    "write_report",
    "write_run_record",
    "AiError",
    "AiEvidenceBundle",
    "AiTrace",
    "ApprovalBroker",
    "ApprovalRecord",
    "ApprovalRisk",
    "ArchiveEntry",
    "AttachmentBroker",
    "AttachmentCategory",
    "AttachmentError",
    "AttachmentEvidence",
    "AttachmentRecord",
    "DisclosureClass",
    "DomainToolGateway",
    "EvidenceItem",
    "SimulationPlan",
    "make_evidence_bundle",
    "make_simulation_plan",
    "sanitize_csv_cell",
    "write_ai_trace",
]


def __getattr__(name: str):
    if name in {"CompatibilityResult", "CompatibilityStatus", "DomainAudit", "audit_domain", "classify_project"}:
        from .compatibility import CompatibilityResult, CompatibilityStatus, DomainAudit, audit_domain, classify_project

        return {
            "CompatibilityResult": CompatibilityResult,
            "CompatibilityStatus": CompatibilityStatus,
            "DomainAudit": DomainAudit,
            "audit_domain": audit_domain,
            "classify_project": classify_project,
        }[name]
    raise AttributeError(name)
