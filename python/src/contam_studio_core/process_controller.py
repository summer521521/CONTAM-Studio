from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import time
from uuid import uuid4


PROCESS_SCHEMA_VERSION = "process_controller.v1"
MAX_OUTPUT_BYTES = 4 * 1024 * 1024


class ProcessError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class ProcessStatus(StrEnum):
    QUEUED = "queued"
    STARTING = "starting"
    RUNNING = "running"
    CANCEL_REQUESTED = "cancel_requested"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    CANCELLED = "cancelled"
    UNKNOWN_CLEANUP = "unknown_cleanup"


@dataclass(frozen=True, slots=True)
class ProcessEvidence:
    operation_id: str
    run_id: str
    status: ProcessStatus
    deadline_monotonic: float
    cancel_reason: str | None
    exit_code: int | None
    pid_proof: bool
    job_proof: bool
    stream_frozen: bool
    cleanup_proof: bool
    generation: int

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": PROCESS_SCHEMA_VERSION,
            "operation_id": self.operation_id,
            "run_id": self.run_id,
            "status": self.status.value,
            "deadline_monotonic": self.deadline_monotonic,
            "cancel_reason": self.cancel_reason,
            "exit_code": self.exit_code,
            "pid_proof": self.pid_proof,
            "job_proof": self.job_proof,
            "stream_frozen": self.stream_frozen,
            "cleanup_proof": self.cleanup_proof,
            "generation": self.generation,
        }


@dataclass(slots=True)
class ProcessLease:
    evidence: ProcessEvidence
    argv: tuple[str, ...]


class ProcessController:
    def __init__(self, *, total_budget_seconds: float = 300.0, now=time.monotonic) -> None:
        if not 0 < total_budget_seconds <= 86_400:
            raise ProcessError("invalid_budget", "进程总预算必须是有限正数。")
        self.total_budget_seconds = total_budget_seconds
        self._now = now
        self._generation = 0
        self._leases: dict[str, ProcessLease] = {}

    def queue(self, argv: tuple[str, ...], *, run_id: str | None = None) -> ProcessLease:
        if not argv or any(not isinstance(item, str) or not item or "\x00" in item for item in argv):
            raise ProcessError("invalid_argv", "进程参数必须是非空字符串且不得包含NUL。")
        self._generation += 1
        operation_id = str(uuid4())
        run_id = run_id or str(uuid4())
        deadline = self._now() + self.total_budget_seconds
        evidence = ProcessEvidence(operation_id, run_id, ProcessStatus.QUEUED, deadline, None, None, False, False, False, False, self._generation)
        lease = ProcessLease(evidence, argv)
        self._leases[operation_id] = lease
        return lease

    def mark_starting(self, operation_id: str, *, job_proof: bool) -> ProcessEvidence:
        lease = self._require(operation_id)
        if lease.evidence.status != ProcessStatus.QUEUED or not job_proof:
            raise ProcessError("job_assignment_required", "必须先建立并绑定Job证明，才能启动进程。")
        lease.evidence = self._replace(lease.evidence, status=ProcessStatus.STARTING, job_proof=True)
        return lease.evidence

    def mark_running(self, operation_id: str, *, pid_proof: bool) -> ProcessEvidence:
        lease = self._require(operation_id)
        if lease.evidence.status != ProcessStatus.STARTING or not pid_proof:
            raise ProcessError("pid_proof_required", "缺少已绑定进程树证明。")
        lease.evidence = self._replace(lease.evidence, status=ProcessStatus.RUNNING, pid_proof=True)
        return lease.evidence

    def request_cancel(self, operation_id: str, reason: str) -> ProcessEvidence:
        lease = self._require(operation_id)
        if lease.evidence.status not in {ProcessStatus.STARTING, ProcessStatus.RUNNING}:
            raise ProcessError("cancel_not_available", "当前进程状态不接受取消。")
        lease.evidence = self._replace(lease.evidence, status=ProcessStatus.CANCEL_REQUESTED, cancel_reason=reason[:160])
        return lease.evidence

    def finish(self, operation_id: str, *, exit_code: int | None, pid_proof: bool, stream_frozen: bool, cleanup_proof: bool) -> ProcessEvidence:
        lease = self._require(operation_id)
        current = lease.evidence
        if current.status in {ProcessStatus.SUCCEEDED, ProcessStatus.FAILED, ProcessStatus.TIMED_OUT, ProcessStatus.CANCELLED, ProcessStatus.UNKNOWN_CLEANUP}:
            raise ProcessError("late_completion", "已结束的Lease拒绝重复完成。")
        if not pid_proof or not stream_frozen:
            status = ProcessStatus.UNKNOWN_CLEANUP
        elif current.status == ProcessStatus.CANCEL_REQUESTED:
            status = ProcessStatus.CANCELLED if cleanup_proof else ProcessStatus.UNKNOWN_CLEANUP
        elif self._now() > current.deadline_monotonic:
            status = ProcessStatus.TIMED_OUT if cleanup_proof else ProcessStatus.UNKNOWN_CLEANUP
        elif cleanup_proof and exit_code == 0:
            status = ProcessStatus.SUCCEEDED
        else:
            status = ProcessStatus.FAILED
        lease.evidence = self._replace(lease.evidence, status=status, exit_code=exit_code, pid_proof=pid_proof, stream_frozen=stream_frozen, cleanup_proof=cleanup_proof)
        return lease.evidence

    def _require(self, operation_id: str) -> ProcessLease:
        try:
            return self._leases[operation_id]
        except KeyError as error:
            raise ProcessError("stale_lease", "进程Lease不存在或已失效。") from error

    @staticmethod
    def _replace(evidence: ProcessEvidence, **changes) -> ProcessEvidence:
        values = {field: getattr(evidence, field) for field in evidence.__dataclass_fields__}
        values.update(changes)
        return ProcessEvidence(**values)
