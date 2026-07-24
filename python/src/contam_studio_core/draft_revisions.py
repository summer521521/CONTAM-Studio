from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5


REVISION_SCHEMA_VERSION = "draft_revision.v1"
SCENARIO_SCHEMA_VERSION = "scenario.v1"


class RevisionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class RevisionRecord:
    revision_id: str
    baseline_sha256: str
    revision_sha256: str
    revision_number: int
    parent_revision_id: str | None
    relative_path: str
    status: str
    patch_type: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": REVISION_SCHEMA_VERSION,
            "revision_id": self.revision_id,
            "baseline_sha256": self.baseline_sha256,
            "revision_sha256": self.revision_sha256,
            "revision_number": self.revision_number,
            "parent_revision_id": self.parent_revision_id,
            "relative_path": self.relative_path,
            "status": self.status,
            "patch_type": self.patch_type,
        }


class RevisionStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root).expanduser().resolve()
        self.revisions_root = self.root / "revisions"
        self.manifests_root = self.root / "manifests"
        self.revisions_root.mkdir(parents=True, exist_ok=True)
        self.manifests_root.mkdir(parents=True, exist_ok=True)

    def commit_copy(
        self,
        source_path: Path,
        *,
        baseline_sha256: str,
        parent_revision_id: str | None,
        revision_number: int,
        patch_type: str | None,
    ) -> RevisionRecord:
        source = Path(source_path).expanduser().resolve()
        if not source.is_file():
            raise RevisionError("revision_source_missing", "Revision源文件不存在。")
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if len(baseline_sha256) != 64 or any(character not in "0123456789abcdef" for character in baseline_sha256.lower()):
            raise RevisionError("invalid_baseline_hash", "Revision基线哈希无效。")
        if revision_number < 0:
            raise RevisionError("invalid_revision_number", "Revision序号无效。")
        revision_id = str(uuid5(NAMESPACE_URL, f"contam-studio:{baseline_sha256}:revision:{revision_number}:{digest}"))
        relative = Path("revisions") / f"{revision_id}.prj"
        target = self.root / relative
        if target.exists():
            raise RevisionError("duplicate_revision", "同一Revision不可重复提交。")
        temp = target.with_suffix(".tmp")
        temp.write_bytes(data)
        try:
            os.replace(temp, target)
        except OSError as error:
            temp.unlink(missing_ok=True)
            raise RevisionError("revision_commit_failed", "Revision内容提交失败。") from error
        record = RevisionRecord(revision_id, baseline_sha256.lower(), digest, revision_number, parent_revision_id, relative.as_posix(), "active", patch_type)
        manifest = self.manifests_root / f"{revision_id}.json"
        manifest_temp = manifest.with_suffix(".tmp")
        manifest_temp.write_text(json.dumps(record.to_dict(), ensure_ascii=False, sort_keys=True), encoding="utf-8")
        try:
            os.replace(manifest_temp, manifest)
        except OSError as error:
            manifest_temp.unlink(missing_ok=True)
            target.unlink(missing_ok=True)
            raise RevisionError("revision_manifest_failed", "Revision清单提交失败。") from error
        return record

    def commit_zone_volume_patch(self, source_path: Path, patch, *, revision_number: int, parent_revision_id: str | None):
        """Apply the already-approved single operation, reread it, then commit its immutable copy."""
        from .domain_projection import project_levels_and_zones
        from .prj_zone_reader import read_simple_zones
        from .zone_volume_patch import apply_zone_volume_patch_to_copy

        source = Path(source_path).expanduser().resolve()
        target = self.revisions_root / f"pending-{revision_number}-{patch.target.contam_number}.prj"
        target.unlink(missing_ok=True)
        result = apply_zone_volume_patch_to_copy(source, patch, target)
        reread = read_simple_zones(target)
        project_levels_and_zones(reread)
        record = self.commit_copy(
            target,
            baseline_sha256=patch.source_sha256,
            parent_revision_id=parent_revision_id,
            revision_number=revision_number,
            patch_type=patch.patch_type,
        )
        target.unlink(missing_ok=True)
        if result.output_sha256 != record.revision_sha256:
            raise RevisionError("revision_hash_mismatch", "Patch结果与Revision清单哈希不一致。")
        return record

    def load(self, revision_id: str) -> RevisionRecord:
        if not revision_id or Path(revision_id).name != revision_id:
            raise RevisionError("invalid_revision_id", "Revision ID不是安全单值。")
        manifest = self.manifests_root / f"{revision_id}.json"
        try:
            payload = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RevisionError("recovery_required", "Revision清单损坏或缺失。") from error
        if payload.get("schema_version") != REVISION_SCHEMA_VERSION or payload.get("revision_id") != revision_id:
            raise RevisionError("recovery_required", "Revision清单身份不匹配。")
        record = RevisionRecord(
            revision_id=payload["revision_id"],
            baseline_sha256=payload["baseline_sha256"],
            revision_sha256=payload["revision_sha256"],
            revision_number=payload["revision_number"],
            parent_revision_id=payload.get("parent_revision_id"),
            relative_path=payload["relative_path"],
            status=payload["status"],
            patch_type=payload.get("patch_type"),
        )
        target = (self.root / record.relative_path).resolve(strict=False)
        try:
            target.relative_to(self.root)
            actual = hashlib.sha256(target.read_bytes()).hexdigest()
        except (OSError, ValueError) as error:
            raise RevisionError("recovery_required", "Revision内容路径或文件不可验证。") from error
        if actual != record.revision_sha256:
            raise RevisionError("recovery_required", "Revision内容哈希不匹配。")
        return record


