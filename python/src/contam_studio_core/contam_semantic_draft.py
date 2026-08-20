from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import re
from typing import Any, Mapping


SCHEMA_VERSION = "contam_semantic_draft.v1"
MAX_ZONES = 256
MAX_FLOW_PATHS = 512

_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")
_SHA256 = re.compile(r"^[A-Fa-f0-9]{64}$")
_CONTAM_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,15}$")
_ROOT_KEYS = frozenset(
    {
        "schema_version",
        "status",
        "draft_id",
        "project_session_id",
        "identity_sha256",
        "source_sha256",
        "revision_id",
        "draft_revision",
        "provenance",
        "zones",
        "flow_paths",
    }
)
_ZONE_KEYS = frozenset(
    {
        "id",
        "level_number",
        "name",
        "display_name",
        "volume_litres",
        "volume_basis",
        "geometry_region_id",
        "initial_temperature_millikelvin",
        "initial_pressure_millipascal",
    }
)
_FLOW_PATH_KEYS = frozenset(
    {
        "id",
        "level_number",
        "opening_id",
        "from_endpoint",
        "to_endpoint",
        "flow_element_id",
        "multiplier_millionths",
        "x_mm",
        "y_mm",
        "relative_height_mm",
        "direction_degrees",
    }
)


class ContamSemanticDraftError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True, slots=True)
class DraftContext:
    project_session_id: str
    identity_sha256: str
    source_sha256: str
    revision_id: str
    level_numbers: frozenset[int]
    existing_zone_ids: frozenset[str]
    supported_flow_element_ids: frozenset[str]
    geometry: Mapping[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class DraftValidation:
    status: str
    draft_sha256: str
    diagnostics: tuple[str, ...]


def _object(value: Any, expected: frozenset[str], code: str) -> Mapping[str, Any]:
    if not isinstance(value, dict) or frozenset(value) != expected:
        raise ContamSemanticDraftError(code)
    return value


def _string(value: Any, pattern: re.Pattern[str], code: str) -> str:
    if not isinstance(value, str) or pattern.fullmatch(value) is None:
        raise ContamSemanticDraftError(code)
    return value


def _integer(value: Any, minimum: int, maximum: int, code: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ContamSemanticDraftError(code)
    return value


def _display_name(value: Any) -> str:
    if (
        not isinstance(value, str)
        or not 1 <= len(value) <= 80
        or value != value.strip()
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise ContamSemanticDraftError("semantic_draft_contract_invalid")
    return value


def _endpoint(value: Any) -> Mapping[str, Any]:
    item = _object(value, frozenset({"kind", "zone_id"}), "semantic_draft_contract_invalid")
    if item["kind"] == "outdoor" and item["zone_id"] is None:
        return item
    if item["kind"] == "zone":
        _string(item["zone_id"], _ID, "semantic_draft_contract_invalid")
        return item
    raise ContamSemanticDraftError("semantic_draft_contract_invalid")


def _zone(value: Any) -> Mapping[str, Any]:
    item = _object(value, _ZONE_KEYS, "semantic_draft_contract_invalid")
    _string(item["id"], _ID, "semantic_draft_contract_invalid")
    _integer(item["level_number"], 1, 10_000, "semantic_draft_contract_invalid")
    _string(item["name"], _CONTAM_NAME, "semantic_draft_contract_invalid")
    _display_name(item["display_name"])
    _integer(item["volume_litres"], 1, 1_000_000_000, "semantic_draft_contract_invalid")
    if item["volume_basis"] not in {"explicit", "geometry_estimate_confirmed"}:
        raise ContamSemanticDraftError("semantic_draft_contract_invalid")
    _string(item["geometry_region_id"], _ID, "semantic_draft_contract_invalid")
    _integer(
        item["initial_temperature_millikelvin"],
        173_150,
        373_150,
        "semantic_draft_contract_invalid",
    )
    _integer(
        item["initial_pressure_millipascal"],
        -1_000_000_000,
        1_000_000_000,
        "semantic_draft_contract_invalid",
    )
    return item


def _flow_path(value: Any) -> Mapping[str, Any]:
    item = _object(value, _FLOW_PATH_KEYS, "semantic_draft_contract_invalid")
    _string(item["id"], _ID, "semantic_draft_contract_invalid")
    _integer(item["level_number"], 1, 10_000, "semantic_draft_contract_invalid")
    _string(item["opening_id"], _ID, "semantic_draft_contract_invalid")
    _endpoint(item["from_endpoint"])
    _endpoint(item["to_endpoint"])
    _string(item["flow_element_id"], _ID, "semantic_draft_contract_invalid")
    _integer(
        item["multiplier_millionths"],
        1,
        1_000_000_000_000,
        "semantic_draft_contract_invalid",
    )
    _integer(item["x_mm"], -1_000_000_000, 1_000_000_000, "semantic_draft_contract_invalid")
    _integer(item["y_mm"], -1_000_000_000, 1_000_000_000, "semantic_draft_contract_invalid")
    _integer(item["relative_height_mm"], 0, 100_000_000, "semantic_draft_contract_invalid")
    _integer(item["direction_degrees"], -1, 359, "semantic_draft_contract_invalid")
    return item


def parse_contam_semantic_draft(value: Any) -> Mapping[str, Any]:
    root = _object(value, _ROOT_KEYS, "semantic_draft_contract_invalid")
    if root["schema_version"] != SCHEMA_VERSION or root["status"] != "available":
        raise ContamSemanticDraftError("semantic_draft_contract_invalid")
    _string(root["draft_id"], _ID, "semantic_draft_contract_invalid")
    _string(root["project_session_id"], _ID, "semantic_draft_contract_invalid")
    _string(root["identity_sha256"], _SHA256, "semantic_draft_contract_invalid")
    _string(root["source_sha256"], _SHA256, "semantic_draft_contract_invalid")
    _string(root["revision_id"], _ID, "semantic_draft_contract_invalid")
    _integer(root["draft_revision"], 0, 4_294_967_295, "semantic_draft_contract_invalid")
    provenance = _object(
        root["provenance"],
        frozenset({"source_kind", "application_owned"}),
        "semantic_draft_contract_invalid",
    )
    if provenance != {"source_kind": "studio_semantic_draft", "application_owned": True}:
        raise ContamSemanticDraftError("semantic_draft_contract_invalid")
    zones = root["zones"]
    flow_paths = root["flow_paths"]
    if not isinstance(zones, list) or len(zones) > MAX_ZONES:
        raise ContamSemanticDraftError("semantic_draft_contract_invalid")
    if not isinstance(flow_paths, list) or len(flow_paths) > MAX_FLOW_PATHS:
        raise ContamSemanticDraftError("semantic_draft_contract_invalid")
    for zone in zones:
        _zone(zone)
    for flow_path in flow_paths:
        _flow_path(flow_path)
    return root


def canonical_draft_json(value: Mapping[str, Any]) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def semantic_draft_sha256(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_draft_json(value)).hexdigest()


def _geometry_bindings(
    geometry: Mapping[str, Any],
) -> tuple[dict[str, str], dict[str, int], dict[str, tuple[str, int, str | None, str | None, str]]]:
    regions: dict[str, str] = {}
    openings: dict[str, int] = {}
    flow_paths: dict[str, tuple[str, int, str | None, str | None, str]] = {}
    levels = geometry.get("levels")
    if not isinstance(levels, list):
        return regions, openings, flow_paths
    for level in levels:
        if not isinstance(level, dict):
            continue
        level_number = level.get("level_number")
        if isinstance(level_number, bool) or not isinstance(level_number, int):
            continue
        for region in level.get("zone_regions", []):
            if isinstance(region, dict) and isinstance(region.get("id"), str) and isinstance(
                region.get("semantic_zone_id"), str
            ):
                regions[region["id"]] = region["semantic_zone_id"]
        for opening in level.get("openings", []):
            if isinstance(opening, dict) and isinstance(opening.get("id"), str):
                openings[opening["id"]] = level_number
        for anchor in level.get("flow_path_anchors", []):
            if (
                isinstance(anchor, dict)
                and isinstance(anchor.get("semantic_flow_path_id"), str)
                and isinstance(anchor.get("opening_id"), str)
                and (anchor.get("from_zone_id") is None or isinstance(anchor.get("from_zone_id"), str))
                and (anchor.get("to_zone_id") is None or isinstance(anchor.get("to_zone_id"), str))
                and anchor.get("exterior_side") in {"none", "from", "to"}
            ):
                flow_paths[anchor["semantic_flow_path_id"]] = (
                    anchor["opening_id"],
                    level_number,
                    anchor.get("from_zone_id"),
                    anchor.get("to_zone_id"),
                    anchor["exterior_side"],
                )
    return regions, openings, flow_paths


def validate_contam_semantic_draft(value: Any, context: DraftContext) -> DraftValidation:
    try:
        draft = parse_contam_semantic_draft(value)
    except ContamSemanticDraftError as error:
        return DraftValidation("invalid", "", (error.code,))
    diagnostics: set[str] = set()
    if (
        draft["project_session_id"] != context.project_session_id
        or draft["revision_id"] != context.revision_id
        or draft["identity_sha256"].lower() != context.identity_sha256.lower()
        or draft["source_sha256"].lower() != context.source_sha256.lower()
    ):
        diagnostics.add("semantic_draft_context_stale")
    zone_ids: set[str] = set()
    zone_names: set[str] = set()
    region_ids: set[str] = set()
    for zone in draft["zones"]:
        zone_id = zone["id"]
        name = zone["name"].lower()
        region_id = zone["geometry_region_id"]
        if zone_id in zone_ids:
            diagnostics.add("semantic_draft_zone_id_duplicate")
        if name in zone_names:
            diagnostics.add("semantic_draft_zone_name_duplicate")
        if region_id in region_ids:
            diagnostics.add("semantic_draft_zone_region_duplicate")
        zone_ids.add(zone_id)
        zone_names.add(name)
        region_ids.add(region_id)
        if zone["level_number"] not in context.level_numbers:
            diagnostics.add("semantic_draft_level_unknown")
    all_zone_ids = context.existing_zone_ids | zone_ids
    path_ids: set[str] = set()
    opening_ids: set[str] = set()
    for path in draft["flow_paths"]:
        if path["id"] in path_ids:
            diagnostics.add("semantic_draft_flow_path_id_duplicate")
        if path["opening_id"] in opening_ids:
            diagnostics.add("semantic_draft_opening_duplicate")
        path_ids.add(path["id"])
        opening_ids.add(path["opening_id"])
        if path["level_number"] not in context.level_numbers:
            diagnostics.add("semantic_draft_level_unknown")
        if path["flow_element_id"] not in context.supported_flow_element_ids:
            diagnostics.add("semantic_draft_flow_element_unsupported")
        endpoints = (path["from_endpoint"], path["to_endpoint"])
        if all(endpoint["kind"] == "outdoor" for endpoint in endpoints):
            diagnostics.add("semantic_draft_flow_path_outdoor_to_outdoor")
        for endpoint in endpoints:
            if endpoint["kind"] == "zone" and endpoint["zone_id"] not in all_zone_ids:
                diagnostics.add("semantic_draft_endpoint_unknown")
        if (
            endpoints[0]["kind"] == "zone"
            and endpoints[1]["kind"] == "zone"
            and endpoints[0]["zone_id"] == endpoints[1]["zone_id"]
        ):
            diagnostics.add("semantic_draft_flow_path_self_reference")
    if context.geometry is not None:
        geometry_regions, geometry_openings, geometry_flow_paths = _geometry_bindings(context.geometry)
        for zone in draft["zones"]:
            if geometry_regions.get(zone["geometry_region_id"]) != zone["id"]:
                diagnostics.add("semantic_draft_zone_geometry_mismatch")
        for path in draft["flow_paths"]:
            expected_from = path["from_endpoint"]["zone_id"] if path["from_endpoint"]["kind"] == "zone" else None
            expected_to = path["to_endpoint"]["zone_id"] if path["to_endpoint"]["kind"] == "zone" else None
            expected_exterior = (
                "from"
                if path["from_endpoint"]["kind"] == "outdoor"
                else "to" if path["to_endpoint"]["kind"] == "outdoor" else "none"
            )
            if (
                geometry_openings.get(path["opening_id"]) != path["level_number"]
                or geometry_flow_paths.get(path["id"])
                != (
                    path["opening_id"],
                    path["level_number"],
                    expected_from,
                    expected_to,
                    expected_exterior,
                )
            ):
                diagnostics.add("semantic_draft_flow_path_geometry_mismatch")
    return DraftValidation(
        "invalid" if diagnostics else "valid",
        semantic_draft_sha256(draft),
        tuple(sorted(diagnostics)),
    )


def create_empty_contam_semantic_draft(
    *,
    draft_id: str,
    project_session_id: str,
    identity_sha256: str,
    source_sha256: str,
    revision_id: str,
) -> dict[str, Any]:
    draft: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "status": "available",
        "draft_id": draft_id,
        "project_session_id": project_session_id,
        "identity_sha256": identity_sha256.lower(),
        "source_sha256": source_sha256.lower(),
        "revision_id": revision_id,
        "draft_revision": 0,
        "provenance": {"source_kind": "studio_semantic_draft", "application_owned": True},
        "zones": [],
        "flow_paths": [],
    }
    parse_contam_semantic_draft(draft)
    return draft
