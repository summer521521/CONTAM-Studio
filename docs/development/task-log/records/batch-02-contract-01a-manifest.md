# BATCH-02 CONTRACT-01A Python/Rust黄金协议清单

```yaml
task_id: batch-02-contract-01a
phase: CONTRACT-01
checkpoint: 08
title: 建立Python/Rust桥五操作v1.2黄金契约目录
status: completed
record_origin: live
started_at_utc: 2026-07-22T08:49:29.7528798Z
ended_at_utc: 2026-07-22T08:53:55.4463287Z
duration_seconds: 266
base_commit: 9e3a97e
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 建立v1.2清单和read、plan、apply、extract、run五操作的success/domain-error规范JSON。
goals:
  - 固定协议版本、操作版本和请求/stdout/stderr上限。
  - 用占位路径表达动态来源、输出、运行根和manifest路径。
  - 所有JSON使用两空格、键排序和末尾换行。
allowed_scope:
  - contracts/python-rust-bridge/v1.2/
  - 本卡任务日志、任务书和必要的Full接入
forbidden_scope:
  - 新依赖、协议行为、错误码、权限、GUI、Rust生产逻辑和官方工具执行
  - 原工作区、用户PRJ/CSV、全局环境和凭据
validation:
  - "Python结构检查：11个JSON文件、5个操作目录、协议1.2、request/stdout/stderr=131072/2097152/16384、动态路径占位符和两空格排序格式通过"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 26 checks passed; Python 266 passed; frontend 153 passed; Rust 75 passed, 1 ignored; Clippy/build/toolchain/Windows CI contract passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 后续CONTRACT-01B至01D使用本卡目录作为黄金契约来源；未运行官方ContamX或SimRead。
```
