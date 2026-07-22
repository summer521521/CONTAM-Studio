# QA-01A Python验证环境隔离

```yaml
task_id: qa-01a-python-package-origin
phase: QA-01A
title: Python验证环境隔离
status: completed
record_origin: live
started_at_utc: 2026-07-22T07:01:54.6574947Z
ended_at_utc: 2026-07-22T07:09:28.7294556Z
duration_seconds: 454
base_commit: 2ad2c4d808cc0fdcaa54a3e32b4b147c55217b7c
branch: main
task_source: 当前用户BATCH-01指令
task_summary: 确认统一验证入口使用当前克隆的项目Python和源码，不接受其他工作区的包来源。
goals:
  - 在verify.ps1中加入安全的Python解释器和包来源检查。
  - 增加可重复的外部PYTHONPATH负例测试。
  - 固化BATCH-01逐卡规则并同步任务日志状态词。
allowed_scope:
  - scripts/verify.ps1
  - scripts/tests/test-project-python-origin.ps1
  - docs/development/task-log/README.md、index.md与本任务日志
  - docs/roadmap/next-development-execution-plan.md中的批次规则和QA-01A卡片
forbidden_scope:
  - QA-02、FE-01、FE-02、QA-03及其他后续任务
  - 产品源码、依赖、Cargo.toml、Cargo.lock和用户PRJ/CSV
  - 全局Python、全局环境、系统配置和原工作区
validation:
  - scripts/tests/test-project-python-origin.ps1：外部PYTHONPATH负例失败，诊断仅使用`<outside-clone>`且未继续运行Python pytest。
  - powershell -NoProfile -File scripts/verify.ps1 -Mode Full：21项检查通过，Python 266 passed、前端129 passed、Rust 75 passed/1 ignored、生产构建、fmt和cargo check均通过。
  - git diff --cached --check：通过；未修改依赖、Cargo文件、全局环境、系统配置或原工作区。
delivery_status: ready_for_qa_01a_commit
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 在F:\Codex_File\temp下使用新克隆和真正属于该克隆的Python 3.12.10 venv；未触碰旧临时目录的venv Junction。当前提交只包含QA-01A范围。
```
