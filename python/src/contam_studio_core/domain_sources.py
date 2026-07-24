from __future__ import annotations

from dataclasses import dataclass
import math
from uuid import NAMESPACE_URL, uuid5

from .domain_schedule import DaySchedule
from .prj_sections import PrjSection
from .strict_numeric import parse_ascii_finite_float


SOURCE_SCHEMA_VERSION = "domain_sources.v1"


class SourceProjectionError(Exception):
    def __init__(self, code: str, message: str, line_number: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.line_number = line_number


@dataclass(frozen=True, slots=True)
class SpeciesProjection:
    species_id: str
    contam_number: int
    name: str
    molecular_weight: float
    source_line_number: int
    capability: str
    evidence_id: str

    def to_dict(self) -> dict[str, object]:
        return {
            "species_id": self.species_id,
            "contam_number": self.contam_number,
            "name": self.name,
            "molecular_weight": self.molecular_weight,
            "source_line_number": self.source_line_number,
            "capability": self.capability,
            "evidence_id": self.evidence_id,
        }


@dataclass(frozen=True, slots=True)
class SourceProjection:
    source_id: str
    kind: str
    zone_number: int | None
    species_id: str | None
    rate: float
    unit: str
    schedule_id: str | None
    interpretation: str
    capability: str
    evidence_id: str

    def to_dict(self) -> dict[str, object]:
        return {
            "source_id": self.source_id,
            "kind": self.kind,
            "zone_number": self.zone_number,
            "species_id": self.species_id,
            "rate": self.rate,
            "unit": self.unit,
            "schedule_id": self.schedule_id,
            "interpretation": self.interpretation,
            "capability": self.capability,
            "evidence_id": self.evidence_id,
        }


SUPPORTED_SOURCE_KINDS = frozenset({"source_rate", "occupancy_proxy", "outdoor_concentration"})
SUPPORTED_SOURCE_UNITS = frozenset({"kg/s", "mg/s", "kg/m3", "mg/m3"})


def _float(token: str, line: int) -> float:
    try:
        value = parse_ascii_finite_float(token)
    except ValueError as error:
        raise SourceProjectionError("invalid_source_number", "污染物数值不是有限ASCII数字。", line) from error
    if abs(value) > 1e15:
        raise SourceProjectionError("source_number_out_of_range", "污染物数值超出安全范围。", line)
    return value


def parse_species_section(section: PrjSection, baseline_sha256: str) -> tuple[SpeciesProjection, ...]:
    if section.declared_count == 0:
        return ()
    species: list[SpeciesProjection] = []
    numbers: set[int] = set()
    for line in section.lines:
        tokens = line.text.partition("!")[0].split()
        if not tokens or not tokens[0].lstrip("+").isdigit():
            continue
        if len(tokens) < 17:
            raise SourceProjectionError("unsupported_species_layout", "Species记录字段不足，整体拒绝。", line.line_number)
        number = int(tokens[0])
        if number <= 0 or number in numbers:
            raise SourceProjectionError("duplicate_species_number", "Species编号必须唯一且为正数。", line.line_number)
        numbers.add(number)
        molecular_weight = _float(tokens[3], line.line_number)
        if molecular_weight <= 0:
            raise SourceProjectionError("invalid_molecular_weight", "Species分子量必须为正数。", line.line_number)
        name = tokens[-1]
        if not name.isascii() or len(name) > 80 or any(character.isspace() for character in name):
            raise SourceProjectionError("invalid_species_name", "Species名称不符合安全标识规则。", line.line_number)
        species_id = str(uuid5(NAMESPACE_URL, f"contam-studio:{baseline_sha256}:species:{number}:{line.line_number}"))
        species.append(SpeciesProjection(species_id, number, name, molecular_weight, line.line_number, "inspect", f"ev-{species_id[:16]}"))
    if len(species) != section.declared_count:
        raise SourceProjectionError("species_count_mismatch", "Species数量与区块声明不一致。", section.marker_line_number)
    return tuple(species)


def make_source_projection(
    baseline_sha256: str,
    number: int,
    *,
    kind: str,
    zone_number: int | None,
    species_id: str | None,
    rate: float,
    unit: str,
    interpretation: str,
    schedule: DaySchedule | None = None,
    capability: str = "inspect",
) -> SourceProjection:
    if kind not in SUPPORTED_SOURCE_KINDS:
        raise SourceProjectionError("unsupported_source_kind", "高级、非线性或未知Source形式必须整体拒绝。")
    if unit not in SUPPORTED_SOURCE_UNITS:
        raise SourceProjectionError("unsupported_source_unit", "Source单位不在首版Profile内。")
    if not math.isfinite(rate) or rate < 0 or rate > 1e15:
        raise SourceProjectionError("source_rate_out_of_range", "Source速率必须是非负有限数。")
    if kind != "outdoor_concentration" and zone_number is None:
        raise SourceProjectionError("source_zone_required", "Zone source必须绑定Zone。")
    if kind == "outdoor_concentration" and zone_number is not None:
        raise SourceProjectionError("outdoor_source_zone_forbidden", "Outdoor浓度Source不得伪装为Zone Source。")
    if schedule is not None and schedule.capability == "opaque":
        raise SourceProjectionError("opaque_schedule_reference", "Source不能引用opaque Schedule。")
    source_id = str(uuid5(NAMESPACE_URL, f"contam-studio:{baseline_sha256}:source:{number}:{kind}:{zone_number}"))
    return SourceProjection(
        source_id,
        kind,
        zone_number,
        species_id,
        rate,
        unit,
        None if schedule is None else schedule.schedule_id,
        interpretation,
        capability,
        f"ev-{source_id[:16]}",
    )
