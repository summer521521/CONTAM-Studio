# Geometry Workbench

> 当前研发事实源：将 CONTAM Studio 从只读 SketchPad 示意工作区演进为面向建筑构造建模的全画布空间命令台。

Renewal R1 已随 v0.5.0 完成发布。后续研发不再创建 Phase、QA、Batch 或 R2 编号，而以用户可理解的交付目标命名。当前目标是 Geometry Workbench；当前语义建模与安全副本能力见 [CONTAM Semantic Authoring and Safe Draft Foundation](../../development/task-log/records/contam-semantic-authoring-and-safe-draft-foundation.md)，领域基础见 [Geometry Workbench Foundation](../../development/task-log/records/geometry-workbench-foundation.md)，编辑能力见 [Geometry Editor Integration](../../development/task-log/records/geometry-editor-integration.md)，视觉与 AI 入口见 [Spatial Command Deck](../../development/task-log/records/spatial-command-deck.md)，浏览器级视觉与交互验收见 [Geometry Workbench Background Browser Acceptance](../../development/task-log/records/geometry-workbench-background-browser-acceptance.md)，项目级恢复和有损 SketchPad 比较见 [Project Geometry Document and SketchPad Preview](../../development/task-log/records/project-geometry-document-and-sketchpad-preview.md)，候选位置的安全审查与草稿应用见 [SketchPad Projection Safe Draft Application](../../development/task-log/records/sketchpad-projection-safe-draft-application.md)，共享角点拖拽与毫米坐标入口见 [Geometry Direct Manipulation and Precision Editing](../../development/task-log/records/geometry-direct-manipulation-and-precision-editing.md)，墙段与门窗的直接操纵见 [Wall and Opening Direct Manipulation](../../development/task-log/records/wall-and-opening-direct-manipulation.md)，显式相交、分割与修剪见 [Topology-aware Wall Intersections and Segments](../../development/task-log/records/topology-aware-wall-intersections-and-segments.md)，封闭房间与语义拆分合并见 [Zone Boundaries and Room Partitioning](../../development/task-log/records/zone-boundaries-and-room-partitioning.md)，多楼层切换、对齐底图和纯构造复用见 [Multi-level Navigation and Construction Reuse](../../development/task-log/records/multi-level-navigation-and-construction-reuse.md)，楼板开口和跨层流路见 [Vertical Openings and Cross-level Airflow](../../development/task-log/records/vertical-openings-and-cross-level-airflow.md)，墙上室内/室外端点绑定见 [Wall Airflow Boundaries and Outdoor Context](../../development/task-log/records/wall-airflow-boundaries-and-outdoor-context.md)，校准建筑图纸和描图入口见 [Calibrated Plan Underlay and Building Tracing](../../development/task-log/records/calibrated-plan-underlay-and-building-tracing.md)。

## 用户结果

