# FE-02 统一命令可用性并封闭Patch审阅期

```yaml
task_id: fe-02-command-availability
phase: FE-02
title: 统一命令可用性并封闭Patch审阅期
status: pending_user
record_origin: live
started_at_utc: 2026-07-22T07:34:57.4286017Z
ended_at_utc: 2026-07-22T07:38:29.4232477Z
duration_seconds: 211
base_commit: ded0ff2
branch: main
task_source: 当前用户BATCH-01指令
task_summary: 用纯deriveCommandAvailability统一项目、草稿、运行、结果、Patch和快捷键命令的可用性。
goals:
  - 为指定命令建立唯一纯函数和表驱动状态测试。
  - UI disabled、App处理器和快捷键查询同一可用性结果。
  - 项目加载、运行、结果、draftBusy、AI Turn和Patch工作流期间封闭外部上下文命令；Patch review只保留Back、Cancel、Apply。
allowed_scope:
  - src/app/command-availability.ts及相邻测试。
  - App.tsx最小编排、快捷键和相关工作台组件disabled接线。
  - 本任务日志、任务书和任务日志索引。
forbidden_scope:
  - Rust后端、Reducer协议、依赖、Cargo文件、FE-03模态行为、草稿切换策略和App.tsx拆分。
  - AI局部控件、主题、面板、Tab、只读对象选择、用户PRJ/CSV和其他任务。
validation:
  - "pnpm exec vitest run src/app/command-availability.test.ts src/app/draft-shortcuts.test.ts src/components/workbench/project-components.test.tsx: 3 files, 39 tests passed"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 22 checks passed; Python 266 passed; frontend 153 passed; Rust 75 passed, 1 ignored; Clippy passed; build passed"
  - "No backend, Reducer protocol, dependency, Cargo, FE-03, draft strategy, App split, global environment, or user PRJ/CSV changes"
delivery_status: pending_user
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: FE-01与FE-02共享一次联合GUI验收；自动验证完成，AI Stop保持现状可用；GUI证据待用户提供。
```
