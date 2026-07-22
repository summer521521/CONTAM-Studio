# TRUTH-02同步漂移文档与研究证据标签

```yaml
task_id: truth-02-document-drift
phase: TRUTH-02
title: 同步漂移文档与研究证据标签
status: completed
record_origin: live
started_at_utc: 2026-07-22T03:15:40.4784286Z
ended_at_utc: 2026-07-22T03:23:53.3241852Z
duration_seconds: 492.846
base_commit: 31c99d1
branch: main
task_source: 当前用户指令
task_summary: 修正当前状态、路线图、Python桥接协议和研究报告证据标签，使文档以TRUTH-01能力状态矩阵为唯一状态依据。
goals:
  - 消除Python协议版本、请求大小、操作白名单和Patch接入状态的过期描述。
  - 将Phase 5A摘要放回Phase 5位置，并消除Phase 6正在接入的矛盾。
  - 明确研究报告为历史研究、非规范，并将不可用内部引用标记为source_pending。
allowed_scope:
  - README.md
  - docs/current-state.md
  - docs/roadmap/phases.md
  - python/README.md
  - docs/architecture/tauri-python-zone-bridge.md
  - docs/research/2026-07-contam-studio-deep-research.md
  - docs/development/task-log/index.md与本任务日志
forbidden_scope:
  - 已接受ADR
  - 产品源码、测试行为、依赖、Cargo.toml和用户PRJ/CSV
validation:
  - "文档检查通过：9个JSON可解析，79个Markdown文档的相对链接无缺失。"
  - "研究报告内部引用数为0，source_pending计数为65，顶部历史非规范标签存在。"
  - "Python pytest 266 passed；Ruff全部通过；前端Vitest 129 passed；pnpm build通过。"
  - "cargo fmt --check通过；cargo test --locked为75 passed、1 ignored；cargo check --locked通过。"
  - "git diff --check通过。"
  - "首次Rust测试仅因隔离工作树未提供python/.venv失败；建立指向项目专属venv的临时junction后重跑通过，未改源码或依赖。"
delivery_status: included_in_truth_02_delivery_commit
commit: current_main_commit
push: current_main_branch
files_changed:
  - docs/current-state.md
  - docs/architecture/tauri-python-zone-bridge.md
  - docs/roadmap/phases.md
  - python/README.md
  - docs/research/2026-07-contam-studio-deep-research.md
  - docs/development/task-log/index.md
  - docs/development/task-log/records/truth-02-document-drift.md
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 仅在隔离的main临时工作树中修改文档；原工作区用户未跟踪PRJ/CSV和Cargo.toml保持未触碰。研究报告保留历史正文，但不可用内部引用不再作为证据。
```
