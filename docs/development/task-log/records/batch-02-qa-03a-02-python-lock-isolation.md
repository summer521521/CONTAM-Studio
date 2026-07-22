# BATCH-02 QA-03A-02 Python锁隔离验证

```yaml
task_id: batch-02-qa-03a-02-python-lock-isolation
phase: QA-03A
checkpoint: 02
title: 在第二个干净克隆验证哈希锁和Python来源隔离
status: completed
record_origin: live
started_at_utc: 2026-07-22T08:23:34.8993951Z
ended_at_utc: 2026-07-22T08:30:24.0661239Z
duration_seconds: 409
base_commit: e7a9d99
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 在独立临时克隆使用真实python/.venv和--require-hashes锁安装，验证pip、来源边界和Full。
goals:
  - 不复用主克隆或旧目录的Python环境。
  - PYTHONPATH只指向第二个克隆的python/src。
  - 运行pip check、Python来源检查和Full。
allowed_scope:
  - 第二个F:/Codex_File临时克隆及其python/.venv、node_modules和target。
  - 本任务日志、任务日志索引和任务书状态。
forbidden_scope:
  - 主克隆源码、旧目录、原工作区、用户PRJ/CSV、全局环境和凭据。
validation:
  - "第二个干净克隆：F:/Codex_File/temp/contam-studio-qa03a-isolation-20260722-162403；Python 3.12.10；uv pip --require-hashes安装10个锁定依赖"
  - "pip check: No broken requirements found; PYTHONPATH仅为该克隆python/src；sys.executable和contam_studio_core.__file__均来自该克隆"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 23 checks passed; Python 266 passed; frontend 153 passed; Rust 75 passed, 1 ignored; Clippy and build passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 第二个克隆只用于安装验证，不作为后续开发工作树；为满足Rust桥接的-I隔离启动，锁安装后仅以editable形式安装本地项目包，未增加依赖。
```
