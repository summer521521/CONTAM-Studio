# Provider 能力矩阵

本矩阵描述当前桌面 Provider 主流程。所有 HTTP Provider 请求都由 Rust 网关发起；前端不接触 API Key，也不直接访问远程端点。

| Provider | 认证/登录 | 对话适配器 | 模型目录 | 默认模型来源 | 手动模型 ID |
| --- | --- | --- | --- | --- | --- |
| Codex | Codex/ChatGPT 登录或设备码；由 Codex App Server 管理 | Codex App Server | App Server 返回的可用模型 | App Server | 不提供 |
| OpenAI | Windows Credential Manager 中的 Platform API Key | OpenAI Responses | 官方 `GET /v1/models`，筛选文本生成/Responses 能力 | 账号实际返回且已验证的模型 | 不提供 |
| Anthropic | Windows Credential Manager 中的 API Key | Anthropic Messages | 官方 `GET /v1/models`，支持分页 | 当前 Messages 适配器可调用的 Claude 模型 | 不提供 |
| Google Gemini | Windows Credential Manager 中的 Gemini API Key | 官方 OpenAI-compatible Chat Completions | 官方 `v1beta/models`，筛选 `generateContent` | 官方返回的友好名称和模型 ID | 不提供 |
| OpenRouter | Windows Credential Manager 中的 API Key | OpenAI-compatible Chat Completions | `/v1/models` | 兼容目录返回的模型 | 不提供 |
| DeepSeek | Windows Credential Manager 中的 API Key | OpenAI-compatible Chat Completions | `/models` | 兼容目录返回的模型 | 不提供 |
| Ollama | 本机回环服务 | OpenAI-compatible Chat Completions | `/v1/models` | 本机服务返回的模型 | 不提供 |
| LM Studio | 本机回环服务 | OpenAI-compatible Chat Completions | `/v1/models` | 本机服务返回的模型 | 不提供 |
| vLLM | 本机回环服务 | OpenAI-compatible Chat Completions | `/v1/models` | 本机服务返回的模型 | 不提供 |
| 自定义 Provider | 用户选择的 API Key 或无认证 | OpenAI-compatible Chat Completions | 首先尝试 `/v1/models` | 兼容目录返回的模型 | 仅高级设置 |

## 目录状态

Rust 将各 Provider 归一化为 `id`、`display_name`、`provider`、`source`、`capabilities`、`availability`、`fetched_at`、`stale` 和 `verified_for_current_adapter`。默认选择器只展示 `available` 模型；返回结构不完整、能力未知或被筛选的模型进入高级“未经验证”区域，不能自动成为默认模型。

目录元数据缓存于应用本地数据目录的 `ai/providers/model-catalog.json`，有效期 24 小时。缓存不包含 API Key、Authorization Header、问题、回答或原始请求日志。刷新失败时保留上次成功列表并显示过期状态；已选择模型若被新目录移除，则要求用户重新选择。

## 身份边界

Codex 是一个独立的本地 App Server 后端，不是其他 Provider 的代理。OpenAI、Gemini、Anthropic 等使用各自官方 API；CONTAM Studio 不读取或复用 Antigravity、Claude Code 或其他本地 Agent 的登录会话。若其他 Agent 提供了兼容 HTTP API，用户可以在高级设置中显式配置端点和模型。
