# Topology-aware Wall Intersections and Segments

```yaml
task_id: topology-aware-wall-intersections-and-segments
phase: Geometry Workbench
title: 墙体相交、显式分割与延伸修剪
status: completed
record_origin: live
started_at_utc: 2026-08-11T07:30:59Z
ended_at_utc: 2026-08-11T07:47:06Z
duration_seconds: 967
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；总监选择补齐接近 ContamW 建筑绘图体验所需的拓扑感知墙体相交、显式分割和墙段延伸修剪。
task_summary: 在既有正交墙、原子命令、完整几何校验和手势级历史之上，实现可预览的 T/Cross 交点、依赖安全的墙体分割、以画线完成延伸以及受保护的墙段修剪；不写原始 PRJ。
goals:
  - 绘制正交墙时把 T 形和十字交点显式物化为共享顶点与独立墙段
  - 分割既有墙时安全迁移门窗偏移并保持 opening 与 FlowPath 身份
  - 将分割点同步插入真实使用该墙边的 Zone 外环
  - 提供独立分割工具、交点预览、墙端延伸和键盘修剪替代路径
  - 拒绝共线重叠、穿过门窗、超大交点批次和会破坏 Zone 边界的修剪
allowed_scope:
  - TypeScript 几何命令与拓扑纯函数、现有 Konva 画布、Geometry Workbench 工具栏与检查器、双语文案和样式
  - 前端测试、描述性合同、Geometry Workbench 事实源、架构文档和能力矩阵
forbidden_scope:
  - 直接修改原始 PRJ、绕过 geometry command/history/validation 或创建第二套选择状态
  - 自由斜墙、曲墙、容差猜测、静默合并重叠墙、自动删除门窗/Zone/FlowPath
  - AI 自动应用、新增画布框架、Computer Use、真实凭据、真实 AppData、用户唯一工程
  - 提交、推送、打标签、打包、签名或发布
validation:
  - 开发中运行分割依赖、交点规划、历史原子性、画布和检查器聚焦测试
  - 收口时运行前端全量、生产构建、相关合同、任务日志和最终 Full
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

- `main`、`HEAD` 与 `origin/main` 均为 `8c0836b00c9bde4cebcdd0f25871be94fa1f2961`；Geometry Workbench 累积未提交修改继续保留。
- 现有画墙只创建一条端到端墙，交叉时由验证器以 `geometry_wall_intersection_requires_split` 拒绝；领域已有 `split_wall`，但会阻止所有带门窗墙且不更新 Zone 环。
- 本轮只接受整数毫米、严格正交和精确相交，不引入浮点容差或隐式几何修复。墙段修剪沿用 `delete_wall`，但必须保护门窗和真实 Zone 边界。

## 进行中

- 依赖安全的墙体分割、拓扑感知绘制、显式分割入口、延伸与受保护修剪均已完成自动收口。

## 实现结果

- `split_wall` 不再笼统拒绝带门窗墙体。分割点落入开口内部时整个命令拒绝；否则保留原墙 ID 作为第一子段，后段门窗只改变宿主墙和有向偏移，`opening.id`、开口属性及 FlowPath anchor 身份保持不变。
- 真实以原墙端点组成边的 Zone 外环会插入同一分割顶点。`delete_wall` 新增 Zone 边界保护，带门窗或承担显式 Zone 边界的墙段均不能被修剪，也不会自动删除任何依赖对象。
- 新增稳定楼层快照拓扑索引：按方向和轴坐标排序墙段，使用二分范围查询寻找候选相交墙；画墙时精确物化 T 形/十字交点，并按 `split_wall → add_vertex → add_wall` 顺序形成有界批次。
- 新墙严格使用整数毫米、250 mm 捕捉和正交主轴。共线重叠、陈旧上下文、穿过门窗、无效 ID、超过 64 个交点或 256 个操作均关闭失败，不引入浮点容差、隐式合并或自动修复。
- Spatial Command Deck 新增“分割墙体”工具。画墙预览显示最终独立墙段和共享交点；从既有端点向外画线完成延伸。选中显式墙段后可通过检查器或 Delete/Backspace 修剪，失败显示用户语义而不是内部诊断码。
- 多个分割、顶点和墙段由现有 controller 一次发布，任何中间命令失败都返回原始历史；成功手势记录操作数量，撤销/重做时仍作为一个用户动作处理。未新增画布框架、业务 reducer、持久化路径或 AI 自动应用能力。

## 自动验证

- 拓扑规划、领域分割、Zone/开口依赖、画布数学、诊断映射和历史原子性聚焦测试为 44 项通过；新增真实交点批次测试证明两个宿主墙分割、三个新墙段、Zone 环更新可整体提交并一次撤销/重做。
- 前端全量为 46 个测试文件、344 项通过。生产构建通过：Geometry Canvas 29.45 kB、Geometry Workbench 48.85 kB、React Konva 306.43 kB；既有 ECharts 550.62 kB 和主入口 635.22 kB 警告保持可见，未提高阈值。
- 新增 Topology-aware Wall Intersections 合同 25 项通过；任务日志合同 95 条记录通过；`git diff --check` 退出码 0，仅有既有 LF/CRLF 转换提示。
- Final Full 本轮只启动一次，退出码 0，用时 100.7 秒，汇总 `QA-01 passed: 78 checks passed`。Python 391 项、前端 344 项、Rust 165 项通过且 1 项按设计忽略；Ruff、生产构建、Rust fmt、严格 Clippy、Cargo check、Windows CI 合同和 12 项变异测试均通过。

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
