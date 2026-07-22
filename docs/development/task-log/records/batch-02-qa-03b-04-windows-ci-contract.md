# BATCH-02 QA-03B-04 Windows CI契约测试

```yaml
task_id: batch-02-qa-03b-04-windows-ci-contract
phase: QA-03B
checkpoint: 06
title: 为Windows CI建立固定结构契约并接入Full
status: pending_user
record_origin: live
started_at_utc: 2026-07-22T08:40:16.5023021Z
ended_at_utc: 2026-07-22T08:42:47.6944345Z
duration_seconds: 151
base_commit: 08ff4e6
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 用无依赖PowerShell检查器验证Windows CI名称、触发、权限、Action SHA、版本、锁文件和唯一Full入口。
goals:
  - 检查工作流固定合同并接入scripts/verify.ps1 -Mode Full。
  - 拒绝危险触发、Secrets、write、continue-on-error、发布、artifact和真实工具运行。
  - Full通过后静默推送main；QA-03总体保持pending_user。
allowed_scope:
  - scripts/tests/test-windows-ci-contract.ps1、scripts/verify.ps1、任务记录和任务书。
forbidden_scope:
  - 真实CI运行、Secrets、发布、产品依赖、权限扩大、Cargo文件和其他任务。
validation:
  - "powershell.exe -NoProfile -File scripts\\tests\\test-windows-ci-contract.ps1: Windows CI contract passed"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 26 checks passed; Python 266 passed; frontend 153 passed; Rust 75 passed, 1 ignored; Clippy, contract and build passed"
  - "契约拒绝pull_request_target、Secrets、write、continue-on-error、发布、artifact和真实Codex/ContamX；锁文件为pnpm、Cargo和Python三项"
delivery_status: pending_user
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: QA-03自动部分完成；QA-03C两次PR稳定证据与QA-03D分支保护由用户完成；本卡只建立自动契约门。
```