- 中央区域是真正的建筑绘图画布，楼层、墙、门窗、Zone 区域和 FlowPath 锚点具有明确几何关系。
- 常用工具收敛到底部工具岛，楼层与 Zone 位于左上导航岛，选中对象属性位于右上检查岛；图层、主题和证据按需展开，不再常驻占据画布。
- 用户可在工程蓝图、建筑纸张和夜间实验室三套完整主题间切换；主题只改变视觉表达，不改变模型事实。
- 任何编辑都先形成结构化命令和预览，经确定性验证后进入可撤销历史；AI 建议不能绕过同一命令、Diff、确认和证据链。
- 用户可选中墙体、Zone 或顶点并拖动共享角点。拖动只产生本地预览，X 位移沿竖墙、Y 位移沿横墙确定性传播；释放后以一个有界原子 `move_vertices` 命令校验和提交，因此共享墙、Zone 边界、门窗与 FlowPath 不会在中间状态被拆散。
- 属性检查器提供整数毫米 X/Y 输入，画布焦点下方向键按 250 mm、Shift+方向键按 1 m 微调；对象列表仍提供完整 DOM 选择路径。
- 用户可直接拖动墙段做法向平移；相连同轴墙段和交接点通过同一正交传播保持连通。门窗可沿原宿主墙滑动，并在检查器精确编辑起点偏移和宽度；`opening.id`、宿主墙、开启方向、相邻 Zone 与 FlowPath 绑定不会被替换。
- 画墙穿过既有正交构造时，T 形和十字交点会预览并在提交时显式拆成共享顶点与独立墙段；从既有端点向外画线就是延伸。独立分割工具不允许穿过门窗，分割后的门窗偏移、Zone 环和 FlowPath 身份保持一致；修剪只能删除没有门窗且不承担 Zone 边界的显式墙段。
- Zone 不再由拖拽矩形同时猜测墙体和房间。用户先完成真实封闭墙环，再点击环内绑定一个未使用的语义 Zone；已有房间只有在显式墙网恰好形成两个封闭面时才能拆分，且必须明确选择新的未绑定 Zone。合并明确保留当前 Zone，只移除连续共享墙，并在共享墙有门窗或任何 FlowPath 端点会变化时关闭失败。
- 多楼层项目使用真实 Level 选择器切换当前画布；另一既有楼层可作为弱化、虚线且不可交互的对齐底图。用户可把某一楼层的顶点、墙体和门窗作为一个 `copy_level_construction` 手势复制到既有的完全空白楼层，毫米坐标保持一致，但 Zone、FlowPath、Level 元数据和 SketchPad 图标身份不会跟随复制。
- 用户可在相邻楼层的真实封闭 Zone 内放置 `vertical_openings` 楼板开口、楼梯或竖井符号；开口构造不会自动创造气流。只有用户另行选择端点与上下 Zone 完全一致的既有语义 FlowPath，才会提交 `link_vertical_flow_path`。CONTAM 的 phantom zone 仍是另一种“无楼板、贯通空间”语义，本轮不生成也不模拟它。
- 墙上门窗的气流绑定按当前几何上下文收敛：双侧 Zone 只接受 `interior` 墙上的精确 Zone—Zone FlowPath，单侧 Zone 只接受 `exterior` 墙上的精确 Zone—ambient FlowPath。`matchingWallFlowPathOptions` 保留语义 `from/to` 顺序并排除重复、已占用或歧义身份；画布不从墙法线或屏幕方向猜测室外侧和风向。
- 用户确认的 Studio 建筑草稿按原始项目基线身份自动保存，关闭应用并重新打开同一项目后可恢复；存储损坏时保留一代已验证备份和明确错误状态。
- SketchPad 模式可以比较 Studio Zone 相对位置与现有 CONTAM Zone 图标；叠层始终标注为有损且不可直接应用。用户可显式请求精确 Diff，并在统一检查器二次确认后写入新的应用草稿副本，不把图标布局冒充真实建筑平面图。
- AI 读图由 Codex 订阅登录中的 `gpt-5.6-luna` 完成；用户明确选择隔离图片并点击生成后，Luna 返回受限几何草案。本地预览、验证和第二次用户确认仍是进入画布历史的必要条件，真实 Provider 证据与自动合同分开记录。
- 每个 Level 可导入一张 PNG、JPEG 或指定 PDF 页面作为真实建筑图纸的校准底图。用户先解锁，再设置原点、旋转和不透明度，或在画布选择两个基准点并输入实际毫米距离；随后可沿图纸描绘真实墙体、门窗和房间。底图资源和校准状态绑定项目身份与 Revision，不写入原始 PRJ，也不把图片当作 CONTAM 几何事实。
- 已导入图片会进入既有附件中心，但默认不授权给 AI；只有用户明确选择“允许 AI 使用这张底图”并继续确认几何草案后，Codex 读图结果才可能进入同一命令、验证、撤销和持久化链路。
- 用户可以在真实封闭墙环中创建新的 CONTAM Zone：显示名、严格 CONTAM token 和体积来源均需明确填写；按面积乘层高得到的值只有在用户确认采用后才成为求解输入。
- 用户可以在已核验的室内或外墙 opening 上创建新的 Airflow Path，只能选择源 PRJ 已验证的 `plr_orfc`/`plr_leak3` flow element，并明确 multiplier、高度与端点方向。几何锚点和语义对象共同保存、撤销和重做。
- 证据浮层可导出一个不存在的新 PRJ 副本。副本新增 Zone、初始浓度和 FlowPath，官方 ContamX 3.4.0.3 实跑通过；原工程和当前 Revision 不变。当前不会写 Studio 建筑构造或 SketchPad icon，因此不冒充 ContamW 等价平面图。

