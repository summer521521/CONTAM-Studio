# Geometry Workbench Foundation

```yaml
task_id: geometry-workbench-foundation
phase: Geometry Workbench
title: 建筑几何契约、编辑状态机与悬浮工作台基础
status: completed
record_origin: live
started_at_utc: 2026-08-10T04:08:41Z
ended_at_utc: 2026-08-10T04:50:07Z
duration_seconds: 2486
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户确认悬浮绘图工作台视觉目标并授权 Sol XHigh 直接执行几何领域基础任务
task_summary: 在不伪造 ContamW/PRJ 几何写回能力的前提下，建立版本化 Studio 建筑几何草稿、确定性验证、编辑命令历史、悬浮布局和三主题迁移基础。
goals:
  - 分离 CONTAM SketchPad 只读投影与 Studio 自有毫米建筑几何草稿
  - 建立 Python、Rust、TypeScript 一致的有界几何契约和共享 fixture
  - 建立哈希绑定编辑命令、验证后提交、撤销重做、分支截断和重放保护
  - 建立七类悬浮面板、三套主题和只保存偏好的安全布局迁移
  - 更新当前事实源、ADR、架构、能力矩阵和自动合同，不创建新的 Phase 或 R2 编号
allowed_scope:
  - contracts/geometry、Python 几何投影与验证、Rust 私有验证模块、TypeScript 纯领域状态、主题令牌和聚焦测试
  - AGENTS.md、Geometry Workbench 事实源、ADR、架构、当前状态、能力矩阵、任务日志和验证合同
  - F:\\Codex_File 下的最终验证日志
forbidden_scope:
  - 最终 React/Konva 绘图界面、正式 GUI 截图验收、PRJ 几何写回或任意 ContamW 等价能力声明
  - 新增 Tauri 命令、前端文件权限、第二套画布框架、真实 Provider 或真实用户项目
  - worktree、提交、推送、打标签、打包、签名、发布、系统设置和真实 AppData
validation:
  - 开始时 main、HEAD 与 origin/main 均为 8c0836b00c9bde4cebcdd0f25871be94fa1f2961，工作树干净。
  - 开发阶段先执行 Python、Rust、TypeScript 聚焦测试和 Docs 门禁；任务收口只运行一次最终 Full。
  - 自动验证不得提升 manual_gui、real_tools、real_provider、packaged、signed、released 或 user_validated。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed；github_windows_ci=pending_push；manual_gui=not_run；real_tools=not_run；real_provider=not_run；packaged=no；clean_machine=not_run；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
  - 本轮不创建 worktree，不读取真实凭据、AppData 或用户唯一工程，不提交、推送、打标签、打包、签名或发布。
```

## 开始事实

- `main`、`HEAD` 与 `origin/main` 均为 `8c0836b00c9bde4cebcdd0f25871be94fa1f2961`，开始时工作树干净。
- `spatial_projection.v1` 和气流拓扑继续作为只读可信投影；新的建筑几何草稿不会把 Zone 图标锚点伪装成房间多边形。
- 最终视觉目标为悬浮绘图工作台，但本轮仅交付领域、状态、迁移、合同与文档基础，不执行正式 GUI 截图验收。

## 实现结果

- 新增四份严格 JSON Schema：`building_geometry.v1`、`geometry_edit_command.v1`、`geometry_validation.v1` 和 `floating_workbench_layout.v1`，并用共享 Studio metric fixture 固定三端合法最小模型与 canonical SHA-256。
- Python 从 `spatial_projection.v1` 只投影已验证墙图标，使用半网格整数坐标，不推断 Zone 多边形；领域验证覆盖身份、来源/能力、数量、payload、坐标、正交墙、交点、开口、Zone 环/重叠和 FlowPath。
- Rust 新增私有、无命令权限的严格验证模块，使用 `deny_unknown_fields`、项目/Revision 绑定、对象和拓扑预算；该模块在后续桌面接线前仅作预集成边界，不扩展 Tauri ACL。
- TypeScript 新增 canonical SHA-256、验证后提交的封闭编辑命令、不可变 undo/redo、分支截断、command ID 重放保护和项目/source/Revision 重置。AI 与 system 命令还必须取得绑定 command ID 与当前 geometry hash 的用户批准。
- 新增三套完整主题令牌：`engineering-blueprint`、`architectural-paper`、`night-laboratory`。悬浮布局只允许七类面板，加载时按当前 viewport 钳制；夹带几何数据、未知字段或重复面板时关闭失败/回退。
- 当前事实源改为描述性的 Geometry Workbench，R1 标记为 v0.5.0 历史事实；禁止继续创建 Phase、QA、Batch 或 R2 编号。新增 ADR-021、架构说明、能力矩阵行和 51 项基础合同。

## 验证结果

- 聚焦：Geometry TypeScript 20 项、Python 10 项、Rust 5 项通过；共享 fixture 的 canonical SHA-256 为 `A3A7AA8AD664F02A9DBC2CDCCA0440A3F737613697814502F4C5CDDBB0E03C5D`。
- 最终 Full 前全量预检：前端 33 个文件/281 项，Python 384 项，Rust 153 项通过、1 项按设计忽略；Ruff、Rust fmt、严格 Clippy、Cargo check、TypeScript/生产构建和 `git diff --check` 通过。
- Docs 门禁：39 项通过；Geometry Workbench 基础合同 51 项，任务日志合同 86 条记录。
- Full 启动共两次。第一次因总监外层工具错误设置为 5 秒时限，日志只到 `Foundation defect ledger` 且没有退出码；进程随后结束，但证据不可判定，保留为 `F:\\Codex_File\\geometry-workbench-foundation\\full-verification-incomplete.log`，未冒充通过。
- 第二次为唯一可判定的最终 Full：退出码 `0`，`QA-01 passed: 69 checks passed`，外层用时约 71.6 秒；日志为 `F:\\Codex_File\\geometry-workbench-foundation\\full-verification.log`，退出码文件为 `full-verification-exit.txt`。
- 生产构建继续保留既有 ECharts 550.62 kB 与主入口 513.79 kB 警告；未提高阈值、未新增运行时依赖或第二套画布框架。

## 明确未完成

- 本轮没有 React/Konva 最终绘图器、墙/门窗工具栏、捕捉交互或悬浮面板可视界面；`manual_gui=not_run`。
- Studio metric 草稿当前不能写回 PRJ，也不能声称与 ContamW 等价；官方 ContamX/SimRead 本轮未运行。
- 未运行远程 Windows CI、真实 Provider、打包、干净机、签名、发布或用户验收。
- 未读取真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程；未提交、推送、打标签或发布。
