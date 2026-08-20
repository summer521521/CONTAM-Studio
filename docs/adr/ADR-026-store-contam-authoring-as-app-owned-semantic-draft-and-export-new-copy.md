# ADR-026：将 CONTAM 创作保存为应用语义草稿并只导出新副本

- 状态：Accepted
- 日期：2026-08-13

## 背景

Geometry Workbench 已能绘制真实建筑构造，但 `studio_metric_draft` 的墙、房间轮廓和门窗不是 CONTAM PRJ 中的 SketchPad 图标记录。若直接把毫米几何解释为 ContamW 文件结构，会伪造尚未验证的格式语义；若只允许绑定原项目既有 Zone，用户又无法从新建筑构造建立可求解模型。

NIST CONTAM 3.4 文档和仓库内官方 fixture 已足以锁定普通 well-mixed Zone、Initial Zone Concentration 与普通 Airflow Path 的最小记录子集。NIST 文档同时说明 SketchPad icon data 由 ContamW 使用而 ContamX 不保存，因此“数值对象可求解”与“ContamW SketchPad 几何可回写”必须分成两种能力。

## 决策

- 新建 CONTAM 对象先保存为 `contam_semantic_draft.v1`，并与项目 session、基线 identity、当前 source hash、Revision、`building_geometry.v1` 的 Zone region/opening/flow anchor 稳定绑定。
- 跨 TypeScript、Python 与 Rust 使用同一严格字段、固定点整数单位、数量和 payload 上限；未知字段、悬空身份、重复对象或几何端点不一致均关闭失败。
- Zone 体积只接受用户输入的明确值，或用户确认采用的“封闭区域面积 × 当前层高”结果。计算使用整数毫米与 `BigInt`，不会把未确认建议送入求解。
- Airflow Path 只引用源 PRJ 中已严格解析且属于 `plr_orfc` 或 `plr_leak3` 的既有 flow element；端点来自真实墙上开口的 Zone/室外边界，不从屏幕方向猜测。
- 几何和语义对象共享一个原子撤销/重做历史与同一 `geometry_document.v1` 持久化事务，不建立第二套 reducer、历史或 sidecar 权限。
- 导出使用原生保存对话框，但 WebView 不接收路径。Rust 从当前已持久化文档读取语义草稿，绑定项目与 Revision，调用受控 Python Worker 生成不存在的新 `.prj`，然后核对响应、文件 SHA-256、大小、对象编号、源哈希和上下文新鲜度。
- Python 只修改 Zone、Initial Zone Concentration 与 Airflow Path 的已验证区段，保持其余源字节、新行风格和终止标记；写后用严格读取器重新解析，并保证源文件字节不变。
- 本子集固定 `sketchpad_geometry_written=false`。新增对象不会伪造 Level icon 行、房间多边形、门窗图标、距离或 ContamW 等价布局。
- 导出副本是新的派生模型，不把当前原始 Revision 标记为“已原样导出”，也不替换当前项目。

## 理由

应用语义草稿使建筑绘图、物理输入和 PRJ 文件格式各自保留明确事实来源。固定点整数避免三种语言序列化漂移；新副本和写后重读避免覆盖用户唯一工程；Rust 二次校验防止被篡改或过期的 Worker 结果扩大文件权限。把 SketchPad 写回明确留空，比生成看似可编辑但没有官方证据的图标更符合科研软件的证据要求。

## 后果

- 用户现在可以在真实封闭房间中创建新 Zone，在已验证墙体开口上创建新 Airflow Path，并导出官方 ContamX 可求解的 PRJ 副本。
- 导出的新对象具有数值语义，但不会自动在 ContamW SketchPad 中出现等价建筑平面图；该限制必须在界面和证据中持续可见。
- 当前不创作 1D Zone、AHS、duct、control、schedule、污染源、flow element 参数、复杂 Zone 标志或未知条件字段。
- SimRead 是否能读取某个求解结果仍取决于源项目输出设置和现有严格结果解析契约；ContamX 求解通过不能替代 SimRead 结果读取通过。

## 拒绝的方案

- 直接将 Studio 墙体和房间写成 SketchPad 图标：拒绝，因为没有完成可逆格式证明，也会把示意网格冒充真实比例平面图。
- 在前端拼接 PRJ 文本或传入路径：拒绝，因为绕过 Rust 文件权限、原子写入和身份检查。
- 自动创建或调参 flow element：拒绝，因为这属于物理建模决策，不应由开口图形隐式推断。
- 将语义创作另存为 localStorage 或第二套历史：拒绝，因为会产生陈旧身份、撤销分叉和不可审计写入。

## 验证事实

- 官方 `ContamX 3.4.0.3` 对加入 1 个 Zone 和 1 条 Airflow Path 的隔离 `demo1c.prj` 副本求解成功，退出码为 0，并生成 `.sim` 与 `.xlog`；源 fixture SHA-256 前后相同。
- 对 SimRead 的额外探测没有被冒充为通过：`demo1c` 没有节点状态结果，带 contaminant 的 fixture 又触发现有严格解析器的数值空格格式拒绝。
