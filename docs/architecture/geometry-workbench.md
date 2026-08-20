# Geometry Workbench 架构

## 事实层次

```text
CONTAM PRJ bytes
  -> spatial_projection.v1             verified read-only icons
  -> building_geometry.v1 projection   verified read-only wall segments

Existing verified SketchPad icon
  -> semantic_patch.v1 column/row Diff
  -> user confirmation
  -> application-owned PRJ copy
  -> strict Section 3 reread

User creates Studio draft explicitly
  -> building_geometry.v1 studio_metric_draft
  -> contam_semantic_draft.v1 Zone / Airflow Path facts
  -> geometry_edit_command.v1 preview
  -> deterministic validation
  -> user commit
  -> one atomic geometry + semantic undo/redo history
  -> geometry_document.v1 app-local persistence
  -> native new-copy export request
  -> Rust-bound current semantic draft
  -> Python strict Section Zone/Concentration/FlowPath insertion
  -> strict reread + source/output hash verification
  -> official ContamX-solvable PRJ copy
  -> sketchpad_geometry_written=false

User imports a PNG, JPEG, or PDF plan page
  -> existing attachment quarantine and signature inspection
  -> Rust-owned geometry-underlays/<project-identity>/ resource
  -> path-free geometry_underlay_resource.v1 receipt
  -> optional PDF.js page rasterization in the lazy Geometry Workbench
  -> locked plan_underlay in the Level geometry history
  -> explicit unlock + two-point calibration or numeric transform
  -> walls, openings, and rooms traced through normal geometry commands

Selected Studio wall, Zone, or vertex
  -> local snapped drag preview
  -> orthogonal connected-component propagation
  -> bounded atomic move_vertices command
  -> complete final-candidate validation
  -> one gesture-level history entry

Selected Studio wall body or opening
  -> local drag-only preview
  -> wall normal-axis move_vertices OR opening update_opening
  -> complete topology and opening validation
  -> preserved opening, host wall, Zone, and FlowPath identity
  -> one gesture-level history entry

New orthogonal wall stroke or explicit split
  -> exact 250 mm snapped preview
  -> indexed collinear and perpendicular intersection query
  -> bounded split_wall + add_vertex + add_wall batch
  -> opening offsets and Zone loops updated by domain command
  -> complete final-candidate validation
  -> one gesture-level history entry

Closed wall face, explicit room partition, or controlled merge
  -> bounded exact half-edge face extraction
  -> local face preview with explicit semantic Zone choice
  -> create_zone_region OR partition_zone_region OR merge_zone_regions
  -> opening adjacency and FlowPath endpoint protection
  -> complete final-candidate validation
  -> one gesture-level history entry

Existing source Level + existing completely empty target Level
  -> explicit source selection
  -> complete vertex/wall/opening ID maps
  -> bounded copy_level_construction command
  -> same-coordinate construction with cleared semantic adjacency
  -> complete final-candidate validation
  -> one gesture-level history entry

Adjacent existing Levels + one verified Zone on each Level
  -> bounded vertical_openings rectangle
  -> separate explicit vertical_flow_path_anchors binding
  -> exact existing semantic FlowPath and upper/lower Zone identity
  -> complete final-candidate validation
  -> separate undo entries for construction and semantic binding

Studio metric Zone regions + verified SketchPad Zone icons
  -> sketchpad_projection_preview.v1
  -> lossy non-interactive overlay
  -> explicit candidate review
  -> verified semantic column/row Diff
  -> second user confirmation
  -> application-owned PRJ draft copy
```

两条路径共享项目、source hash 和语义 Revision，但不共享编辑能力。只读投影不会被“升级”为 Studio 草稿；未来转换必须是显式操作并保留来源证据。

## 跨层职责

### Python

