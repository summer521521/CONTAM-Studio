# FE-01 打开失败或取消后恢复旧项目可操作状态

```yaml
task_id: fe-01-open-failure-restores-project
phase: FE-01
title: 打开失败或取消后恢复旧项目可操作状态
status: pending_user
record_origin: live
started_at_utc: 2026-07-22T07:18:56.9598632Z
ended_at_utc: 2026-07-22T07:23:07.6420996Z
duration_seconds: 251
base_commit: 4c6fbe9
branch: main
task_source: 当前用户BATCH-01指令
task_summary: 首次打开保留原错误语义；已有项目的新打开取消、失败或不支持时恢复loaded并保留旧项目绑定。
goals:
  - 仅在真正打开新项目成功后清理旧Patch、运行、结果和AI上下文。
  - 失败诊断保留为非致命Problems信息，取消使用轻量通知语义。
  - 补齐四类Reducer/App相邻测试并完成Full验证。
allowed_scope:
  - src/app/project-state.ts及其相邻测试。
  - App.tsx最小编排、必要i18n和相邻测试。
  - 本任务日志、任务书和任务日志索引。
forbidden_scope:
  - Rust后端、Reducer协议、依赖、FE-02命令可用性、FE-03模态行为。
  - 草稿切换策略、App.tsx拆分、用户PRJ/CSV和其他任务。
validation:
  - pnpm exec vitest run src/app/project-state.test.ts src/components/workbench/project-components.test.tsx：36 passed。
  - powershell -NoProfile -File scripts/verify.ps1 -Mode Full：22项检查通过，前端134 passed、Python 266 passed、Rust 75 passed/1 ignored，构建、fmt、Clippy和cargo check通过。
  - Reducer覆盖首次取消、首次失败、已有项目取消、已有项目unsupported和已有项目普通失败；App仍只在成功加载后清理Patch、运行、结果和AI绑定。
  - GUI状态：pending_user，等待FE-01/FE-02联合验收证据。
delivery_status: ready_for_fe_01_commit
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: FE-01与FE-02共享一次联合GUI验收；当前仅记录实现和自动验证，GUI证据待用户提供。失败诊断仍进入Problems，取消保持轻量通知。
```
