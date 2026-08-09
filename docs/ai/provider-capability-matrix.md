# Provider 能力矩阵

本矩阵描述当前桌面 Provider 主流程。所有 HTTP Provider 请求都由 Rust 网关发起；前端不接触 API Key，也不直接访问远程端点。

| Provider | 认证/登录 | 对话适配器 | 模型目录 | 默认模型来源 | 手动模型 ID |
| --- | --- | --- | --- | --- | --- |
| Codex | Codex/ChatGPT 登录或设备码；由 Codex App Server 管理 | Codex App Server | App Server 返回的可用模型 | App Server | 不提供 |
| OpenAI | Windows Credential Manager 中的 Platform API Key | OpenAI Responses | 官方 `GET /v1/models` 与本地版本化官方能力清单的交集 | 账号实际返回、且文档确认支持 Responses + Streaming + Structured Outputs 的模型 | 不提供 |
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

OpenAI Responses 的模型能力策略版本为 `openai.responses.structured_outputs.v1`，默认拒绝未知模型，只接受官方文档同时确认 Responses、Streaming 和 Structured Outputs 的精确模型 ID，再与账号本次 `/v1/models` 返回结果取交集。`/v1/models` 只能证明模型存在且当前账号可访问，不能证明这些适配器能力；例如 GPT-5.2 Pro 的官方模型页将 Structured outputs 标为不支持，因此其别名和快照不会进入可选列表。能力清单核对日期：2026-08-09。依据页面：[GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)、[GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)、[GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)、[GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2)、[GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1)、[GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o)、[GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini) 和 [GPT-5.2 Pro](https://developers.openai.com/api/docs/models/gpt-5.2-pro)。

目录元数据缓存于应用本地数据目录的 `ai/providers/model-catalog.json`，有效期 24 小时。缓存不包含 API Key、Authorization Header、问题、回答或原始请求日志。刷新失败时保留上次成功列表并显示过期状态；已选择模型若被新目录移除，则要求用户重新选择。

## 身份边界

Codex 是一个独立的本地 App Server 后端，不是其他 Provider 的代理。OpenAI、Gemini、Anthropic 等使用各自官方 API；CONTAM Studio 不读取或复用 Antigravity、Claude Code 或其他本地 Agent 的登录会话。若其他 Agent 提供了兼容 HTTP API，用户可以在高级设置中显式配置端点和模型。
