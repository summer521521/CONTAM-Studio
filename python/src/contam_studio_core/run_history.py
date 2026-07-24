from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from uuid import uuid4


class RunHistoryError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class RunRecord:
    run_id: str
    baseline_sha256: str
    revision_id: str
    scenario_id: str
    status: str
    tool_id: str
    tool_sha256: str
    input_hashes: tuple[str, ...]
    evidence_hash: str
    result_available: bool
    created_at_utc: str

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": "run_history.v1",
            "run_id": self.run_id,
            "baseline_sha256": self.baseline_sha256,
            "revision_id": self.revision_id,
            "scenario_id": self.scenario_id,
            "status": self.status,
            "tool_id": self.tool_id,
            "tool_sha256": self.tool_sha256,
            "input_hashes": list(self.input_hashes),
            "evidence_hash": self.evidence_hash,
            "result_available": self.result_available,
            "created_at_utc": self.created_at_utc,
        }


def make_run_record(*, baseline_sha256: str, revision_id: str, scenario_id: str, status: str, tool_id: str, tool_sha256: str, input_hashes: tuple[str, ...], result_available: bool = False) -> RunRecord:
    if status not in {"queued", "starting", "running", "succeeded", "failed", "timed_out", "cancelled", "unknown_cleanup"}:
        raise RunHistoryError("invalid_run_status", "Run状态不在公开词汇表。")
    if len(baseline_sha256) != 64 or len(tool_sha256) != 64 or any(len(value) != 64 for value in input_hashes):
        raise RunHistoryError("invalid_run_hash", "Run输入身份哈希无效。")
    run_id = str(uuid4())
    evidence_hash = hashlib.sha256(f"{run_id}:{baseline_sha256}:{revision_id}:{scenario_id}:{tool_sha256}:{','.join(sorted(input_hashes))}".encode("ascii")).hexdigest()
    return RunRecord(run_id, baseline_sha256, revision_id, scenario_id, status, tool_id, tool_sha256, tuple(sorted(input_hashes)), evidence_hash, result_available, datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


def write_run_record(root: Path, record: RunRecord) -> Path:
    target_root = Path(root).expanduser().resolve()
    target_root.mkdir(parents=True, exist_ok=True)
    path = target_root / f"{record.run_id}.json"
    if path.exists():
        raise RunHistoryError("run_exists", "Run记录不可覆盖。")
    path.write_text(json.dumps(record.to_dict(), ensure_ascii=False, sort_keys=True), encoding="utf-8")
    return path