- 只从已验证 `spatial_projection.v1` 生成墙段投影。
- 使用半网格整数坐标并反转屏幕行方向为向上 Y 轴。
- 不推断 Zone 多边形、面积、长度或物理比例。
- 验证数量、payload、稳定 ID、坐标、正交墙、交点、开口、Zone 环和 FlowPath 绑定。
- `semantic_authoring_export.py` 只接受通过 `contam_semantic_draft.v1` 的普通 Zone 与受支持 Airflow Path。它从源 PRJ 严格读取 Level、Zone、species、flow element 和路径事实，只修改 Zone、Initial Zone Concentration 与 Flow Path 区段，保持其他源字节及换行不变；排他创建新副本后重新读取数量、名称、体积、端点和 multiplier。

### Rust/Tauri

- 对跨边界 payload 使用 `deny_unknown_fields`。
- 绑定项目 session 与 Revision，限制 payload、对象数量、坐标和拓扑比较预算。
- 不向前端开放 PRJ 原文、用户路径或通用文件写入命令。
- `plan_semantic_patch` 只接受既有 SketchPad 图标的 `column/row` 两个新增字段；Rust 绑定活动项目、Revision 和基线 identity，前端不能提供源/输出路径。
- `generate_geometry_draft_from_image` 复用现有 Codex App Server 登录连接；只接受 Studio 隔离区内经重新哈希的用户所选 PNG/JPEG，不向 WebView 返回路径或像素。
- `load_project_geometry_document` 与 `save_project_geometry_document` 只使用 Rust 根据应用数据目录和 PRJ 基线 SHA-256 构造的固定位置。主文件、备份、哈希、修订冲突、并发写入和 payload 上限均在 Rust 验证，响应不返回本机路径。
- `select_and_import_geometry_underlay` 只允许原生选择 PNG、JPEG 或 PDF，并先复用附件隔离 Worker 的类型、主动内容、元数据、大小和哈希检查。Rust 再把已验证副本原子复制到 `<app-local-data>/geometry-underlays/<baseline-sha256>/<resource-id>.<ext>`；响应只含无路径元数据。
- `read_geometry_underlay_resource` 不接受任意路径，只接受当前项目 session、Revision、UUID 资源 ID、SHA-256 和封闭 MIME。读取前后均验证项目新鲜度、应用目录边界、文件形状、签名、大小和完整哈希；几何文档保存时再次验证所有引用资源。
- 成功的 `read_semantic_project` 会在 Rust 内存中保留一份短生命周期可信语义快照，并再次确认活动 project session、Revision、source hash 与 identity；项目替换立即清空。几何文档不保存该快照，但只要候选含墙上或竖向 FlowPath 锚点，`save_project_geometry_document` 就必须用它重新解析语义 Zone number 和 FlowPath `from/to`，证据缺失或端点不一致均拒绝落盘。
- `geometry_document.v1` 可以在同一受控文档中保存 `contam_semantic_draft.v1`。Rust 独立验证固定点单位、对象上限、稳定 ID、现有 Level/flow element、Zone region、opening、flow anchor 与 Zone/室外端点；草稿和几何共同进入同一文档修订与恢复备份。
- `export_semantic_authoring_draft_copy` 不接受源或目标路径 payload。Rust 从当前应用文档重新加载语义草稿，用原生保存对话框获得不存在的新 `.prj`，调用受控 Worker 后再核对严格响应、源/输出 SHA-256、大小、对象 ID/编号和 `sketchpad_geometry_written=false`。项目、Revision、源文件或语义草稿在对话框/Worker 期间变化时，匹配本次哈希的输出被删除并返回 stale 错误。
- 视觉回合固定请求模型目录中的 `gpt-5.6-luna`，要求 ChatGPT 订阅登录和 `image` 输入声明，不静默回退模型；临时线程使用只读 Sandbox、关闭网络、空工具集和 `approvalPolicy=never`。

### TypeScript

