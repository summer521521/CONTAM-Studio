# Wall Airflow Boundaries and Outdoor Context

```yaml
task_id: wall-airflow-boundaries-and-outdoor-context
phase: Geometry Workbench
title: 墙体开口与室内/室外气流边界
status: completed
record_origin: live
started_at_utc: 2026-08-13T05:41:43Z
ended_at_utc: 2026-08-13T06:19:52Z
duration_seconds: 2289
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；总监依据当前墙上 FlowPath 绑定缺少语义端点核验的事实选择本目标。
task_summary: 让墙体门窗上的 FlowPath 只能与几何邻接和 CONTAM 语义端点完全一致地绑定，明确区分 Zone-Zone 室内边界与 Zone-ambient 外边界，并对既有绑定给出可审计状态。
goals:
  - 两侧 Zone 的墙体开口只能绑定端点恰好对应这两个 Zone 的既有语义 FlowPath
  - 单侧 Zone 只有在宿主墙明确为 exterior 时才能绑定 Zone-ambient FlowPath
  - 保留语义 FlowPath 的 from/to 方向，不从屏幕方向、墙法线或用户选择顺序猜测室外侧
  - 新绑定、既有绑定审计、解绑、画布标识和检查器反馈使用同一领域事实
  - 重复 Zone 编号、未知端点、失效身份、已占用路径和不完整几何均关闭失败
allowed_scope:
  - TypeScript 墙体气流边界规划器、现有 link_flow_path 命令和三端 building_geometry.v1 验证
  - 现有 Geometry Workbench、Konva 画布、对象导航、检查器、双语文案和 CSS
  - 聚焦测试、描述性合同、架构文档、当前事实源和能力矩阵
forbidden_scope:
  - 新建语义 FlowPath、修改原始 PRJ、重写 CONTAM 求解器或引入第二套画布/状态历史
  - 从屏幕方向猜测室外侧、自动生成风压系数/天气/地形或把单侧 interior/unknown 墙当作室外边界
  - AI 自动绑定、真实用户工程、真实凭据、Computer Use、提交、推送、打包或发布
validation:
  - 开发中运行墙体边界规划、命令篡改、三端验证、交互和既有 Geometry 聚焦测试
  - 收口时运行前端/Python/Rust聚焦与全量、生产构建、任务日志、描述性合同和一次最终 Full
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

## 官方语义判断

- NIST CONTAM 3.4 指南将墙上 Airflow Path 定义为连接墙两侧的两个相邻 Zone；外壳路径则参与建筑与 outdoors 之间的 infiltration/exfiltration。
- 因此几何开口不是任意 FlowPath 的挂载点：绑定必须同时证明开口邻接、宿主墙边界类型和语义 FlowPath 的 from/to 端点一致。
- 本轮只建立可验证的边界映射，不推断风向、压差、墙法线、室外方位或新的求解参数。

## 实施记录

- 新增 `geometry-wall-airflow.ts` 纯领域层。它先把开口分类为“双侧 Zone + interior 墙”或“单侧 Zone + exterior 墙”，再建立唯一 CONTAM number → 语义 Zone ID 映射，并只返回端点完全一致、身份唯一且全局未占用的 FlowPath。`from/to` 顺序、Zone—ambient 方向和既有语义 ID 原样进入候选，不使用屏幕方向或墙法线猜测。
- `planWallFlowPathLink` 再次核对活动 Level、opening、墙体边界、Zone 集合、一个 opening 一个锚点、墙/竖向 FlowPath 全局唯一、对象上限和全局 ID 冲突，然后才生成原有封闭 `link_flow_path` 操作。Canvas 不再直接拼装 anchor，只把 opening ID 交还稳定父级。
- `auditWallFlowPathAnchor` 将保存过的锚点与当前语义快照重新比较，区分 `verified`、`invalid` 和 `unavailable`；语义对象消失、重复或方向改变不会继续显示为已核验。
- 属性检查器新增门窗气流边界卡片，显示室内/外壳分类、真实 Zone/室外端点、精确匹配选项、绑定状态和显式解绑；高级气流页不再显示与当前 opening 无关的全局列表。画布用 `↔` 和 `EXT` 表达边界类型，不以单向箭头冒充物理风向。
- TypeScript、Python 和 Rust 几何契约独立要求端点 Zone 集合与 opening 邻接完全相等、墙体类型一致且一个 opening 最多一个锚点。旧的子集判断不再允许少端点或额外端点通过。
- Rust 在成功读取语义项目且再次确认活动 project session、Revision、source hash 与 identity 后，只在内存缓存可信语义快照；项目替换立即清空。含墙上或竖向 FlowPath 锚点的几何保存必须由 Rust 再次解析真实语义端点，没有当前证据、路径缺失、编号重复或端点不一致时拒绝落盘。缓存不写入几何文档，也不返回给额外前端入口。
- 教学几何不再随意绑定语义列表中的第一条 FlowPath；只有现有语义端点与教学门洞完全匹配时才创建锚点。普通 AI 和 Codex 读图 Schema 仍不能生成 `link_flow_path`。

## 验证结果

- 墙体气流纯函数与组件聚焦测试：10 项通过；含方向、重复身份、篡改、保存审计和显式绑定/解绑。
- Geometry 相关现有 11 组描述性合同全部通过；本任务合同 49 项断言通过；任务日志合同 99 条记录通过。
- 前端全量：51 个测试文件、383 项通过；生产构建通过。保留既有 ECharts 550.62 kB 与主入口约 670.47 kB 大 chunk 警告，未提高阈值。
- Python 聚焦：14 项通过；全量 395 项通过；Ruff 通过。
- Rust 聚焦语义/持久化测试通过；全量 171 项通过、1 项按设计忽略；fmt、严格 Clippy 与 Cargo check 通过。
- 最终 Full 本任务只运行一次，退出码 0，用时 62.9 秒，汇总 `QA-01 passed: 82 checks passed`。
- `git diff --check` 退出码 0，只有 LF/CRLF 转换提示，没有空白错误。

## 未执行边界

- 尚未执行 GUI、真实工具、真实 Provider、打包、签名、提交、推送或发布。
