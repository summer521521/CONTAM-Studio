# Vertical Openings and Cross-level Airflow

```yaml
task_id: vertical-openings-and-cross-level-airflow
phase: Geometry Workbench
title: 楼板开口与跨楼层气流连接
status: completed
record_origin: live
started_at_utc: 2026-08-13T05:00:30Z
ended_at_utc: 2026-08-13T05:33:53Z
duration_seconds: 2003
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户确认继续推进；总监依据 NIST CONTAM 官方楼板 FlowPath、phantom zone 和竖井建模语义选择本目标。
task_summary: 在应用自有 Studio metric 几何中新增楼板开口及独立的跨楼层 FlowPath 锚定，使相邻楼层真实 Zone 可以显式连接；不把墙上门窗、phantom zone、楼梯井或 PRJ 写回语义混为一谈。
goals:
  - 楼板开口是独立的有界矩形构造，明确连接两个相邻既有 Level
  - 跨层气流锚定与构造对象分离，只能绑定一个未使用的既有语义 FlowPath 和上下层真实 Zone
  - 开口必须完全位于上下层各一个明确 Zone 区域内，不依赖模糊坐标或自动语义猜测
  - 创建、绑定、解绑和删除均使用封闭原子命令、完整验证和同一撤销历史
  - 当前层画布、对象列表和检查器显示连接方向、目标楼层及绑定状态
allowed_scope:
  - building_geometry.v1 共享 schema、TypeScript/Python/Rust 类型与严格验证
  - 结构化几何命令、规划器、controller/history、现有 Konva 画布、对象导航和检查器
  - 双语文案、CSS、自动测试、描述性合同、事实源、架构文档和能力矩阵
forbidden_scope:
  - phantom zone、新增/删除语义 Level、自动生成楼梯井 Zone、跨非相邻楼层连接、修改原始 PRJ
  - 把墙体 opening 当作楼板开口、把建筑构造存在当作 FlowPath 已绑定、自动创造语义 FlowPath
  - AI 生成竖向连接、坐标容差猜测、第二套画布/历史、Computer Use、真实用户数据、提交或发布
validation:
  - 开发中运行三端契约聚焦、命令篡改/回滚、跨层 Zone 包含关系、画布数学和现有 Geometry 合同
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

- NIST CONTAM 3.4 指南明确：墙上 FlowPath 连接墙两侧 Zone；放置在楼板空白位置的 FlowPath 连接当前 Level Zone 与下一层 Zone。
- 普通 Zone 隐含楼板和天花板；无楼板贯通空间使用 phantom zone。楼梯井/竖井可建模为逐层 Zone，再由跨层 FlowPath 连接。
- 因此 Studio 几何必须把楼板开口、跨层 FlowPath 锚定和 phantom zone 分成不同事实。本轮只实现前两者，phantom zone 保持未实现。

## 实现结果

- `building_geometry.v1` 在顶层分别增加 `vertical_openings` 与 `vertical_flow_path_anchors`。前者记录楼板开口、楼梯或竖井的矩形构造，后者才记录既有语义 FlowPath、上下 Zone 与构造的显式绑定；墙上 opening、楼板开口和 phantom zone 没有混用。
- 新增四个封闭原子命令：`place_vertical_opening`、`remove_vertical_opening`、`link_vertical_flow_path`、`unlink_vertical_flow_path`。创建构造与绑定语义分别进入同一 controller/history，可独立撤销；仍有绑定时不能删除开口。
- 相邻楼层按稳定 `level_number/id` 排序判断。开口四角必须以整数精确判断严格位于上下楼层各一个真实封闭 Zone 内；边界接触、跨非相邻楼层、同楼层对面积重叠、全局 ID 冲突、对象超限和重复 FlowPath 身份均关闭失败。
- TypeScript、Python 与 Rust/Tauri 独立执行相同的楼层、Zone、重叠、身份和数量验证。命令层再次解析封闭 payload，篡改 Level 或 Zone 的候选不会进入历史。
- 底部工具岛新增“楼板开口”。上下文浮岛只列出相邻目标 Level 和三种明确构造类型；画布显示上/下方向、目标楼层和绑定状态。对象导航提供 `vertical_opening` 与 `vertical_flow_path` 两个完整 DOM 选择入口。
- 检查器显示上下 Level、尺寸、上下 Zone 与绑定状态；只列出端点与该上下 Zone 完全一致、具有稳定身份且尚未占用的既有 FlowPath。绑定与解绑必须由用户显式点击，不自动创造语义对象。
- 旧版应用自有 `geometry_document.v1` 若两个竖向集合同时缺失，Rust 会先验证旧 payload 哈希，再补为空数组并运行当前完整契约；只缺一个字段、旧哈希不符或迁移后无效仍拒绝。未读取或迁移真实用户 AppData。
- Codex 读图 Schema 和普通 AI 几何草案仍只允许原有有界平面操作，不能生成竖向开口、竖向绑定、phantom zone 或楼梯井 Zone。

## 验证结果

- 本任务描述性合同：49 项断言通过；既有 Multi-level 合同同步为“楼板开口也占用目标 Level”后 41 项通过。
- 前端全量：49 个测试文件、373 项通过；`pnpm build` 通过。保留既有 ECharts 550.62 kB 与主入口 662.36 kB 大 chunk 警告，未提高阈值。
- Python：394 项通过；Ruff 通过。
- Rust：168 项通过、1 项按设计忽略；`cargo fmt --check`、严格 Clippy 和 `cargo check` 通过。
- 任务日志合同：98 条记录通过；能力矩阵 JSON、Markdown 链接和 `git diff --check` 通过，只有 LF/CRLF 转换提示。
- Full 运行事实：第一次启动因总监误设 1 秒外层时限在约 5 秒被终止，没有形成结果；随后第一次完整 Full 退出码 1，Docs 为 59 项通过、1 项失败，唯一原因是既有 Multi-level 描述性合同仍硬编码旧的一参数空楼层检查；同步合同后聚焦复测通过。修正后的最终 Full 退出码 0，用时 88.6 秒，`QA-01 passed: 81 checks passed`。未删除或覆盖失败证据。

## 未执行边界

- 未使用 Computer Use，未执行正式 GUI 截图矩阵、Windows 125%/200% 缩放或真实 Tauri 人工验收。
- 未运行真实 ContamX/SimRead 或真实 Provider，未读取真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程。
- 未提交、推送、打标签、打包、签名或发布；远程 Windows CI 仍需推送后才能验证。
