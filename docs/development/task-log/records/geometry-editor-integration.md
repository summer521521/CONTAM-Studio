# Geometry Editor Integration

```yaml
task_id: geometry-editor-integration
phase: Geometry Workbench
title: 悬浮式建筑几何编辑器与真实构造绘制体验
status: completed
record_origin: live
started_at_utc: 2026-08-10T04:56:14Z
ended_at_utc: 2026-08-11T04:30:00Z
duration_seconds: 119
resumed_at_utc: 2026-08-11T04:13:07Z
css_ownership_cleanup_started_at_utc: 2026-08-11T04:28:01Z
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求 Sol XHigh 继续直接执行，并已确认采用 2 号浮动布局与三套配色，目标为接近 ContamW 的真实建筑构造绘制体验
task_summary: 将已验证的 building_geometry.v1 领域基础接入项目工作区，实现悬浮式、可访问、可撤销、诚实降级的 Studio 建筑几何编辑器，同时保留 SketchPad 只读事实层与 PRJ 安全边界。
goals:
  - 按选定参考图实现浮于画布之上的工具栏、楼层/区域、图层、主题和属性检查器
  - 支持空白 Studio 建筑草稿、墙体与区域绘制、选择、捕捉、撤销重做和确定性校验
  - 提供工程蓝图、建筑纸张和夜间实验室三套完整主题并保持偏好迁移
  - 让 Studio 几何与项目、source hash、Revision 和语义对象显式绑定，不把 SketchPad 锚点伪装为真实建筑边界
  - 保留只读 SketchPad/气流拓扑切换、键盘替代路径、窄窗口和高对比模式
allowed_scope:
  - ProjectPage、VisualModelWorkspace、现有 Konva 画布、Geometry Workbench React 状态和组件
  - 既有工作台偏好、TypeScript 几何领域、项目样式、设计令牌、中英文文案和前端测试
  - 必要的任务日志、能力矩阵、当前事实源、聚焦合同和 F:\\Codex_File 设计验收证据
forbidden_scope:
  - 把 Studio 草稿伪装成 PRJ 原生几何、未经用户确认写回原始 PRJ、重写官方 ContamX 或声称与 ContamW 完全等价
  - 新增第二套画布框架、前端文件或进程权限、真实 Provider、真实凭据、真实 AppData 或用户唯一工程
  - worktree、提交、推送、打标签、打包、签名、发布和系统显示设置
validation:
  - 先运行 Geometry/React 聚焦测试，再运行前端全量、生产构建、Python/Rust 回归和合同检查。
  - 使用与选定参考图一致的本地渲染状态执行截图对比并在 design-qa.md 记录可见差异与修正。
  - 收口时只把真实执行过的自动验证、Browser 视觉检查和 GUI 状态分别记录，不相互替代。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 总监收口修正完成；implementation=complete；automated_verified=passed。
  - github_windows_ci=pending_push；manual_gui=not_run；real_tools=not_run；real_provider=not_run；packaged=no；clean_machine=not_run；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
  - 当前工作树包含上一任务 Geometry Workbench Foundation 的未提交修改；本轮在同一主线工作树增量实现并完整保留。
```

## 开始事实

- `main`、`HEAD` 与 `origin/main` 均为 `8c0836b00c9bde4cebcdd0f25871be94fa1f2961`。
- Geometry Workbench Foundation 已在当前未提交工作树建立三端几何契约、编辑历史、布局迁移和三主题令牌，最终 Full 为 `69 checks passed`。
- 本轮视觉唯一目标为用户选定的 2 号悬浮布局；建筑纸张为默认主题，同时完整保留工程蓝图与夜间实验室。
- SketchPad 与气流拓扑继续表达 PRJ 中已验证的只读事实；新的 Studio 建筑草稿必须由用户明确创建和绘制。

## 进行中

- ProjectPage、语义 selection、Konva 画布和工作台偏好接线已完成。
- 悬浮工作台、编辑工具、属性检查器、手势级历史和校验反馈已完成；正在执行最终自动门禁。

## 实现结果

