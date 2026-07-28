# ADR-016：采用受控多 Provider 只读 AI Gateway

- 状态：已接受
- 日期：2026-07-28
- 范围：Phase 6B

## 背景

Phase 6A 已用 Rust 持有的可信上下文、只读结构化回答和本地可选档案接通 Codex App Server。继续增加 Provider 时，不能让 React 直接拥有网络、文件、凭据或模型协议权限，也不能因为新增 HTTP Provider 而绕过原有的预览、工具阻断、停止和档案边界。

## 决策

在 Rust 中增加统一的 Provider Profile、Credential Store、受控 HTTP Client 和显式协议分发器：

- 保留 Codex App Server 作为 `codex_app_server` Profile，并通过官方 `account/login/start` 支持 ChatGPT 设备码和 OpenAI Platform API Key，支持取消、退出登录和账号刷新。
- 使用 OpenAI Responses、OpenAI-compatible Chat Completions、Anthropic Messages 三个固定适配器。Gemini、OpenRouter、DeepSeek、Ollama、LM Studio 和 vLLM 只作为稳定端点/协议预设，不硬编码模型目录。
- Profile JSON 只保存非敏感元数据；API Key 由 Windows Credential Manager（Rust `keyring`）保存，系统凭据不可用时 fail closed，不使用明文文件、localStorage、环境变量或自制加密回退。
- 所有 HTTP 请求经过单一 `reqwest` Client：不跟随重定向、不启用 Cookie Store，远程只允许 HTTPS，本机明文只允许 `127.0.0.1`、`localhost` 和 `[::1]`，并设置连接、响应、SSE 事件、总大小、空闲和取消边界。
- HTTP Provider 与 Codex 共用现有可信上下文、结构化回答校验、只读工具阻断、预览/Turn Generation Guard 和本地档案。档案 v2 保存 Provider 的不可变显示快照，不保存 Secret、Header、原始响应或路径。
- React 只通过 Tauri 命令进行 Profile、模型、登录和 Turn 操作；Tauri capability 不开放通用 HTTP、Shell、Opener、远程 URL 或全局文件系统权限。

## 理由

- 协议种类固定、显式 `enum + match` 便于审计，并避免把 Provider 逻辑散落在界面或通用插件中。
- 同一个可信上下文和写入边界可继续保护 CONTAM PRJ、草稿、运行和结果；AI 只能解释，不能直接写原始工程。
- Credential Manager 与短生命周期 `zeroize` 值把 Secret 从普通配置、错误、日志、档案和前端状态中隔离出来。
- 本机 Provider 可用于本地服务，远程 Provider 的目标 Origin 和费用风险在发送前披露；Provider/模型/配置修订变化会使旧预览和会话失效。

## 后果

- 远程 Provider 会把用户确认的结构化上下文发送到目标服务，可能产生独立费用；默认不自动测试连接、不自动刷新远程模型目录、不自动发送上下文。
- 真实 API、真实账户、真实本地模型服务和 GUI 验收不属于自动测试证据，不能由 Mock 或契约测试推断；它们只可依据独立用户验收更新，当前结果以能力矩阵和 Phase 6B 验证记录为准。
- OpenAI-compatible 预设不能保证所有供应商的模型能力或错误格式；目录失败时只允许合法手动模型 ID，并显示未验证提示。
- Profile JSON 和 Archive 都需要版本迁移及失败保护；配置和 Secret 更新会提升修订号并清空绑定的预览、历史和活动会话。

## 替代方案

- 让 WebView 直接调用 `fetch`：会扩大网络、凭据和重定向边界，拒绝。
- 为每个供应商引入独立第三方 SDK：增加依赖、许可证和打包成本，且不需要固定协议切片，拒绝。
- 复制 Cherry Studio 的 Provider 实现：社区版为 AGPL-3.0，本项目只采用 Provider 分层思想，不复制代码、注释或包装器，拒绝。
- 把 API Key 回退保存到 JSON、注册表或环境变量：违反凭据边界，拒绝。

## 来源与许可

Codex 登录协议以 [OpenAI Codex App Server 文档](https://developers.openai.com/codex/app-server/) 为准；OpenAI Responses、Gemini OpenAI compatibility、Anthropic Messages、OpenRouter 和 DeepSeek 的端点由各自官方文档核对。CONTAM Studio 独立实现客户端，不复制上游实现代码。新增 Rust 依赖和许可证边界记录在 [许可策略](../licensing/licensing-strategy.md) 与 [第三方声明](../../THIRD_PARTY_NOTICES.md)。
