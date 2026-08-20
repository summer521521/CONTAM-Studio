# Wall and Opening Direct Manipulation

```yaml
task_id: wall-and-opening-direct-manipulation
phase: Geometry Workbench
title: 墙段、门窗直接操纵与尺寸约束
status: completed
record_origin: live
started_at_utc: 2026-08-11T07:00:05Z
ended_at_utc: 2026-08-11T07:18:57Z
duration_seconds: 1132
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；总监选择补齐墙段整体平移、门窗沿宿主墙滑动和检查器精确尺寸编辑。
task_summary: 在既有正交顶点传播、原子几何命令、Konva 局部预览和手势级历史之上，新增墙段与门窗的直接操纵；所有提交继续经过完整候选验证且不写原始 PRJ。
goals:
  - 选中墙段可沿法向拖动并保持相连正交拓扑
  - 门窗可沿原宿主墙滑动，且保持稳定对象与 FlowPath 身份
  - 检查器提供墙轴坐标、门窗偏移和宽度的整数毫米编辑
  - 拖动期间只生成局部预览，释放后每个手势只提交一个原子命令
  - 提供键盘微调和明确的越界、重叠、碰撞反馈
allowed_scope:
  - TypeScript 几何命令与纯函数、现有 Konva 画布、Geometry Workbench 检查器、双语文案和样式
  - 前端聚焦测试、描述性合同、Geometry Workbench 事实源、架构文档和能力矩阵
forbidden_scope:
  - 直接修改原始 PRJ、绕过 geometry command/history/validation、创建第二套选择或持久化状态
  - 将门窗重绑到其他墙、改变类型/开启方向/相邻 Zone/FlowPath、自由斜墙或自动拓扑合并
  - AI 自动应用、新增画布框架、Computer Use、真实凭据、真实 AppData、用户唯一工程
  - 提交、推送、打标签、打包、签名或发布
validation:
  - 开发中运行墙段传播、门窗约束、画布和检查器聚焦测试
  - 收口时运行前端全量、生产构建、相关合同、任务日志和一次最终 Full
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed。
  - github_windows_ci=pending_push；manual_gui=not_run；real_tools=not_run；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
```

## 基线判断

- `main`、`HEAD` 与 `origin/main` 均为 `8c0836b00c9bde4cebcdd0f25871be94fa1f2961`；Geometry Workbench 既有累积未提交修改保持原样。
- 既有 `move_vertices` 已能原子移动正交连通顶点，但墙体线条本身和门窗尚不能直接拖动，检查器也只能精确编辑单个顶点坐标。
- 门窗必须保持同一 `opening.id`、`wall_id` 和 FlowPath anchor；因此新增命令只允许更新 `offset` 与 `width`，完整模型验证继续负责边界和同墙重叠约束。

## 进行中

- 墙段法向平移、门窗沿墙滑动、毫米级属性编辑和共享失败关闭路径均已实现并完成自动收口。

## 实现结果

- 新增封闭 `update_opening` 操作，只接受 `level_id/opening_id/offset/width`。既有门窗的 ID、宿主墙、类型、开启方向、相邻 Zone 和 FlowPath anchor 原样保留；越界或同墙重叠由完整候选校验拒绝。
- 墙体线条可直接沿法向拖动，仍复用既有正交连通图与一个 `move_vertices` 原子操作；横墙只改变 Y，竖墙只改变 X，相连同轴墙段和交接点同步预览。
- 门窗可沿原宿主墙拖动，指针位置按有向墙轴投影并以 50 mm 捕捉。拖动期间只替换 lazy Konva 的局部 `displayLevel`，释放后才提交一个 `update_opening` 历史项。
- 属性检查器为墙段提供精确轴坐标，为门窗提供精确起点偏移与宽度；表单使用 1 mm 精度。键盘入口与拖动共用规划器：墙段按 250 mm/Shift+1 m 法向微调，门窗按 50 mm/Shift+250 mm 沿墙微调。
- 门窗与同墙对象索引按稳定楼层快照缓存；陈旧快照、非法数值、墙体无效、越界、重叠、顶点碰撞和过大正交传播范围均关闭失败，草稿、历史和持久化状态保持不变。
- AI 读图草案仍只允许新增顶点、墙、Zone 和门窗；`update_opening` 没有加入 Luna 输出 Schema 或前端 AI 草案解析器。未新增依赖，也未创建第二套画布、选择或领域状态。

## 自动验证

- 领域命令、墙段/门窗规划器、历史回滚、画布数学和既有直接操纵聚焦测试为 43 项通过；前端全量为 45 个测试文件、333 项通过。
- 生产构建通过：主入口 631.87 kB、Geometry Workbench 48.43 kB、Geometry Canvas 21.20 kB、共享 geometry interaction chunk 6.59 kB；既有 ECharts 550.62 kB 和主入口警告保持可见，未提高阈值。
- 新增 Wall and Opening Direct Manipulation 合同 34 项通过；Docs 聚焦 47 项通过；任务日志合同 94 条记录通过；`git diff --check` 通过，仅有既有 LF/CRLF 转换提示。
- Full 共启动两次。第一次外层捕获命令在 5.058 秒超时，验证子进程继续自然运行至 `2026-08-11T07:15:05Z`，但最终退出码与汇总未被保留，因此该次证据无效且没有冒充通过；部分日志保留在 `F:\Codex_File\wall-and-opening-direct-manipulation\full-verification.log`。
- 修正调用方式后的证据重跑退出码 `0`，用时 100.8 秒，汇总 `QA-01 passed: 77 checks passed`。Python 391 项、前端 333 项、Rust 165 项通过且 1 项按设计忽略；Ruff、生产构建、Rust fmt、严格 Clippy、Cargo check、Windows CI 合同和 12 项变异测试均通过。
- 权威摘要：`F:\Codex_File\wall-and-opening-direct-manipulation\final-full-summary.txt`。

## 最终状态

| 维度 | 状态 |
| --- | --- |
| implementation | complete |
| automated_verified | passed |
| github_windows_ci | pending_push |
| manual_gui | not_run |
| real_tools | not_run |
| real_provider | not_run |
| packaged | no |
| signed | not_run |
| released | no |
| user_validated | not_run |
| merged_to_main | no |

未使用 Computer Use，未读取真实凭据、真实 AppData、真实用户工程或 Provider 数据；未直接修改原始 PRJ，未提交、推送、打标签、打包、签名或发布。
