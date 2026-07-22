# BATCH-02 CONTRACT-02B Tauri wrapper真实调用测试

```yaml
task_id: batch-02-contract-02b
phase: CONTRACT-02
checkpoint: 13
title: 用mock invoke逐项锁定24个wrapper命令名和完整载荷
status: completed
record_origin: live
started_at_utc: 2026-07-22T09:31:13.2050169Z
ended_at_utc: 2026-07-22T09:32:40.8990099Z
duration_seconds: 88
base_commit: c567be6
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 替换函数长度和toString证据，使用vi.mock真实调用全部24个TS wrapper并深相等断言命令与载荷。
goals:
  - 逐项调用24个wrapper并断言真实Tauri命令名和完整camelCase载荷。
  - 拒绝路径、PRJ正文、样本、Shell命令和额外字段进入invoke载荷。
  - 不修改wrapper、Rust命令、协议字段、权限或依赖。
allowed_scope:
  - src/app/desktop-api.test.ts
  - 本卡任务日志、任务书和Full记录
forbidden_scope:
  - 生产TS wrapper、Rust后端、协议、权限、依赖、Cargo文件、GUI行为
  - 原工作区、用户PRJ/CSV、全局环境和凭据
validation:
  - "pnpm vitest run src/app/desktop-api.test.ts: 2 tests passed; vi.mock真实调用24个wrapper，逐项深相等命令名和完整载荷，并拒绝路径、PRJ正文、样本、Shell命令和额外字段"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 26 checks passed; Python 278 passed; frontend 145 passed; Rust 77 passed, 1 ignored; Clippy/build/toolchain/Windows CI contract passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 已移除函数length和toString源码证据，改为真实wrapper调用；仅mock @tauri-apps/api/core，不执行真实Tauri、官方工具、Shell、文件或网络入口。
```