- `geometry-model.ts` 提供与合同一致的类型、canonical JSON 和 SHA-256。
- `geometry-plan-underlay.ts` 是像素与毫米坐标变换的唯一前端事实源。`micrometres_per_pixel`、`rotation_millidegrees` 和两组原点都是有界整数；两点校准先把画布点反算到图片像素，再保持第一个基准点不动地更新比例与原点。
- `useGeometryPlanUnderlay.ts` 绑定项目、Revision、Level 和资源哈希，丢弃迟到的导入/读取/PDF 渲染。图片使用浏览器解码，PDF.js 与 worker 仅在 PDF 底图存在时动态导入，单页最长边限制为 4096 像素。
- `geometry-commands.ts` 在 mutation 前检查项目、geometry、Revision、hash、sequence 和编辑能力，候选无效则返回原模型。
- `geometry-direct-manipulation.ts` 对共享角点执行正交连通传播：X 只沿竖墙连通分量传播，Y 只沿横墙连通分量传播，并限制为最多 128 个唯一既有顶点。Konva 拖动只保存局部预览；释放或检查器提交时才形成一个原子 `move_vertices` 命令。
- `geometry-wall-opening-manipulation.ts` 将墙段法向平移投影到同一正交连通传播，并按稳定楼层快照缓存门窗、宿主墙和同墙开口索引。门窗沿墙投影只生成 `offset/width`，不生成新的对象 ID 或绑定。
- `geometry-wall-topology.ts` 为稳定楼层快照建立按方向和轴坐标排序的墙索引。新墙只查询可能相交的垂直集合，精确生成 T/Cross 共享点、既有墙分割和新墙段批次；共线重叠、穿过开口、陈旧上下文和复杂度超限均关闭失败。
- `geometry-zone-topology.ts` 为同一稳定楼层快照建立墙边与有向半边索引，只保留有界逆时针面并使用整数 `BigInt` 叉积、面积与点在多边形判断。点击边界、外部面、歧义嵌套、陈旧上下文、超过 4096 边的面或 200000 半边预算都会关闭失败；不会从 Zone 锚点、包围盒或浮点容差猜测房间。
- `geometry-level-construction.ts` 只规划既有来源 Level 到既有空目标 Level 的纯构造复制。规划器生成完整顶点、墙体和门窗 ID 映射，并复用全局对象 ID 集合排除碰撞；对象上限为 10000 顶点、10000 墙体和 5000 门窗。它不复制 Zone、不复制 FlowPath，也不新增、删除或改写语义 Level。
- `geometry-vertical-connections.ts` 只允许排序后相邻 Level。开口矩形四角使用整数 `BigInt` 多边形判断，必须严格落在上下 Zone 各一个真实封闭区域内；同一楼层对的面积重叠、全局 ID 冲突、非相邻层和边界接触均关闭失败。构造与语义绑定是两个命令，既不从坐标猜测 FlowPath，也不创造 phantom zone。
- `geometry-wall-airflow.ts` 是墙上开口室内/室外边界的唯一前端规划器。它把双侧 Zone + `interior` 墙解释为 Zone—Zone，把单侧 Zone + `exterior` 墙解释为 Zone—ambient；随后将几何稳定 Zone ID 与语义 CONTAM number 做唯一映射，只保留端点完全一致且未占用的 FlowPath。重复 Zone number、重复 FlowPath ID、未知类别、非空 outdoor number 和矛盾墙类型全部关闭失败。
- `geometry-history.ts` 只提交验证成功的命令，支持 undo/redo、分支截断和 command ID 重放保护。
- `useGeometryWorkbench.ts` 在稳定父级持有唯一几何历史；先恢复项目文档，再允许创建草稿，并以短延迟保存已确认状态。每次异步 load/save 都绑定当前项目上下文和序列，迟到响应被丢弃。
- `useGeometryWorkbench.ts` 同时持有语义草稿并把每个提交记录为 `{commandCount, semanticBefore, semanticAfter}`。因此“墙环 + 新 Zone”和“opening anchor + 新 Airflow Path”分别作为一个手势撤销；删除或移动承载语义对象的几何时，候选先用当前草稿重新验证。导出只在当前 geometry hash 与 semantic draft hash 已被 Rust 持久化后开放，并独立丢弃迟到响应。
- `sketchpad-projection-preview.ts` 是纯确定性投影；Konva 只渲染其虚线箭头和幽灵锚点，不把画布节点反推为业务状态。
- `sketchpad-projection-patch.ts` 只把经过重新校验的候选转换为既有图标坐标操作；预览本身仍不调用 `plan_semantic_patch`。`useProjectPatchJourney.ts` 复用统一 planner、Diff 和应用链，并以活动上下文 ref 丢弃项目切换后的迟到响应。
- `geometry-layout.ts` 保留旧布局 schema 的兼容读取与主题偏好；Spatial Command Deck 不再从旧七面板坐标构造正式布局。未知字段、重复面板和非法窗口状态仍关闭失败或回退默认值。
- Canvas 只是该状态的投影与命令输入设备，不保存第二份几何事实。
- Konva 底图层位于网格与建筑构造之间，`listening=false`，不能承担对象选择或业务身份。其变换固定为毫米原点、负毫度屏幕旋转和 `micrometres_per_pixel / 1000` 缩放；校准模式另用全画布捕获层记录两个几何点。
- 直接操纵不会逐条发布中间顶点位置。原子 `move_vertices` 先严格解析全部目标，再一次性写入候选模型并运行完整墙体、开口、Zone、FlowPath、身份和 payload 校验；失败时历史和持久化状态都不变。
- 门窗沿墙拖动和检查器编辑只形成一个原子 `update_opening`。命令参数封闭为 `level_id/opening_id/offset/width`，因此不能借此更换宿主墙、类型、开启方向、相邻 Zone 或 FlowPath；越界、同墙重叠和陈旧快照均在提交前关闭失败。
- `split_wall` 在领域层完成依赖迁移：原墙 ID 留在第一子段，后段开口改绑新墙并减去分割距离，FlowPath 继续引用同一 opening ID，所有真实使用原墙边的 Zone 环插入同一分割顶点。分割点穿过开口时整个命令拒绝。
- 一次画墙可能包含多个 `split_wall/add_vertex/add_wall`，但控制器只发布最终全部通过的候选，并记录操作数作为一个撤销批次。Delete/Backspace 或检查器修剪沿用 `delete_wall`；带门窗或作为 Zone 显式边界的墙段不能删除。
- `create_zone_region` 只绑定现有最小封闭墙面。`partition_zone_region` 要求原外环内恰好存在两个面积和完全相等的墙面，并由用户选择新语义 Zone 与目标一侧；`merge_zone_regions` 要求连续共享边，明确保留当前 Zone、释放另一个 Zone，并精确删除共享墙。命令层重新核对墙边集合、封闭参数和完整候选，不能通过伪造顶点列表删除其他墙体。
- 门窗相邻 Zone 在候选中按真实边界重新计算。若共享墙有门窗、被释放 Zone 属于 FlowPath 端点，或拆分/合并会改变任何既有 FlowPath 锚定开口的 Zone 邻接，操作在预览或命令层关闭失败，不进行自动迁移。
- 活动楼层、参考楼层和构造来源楼层都是界面瞬态状态，不进入几何哈希。切换活动楼层会清理旧 selection、工具预览和诊断；当前楼层的语义 Zone 列表按已验证 `level_number` 严格过滤。另一楼层的对齐底图由 Konva 的 `listening={false}` 图层绘制，只显示弱化墙体和门窗，不承担选择、捕捉或业务身份。
- `copy_level_construction` 通过同一 controller/history 提交为一个可撤销手势。领域命令再次核对目标完全为空、来源非空、映射完整、对象上限和全局 ID 唯一性；复制墙体不保留 SketchPad `source_icon_id`，复制门窗不保留 Zone 邻接。普通助手和 Codex 读图 Schema 均不接受该操作，避免 AI 隐式批量复制楼层。
- `place_vertical_opening` 与 `remove_vertical_opening` 只改变 Studio 自有楼板构造；`link_vertical_flow_path` 与 `unlink_vertical_flow_path` 只改变独立锚点。绑定要求开口上下 Zone 与既有语义 FlowPath 两端按稳定身份完全一致，且该 FlowPath 未被墙上或其他竖向锚点占用。已绑定开口不能删除，Level 切换会清理旧 selection，DOM 对象导航保留完整替代路径。
- 墙上 FlowPath 不再由 Konva 根据 `adjacent_zone_ids` 直接拼装。Canvas 只把 opening ID 交回稳定父级；父级执行 `matchingWallFlowPathOptions`、`planWallFlowPathLink` 与完整命令提交。已存锚点通过 `auditWallFlowPathAnchor` 与当前语义快照重新核对，明确显示 verified、invalid 或 unavailable，而不会把语义缺失冒充成功。
- WebView 的匹配结果不是最终权限证明。Rust `validate_geometry_semantic_flow_bindings` 独立使用当前可信快照验证墙上端点的精确顺序、Zone—ambient 方向和竖向端点集合；重复/缺失语义身份、重复 Zone number、错误类别或无当前快照时，应用自有几何文档不会保存。