## 两种几何事实必须分开

| 几何来源 | 当前意义 | 编辑能力 | PRJ 写回 |
| --- | --- | --- | --- |
| `spatial_projection.v1` | 从 CONTAM SketchPad 图标得到的可信网格示意 | 画布只读；候选移动可进入 Diff 审查 | 仅既有图标 column/row 可在二次确认后写入新草稿副本 |
| `building_geometry.v1` + `contam_sketchpad_projection` | 对上项的有界墙段投影；不推断房间多边形 | 只读 | 不写回 |
| `building_geometry.v1` + `studio_metric_draft` | CONTAM Studio 自有、毫米整数坐标的建筑草稿 | 结构化命令编辑 | 墙体/房间构造不写回；可将明确创作的 Zone/FlowPath 数值对象导出到新副本 |

Zone 图标是锚点，不是房间轮廓。只要尚未证明 CONTAM PRJ 的对应几何写入语义，就不得把 Studio 草稿描述为 ContamW 等价编辑，也不得声称能无损回写任意 PRJ。

## 当前基础契约

- `building_geometry.v1`：项目、Revision、来源哈希、几何 Revision、坐标系、来源、能力、楼层、顶点、正交墙、开口、Zone 区域和 FlowPath 锚点。
- `geometry_edit_command.v1`：命令 ID、严格顺序、项目/几何/Revision/基线哈希、操作者、操作和封闭参数。
- `move_vertices` 是直接操纵使用的原子子集：一次最多 128 个唯一既有顶点，所有目标先完整解析，再整体变更并只校验最终候选；旧 `move_vertex` 继续兼容。
- `update_opening` 只允许修改既有门窗的整数毫米 `offset` 与 `width`；不接受 `wall_id`、类型、开启方向、相邻 Zone 或 FlowPath 变更，候选仍需通过墙长和同墙重叠校验。
- `split_wall` 保留原墙 ID 作为第一子段，生成第二子段和共享顶点；分割点不得落入开口区间，后段开口只调整有向偏移并保留自身及 FlowPath ID，使用原墙边的 Zone 外环同步插入共享顶点。
- 拓扑感知画墙使用严格整数毫米、250 mm 捕捉和精确正交相交；共线重叠、无效基线、超过 64 个交点或 256 个操作的手势关闭失败，不进行容差猜测或静默合并。
- `create_zone_region` 只接受由现有墙边完整支撑的闭合外环；`partition_zone_region` 原子替换原 Zone 外环并新增一个已明确绑定的 Zone；`merge_zone_regions` 明确保留一个语义身份、释放另一个身份并只删除经精确核对的连续共享墙。三者都重新计算门窗相邻 Zone，任何已锚定 FlowPath 的端点变化均拒绝整次操作。
- `copy_level_construction` 只接受另一既有 Level 到当前既有空 Level 的完整顶点、墙体和门窗 ID 映射。命令先检查对象数量、全局 ID 冲突和目标空白状态，再原子重建构造；墙体清除 `source_icon_id`，门窗清除 `adjacent_zone_ids`，且不创建或复制任何 Zone、FlowPath 或语义 Level。
- `place_vertical_opening/remove_vertical_opening` 管理跨相邻 Level 的有界矩形构造；`link_vertical_flow_path/unlink_vertical_flow_path` 单独管理既有语义 FlowPath 与上下 Zone 的明确绑定。开口必须完整位于两层各一个 Zone 内，同一楼层对的开口不得面积重叠，已绑定开口必须先解绑才能删除。
- 墙上 `link_flow_path` 继续使用原有封闭命令，但候选只能由 `geometry-wall-airflow.ts` 产生：室内边界要求两个不同 Zone 与 `interior` 墙，外边界要求一个 Zone 与 `exterior` 墙；一个 opening 最多一个锚点，语义 FlowPath 在墙上和竖向绑定之间全局唯一。Rust 只缓存成功读取且仍绑定当前项目、source hash、identity 与 Revision 的语义快照；含任何 FlowPath 锚点的几何保存必须再次按该可信快照验证真实端点，没有当前证据时拒绝保存。
- `geometry_validation.v1`：确定性几何哈希、有效/无效/不可用状态和排序诊断。
- `geometry_document.v1`：应用自有项目身份、canonical geometry hash、单调文档修订和一代恢复备份；只保存可用的 Studio metric 几何。
- `contam_semantic_draft.v1`：与同一几何文档共同保存的 Zone/FlowPath 创作事实；使用固定点单位、稳定 ID、明确体积来源、已验证 flow element 和真实 opening 端点。几何与语义共享一个原子撤销历史。
- `geometry_underlay_resource.v1`：无路径的资源 ID、附件 ID、文件名、SHA-256、MIME、大小和图片/PDF 元数据；二进制只能由 Rust 根据项目身份在 `geometry-underlays` 中读取。
- Level 内 `plan_underlay`：资源身份、PDF 页码、像素尺寸、像素基准点、毫米原点、每像素微米、毫度旋转、不透明度、可见性和锁定状态。`set/update/remove_plan_underlay` 只能通过同一几何历史提交。
- `sketchpad_projection_preview.v1`：按 Zone 质心相对关系生成只读候选图标位置；固定 `lossy=true`、`can_apply=false`。
- `floating_workbench_layout.v1`：继续兼容读取三主题和旧七面板位置；Spatial Command Deck 当前只使用其中的主题偏好，旧面板位置不再决定正式界面布局。该存储仍不包含几何、PRJ、凭据或结果正文。

