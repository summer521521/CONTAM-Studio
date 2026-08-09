# R1-02 Workbench & Task Journeys

```yaml
task_id: r1-02-workbench-task-journeys
phase: Renewal R1
title: Workbench & Task Journeys——用户工作台与核心任务路径重构
status: completed
record_origin: live
started_at_utc: 2026-08-01T09:58:36Z
ended_at_utc: 2026-08-01T11:48:25Z
duration_seconds: 6589
base_commit: 4aa64c507ecf730b79c77aec31ae8474717c37b5
branch: main
task_source: 用户提供的 R1-02 Workbench & Task Journeys 任务书
task_summary: 在保留 R1-01 未提交基线和既有领域安全边界的前提下，重构工作台职责、页面分发、五条核心任务路径、样式责任层与前端加载边界。
goals:
  - 将 App 收敛为顶层运行时组合，并建立职责清晰的 runtime、journey、view-model 和 layout 边界
  - 让 DestinationContent 成为 project、run、results、research、settings 的真实页面分发边界
  - 将 compatibility 工作台样式迁移到 foundation、shell、components 和 feature 责任层
  - 完成无项目、项目、运行、结果、研究和设置任务路径的用户状态与下一步操作
  - 通过聚焦测试、生产构建和一次最终 Full 验证记录真实自动化证据
allowed_scope:
  - React/TypeScript 工作台结构、状态映射、页面、基础组件、i18n、样式和前端测试
  - 工作台布局状态迁移、语义 lazy boundary、R1 文档、任务日志和能力状态矩阵
  - F:\\Codex_File\\r1-02-workbench-task-journeys 下的只读基线和临时验证证据
forbidden_scope:
  - 真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 和用户唯一工程
  - R1-03 二维画布、伪造几何/结果/最近项目、新增大型 UI 框架和领域写入捷径
  - Computer Use、正式截图矩阵、提交、推送、打标签、打包、签名和发布
validation:
  - 开始基准：main、HEAD 与 origin/main 均为 4aa64c507ecf730b79c77aec31ae8474717c37b5。
  - R1-01 的 21 个已跟踪修改及未跟踪新增文件已记录到 F:\\Codex_File\\r1-02-workbench-task-journeys，作为本轮不可回退基线。
  - pnpm test：退出码 0；23 个测试文件、193 项前端测试通过。
  - pnpm build：退出码 0；主入口 493.29 kB，Results 12.32 kB、Settings 13.62 kB、Research 38.03 kB、Assistant 40.57 kB；ECharts Canvas 第三方块 550.62 kB，构建警告保持可见。
  - cargo check --manifest-path src-tauri/Cargo.toml：退出码 0；Rust 未因本轮修改而改变。
  - R1-01 foundation contract：41 项断言通过；R1-02 workbench contract：45 项断言通过。
  - comprehensive-validation-v1 合同：3 个源项目、3-operation Patch、6 个附件与完整校验和通过。
  - 最终 Full：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\verify.ps1 -Mode Full；唯一一次运行，退出码 0，64 项检查通过，用时 73.523 秒。
  - Full 内部数量：Python 345 项通过；前端 193 项通过；Rust 129 项通过、1 项按设计忽略；日志位于 F:\\Codex_File\\r1-02-workbench-task-journeys\\full-verification.log。
  - git diff --check：退出码 0；仅有 Git 的 LF/CRLF 提示，无空白错误。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed；github_windows_ci=pending_push；manual_gui=not_run；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run。
  - R1-01 已获总监审查通过，本轮只在其现有未提交工作树上增量实施，不丢弃、不回退、不覆盖。
  - App.tsx 从 1294 行收敛为 11 行组合根，WorkbenchRuntime 为 560 行；compatibility/workbench.css 从 3685 行迁移至 4 行说明性边界。
  - 未执行 Computer Use、正式截图矩阵、真实 Provider、打包、签名、发布、提交或推送；GUI 与用户验收留待 R1-05。
```