## 首个可验证 PRJ 几何子集

PRJ Section 3 保存离散 SketchPad 图标，不保存 Studio 的毫米级建筑构造。NISTIR 7049 的真实示例、三套官方 fixture 与 OpenStudio `IconImpl::read/write` 一致使用 `icon, column, row, object_number`；NIST 同页自然语言中的 `row, col` 与这些证据冲突，因此不作为单独写入依据。

当前新增的内部能力只允许 `set_spatial_icon_column` 和 `set_spatial_icon_row`：

- 目标必须是当前 `spatial_projection.v1` 中已经存在的稳定 icon ID。
- `grid_cell` 坐标必须位于 PRJ 唯一 `! rows cols` 声明内；最终 Level 网格不得有两个图标占用同一单元。
- `icon_type`、`object_number`、Level、图标数量和顺序不可变化；未知图标照常保留。
- 每个坐标字段是单独的 byte-local Patch 与 Diff 项。应用前重算事务，应用后重新读取源/输出投影并逐项比较。
- 只创建新的应用草稿副本。正式 UI 仅开放“候选位置 → Diff 审查 → 第二次确认”入口，尚未开放任意拖拽，也不允许普通 AI 语义 Patch 生成坐标操作。

这不是 Studio metric 几何的 PRJ round trip。真实墙长、门窗宽度、Zone 面积等继续属于 `studio_metric_draft`；未来只可通过明确标注为有损的 SketchPad 投影与 PRJ 交互。

