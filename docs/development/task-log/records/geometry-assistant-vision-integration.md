# Geometry Assistant Vision Integration

```yaml
task_id: geometry-assistant-vision-integration
phase: Geometry Workbench
title: Codex 助手内的读图与建筑草案审查入口
status: completed
record_origin: live
started_at_utc: 2026-08-17T12:42:12Z
ended_at_utc: 2026-08-17T12:46:47Z
duration_seconds: 275
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进，并已明确 AI 助手应具备读图和画图能力且避免额外浮窗。
task_summary: 将既有 Codex Luna 几何视觉草案接入现有助手侧栏，统一图片选择、提示词、生成、候选叠加、确认和丢弃路径。
goals:
  - 由运行时持有唯一 Geometry Vision Draft controller，避免在画布和助手中产生两套状态。
  - 在现有 Codex 助手侧栏提供图纸选择、受限提示词、Luna 能力门禁和草案审查操作。
  - 让画布只负责显示 ready 草案叠加；确认继续进入同一几何命令历史，不直接写 PRJ。
  - 保留 Codex 订阅登录、图像输入能力、项目/Revision/geometry hash 和用户二次确认边界。
allowed_scope:
  - React 运行时接线、助手 UI、Geometry Workbench 入口、i18n、CSS、测试、合同和任务事实源。
forbidden_scope:
  - 读取真实凭据、真实 AppData、用户唯一工程或图片路径/像素；绕过 Rust/Tauri、结构化草案、本地验证或用户确认；提交、推送、打包、签名或发布。
validation:
  - 运行 vision 合同、助手集成合同、前端聚焦测试、TypeScript、生产构建和一次最终 Full。
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

- `useGeometryVisionDraft` 从 GeometryWorkbench 内部提升到 `WorkbenchRuntime`，并通过 ProjectPage/ContextSidebar 共享。
- 新增 `GeometryVisionDraftPanel`，把选图、提示词、Codex Luna 图像能力状态、草案摘要、叠加状态、确认、丢弃和停止操作放入现有助手侧栏。
- Geometry Workbench 的 AI 按钮在正式应用中打开现有助手；画布仅消费 ready 草案生成候选叠加。质量夹具的示例浮层仍限定在开发 harness。
- 沿用 `geometry_ai_draft.v1`、本地确定性预览、`commitApprovedAiGeometryOperationBatch`、撤销/重做和原始 PRJ 不写回边界。

## 证据边界

- 本轮不发起真实 Codex 图片请求；`real_provider=not_run`。
- 本轮不进行 Computer Use、系统缩放、真实工具、打包或发布验收。
- 前端只看到附件安全视图中的名称和选择状态，不接收路径、像素或密钥。

## 自动验证

- 助手视觉集成合同：11 assertions passed。
- Vision to Geometry Draft 合同：20 assertions passed。
- 前端聚焦测试：5 个文件、69 项通过；TypeScript 通过；生产构建通过。
- 第一次 Full 发现两处历史合同仍要求视觉生成逻辑位于 GeometryWorkbench，退出码 1；未发现实现或工具链失败。
- 修正 R1-02 与 Spatial Command Deck 合同后聚焦复测通过。
- 第二次也是最终 Full：退出码 0，`QA-01 passed: 87 checks passed`；Python 409、前端 411、Rust 179 通过和 1 项忽略，构建、Clippy、Cargo check、Windows CI 合同均通过。
- `git diff --check`：通过，仅有既有 LF/CRLF 转换提示。

## 最终状态

- `implementation=complete`
- `automated_verified=passed`
- `github_windows_ci=pending_push`
- `manual_gui=not_run`
- `real_tools=not_run`
- `real_provider=not_run`
- `packaged=not_run`
- `signed=not_run`
- `released=no`
- `user_validated=not_run`
- `merged_to_main=no`
