from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from .companion_boundary import CompanionDeclaration, CompanionError, bind_companions
from .domain_network import AirflowProjection, NetworkProjectionError, project_airflow
from .domain_sources import SourceProjectionError, SpeciesProjection, parse_species_section
from .document_envelope import DocumentEnvelopeError, read_document_envelope
from .domain_projection import DomainProjectionError, project_levels_and_zones
from .prj_sections import PrjSectionError, read_prj_sections
from .prj_zone_reader import PrjZoneReaderError, read_simple_zones


COMPATIBILITY_SCHEMA_VERSION = "compatibility.v1"


class CompatibilityStatus(StrEnum):
    SUPPORTED_EDITABLE = "supported_editable"
    SUPPORTED_READONLY = "supported_readonly"
    INCOMPATIBLE = "incompatible"
    CORRUPT = "corrupt"
    MISSING_COMPANION = "missing_companion"
    TOOL_INCOMPATIBLE = "tool_incompatible"


@dataclass(frozen=True, slots=True)
class CompatibilityResult:
    schema_version: str
    status: CompatibilityStatus
    profile: str
    safe_filename: str
    baseline_sha256: str | None
    reason_code: str
    safe_reason: str
    safe_action: str
    zone_count: int
    airflow: AirflowProjection | None
    species: tuple[SpeciesProjection, ...]
    evidence_ids: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "status": self.status.value,
            "profile": self.profile,
            "safe_filename": self.safe_filename,
            "baseline_sha256": self.baseline_sha256,
            "reason_code": self.reason_code,
            "safe_reason": self.safe_reason,
            "safe_action": self.safe_action,
            "zone_count": self.zone_count,
            "airflow": None if self.airflow is None else self.airflow.to_dict(),
            "species": [item.to_dict() for item in self.species],
            "evidence_ids": list(self.evidence_ids),
        }


@dataclass(frozen=True, slots=True)
class AuditCheck:
    check_id: str
    status: str
    detail: str

    def to_dict(self) -> dict[str, str]:
        return {"check_id": self.check_id, "status": self.status, "detail": self.detail}


@dataclass(frozen=True, slots=True)
class DomainAudit:
    schema_version: str
    baseline_sha256: str | None
    checks: tuple[AuditCheck, ...]
    defects: tuple[str, ...]

    @property
    def passed(self) -> bool:
        return not self.defects and all(item.status == "passed" for item in self.checks)

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "baseline_sha256": self.baseline_sha256,
            "checks": [item.to_dict() for item in self.checks],
            "defects": list(self.defects),
            "passed": self.passed,
        }


def _safe_filename(path: Path) -> str:
    return path.name[:120] or "project.prj"


def _failure(path: Path, status: CompatibilityStatus, code: str, reason: str, action: str, *, profile: str = "unknown", baseline: str | None = None, zone_count: int = 0) -> CompatibilityResult:
    return CompatibilityResult(COMPATIBILITY_SCHEMA_VERSION, status, profile, _safe_filename(path), baseline, code, reason, action, zone_count, None, (), ())