## 验证不变量

- 所有坐标是有界安全整数；Studio metric 的单位固定为 mm。
- 当前墙为非零正交线段；交点必须通过共享顶点显式拆分。
- 开口绑定真实墙，`offset + width` 不超过墙长，同墙开口不能重叠。
- Zone 外环至少三个唯一顶点、逆时针且不自交；不得由 Zone 图标锚点自动生成。
- FlowPath 锚点绑定真实开口和 Zone；双侧 Zone 必须位于 interior 墙且端点集合完全相等，单侧 Zone 必须位于 exterior 墙且另一端为 ambient。一个 opening 最多一个锚点，室外端方向必须与语义 `from/to` 一致。
- 竖向开口只连接相邻 Level，完整矩形必须严格位于上下 Zone 各一个区域内；竖向 FlowPath 身份在整个几何文档内唯一。
- 同一 payload 的所有对象 ID 全局唯一；项目/Revision/geometry hash 不匹配时不产生候选变更。
- 三主题和兼容布局偏好不参与几何哈希。

## 存储与恢复

Studio metric 几何以 `geometry_document.v1` 保存到 `<app-local-data>/geometry-documents/<baseline-sha256>.json`。该路径由 Rust 固定构造，不是 PRJ 邻近 sidecar，WebView 不接收路径。文档只接受 application-owned 的可用毫米几何，并同时校验基线 identity、canonical geometry hash、文档修订号、时间戳、大小和完整 `building_geometry.v1` 合同。楼板开口能力加入前保存的同版本文档可能同时缺少 `vertical_openings` 与 `vertical_flow_path_anchors`；底图能力加入前的 Level 可能缺少 `underlays`。读取器先按旧 payload 核验原哈希，仅在集合迁移满足各自完整条件时补为空数组，再运行当前完整契约并计算新的内存哈希。只缺一个成对字段、旧哈希不符或迁移后无效仍按损坏关闭失败。

