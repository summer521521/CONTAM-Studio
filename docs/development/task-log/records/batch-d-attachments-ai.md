# Batch D：Attachments and Semantic AI

```yaml
task_id: BATCH-D
phase: Wave 8-10
checkpoint: D
title: Bounded multimodal attachments, semantic AI gateway and complete simulation agent boundaries
status: blocked
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
delivery_status: blocked_not_integrated
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: H-FINAL确认AttachmentBroker和Python AI gateway没有Tauri命令、React入口或Codex App Server接线，且附件类型识别、ZIP/Office/PDF处理、quarantine提交和AI嵌套权限检查仍有安全缺口。它们保留为内部研究代码，不从包顶层导出；本批产品交付状态为blocked。
```

## Status ledger

| Card | Status | Evidence / note |
| --- | --- | --- |
| ATT-01 | policy_only | 分类和上限契约存在，但没有产品入口。 |
| ATT-02 | blocked | quarantine提交未达到并发独占要求，broker未接入桌面。 |
| ATT-03 | blocked | magic、symlink、Unicode碰撞、嵌套和Office外链检查仍需修复。 |
| ATT-04 | foundation_tested | 仅有图片头尺寸检查；无安全衍生图或GUI。 |
| ATT-05 | pending_user | Bounded local PDF classification and evidence are present; visual renderer/licence and scanned-page validation remain pending_final_acceptance. |
| ATT-06 | pending_user | DOCX/PPTX/ODT containers are treated as data with bounded XML text extraction; visual fidelity and renderer review remain pending_final_acceptance. |
| ATT-07 | foundation_tested | CSV/TSV预览函数有定向测试，未接入产品。 |
| ATT-08 | blocked | 通用附件证据路由未接入可信项目/结果生产路径。 |
| ATT-09 | blocked | ZIP拒绝规则不完整，不能作为安全解压器使用。 |
| ATT-10 | blocked | 自动测试未覆盖H-FINAL发现的绕过，不能宣称附件审计完成。 |
| AI-01 | policy_only | 默认关闭和风险分类仅存在于内部契约。 |
| AI-02 | pending_user | Exact live App Server schema proof remains pending; no unverified protocol fields are enabled. |
| AI-03 | pending_user | Existing Rust read-only App Server adapter remains the only live provider path; modular Python policy boundary is added without claiming live provider changes. |
| AI-04 | blocked | 顶层路径检查可被嵌套对象绕过，且未接入现有Rust披露路径。 |
| AI-05 | blocked | Python gateway未接入App Server，不能代表生产语义工具。 |
| AI-06 | blocked | ApprovalBroker缺少完整TTL上限、生产身份重绑定和持久化。 |
| AI-07 | foundation_tested | SimulationPlan只是数据模型，不会自动完成仿真。 |
| AI-08 | pending_user | Remote multimodal transport remains disabled until exact provider schema and user disclosure evidence are available. |
| AI-09 | blocked | Trace未接入生产路径，且写入提交仍需并发独占修复。 |
| AI-10 | pending_user | Existing Assistant workbench remains read-only; full multimodal GUI and accessibility acceptance remain pending_final_acceptance. |
| AI-11 | blocked | 状态改变AI尚未实现；现有产品仍严格只读。 |