Python 负责从已验证空间投影生成只读几何并执行领域验证；Rust 对跨边界 payload 做独立的严格反序列化、身份、上限和拓扑验证；TypeScript 只在 Studio 草稿能力开启时应用不可变命令，并在提交前运行同类确定性检查。三端以共享 fixture 固定合法最小模型。

## 交付顺序

1. **领域基础（已完成）**：版本化几何、命令历史、三端验证、悬浮布局和主题令牌；不提供 PRJ 写回。
2. **绘图编辑器集成（已完成当前子集）**：现有 Konva 工作区已接到几何领域层，提供多楼层切换与对齐底图、选择、平移、捕捉、正交墙、T/Cross 显式交点、墙体分割、墙端延伸、受保护墙段修剪、封闭墙环 Zone、显式房间拆分/合并、门窗、FlowPath、尺寸、共享角点、墙段法向平移、门窗沿墙滑动、空楼层纯构造复用、精确尺寸和手势级撤销/重做；当前以 Spatial Command Deck 的命令栏与三个上下文浮岛呈现。
3. **CONTAM 语义绑定与最小创作（当前实现）**：既有 Zone/FlowPath 可安全绑定；用户也可创建普通 well-mixed Zone 与引用源 PRJ 受支持 flow element 的 Airflow Path。创建对象与 Geometry region/opening/anchor 原子提交，最终只写入新的数值 PRJ 副本；SketchPad icon 和 Studio 建筑构造仍不写回。Luna 不能绕过同一草稿、验证和用户确认链。
4. **Codex 读图草案（当前实现）**：复用 ChatGPT 订阅登录，固定 Luna 图片输入与封闭输出 Schema；不自动应用，不写 PRJ，不把图片路径或像素暴露给前端。
5. **项目级几何恢复（当前实现）**：`geometry_document.v1` 在 Rust/Tauri 权威边界内按 PRJ 基线身份保存和恢复应用自有毫米几何；前端不持有路径，不使用 localStorage 保存模型。
6. **SketchPad 有损比较与安全审查（当前实现）**：从同一身份与 Revision 的 Studio Zone 质心生成既有 Zone 图标候选位置；预览不可直接应用，显式审查后才进入既有 planner、Diff、第二次确认和新草稿副本。碰撞、超限、忙碌和上下文不匹配关闭失败。
7. **PRJ 子集研究（已完成并开放候选审查入口）**：NIST 文档、三套官方 fixture 与 OpenStudio 已锁定 `icon, column, row, object_number`；最小子集只允许移动既有图标到空闲且有界的网格单元，并写入新副本。任意拖拽、新增/删除图标仍未开放。
8. **校准底图与建筑描图（当前实现）**：Rust 管理 PNG/JPEG/PDF 资源，PDF.js 只在打开 PDF 页时按需加载；Konva 在建筑构造下方绘制底图，并用可撤销命令保存两点比例、原点、旋转、透明度、可见性和锁定状态。
9. **视觉与用户验收**：完成 1280×720、1440×900、125%/200% 缩放、中英文、三主题、键盘、真实工具和安装包截图矩阵，再决定发布。

