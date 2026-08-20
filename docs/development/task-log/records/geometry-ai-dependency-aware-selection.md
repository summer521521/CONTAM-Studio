# Geometry AI Dependency-aware Selection

```yaml
task_id: geometry-ai-dependency-aware-selection
phase: Geometry Workbench
title: AI 几何草案依赖感知审批
status: completed
record_origin: live
started_at_utc: 2026-08-18T02:07:00Z
ended_at_utc: 2026-08-18T02:09:43Z
duration_seconds: 164
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 总监根据选择性审批后的用户路径确定的下一项逻辑任务。
task_summary: 让 AI 几何草案的逐项选择自动遵守顶点、墙体、区域和开口之间的结构依赖，并在界面中明确提示。
goals:
  - 选择依赖新顶点的墙体时，自动纳入缺失的顶点操作。
  - 选择依赖新墙体的开口或区域时，自动纳入必要的墙体及其前置操作。
  - 取消前置操作时，原子移除当前选择中依赖它的后续操作，避免预览阶段才暴露错误。
  - 保持最终选择数组、局部预览、operationsSha256、Patch/Diff、用户确认和原始 PRJ 不直接写入边界。
allowed_scope:
  - Geometry AI 选择纯函数、Hook 状态、助手侧栏文案与样式、测试、合同、任务事实源。
forbidden_scope:
  - 读取真实凭据、真实 AppData、用户唯一工程、图片路径或像素；绕过 Rust/Tauri、结构化草案、确定性验证、Patch/Diff 或用户确认；提交、推送、打包、签名或发布。
validation:
  - 运行依赖纯函数、Hook、助手面板聚焦测试、TypeScript、生产构建、依赖选择合同和一次最终 Full。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed；github_windows_ci=pending_push；manual_gui=not_run；real_tools=not_run；real_provider=not_run；packaged=not_run；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
```

## 变更范围

- `geometry-ai-draft` 根据当前可信几何基线建立顶点、墙体、边界和开口的确定性依赖图。
- 逐项选择使用依赖闭包；取消前置操作会同步清除已选的依赖操作。
- 助手侧栏显示自动纳入的前置依赖，并在每项操作上标出依赖标记。

## 自动验证

已完成本任务唯一一次最终 Full；没有使用 GUI、真实 Provider、真实工具、打包、签名或发布环境。

- Geometry AI Dependency-aware Selection contract：12 assertions passed。
- 依赖纯函数、Hook 和助手面板聚焦测试：10 tests passed。
- 前端全量：57 个测试文件，417 tests passed。
- Python 全量：409 tests passed；Ruff 通过。
- TypeScript 类型检查、生产构建、Rust fmt、Clippy 和 Cargo check：通过。
- 最终 Full：仅运行 1 次，退出码 0，`QA-01 passed: 90 checks passed`。
- Full 中的任务日志合同（108 records）、任务日志变异合同、能力矩阵、Windows CI 合同和 `git diff --check`：通过。
- 生产构建保留既有 `installCanvasRenderer` 550.62 kB chunk 警告，未通过提高阈值隐藏。

## 实现结论

- 选择墙体、开口或 Zone 区域时，依赖当前可信几何基线的新顶点、墙体和边界会按确定性顺序自动纳入。
- 依赖闭包支持多级依赖：开口 → 墙体 → 顶点；区域同时核对顶点和边界墙。
- 取消前置操作会同步移除当前选集中依赖它的后续操作，避免生成一个只能在预览阶段才失败的半成品选择。
- 侧栏显示本次自动纳入的依赖并在对应操作上标记；画布继续复用同一最终选中集合。
- 最终选择数组仍是局部预览、`operationsSha256`、审批和 AI 命令写入的唯一范围；原始 PRJ、Rust/Tauri 权限和用户确认边界没有改变。

## 最终状态

```text
implementation=complete
automated_verified=passed
github_windows_ci=pending_push
manual_gui=not_run
real_tools=not_run
real_provider=not_run
packaged=not_run
signed=not_run
released=no
user_validated=not_run
merged_to_main=no
```

未读取真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或真实用户工程；未提交、推送、打标签、打包、签名或发布。
