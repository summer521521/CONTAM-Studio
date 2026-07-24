# Batch A：Foundation and Product Baseline

```yaml
task_id: BATCH-A
phase: Wave 0-1
checkpoint: A
title: Foundation recovery and v1 product baseline
status: automated_verified
record_origin: live
started_at_utc: 2026-07-24T10:01:29.5136815Z
ended_at_utc: 2026-07-24T10:17:10.3903417Z
duration_seconds: 940.8766602
base_commit: d0d9b5a46c11a649c2c34fc32f998136c17ce909
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md Revision 2
task_summary: 从FND-07继续完成基础进程/存储政策、自动化基础录入和v1产品契约、支持Profile、信息架构、设计系统、双语术语与架构边界。
goals:
  - 将Section 2.1保守默认值固化为可供代码消费的进程、OwnedArtifactStore和状态契约。
  - 交付候选v1范围、用户旅程、受支持Profile、路由/状态、设计令牌、双语术语和架构接口。
  - 保留外部GUI、真实工具、许可证、干净电脑和用户验收为pending_final_acceptance，不伪造证据。
allowed_scope:
  - docs/adr、docs/product、docs/ui、contracts、scripts/tests、scripts/verify.ps1、docs/development/task-log。
  - 为Batch A契约落地所需的最小src、python和frontend边界修复。
forbidden_scope:
  - F:\\CONTAM Studio原工作区、用户PRJ/SIM/CSV、真实AppData、凭据、系统设置、全局依赖、推送、发布和真实外部工具证据伪造。
validation:
  - FND-07进程/存储ADR与process-lifecycle、owned-artifact-store契约通过定向检查。
  - FND-08 admission契约通过：FND-01至FND-06六个SHA可达，九项基础缺陷仍保持open，未声称H-FINAL。
  - PRD-01至PRD-08候选产品、Profile、旅程、信息架构、设计、双语和跨层接口契约及变异测试通过。
  - Batch A Full通过：QA-01共41项；Python 279 passed，前端145 passed，Rust 80 passed/1 ignored；生产构建、Clippy、Cargo check和Windows CI契约通过。
  - git diff --check通过；真实GUI、候选版本外部ContamX/SimRead、许可证最终复核和用户验收保持pending_final_acceptance。
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Revision 2取消逐卡H/U停机和逐卡Full；本记录是Batch A唯一运行日志，状态表见下方。
```

## Status ledger

| Card | Status | Evidence / note |
| --- | --- | --- |
| FND-07 | automated_verified | Process and storage policy ADRs and contracts are recorded from the authorized defaults. |
| FND-08 | automated_verified | Foundation ledger admission is recorded without claiming H-FINAL. |
| PRD-01 | automated_verified | Candidate v1 product contract. |
| PRD-02 | automated_verified | Journey and traceability contract. |
| PRD-03 | automated_verified | Two sourced narrow supported profile candidates. |
| PRD-04 | automated_verified | Product information architecture and route/state map. |
| PRD-05 | automated_verified | Design tokens and desktop interaction rules. |
| PRD-06 | automated_verified | Bilingual terminology and key/placeholder parity. |
| PRD-07 | automated_verified | Architecture ADR interface set. |
| PRD-08 | pending_final_acceptance | Conservative profile and authority defaults recorded; final U/H review remains external. |

External GUI, official-tool, clean-machine, licence, provider and user-study rows remain `pending_final_acceptance` until their evidence exists.
