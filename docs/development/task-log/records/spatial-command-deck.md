# Spatial Command Deck

```yaml
task_id: spatial-command-deck
phase: Geometry Workbench
title: 全画布空间命令台与 AI 几何草稿入口
status: completed
record_origin: live
started_at_utc: 2026-08-10T06:19:27Z
ended_at_utc: 2026-08-10T07:03:34Z
duration_seconds: 2647
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户选择第二套 Spatial Command Deck 视觉方案，并要求减少独立主题浮窗、提升现代感，同时为 AI 读图与画图保留真实安全链路。
task_summary: 在现有未提交 Geometry Workbench 基础上，将七面板工作区收敛为全画布和三个上下文浮岛，主题移入溢出菜单，并提供不伪造视觉能力的图纸附件、Provider 能力回执与几何草稿审查入口。
goals:
  - 以用户选定的第二套参考图为唯一视觉事实源，重建全画布命令台和上下文浮岛
  - 去除独立主题浮窗并保留三套完整主题、真实建模工具、语义 selection 和撤销重做
  - 为图片附件、视觉提取、DeepSeek 文本推理和非应用几何草稿建立诚实的分阶段 UI
  - 完成中英文、响应式、无障碍、自动合同和同图 Design QA
allowed_scope:
  - GeometryWorkbench、GeometryCanvas、ProjectPage、DestinationContent、WorkbenchRuntime 和开发质量夹具
  - 现有附件/Provider 只读状态、样式、主题令牌、中英文 locale、测试合同和研发事实文档
  - F:\Codex_File\spatial-command-deck 下的临时截图与对照证据
forbidden_scope:
  - 使用或记录用户密钥、读取真实凭据/AppData/用户工程、发起真实 Provider 请求
  - 把 DeepSeek 文本模型伪装成视觉模型、伪造像素发送或把质量夹具冒充产品能力
  - 绕过 controller、Patch/Diff、确定性验证、用户确认或直接写 PRJ
  - reset、checkout、clean、stash、worktree、提交、推送、打标签、打包、签名或发布
validation:
  - 先运行前端全量、生产构建和三个 Geometry 合同，再运行一次最终 Full
  - 使用 in-app Browser 在同一输入中对比选定参考图与 1488×1056 实现，并验证 1280×720、1024×720 和核心交互
  - 自动、Browser、真实 GUI、真实 Provider、打包、发布和用户验收状态必须分开记录
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed；browser_design_qa=passed；github_windows_ci=pending_push；manual_gui=not_run；real_tools=not_run；real_provider=not_run；packaged=no；clean_machine=not_run；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
```

## 开始事实

- `main`、`HEAD` 与 `origin/main` 均为 `8c0836b00c9bde4cebcdd0f25871be94fa1f2961`。
- 工作树包含 Geometry Workbench Foundation 与 Geometry Editor Integration 的累积未提交修改；本任务必须原样保留并增量实现，不 reset、checkout、clean、stash 或创建 worktree。
- 视觉事实源为用户在本轮选择的第二张 `Spatial Command Deck` 设计图；中央建筑画布、左上对象导航、底部工具岛、右上属性岛和顶部 AI 命令入口是主要层级。
- 现有附件中心对图片只披露元数据，`image_pixels_sent=false`；DeepSeek V4 Flash 为文本推理模型。未建立视觉 Provider 跨层契约前，产品不得伪造已识图或已生成几何。

## 状态

- `implementation=complete`
- `automated_verified=passed`
- `browser_design_qa=passed`
- `manual_gui=not_run`
- `real_provider=not_run`
- `packaged=no`
- `signed=not_run`
- `released=no`
- `user_validated=not_run`
- `merged_to_main=no`

## 实现结果

- 项目模式改为全画布命令台：52 px 顶部命令栏、左上楼层/Zone 导航岛、底部建模工具岛、右上选中对象属性岛，以及按需出现的图层、证据和 AI 草稿面板。
- 主题不再占用独立浮窗，移入更多菜单；三套主题继续复用同一几何事实和命令历史，兼容布局存储只用于读取主题。
- 现有选择、平移、墙体、Zone、门、窗、FlowPath、尺寸、fit、撤销/重做和确定性批次提交均保留；项目、Revision、语义 selection 与 stale-result 边界没有建立第二套 reducer。
- AI 草稿叠加使用独立紫色虚线图层，支持显示/隐藏和丢弃，不写入 controller、历史或 PRJ。视觉质量夹具使用生成的办公平面图资产，压缩后为 228,630 bytes。
- 正式 AI 入口复用附件中心和 Provider 状态，但因现有附件链仅披露元数据，生成按钮明确禁用；界面把视觉提取和 DeepSeek 结构化文本推理分成两段，避免把文本模型伪装为视觉模型。
- 中英文文案、响应式断点、原生按钮/标签、pressed/selected/expanded 状态、reduced-motion 和 forced-colors 路径已补齐。

## Browser Design QA

- 参考图与实现统一归一到 1488×1056，并放入同一张 `F:\Codex_File\spatial-command-deck\comparison-final.jpg` 审查；最终结果记录于项目根目录 `design-qa.md`，为 `passed`。
- 实际切换建筑纸张主题；验证 AI 对比叠加可隐藏并再次显示；切换墙体工具并恢复选择工具；导航、画布与属性岛使用同一 Zone/墙体选择。
- 生产边界状态验证生成按钮为 disabled，并可见“只提供附件元数据、未发送像素、DeepSeek 仅负责文本推理”的说明。
- 1024×720 的 DOM 边界测量显示导航、AI 对话、属性岛、工具岛和状态控件都在 viewport 内且互不重叠；另保存 1280×720 证据。最终页面没有 Vite error overlay。
- 该结果仅为浏览器 Design QA，不等于真实 Tauri GUI、Windows 125%/200% 缩放、screen reader、真实 Provider 或用户验收。

## 聚焦验证

- `pnpm test -- --run`：36 个测试文件、293 项通过。
- `pnpm build`：通过；AI 平面图资产由 2.60 MB PNG 压缩为 228.63 kB JPEG。既有 ECharts 550.62 kB 和主入口约 603.94 kB 警告保持可见。
- Geometry Workbench Foundation：51 项通过。
- Geometry Editor Integration：30 项通过。
- Spatial Command Deck：23 项通过。
- 最终 Full 本任务只运行 1 次，退出码 `0`，`QA-01 passed: 71 checks passed`，外层用时约 101.2 秒。
- Full 明细：Python 384 项通过；前端 36 个测试文件、293 项通过；Rust 153 项通过、1 项按设计忽略；Windows CI 合同与 12 项变异、生产构建、Rust fmt、Clippy `-D warnings` 和 Cargo check 均通过。
- 日志：`F:\Codex_File\spatial-command-deck\full-verification.log`；退出码：`F:\Codex_File\spatial-command-deck\full-verification-exit.txt`。

## 明确边界

- 未使用用户提供的 API Key，未读取 Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程；`real_provider=not_run`。
- 未实现或伪造图片像素发送、视觉识别或真实 AI 几何生成；开发质量夹具不是产品能力证据。
- 未运行真实 Tauri GUI、官方 ContamX/SimRead、安装包、系统缩放或用户验收。
- 未 reset、checkout、clean、stash 或创建 worktree；未提交、推送、打标签、打包、签名或发布。
