# Phase 6A App Server生命周期与并发安全收口

```yaml
task_id: phase-6a-app-server-lifecycle-hardening
phase: Phase 6A
title: Codex App Server生命周期、Turn与工具事件可靠性收口
status: completed
record_origin: live
started_at_utc: 2026-07-19T14:38:48.5071987Z
ended_at_utc: 2026-07-19T16:29:26.3348700Z
duration_seconds: 6637
base_commit: 9dfc8927fa9c8921dd5049adf526e7a487b46e55
branch: codex/phase-6a-codex-readonly-assistant
task_source: ChatGPT Web coordination
task_summary: 对Draft PR #15进行最终代码审查后，收口Codex App Server并发连接、上下文失效期间的活动Turn、工具事件归属和有界关闭的安全边界。
goals:
  - 避免并发连接覆盖并遗留App Server进程或运行目录。
  - 上下文失效时中断活动Turn并禁止新Turn与旧Turn重叠。
  - 仅拦截属于当前Turn的工具事件，并稳定返回安全诊断。
  - 关闭路径不得因子进程或流线程异常无限阻塞。
allowed_scope:
  - src-tauri/src/codex_app_server.rs
  - src-tauri/src/zone_bridge.rs
  - Rust测试、Phase 6A文档、ADR、风险和任务日志
forbidden_scope:
  - 新AI功能、项目文件读取、写入权限、MCP、Shell工具、Python领域接口、React或Tauri权限扩张
files_changed:
  - README.md
  - docs/adr/ADR-010-use-codex-app-server-for-readonly-ai.md
  - docs/architecture/codex-readonly-assistant.md
  - docs/current-state.md
  - docs/development/phase-6a-codex-readonly-assistant-verification.md
  - docs/development/task-log/index.md
  - docs/development/task-log/records/phase-6a-app-server-lifecycle-hardening.md
  - docs/risks/risk-register.md
  - docs/roadmap/phases.md
  - src-tauri/src/codex_app_server.rs
validation:
  - Python pytest: 266 passed
  - Ruff: passed
  - Frontend tests: 121 passed
  - Frontend production build: passed
  - Rust fmt: passed
  - Rust tests: 70 passed, 1 ignored
  - Rust check: passed
  - Markdown relative links: 68 tracked files passed
  - Tracked JSON parsing: 8 documents passed
  - pnpm frozen lockfile and Cargo locked metadata checks: passed
  - Dependency and license review: no manifest or lock changes
  - git diff --check: passed
delivery_status: completed
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/15
manual_gui_validation_status: pending_user
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 用户手动生成的PRJ和CSV保持未跟踪且不会读取、修改或暂存。
  - PR #15最终代码审查未发现仍阻塞合并的实现问题；Windows Job Object进程树治理继续作为Beta残余风险记录。
  - Draft PR保持不合并；手动GUI验收不在本任务中自动执行。
```