- 项目页以 `GeometryWorkbench` lazy boundary 接入唯一运行时 controller；项目 session、source hash、Revision 或语义 identity 改变时清空 Studio 草稿、selection、诊断和历史，页面导航不会另建业务 reducer。
- 中央画布使用毫米整数坐标、250 mm 捕捉和正交墙；支持空白草稿或明确标记的三 Zone 教学示例、矩形 Zone、墙体、门、窗、FlowPath 锚点、临时尺寸、平移、缩放和 fit。
- 多条底层命令先在候选历史中全部验证，任一失败则整体不发布；一次用户绘制手势以记录的命令数量整体撤销/重做，避免只撤掉墙而遗留顶点。
- 门窗切断墙体表达，门显示叶片、开启弧和真实宽度；Zone 面积由毫米多边形 Shoelace 公式计算，比例尺随 zoom 选择真实量级，并显示北向。
- 采用用户选定的悬浮布局：顶部建模工具、左侧楼层/Zone 与图层、右侧主题与属性、底部命令/证据。面板位置有界保存，窗口改变时按左右/中心和底部锚点重排，并为状态栏保留硬边界。
- 工程蓝图、建筑纸张、夜间实验室三套主题复用同一几何事实和命令历史；默认建筑纸张。SketchPad 与气流拓扑继续作为只读事实模式。
- 前端不读取 PRJ、工具路径或凭据；Studio 草稿固定为 `prj_round_trip=unsupported`。教学示例明确显示“不代表原始 PRJ 布局”，不把参考图建筑复制为用户项目事实。

## Browser 视觉与交互 QA

- 参考图与最终实现统一为 1488×1056 并合并到同一张 `F:\Codex_File\geometry-editor-integration\comparison-pass-9.png` 后审查；项目根目录 [design-qa.md](../../../../design-qa.md) 记录九轮可见问题与修复，最终 `Result: passed`。
- 保存工程蓝图、夜间实验室和建筑纸张证据；验证 1488×1056、1280×720、1024×720。1280 首轮发现并修复大窗口偏好造成的工具栏/主题碰撞与底部状态栏遮挡。
- 实际切换 Studio、SketchPad 和拓扑模式；实际绘制一条三命令墙体，单次撤销从几何 Revision 3 回到 0，单次重做恢复到 3，最后撤销并重载干净示例。
- 最终 fresh reload 后浏览器日志没有 warning/error。早期开发热更新因 hook 数量改变出现的 React Fast Refresh 错误在完整 reload 后消失，未作为最终状态通过证据。
- 该证据是 Browser 渲染与交互 QA，不冒充真实 Tauri GUI、Windows 125%/200% 系统缩放、screen reader 或用户人工验收；`manual_gui=not_run`。

## 自动验证

- 前端全量：36 个测试文件、293 项通过；生产构建通过。主入口 599.67 kB、Geometry Workbench 22.94 kB、Geometry Canvas 14.38 kB；既有 ECharts 550.62 kB 和主入口大 chunk 警告保持可见，未提高阈值。
- Python 全量：384 项通过；Ruff 通过。
- Rust 全量：153 项通过、1 项按设计忽略；`cargo fmt --check`、严格 Clippy 和 Cargo check 通过。
- Docs：40 项通过；Geometry Workbench Foundation 51 项、Geometry Editor Integration 30 项、R1-02 45 项、R1-03 66 项合同通过；任务日志合同 87 条记录通过。
- 本任务 Final Full 只运行一次，退出码 `0`，`QA-01 passed: 70 checks passed`，外层用时约 72.5 秒。日志：`F:\Codex_File\geometry-editor-integration\full-verification.log`；退出码：`full-verification-exit.txt`。
- `git diff --check` 退出码 0；仅有工作区既有 LF/CRLF 转换提示，没有 whitespace error。

## 明确边界

- Studio 建筑草稿仅存在于当前受控 React 会话，不写入 localStorage、PRJ 或用户文件。当前没有 PRJ 几何导入/导出、任意多边形/曲墙/楼梯或跨重启草稿恢复。
- 本轮未运行真实 Tauri GUI、Windows 系统缩放、官方 ContamX/SimRead、真实 Provider、安装包或干净机；未读取真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程。
- 未创建 worktree，未提交、推送、打标签、打包、签名或发布。HEAD 与 `origin/main` 均保持 `8c0836b00c9bde4cebcdd0f25871be94fa1f2961`，累积 Geometry Workbench Foundation 与 Editor Integration 修改保留在当前主线工作树。

## 总监收口修正

- Rust 几何拓扑校验新增全局比较预算，墙体、Zone 自交和区域对比较均在同一上限内关闭失败，避免恶意复杂几何触发无界 CPU/内存消耗。
- 图片像素披露改由 Rust/Tauri 原生 Yes/No 对话框在发送前授权；授权绑定项目、Revision、附件和 SHA-256，60 秒过期且单次消费，前端不再提交可伪造的 consent 布尔值。
- AI 几何操作拆分为独立批准入口，批准绑定来源请求、附件哈希、项目、Revision、geometry、基线哈希和精确操作指纹；无批准、过期、篡改和撤销后重放均拒绝。
- 首次启动不再因为 `first_run_complete=false` 强制跳入设置；顶部状态明确显示“草稿 · 未写入 PRJ”。
- 左侧导航新增全部几何对象的可搜索、50 项分页 DOM 路径，并与画布、语义 Zone/FlowPath 和属性检查器共用 selection。
- 开发质量夹具及示例平面图移出生产依赖图；正式构建不包含质量页面 chunk 或演示图片。

