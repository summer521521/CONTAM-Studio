# Batch D：Attachments and Semantic AI

```yaml
task_id: BATCH-D
phase: Wave 8-10
checkpoint: D
title: Bounded multimodal attachments, semantic AI gateway and complete simulation agent boundaries
status: automated_verified
record_origin: live
started_at_utc: 2026-07-24T12:18:47Z
ended_at_utc: 2026-07-24T12:39:13.9859801Z
duration_seconds: 1226.985
base_commit: 24cb7aa
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md Revision 2
task_summary: 在本地优先、最小披露和固定语义工具边界内实现附件安全接收、证据衍生物、AI EvidenceBundle、批准Broker、规划和审计轨迹。
goals:
  - 所有附件从显式选择进入owned quarantine，分类、哈希、资源上限和主动内容拒绝可验证。
  - AI只接收用户选中的有界证据，不接收路径、原始PRJ、Shell或通用文件能力。
  - 计划、批准、语义工具和Trace可重放、可撤销、可审计，核心离线流程不依赖AI。
allowed_scope:
  - src、src-tauri/src、python/src、contracts、scripts/tests、docs/development/task-log、docs/architecture、docs/product、docs/ui、docs/ai
forbidden_scope:
  - F:\CONTAM Studio原工作区、用户PRJ/SIM/CSV、真实AppData、凭据、系统设置、全局依赖、远程传输、发布
validation:
  - 开发中运行受影响的Python/Rust/前端定向测试；Batch D结束时运行一次Full和git diff --check。
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Batch D功能、契约、Python/前端/Rust测试已纳入Batch E两次干净Full；PDF/Office真实渲染、远程App Server、用户披露和GUI验收标记pending_final_acceptance；当前实现不执行宏、脚本、公式、嵌入二进制或远程发送。
```

## Status ledger

| Card | Status | Evidence / note |
| --- | --- | --- |
| ATT-01 | automated_verified | Closed attachment taxonomy, limits, local-only default, evidence citation and privacy contract. |
| ATT-02 | automated_verified | AttachmentBroker explicitly classifies, hashes and copies into owned quarantine; safe views omit absolute paths and removal only deletes owned copies. |
| ATT-03 | automated_verified | ZIP traversal/encryption/executable/compression limits, PDF active-content refusal, image dimension limits and Office macro/external-link refusal are enforced before expensive work. |
| ATT-04 | automated_verified | PNG/JPEG header dimensions and pixel cap are validated; sanitized derivative/EXIF stripping remains pending_final_acceptance because no renderer is enabled. |
| ATT-05 | pending_user | Bounded local PDF classification and evidence are present; visual renderer/licence and scanned-page validation remain pending_final_acceptance. |
| ATT-06 | pending_user | DOCX/PPTX/ODT containers are treated as data with bounded XML text extraction; visual fidelity and renderer review remain pending_final_acceptance. |
| ATT-07 | automated_verified | CSV/TSV previews enforce row/column/cell caps and keep formulas as untrusted data; no Excel automation or formula execution exists. |
| ATT-08 | automated_verified | Text/structured/CONTAM artifact categories route through bounded evidence or trusted project/result paths; unsupported encodings fail closed. |
| ATT-09 | automated_verified | ZIP entries are enumerated before extraction and reject traversal, collisions, encryption, executable content and expansion limits. |
| ATT-10 | automated_verified | Attachment/AI contract and local tests cover path privacy, limits, active-content refusal, local-only disclosure and safe unsupported states. |
| AI-01 | automated_verified | AI policy is disabled-by-default and separates local evidence, user-selected disclosure, patch and action-bundle approval risks. |
| AI-02 | pending_user | Exact live App Server schema proof remains pending; no unverified protocol fields are enabled. |
| AI-03 | pending_user | Existing Rust read-only App Server adapter remains the only live provider path; modular Python policy boundary is added without claiming live provider changes. |
| AI-04 | automated_verified | AiEvidenceBundle is hash-bound, bounded, expiring and path/raw-PRJ rejecting with exact preview serialization. |
| AI-05 | automated_verified | DomainToolGateway exposes only fixed read-only semantic tools and rejects path/Shell/raw-content authority. |
| AI-06 | automated_verified | ApprovalBroker binds exact action hash, user, risk, expiry and single-use consumption. |
| AI-07 | automated_verified | SimulationPlan records evidence, open questions, assumptions, actions, risks and explicit stop reason; hidden defaults are rejected. |
| AI-08 | pending_user | Remote multimodal transport remains disabled until exact provider schema and user disclosure evidence are available. |
| AI-09 | automated_verified | AiTrace stores provider/model label, bundle hash, policy decisions and citations without credentials or paths. |
| AI-10 | pending_user | Existing Assistant workbench remains read-only; full multimodal GUI and accessibility acceptance remain pending_final_acceptance. |
| AI-11 | automated_verified | Automated attachment/AI authority audit is complete; state-changing AI mode remains feature-gated behind the existing Patch/approval contract. |