底图二进制与几何 JSON 分离。每个 Level 最多引用一个 `plan_underlay`，其资源 SHA-256 进入几何哈希与 undo/redo；二进制放在 Rust 管理的 `geometry-underlays` 目录。移除引用不会立即删除资源，以免撤销或崩溃恢复失去证据；后续只能由明确的应用缓存生命周期按引用审计回收。图片同时进入现有附件中心，但保持 `selected_by_user=false`，因此导入本身不等于授权 AI 发送像素。

保存通过进程内串行写入、期望文档修订、临时文件、同步、原子重命名和写后重读完成；保留一代已验证 `.json.bak`。主文件损坏时只恢复有效备份并明确显示恢复状态。重新打开项目时，Rust 在验证同一基线 identity 后，将当前 project session、语义 Revision 和 source hash 重新绑定到几何快照；React 以该快照建立新的 undo/redo 会话，不伪造旧命令历史。项目或 Revision 改变会使迟到 load/save 失效。

建筑几何继续禁止写入 localStorage。既有 SketchPad 图标坐标 Patch 沿用应用所有的不可变 PRJ 草稿 Revision；两种存储不得混写。localStorage 仍只允许 `floating_workbench_layout.v1` 的主题及旧布局兼容偏好。

## CONTAM 语义创作与新副本导出

`contam_semantic_draft.v1` 只覆盖当前已经证明可以由官方 ContamX 求解的最小子集：普通 Level 上的 well-mixed Zone，以及引用源 PRJ 既有 `plr_orfc`/`plr_leak3` flow element 的普通 Airflow Path。Zone 使用升、毫开尔文和毫帕整数，路径使用毫米和百万分之一倍数；三端 canonical fixture 哈希相同。

Zone 必须绑定真实 `GeometryZoneRegion`。若体积来自几何，前端用整数毫米多边形面积乘当前层高，并要求用户明确选择“采用几何估算”；否则只接受明确 m³ 输入。Airflow Path 必须绑定真实 wall opening 与 flow anchor，端点严格沿用已审计的室内 Zone—Zone 或 exterior Zone—outdoor 边界，方向交换是显式用户操作。

导出不是当前 Revision 的原样复制，也不改变活动项目。Python 为每个新对象在源计数之后分配确定性 CONTAM number，向每个新 Zone 写入与 species 数量一致的零初始浓度，并将新路径的 SketchPad-only icon/direction 字段保持为 0。完成后严格重读 Zone 与 network；Rust 再以实际文件哈希和大小验证 Worker 结果。界面只显示安全文件名和新增对象数量，不显示绝对路径。

该能力不写 Studio 墙体、房间多边形、门窗或 Level icon。NIST 文档说明 icon data 属于 ContamW 界面数据而不由 ContamX 保存，因此数值副本即使通过官方求解，也不能称为 ContamW 等价几何 round trip。

## Studio metric 到 SketchPad 的有损预览

`sketchpad_projection_preview.v1` 只比较同一项目、source hash 和 Revision 下的 Studio Zone 区域与已绑定 Zone 图标。算法按 Level 计算 Zone 多边形质心，将其相对位置归一化到现有 Zone 图标的 column/row 边界，并反转 Y 轴以匹配 SketchPad 行方向。输出稳定排序、检测最终单元碰撞，并固定声明 `lossy=true`、`can_apply=false`。