## 总监收口验证

- 聚焦验证：AI 操作批次、桌面 API、完整对象导航与中英文 locale 共 9 项测试通过；Vision to Geometry 合同 19 项通过；生产构建确认不存在 `GeometryQualityHarness` chunk 或 `ai-plan-source-demo` 资产。
- 第一次 Full 启动后，外层工具因错误的 1 秒超时丢失标准输出和退出码，但验证子进程继续自然结束；该次结果记录为 `indeterminate`，没有虚构通过。
- 第二次也是最终可判定 Full 退出码 `0`，用时约 84.7 秒，`QA-01 passed: 72 checks passed`；Rust 159 项通过、1 项按设计忽略，生产构建、Rust fmt、严格 Clippy、Cargo check、合同及文档门禁全部通过。
- 本轮未使用 Computer Use，也未执行正式 Browser/Tauri 截图矩阵、系统缩放、真实 Provider、真实工具、打包、签名、发布或用户验收。

## CSS 所有权整理

cleanup_status: completed
cleanup_started_at_utc: 2026-08-11T04:28:01Z
cleanup_ended_at_utc: 2026-08-11T04:30:00Z
cleanup_duration_seconds: 119
migration_marker: `/* Spatial Command Deck: canvas-first geometry workflow selected by the user. */`
project_css_lines_before: 3395
project_css_lines_after: 1132
geometry_css_lines: 2262
original_project_css_bytes: 72868
project_css_prefix_bytes: 23250
geometry_css_tail_bytes: 49617
backup_path: `F:\Codex_File\geometry-css-ownership-cleanup\project.css.before`
byte_comparison: passed

- 迁移严格按唯一固定标记的字节位置完成；备份与原始 `project.css` 完全一致，`geometry.css` 与备份中从该标记开始的尾部逐字节一致。
- 总监审查后移除了迁移边界遗留的一个文件末尾空行；该空行只用于分隔原文件中的下一节，不属于任何 CSS 规则。`geometry.css` 尾部逐字节一致证据保持不变，`project.css` 最终满足 Git whitespace 规则。
- `project.css` 仅保留标记之前内容；`geometry.css` 保留标记及其后的 Spatial Command Deck、Geometry Workbench、Geometry Canvas、AI Geometry Draft、响应式、reduced-motion、forced-colors 和末尾 legibility overrides。
- `src/styles/app.css` 已在 `project.css` 之后、`run.css` 之前导入 `geometry.css`。Geometry Workbench 和 Spatial Command Deck 合同读取 `geometry.css`；项目页其余 CSS 事实仍由 `project.css` 负责。

validation:
  - command: `node scripts/tests/test-geometry-editor-integration-contract.mjs .`
    exit_code: 0
    result: `33 assertions passed`
  - command: `node scripts/tests/test-spatial-command-deck-contract.mjs .`
    exit_code: 0
    result: `23 assertions passed`
  - command: `node scripts/tests/test-geometry-workbench-foundation-contract.mjs .`
    exit_code: 0
    result: `51 assertions passed`
  - command: `powershell -NoProfile -File scripts\tests\test-task-log-contract.ps1`
    exit_code: 0
    result: `89 records passed`
  - command: `pnpm build`
    exit_code: 0
    result: `production build passed; existing chunk-size warning retained`
  - command: `dist exclusion scan`
    exit_code: 0
    result: `GeometryQualityHarness=0; ai-plan-source-demo=0`
  - command: `git diff --check`
    exit_code: 0
    result: `passed after director removed the migration-boundary blank line at project.css EOF`

status_after_cleanup: implementation=complete; automated_verified=focused_passed; manual_gui=not_run; github_windows_ci=pending_push; real_provider=not_run; packaged=no; signed=not_run; released=no; user_validated=not_run; merged_to_main=no
git_diff_check_note: passed after the director removed one non-rule separator blank line left at the split boundary
not_executed: GUI、Computer Use、Full、提交、推送、打标签、打包、签名、发布、真实 Provider、真实凭据、真实 AppData 和用户工程读取。
