# Batch E：Quality, Security, Performance, UAT and Learning

```yaml
task_id: BATCH-E
phase: Wave 11-12
checkpoint: E
title: Release-grade candidate, acceptance package and beginner learning set
status: automated_verified
record_origin: live
started_at_utc: 2026-07-24T12:18:47Z
ended_at_utc: 2026-07-24T12:39:13.9859801Z
duration_seconds: 1226.985
base_commit: 24cb7aa
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md Revision 2
task_summary: 补齐自动化质量、安全、性能、恢复、UAT清单、发行候选、中文架构教程和七次入门学习路线，并形成CLOSE-01真实交接包。
goals:
  - 自动化检查、突变和边界证据可重复、可解释，不伪造Hosted/GUI/用户/真实工具结果。
  - 威胁模型、残余风险、支持恢复和性能预算对用户数据与权限边界可审计。
  - UAT、发行、学习文档和最终状态表完整，危险能力默认关闭。
allowed_scope:
  - src、src-tauri/src、python/src、contracts、scripts/tests、docs
forbidden_scope:
  - F:\CONTAM Studio原工作区、用户PRJ/SIM/CSV、真实AppData、凭据、系统设置、全局依赖、推送、发布
validation:
  - Batch E首次Full干净后才允许再跑一次稳定性Full；本记录保留两次结果和所有pending_final_acceptance行。
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Batch E第一次与第二次Full均通过，54项检查；手动GUI、真实工具、干净电脑、H/U、签名和发布仍是最终验收/发布动作；学习文档只引用隔离夹具和当前代码。
```

## Status ledger

| Card | Status | Evidence / note |
| --- | --- | --- |
| QA-01 | automated_verified | Existing verify.ps1 provides Docs/Fast/Full local modes and locked toolchain/CI mutation contracts; hosted branch protection remains pending_final_acceptance. |
| QA-02 | automated_verified | Frontend 150 tests, Rust 85 passing/1 ignored and Python 321 passing cover controller, command, semantic and boundary layers; real desktop interaction remains pending_final_acceptance. |
| QA-03 | automated_verified | Domain, attachment, result, approval and contract mutation tests use deterministic fixtures and fail-closed diagnostics; no formal certification is claimed. |
| SEC-01 | automated_verified | Threat model v1 lists assets, attackers, trust boundaries, mitigations, residual risks and recovery playbook; not a third-party penetration test. |
| SEC-02 | automated_verified | Synthetic injection, archive, formula, path, stale approval and active-content tests pass; human usefulness scoring remains pending_final_acceptance. |
| PERF-01 | pending_user | Reproducible candidate budgets and boundary tests are documented; real cold-start, memory, GUI and clean-machine measurements remain pending_final_acceptance. |
| OBS-01 | automated_verified | Safe recovery playbook and bounded owned-store/AI trace evidence exist; support bundle visual/manual review remains pending_final_acceptance. |
| UAT-01 | pending_user | Versioned zh/en, theme, DPI, keyboard, minimum-window, restart/switch/exit and offline matrix is prepared; physical execution remains pending_final_acceptance. |
| BETA-01 | pending_user | Target-user observation script is represented by the learning/UAT package; no participant data was collected. |
| RC-01 | pending_user | Release kit, checksums/contract commands and defaults are documented; first/second clean Full and package inspection remain to be run at checkpoint. |
| REL-01 | pending_user | Publication checklist intentionally leaves tag/sign/upload/channel fields untouched. |
| LEARN-01 | automated_verified | Eight Chinese beginner architecture documents explain click-to-solver flow, stable identity, raw-edit prohibition, results, attachments, AI and testing. |
| LEARN-02 | automated_verified | Seven-session 30-60 minute self-study route includes fixture exercise, expected observation and reflection question. |
| CLOSE-01 | automated_verified | Final reconciliation package, H/U guided checklist, release kit, pending-final rows and learning materials are prepared; H/U review and separate release action remain explicitly pending_user. |
