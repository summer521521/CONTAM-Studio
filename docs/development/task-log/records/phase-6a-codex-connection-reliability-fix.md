# Phase 6A Codex连接可靠性修复

```yaml
task_id: phase-6a-codex-connection-reliability-fix
phase: Phase 6A
title: Codex App Server连接失败复现与可靠性修复
status: completed
record_origin: live
started_at_utc: 2026-07-20T02:18:08.9171027Z
ended_at_utc: 2026-07-20T02:25:27.4704442Z
duration_seconds: 438
base_commit: 8ad46572e9a56c90b7e90b2d01fad65b8ed1f7de
branch: codex/phase-6a-codex-readonly-assistant
task_source: ChatGPT Web coordination
task_summary: 根据用户手动验收中Codex连接不成功的反馈，复现本地CLI和App Server连接链路，修复可证实的连接状态竞态或可靠性问题，并保持只读AI边界。
goals:
  - 定位CLI探测、App Server初始化、账号读取、模型读取或前端状态竞争中的实际失败点。
  - 修复不会泄露路径、认证信息或项目内容的连接可靠性问题。
  - 保持用户未跟踪的PRJ和CSV不读取、不修改、不暂存。
allowed_scope:
  - Phase 6A前端AI连接状态、相关Rust适配器测试、文档和任务日志
forbidden_scope:
  - AI写入、认证文件读取、项目文件访问、MCP、Shell工具、其他AI后端、GUI自动化
files_changed:
  - src/app/ai-state.ts
  - src/app/ai-state.test.tsx
  - docs/development/phase-6a-codex-readonly-assistant-verification.md
  - docs/development/task-log/index.md
  - docs/development/task-log/records/phase-6a-codex-connection-reliability-fix.md
validation:
  - "Frontend focused state regression: 23 passed"
  - "Frontend full suite: 11 files, 124 tests passed"
  - "Frontend production build: passed"
  - "Non-GUI real Codex App Server: initialize, account/read, and model/list passed; Plus account and 4 models observed"
  - "Markdown relative links: 71 files passed"
  - "git diff --check: passed"
delivery_status: included_in_current_delivery_commit
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/15
manual_gui_validation_status: pending_user
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 用户报告Codex连接不成功；根因是项目上下文刷新清除了正在进行的CLI探测或连接请求身份，导致后续合法响应被视为旧响应而丢弃。
  - 修复仅保留与项目无关的probe、install和connect请求；预览和Turn仍会在可信项目绑定变化时失效。
  - 此前一次用户GUI验收报告连接失败；非GUI真实App Server链路正常。更新后“先打开项目，再点击连接Codex”的GUI复验仍由用户执行，状态为pending_user。
  - 用户未跟踪PRJ和CSV保持未读取、未修改、未暂存。src-tauri/Cargo.toml的预存时间戳工作树变化未触碰。
  - 客户端未提供精确逐任务Token数据。
```
