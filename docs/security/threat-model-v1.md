# CONTAM Studio v1 威胁模型候选

## 资产与信任边界

| 资产 | 保护目标 | 边界 |
| --- | --- | --- |
| 用户原始 PRJ/CSV/SIM | 不覆盖、不泄露、可追溯 | 原生选择器与 Rust 主机；Python 只读快照 |
| Studio-owned Revision/Run/Result | 哈希、归属、恢复 | OwnedArtifactStore 与 commit-last 清单 |
| 官方 ContamX/SimRead | 身份、参数、输出证据 | ToolRegistry 与受控进程 Lease |
| Provider 模型目录与 API Key | 不混淆身份、不泄露密钥 | Rust 网关、Credential Manager、非敏感 TTL 缓存 |
| 应用本地数据目录 | 用户证据可见、统计范围受控 | Rust 白名单统计命令、WebView 不直接遍历 |
| Attachment/AI 证据 | 有界披露、无主动内容 | Quarantine、EvidenceBundle、批准 Broker |
| WebView 命令 | 最小权限、不可伪造 | Tauri ACL、Rust 重绑定稳定 ID |

## 攻击者与入口

假设攻击者可以提供恶意 PRJ、ZIP、PDF、Office、CSV、日志、伪造结果清单或提示注入文本；不能假设攻击者拥有凭据、系统管理员权限或正式项目目录写权限。入口包括原生文件选择、导入副本、受控工具路径、WebView payload、App Server 事件和恢复清单。

## 主要缓解

