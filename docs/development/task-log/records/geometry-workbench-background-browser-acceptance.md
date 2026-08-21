# Geometry Workbench Background Browser Acceptance

```yaml
task_id: geometry-workbench-background-browser-acceptance
phase: Geometry Workbench
title: Geometry Workbench 浏览器视觉与交互验收
status: completed
record_origin: live
started_at_utc: 2026-08-20T06:37:06Z
ended_at_utc: 2026-08-20T07:06:37Z
duration_seconds: 1771
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 三模型工作流中的浏览器视觉与交互执行模型，在不占用用户桌面、不使用 Computer Use 的前提下完成 Geometry Workbench 浏览器级视觉与交互验收。
task_summary: 使用 Antigravity 隔离无头浏览器（Edge/CDP `--headless=new`）运行开发质量夹具，完整覆盖 1440×900 / 1280×720 / 1024×720 分辨率、三主题（工程蓝图、建筑纸张、夜间实验室）、中英文双语、交互链路（教学模型加载、选择联动、Studio/SketchPad/Topology 模式流转、墙体工具激活、撤销重做语义状态、AI 草案依赖感知级联与自动包含、键盘 Tab 导航与可见焦点轮廓），达成 26 项全量检查通过、0 控制台未捕获异常、0 Vite 错误覆盖层，并生成完整 evidence-manifest.json 证据清单。
goals:
  - 完成无屏幕浏览器验收矩阵（1440×900、1280×720、1024×720、工程蓝图、建筑纸张、夜间实验室、中英文）。
  - 验证构造、SketchPad、气流拓扑及返回构造模式。
  - 验证几何选择、绘图、撤销重做和 AI 草案审查交互。
  - 修复本轮能够确定根因的前端视觉或交互缺陷并补齐测试。
  - 形成可复核的截图、证据清单、控制台和测试证据。
  - 不改变 CONTAM 语义、Rust/Tauri 权限或原始 PRJ 安全边界。
allowed_scope:
  - src/components/workbench/geometry/**
  - src/components/workbench/assistant/**
  - src/styles/features/geometry.css
  - src/styles/features/assistant.css
  - src/i18n/locales/zh-CN.json
  - src/i18n/locales/en.json
  - 与上述问题直接对应的前端测试
  - 本任务日志、任务日志索引和能力矩阵
  - 仓库外的私有浏览器验收证据根中的产物
forbidden_scope:
  - 真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData、用户唯一工程。
  - 修改 Rust/Tauri、Python、PRJ 解析或写入、ContamX/SimRead、desktop-api 权限链、reducer/controller 架构。
  - 新增运行时依赖、引入第二套画布框架、大范围重构已选定的浮层布局。
  - 提交、推送、打标签、打包、签名或发布。
validation:
  - 浏览器隔离验收、自动测试、构建检查分开记录。
  - 任务收口时按规则运行全量或聚焦验证。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
implementation: complete
automated_verified: passed
github_windows_ci: pending_push
browser_design_qa: passed
manual_gui: not_run
real_tools: not_run
real_provider: not_run
packaged: not_run
signed: not_run
released: no
user_validated: not_run
merged_to_main: no
notes:
  - 任务完成，无屏幕浏览器执行 26 项严格断言全部 passed，0 未捕获异常。
  - 20 张正式截图保存在仓库外的私有验收证据存储中，未提交到仓库。
  - 2 张旧版非标草案截图已归档至 superseded\ 目录。
  - 已生成 evidence-manifest.json 记录每张截图的元数据、视口、语言、主题、断言状态与 SHA-256。
  - 记录 3 条 Konva 6-layer 控制台警告为已知非功能性性能债务。
```

## 验收结果摘要

