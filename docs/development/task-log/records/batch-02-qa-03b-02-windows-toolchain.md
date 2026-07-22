# BATCH-02 QA-03B-02 Windows CI工具链固定

```yaml
task_id: batch-02-qa-03b-02-windows-toolchain
phase: QA-03B
checkpoint: 04
title: 固定Windows CI的Python、Node、pnpm和Rust工具链
status: completed
record_origin: live
started_at_utc: 2026-07-22T08:33:53.2030278Z
ended_at_utc: 2026-07-22T08:36:34.3558168Z
duration_seconds: 161
base_commit: fd1d669
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 工作流固定Python 3.12.10、Node 24.13.0、pnpm 11.14.0和Rust 1.97.1 MSVC组件，runner只调用verify.ps1 Full。
goals:
  - runner创建python/.venv并以哈希锁安装依赖和本地项目包。
  - pnpm使用frozen lockfile，Cargo由Full使用locked。
  - verify.ps1精确检查rustc release、MSVC host、rustfmt和clippy，不读取stable别名。
allowed_scope:
  - .github/workflows/windows-ci.yml、scripts/verify.ps1、toolchain baseline和相邻任务记录。
forbidden_scope:
  - 全局工具安装或升级、产品依赖、权限扩大、Cargo文件、后端/API和其他任务。
validation:
  - "scripts/verify.ps1 toolchain gate: project Python 3.12.10, Node 24.13.0, pnpm 11.14.0, cargo/rustc 1.97.1"
  - "Rust compiler identity, exact x86_64-pc-windows-msvc host, rustfmt commit and clippy commit checks passed; no stable alias check remains"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 25 checks passed; Python 266 passed; frontend 153 passed; Rust 75 passed, 1 ignored; Clippy and build passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Action SHA固定和缓存许可证记录在QA-03B-03；本卡不安装或升级本机工具；runner通过checkout源码pth提供Python包来源。
```
