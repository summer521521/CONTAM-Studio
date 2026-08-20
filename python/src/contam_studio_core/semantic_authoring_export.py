"""Generate a new PRJ copy from a validated Studio semantic-authoring draft.

This deliberately writes only the verified Zone, initial-concentration, and
Airflow Path records. Studio metric geometry is not converted into ContamW
SketchPad icons by this module.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
from typing import Any, Mapping
from uuid import uuid4

from .contam_semantic_draft import (
    ContamSemanticDraftError,
    DraftContext,
    parse_contam_semantic_draft,
    validate_contam_semantic_draft,
)
from .domain_network import NetworkProjectionError, project_airflow
from .prj_sections import PrjSection, PrjSectionError, read_prj_sections
from .prj_zone_reader import PrjZoneReaderError, read_simple_zones
from .semantic_patch import stable_zone_id


MAX_GENERATED_PRJ_BYTES = 32 * 1024 * 1024
_MARKER = re.compile(rb"^(\s*)\d+(\s+!\s*[^:]+:\s*)(\r?\n)?$")
_SPECIES_MARKER = re.compile(rb"^\s*(\d+)\s+!\s*species:\s*$", re.IGNORECASE)


class SemanticAuthoringExportError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class SemanticAuthoringExportResult:
    source_sha256: str
    output_sha256: str
    output_size_bytes: int
    source_unchanged: bool
    added_zone_count: int
    added_flow_path_count: int
    zone_number_by_id: Mapping[str, int]
    flow_path_number_by_id: Mapping[str, int]

    def to_dict(self) -> dict[str, object]:
        return {
            "result_type": "semantic_authoring_export",
            "source_sha256": self.source_sha256,
            "output_sha256": self.output_sha256,
            "output_size_bytes": self.output_size_bytes,
            "source_unchanged": self.source_unchanged,
            "added_zone_count": self.added_zone_count,
            "added_flow_path_count": self.added_flow_path_count,
            "zone_number_by_id": dict(self.zone_number_by_id),
            "flow_path_number_by_id": dict(self.flow_path_number_by_id),
            "sketchpad_geometry_written": False,
        }


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _source_snapshot(path: Path) -> tuple[bytes, str]:
    try:
        before = path.stat()
        data = path.read_bytes()
        after = path.stat()
    except OSError as error:
        raise SemanticAuthoringExportError("source_not_found", "源PRJ不可读。") from error
    if (
        before.st_size != after.st_size
        or before.st_mtime_ns != after.st_mtime_ns
        or len(data) != after.st_size
    ):
        raise SemanticAuthoringExportError("source_changed", "读取期间源PRJ发生变化。")
    return data, _digest(data)


def _fixed(value: int, scale: int, digits: int) -> str:
    sign = "-" if value < 0 else ""
    absolute = abs(value)
    whole, remainder = divmod(absolute, scale)
    if remainder == 0:
        return f"{sign}{whole}"
    fraction = f"{remainder:0{digits}d}".rstrip("0")
    return f"{sign}{whole}.{fraction}"


def _section(document, name: str) -> PrjSection:
    try:
        section = document.section(name)
    except PrjSectionError as error:
        raise SemanticAuthoringExportError(error.code, str(error)) from error
    if section is None:
        raise SemanticAuthoringExportError("required_section_missing", f"缺少{name}区块。")
    return section


def _replace_section(
    lines: list[bytes],
    section: PrjSection,
    declared_count: int,
    appended_records: list[bytes],
    newline: bytes,
) -> None:
    marker_index = section.marker_line_number - 1
    terminator_index = section.terminator_line_number - 1
    marker = lines[marker_index]
    match = _MARKER.fullmatch(marker)
    if match is None:
        raise SemanticAuthoringExportError("section_marker_invalid", "PRJ区块标记无法安全更新。")
    marker_newline = match.group(3) or b""
    lines[marker_index] = match.group(1) + str(declared_count).encode("ascii") + match.group(2) + marker_newline
    records = [record + newline for record in appended_records]
    lines[terminator_index:terminator_index] = records


def _species_count(source_data: bytes) -> int:
    matches = [
        int(match.group(1))
        for line in source_data.splitlines()
        if (match := _SPECIES_MARKER.fullmatch(line)) is not None
    ]
    if len(matches) != 1 or not 0 <= matches[0] <= 100_000:
        raise SemanticAuthoringExportError("species_count_unavailable", "Species数量标记不唯一或无效。")
    return matches[0]


def _exclusive_write(destination: Path, data: bytes) -> None:
    if len(data) > MAX_GENERATED_PRJ_BYTES:
        raise SemanticAuthoringExportError("output_too_large", "生成的PRJ超过安全大小限制。")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise SemanticAuthoringExportError("output_exists", "目标副本已存在，拒绝覆盖。")
    temporary = destination.with_name(f".{destination.name}.{uuid4().hex}.tmp")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, destination)
            temporary.unlink()
        except OSError:
            descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.unlink()
    except FileExistsError as error:
        raise SemanticAuthoringExportError("output_exists", "目标副本已存在，拒绝覆盖。") from error
    except OSError as error:
        raise SemanticAuthoringExportError("output_write_failed", "PRJ副本写入失败。") from error
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def export_semantic_authoring_draft_to_copy(
    source: Path,
    destination: Path,
    draft: Mapping[str, Any],
) -> SemanticAuthoringExportResult:
    source = Path(source).expanduser().resolve()
    destination = Path(destination).expanduser().resolve()
    if source == destination:
        raise SemanticAuthoringExportError("output_matches_source", "目标必须是新的PRJ副本。")
    if destination.exists():
        raise SemanticAuthoringExportError("output_exists", "目标副本已存在，拒绝覆盖。")
    source_data, source_sha256 = _source_snapshot(source)
    try:
        draft = parse_contam_semantic_draft(draft)
    except ContamSemanticDraftError as error:
        raise SemanticAuthoringExportError(error.code, "语义草稿契约无效。") from error
    try:
        sections = read_prj_sections(source)
        zones_document = read_simple_zones(source)
        airflow = project_airflow(sections)
    except (PrjSectionError, PrjZoneReaderError, NetworkProjectionError) as error:
        code = getattr(error, "code", "semantic_authoring_profile_unsupported")
        raise SemanticAuthoringExportError(code, "源PRJ不符合语义创作的严格Profile。") from error
    if sections.source_sha256 != source_sha256 or zones_document.source_sha256 != source_sha256:
        raise SemanticAuthoringExportError("source_changed", "源PRJ证据哈希不一致。")

    level_section = _section(sections, "levels plus icon data")
    zone_section = _section(sections, "zones")
    initial_section = _section(sections, "initial zone concentrations")
    flow_section = _section(sections, "flow paths")
    level_numbers = frozenset(
        int(line.text.partition("!")[0].split()[0])
        for line in level_section.lines
        if line.text.partition("!")[0].split()
        and len(line.text.partition("!")[0].split()) >= 7
    )
    existing_zone_numbers = {
        stable_zone_id(draft["identity_sha256"], zone.contam_number, zone.source_line_number): zone.contam_number
        for zone in zones_document.zones
    }
    supported_elements = {item.element_id: item.contam_number for item in airflow.components if item.supported}
    validation = validate_contam_semantic_draft(
        draft,
        DraftContext(
            project_session_id=draft["project_session_id"],
            identity_sha256=draft["identity_sha256"],
            source_sha256=source_sha256,
            revision_id=draft["revision_id"],
            level_numbers=level_numbers,
            existing_zone_ids=frozenset(existing_zone_numbers),
            supported_flow_element_ids=frozenset(supported_elements),
            geometry=None,
        ),
    )
    if validation.status != "valid":
        raise SemanticAuthoringExportError(
            "semantic_draft_invalid",
            f"语义草稿未通过源PRJ验证：{','.join(validation.diagnostics)}",
        )

    old_zone_count = zone_section.declared_count
    old_path_count = flow_section.declared_count
    species_count = _species_count(source_data)
    if initial_section.declared_count != old_zone_count * species_count:
        raise SemanticAuthoringExportError("initial_concentration_count_mismatch", "初始浓度数量与Zone/Species数量不一致。")
    zone_number_by_id = {
        zone["id"]: old_zone_count + index
        for index, zone in enumerate(draft["zones"], start=1)
    }
    all_zone_numbers = {**existing_zone_numbers, **zone_number_by_id}
    flow_path_number_by_id = {
        path["id"]: old_path_count + index
        for index, path in enumerate(draft["flow_paths"], start=1)
    }

    zone_records: list[bytes] = []
    for zone in draft["zones"]:
        record = " ".join(
            [
                str(zone_number_by_id[zone["id"]]),
                "3", "0", "0", "0", str(zone["level_number"]), "0",
                _fixed(zone["volume_litres"], 1_000, 3),
                _fixed(zone["initial_temperature_millikelvin"], 1_000, 3),
                _fixed(zone["initial_pressure_millipascal"], 1_000, 3),
                zone["name"], "-1", "0", "2", "0", "0", "0", "0", "0",
            ]
        )
        zone_records.append(record.encode("ascii"))

    concentration_records = [] if species_count == 0 else [
        (" ".join([str(zone_number_by_id[zone["id"]]), *(["0.000e+00"] * species_count)])).encode("ascii")
        for zone in draft["zones"]
    ]

    path_records: list[bytes] = []
    for path in draft["flow_paths"]:
        def endpoint_number(endpoint: Mapping[str, Any]) -> int:
            if endpoint["kind"] == "outdoor":
                return -1
            try:
                return all_zone_numbers[endpoint["zone_id"]]
            except KeyError as error:
                raise SemanticAuthoringExportError("semantic_draft_endpoint_unknown", "Airflow Path端点不存在。") from error

        try:
            element_number = supported_elements[path["flow_element_id"]]
        except KeyError as error:
            raise SemanticAuthoringExportError("semantic_draft_flow_element_unsupported", "Airflow Path流量元件不受支持。") from error
        from_number = endpoint_number(path["from_endpoint"])
        to_number = endpoint_number(path["to_endpoint"])
        flags = 1 if -1 in (from_number, to_number) else 0
        record = " ".join(
            [
                str(flow_path_number_by_id[path["id"]]), str(flags), str(from_number), str(to_number),
                str(element_number), "0", "0", "0", "0", "0", str(path["level_number"]),
                _fixed(path["x_mm"], 1_000, 3), _fixed(path["y_mm"], 1_000, 3),
                _fixed(path["relative_height_mm"], 1_000, 3),
                _fixed(path["multiplier_millionths"], 1_000_000, 6),
                "0", "0", "0", "0", "0", "0", "0", "0", "-1", "0", "0", "0", "0", "0", "0",
            ]
        )
        path_records.append(record.encode("ascii"))

    newline = b"\r\n" if b"\r\n" in source_data else b"\n"
    lines = source_data.splitlines(keepends=True)
    replacements = [
        (flow_section, old_path_count + len(path_records), path_records),
        (initial_section, (old_zone_count + len(zone_records)) * species_count, concentration_records),
        (zone_section, old_zone_count + len(zone_records), zone_records),
    ]
    for section, count, records in sorted(replacements, key=lambda item: item[0].marker_line_number, reverse=True):
        _replace_section(lines, section, count, records, newline)
    output_data = b"".join(lines)
    _exclusive_write(destination, output_data)
    try:
        output_sections = read_prj_sections(destination)
        output_zones = read_simple_zones(destination)
        output_airflow = project_airflow(output_sections)
        if len(output_zones.zones) != old_zone_count + len(zone_records):
            raise SemanticAuthoringExportError("semantic_authoring_round_trip_mismatch", "生成的Zone数量不一致。")
        if len(output_airflow.paths) != old_path_count + len(path_records):
            raise SemanticAuthoringExportError("semantic_authoring_round_trip_mismatch", "生成的FlowPath数量不一致。")
        output_data_verified, output_sha256 = _source_snapshot(destination)
        source_unchanged = _source_snapshot(source)[1] == source_sha256
        if not source_unchanged:
            raise SemanticAuthoringExportError("source_changed", "生成期间源PRJ发生变化。")
    except Exception:
        try:
            destination.unlink()
        except OSError:
            pass
        raise
    return SemanticAuthoringExportResult(
        source_sha256=source_sha256,
        output_sha256=output_sha256,
        output_size_bytes=len(output_data_verified),
        source_unchanged=True,
        added_zone_count=len(zone_records),
        added_flow_path_count=len(path_records),
        zone_number_by_id=zone_number_by_id,
        flow_path_number_by_id=flow_path_number_by_id,
    )