@dataclass(frozen=True, slots=True)
class ScenarioRecord:
    scenario_id: str
    baseline_sha256: str
    name: str
    purpose: str
    assumptions: tuple[str, ...]
    variables: tuple[tuple[str, str], ...]
    parent_scenario_id: str | None
    revision_id: str
    expected_result: str
    status: str
    evidence_ids: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": SCENARIO_SCHEMA_VERSION,
            "scenario_id": self.scenario_id,
            "baseline_sha256": self.baseline_sha256,
            "name": self.name,
            "purpose": self.purpose,
            "assumptions": list(self.assumptions),
            "variables": {key: value for key, value in self.variables},
            "parent_scenario_id": self.parent_scenario_id,
            "revision_id": self.revision_id,
            "expected_result": self.expected_result,
            "status": self.status,
            "evidence_ids": list(self.evidence_ids),
        }


class ScenarioCatalog:
    def __init__(self) -> None:
        self._items: dict[str, ScenarioRecord] = {}

    def create(
        self,
        baseline_sha256: str,
        name: str,
        *,
        purpose: str,
        assumptions: tuple[str, ...],
        variables: tuple[tuple[str, str], ...],
        revision_id: str,
        parent_scenario_id: str | None = None,
        expected_result: str = "pending",
        evidence_ids: tuple[str, ...] = (),
    ) -> ScenarioRecord:
        if not name or len(name) > 80 or not name.isascii() or any(character.isspace() for character in name):
            raise RevisionError("invalid_scenario_name", "Scenario名称必须是有限ASCII标识。")
        if any(key == "" or not key.isascii() for key, _ in variables):
            raise RevisionError("invalid_scenario_variable", "Scenario变量名称必须是ASCII标识。")
        if parent_scenario_id is not None:
            parent = self._items.get(parent_scenario_id)
            if parent is None:
                raise RevisionError("scenario_parent_missing", "Scenario父节点不存在。")
            if parent.baseline_sha256 != baseline_sha256:
                raise RevisionError("cross_baseline_scenario", "Scenario不得跨基线分支。")
        if any(item.name.casefold() == name.casefold() for item in self._items.values()):
            raise RevisionError("duplicate_scenario_name", "同一Catalog中的Scenario名称必须唯一。")
        scenario_id = str(uuid5(NAMESPACE_URL, f"contam-studio:{baseline_sha256}:scenario:{name}:{revision_id}"))
        record = ScenarioRecord(scenario_id, baseline_sha256.lower(), name, purpose, assumptions, tuple(sorted(variables)), parent_scenario_id, revision_id, expected_result, "draft", evidence_ids)
        self._items[scenario_id] = record
        return record

    def get(self, scenario_id: str) -> ScenarioRecord:
        try:
            return self._items[scenario_id]
        except KeyError as error:
            raise RevisionError("scenario_missing", "Scenario不存在。") from error

    def list(self) -> tuple[ScenarioRecord, ...]:
        return tuple(sorted(self._items.values(), key=lambda item: (item.name.casefold(), item.scenario_id)))


@dataclass(frozen=True, slots=True)
class TemplateManifest:
    template_id: str
    source_relative_path: str
    source_sha256: str
    profile: str
    licence: str
    parameter_map: tuple[tuple[str, str], ...]
    required_inputs: tuple[str, ...]
    allowed_operations: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "template_id": self.template_id,
            "source_relative_path": self.source_relative_path,
            "source_sha256": self.source_sha256,
            "profile": self.profile,
            "licence": self.licence,
            "parameter_map": {key: value for key, value in self.parameter_map},
            "required_inputs": list(self.required_inputs),
            "allowed_operations": list(self.allowed_operations),
        }


def load_trusted_template(root: Path, manifest: TemplateManifest) -> Path:
    source = (Path(root).expanduser().resolve() / manifest.source_relative_path).resolve()
    try:
        source.relative_to(Path(root).expanduser().resolve())
        data = source.read_bytes()
    except (OSError, ValueError) as error:
        raise RevisionError("template_missing", "模板文件不可用。") from error
    digest = hashlib.sha256(data).hexdigest()
    if digest != manifest.source_sha256.lower():
        raise RevisionError("template_changed", "模板哈希与清单不一致。")
    if manifest.licence not in {"NIST-public-domain", "project-authored-permissive"}:
        raise RevisionError("template_licence_unverified", "模板许可未通过首版策略。")
    return source
