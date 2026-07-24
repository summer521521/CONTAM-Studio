from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import hashlib
from pathlib import Path


class ToolError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class ToolState(StrEnum):
    MISSING = "missing"
    UNSUPPORTED = "unsupported"
    UNVERIFIED = "unverified"
    VERIFIED = "verified"
    CHANGED = "changed"
    BLOCKED = "blocked"


@dataclass(frozen=True, slots=True)
class ToolIdentity:
    tool_id: str
    name: str
    version: str
    sha256: str
    size_bytes: int
    architecture: str
    provenance: str

    def safe_view(self, state: ToolState) -> dict[str, object]:
        return {"tool_id": self.tool_id, "name": self.name, "version": self.version, "sha256_prefix": self.sha256[:12], "size_bytes": self.size_bytes, "architecture": self.architecture, "provenance": self.provenance, "state": state.value}


@dataclass(frozen=True, slots=True)
class ToolRecord:
    identity: ToolIdentity | None
    state: ToolState
    diagnostic: str | None = None


class ToolRegistry:
    def __init__(self) -> None:
        self._records: dict[str, ToolRecord] = {}

    def probe(self, tool_id: str, path: Path, *, expected_name: str, version: str, architecture: str, provenance: str) -> ToolRecord:
        if not tool_id or not expected_name or not version or architecture not in {"x64", "x86", "arm64", "unknown"}:
            raise ToolError("invalid_tool_identity", "工具身份字段不完整。")
        source = Path(path).expanduser().resolve(strict=False)
        if not source.is_file():
            record = ToolRecord(None, ToolState.MISSING, "工具文件不存在。")
            self._records[tool_id] = record
            return record
        if source.name.casefold() != expected_name.casefold():
            record = ToolRecord(None, ToolState.UNSUPPORTED, "工具名称与声明不一致。")
            self._records[tool_id] = record
            return record
        data = source.read_bytes()
        identity = ToolIdentity(tool_id, source.name, version[:64], hashlib.sha256(data).hexdigest(), len(data), architecture, provenance[:120])
        previous = self._records.get(tool_id)
        state = ToolState.VERIFIED
        diagnostic = None
        if previous is not None and previous.identity is not None and previous.identity.sha256 != identity.sha256:
            state = ToolState.CHANGED
            diagnostic = "工具文件哈希发生变化，需要重新确认。"
        record = ToolRecord(identity, state, diagnostic)
        self._records[tool_id] = record
        return record

    def get(self, tool_id: str) -> ToolRecord:
        return self._records.get(tool_id, ToolRecord(None, ToolState.MISSING, "尚未配置工具。"))

    def safe_views(self) -> tuple[dict[str, object], ...]:
        return tuple(record.identity.safe_view(record.state) if record.identity else {"state": record.state.value, "diagnostic": record.diagnostic} for record in self._records.values())