1. **响应式与主题矩阵 (1440×900 / 1280×720 / 1024×720)**：
   - **1440×900 中文**：默认工程蓝图 (`engineering-blueprint`)、建筑纸张 (`architectural-paper`)、夜间实验室 (`night-laboratory`) 均正确应用对应主题属性 `data-geometry-theme`，菜单选择后自动关闭。
   - **1280×720 中英文**：建筑纸张与夜间实验室双语下文字排版良好，无重叠或溢出截断；`07_1280x720_en_night.png` 与 `05_1280x720_zh_night.png` 经 SHA-256 严格区分（中英文动态切换经 DEV-only 质量夹具测试桥 `window.__contamGeometryQuality` 触发组件重新渲染，完成 DEV-only 质量夹具中的中英文渲染验证；本任务未验证正式设置页语言切换、持久化或真实 Tauri 语言流程）。
   - **1024×720 紧凑布局与 AI 弹窗**：`08_1024x720_zh_blueprint.png` 在拍摄前显式关闭 AI 弹窗，断言导航岛（左侧宽 205px，右边界 219px）与属性检查岛（右侧宽 220px，左边界 790px）横向间隔 571px，无重叠 (`nav.right < insp.left`)，底部工具坞完全在视口内；`09_1024x720_zh_ai_open.png` 点击 AI 打开弹窗并断言弹窗完全在视口内 (`bounds.right <= 1024 && bounds.bottom <= 720`)，`08` 与 `09` 经 SHA-256 严格区分。

2. **核心交互链路**：
   - **教学模型加载与对象检查**：首层平面与 3 个 Zone（开放办公区、会议室、设备与交通区）完整渲染；导航器选择墙体 `demo-w-3` 后，属性岛精准同步显示长度 8,000 mm、厚度 240 mm 及端点坐标表单；选择 Zone 2（会议室）画布与检查器联动高亮（`aria-pressed="true"`）。
   - **模式流转与构造模式返回**：从 Studio 构造模式平滑切换到事实图 (`SketchPad`) 只读视口，再切换到气流拓扑 (`Topology`) 视口，点击“返回 Studio 构造”瞬间恢复可交互 Konva 画布与空间指令台。
   - **绘图工具与撤销重做**：点击墙体工具后 `aria-pressed="true"`，工具状态高亮；切换回选择工具，顶部指令台提供语义撤销与重做图标按钮（`aria-label="撤销几何操作"` / `aria-label="重做几何操作"`），初始加载状态为 disabled。
   - **AI 草案依赖感知与选择性批准**：打开 AI 建筑草案助手抽屉，展现包含 4 项操作的层级列表；取消勾选前置顶点 0 时，级联取消依赖它的墙体 2 与门洞 3（已选择由 4 项降至 1 项）；清空后仅勾选门洞 3 时，系统自动补充包含顶点 0、顶点 1 与墙体 2，显示“已自动包含 2 项前置依赖”提示与“依赖”徽标；AI 草案保持虚线预览叠加，严禁直接篡改底层 PRJ。
   - **键盘导航与无障碍可见焦点**：Tab 键顺序平滑遍历指令台操作按钮（运行、结果、AI、更多操作），`:focus-visible` 轮廓（`outline: 2px solid rgb(38, 132, 255)`）清晰可见；`20_tab_focus_navigation.png` 与 `19_assistant_closed.png` 经 SHA-256 严格区分。
   - **零缺陷诊断与已知性能债务**：未触发任何 Vite Error Overlay，未捕获任何控制台未处理异常（Uncaught Exception: 0）；记录 3 条 Konva 6-layer 控制台警告为已知非功能性性能债务。

## 关键截图对比与 SHA-256 完整性验证

| 对比用例 | 截图 A (SHA-256 前12位) | 截图 B (SHA-256 前12位) | 是否严格不同 | 区分依据 |
| :--- | :--- | :--- | :--- | :--- |
| **05 (中文夜间) vs 07 (英文夜间)** | `ae71c1f32d9e` | `0a5d08d8c4e2` | **是 (true)** | 语言切换至 English，指令台操作文本由“运行/结果”变为“Run/Results”，模式按钮变为“Build” |
| **08 (AI关闭) vs 09 (AI打开)** | `691605954e3a` | `a58228dba174` | **是 (true)** | 08 为纯画布紧凑视图，09 居中浮起 AI 建筑草案对话框且严格在 1024×720 视口内 |
| **19 (无焦点) vs 20 (可见焦点轮廓)** | `0454e121e33c` | `3fe4df74e25c` | **是 (true)** | 20 中通过 Tab 键激活指令台按钮 `:focus-visible` 蓝色高亮聚焦轮廓 (`outline: 2px solid #2684ff`) |

