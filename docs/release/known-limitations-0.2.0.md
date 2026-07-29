# CONTAM Studio 0.2.0 已知限制

- 只正式支持 Windows 10/11 x64。
- 只处理具有明确兼容证据的 PRJ 语义；不承诺任意 PRJ 的完整解析和无损编辑。
- Schedule 和 Species 参数化保持安全只读，并返回 `unsupported_parameter`；未知或不能可靠回写的对象保持只读。
- 官方 ContamX/SimRead 需要用户单独配置，不随 Studio 安装器分发。
- 联网 AI 由用户主动启用；服务可用性、模型能力、配额、价格、地区、账户政策和数据处理条款由对应 Provider 决定。
- 除 Codex App Server 支持的登录方式外，HTTP Provider 使用用户配置的 API Key 或无认证本地端点；不提供通用 OAuth、浏览器 Cookie 或其他本地 Agent 登录复用。
- OpenAI-compatible 端点的模型目录和错误格式并不完全统一；目录失败时可手动输入合法模型 ID，但该模型在成功请求前显示为未验证。
- 图片只进入本地预览和受控元数据证据；0.2.0 不宣称向远程模型发送附件像素。
- AI 不能任意编辑 PRJ。对草稿的影响仍限于结构化 Patch、Diff、确定性验证、哈希绑定批准和用户确认。
- 便携版必须保留完整目录；单独复制主 EXE 会缺失冻结 Python Worker。
- 不提供后台自动更新、云同步、多用户协作、插件 SDK、macOS 或 Linux 发行。
- 本版本的自动内容审计和本机隔离安装/卸载不能等同于另一台全新 Windows 的独立人工执行证据；该状态在发布清单中单独记录。
- 安装包没有 Authenticode 发布者签名。GitHub 提供的来源/证明记录和 SHA-256 可用于核验资产身份与完整性，但不能消除 Windows“未知发布者”或 SmartScreen 提示。