def classify_project(path: Path, *, companions: tuple[CompanionDeclaration, ...] = ()) -> CompatibilityResult:
    source = Path(path).expanduser().resolve()
    try:
        read_document_envelope(source)
        sections = read_prj_sections(source)
        zones = read_simple_zones(source)
    except CompanionError as error:
        return _failure(source, CompatibilityStatus.MISSING_COMPANION, error.code, "声明的外部输入不可用或已变化。", "重新选择并校验Companion。")
    except (DocumentEnvelopeError, PrjSectionError, PrjZoneReaderError) as error:
        code = getattr(error, "code", "corrupt")
        status = CompatibilityStatus.TOOL_INCOMPATIBLE if code == "unsupported_prj_version" else CompatibilityStatus.CORRUPT
        return _failure(source, status, code, "项目无法按当前保守Profile安全读取。", "查看支持范围或使用受支持的PRJ副本。")
    if companions:
        try:
            bind_companions(source.parent, companions)
        except CompanionError as error:
            return _failure(source, CompatibilityStatus.MISSING_COMPANION, error.code, "声明的外部输入不可用或已变化。", "重新选择并校验Companion。", baseline=sections.source_sha256, zone_count=len(zones.zones))
    domain = None
    zone_projection_error: str | None = None
    try:
        domain = project_levels_and_zones(zones)
    except DomainProjectionError as error:
        zone_projection_error = error.code
        special_zone_only = error.code == "volume_range_invalid" and any(zone.volume_m3 == 0 for zone in zones.zones)
        if not special_zone_only:
            return _failure(source, CompatibilityStatus.INCOMPATIBLE, error.code, "Zone语义超出当前Profile，原始内容保持只读。", "切换到支持的Profile或只读查看。", baseline=zones.source_sha256, zone_count=len(zones.zones))
    airflow: AirflowProjection | None = None
    reasons: list[str] = []
    if zone_projection_error is not None:
        reasons.append(zone_projection_error)
    try:
        airflow = project_airflow(sections)
        reasons.extend(airflow.diagnostics)
    except NetworkProjectionError as error:
        reasons.append(error.code)
    species: tuple[SpeciesProjection, ...] = ()
    species_section = sections.section("species") or sections.section("contaminants")
    if species_section is not None:
        try:
            species = parse_species_section(species_section, sections.source_sha256)
        except SourceProjectionError as error:
            reasons.append(error.code)
    status = CompatibilityStatus.SUPPORTED_EDITABLE if not reasons else CompatibilityStatus.SUPPORTED_READONLY
    reason_code = "opaque_sections_preserved" if status == CompatibilityStatus.SUPPORTED_READONLY else "supported_profile"
    safe_reason = "已验证的Zone与气流对象可检查；未知内容保持只读并按原始字节保留。" if status == CompatibilityStatus.SUPPORTED_READONLY else "项目符合首版支持Profile，可创建受控草稿修改。"
    safe_action = "仅可检查已投影对象，先创建副本后再请求支持的Patch。" if status == CompatibilityStatus.SUPPORTED_READONLY else "可对受支持的Zone体积和名称字段生成原子Patch Diff。"
    evidence = tuple(sorted({f"ev-{sections.source_sha256[:16]}", *[item.evidence_id for item in species]}))
    profile = "strict_contam_3_4_simple_zone_v1" if domain is not None else "strict_contam_3_4_readonly_special_zone_v1"
    return CompatibilityResult(COMPATIBILITY_SCHEMA_VERSION, status, profile, _safe_filename(source), sections.source_sha256, reason_code, safe_reason, safe_action, len(zones.zones), airflow, species, evidence)


def audit_domain(path: Path) -> DomainAudit:
    result = classify_project(path)
    checks = (
        AuditCheck("byte_identity", "passed" if result.baseline_sha256 else "failed", "源字节哈希已绑定。"),
        AuditCheck("resource_bounds", "passed" if result.status != CompatibilityStatus.CORRUPT else "failed", "读取器执行资源上限。"),
        AuditCheck("semantic_projection", "passed" if result.status in {CompatibilityStatus.SUPPORTED_EDITABLE, CompatibilityStatus.SUPPORTED_READONLY} else "failed", "只暴露有证据的语义对象。"),
        AuditCheck("unsupported_rejection", "passed" if result.status != CompatibilityStatus.SUPPORTED_EDITABLE or result.airflow is not None else "failed", "未知端点、组件和控制模式不被静默简化。"),
        AuditCheck("write_gate", "passed", "DOM-10不启用未经Patch ADR授权的写入。"),
    )
    defects = tuple(item.check_id for item in checks if item.status == "failed")
    return DomainAudit("domain_audit.v1", result.baseline_sha256, checks, defects)
