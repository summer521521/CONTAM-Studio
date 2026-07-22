# SAFE-01 修复草稿另存并发删除

```yaml
task_id: safe-01-draft-export-race-fix
phase: SAFE-01
title: 修复草稿另存并发删除P0
status: automated_verified
record_origin: live
started_at_utc: 2026-07-22T02:06:18.9936783Z
ended_at_utc: 2026-07-22T02:16:04.9473547Z
duration_seconds: 585.954
base_commit: 8de5b189e3a0dc5c37dc7cec9a14d4df87072f52
branch: codex/phase-6a-codex-readonly-assistant
task_source: ChatGPT Web coordination
task_summary: 修复Rust草稿另存的并发提交失败路径，避免删除并发创建的目标文件，并保留目标已存在时的拒绝语义。
goals:
  - 为提交瞬间增加可确定控制的并发回归测试。
  - 生产路径只清理本次操作拥有的临时文件。
  - 保持独占hard_link提交、普通成功和验证失败行为不变。
allowed_scope:
  - src-tauri/src/zone_bridge.rs中的草稿复制提交路径及相邻Rust测试。
forbidden_scope:
  - SAFE-02及其他重构。
  - 前端、Python、权限和无关文档修改。
files_changed:
  - src-tauri/src/zone_bridge.rs
  - docs/development/task-log/index.md
  - docs/development/task-log/records/safe-01-draft-export-race-fix.md
validation:
  targeted_test: passed (draft_copy_commit_race_preserves_competing_target_and_cleans_temporary_file)
  full_checks: passed (pytest 266, ruff, pnpm test 129, pnpm build, cargo fmt, cargo test 75 passed/1 ignored, cargo check, git diff --check)
  gui: not_required
delivery_status:
  commit: not_requested
  push: not_requested
  pull_request: unchanged
pull_request: PR #15保持不变
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 完整pytest可能对未跟踪夹具文件计算SHA-256，但没有人工解析、修改或暂存。开始时工作树已有用户修改和未跟踪PRJ/CSV；本任务未清理、不暂存、不提交这些文件。src-tauri/Cargo.toml既有修改保持原样。仅修复SAFE-01，未处理SAFE-02或其他重构；未提交、未推送。
```
