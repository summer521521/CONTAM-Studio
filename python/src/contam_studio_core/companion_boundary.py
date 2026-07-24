from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path


COMPANION_SCHEMA_VERSION = "companion_boundary.v1"
DEFAULT_MAX_BYTES = 50 * 1024 * 1024


class CompanionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class CompanionDeclaration:
    relative_name: str
    expected_sha256: str | None = None
    max_bytes: int = DEFAULT_MAX_BYTES


@dataclass(frozen=True, slots=True)
class CompanionBinding:
    relative_name: str
    sha256: str
    size_bytes: int
    source_path: str

    def to_dict(self) -> dict[str, object]:
        return {
            "relative_name": self.relative_name,
            "sha256": self.sha256,
            "size_bytes": self.size_bytes,
            "source_path": self.source_path,
        }


def _contained(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def bind_companions(root: Path, declarations: tuple[CompanionDeclaration, ...]) -> tuple[CompanionBinding, ...]:
    base = Path(root).expanduser().resolve()
    if not base.is_dir():
        raise CompanionError("root_missing", "Companion根目录不可用。")
    seen: set[str] = set()
    bindings: list[CompanionBinding] = []
    for declaration in declarations:
        relative = declaration.relative_name
        candidate_relative = Path(relative)
        if not relative or candidate_relative.is_absolute() or ".." in candidate_relative.parts:
            raise CompanionError("path_escape", "Companion路径必须是根目录内的显式相对文件。")
        collision_key = relative.replace("\\", "/").casefold()
        if collision_key in seen:
            raise CompanionError("case_collision", "Companion声明存在大小写不敏感冲突。")
        seen.add(collision_key)
        candidate = (base / candidate_relative).resolve(strict=False)
        if not _contained(base, candidate):
            raise CompanionError("path_escape", "Companion路径逃出声明根目录。")
        if candidate.is_symlink():
            raise CompanionError("link_rejected", "Companion符号链接不受支持。")
        if not candidate.is_file():
            raise CompanionError("missing_companion", "声明的Companion文件不存在。")
        try:
            size = candidate.stat().st_size
            if size > declaration.max_bytes or size > DEFAULT_MAX_BYTES:
                raise CompanionError("companion_too_large", "Companion文件超过大小限制。")
            digest = hashlib.sha256(candidate.read_bytes()).hexdigest()
        except OSError as error:
            raise CompanionError("companion_unreadable", "Companion文件无法读取。") from error
        if declaration.expected_sha256 is not None:
            expected = declaration.expected_sha256.lower()
            if len(expected) != 64 or any(character not in "0123456789abcdef" for character in expected):
                raise CompanionError("invalid_expected_hash", "Companion预期哈希无效。")
            if digest != expected:
                raise CompanionError("companion_changed", "Companion哈希与声明不一致。")
        bindings.append(CompanionBinding(relative.replace("\\", "/"), digest, size, str(candidate)))
    return tuple(bindings)
