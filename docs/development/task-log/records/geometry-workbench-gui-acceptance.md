# Geometry Workbench GUI Acceptance

```yaml
task_id: geometry-workbench-gui-acceptance
phase: Geometry Workbench
title: 真实 Tauri 几何工作台、结果证据链与 AI 入口桌面验收
status: completed
record_origin: live
started_at_utc: 2026-08-17T12:03:18Z
ended_at_utc: 2026-08-17T12:06:41Z
duration_seconds: 203
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户授权使用 Computer Use 继续验收 Geometry Workbench，并要求确认真实建筑构造、现代浮层布局、AI 读图入口与操作逻辑。
task_summary: 在隔离运行环境和官方三 Zone 测试副本上验证真实 Tauri 桌面路径；修复从 SketchPad/拓扑返回 Studio 构造模式的可达性问题。
goals:
  - 验证项目打开后的浮层式建筑构造画布、墙体、门窗、Zone、FlowPath、选择同步和只读边界。
  - 验证构造、SketchPad、气流拓扑、三套画布外观、中英文、运行、结果和证据链路径。
  - 验证官方 ContamX 求解和 SimRead 读取在 GUI 中保持 verified/partial 语义，不伪造缺失数据。
  - 验证 AI 读图/画图入口、Codex 订阅连接边界和未连接时的诚实禁用状态。
  - 修复并测试从只读视觉模式返回 Studio 构造模式的用户路径。
allowed_scope:
  - Geometry Workbench、VisualModelWorkspace、现有 Tauri 开发实例、聚焦前端测试、任务日志和能力矩阵。
  - F:\Codex_File\geometry-workbench-gui-acceptance 下的隔离运行目录和测试副本。
forbidden_scope:
  - 真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData、用户唯一工程和真实 Provider 请求。
  - 修改原始 PRJ、绕过 Patch/Diff/确认链、系统显示缩放、提交、推送、打标签、打包、签名或发布。
validation:
  - GUI 证据、真实官方工具、自动测试、构建、远程 CI、Provider、打包和用户验收分别记录。
  - 聚焦测试和构建完成后，任务收口只运行一次最终 Full。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
implementation: complete
automated_verified: passed
github_windows_ci: pending_push
manual_gui: partial
real_tools: passed
real_provider: not_run
packaged: not_run
signed: not_run
released: no
user_validated: not_run
merged_to_main: no
notes:
  - GUI 使用隔离 LOCALAPPDATA、APPDATA、TEMP、TMP；fixture 为官方三 Zone 测试副本，不是用户工程。
  - Computer Use 截图由工具直接展示；未保存或解码截图 payload，也未伪造本地截图路径。
- 当前已确认 ContamX 求解成功、SimRead 1 Zone 成功和 2 Zone 失败，结果数据集正确标记为 partial。
- 最终 Full：`QA-01 passed: 85 checks passed`；Python 409 passed、前端 408 passed、Rust 179 passed + 1 ignored；生产构建、fmt、Clippy、Cargo check 和 Windows CI 合同均通过。
- 本次 GUI 验收确认构造、SketchPad、气流拓扑、三套画布外观、中英文、运行、结果、证据链和 AI 入口；125%/200% 系统缩放、干净机、打包、真实 Provider 和用户最终验收未执行，因此 `manual_gui=partial`。
```

## 进行中

- 已验证项目页显示真实建筑墙体、门窗、Zone 面积、网格、悬浮建模工具和右侧属性岛。
- 已验证 SketchPad 与气流拓扑切换、选择同步、时间序列表格、空间结果和证据链。
- 已验证三套画布外观、英文界面、Codex 未连接状态和 AI 几何受控预览。
- 已修复只读视觉模式缺少返回 Studio 构造入口的问题，并添加前端回归测试。

## 证据边界

- GUI 验收使用真实 Tauri 开发窗口，但不等同于 Windows 系统 125%/200% 缩放、干净机、签名或用户最终验收。
- 官方工具请求通过 Tauri/Rust/Python 既有权威链路执行；未读取或保存真实用户凭据。
- AI 未连接，未触发登录、未发送请求；Codex 连接和真实 Provider 回归保持 `not_run`。

## 最终收口

- 真实 Tauri GUI：`partial`。已确认打开项目后进入本轮 Geometry Workbench；建筑墙体、门窗、Zone、FlowPath、属性面板、选择同步、构造/SketchPad/拓扑切换、运行、结果和证据链路径均可用。画布外观、中文/英文与 AI 未连接状态也已观察。
- 真实官方工具：`passed`。隔离三 Zone fixture 上 ContamX 求解成功；SimRead 结果为 1 个成功 Zone、2 个失败 Zone，界面诚实显示 `partial`，未伪造缺失数据，源 PRJ 未修改。
- 本轮发现并修复视觉模式缺少返回 Studio 构造模式入口的问题；新增 `VisualModelWorkspace` 回归测试，修复仅通过现有 controller 模式链路生效。
- 自动验证：`QA-01 passed: 85 checks passed`，只运行本轮最后一次 Full；未重复运行。
- 未提交、未推送、未打包、未签名、未发布；工作树继续保留既有 Geometry Workbench 累积修改及本轮修改。
