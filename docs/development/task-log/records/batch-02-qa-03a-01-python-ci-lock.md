# BATCH-02 QA-03A-01 Python CI锁

```yaml
task_id: batch-02-qa-03a-01-python-ci-lock
phase: QA-03A
checkpoint: 01
title: 从Python dev extra生成Windows CPython 3.12哈希锁
status: completed
record_origin: live
started_at_utc: 2026-07-22T08:09:48.4353013Z
ended_at_utc: 2026-07-22T08:22:47.7570926Z
duration_seconds: 779
base_commit: 07312f3
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 使用现有uv 0.11.2从python/pyproject.toml的dev extra生成仅含十个声明包的requirements-ci.lock。
goals:
  - 锁定CPython 3.12、Windows x64、only-binary、精确版本和SHA-256哈希。
  - 拒绝VCS、本地路径、editable、额外索引和范围版本。
  - 将锁文件加入toolchain baseline并同步BATCH-01与Full文档事实。
allowed_scope:
  - python/requirements-ci.lock、docs/development/toolchain-baseline.json及相邻文档。
  - 本任务日志和任务日志索引。
forbidden_scope:
  - 产品依赖、全局环境、Cargo文件、后端/API、用户PRJ/CSV及其他任务。
validation:
  - "uv 0.11.2 pip compile: CPython 3.12, x86_64-pc-windows-msvc, only-binary, exact pins and SHA-256 hashes"
  - "Lock shape assertion: exactly cffi, colorama, contamxpy, iniconfig, packaging, pluggy, pycparser, pygments, pytest and ruff; no VCS, local, editable, extra index or range syntax"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 23 checks passed; Python 266 passed; frontend 153 passed; Rust 75 passed, 1 ignored; Clippy and build passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: uv版本保持0.11.2；锁文件只服务Windows CI安装验证；Full在提交后运行并通过。
```
