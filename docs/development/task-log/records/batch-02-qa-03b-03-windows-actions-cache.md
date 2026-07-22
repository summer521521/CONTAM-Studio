# BATCH-02 QA-03B-03 Windows CI Action固定与缓存

```yaml
task_id: batch-02-qa-03b-03-windows-actions-cache
phase: QA-03B
checkpoint: 05
title: 固定CI Actions并限制缓存边界
status: completed
record_origin: live
started_at_utc: 2026-07-22T08:37:23.2092057Z
ended_at_utc: 2026-07-22T08:39:20.9779583Z
duration_seconds: 118
base_commit: 4e38640
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 将六个CI Action固定到用户指定完整SHA，只缓存pnpm下载、pip下载和Cargo registry/git。
goals:
  - 固定checkout、pnpm/action-setup、setup-node、setup-python、dtolnay/rust-toolchain和actions/cache SHA。
  - 禁止缓存venv、node_modules、target或工作区。
  - 记录Action许可证、维护状态、CI限定用途和零桌面打包成本。
allowed_scope:
  - .github/workflows/windows-ci.yml、Windows CI工具链文档和相邻任务记录。
forbidden_scope:
  - 新产品依赖、GUI、协议、权限、全局环境、Cargo文件和其他任务。
validation:
  - "六个Action完整SHA检查通过；actions/cache出现3次"
  - "缓存形状检查通过：pnpm store、runner临时pip cache、Cargo registry/git；未缓存python/.venv、node_modules、src-tauri/target或工作区"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 25 checks passed; Python 266 passed; frontend 153 passed; Rust 75 passed, 1 ignored; Clippy and build passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Action许可证、维护状态、CI限定用途和零桌面打包成本记录于docs/development/windows-ci-toolchain.md；缓存只服务CI加速，不进入桌面打包产物。
```