## 产物与证据清单（本机私有证据 local/private evidence）

> 注：以下文件保存在仓库外的私有验收证据根中，供本地追溯与审计核验；它们不是仓库内的跨机器可移植链接。

- **测试运行器**：`runner.mjs`
- **证据清单**：`evidence-manifest.json`
- **结构化验收总结**：`acceptance_summary.json`
- **浏览器执行日志**：`browser_acceptance.log`
- **20 张正式截图矩阵**：
  1. `01_1440x900_zh_blueprint.png` (SHA256: `af407e32287df5506cd8952646bf10f27f1be7eacd72040737031f41f2367d99`)
  2. `02_1440x900_zh_paper.png` (SHA256: `9ef15a1e7973a4697c45b060023dc1859ee49a468d939da4465718f9e4b56386`)
  3. `03_1440x900_zh_night.png` (SHA256: `a400d6beed5a0d8ed14b276a24e5a98f066fe233a59f8e465b11127b978cf0ec`)
  4. `04_1280x720_zh_paper.png` (SHA256: `bb8412752d031f2417ec1bb138939e1309b27dc5a777afa5b73ac71dd80d8e90`)
  5. `05_1280x720_zh_night.png` (SHA256: `ae71c1f32d9ecee4b6ed7d0582936e9d9dfaba74e9e66f96134659f7e14eb507`)
  6. `06_1280x720_en_paper.png` (SHA256: `90bf0740925c4efcf9f33bf9695d7367c34b6794691456d95aa42d4a23438253`)
  7. `07_1280x720_en_night.png` (SHA256: `0a5d08d8c4e2e03a9f074d0e5831518f88cffccba7d0c3ebaa580dc0fb83cf24`)
  8. `08_1024x720_zh_blueprint.png` (SHA256: `691605954e3af33f5d506d203ae31792688f1fae925b3992a543f3c39aa92c4d`)
  9. `09_1024x720_zh_ai_open.png` (SHA256: `a58228dba17414c0228392d47c6674c988fcf3eb2b069d3e813fa2a2ef189bfb`)
  10. `10_teaching_example_loaded.png` (SHA256: `237529b10e08213fb385fc58ec18e7e1c8d50bf699479b0dc498263309a47ca6`)
  11. `11_wall_selected_sync.png` (SHA256: `e2954791df7b39c948e42f9b17781fc1822ea407c6f0e49ec631f4fcbc5e2d6c`)
  12. `12_zone_selected_sync.png` (SHA256: `a0782261d56567f4262ae7e7811fe1e90539c3e414c82b0e68e4bfd6a89c424a`)
  13. `13_mode_sketchpad.png` (SHA256: `1ed14a713cf0fd11ee85bbda38aa9e8555e966ebae336cfcfaae3a6fb9023023`)
  14. `14_mode_topology.png` (SHA256: `6f0ccca460f71b9533f81e35dd7a5369bb9c1a523d24e10118eb3d964205dc11`)
  15. `15_mode_return_studio.png` (SHA256: `a0782261d56567f4262ae7e7811fe1e90539c3e414c82b0e68e4bfd6a89c424a`)
  16. `16_wall_tool_active.png` (SHA256: `f8e9cae677f21a0b5b4e7235b2e987c2b3e8e19e97c9b329486c99c7553b4971`)
  17. `17_undo_redo.png` (SHA256: `a0782261d56567f4262ae7e7811fe1e90539c3e414c82b0e68e4bfd6a89c424a`)
  18. `18_ai_assistant_operations_dependency.png` (SHA256: `53aa7295c88df70b991b8a531666e1e8fe3ce7e155c0a3791a8e030bc6885dfb`)
  19. `19_assistant_closed.png` (SHA256: `0454e121e33c280521e14948a3138b7dd5351e2b5e28a58a98402ee388049688`)
  20. `20_tab_focus_navigation.png` (SHA256: `3fe4df74e25cfd019f2a00b09cae1115b026600c738096f437039a58bf371089`)
- **归档目录（已弃用旧截图）**：
  - `superseded/18_ai_draft_generated.png`
  - `superseded/19_ai_draft_preview_badge.png`
