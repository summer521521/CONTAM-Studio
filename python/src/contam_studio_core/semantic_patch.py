"""Conservative, byte-local semantic PRJ patch transactions."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from .domain_network import NetworkProjectionError, project_airflow
from .prj_sections import PrjSectionError, read_prj_sections
from .prj_zone_reader import read_simple_zones
from .spatial_projection import SpatialProjectionError, project_spatial

_ALLOWED = {
    "set_zone_volume": ("zone", 7, "volume_m3", "m3"),
    "set_zone_name": ("zone", 10, "name", None),
    "set_flow_path_multiplier": ("flow_path", 14, "multiplier", "1"),
    "set_flow_path_coefficient": ("flow_path", 14, "multiplier", "1"),
    "set_spatial_icon_column": ("spatial_icon", 1, "column", "grid_cell"),
    "set_spatial_icon_row": ("spatial_icon", 2, "row", "grid_cell"),
}
_ZONE_ID_NAMESPACE = UUID("0c6dfd5d-98c2-5fb3-a9f3-a72ee89a4471")
_NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")
_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,15}$")
_SKETCHPAD_HEADER = re.compile(r"^\s*!\s*rows\s+cols(?:\s+.*)?$", re.IGNORECASE)


class SemanticPatchError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class SemanticOperation:
    operation: str
    operation_id: str
    object_id: str
    field: str
    old_value: str
    new_value: str
    unit: str | None
    evidence_span: tuple[int, int]

    def to_dict(self) -> dict[str, object]:
        return {
            "operation": self.operation,
            "operation_id": self.operation_id,
            "object_id": self.object_id,
            "field": self.field,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "unit": self.unit,
            "evidence_span": list(self.evidence_span),
        }


@dataclass(frozen=True, slots=True)
class PatchTransaction:
    source_sha256: str
    identity_sha256: str
    revision_id: str
    operations: tuple[SemanticOperation, ...]
    patch_sha256: str

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": "semantic_patch.v1",
            "source_sha256": self.source_sha256,
            "identity_sha256": self.identity_sha256,
            "revision_id": self.revision_id,
            "operations": [item.to_dict() for item in self.operations],
            "patch_sha256": self.patch_sha256,
        }


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_zone_id(source_sha256: str, number: int, line: int) -> str:
    """Keep Python semantic IDs identical to the Rust desktop identity binding."""
    return str(uuid5(_ZONE_ID_NAMESPACE, f"{source_sha256.upper()}|zone|{number}|{line}|"))


def _path_id(source_sha256: str, number: int, line: int) -> str:
    return str(uuid5(NAMESPACE_URL, f"contam-studio:{source_sha256}:flow-path:{number}:{line}"))


def _line_tokens(data: bytes, line: int) -> list[tuple[int, int, bytes]]:
    start = 0
    for _ in range(1, line):
        newline = data.find(b"\n", start)
        if newline < 0:
            raise SemanticPatchError("evidence_span_missing", "对象来源行不可用。")
        start = newline + 1
    end = data.find(b"\n", start)
    body = data[start : len(data) if end < 0 else end]
    comment = body.find(b"!")
    if comment >= 0:
        body = body[:comment]
    return [
        (start + match.start(), start + match.end(), match.group())
        for match in re.finditer(rb"[^\t\n\v\f\r ]+", body)
    ]


def _source_snapshot(source: Path) -> tuple[bytes, str, int]:
    try:
        before = source.stat()
        data = source.read_bytes()
        after = source.stat()
    except OSError as error:
        raise SemanticPatchError("source_not_found", "源文件不可读。") from error
    if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns or len(data) != after.st_size:
        raise SemanticPatchError("source_changed", "源文件在读取期间发生变化。")
    return data, _digest(data), after.st_size


def _sketchpad_extents(data: bytes) -> tuple[int, int]:
    try:
        lines = data.decode("ascii", errors="strict").splitlines()
    except UnicodeDecodeError as error:
        raise SemanticPatchError("sketchpad_extent_unverified", "SketchPad范围无法验证。") from error
    headers = [index for index, line in enumerate(lines) if _SKETCHPAD_HEADER.fullmatch(line)]
    if len(headers) != 1:
        raise SemanticPatchError("sketchpad_extent_unverified", "SketchPad行列声明不唯一。")
    for line in lines[headers[0] + 1 :]:
        body = line.partition("!")[0].strip()
        if not body:
            continue
        tokens = body.split()
        if len(tokens) < 2:
            break
        try:
            rows, columns = int(tokens[0]), int(tokens[1])
        except ValueError as error:
            raise SemanticPatchError(
                "sketchpad_extent_unverified", "SketchPad行列声明不是整数。"
            ) from error
        if not 1 <= rows <= 1_000_000 or not 1 <= columns <= 1_000_000:
            raise SemanticPatchError("sketchpad_extent_unverified", "SketchPad行列范围无效。")
        return rows, columns
    raise SemanticPatchError("sketchpad_extent_unverified", "SketchPad行列数据缺失。")


def _patch_digest(
    source_sha256: str,
    identity_sha256: str,
    revision_id: str,
    operations: tuple[SemanticOperation, ...],
) -> str:
    payload = json.dumps(
        {
            "source_sha256": source_sha256,
            "identity_sha256": identity_sha256,
            "revision_id": revision_id,
            "operations": [item.to_dict() for item in operations],
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("ascii")
    return _digest(payload)


def _spatial_projection(source: Path, identity_sha256: str, revision_id: str):
    try:
        document = read_prj_sections(source)
        projection = project_spatial(
            document,
            identity_sha256=identity_sha256,
            revision_id=revision_id,
            zone_semantic_ids={},
            flow_path_semantic_ids={},
        )
    except (OSError, PrjSectionError, SpatialProjectionError) as error:
        raise SemanticPatchError(
            "spatial_projection_unavailable",
            "SketchPad图标区块无法按已验证Profile读取。",
        ) from error
    if projection.status != "available":
        raise SemanticPatchError(
            "spatial_projection_unavailable",
            "SketchPad图标区块不可用于安全Patch。",
        )
    return projection


def _verify_spatial_application(
    source: Path,
    destination: Path,
    transaction: PatchTransaction,
) -> None:
    spatial_operations = tuple(
        item for item in transaction.operations if item.operation.startswith("set_spatial_icon_")
    )
    if not spatial_operations:
        return
    before = _spatial_projection(source, transaction.identity_sha256, transaction.revision_id)
    after = _spatial_projection(destination, transaction.identity_sha256, transaction.revision_id)
    expected: dict[str, dict[str, int]] = {}
    for operation in spatial_operations:
        target = expected.setdefault(operation.object_id, {})
        target[operation.field] = int(operation.new_value)
    if len(before.levels) != len(after.levels):
        raise SemanticPatchError("spatial_round_trip_mismatch", "SketchPad层数量在写入后发生变化。")
    seen_targets: set[str] = set()
    for before_level, after_level in zip(before.levels, after.levels, strict=True):
        if before_level.level_number != after_level.level_number or len(before_level.icons) != len(
            after_level.icons
        ):
            raise SemanticPatchError(
                "spatial_round_trip_mismatch", "SketchPad图标序列在写入后发生变化。"
            )
        for before_icon, after_icon in zip(before_level.icons, after_level.icons, strict=True):
            if (
                before_icon.icon_type != after_icon.icon_type
                or before_icon.object_number != after_icon.object_number
            ):
                raise SemanticPatchError(
                    "spatial_round_trip_mismatch", "SketchPad对象身份在写入后发生变化。"
                )
            target = expected.get(before_icon.icon_id, {})
            expected_column = target.get("column", before_icon.column)
            expected_row = target.get("row", before_icon.row)
            if after_icon.column != expected_column or after_icon.row != expected_row:
                raise SemanticPatchError(
                    "spatial_round_trip_mismatch", "SketchPad坐标写入结果与Patch不一致。"
                )
            if target:
                seen_targets.add(before_icon.icon_id)
    if seen_targets != set(expected):
        raise SemanticPatchError("spatial_round_trip_mismatch", "SketchPad目标图标在写入后缺失。")


def plan_zone_transaction(
    source: Path,
    revision_id: str,
    requested: tuple[dict[str, str | None], ...],
    *,
    identity_sha256: str | None = None,
) -> PatchTransaction:
    if not re.fullmatch(r"[0-9a-f-]{36}", revision_id, re.I):
        raise SemanticPatchError("revision_invalid", "Revision标识无效。")
    source = Path(source)
    data, source_hash, _ = _source_snapshot(source)
    identity_hash = source_hash if identity_sha256 is None else identity_sha256.lower()
    if len(identity_hash) != 64 or any(character not in "0123456789abcdef" for character in identity_hash):
        raise SemanticPatchError("identity_invalid", "语义对象身份哈希无效。")
    validated_requests: list[tuple[dict[str, str | None], str, str, str, str | None]] = []
    for request in requested:
        if not isinstance(request, dict) or set(request) != {
            "operation",
            "object_id",
            "new_value",
            "unit",
        }:
            raise SemanticPatchError("operation_invalid", "语义操作字段不完整或包含未知字段。")
        kind = request.get("operation")
        object_id = request.get("object_id")
        value = request.get("new_value")
        unit = request.get("unit")
        if kind not in _ALLOWED or not isinstance(object_id, str) or not isinstance(value, str):
            raise SemanticPatchError("operation_unsupported", "语义操作不受支持。")
        validated_requests.append((request, kind, object_id, value, unit))
    document = read_simple_zones(source)
    if document.source_sha256.lower() != source_hash:
        raise SemanticPatchError("source_changed", "源文件在读取期间发生变化。")
    zones = {stable_zone_id(identity_hash, item.contam_number, item.source_line_number): item for item in document.zones}
    paths: dict[str, object] = {}
    if any(_ALLOWED[kind][0] == "flow_path" for _, kind, _, _, _ in validated_requests):
        try:
            network = project_airflow(read_prj_sections(source))
            paths = {
                _path_id(identity_hash, item.contam_number, item.source_line_number): item
                for item in network.paths
            }
        except (NetworkProjectionError, OSError, PrjSectionError):
            paths = {}
    spatial_targets: dict[str, object] = {}
    spatial_levels: dict[str, int] = {}
    spatial_final_coordinates: dict[str, tuple[int, int]] = {}
    sketchpad_rows = sketchpad_columns = 0
    if any(_ALLOWED[kind][0] == "spatial_icon" for _, kind, _, _, _ in validated_requests):
        sketchpad_rows, sketchpad_columns = _sketchpad_extents(data)
        projection = _spatial_projection(source, identity_hash, revision_id)
        for level in projection.levels:
            for icon in level.icons:
                if not (
                    0 <= icon.column < sketchpad_columns and 0 <= icon.row < sketchpad_rows
                ):
                    raise SemanticPatchError(
                        "spatial_coordinate_out_of_bounds",
                        "现有SketchPad图标超出文件声明范围，拒绝写入。",
                    )
                spatial_targets[icon.icon_id] = icon
                spatial_levels[icon.icon_id] = level.level_number
                spatial_final_coordinates[icon.icon_id] = (icon.column, icon.row)
    operations: list[SemanticOperation] = []
    seen: set[tuple[str, str]] = set()
    for _request, kind, object_id, value, unit in validated_requests:
        if (object_id, kind) in seen:
            raise SemanticPatchError("duplicate_operation", "同一对象字段不能重复修改。")
        seen.add((object_id, kind))
        category, index, field, expected_unit = _ALLOWED[kind]
        if unit != expected_unit:
            raise SemanticPatchError("unit_mismatch", "字段单位与受支持Profile不一致。")
        if category == "zone":
            target = zones.get(object_id)
            if target is None:
                raise SemanticPatchError("object_unknown", "目标对象不存在或不是可编辑Zone。")
        elif category == "flow_path":
            target = paths.get(object_id)
            if target is None or getattr(target, "capability", "opaque") != "inspect":
                raise SemanticPatchError("object_read_only", "目标FlowPath不是可安全保存的对象。")
        else:
            target = spatial_targets.get(object_id)
            if target is None:
                raise SemanticPatchError("object_unknown", "目标SketchPad图标不存在或基线已变化。")
        if kind == "set_zone_name":
            if not _NAME.fullmatch(value):
                raise SemanticPatchError("value_invalid", "Zone名称必须是15字符以内的安全ASCII记号。")
        elif category == "spatial_icon":
            if not re.fullmatch(r"(?:0|[1-9]\d*)", value):
                raise SemanticPatchError("value_invalid", "SketchPad坐标必须是规范非负整数。")
            coordinate = int(value)
            limit = sketchpad_columns if field == "column" else sketchpad_rows
            if coordinate >= limit:
                raise SemanticPatchError(
                    "spatial_coordinate_out_of_bounds", "SketchPad目标坐标超出文件声明范围。"
                )
        else:
            try:
                number = float(value)
            except ValueError as error:
                raise SemanticPatchError("value_invalid", "数值必须是有限ASCII数字。") from error
            if not _NUMBER.fullmatch(value) or not math.isfinite(number) or not 0 < number <= 1e9:
                raise SemanticPatchError("value_invalid", "数值必须是有界有限数。")
        source_line = (
            getattr(target, "source_line")
            if category == "spatial_icon"
            else getattr(target, "source_line_number")
        )
        tokens = _line_tokens(data, source_line)
        if category == "zone" and len(tokens) != 19:
            raise SemanticPatchError("evidence_span_invalid", "目标Zone行不再符合严格Profile。")
        if category == "flow_path" and len(tokens) < 30:
            raise SemanticPatchError("evidence_span_invalid", "目标FlowPath行不再符合严格Profile。")
        if category == "spatial_icon":
            if len(tokens) != 4:
                raise SemanticPatchError("evidence_span_invalid", "SketchPad图标行不再符合四整数Profile。")
            expected_tokens = (
                str(getattr(target, "icon_type")),
                str(getattr(target, "column")),
                str(getattr(target, "row")),
                str(getattr(target, "object_number")),
            )
            if tuple(token[2].decode("ascii") for token in tokens) != expected_tokens:
                raise SemanticPatchError(
                    "evidence_span_invalid", "SketchPad图标字段顺序或来源证据不匹配。"
                )
        old = tokens[index][2].decode("ascii")
        if old == value:
            raise SemanticPatchError("no_change", "操作没有产生字段变化。")
        if category == "spatial_icon":
            old_column, old_row = spatial_final_coordinates[object_id]
            spatial_final_coordinates[object_id] = (
                int(value) if field == "column" else old_column,
                int(value) if field == "row" else old_row,
            )
        operation_id = str(uuid5(NAMESPACE_URL, f"{source_hash}:{revision_id}:{object_id}:{kind}:{old}:{value}"))
        operations.append(SemanticOperation(kind, operation_id, object_id, field, old, value, expected_unit, tokens[index][:2]))
    if not operations:
        raise SemanticPatchError("operation_empty", "Patch必须包含至少一个操作。")
    occupied_by_level: dict[int, dict[tuple[int, int], str]] = {}
    for object_id, coordinate in spatial_final_coordinates.items():
        level_number = spatial_levels[object_id]
        occupied = occupied_by_level.setdefault(level_number, {})
        if coordinate in occupied:
            raise SemanticPatchError(
                "spatial_icon_collision", "SketchPad目标网格单元已被另一个图标占用。"
            )
        occupied[coordinate] = object_id
    frozen_operations = tuple(operations)
    return PatchTransaction(
        source_hash,
        identity_hash,
        revision_id,
        frozen_operations,
        _patch_digest(source_hash, identity_hash, revision_id, frozen_operations),
    )


def apply_transaction_to_copy(source: Path, destination: Path, transaction: PatchTransaction) -> None:
    source = Path(source)
    data, digest, _ = _source_snapshot(source)
    if digest != transaction.source_sha256:
        raise SemanticPatchError("source_changed", "源文件已变化，Patch被拒绝。")
    expected = plan_zone_transaction(
        source,
        transaction.revision_id,
        tuple(
            {
                "operation": item.operation,
                "object_id": item.object_id,
                "new_value": item.new_value,
                "unit": item.unit,
            }
            for item in transaction.operations
        ),
        identity_sha256=transaction.identity_sha256,
    )
    if expected != transaction or transaction.patch_sha256 != _patch_digest(
        transaction.source_sha256,
        transaction.identity_sha256,
        transaction.revision_id,
        transaction.operations,
    ):
        raise SemanticPatchError("patch_hash_mismatch", "Patch事务与当前源文件证据不匹配。")
    replacements = sorted(
        ((item.evidence_span, item.old_value.encode("ascii"), item.new_value.encode("ascii")) for item in transaction.operations),
        key=lambda item: item[0][0], reverse=True,
    )
    for (start, end), old, new in replacements:
        if data[start:end] != old:
            raise SemanticPatchError("old_value_changed", "字段旧值已变化，Patch未提交。")
        data = data[:start] + new + data[end:]
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise SemanticPatchError("output_exists", "草稿目标已存在，拒绝覆盖。")
    temp = target.with_name(f".{target.name}.{uuid4().hex}.tmp")
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        # link() is an exclusive final-name creation on Windows/NTFS and
        # POSIX. It cannot replace a competitor that appears after our check.
        try:
            os.link(temp, target)
            temp.unlink()
        except OSError:
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            temp.unlink()
    except FileExistsError as error:
        raise SemanticPatchError("output_exists", "草稿目标已存在，拒绝覆盖。") from error
    except OSError as error:
        raise SemanticPatchError("output_write_failed", "草稿副本写入失败。") from error
    finally:
        try:
            if temp.exists():
                temp.unlink()
        except OSError:
            pass
    try:
        _verify_spatial_application(source, target, transaction)
    except Exception:
        try:
            target.unlink()
        except OSError:
            pass
        raise
