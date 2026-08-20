# Geometry AI Selective Operation Approval

```yaml
task_id: geometry-ai-selective-operation-approval
phase: Geometry Workbench
title: AI 几何草案逐项审阅与选择性确认
status: completed
record_origin: live
started_at_utc: 2026-08-18T01:45:00Z
ended_at_utc: 2026-08-18T01:58:14Z
duration_seconds: 794
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 总监基于 Geometry AI 证据回执收口后确定的下一项逻辑任务。
task_summary: 将 AI 建筑草案从整批确认升级为逐项审阅、画布联动和按最终选择生成审批哈希。
goals:
  - 在助手侧栏按操作逐项选择或取消选择墙体、顶点、Zone 区域和开口。
  - 让画布保留所有候选的可见状态，并用不同视觉状态表达已选与未选操作。
  - 只对最终选择重新本地预览、计算 operationsSha256 并进入既有用户确认写入链。
  - 保持项目/Revision/几何基线 stale 防护、确定性验证、撤销/重做和原始 PRJ 不直接写入边界。
allowed_scope:
  - Geometry Vision controller、草案纯函数、助手侧栏、Konva 候选叠加、i18n、CSS、测试、合同和任务事实源。
forbidden_scope:
  - 读取真实凭据、真实 AppData、用户唯一工程、图片路径或像素；绕过 Rust/Tauri、结构化草案、Patch/Diff 或用户确认；提交、推送、打包、签名或发布。
validation:
  - 运行 Geometry AI 纯函数/Hook/助手聚焦测试、Selective Approval 合同、TypeScript、生产构建和一次最终 Full。
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

- `useGeometryVisionDraft` 增加选中操作索引、逐项切换、全选/取消全选和局部预览。
- `geometryAiCanvasPreview` 保留候选操作索引与 selected 状态，画布可切换候选可见状态。
- `GeometryVisionDraftPanel` 增加复选框、选择摘要和选择性确认门禁。
- `operationsSha256` 只覆盖最终选中的安全操作数组；原有审批、Patch/Diff、确定性验证和历史提交路径不变。

## 自动验证

已完成本任务唯一一次最终 Full；没有使用 GUI、真实 Provider、真实工具、打包、签名或发布环境。

- Geometry AI Selective Approval contract：12 assertions passed。
- Geometry Assistant Draft Evidence contract：12 assertions passed。
- Vision Integration contract：11 assertions passed。
- Vision to Geometry Draft contract：20 assertions passed。
- Spatial Command Deck contract：23 assertions passed。
- Calibrated Plan Underlay contract：38 assertions passed。
- Geometry AI Hook、纯函数和助手面板聚焦测试：8 tests passed。
- 前端全量：57 个测试文件，415 tests passed。
- Python 全量：409 tests passed。
- Rust 全量：179 passed，1 ignored。
- TypeScript 类型检查、生产构建、Rust fmt、Clippy 和 Cargo check：通过。
- 生产构建保留既有 `installCanvasRenderer` 550.62 kB chunk 警告，未通过提高阈值隐藏。
- 最终 Full：仅运行 1 次，退出码 0，`QA-01 passed: 89 checks passed`。
- Full 中的任务日志合同（107 records）、任务日志变异合同、能力矩阵、Windows CI 合同和 `git diff --check`：通过。

## 实现结论

- AI 草案现在可以在助手侧栏逐项选择、取消选择或全选/取消全选；零选择会 fail closed，不会提交。
- 画布保留所有候选操作，并以选中/未选中状态表达可见性；点击候选与侧栏选择共用同一 controller 状态。
- 局部预览只对最终选中的有序操作执行；审批 `operationsSha256` 只覆盖最终选择数组。
- 项目、Revision、几何基线、请求和既有 Patch/Diff/确定性验证/用户确认边界继续生效；AI 不直接写入原始 PRJ。

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