- 路径全部由 Rust/显式选择拥有；WebView、AI 和 Python 返回值不提供路径、Shell、原始 PRJ 或任意查询。
- PRJ 未知语法只读，Patch 绑定基线哈希、稳定对象、Diff、前置条件和单次批准；源文件不可写。
- ZIP 先枚举后处理，拒绝遍历、大小写碰撞、加密、符号链接、可执行文件和压缩炸弹。
- PDF/Office 不执行 JavaScript、宏、公式、嵌入文件或外链；CSV 公式仅作为不可信文本。
- 工具替换、进程清理不明、结果网格不兼容、审批过期和引用失效均 fail-closed。
- NIST 工具只接受官方 HTTPS 来源；构建期先验证 ZIP SHA-256，运行期再验证每个内置文件哈希，锁定清单不允许未知资源静默进入发布输入。
- Provider 模型目录只通过 Rust 网关请求。OpenAI、Anthropic、Gemini 的能力筛选在 Rust 完成；内置 Provider 不接受自由模型 ID，未知模型只能进入不可默认选择的高级区域。
- 空间模型只接受 Python 严格解析的 `spatial_projection.v1`。Rust 拒绝未知字段、超限 payload、错误 identity/source/revision、重复稳定 ID、bounds 不一致和悬空 Zone/FlowPath binding；unknown icon 保留原类型但不赋予未经验证的语义。
- SketchPad 不从 Zone 体积推导几何，不把网格列行解释成物理长度；拓扑布局按稳定语义排序，不使用随机力导向或将边长解释为空间距离。Konva 仅提供只读绘制，selection 回到现有语义 reducer，避免画布形成第二条写入路径。
- 多 Zone 结果只由 Rust 通过既有 SimRead 链路生成，并绑定 project session、source hash、Revision、run、manifest 和 extraction identity。Zone、样本和 payload 有明确上限；取消和 late response 不能覆盖当前结果，身份不匹配不能降级为 partial。
- Evidence Lineage 只消费受控状态和安全短身份，不读取任意 manifest 或显示绝对路径；链路不完整时不能宣称完整验证。AI Context Receipt 明确排除凭据、绝对路径、原始 PRJ 和完整结果序列，dataset fingerprint、指标或时刻不匹配时 fail-closed。
- AI 意图不扩大权限。AI 建议只进入已有 Semantic Patch Review、Diff、确定性验证和用户确认；结果图、空间画布和助手均不能直接写 PRJ。
- 几何读图是单独的显式披露：只有用户选中的 Studio 隔离 PNG/JPEG、重新校验的哈希/大小/签名和一次性 `localImage` 会进入 Codex Luna。模型只可返回封闭的加法几何草案；项目/Revision/几何/附件绑定、工具阻断、本地预览和第二次用户确认任一失败都整体丢弃，图片路径和像素不返回 WebView。
- Studio metric 几何只进入 Rust 固定管理的 `<app-local-data>/geometry-documents`。文件名来自已验证 PRJ 基线 SHA-256，WebView 不能提供路径；严格信封、payload 上限、canonical hash、文档修订、进程内写入串行化、临时文件、写后重读和一代有效备份共同阻止路径注入、部分写入、并发覆盖和损坏主文件取代恢复证据。项目 session、source hash 或 Revision 改变后，迟到 load/save 被拒绝。
- 建筑底图只允许通过原生对话框导入 PNG、JPEG 或 PDF，并先进入既有附件隔离检查。Rust 使用基线 SHA-256 和 UUID 资源 ID 固定构造 `<app-local-data>/geometry-underlays` 路径；WebView 不能传入路径。导入、读取和几何保存都核验项目 session、Revision、目录边界、普通文件、大小、魔数和 SHA-256。PDF.js 只接收 Rust 返回的有界字节并在本地渲染指定页面，不读取任意 URL。
- 底图进入附件中心时固定 `selected_by_user=false`。导入、显示或校准均不构成联网披露；只有用户另行选择图片、查看 AI 边界并触发几何草案，既有原生授权、哈希绑定、本地验证和二次确认才允许像素进入 Codex。
- 墙上和跨层 FlowPath 锚点不能只凭前端几何关系保存。Rust 只在一次成功且仍属于当前 project session、Revision、identity 与 source hash 的语义读取后保留内存证据；保存时重新解析语义 Zone 编号和 FlowPath `from/to`，要求与开口的室内双 Zone 或 exterior Zone—outdoor 边界完全一致。缺少当前证据、重复身份、未知端点或不一致绑定均 fail-closed，语义快照不写入几何文档。
- Studio 到 SketchPad 的候选投影固定为有损且不可直接应用；它只读取同一身份下已绑定 Zone 图标并检测最终单元碰撞，预览本身不调用 PRJ Patch planner。用户显式审查后，独立准备边界再次校验 session/source/identity/Revision、ID、非负坐标、变化标记、重复目标、最终单元和 128 操作上限，再只生成已验证的既有图标 column/row 操作。精确 Diff 与第二次用户确认缺一不可；项目切换后的迟到 plan/apply 响应被拒绝。恶意或陈旧几何不能借预览扩大为新增、删除、改类型、跨 Level 或直接写原始 PRJ 的权限。
- 新建 CONTAM Zone/Airflow Path 先进入与 `geometry_document.v1` 同事务保存的 `contam_semantic_draft.v1`，不直接写 PRJ。导出命令不接受前端路径；Rust 通过原生对话框选择不存在的新 `.prj`，重新加载当前持久化语义草稿并绑定 session、identity、source hash 与 Revision。Python Worker 只能编辑已验证的 Zone、Initial Zone Concentration 与 Flow Path 区段；Rust 再核对返回字段、对象 ID/编号、文件 SHA-256/大小、源未变化及草稿未过期。失败后只删除哈希与大小均匹配的本次输出，防止竞态删除他人文件。`sketchpad_geometry_written` 必须为 false，恶意 Worker 不能借“语义导出”宣称或写入未验证的 ContamW 建筑几何。
- 模型缓存只包含目录元数据并带 TTL/过期标记。Credential Manager 中的 API Key 不进入 Profile、Archive、日志、目录缓存或前端状态；重定向、非白名单端点、超限响应、401/403/429 和超时均由统一 HTTP 边界拒绝或结构化报告。
- 本地数据统计只访问明确白名单类别，使用符号链接元数据跳过链接，不读取正文，不提供删除按钮；项目草稿、运行记录、研究任务和报告不因统计功能被删除或覆盖。

## 残余风险与证据边界

真实 Windows Job Object、官方工具输出、App Server 版本协议、安装包内置资源、Office/PDF 视觉渲染、第三方渗透测试和用户研究尚未在本隔离环境完成，统一标为 `pending_final_acceptance`。本文是候选安全结论，不是第三方渗透测试或发布批准。

## 事件恢复

1. 进程状态为 `unknown_cleanup` 时保留证据并禁止新运行，重启后复核 Lease。
2. 清单哈希不匹配时进入 recovery/read-only，不自动删除唯一证据。
3. 附件解析失败只删除 Studio-owned quarantine 副本，不触碰外部来源。
4. AI Trace/历史损坏时停止回放，保留原始审计清单并允许用户显式删除。
5. Studio 几何主文档损坏时只恢复通过完整合同和哈希验证的一代备份；主文件与备份均无效时停止恢复并显示错误，不创建空模型覆盖证据。
