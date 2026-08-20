# Zone Boundaries and Room Partitioning

```yaml
task_id: zone-boundaries-and-room-partitioning
phase: Geometry Workbench
title: Zone 封闭轮廓、房间拆分与受控合并
status: completed
record_origin: live
started_at_utc: 2026-08-11T07:55:07Z
ended_at_utc: 2026-08-11T08:20:01Z
duration_seconds: 1495
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；总监选择补齐真实建筑构造工作流中的封闭房间识别、语义 Zone 拆分和显式合并。
task_summary: 在既有显式墙体拓扑、语义 Zone 绑定、确定性验证和手势级历史之上，使 Zone 轮廓来自真实封闭墙环，并提供不猜测语义身份的房间拆分与受保护合并；不写原始 PRJ。
goals:
  - 点击封闭房间内部即可从真实墙图提取最小封闭环并绑定当前未使用的语义 Zone
  - 选中已有 Zone、明确选择未绑定目标 Zone 并点击分隔墙一侧后，可把恰好二分的几何拆成两个合法房间
  - 拆分必须要求另一个未绑定语义 Zone，原 Zone 与新 Zone 身份选择明确且可撤销
  - 仅在两个 Zone 共享连续边界且边界无门窗/FlowPath 时允许受控合并，并明确释放被移除的语义 Zone
  - 所有候选先以纯函数规划和本地预览表达，再经封闭命令参数及完整几何验证原子提交
allowed_scope:
  - TypeScript Zone 领域命令、平面图纯函数、现有 Konva 画布与 Geometry Workbench 检查器
  - 命令 schema、前端测试、描述性合同、Geometry Workbench 事实源、架构文档、双语文案和能力矩阵
forbidden_scope:
  - 自动创建或删除 CONTAM 语义 Zone、直接修改原始 PRJ、隐式选择保留身份或静默丢弃 FlowPath
  - 非封闭轮廓、浮点容差猜测、曲线/斜墙、孔洞 Zone、多部件 Zone 或自动几何修复
  - 绕过 reducer/controller/history/validation、第二套业务选择状态、新画布框架或 AI 自动应用
  - Computer Use、真实凭据、真实 AppData、用户唯一工程、提交、推送、打包或发布
validation:
  - 开发中运行平面环提取、拆分/合并依赖、命令回滚、画布与检查器聚焦测试
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

- 当前 Zone 工具只绘制一个新矩形并同时创建墙体，不能利用已经完成的真实墙网，也不能表达 L 形等正交房间。
- `create_zone_region` 已经能绑定一个未使用语义 Zone，但缺少从封闭墙环生成轮廓、替换现有轮廓和显式释放绑定的命令。
- 语义 Zone 来自当前 PRJ 快照；本轮不得自动创造语义对象。拆分必须由用户明确选择第二个未绑定 Zone，合并必须明确保留哪个 Zone，且不得静默破坏门窗相邻 Zone 或 FlowPath。

## 实现结果

### 封闭墙面事实

- 新增 `geometry-zone-topology.ts`，为稳定楼层快照建立顶点、无向墙边和有向半边索引。环面积、叉积和点在多边形判断使用安全整数与 `BigInt`，不使用浮点容差。
- 只保留由显式墙段形成的有界逆时针最小面；外部面、边界点击、嵌套歧义、非正交基线、重复墙边、陈旧上下文和复杂度超限均关闭失败。
- 单个面最多 4096 条边，楼层最多进入 200000 条有向半边预算；ID、数组和楼层快照均有稳定边界。
- Zone 工具改为“先画封闭墙环，再点击内部绑定语义 Zone”，删除了同时猜测墙和房间的拖拽矩形路径。L 形等简单正交闭环可直接表达；孔洞、多部件和非正交轮廓仍不支持。

### 拆分与合并命令

- `partition_zone_region` 只接受封闭的 `level_id/source_region_id/source_outer_vertex_ids/new_zone_region` 参数。规划器要求原 Zone 内恰好出现两个有界面、二者精确面积和等于原外环，并用用户点击确定新 Zone 一侧。
- 拆分必须由用户从完整语义清单中选择另一个未绑定 Zone；不会创建 CONTAM 语义对象，也不会隐式决定身份。
- `merge_zone_regions` 明确区分保留与释放的 Zone，要求两区共享一段连续墙边，命令层重新核对共享墙 ID 与合并后外环，且只删除这些分隔墙。
- 创建、拆分和合并都在候选上重算门窗相邻 Zone。共享墙有门窗、被释放 Zone 是 FlowPath 端点，或任何锚定开口的 Zone 邻接会改变时，预览或命令整体拒绝，不迁移、不删除、不伪造流路。
- 两个新操作继续通过现有 `commitOperations`、完整几何验证和不可变 history；失败返回原历史，成功各形成一个可撤销手势。

### 画布与检查器

- Konva 只维护局部 face preview；稳定父级继续持有唯一几何、选择和历史。点击提交的只能是纯规划器生成的封闭命令。
- 全局工具岛不增加低频按钮。房间拆分与合并只在选中 Zone 后出现在上下文检查器，并明确提示保留身份、目标身份和阻断原因。
- 左上导航增加包含全部语义 Zone 的紧凑选择器；常用前五项仍保留快捷按钮。拆分检查器另只列未绑定 Zone，避免目标被截断或重复绑定。
- Escape 会清理局部预览；中英文补齐目标缺失、来源缺失、封闭面、二分、邻接、门窗和 FlowPath 冲突语义。

## 安全边界与已知限制

- 本轮只编辑 `studio_metric_draft`，不修改原始 PRJ、SketchPad 图标、Tauri 权限或语义 Zone/FlowPath 事实。
- AI 图片草案 schema 没有获得 `partition_zone_region` 或 `merge_zone_regions`；这两个高语义操作只能由用户在当前画布上下文中显式触发。
- 只支持已显式分割交点的简单正交墙图、无孔单外环和明确二分。曲线、斜墙、容差吸附、孔洞、多部件、三个以上面的一次拆分、自动修复和 FlowPath 自动迁移均关闭失败。
- 正式 GUI 截图矩阵留待 Geometry Workbench 视觉集成完成后统一执行；本任务不把自动检查写成人工验收。

## 收口前验证

- 前端全量：47 个测试文件、356 项通过。
- Zone 拓扑与领域聚焦：32 项通过。
- TypeScript 生产构建：通过；保留既有 ECharts 550.62 kB 和主入口 643.04 kB 大 chunk 警告，未提高阈值。
- Geometry 合同：Foundation 51、Editor 33、Spatial Command Deck 23、Direct Manipulation 32、Wall/Opening 34、Wall Topology 25、Zone Boundaries 45 项断言通过。
- 任务日志合同：96 条记录通过；能力矩阵 JSON 和 `git diff --check` 通过，仅有换行转换提示。
- 本轮没有新增运行时依赖。

## 最终 Full

本任务只运行一次：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -Mode Full
```

- 退出码：0。
- 汇总：`QA-01 passed: 79 checks passed.`
- Python：391 项通过；Ruff 通过。
- 前端：47 个测试文件、356 项通过；TypeScript 与生产构建通过。
- Rust：165 项通过、1 项按设计忽略；fmt、严格 Clippy 和 Cargo check 通过。
- Tauri 命令合同：68 个命令一致；Windows CI 合同与 12 项变异检查通过。
- Zone Boundaries and Room Partitioning 合同：45 项断言通过。
- 日志：`F:\Codex_File\zone-boundaries-and-room-partitioning\full-verification.log`。

## 最终状态

```text
implementation=complete
automated_verified=passed
github_windows_ci=pending_push
manual_gui=not_run
real_tools=not_run
real_provider=not_run
packaged=no
signed=not_run
released=no
user_validated=not_run
merged_to_main=no
```

未使用 Computer Use，未读取真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程；未提交、推送、打标签、打包、签名或发布。
