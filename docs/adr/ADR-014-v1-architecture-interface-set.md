# ADR-014：v1 Architecture Interface Set

## 状态

`candidate_for_h_final`。本ADR冻结自动化候选的跨层接口方向；具体实现必须遵守现有Rust/Python/Tauri契约并逐步替换旧Phase命名。

## Interfaces

| Interface | Owner | Input | Output | Invariant |
| --- | --- | --- | --- | --- |
| `DocumentIndex` | Rust + Python | external source identity | compatibility, safe object index, unknown summary | source bytes unchanged; unknown is read-only |
| `SemanticGraph` | Python | supported document envelope | stable object IDs, references, units | no inferred references or renumbering |
| `PatchTransaction` | Rust/Python | baseline/current hashes, typed operation, preconditions | immutable revision + Diff | apply to copy only; reparse before publish |
| `ProcessController` | Rust | approved tool, args, owned workspace, deadline | lifecycle state and evidence | Job-owned, bounded, no late success |
| `OwnedArtifactStore` | Rust | artifact metadata and bytes | indexed artifact/citation | quotas, ownership, migration and cleanup rules |
| `ResultStore` | Rust + Python | verified run/result | paged typed samples and stats | input/tool/result identity bound |
| `AttachmentBroker` | Rust | explicit file selection | sanitized derivative + citation | limits, active-content rejection, disclosure receipt |
| `AiGateway` | Rust | selected evidence + mode | bounded answer/plan/action bundle | no generic tools; approval hash and expiry |
| `Packaging` | build pipeline | frozen worker/dependencies/notices | unsigned local installer candidate | reproducible manifest; no unknown binary licence |
| `Observability` | Rust | safe lifecycle events | local activity/evidence index | no credentials, raw paths or hidden upload |

## Version and migration

Every interface has a versioned closed JSON/Rust model, rejects unknown fields at trust boundaries, carries a generation or revision binding, and provides a fail-closed diagnostic. Stored artifact schemas migrate by ADR-013 copy/hash/parse/atomic activation; newer schemas open recovery/read-only.

## Dependency policy

Project-scoped dependencies require a locked version, permissive licence evidence, maintenance check, alternative assessment, package-size/native-cost note and notice entry. Existing Tauri transitive Windows crates may be used directly only with minimal features and no global install.
