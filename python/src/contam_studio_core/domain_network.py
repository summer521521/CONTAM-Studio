from __future__ import annotations

from dataclasses import dataclass
import math
import re
from uuid import NAMESPACE_URL, uuid5

from .prj_sections import PrjSection, PrjSectionsDocument, SectionLine, read_prj_sections
from .strict_numeric import parse_ascii_finite_float


NETWORK_SCHEMA_VERSION = "domain_network.v1"
NETWORK_PROFILE = "strict_contam_3_4_airflow_v1"
SUPPORTED_FLOW_MODELS = frozenset({"plr_orfc", "plr_leak3"})
_ELEMENT_HEADER = re.compile(r"^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+.*)?$")


class NetworkProjectionError(Exception):
    def __init__(self, code: str, message: str, line_number: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.line_number = line_number


@dataclass(frozen=True, slots=True)
class FlowElement:
    element_id: str
    contam_number: int
    family: int
    model: str
    label: str
    parameter_tokens: tuple[str, ...]
    source_line_number: int
    supported: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "element_id": self.element_id,
            "contam_number": self.contam_number,
            "family": self.family,
            "model": self.model,
            "label": self.label,
            "parameter_tokens": list(self.parameter_tokens),
            "source_line_number": self.source_line_number,
            "supported": self.supported,
        }


@dataclass(frozen=True, slots=True)
class Endpoint:
    category: str
    contam_number: int | None

    def to_dict(self) -> dict[str, object]:
        return {"category": self.category, "contam_number": self.contam_number}


@dataclass(frozen=True, slots=True)
class FlowPath:
    path_id: str
    contam_number: int
    flags: int
    from_endpoint: Endpoint
    to_endpoint: Endpoint
    flow_element_id: str
    direction: int
    multiplier: float
    coordinates_m: tuple[float, float, float]
    source_line_number: int
    capability: str
    rejection_code: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "path_id": self.path_id,
            "contam_number": self.contam_number,
            "flags": self.flags,
            "from_endpoint": self.from_endpoint.to_dict(),
            "to_endpoint": self.to_endpoint.to_dict(),
            "flow_element_id": self.flow_element_id,
            "direction": self.direction,
            "multiplier": self.multiplier,
            "coordinates_m": list(self.coordinates_m),
            "source_line_number": self.source_line_number,
            "capability": self.capability,
            "rejection_code": self.rejection_code,
        }


@dataclass(frozen=True, slots=True)
class AirflowProjection:
    schema_version: str
    profile: str
    baseline_sha256: str
    components: tuple[FlowElement, ...]
    paths: tuple[FlowPath, ...]
    diagnostics: tuple[str, ...]

    @property
    def editable(self) -> bool:
        return bool(self.paths) and not self.diagnostics and all(item.capability == "inspect" for item in self.paths)

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "profile": self.profile,
            "baseline_sha256": self.baseline_sha256,
            "components": [item.to_dict() for item in self.components],
            "paths": [item.to_dict() for item in self.paths],
            "diagnostics": list(self.diagnostics),
            "editable": self.editable,
        }


def _tokenize(line: SectionLine) -> list[str]:
    text = line.text.partition("!")[0].strip()
    return text.split() if text else []


def _int(token: str, code: str, line: int) -> int:
    try:
        return int(token)
    except ValueError as error:
        raise NetworkProjectionError(code, "气流网络整数域无效。", line) from error


def _float(token: str, code: str, line: int) -> float:
    try:
        return parse_ascii_finite_float(token)
    except ValueError as error:
        raise NetworkProjectionError(code, "气流网络数值域无效。", line) from error


def _element_records(section: PrjSection) -> tuple[FlowElement, ...]:
    lines = section.lines
    starts: list[int] = []
    for index, line in enumerate(lines):
        match = _ELEMENT_HEADER.fullmatch(line.text)
        if match is not None:
            starts.append(index)
    if len(starts) != section.declared_count:
        raise NetworkProjectionError("element_count_mismatch", "Flow element数量与区块声明不一致。", section.marker_line_number)
    elements: list[FlowElement] = []
    numbers: set[int] = set()
    for offset, start in enumerate(starts):
        line = lines[start]
        match = _ELEMENT_HEADER.fullmatch(line.text)
        assert match is not None
        number = _int(match.group(1), "invalid_element_number", line.line_number)
        if number <= 0 or number in numbers:
            raise NetworkProjectionError("duplicate_element_number", "Flow element编号必须唯一且为正数。", line.line_number)
        numbers.add(number)
        family = _int(match.group(2), "invalid_element_family", line.line_number)
        model, label = match.group(3), match.group(4)
        end = starts[offset + 1] if offset + 1 < len(starts) else len(lines)
        numeric_lines: list[str] = []
        for candidate in lines[start + 1 : end]:
            tokens = _tokenize(candidate)
            if not tokens:
                continue
            if all(_is_numeric(token) for token in tokens):
                numeric_lines.extend(tokens)
        if not numeric_lines:
            raise NetworkProjectionError("element_parameters_missing", "Flow element缺少参数记录。", line.line_number)
        supported = family == 23 and model in SUPPORTED_FLOW_MODELS
        elements.append(
            FlowElement(
                element_id="",
                contam_number=number,
                family=family,
                model=model,
                label=label,
                parameter_tokens=tuple(numeric_lines),
                source_line_number=line.line_number,
                supported=supported,
            )
        )
    return tuple(elements)


