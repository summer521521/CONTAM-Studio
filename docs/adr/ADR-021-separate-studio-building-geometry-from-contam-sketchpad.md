# ADR-021：分离 Studio 建筑几何与 CONTAM SketchPad 投影

状态：Accepted
日期：2026-08-10

## 背景

v0.5.0 的 `spatial_projection.v1` 能可靠保留 CONTAM SketchPad 的楼层和图标网格事实，并提供只读墙段示意与气流拓扑。它不能证明图标中心就是建筑真实尺寸，也不能从 Zone 图标推断房间边界。用户希望像 ContamW 一样绘制建筑真实构造，因此需要一个可编辑几何领域，但现有 PRJ 解析与写回证据尚不足以承诺任意几何 round-trip。

## 决策

建立独立的 `building_geometry.v1`，并通过来源与能力字段明确区分：

- `contam_sketchpad_projection`：从已验证图标生成，使用半网格整数坐标，只读，`prj_round_trip=read_only_projection`；不生成 Zone 多边形。
- `studio_metric_draft`：应用拥有的毫米整数坐标草稿，可通过结构化命令编辑，默认 `prj_round_trip=unsupported`。

编辑使用 `geometry_edit_command.v1`，每条命令绑定 project session、geometry、语义 Revision、基线 geometry hash 和严格 sequence。候选几何必须先通过 `geometry_validation.v1`，再进入不可变历史。Python、Rust 和 TypeScript 各自验证边界；共享 fixture 固定合法契约。

悬浮面板布局使用独立 `floating_workbench_layout.v1`。布局存储只接受允许的面板、三套主题和有界坐标，不携带几何模型或项目数据。

## 理由

- 避免为了“看起来像建筑平面图”而把 Zone 锚点伪造成房间。
- 允许先把编辑交互、几何约束和用户体验做正确，再以证据逐步扩大 PRJ 子集。
- 让 AI 与 GUI 复用同一命令和验证链，避免画布节点成为第二套业务事实源。
- 整数坐标和确定性 canonical hash 便于跨语言验证、撤销、重放防护和证据追踪。

## 后果

- v0.5.0 项目继续默认显示可信只读投影；没有显式创建 Studio 草稿时不出现可编辑能力。
- Studio 草稿目前不能宣称可由 ContamX 直接求解，也不能导出为等价 PRJ。
- 后续若开放 `verified_subset`，必须新增证据和 ADR，证明真实 fixture 的导入、导出、重新读取、官方工具运行及未知内容保留。
- 三套主题和悬浮面板属于表现/偏好；不得改变几何哈希或领域语义。

## 替代方案

- 直接编辑 `spatial_projection.v1`：拒绝，因为它是来源事实的只读投影。
- 从 Zone 图标自动生成房间矩形：拒绝，因为没有领域证据。
- 立即复制 ContamW 的完整行为：拒绝，因为格式、许可和无损 round-trip 尚未完成审计。
- 在 Canvas 节点上维护几何：拒绝，因为会绕过 reducer/controller/Rust 边界并破坏 stale-result 防护。

## 待验证事项

- 真实大型建筑的拓扑性能与诊断可理解性。
- 门窗、墙交点、共享边界和多楼层连接的编辑手感。
- CONTAM PRJ 可验证写回的最小字段集合。
- 三主题在系统缩放、forced colors 和键盘模式下的 GUI 验收。
