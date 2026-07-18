from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class ResultDiagnostic:
    code: str
    message: str
    context: dict[str, str | int] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "context": self.context}


@dataclass(frozen=True, slots=True)
class SimReadToolInfo:
    path: str
    name: str
    version: str
    sha256: str
    size_bytes: int
    architecture: str
    provenance: str
    invocation_contract: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "name": self.name,
            "version": self.version,
            "sha256": self.sha256,
            "size_bytes": self.size_bytes,
            "architecture": self.architecture,
            "provenance": self.provenance,
            "invocation_contract": self.invocation_contract,
        }


@dataclass(frozen=True, slots=True)
class ZoneAirStateSample:
    index: int
    day_of_year: int
    day_type: str | None
    sim_time_seconds: float
    temperature_k: float
    reference_pressure_pa: float
    air_density_kg_m3: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "day_of_year": self.day_of_year,
            "day_type": self.day_type,
            "sim_time_seconds": self.sim_time_seconds,
            "temperature_k": self.temperature_k,
            "reference_pressure_pa": self.reference_pressure_pa,
            "air_density_kg_m3": self.air_density_kg_m3,
        }


@dataclass(frozen=True, slots=True)
class ZoneAirStateSeries:
    schema_version: str
    result_type: str
    run_id: str
    extraction_id: str
    zone_number: int
    zone_name: str
    source_line_number: int
    unit_system: str
    sample_count: int
    samples: tuple[ZoneAirStateSample, ...]
    source_evidence: dict[str, Any]
    day_type_source: str = "not_available_in_simread_nfr_v1"
    time_contract: str = "elapsed_seconds_from_first_sample"
    diagnostics: tuple[ResultDiagnostic, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "result_type": self.result_type,
            "run_id": self.run_id,
            "extraction_id": self.extraction_id,
            "zone_number": self.zone_number,
            "zone_name": self.zone_name,
            "source_line_number": self.source_line_number,
            "unit_system": self.unit_system,
            "sample_count": self.sample_count,
            "samples": [sample.to_dict() for sample in self.samples],
            "source_evidence": self.source_evidence,
            "day_type_source": self.day_type_source,
            "time_contract": self.time_contract,
            "diagnostics": [item.to_dict() for item in self.diagnostics],
        }


@dataclass(frozen=True, slots=True)
class RunManifestEvidence:
    path: str
    sha256: str
    unchanged: bool

    def to_dict(self) -> dict[str, Any]:
        return {"path": self.path, "sha256": self.sha256, "unchanged": self.unchanged}


@dataclass(frozen=True, slots=True)
class ResultExtractionManifest:
    schema_version: str
    extraction_id: str
    status: str
    execution_mode: str
    started_at_utc: str
    ended_at_utc: str
    duration_ms: int
    source_run: dict[str, Any]
    run_manifest: RunManifestEvidence
    input_artifacts: tuple[dict[str, Any], ...]
    simread: dict[str, Any] | None
    command: dict[str, Any]
    process: dict[str, Any]
    working_directory: str
    exit_code: int | None
    timed_out: bool
    stdout: dict[str, Any]
    stderr: dict[str, Any]
    generated_outputs: tuple[dict[str, Any], ...]
    result_type: str
    zone_number: int
    parsed_result: dict[str, Any] | None
    diagnostics: tuple[ResultDiagnostic, ...]
    final_evidence: dict[str, bool | None] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "extraction_id": self.extraction_id,
            "status": self.status,
            "execution_mode": self.execution_mode,
            "started_at_utc": self.started_at_utc,
            "ended_at_utc": self.ended_at_utc,
            "duration_ms": self.duration_ms,
            "source_run": self.source_run,
            "run_manifest": self.run_manifest.to_dict(),
            "input_artifacts": list(self.input_artifacts),
            "simread": self.simread,
            "command": self.command,
            "process": self.process,
            "working_directory": self.working_directory,
            "exit_code": self.exit_code,
            "timed_out": self.timed_out,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "generated_outputs": list(self.generated_outputs),
            "result_type": self.result_type,
            "zone_number": self.zone_number,
            "parsed_result": self.parsed_result,
            "final_evidence": self.final_evidence,
            "diagnostics": [item.to_dict() for item in self.diagnostics],
        }
