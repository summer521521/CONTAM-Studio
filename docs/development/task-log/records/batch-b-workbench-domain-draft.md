# Batch B：Workbench, Supported Domain and Drafts

```yaml
task_id: BATCH-B
phase: Wave 2-4
checkpoint: B
title: Usable workbench, supported domain, semantic drafts and scenarios
status: automated_verified
record_origin: live
started_at_utc: 2026-07-24T10:19:16.6185273Z
ended_at_utc: 2026-07-24T12:18:47.2523574Z
duration_seconds: 7190.634
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
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: DOM-05至DOM-10与DRAFT-02、DRAFT-04至DRAFT-08已自动验证；DRAFT-03因缺少第二个有来源语义黄金保留pending_user。Batch B唯一Full在惰性导入修复前发现CLI JSON警告回归并失败；随后定向CLI测试5项、Python/Rust/前端已有验证均通过，按规则未重复同一批Full。外部GUI、真实ContamX/SimRead、干净电脑和用户研究只标记pending_final_acceptance，不冒充自动化证据。
```

## Status ledger

| Card | Status | Evidence / note |
| --- | --- | --- |
| FE-01 | automated_verified | Central Patch review lock, direct callback guards, Escape/Tab handling, and focus restoration are implemented; manual GUI acceptance remains pending_final_acceptance. |
| FE-02 | automated_verified | Dirty unexported drafts route through Cancel/Save-copy-and-open/Discard-and-open guard; picker cancellation and response failures retain the current project. |
| FE-03 | automated_verified | Rust-owned close protocol intercepts Tauri close requests, tracks safe activity summaries, requires explicit draft cancel/discard/export decisions, and refuses to report active work as stopped; GUI and real process cleanup remain pending_final_acceptance. |
| FE-04 | automated_verified | Project/Draft, Run, Result, and read-only AI controllers are extracted with request/generation invalidation preserved; the empty Attachment controller was intentionally not created and the real controller is scheduled with ATT-02. |
| FE-05 | automated_verified | ActivityBar and settings route to real project/search/run/results/settings destinations; mock tree, mock actions, and Phase labels were removed from rendered states. |
| FE-06 | automated_verified | Project summary and status surfaces expose safe filename, hash prefix, reader/profile, source protection, read-only boundary, and tool readiness without absolute paths. |
| FE-07 | automated_verified | Supported Zone explorer uses stable zone IDs for selection and search navigation; no-project inspector is an explicit empty state. |
| FE-08 | automated_verified | Settings destination now presents language/theme, privacy/AI opt-in, tool readiness, offline help, storage and recovery boundaries; system-level configuration and support export remain pending_final_acceptance. |
| DOM-01 | automated_verified | Fixture manifest binds all tracked PRJ fixtures to provenance, source licence/readme, SHA-256, size, profile, intended test, and exclusions; mutation tests reject identity and derived-output bypasses. |
| DOM-02 | automated_verified | Conservative Python DocumentEnvelope records byte hash/size, ASCII encoding, LF/CRLF/mixed evidence, final newline, bounded line spans, opaque sections and read-only policy; 7 tests plus machine contract pass. |
| DOM-03 | automated_verified | Python SemanticGraph validates stable UUID identity, deterministic ordering, duplicate/dangling/self references and prohibited cycles; UI authority fields are machine-forbidden. |
| DOM-04 | automated_verified | Added the strict Profile-backed Level/Zone projection with baseline-bound UUID5 identities, units, field capabilities, bounded evidence IDs, and fail-closed range/profile validation; bridge/UI integration remains limited to the existing verified Zone view. |
| DOM-05 | automated_verified | Added strict airflow projection with Outdoor/Zone endpoints, UUID5 path/component identities, finite numeric bounds, supported `plr_orfc`/`plr_leak3` components, and whole-path opaque rejection for control, duct, unknown, self-reference, and unsupported parameter patterns; official fixtures and mutation boundaries pass. |
| DOM-06 | automated_verified | Added immutable typed day/week schedule models with minutes-since-midnight basis, complete 0..1440 coverage, monotonic/finite checks, explicit interpolation, and hash-bound paging cursors. |
| DOM-07 | automated_verified | Added strict species parsing and first-profile source projections for source rate, occupancy proxy, and outdoor concentration with unit/reference/range checks; advanced or nonlinear forms fail closed. |
| DOM-08 | automated_verified | Added explicit Companion declarations with containment, case-collision, symlink, size, and SHA-256 checks; no recursive discovery, PATH, or registry lookup exists. |
| DOM-09 | automated_verified | Added safe compatibility classification for supported_editable, supported_readonly, incompatible, corrupt, missing_companion, and tool_incompatible with bounded reasons/actions and no raw path disclosure. |
| DOM-10 | automated_verified | Added automated domain audit for byte identity, resource bounds, semantic projection, unsupported rejection, and Patch-only write gate; unresolved real-tool/GUI/H review remains final acceptance evidence. |
| DRAFT-01 | automated_verified | ADR-015, closed JSON contract, and mutation checks freeze the single verified Zone volume operation and fail-closed authority fields; H-FINAL review remains external. |
| DRAFT-02 | automated_verified | Existing Zone-volume Patch path is wrapped by RevisionStore commit-after-apply, strict reread, Level/Zone projection, and hash verification; only the approved token changes and source remains untouched. |
| DRAFT-03 | pending_user | No second independently sourced semantic golden is available in the approved fixture corpus; the candidate remains single-operation and no unsupported second writer was invented. H/U final review may promote a sourced operation later. |
| DRAFT-04 | automated_verified | Added commit-last RevisionStore manifests, immutable content hashes, restart load verification, and recovery-required behavior for corrupt or mismatched records. |
| DRAFT-05 | automated_verified | Added ScenarioCatalog with baseline-bound deterministic IDs, parent lineage, sorted variables, duplicate-name rejection, and cross-baseline branch rejection. |
| DRAFT-06 | automated_verified | Added hash- and licence-bound TemplateManifest loading; only source-manifested compatible fixtures with approved licence labels can enter guided instantiation. |
| DRAFT-07 | automated_verified | ScenarioCatalog exposes deterministic safe summaries and exact revision binding for controlled branch management; raw file comparison is not accepted as a scenario identity. |
| DRAFT-08 | automated_verified | Automated write gate is exercised by Patch-only revision tests, supported-domain contract, and existing Rust authority/patch mutation suites; no raw PRJ writer or bypass was enabled. |
