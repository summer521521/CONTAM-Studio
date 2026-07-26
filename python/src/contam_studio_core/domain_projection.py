from __future__ import annotations

from dataclasses import dataclass
import hashlib
import math
from uuid import NAMESPACE_URL, uuid5

from .prj_zone_models import PrjZoneDocument, ZoneDocumentRecord


SCHEMA_VERSION = "domain_projection.v1"
PROFILE = "strict_contam_3_4_simple_zone_v1"
MAX_LEVELS = 512
MAX_ZONES = 100_000
MAX_LABEL_LENGTH = 80


class DomainProjectionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class EvidenceRef:
    evidence_id: str
    source_line_number: int

    def to_dict(self) -> dict[str, int | str]:
        return {"evidence_id": self.evidence_id, "source_line_number": self.source_line_number}


@dataclass(frozen=True, slots=True)
class FieldCapability:
    state: str
    unit: str | None
    evidence: EvidenceRef

    def to_dict(self) -> dict[str, object]:
        return {
            "state": self.state,
            "unit": self.unit,
            "evidence": self.evidence.to_dict(),
        }


@dataclass(frozen=True, slots=True)
class LevelProjection:
    level_id: str
    level_number: int
    label: str
    zone_ids: tuple[str, ...]
    capability: str
    evidence: EvidenceRef

    def to_dict(self) -> dict[str, object]:
        return {
            "level_id": self.level_id,
            "level_number": self.level_number,
            "label": self.label,
            "zone_ids": list(self.zone_ids),
            "capability": self.capability,
            "evidence": self.evidence.to_dict(),
        }


@dataclass(frozen=True, slots=True)
class ZoneProjection:
    zone_id: str
    contam_number: int
    label: str
    level_id: str
    fields: dict[str, object]
    capabilities: dict[str, FieldCapability]
    evidence: EvidenceRef

    def to_dict(self) -> dict[str, object]:
        return {
            "zone_id": self.zone_id,
            "contam_number": self.contam_number,
            "label": self.label,
            "level_id": self.level_id,
            "fields": self.fields,
            "capabilities": {key: value.to_dict() for key, value in sorted(self.capabilities.items())},
            "evidence": self.evidence.to_dict(),
        }


@dataclass(frozen=True, slots=True)
class DomainProjection:
    schema_version: str
    profile: str
    baseline_sha256: str
    levels: tuple[LevelProjection, ...]
    zones: tuple[ZoneProjection, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "profile": self.profile,
            "baseline_sha256": self.baseline_sha256,
            "levels": [level.to_dict() for level in self.levels],
            "zones": [zone.to_dict() for zone in self.zones],
        }


def _require_sha256(value: str) -> str:
    if len(value) != 64 or any(char not in "0123456789abcdefABCDEF" for char in value):
        raise DomainProjectionError("invalid_baseline_hash", "Baseline identity is not a SHA-256 digest.")
    return value.lower()


def _stable_id(baseline_sha256: str, category: str, external_identity: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"contam-studio:{baseline_sha256}:{category}:{external_identity}"))


def _evidence(baseline_sha256: str, source_line_number: int) -> EvidenceRef:
    digest = hashlib.sha256(f"{baseline_sha256}:{source_line_number}".encode("ascii")).hexdigest()[:16]
    return EvidenceRef(f"ev-{digest}", source_line_number)


def _zone_projection(document: PrjZoneDocument, zone: ZoneDocumentRecord, level_id: str) -> ZoneProjection:
    if zone.contam_number <= 0 or zone.level_number < 0:
        raise DomainProjectionError("zone_range_invalid", "Zone number and level number must be non-negative profile values.")
    if not zone.name or len(zone.name) > MAX_LABEL_LENGTH or not zone.name.isascii() or any(char.isspace() for char in zone.name):
        raise DomainProjectionError("zone_label_invalid", "Zone label is outside the supported ASCII token profile.")
    if not math.isfinite(zone.relative_height) or abs(zone.relative_height) > 1_000_000:
        raise DomainProjectionError("relative_height_invalid", "Zone relative height exceeds the supported finite range.")
    if not math.isfinite(zone.volume_m3) or not 0 < zone.volume_m3 <= 1_000_000_000_000:
        raise DomainProjectionError("volume_range_invalid", "Zone volume is outside the supported finite range.")
    evidence = _evidence(document.source_sha256, zone.source_line_number)
    zone_id = _stable_id(document.source_sha256, "zone", f"{zone.contam_number}:{zone.source_line_number}")
    capabilities = {
        "name": FieldCapability("editable_via_patch", None, evidence),
        "flags": FieldCapability("read_only", None, evidence),
        "level_number": FieldCapability("read_only", None, evidence),
        "relative_height": FieldCapability("read_only", "m", evidence),
        "volume_m3": FieldCapability("editable_via_patch", "m3", evidence),
    }
    return ZoneProjection(
        zone_id=zone_id,
        contam_number=zone.contam_number,
        label=zone.name,
        level_id=level_id,
        fields={
            "flags": zone.flags,
            "level_number": zone.level_number,
            "relative_height": zone.relative_height,
            "volume_m3": zone.volume_m3,
        },
        capabilities=capabilities,
        evidence=evidence,
    )


def project_levels_and_zones(document: PrjZoneDocument) -> DomainProjection:
    baseline_sha256 = _require_sha256(document.source_sha256)
    if document.reader_mode != PROFILE:
        raise DomainProjectionError("profile_incompatible", "The document reader profile is not supported by this projection.")
    if len(document.zones) > MAX_ZONES:
        raise DomainProjectionError("zone_limit_exceeded", "The Zone projection exceeds its resource limit.")
    by_level: dict[int, list[ZoneDocumentRecord]] = {}
    for zone in document.zones:
        by_level.setdefault(zone.level_number, []).append(zone)
    if len(by_level) > MAX_LEVELS:
        raise DomainProjectionError("level_limit_exceeded", "The Level projection exceeds its resource limit.")
    levels: list[LevelProjection] = []
    zones: list[ZoneProjection] = []
    for level_number in sorted(by_level):
        level_zones = sorted(by_level[level_number], key=lambda item: (item.contam_number, item.source_line_number))
        level_id = _stable_id(baseline_sha256, "level", str(level_number))
        level_evidence = _evidence(baseline_sha256, min(zone.source_line_number for zone in level_zones))
        projected = tuple(_zone_projection(document, zone, level_id) for zone in level_zones)
        levels.append(LevelProjection(level_id, level_number, f"Level {level_number}", tuple(zone.zone_id for zone in projected), "read_only", level_evidence))
        zones.extend(projected)
    return DomainProjection(SCHEMA_VERSION, PROFILE, baseline_sha256, tuple(levels), tuple(zones))
