# CONTAM Studio 0.2.0

CONTAM Studio 0.2.0 是面向 CONTAM 教学与科研的 Windows x64 桌面更新。本版本把已验收的多 Provider AI 助手纳入正式分发，并修复 0.1.0 安装包依赖开发机源码与 Python `.venv` 的发布阻断问题。

## 主要更新

- 新增 OpenAI Responses、OpenAI-compatible Chat Completions 和 Anthropic Messages 三套受控 HTTP 适配器。
- 提供 OpenAI、Anthropic、Gemini、OpenRouter、DeepSeek、Ollama、LM Studio 和 vLLM Profile 预设、自定义 Profile、模型目录与手动模型回退。
- API Key 只存入 Windows Credential Manager；Profile、前端状态、错误、诊断和 Archive 不保存或回显 Secret。
- 保留 Codex App Server/ChatGPT 登录路径，并增加设备码、OpenAI Platform API Key、取消和退出登录支持。
- HTTP Provider 与 Codex 共用可信上下文预览、结构化只读回答、工具阻断、停止、上下文失效和 Archive v2 边界。
- Python 领域桥改为随应用分发的冻结 one-folder Worker；便携版和安装器不再需要源码仓库、项目 `.venv`、全局 Python 或 PATH。
- Rust 使用 Windows Job Object 管理 Python、ContamX、SimRead、Codex App Server、受控安装器和探测命令的完整进程树。

## 延续的产品能力

- 受支持 PRJ 的语义项目树、安全只读降级和不可变草稿。
- Zone 名称/体积与 FlowPath multiplier 结构化 Patch、Diff、Undo/Redo 和副本导出。
- 官方 ContamX/SimRead 运行、单参数/多参数研究、结果分析与 HTML/PDF/CSV/JSON 报告。
- 附件隔离、用户确认的证据披露、受审批仿真方案和结果解释。
- 中英文、深浅主题、窄窗口和键盘工作流。

## 安装与升级

可选择便携 ZIP、当前用户 NSIS 安装器或 MSI。便携版必须完整解压，不能只复制 `CONTAM-Studio.exe`；`runtime/python-worker` 是必需运行资源。

从 0.1.0 升级前先退出 Studio。安装器和便携包不包含用户 PRJ/SIM/CSV、已配置的官方 ContamX/SimRead、Provider API Key 或 Codex 登录数据，也不会把这些数据写入发布资产。

官方 ContamX 与 SimRead 仍需用户从可信来源单独取得并在 Studio 中配置。联网 AI 仍由用户主动配置、选择 Provider、预览披露内容并发起；不同 Provider 可能产生独立费用。

## 安全与验证边界

- 原始 PRJ 不由 GUI 或 AI 直接覆盖；未知语义保持只读。
- 远程 Provider 只允许 HTTPS；明文 HTTP 仅允许回环地址；不跟随重定向、不启用 Cookie Store。
- 自动验证、真实 Provider/API Key/GUI 用户验收、打包、独立干净机、签名和公开发布证据分别记录，不互相替代。
- 0.2.0 安装包没有 Authenticode 发布者证书，Windows 可能显示“未知发布者”或 SmartScreen 提示。请只从本仓库 GitHub Releases 下载并核对 `SHA256SUMS.txt`。

完整限制见[0.2.0 已知限制](known-limitations-0.2.0.md)，架构决策见[ADR-016](../adr/ADR-016-use-bounded-multi-provider-ai-gateway.md)与[ADR-017](../adr/ADR-017-package-frozen-worker-and-own-windows-process-trees.md)。
