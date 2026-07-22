# BATCH-02 CONTRACT-02A Tauri命令契约登记

```yaml
task_id: batch-02-contract-02a
phase: CONTRACT-02
checkpoint: 12
title: 登记24个Tauri命令、权限、Rust模块和前端载荷键
status: completed
record_origin: live
started_at_utc: 2026-07-22T09:23:31.3220037Z
ended_at_utc: 2026-07-22T09:29:30.0817688Z
duration_seconds: 359
base_commit: 769c447
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 建立Tauri命令契约清单并准备基于JSON、Rust源码和现有TypeScript AST的精确集合检查。
goals:
  - 精确登记全部24个命令的Rust模块、TS wrapper、permission和camelCase payload keys。
  - 只使用现有Node、TypeScript和PowerShell能力，不新增依赖或产品入口。
  - 为后续删除/变异自测保留可重复的精确集合检查基础。
allowed_scope:
  - contracts/tauri-commands.v1.json
  - scripts/tests/test-tauri-command-contract.mjs
  - 本卡任务日志、任务书和Full记录
forbidden_scope:
  - Tauri命令名、协议字段、权限扩大、后端行为、GUI、依赖和Cargo文件
  - 原工作区、用户PRJ/CSV、全局环境和凭据
validation:
  - "node scripts/tests/test-tauri-command-contract.mjs: 24个命令的Rust注册、capability、生成permission和TypeScript AST载荷键精确集合通过"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 26 checks passed; Python 278 passed; frontend 153 passed; Rust 77 passed, 1 ignored; Clippy/build/toolchain/Windows CI contract passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 使用项目已声明的TypeScript 7.0.2 unstable sync AST接口分析desktop-api.ts；未新增依赖、未读取未跟踪用户文件；陈旧生成permission文件留待CONTRACT-02C删除。
```
