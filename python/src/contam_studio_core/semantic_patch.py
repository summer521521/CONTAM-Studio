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
from .prj_sections import read_prj_sections
from .prj_zone_reader import read_simple_zones

_ALLOWED = {
    "set_zone_volume": ("zone", 7, "volume_m3", "m3"),
    "set_zone_name": ("zone", 10, "name", None),
    "set_flow_path_multiplier": ("flow_path", 14, "multiplier", "1"),
    "set_flow_path_coefficient": ("flow_path", 14, "multiplier", "1"),
}
_ZONE_ID_NAMESPACE = UUID("0c6dfd5d-98c2-5fb3-a9f3-a72ee89a4471")
_NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")
_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,15}$")


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
    return [(start + match.start(), start + match.end(), match.group()) for match in re.finditer(rb"[^ ]+", body)]


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
    document = read_simple_zones(source)
    if document.source_sha256.lower() != source_hash:
        raise SemanticPatchError("source_changed", "源文件在读取期间发生变化。")
    zones = {stable_zone_id(identity_hash, item.contam_number, item.source_line_number): item for item in document.zones}
    paths: dict[str, object] = {}
    try:
        network = project_airflow(read_prj_sections(source))
        paths = {_path_id(identity_hash, item.contam_number, item.source_line_number): item for item in network.paths}
    except (NetworkProjectionError, OSError):
        paths = {}
    operations: list[SemanticOperation] = []
    seen: set[tuple[str, str]] = set()
    for request in requested:
        if not isinstance(request, dict) or set(request) != {"operation", "object_id", "new_value", "unit"}:
            raise SemanticPatchError("operation_invalid", "语义操作字段不完整或包含未知字段。")
        kind = request.get("operation")
        object_id = request.get("object_id")
        value = request.get("new_value")
        unit = request.get("unit")
        if kind not in _ALLOWED or not isinstance(object_id, str) or not isinstance(value, str):
            raise SemanticPatchError("operation_unsupported", "语义操作不受支持。")
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
        else:
            target = paths.get(object_id)
            if target is None or getattr(target, "capability", "opaque") != "inspect":
                raise SemanticPatchError("object_read_only", "目标FlowPath不是可安全保存的对象。")
        if kind == "set_zone_name":
            if not _NAME.fullmatch(value):
                raise SemanticPatchError("value_invalid", "Zone名称必须是15字符以内的安全ASCII记号。")
        else:
            try:
                number = float(value)
            except ValueError as error:
                raise SemanticPatchError("value_invalid", "数值必须是有限ASCII数字。") from error
            if not _NUMBER.fullmatch(value) or not math.isfinite(number) or not 0 < number <= 1e9:
                raise SemanticPatchError("value_invalid", "数值必须是有界有限数。")
        tokens = _line_tokens(data, target.source_line_number)
        if category == "zone" and len(tokens) != 19:
            raise SemanticPatchError("evidence_span_invalid", "目标Zone行不再符合严格Profile。")
        if category == "flow_path" and len(tokens) < 30:
            raise SemanticPatchError("evidence_span_invalid", "目标FlowPath行不再符合严格Profile。")
        old = tokens[index][2].decode("ascii")
        if old == value:
            raise SemanticPatchError("no_change", "操作没有产生字段变化。")
        operation_id = str(uuid5(NAMESPACE_URL, f"{source_hash}:{revision_id}:{object_id}:{kind}:{old}:{value}"))
        operations.append(SemanticOperation(kind, operation_id, object_id, field, old, value, expected_unit, tokens[index][:2]))
    if not operations:
        raise SemanticPatchError("operation_empty", "Patch必须包含至少一个操作。")
    payload = json.dumps(
        {"source_sha256": source_hash, "identity_sha256": identity_hash, "revision_id": revision_id, "operations": [item.to_dict() for item in operations]},
        sort_keys=True, separators=(",", ":"), ensure_ascii=True,
    ).encode("ascii")
    return PatchTransaction(source_hash, identity_hash, revision_id, tuple(operations), _digest(payload))


def apply_transaction_to_copy(source: Path, destination: Path, transaction: PatchTransaction) -> None:
    source = Path(source)
    data, digest, _ = _source_snapshot(source)
    if digest != transaction.source_sha256:
        raise SemanticPatchError("source_changed", "源文件已变化，Patch被拒绝。")
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
