from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4


ARTIFACT_SCHEMA_VERSION = "owned_artifact.v1"
SOFT_QUOTA_BYTES = 10 * 1024**3
HARD_QUOTA_BYTES = 20 * 1024**3
RECLAIM_AFTER = timedelta(hours=24)
CATEGORIES = frozenset({"revision", "run", "result", "report_evidence", "attachment_derivative", "ai_archive", "cache", "temporary", "quarantine"})


class ArtifactError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class ArtifactManifest:
    artifact_id: str
    category: str
    relative_path: str
    size_bytes: int
    created_at_utc: str
    last_used_at_utc: str
    sha256: str
    dependencies: tuple[str, ...]
    status: str
    pinned: bool = False
    report_referenced: bool = False

    def to_dict(self) -> dict[str, object]:
        return {
            "artifact_id": self.artifact_id,
            "schema_version": ARTIFACT_SCHEMA_VERSION,
            "category": self.category,
            "relative_path": self.relative_path,
            "size_bytes": self.size_bytes,
            "created_at_utc": self.created_at_utc,
            "last_used_at_utc": self.last_used_at_utc,
            "sha256": self.sha256,
            "dependencies": list(self.dependencies),
            "status": self.status,
            "pinned": self.pinned,
            "report_referenced": self.report_referenced,
        }


class OwnedArtifactStore:
    def __init__(self, root: Path, *, soft_quota_bytes: int = SOFT_QUOTA_BYTES, hard_quota_bytes: int = HARD_QUOTA_BYTES) -> None:
        if not 0 < soft_quota_bytes < hard_quota_bytes:
            raise ArtifactError("invalid_quota", "Artifact配额必须满足软配额小于硬配额。")
        self.root = Path(root).expanduser().resolve()
        self.manifest_root = self.root / "manifests"
        self.soft_quota_bytes = soft_quota_bytes
        self.hard_quota_bytes = hard_quota_bytes
        self.manifest_root.mkdir(parents=True, exist_ok=True)
        for category in CATEGORIES:
            (self.root / category).mkdir(parents=True, exist_ok=True)

    def _used(self) -> int:
        total = 0
        for path in self.root.rglob("*"):
            if path.is_file() and self.manifest_root not in path.parents:
                total += path.stat().st_size
        return total

    def put(self, category: str, relative_name: str, data: bytes, *, dependencies: tuple[str, ...] = (), status: str = "active") -> ArtifactManifest:
        if category not in CATEGORIES:
            raise ArtifactError("invalid_category", "Artifact类别不受支持。")
        if not relative_name or Path(relative_name).is_absolute() or ".." in Path(relative_name).parts:
            raise ArtifactError("path_escape", "Artifact路径必须是受控相对路径。")
        if self._used() + len(data) > self.hard_quota_bytes:
            raise ArtifactError("hard_quota", "硬配额已达到，持久对象不会被自动删除。")
        artifact_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        relative = (Path(category) / relative_name).as_posix()
        target = self.root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            raise ArtifactError("output_exists", "Artifact目标已存在，不覆盖。")
        temp = target.with_name(f".{target.name}.{artifact_id}.tmp")
        temp.write_bytes(data)
        try:
            os.replace(temp, target)
        except OSError as error:
            temp.unlink(missing_ok=True)
            raise ArtifactError("commit_failed", "Artifact内容提交失败。") from error
        manifest = ArtifactManifest(artifact_id, category, relative, len(data), now, now, hashlib.sha256(data).hexdigest(), tuple(sorted(set(dependencies))), status)
        manifest_path = self.manifest_root / f"{artifact_id}.json"
        manifest_temp = manifest_path.with_suffix(".tmp")
        manifest_temp.write_text(json.dumps(manifest.to_dict(), ensure_ascii=False, sort_keys=True), encoding="utf-8")
        try:
            os.replace(manifest_temp, manifest_path)
        except OSError as error:
            manifest_temp.unlink(missing_ok=True)
            target.unlink(missing_ok=True)
            raise ArtifactError("manifest_commit_failed", "Artifact清单提交失败。") from error
        return manifest

    def list_manifests(self) -> tuple[ArtifactManifest, ...]:
        values: list[ArtifactManifest] = []
        for path in sorted(self.manifest_root.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                values.append(ArtifactManifest(payload["artifact_id"], payload["category"], payload["relative_path"], payload["size_bytes"], payload["created_at_utc"], payload["last_used_at_utc"], payload["sha256"], tuple(payload["dependencies"]), payload["status"], bool(payload.get("pinned")), bool(payload.get("report_referenced"))))
            except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
                raise ArtifactError("recovery_required", "Artifact清单损坏，需要恢复模式。") from error
        return tuple(values)

    def preview_cleanup(self, *, now: datetime | None = None) -> tuple[ArtifactManifest, ...]:
        now = now or datetime.now(timezone.utc)
        candidates: list[ArtifactManifest] = []
        for manifest in self.list_manifests():
            if manifest.category not in {"cache", "temporary"} or manifest.pinned or manifest.report_referenced:
                continue
            try:
                last_used = datetime.fromisoformat(manifest.last_used_at_utc.replace("Z", "+00:00"))
            except ValueError:
                continue
            if now - last_used >= RECLAIM_AFTER:
                candidates.append(manifest)
        return tuple(candidates)

    def delete_owned(self, artifact_ids: tuple[str, ...], *, confirm: bool) -> tuple[str, ...]:
        if not confirm:
            raise ArtifactError("confirmation_required", "清理必须先展示并确认预览。")
        by_id = {item.artifact_id: item for item in self.list_manifests()}
        deleted: list[str] = []
        for artifact_id in artifact_ids:
            manifest = by_id.get(artifact_id)
            if manifest is None or manifest.category not in {"cache", "temporary"} or manifest.pinned or manifest.report_referenced:
                raise ArtifactError("cleanup_forbidden", "目标不是可回收的Studio-owned临时对象。")
            target = self.root / manifest.relative_path
            target.resolve().relative_to(self.root)
            target.unlink(missing_ok=True)
            (self.manifest_root / f"{manifest.artifact_id}.json").unlink(missing_ok=True)
            deleted.append(artifact_id)
        return tuple(deleted)
