from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ReaderDiagnostic:
    code: str
    message: str
    source_line_number: int | None = None
    context: dict[str, int | str] | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "code": self.code,
            "message": self.message,
            "source_line_number": self.source_line_number,
            "context": self.context or {},
        }


@dataclass(frozen=True, slots=True)
class ZoneDocumentRecord:
    contam_number: int
    name: str
    flags: int
    level_number: int
    relative_height: float
    volume_m3: float
    source_line_number: int

    def to_dict(self) -> dict[str, int | float | str]:
        return {
            "contam_number": self.contam_number,
            "name": self.name,
            "flags": self.flags,
            "level_number": self.level_number,
            "relative_height": self.relative_height,
            "volume_m3": self.volume_m3,
            "source_line_number": self.source_line_number,
        }


@dataclass(frozen=True, slots=True)
class PrjZoneDocument:
    schema_version: str
    reader_mode: str
    source_path: str
    source_sha256: str
    source_size_bytes: int
    source_unchanged: bool
    header_version: str
    header_variant: int
    declared_zone_count: int
    zones: tuple[ZoneDocumentRecord, ...]
    diagnostics: tuple[ReaderDiagnostic, ...]

    @property
    def first_zone(self) -> ZoneDocumentRecord | None:
        return self.zones[0] if self.zones else None

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "reader_mode": self.reader_mode,
            "source_path": self.source_path,
            "source_sha256": self.source_sha256,
            "source_size_bytes": self.source_size_bytes,
            "source_unchanged": self.source_unchanged,
            "header_version": self.header_version,
            "header_variant": self.header_variant,
            "declared_zone_count": self.declared_zone_count,
            "zones": [zone.to_dict() for zone in self.zones],
            "first_zone": None if self.first_zone is None else self.first_zone.to_dict(),
            "diagnostics": [diagnostic.to_dict() for diagnostic in self.diagnostics],
        }
