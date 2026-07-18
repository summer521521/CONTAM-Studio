from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ContamXSolverInfo:
    path: str
    name: str
    version: str
    sha256: str
    size_bytes: int
    architecture: str
    provenance: str

    def to_dict(self) -> dict[str, object]:
        return {
            "path": self.path,
            "name": self.name,
            "version": self.version,
            "sha256": self.sha256,
            "size_bytes": self.size_bytes,
            "architecture": self.architecture,
            "provenance": self.provenance,
        }


@dataclass(frozen=True, slots=True)
class RunInputSnapshot:
    relative_path: str
    source_path: str
    source_sha256: str
    source_size_bytes: int
    snapshot_sha256: str
    snapshot_size_bytes: int
    classification: str = "input_snapshot"
    source_unchanged: bool = True

    def to_dict(self) -> dict[str, object]:
        return {
            "relative_path": self.relative_path,
            "source_path": self.source_path,
            "source_sha256": self.source_sha256,
            "source_size_bytes": self.source_size_bytes,
            "snapshot_sha256": self.snapshot_sha256,
            "snapshot_size_bytes": self.snapshot_size_bytes,
            "classification": self.classification,
            "source_unchanged": self.source_unchanged,
        }


@dataclass(frozen=True, slots=True)
class RunArtifact:
    relative_path: str
    size_bytes: int
    sha256: str
    suffix: str
    classification: str

    def to_dict(self) -> dict[str, object]:
        return {
            "relative_path": self.relative_path,
            "size_bytes": self.size_bytes,
            "sha256": self.sha256,
            "suffix": self.suffix,
            "classification": self.classification,
        }


@dataclass(frozen=True, slots=True)
class RunStreamEvidence:
    relative_path: str
    size_bytes: int
    sha256: str
    truncated: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "relative_path": self.relative_path,
            "size_bytes": self.size_bytes,
            "sha256": self.sha256,
            "truncated": self.truncated,
        }


@dataclass(frozen=True, slots=True)
class RunDiagnostic:
    code: str
    message: str
    context: dict[str, str | int | bool] | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "code": self.code,
            "message": self.message,
            "context": self.context or {},
        }


@dataclass(frozen=True, slots=True)
class ContamXRunManifest:
    schema_version: str
    run_id: str
    status: str
    execution_mode: str
    started_at_utc: str
    ended_at_utc: str
    duration_ms: int
    source: dict[str, Any]
    input_snapshots: tuple[RunInputSnapshot, ...]
    solver: ContamXSolverInfo
    command: dict[str, object]
    working_directory: str
    exit_code: int | None
    timed_out: bool
    stdout: RunStreamEvidence
    stderr: RunStreamEvidence
    artifacts: tuple[RunArtifact, ...]
    diagnostics: tuple[RunDiagnostic, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "run_id": self.run_id,
            "status": self.status,
            "execution_mode": self.execution_mode,
            "started_at_utc": self.started_at_utc,
            "ended_at_utc": self.ended_at_utc,
            "duration_ms": self.duration_ms,
            "source": self.source,
            "input_snapshots": [item.to_dict() for item in self.input_snapshots],
            "solver": self.solver.to_dict(),
            "command": self.command,
            "working_directory": self.working_directory,
            "exit_code": self.exit_code,
            "timed_out": self.timed_out,
            "stdout": self.stdout.to_dict(),
            "stderr": self.stderr.to_dict(),
            "artifacts": [item.to_dict() for item in self.artifacts],
            "diagnostics": [item.to_dict() for item in self.diagnostics],
        }


@dataclass(frozen=True, slots=True)
class ContamXRunResult:
    run_id: str
    status: str
    run_directory: str
    manifest_path: str
    solver_version: str
    exit_code: int | None
    timed_out: bool
    primary_artifacts: tuple[RunArtifact, ...]
    manifest: ContamXRunManifest

    def to_dict(self) -> dict[str, object]:
        return {
            "run_id": self.run_id,
            "status": self.status,
            "run_directory": self.run_directory,
            "manifest_path": self.manifest_path,
            "solver_version": self.solver_version,
            "exit_code": self.exit_code,
            "timed_out": self.timed_out,
            "primary_artifacts": [item.to_dict() for item in self.primary_artifacts],
            "manifest": self.manifest.to_dict(),
        }
