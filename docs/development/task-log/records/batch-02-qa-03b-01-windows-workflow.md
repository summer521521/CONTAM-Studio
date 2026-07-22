# BATCH-02 QA-03B-01 Windows CI工作流骨架

```yaml
task_id: batch-02-qa-03b-01-windows-workflow
phase: QA-03B
checkpoint: 03
title: 建立Windows CI工作流和固定Full验证检查名
status: completed
record_origin: live
started_at_utc: 2026-07-22T08:31:06.0412317Z
ended_at_utc: 2026-07-22T08:32:12.8597290Z
duration_seconds: 66
base_commit: 4ba7f6e
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 新增仅面向main的Windows CI工作流，固定runner、超时、最小权限、取消旧运行和Full verification job名。
goals:
  - 工作流名称为Windows CI，job名称为Full verification。
  - 触发仅为main的pull_request、main的push和workflow_dispatch。
  - 固定windows-2022、60分钟超时、contents:read、checkout不持久化凭据和并发取消。
allowed_scope:
  - .github/workflows/windows-ci.yml及本任务日志、任务书、任务日志索引。
forbidden_scope:
  - Secrets、发布、artifact、真实Codex/ContamX、依赖、权限扩大和其他任务。
validation:
  - "静态结构确认：Windows CI、Full verification、windows-2022、timeout-minutes 60、contents:read、persist-credentials:false、取消旧运行"
  - "触发集合仅含pull_request(main)、push(main)和workflow_dispatch，无paths过滤"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 23 checks passed; Python 266 passed; frontend 153 passed; Rust 75 passed, 1 ignored; Clippy and build passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Action SHA固定和工具链安装步骤分别在QA-03B-02、QA-03B-03完成；工作流骨架本卡独立提交。
```
