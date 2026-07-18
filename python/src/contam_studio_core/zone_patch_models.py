from __future__ import annotations

from dataclasses import dataclass

Scalar = bool | float | int | str


@dataclass(frozen=True, slots=True)
class PatchDiagnostic:
    code: str
    message: str
    source_line_number: int | None = None
    context: dict[str, Scalar] | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "code": self.code,
            "message": self.message,
            "source_line_number": self.source_line_number,
            "context": self.context or {},
        }


@dataclass(frozen=True, slots=True)
class PatchTarget:
    contam_number: int
    zone_name: str
    source_line_number: int
    field: str
    token_index: int
    byte_start: int
    byte_end: int

    def to_dict(self) -> dict[str, object]:
        return {
            "contam_number": self.contam_number,
            "zone_name": self.zone_name,
            "source_line_number": self.source_line_number,
            "field": self.field,
            "token_index": self.token_index,
            "byte_start": self.byte_start,
            "byte_end": self.byte_end,
        }


@dataclass(frozen=True, slots=True)
class PatchPreconditions:
    source_sha256: str
    source_size_bytes: int
    reader_mode: str
    header_version: str
    contam_number: int
    source_line_number: int
    old_token: str
    old_value: float

    def to_dict(self) -> dict[str, object]:
        return {
            "source_sha256": self.source_sha256,
            "source_size_bytes": self.source_size_bytes,
            "reader_mode": self.reader_mode,
            "header_version": self.header_version,
            "contam_number": self.contam_number,
            "source_line_number": self.source_line_number,
            "old_token": self.old_token,
            "old_value": self.old_value,
        }


@dataclass(frozen=True, slots=True)
class PatchReplacement:
    new_token: str
    new_value: float

    def to_dict(self) -> dict[str, object]:
        return {"new_token": self.new_token, "new_value": self.new_value}


@dataclass(frozen=True, slots=True)
class PatchPreview:
    source_line_number: int
    old_token: str
    new_token: str
    old_line: str
    new_line: str

    def to_dict(self) -> dict[str, object]:
        return {
            "source_line_number": self.source_line_number,
            "old_token": self.old_token,
            "new_token": self.new_token,
            "old_line": self.old_line,
            "new_line": self.new_line,
        }


@dataclass(frozen=True, slots=True)
class ZoneVolumePatch:
    schema_version: str
    patch_type: str
    source_path: str
    source_sha256: str
    source_size_bytes: int
    reader_mode: str
    header_version: str
    target: PatchTarget
    preconditions: PatchPreconditions
    replacement: PatchReplacement
    preview: PatchPreview
    status: str

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "patch_type": self.patch_type,
            "source_path": self.source_path,
            "source_sha256": self.source_sha256,
            "source_size_bytes": self.source_size_bytes,
            "reader_mode": self.reader_mode,
            "header_version": self.header_version,
            "target": self.target.to_dict(),
            "preconditions": self.preconditions.to_dict(),
            "replacement": self.replacement.to_dict(),
            "preview": self.preview.to_dict(),
            "status": self.status,
        }


@dataclass(frozen=True, slots=True)
class PatchApplicationResult:
    schema_version: str
    patch_type: str
    status: str
    source_path: str
    source_sha256: str
    source_size_bytes: int
    source_unchanged: bool
    output_path: str
    output_sha256: str
    output_size_bytes: int
    target: PatchTarget
    old_token: str
    new_token: str
    old_value: float
    new_value: float
    verification: tuple[str, ...]
    generated_artifacts: tuple[str, ...]
    diagnostics: tuple[PatchDiagnostic, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "patch_type": self.patch_type,
            "status": self.status,
            "source_path": self.source_path,
            "source_sha256": self.source_sha256,
            "source_size_bytes": self.source_size_bytes,
            "source_unchanged": self.source_unchanged,
            "output_path": self.output_path,
            "output_sha256": self.output_sha256,
            "output_size_bytes": self.output_size_bytes,
            "target": self.target.to_dict(),
            "old_token": self.old_token,
            "new_token": self.new_token,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "verification": list(self.verification),
            "generated_artifacts": list(self.generated_artifacts),
            "diagnostics": [diagnostic.to_dict() for diagnostic in self.diagnostics],
        }
