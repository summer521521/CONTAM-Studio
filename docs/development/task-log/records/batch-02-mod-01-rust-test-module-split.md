# BATCH-02 MOD-01 Rust测试模块机械拆分

```yaml
task_id: batch-02-mod-01
phase: MOD-01
checkpoint: 15
title: 将两个Rust cfg(test)块移至相邻tests.rs
status: completed
record_origin: live
started_at_utc: 2026-07-22T09:39:18.0347906Z
ended_at_utc: 2026-07-22T09:44:28.6937963Z
duration_seconds: 310
base_commit: 756c50b
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 先记录Rust测试基线，再机械移动zone_bridge.rs和codex_app_server.rs的测试模块，不改测试语义或生产逻辑。
goals:
  - 记录移动前Rust测试总数、通过数和忽略数。
  - 将两个完整cfg(test)模块移动到相邻tests.rs，并保留同名测试路径和行为。
  - 通过测试集合、通过/忽略数、格式和Full验证。
allowed_scope:
  - src-tauri/src/zone_bridge.rs
  - src-tauri/src/zone_bridge/tests.rs
  - src-tauri/src/codex_app_server.rs
  - src-tauri/src/codex_app_server/tests.rs
  - 本卡任务日志、任务书和Full记录
forbidden_scope:
  - 生产逻辑、生产可见性、测试断言、测试行为、依赖、Cargo文件、协议、权限和GUI
  - 原工作区、用户PRJ/CSV、全局环境和凭据
validation:
  - "移动前后：cargo test --locked --lib -- --list均为78 tests；测试名称集合完全一致"
  - "移动后cargo test --locked --lib: 77 passed, 1 ignored；行为和忽略数与基线一致"
  - "cargo fmt --all -- --check: passed"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 27 checks passed; Python 278 passed; frontend 145 passed; Rust 77 passed, 1 ignored; Clippy/build/toolchain/Windows CI contract passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 测试基线已记录为78项，其中Full为77 passed、1 ignored；生产前缀逐字一致，测试代码仅因外置模块路径和rustfmt调整相对路径/格式，未改断言或行为。
```