该输出只在只读 SketchPad 上显示候选虚线和幽灵锚点。预览本身不创建或删除图标、不改变 icon type/object number、不调用 `plan_semantic_patch`，也不代表真实比例或无损 round trip。独立准备边界会重新校验 session、source、identity、Revision、ID、坐标、变化标记、重复目标、最终单元和 128 操作上限；只有用户点击审查后，候选才转换为既有图标位置 planner 的输入。

planner 返回的精确 Diff 进入现有语义检查器，且字段在 review/applying 期间锁定。用户第二次点击应用后，Rust 才能创建新的应用管理草稿副本并写后重读。项目或 Revision 变化会清空语义状态，迟到 plan/apply 响应不进入当前项目。该链路仍不能新增、删除、改类型、改 object number、跨 Level 移动图标或写回 Studio metric 墙体与房间构造。

## AI 图纸到几何草稿边界

当前链路为“用户选择隔离图片 → Codex App Server `localImage` → `gpt-5.6-luna` 受限结构化草案 → `geometry_edit_command.v1` 本地预览 → 确定性验证 → 用户确认 → 可撤销历史”。Luna 同时承担图片理解和草案组织，不再依赖 Gemini、DeepSeek 或额外 API Key。

普通助手上下文继续只披露图片元数据并保持 `image_pixels_sent=false`。只有几何工作台内用户再次点击“生成几何草稿”并明确选择图片后，Rust 才将 Studio 所有的隔离副本作为一次性 `localImage` 输入交给 Codex。输出 Schema 只允许 `add_vertex`、`add_wall`、`create_zone_region` 和 `place_opening`，并绑定项目、Revision、几何基线哈希和附件哈希。工具活动、未知字段、越界 payload、迟到响应、错误语义 Zone 或本地几何校验失败都会丢弃整个草案。

草案不会自动提交。前端先在不修改历史的候选模型上逐条执行同一确定性命令，再以叠加层显示；只有用户点击“确认加入画布”后，命令才以 `ai_suggestion` 身份携带逐条用户批准进入不可变历史。原始 PRJ 和 CONTAM SketchPad 投影仍不被修改。

## GUI 集成状态与剩余门槛

当前项目页已接入 Studio metric 建筑草稿、项目级恢复、Spatial Command Deck、三主题、多楼层切换、不可交互对齐底图、空楼层构造复制、楼板开口与显式跨层 FlowPath、捕捉、正交墙、封闭墙环 Zone、显式房间拆分/合并、门窗、墙上 FlowPath、尺寸、共享角点拖拽、墙段法向平移、门窗沿墙滑动、毫米坐标/尺寸、选择和手势级 undo/redo。React 运行时持有唯一历史，Konva 只提交结构化操作批次；项目/source/Revision/语义身份变化会重载绑定同一基线的应用几何文档并清空旧交互状态。SketchPad 模式显示不可直接应用的有损候选叠层，并可从浮层进入统一 Diff 审查与草稿副本确认。

浏览器渲染已证明 1488×1056、1280×720 和 1024×720 的核心布局与交互。正式桌面用户验收仍必须额外证明：

- React 状态只通过领域命令变化，Konva drag 不直接修改业务对象（已由代码和自动合同证明）。
- 画布、对象列表、属性面板和语义树 selection 双向一致。
- 捕捉、预览、取消、错误恢复、undo/redo 和项目切换没有迟到污染。
- 1280×720、1440×900、125%/200% Windows 系统缩放、中英文、三主题、键盘和 forced colors 完成真实 Tauri 人工验收。
- 正式 UI 只开放已验证的既有图标候选位置审查子集；任意拖拽、新增/删除图标和 Studio metric 构造写回仍需新的 round-trip 与官方工具证据。
