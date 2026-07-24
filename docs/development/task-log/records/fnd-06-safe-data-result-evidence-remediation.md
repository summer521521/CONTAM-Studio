# FND-06 SAFE、DATA与RESULT证据修复

```yaml
task_id: FND-06
phase: Wave 0
checkpoint: 06
title: 修复SAFE、DATA与RESULT证据契约
status: automated_verified
record_origin: live
started_at_utc: 2026-07-24T09:16:09.4546956Z
ended_at_utc: 2026-07-24T09:19:34.1104405Z
duration_seconds: 204.6557449
base_commit: f3ce4b33f8d7ca580110d3d95f589d77530163a3
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md
task_summary: 将草稿导出安全路径、数据生命周期映射和结果快照边界固化为可执行的本地证据契约。
goals:
  - 验证草稿副本导出的小写SHA复读和失败清理竞争目标保护。
  - 将生命周期声明绑定到真实生产函数和可达存储连接点。
  - 明确结果元数据边界，避免把反事实快照写成生产测量。
allowed_scope:
  - src-tauri/src/zone_bridge.rs及其测试、python/tests/test_simread_runner.py、contracts、scripts/verify.ps1、docs/development/task-log。
forbidden_scope:
  - 运行时依赖、Tauri权限、用户文件、真实AppData、托管CI、GUI、真实ContamX和原工作区。
validation:
  - SAFE Rust定向测试通过：新增小写SHA复核、验证失败竞争目标保留、提交失败竞争目标保留均通过；zone_bridge模块34 passed、1 ignored。
  - SimRead定向测试通过：57 passed；Full Python pytest为279 passed，前端为145 passed，Rust为80 passed、1 ignored。
  - DATA生命周期契约通过：5个声明绑定真实生产函数和存储连接点；变异测试拒绝错误owner、不可达连接、未披露连接和陈旧函数。
  - Full验证通过：QA-01共40项；Windows CI契约、生产构建、Rust格式、Clippy和Cargo check均通过；git diff --check通过。
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 仅使用隔离克隆和F:\\Codex_File临时副本；未读取或修改用户PRJ、SIM、CSV、真实AppData、凭据或原工作区。
```
