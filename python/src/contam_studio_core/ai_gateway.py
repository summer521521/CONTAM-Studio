from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum
import hashlib
import json
from pathlib import Path
from uuid import uuid4


class AiError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class DisclosureClass(StrEnum):
    LOCAL_ONLY = "local_only"
    USER_SELECTED = "user_selected"
    REMOTE_OPT_IN = "remote_opt_in"


@dataclass(frozen=True, slots=True)
class EvidenceItem:
    evidence_id: str
    kind: str
    identity: str
    sha256: str
    content: str
    disclosure: DisclosureClass
    citation: str

    def safe_dict(self) -> dict[str, object]:
        return {"evidence_id": self.evidence_id, "kind": self.kind, "identity": self.identity, "sha256": self.sha256, "content": self.content, "disclosure": self.disclosure.value, "citation": self.citation}


@dataclass(frozen=True, slots=True)
class AiEvidenceBundle:
    bundle_id: str
    baseline_sha256: str
    revision_id: str
    items: tuple[EvidenceItem, ...]
    bundle_sha256: str
    expires_at_utc: str

    def preview(self) -> dict[str, object]:
        return {"bundle_id": self.bundle_id, "baseline_sha256": self.baseline_sha256, "revision_id": self.revision_id, "item_count": len(self.items), "items": [item.safe_dict() for item in self.items], "bundle_sha256": self.bundle_sha256, "expires_at_utc": self.expires_at_utc}


def make_evidence_bundle(*, baseline_sha256: str, revision_id: str, items: tuple[EvidenceItem, ...], ttl_minutes: int = 15) -> AiEvidenceBundle:
    if not 1 <= len(items) <= 128 or ttl_minutes <= 0 or ttl_minutes > 60:
        raise AiError("evidence_limit", "EvidenceBundle大小或有效期超出限制。")
    for item in items:
        if len(item.sha256) != 64 or any(character not in "0123456789abcdef" for character in item.sha256.lower()):
            raise AiError("evidence_hash_invalid", "Evidence项目哈希无效。")
        if len(item.content.encode("utf-8")) > 64 * 1024 or "path" in item.kind.casefold() or "raw_prj" in item.kind.casefold():
            raise AiError("evidence_forbidden", "EvidenceBundle包含未允许的原始内容或路径。")
    bundle_id = str(uuid4())
    payload = json.dumps([item.safe_dict() for item in items], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(f"{bundle_id}:{baseline_sha256}:{revision_id}:{payload}".encode("utf-8")).hexdigest()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)).isoformat().replace("+00:00", "Z")
    return AiEvidenceBundle(bundle_id, baseline_sha256, revision_id, items, digest, expires)


class ApprovalRisk(StrEnum):
    READ_ONLY = "read_only"
    PATCH = "patch"
    ACTION_BUNDLE = "action_bundle"
    REMOTE_DISCLOSURE = "remote_disclosure"


@dataclass(frozen=True, slots=True)
class ApprovalRecord:
    approval_id: str
    action_hash: str
    risk: ApprovalRisk
    user_id: str
    expires_at_utc: str
    used: bool = False


