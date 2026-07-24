# FND-05 Rust可见性与进程调用清单修复

```yaml
task_id: FND-05
phase: Wave 0
checkpoint: 05
title: 修复Rust公共表面与进程调用双向清单
status: automated_verified
record_origin: live
started_at_utc: 2026-07-24T08:48:35Z
ended_at_utc: 2026-07-24T08:59:33.9814206Z
duration_seconds: 658.981
base_commit: dcb6a0baa52ebd48d7454116c0e1c389905ed5bb
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md
task_summary: 将Rust生产文件的公共声明和Python/Rust进程启动点固化为双向、函数作用域感知的本地契约。
goals:
  - 覆盖struct、enum、trait、type、static、const、union、extern、reexport、module和公共facade检查。
  - 发现未知公共语法、隐藏模块、公有union/extern/glob和缺失facade时失败关闭。
  - 让每个Command::new/subprocess.Popen调用与正确函数登记双向一致，并检测重复调用。
allowed_scope:
  - contracts/rust-authority.v1.json
  - scripts/tests/test-rust-authority-contract.mjs及其变异自测
  - scripts/verify.ps1、docs/development/task-log和索引
forbidden_scope:
  - 产品运行时代码、Tauri权限、依赖、用户文件、真实AppData、托管CI、GUI和原工作区
validation:
  - Rust authority正向契约通过：3个Rust生产文件、67个受限pub项和required facade通过。
  - 进程调用正向契约通过：4个Rust Command::new和4个Python subprocess.Popen登记与函数作用域一致。
  - 变异自测通过9项：union、extern、glob、隐藏模块、未知语法、facade缺失、额外/重复进程调用和错误owner均被拒绝。
  - Docs验证通过16项；任务日志、占位符、缓存、缺陷账本、Markdown链接、锁文件和差异检查均通过。
  - 未读取或修改用户PRJ、SIM、CSV、真实AppData、凭据或原工作区；未执行真实GUI、ContamX、托管CI或发布。
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 受限词法扫描器遇到未覆盖的pub语法即失败；进程清单按文件、类型、函数owner和同函数出现序号双向比对，不把静态本地检查写成托管CI或GUI证据。
```