def _is_numeric(token: str) -> bool:
    try:
        parse_ascii_finite_float(token)
        return True
    except ValueError:
        return False


def _endpoint(value: int) -> Endpoint:
    if value == -1:
        return Endpoint("outdoor", None)
    if value > 0:
        return Endpoint("zone", value)
    raise NetworkProjectionError("unsupported_endpoint", "气流路径端点不是Outdoor或Zone。")


def _path_records(section: PrjSection, elements: tuple[FlowElement, ...], baseline: str) -> tuple[FlowPath, ...]:
    paths: list[FlowPath] = []
    numbers: set[int] = set()
    by_number = {item.contam_number: item for item in elements}
    for line in section.lines:
        tokens = _tokenize(line)
        if not tokens:
            continue
        if len(tokens) < 30:
            raise NetworkProjectionError("unsupported_path_layout", "Flow path记录字段不足，整体拒绝。", line.line_number)
        number = _int(tokens[0], "invalid_path_number", line.line_number)
        if number <= 0 or number in numbers:
            raise NetworkProjectionError("duplicate_path_number", "Flow path编号必须唯一且为正数。", line.line_number)
        numbers.add(number)
        integer_indexes = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 21, 22, 23, 27, 28, 29)
        integers = {index: _int(tokens[index], "invalid_path_integer", line.line_number) for index in integer_indexes}
        floats = {index: _float(tokens[index], "invalid_path_number", line.line_number) for index in range(11, 17)}
        floats.update({index: _float(tokens[index], "invalid_path_number", line.line_number) for index in (18, 19, 20)})
        from_endpoint = _endpoint(integers[2])
        to_endpoint = _endpoint(integers[3])
        if from_endpoint == to_endpoint:
            raise NetworkProjectionError("self_reference", "Flow path不得连接同一端点。", line.line_number)
        element = by_number.get(integers[4])
        rejection: str | None = None
        if element is None:
            rejection = "missing_component"
        elif not element.supported:
            rejection = "unsupported_component"
        if integers[1] not in (0, 1):
            rejection = "unsupported_control_path"
        if integers[27] != 0 or integers[28] != 0 or integers[29] != 0:
            rejection = "unsupported_parameterization"
        if floats[14] <= 0 or not math.isfinite(floats[14]):
            rejection = "invalid_multiplier"
        capability = "inspect" if rejection is None else "opaque"
        path_id = str(uuid5(NAMESPACE_URL, f"contam-studio:{baseline}:flow-path:{number}:{line.line_number}"))
        element_id = "" if element is None else str(uuid5(NAMESPACE_URL, f"contam-studio:{baseline}:flow-element:{element.contam_number}:{element.source_line_number}"))
        paths.append(
            FlowPath(
                path_id=path_id,
                contam_number=number,
                flags=integers[1],
                from_endpoint=from_endpoint,
                to_endpoint=to_endpoint,
                flow_element_id=element_id,
                direction=integers[22],
                multiplier=floats[14],
                coordinates_m=(floats[11], floats[12], floats[13]),
                source_line_number=line.line_number,
                capability=capability,
                rejection_code=rejection,
            )
        )
    if len(paths) != section.declared_count:
        raise NetworkProjectionError("path_count_mismatch", "Flow path数量与区块声明不一致。", section.marker_line_number)
    return tuple(paths)


def project_airflow(document: PrjSectionsDocument) -> AirflowProjection:
    elements_section = document.section("flow elements")
    paths_section = document.section("flow paths")
    if elements_section is None or paths_section is None:
        raise NetworkProjectionError("required_section_missing", "当前气流Profile缺少Flow elements或Flow paths区块。")
    raw_elements = _element_records(elements_section)
    elements = tuple(
        FlowElement(
            element_id=str(uuid5(NAMESPACE_URL, f"contam-studio:{document.source_sha256}:flow-element:{item.contam_number}:{item.source_line_number}")),
            contam_number=item.contam_number,
            family=item.family,
            model=item.model,
            label=item.label,
            parameter_tokens=item.parameter_tokens,
            source_line_number=item.source_line_number,
            supported=item.supported,
        )
        for item in raw_elements
    )
    paths = _path_records(paths_section, elements, document.source_sha256)
    diagnostics = tuple(sorted({item.rejection_code for item in paths if item.rejection_code}))
    return AirflowProjection(NETWORK_SCHEMA_VERSION, NETWORK_PROFILE, document.source_sha256, elements, paths, diagnostics)


def read_and_project_airflow(path) -> AirflowProjection:
    return project_airflow(read_prj_sections(path))
