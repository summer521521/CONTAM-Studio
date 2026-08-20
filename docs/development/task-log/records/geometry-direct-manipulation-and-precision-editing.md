# Geometry Direct Manipulation and Precision Editing

```yaml
task_id: geometry-direct-manipulation-and-precision-editing
phase: Geometry Workbench
title: 建筑顶点直接操纵与精确编辑
status: completed
record_origin: live
started_at_utc: 2026-08-11T06:26:45Z
ended_at_utc: 2026-08-11T06:45:50Z
duration_seconds: 1145
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；总监选择补齐接近 ContamW 建筑绘图体验所缺少的共享角点直接操纵和检查器精确坐标编辑。
task_summary: 在既有 building_geometry.v1、move_vertex、Konva 画布和手势级历史之上，实现保持正交拓扑的拖拽预览、单批次提交、键盘与表单替代路径；不写原始 PRJ。
goals:
  - 为选中顶点、墙体和 Zone 显示可操作的共享顶点手柄
  - 以正交连通传播保持共享墙、Zone 边界和开口绑定一致
  - 拖动期间只预览，释放后经完整几何验证提交一个可撤销批次
  - 在悬浮检查器提供毫米坐标精确编辑和明确错误反馈
  - 提供方向键微调和 DOM 对象列表替代路径
allowed_scope:
  - TypeScript 几何纯函数、现有 Konva 画布、Geometry Workbench 检查器、双语文案和样式
  - 前端聚焦测试、描述性合同、Geometry Workbench 事实源和能力矩阵
forbidden_scope:
  - 直接修改原始 PRJ、绕过 geometry command/history/validation 或创建第二套选择状态
  - 推断曲墙或自由斜墙、自动合并拓扑、AI 自动应用和新增画布框架
  - Computer Use、真实凭据、真实 AppData、用户唯一工程、提交、推送、打标签、打包、签名或发布
validation:
  - 开发中运行正交传播、画布和检查器聚焦测试
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
- 领域层已有严格的 `move_vertex`、完整候选校验、批次原子提交和手势级撤销/重做，但画布只显示被选顶点，尚无拖拽或精确坐标入口。
- 单点自由移动会把相连正交墙拉成斜墙，因此本轮采用确定性的连通传播：X 只沿竖墙传播，Y 只沿横墙传播，再由现有完整验证决定能否提交。

## 进行中

- 正交顶点拖拽计划、局部画布预览、精确坐标编辑和键盘替代路径均已完成；任务进入自动门禁后收口。

## 实现结果

- 新增原子 `move_vertices` 领域操作：一次最多 128 个唯一既有顶点，全部目标先严格解析并确认存在，再一次写入候选模型，只对最终拓扑执行完整验证。旧 `move_vertex` 保持兼容。
- 新增正交连通传播规划器：X 位移只沿竖墙连通分量传播，Y 位移只沿横墙连通分量传播；矩形共享角点可以同步调整相邻三点，所有墙体始终保持正交。
- 墙体、Zone 或顶点选择会显示真实共享角点手柄。拖动期间仅在 lazy Konva 组件中生成局部 `displayLevel`，墙、Zone、门窗、FlowPath 和辅助线共同预览；释放后才提交一个结构化操作。
- 角点邻接图按稳定楼层快照缓存，指针移动最多遍历 129 个候选后关闭失败；Zone 同时显示的手柄限制为 256 个，完整顶点仍可从分页 DOM 对象列表选择。
- 悬浮属性检查器为顶点提供精确整数毫米 X/Y 表单；画布获得焦点后方向键按 250 mm、Shift+方向键按 1 m 微调。两条入口共用同一规划器、命令、校验、历史和项目持久化链。
- 顶点碰撞、非法坐标、过大连通范围、陈旧缓存、非正交基线以及移动后开口越界或 Zone 无效均保持原草稿和历史不变，并提供中英文错误状态。
- 三主题新增与选择色匹配的文字对比令牌；选择、平移和绘图工具具有对应指针语义。未新增运行时依赖，继续复用现有 Konva lazy boundary。

## 自动验证

- 正交传播、原子领域命令、历史、失败回滚和画布数学聚焦测试通过；最终前端全量为 44 个测试文件、324 项通过。
- 生产构建通过：主入口 629.43 kB、Geometry Workbench 45.41 kB、Geometry Canvas 17.15 kB、共享直接操纵 chunk 2.95 kB；既有 ECharts 550.62 kB 与主入口大 chunk 警告保持可见，未提高阈值。
- 新增 Geometry Direct Manipulation 合同 32 项通过；既有 Geometry Workbench Foundation、Geometry Editor Integration、Spatial Command Deck、Project Geometry Document 和 SketchPad 安全应用合同继续通过。
- Docs 聚焦为 46 项通过；任务日志合同 93 条记录通过；`git diff --check` 通过，仅有既有 LF/CRLF 转换提示。
- 本任务 Final Full 只运行一次，退出码 `0`，用时 82.494 秒，汇总 `QA-01 passed: 76 checks passed`。Python 391 项通过；Rust 165 项通过、1 项按设计忽略；Ruff、Rust fmt、严格 Clippy、Cargo check、Windows CI 合同与 12 项变异测试均通过。
- 完整日志：`F:\Codex_File\geometry-direct-manipulation-and-precision-editing\full-verification.log`；退出码和用时保存在同目录文本文件中。
- Fallow 本地 CLI 未安装；遵守项目依赖规则未临时或全局安装，改用 TypeScript 构建、依赖搜索、聚焦测试和统一 Full 完成静态收口。

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
