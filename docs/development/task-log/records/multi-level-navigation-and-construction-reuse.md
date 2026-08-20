# Multi-level Navigation and Construction Reuse

```yaml
task_id: multi-level-navigation-and-construction-reuse
phase: Geometry Workbench
title: 多楼层导航、对齐底图与构造复用
status: completed
record_origin: live
started_at_utc: 2026-08-13T04:35:15Z
ended_at_utc: 2026-08-13T04:54:14Z
duration_seconds: 1139
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；总监按 Geometry Workbench 的真实建筑构造顺序选择多楼层导航、对齐参考和安全复用。
task_summary: 在现有 CONTAM 语义 Level 已预建的前提下，使用户能可靠切换楼层、将其他楼层作为非交互底图，并把纯墙体/门窗构造显式复制到一个既有空楼层；不得复制 Zone、FlowPath 或创造语义 Level。
goals:
  - 楼层选择必须列出当前草稿全部既有 Level，切换时清理旧楼层选择与瞬态预览
  - 可选择任一其他楼层作为对齐底图，并以不可交互、明显弱化的方式显示
  - 可将来源楼层的顶点、墙和门窗原子复制到一个既有空目标楼层，保持毫米坐标和构造属性
  - 复制使用完整显式 ID 映射、严格对象上限和全局 ID 冲突检查，且作为一个可撤销手势
  - 复制后的门窗不携带相邻 Zone；Zone、FlowPath、语义绑定和 Level 元数据均不复制
allowed_scope:
  - TypeScript 几何命令、纯规划器、现有 controller/history、Konva 底图、Geometry Workbench 楼层控件
  - 命令 schema、前端测试、描述性合同、事实源、架构文档、双语文案和能力矩阵
forbidden_scope:
  - 新增/删除 CONTAM 语义 Level、复制 Zone/FlowPath、竖向风道或楼板开口推断、修改原始 PRJ
  - 复制到非空目标、隐式覆盖、近似对齐、坐标变换、跨层语义自动匹配或第二套历史
  - 新画布框架、Computer Use、真实凭据、真实 AppData、用户唯一工程、提交、推送、打包或发布
validation:
  - 开发中运行构造复制规划、命令篡改/回滚、跨楼层选择清理、画布底图和现有 Geometry 合同
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

- `geometryShell` 已按当前语义快照创建最多 16 个 Studio Level；因此本轮只管理这些真实存在的 Level，不新增或删除语义楼层。
- 现有左上“楼层按钮”实际只触发 fit，并不能选择其他楼层；跨层对齐也没有可信参考层。
- `building_geometry.v1` 的对象 ID 全局唯一，Zone 和 FlowPath 绑定也跨楼层唯一。构造复制必须产生封闭 ID 映射，并明确排除所有语义绑定。
- 现有墙上 opening 只能表示平面墙体开口，不能表达楼板开口或竖向 FlowPath；本轮不得将其冒充跨层连接。

## 实现结果

- 楼层导航改为列出草稿中全部既有 Level 的原生选择器。切换时清除旧楼层 selection、Zone/FlowPath 选择、瞬态工具和诊断；多楼层语义 Zone 列表只显示与当前 `level_number` 精确匹配的对象。
- 用户可从其他既有 Level 选择一个对齐底图。Konva 将其墙体和门窗绘制在 `listening=false` 的弱化虚线图层中，视口 fit 同时包含当前层和参考层；画布显示明确的“不可交互”状态标记。
- 新增纯规划器 `geometry-level-construction.ts` 与封闭命令 `copy_level_construction`。来源和目标必须是两个不同的既有 Level，目标必须完全没有顶点、墙、门窗、Zone 或 FlowPath；单次最多 10000 顶点、10000 墙体和 5000 门窗。
- 每个复制对象使用完整显式 ID 映射并与全项目 Level、顶点、墙、门窗、Zone 和 FlowPath ID 集合核对。领域命令再次验证映射完整性、全局唯一性、对象上限和空目标，不信任 UI 或规划器输入。
- 复制保持整数毫米坐标、墙体类型与厚度、门窗类型、尺寸和开启方向；墙体 `source_icon_id` 清空，门窗 `adjacent_zone_ids` 清空。Zone、FlowPath、Level 元数据和语义对象不复制，也不把墙上门窗解释成楼板开口或竖向流路。
- 整个构造复制作为一个 controller/history 命令提交，可一次撤销和重做。普通 AI 草案解析器与 Codex 读图 Schema 均不允许生成该操作。

## 验证结果

- TypeScript：`pnpm exec tsc --noEmit` 通过。
- 前端聚焦：构造规划、命令篡改、单手势 undo/redo、参考层视口与错误映射共 49 项通过。
- 前端全量：48 个测试文件、364 项通过。
- 生产构建：通过；保留既有 ECharts/主入口大 chunk 警告，没有提高阈值。
- 描述性合同：Multi-level Navigation and Construction Reuse 41 项、Zone Boundaries and Room Partitioning 45 项以及全部现有 Geometry 合同通过。
- 任务日志合同：Full 时 97 条记录通过；能力矩阵 JSON 和 `git diff --check` 通过，只有 LF/CRLF 转换提示。
- 最终 Full 只运行 1 次，退出码 0，`QA-01 passed: 80 checks passed`，用时 117.6 秒；其中 Python 391 项、前端 364 项、Rust 165 项通过且 1 项按设计忽略，Ruff、Rust fmt、Clippy、Cargo check、生产构建、Windows CI 合同和 12 项变异测试均通过。

## 未执行边界

- 未使用 Computer Use，未执行正式 GUI 截图矩阵、Windows 125%/200% 缩放或真实 Tauri 人工验收。
- 未运行真实 ContamX/SimRead 或真实 Provider，未读取真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程。
- 未提交、推送、打标签、打包、签名或发布；远程 Windows CI 仍需推送后才能验证。