这些是顺序目标，不是新的编号体系。每次只维护当前目标的一份任务日志。

## 不可突破的边界

- 官方 ContamX 继续承担数值求解；不得重写求解器。
- React 不读取 PRJ、不接收文件或工具路径、不直接调用系统能力。
- 原始 PRJ 不被前端或 AI 直接写入；任何未来写入必须落到新副本或受控草稿，并经过 Patch、Diff、确定性验证、确认、快照和追踪。
- 项目、source hash、语义 Revision、geometry ID、geometry Revision 和基线 geometry hash 任一不匹配都必须在变更前拒绝。
- 撤销后的新命令截断 redo 分支；重复 command ID 不得重放；项目或 Revision 改变必须清空历史和迟到结果。
- 画布不是唯一操作入口。正式编辑器必须提供可搜索 DOM 对象列表、可见焦点、状态公告和失败降级。
- 默认离线，不读取真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程。

## 当前状态

- `implementation=complete`
- `automated_verified=passed`
- `browser_design_qa=passed`
- `github_windows_ci=passed`
- `manual_gui=partial`（真实 Tauri 构造、拓扑、运行、结果与 AI 入口已验收；125%/200% 缩放和用户最终验收仍未执行）
- `real_tools=passed`（当前语义创作子集的官方 ContamX/SimRead 隔离复测已通过；无节点空气状态仍按真实诊断保留为结果读取失败）
- `real_provider=not_run`
- `packaged=no`
- `signed=not_run`
- `released=no`
- `user_validated=not_run`
- `merged_to_main=yes`
- `integration_closure=completed`（累计工作树的跨端集成一致性收口与最终自动门禁已完成）

## v0.6.0 本地候选状态

当前 Geometry Workbench 已随 `main` 合并并通过对应 Windows CI；v0.6.0 仍是本地候选，不是公开发布版本。版本准备阶段保持 `packaged=no`，候选包只在外部目录构建；候选未签名、未创建标签或 Release，真实 Provider 未运行，125%/200% Windows 系统缩放和用户最终验收仍为未执行。

本地浏览器视觉 QA 已通过选定参考图的同图对照、三主题、1488×1056、1280×720、1024×720、模式切换、墙体绘制、手势级撤销/重做以及 26 项严格背景浏览器断言；证据见项目根目录 [design-qa.md](../../../design-qa.md)和 [Geometry Workbench Background Browser Acceptance](../../development/task-log/records/geometry-workbench-background-browser-acceptance.md)。真实 Tauri GUI 已在隔离三 Zone fixture 上确认构造、SketchPad、气流拓扑、官方运行、partial 结果、证据链和 AI 未连接入口；125%/200% Windows 系统缩放、干净机与用户最终验收仍未执行，因此 `browser_design_qa=passed`、`manual_gui=partial`，两者均不等同于发布验收。

状态必须以[能力矩阵](../../capability-status-matrix.json)和当前任务日志为准，不能从代码存在推断 GUI、远程 CI、工具、打包或发布通过。
