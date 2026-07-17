from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class Diagnostic:
    code: str
    severity: Literal["info", "warning"]
    message: str

    def to_dict(self) -> dict[str, str]:
        return {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
        }


@dataclass(frozen=True, slots=True)
class ZoneInspection:
    number: int
    name: str
    flags: int
    volume_m3: float
    level_number: int
    level_name: str

    def to_dict(self) -> dict[str, int | float | str]:
        return {
            "number": self.number,
            "name": self.name,
            "flags": self.flags,
            "volume_m3": self.volume_m3,
            "level_number": self.level_number,
            "level_name": self.level_name,
        }


@dataclass(frozen=True, slots=True)
class ProjectMetadata:
    contamx_version: str

    def to_dict(self) -> dict[str, str]:
        return {"contamx_version": self.contamx_version}


@dataclass(frozen=True, slots=True)
class ProjectInspection:
    schema_version: str
    source_path: str
    source_sha256: str
    source_size_bytes: int
    read_only: bool
    contamxpy_version: str
    project: ProjectMetadata
    zone_count: int
    first_zone: ZoneInspection
    diagnostics: tuple[Diagnostic, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "source_path": self.source_path,
            "source_sha256": self.source_sha256,
            "source_size_bytes": self.source_size_bytes,
            "read_only": self.read_only,
            "contamxpy_version": self.contamxpy_version,
            "project": self.project.to_dict(),
            "zone_count": self.zone_count,
            "first_zone": self.first_zone.to_dict(),
            "diagnostics": [item.to_dict() for item in self.diagnostics],
        }
