# Batch B：Workbench, Supported Domain and Drafts

```yaml
task_id: BATCH-B
phase: Wave 2-4
checkpoint: B
title: Usable workbench, supported domain, semantic drafts and scenarios
status: in_progress
record_origin: live
started_at_utc: 2026-07-24T10:19:16.6185273Z
ended_at_utc: null
duration_seconds: null
base_commit: 6e4962a67cae3fa01515f7b01cadd661b05d893e
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md Revision 2
task_summary: 把现有Alpha工作台推进为真实Project/Draft/Run/Result/Compare/Report/Attachment/Assistant/Settings/Activity/Evidence工作流，并扩展已验证PRJ语义、Patch、Revision和Scenario边界。
goals:
  - 保护待审Patch期间的所有冲突命令、项目切换和退出路径。
  - 移除假项目、假树、Phase词和占位动作，提供真实安全空态与状态路由。
  - 复用统一语义接口完成支持Profile的对象、Patch、Revision、Scenario和证据展示。
  - 保持未知PRJ只读、原始字节不变和AI/危险能力fail-closed。
allowed_scope:
  - src、src-tauri/src、python/src、contracts、scripts/tests、docs/development/task-log、docs/architecture、docs/product、docs/ui。
forbidden_scope:
  - F:\\CONTAM Studio原工作区、用户PRJ/SIM/CSV、真实AppData、凭据、系统设置、全局依赖、推送和发布。
validation:
  - 开发中运行受影响的前端/Python/Rust定向测试；Batch B结束时运行一次Full和git diff --check。
delivery_status: in_progress
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 外部GUI、真实ContamX/SimRead、干净电脑和用户研究只标记pending_final_acceptance，不冒充自动化证据。
```

## Status ledger

| Card | Status | Evidence / note |
| --- | --- | --- |
| FE-01 | automated_verified | Central Patch review lock, direct callback guards, Escape/Tab handling, and focus restoration are implemented; manual GUI acceptance remains pending_final_acceptance. |
| FE-02 | automated_verified | Dirty unexported drafts route through Cancel/Save-copy-and-open/Discard-and-open guard; picker cancellation and response failures retain the current project. |
| FE-03 | pending | Rust-owned close protocol. |
| FE-04 | pending | Frontend controller split. |
| FE-05 | automated_verified | ActivityBar and settings route to real project/search/run/results/settings destinations; mock tree, mock actions, and Phase labels were removed from rendered states. |
| FE-06 | automated_verified | Project summary and status surfaces expose safe filename, hash prefix, reader/profile, source protection, read-only boundary, and tool readiness without absolute paths. |
| FE-07 | automated_verified | Supported Zone explorer uses stable zone IDs for selection and search navigation; no-project inspector is an explicit empty state. |
| FE-08 | automated_verified | Settings destination now presents language/theme, privacy/AI opt-in, tool readiness, offline help, storage and recovery boundaries; system-level configuration and support export remain pending_final_acceptance. |
| DOM-01 | automated_verified | Fixture manifest binds all tracked PRJ fixtures to provenance, source licence/readme, SHA-256, size, profile, intended test, and exclusions; mutation tests reject identity and derived-output bypasses. |
| DOM-02 | automated_verified | Conservative Python DocumentEnvelope records byte hash/size, ASCII encoding, LF/CRLF/mixed evidence, final newline, bounded line spans, opaque sections and read-only policy; 7 tests plus machine contract pass. |
| DOM-03 | automated_verified | Python SemanticGraph validates stable UUID identity, deterministic ordering, duplicate/dangling/self references and prohibited cycles; UI authority fields are machine-forbidden. |
| DOM-04 | pending | Level and Zone projection. |
| DOM-05 | pending | Airflow paths/components. |
| DOM-06 | pending | Schedules/day types/time profiles. |
| DOM-07 | pending | Species and sources/sinks. |
| DOM-08 | pending | Minimal controls and companions. |
| DOM-09 | pending | Compatibility classification. |
| DOM-10 | pending | Automated domain audit. |
| DRAFT-01 | automated_verified | ADR-015, closed JSON contract, and mutation checks freeze the single verified Zone volume operation and fail-closed authority fields; H-FINAL review remains external. |
| DRAFT-02 | pending | First semantic operation. |
| DRAFT-03 | pending | Second sourced operation or reasoned deferral. |
| DRAFT-04 | pending | Persistent immutable history. |
| DRAFT-05 | pending | Scenario lineage. |
| DRAFT-06 | pending | Approved templates. |
| DRAFT-07 | pending | Scenario workspace. |
| DRAFT-08 | pending | Automated write-path audit. |