class ApprovalBroker:
    def __init__(self) -> None:
        self._records: dict[str, ApprovalRecord] = {}

    def prepare(self, action: dict[str, object], *, risk: ApprovalRisk, user_id: str, ttl_minutes: int = 15) -> ApprovalRecord:
        if risk == ApprovalRisk.READ_ONLY:
            raise AiError("approval_not_required", "只读操作不应伪装为写入批准。")
        serialized = json.dumps(action, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        action_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        approval_id = str(uuid4())
        expires = (datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)).isoformat().replace("+00:00", "Z")
        record = ApprovalRecord(approval_id, action_hash, risk, user_id[:120], expires)
        self._records[approval_id] = record
        return record

    def consume(self, approval_id: str, action: dict[str, object], *, user_id: str) -> ApprovalRecord:
        try:
            record = self._records[approval_id]
        except KeyError as error:
            raise AiError("approval_missing", "批准记录不存在。") from error
        if record.used or record.user_id != user_id:
            raise AiError("approval_replay", "批准记录已使用或用户不匹配。")
        if datetime.now(timezone.utc) >= datetime.fromisoformat(record.expires_at_utc.replace("Z", "+00:00")):
            raise AiError("approval_expired", "批准已过期。")
        action_hash = hashlib.sha256(json.dumps(action, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        if action_hash != record.action_hash:
            raise AiError("approval_action_mismatch", "批准动作哈希不一致。")
        used = ApprovalRecord(record.approval_id, record.action_hash, record.risk, record.user_id, record.expires_at_utc, True)
        self._records[approval_id] = used
        return used


READ_ONLY_TOOLS = frozenset({"inspect_project", "list_objects", "inspect_object", "inspect_revision", "list_runs", "inspect_run", "list_results", "read_result_page", "compute_statistics", "compare_scenarios", "inspect_diagnostic", "inspect_attachment_evidence"})


class DomainToolGateway:
    def __init__(self) -> None:
        self._handlers: dict[str, object] = {}

    def register_read_only(self, name: str, handler) -> None:
        if name not in READ_ONLY_TOOLS:
            raise AiError("tool_not_allowed", "工具不在固定语义工具注册表。")
        self._handlers[name] = handler

    def call(self, name: str, payload: dict[str, object]) -> dict[str, object]:
        if name not in READ_ONLY_TOOLS or name not in self._handlers:
            raise AiError("tool_unavailable", "语义工具未注册或不可用。")
        if any(key.casefold() in {"path", "shell", "command", "raw_prj", "filesystem"} for key in payload):
            raise AiError("unsafe_tool_input", "语义工具不接受路径、Shell或原始PRJ输入。")
        result = self._handlers[name](payload)
        if not isinstance(result, dict) or any(key.casefold() in {"path", "raw_prj", "command"} for key in result):
            raise AiError("unsafe_tool_output", "语义工具输出包含未允许字段。")
        return result


@dataclass(frozen=True, slots=True)
class SimulationPlan:
    plan_id: str
    goal: str
    profile: str
    evidence_ids: tuple[str, ...]
    open_questions: tuple[str, ...]
    assumptions: tuple[tuple[str, str], ...]
    actions: tuple[str, ...]
    risks: tuple[str, ...]
    stop_reason: str | None

    def to_dict(self) -> dict[str, object]:
        return {"schema_version": "simulation_plan.v1", "plan_id": self.plan_id, "goal": self.goal, "profile": self.profile, "evidence_ids": list(self.evidence_ids), "open_questions": list(self.open_questions), "assumptions": {key: value for key, value in self.assumptions}, "actions": list(self.actions), "risks": list(self.risks), "stop_reason": self.stop_reason}


def make_simulation_plan(*, goal: str, profile: str, evidence_ids: tuple[str, ...], open_questions: tuple[str, ...], assumptions: tuple[tuple[str, str], ...], actions: tuple[str, ...], risks: tuple[str, ...], stop_reason: str | None = None) -> SimulationPlan:
    if any("default" in key.casefold() for key, _ in assumptions):
        raise AiError("hidden_default", "SimulationPlan不得把未确认默认值伪装成假设。")
    if len(actions) > 8:
        raise AiError("plan_limit", "SimulationPlan动作数量超过限制。")
    return SimulationPlan(str(uuid4()), goal[:2_000], profile[:120], evidence_ids, open_questions, tuple(sorted(assumptions)), actions, risks, stop_reason)


@dataclass(frozen=True, slots=True)
class AiTrace:
    trace_id: str
    bundle_sha256: str
    provider: str
    model: str
    status: str
    citations: tuple[str, ...]
    policy_decisions: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {"schema_version": "ai_trace.v1", "trace_id": self.trace_id, "bundle_sha256": self.bundle_sha256, "provider": self.provider, "model": self.model, "status": self.status, "citations": list(self.citations), "policy_decisions": list(self.policy_decisions)}


def write_ai_trace(root: Path, trace: AiTrace) -> Path:
    target_root = Path(root).expanduser().resolve()
    target_root.mkdir(parents=True, exist_ok=True)
    target = target_root / f"{trace.trace_id}.json"
    if target.exists():
        raise AiError("trace_exists", "AI Trace不可覆盖。")
    target.write_text(json.dumps(trace.to_dict(), ensure_ascii=False, sort_keys=True), encoding="utf-8")
    return target
