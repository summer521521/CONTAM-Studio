# Phase 6B 多 Provider 只读 AI 助手

```yaml
task_id: phase-6b-multi-provider-ai
phase: Phase 6B
title: 多 Provider 只读 AI 助手、受控 HTTP 网关与 Codex 登录扩展
status: completed
record_origin: live
started_at_utc: 2026-07-28T11:01:42.6385606Z
ended_at_utc: 2026-07-28T12:37:19.2141920Z
duration_seconds: 5736.576
base_commit: 31f4d48194348f4a6e199751b0a32f61d9792389
branch: main
task_source: User-provided Phase 6B implementation brief
task_summary: 在保留现有 Codex 只读安全边界的前提下，增加 Provider Profile、系统凭据边界、OpenAI Responses、OpenAI-compatible、Anthropic Messages 适配器、Codex 登录扩展及统一前端接线。
goals:
  - 实现可验证的多 Provider 配置、模型目录和手动模型回退
  - 由 Rust 受控网络层完成 HTTPS/回环 HTTP、重定向、超时、SSE 和取消边界
  - 保留可信上下文、结构化回答、工具阻断、档案和 Patch 审阅边界
  - 完成前后端命令、权限、契约、文档、测试和最终 Full 验证
allowed_scope:
  - Phase 6B Rust AI Provider 模块、Codex 认证扩展、受控 Tauri 命令、ACL、契约和自动测试
  - 现有 AI 前端状态、控制器、面板、本地化、样式和相关架构/验证文档
forbidden_scope:
  - 真实凭据、Codex 认证文件、真实付费 API、通用 OAuth、Cookie、Shell、MCP、工具执行、自动写 PRJ、系统设置和全局依赖
  - 原始实现阶段不含提交、推送和发布；用户在验收通过后另行授权交付，交付动作不得改写自动、GUI、真实 Provider、打包、签名和发布的证据边界
validation:
  - 最终 Full 门禁于 2026-07-28T12:37:19.2141920Z 通过；QA-01 共 58 项检查通过
  - 本轮 UAT GUI 缺陷批修后的定向前端回归通过；2 个测试文件、51 项测试通过；随后唯一一次修复后 Full 仍为 QA-01 58 项检查通过，前端 175 项测试通过
delivery_status: included_in_current_main_commit
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 未读取真实 Credential Manager、Codex 认证文件或用户 PRJ/SIM/CSV/真实 AppData。
  - Codex 本地执行未读取或调用真实付费 Provider；用户随后明确报告真实 Provider 请求、API Key 配置与真实 AI 回答全部验收成功；本记录随当前 main 交付提交纳入，安装包、签名和产品发布状态仍独立记录。
  - 定向证据包含前端30项测试、Provider Rust 15项、Codex/Archive Rust 50项、Tauri命令/authority/数据生命周期契约及变异测试、Windows CI契约及变异测试、生产构建和Cargo check。
  - Full 首次运行发现旧 ACL 命令计数和新增 Provider 的 Clippy 告警；修复后最终 Full 通过，未以失败运行作为完成证据。
  - 用户本轮 GUI 问题清单：底部状态栏不应显示 Codex CLI 安装状态；Gemini Provider 不应显示 Codex CLI 版本；Codex 登录与 OpenAI Platform API Key 需要视觉区分；需要说明 Codex App Server 与直接 HTTP Provider 的架构边界，以及其他本地 Agent 登录不自动复用。
  - 上述四项已在同一批中修复；新增 Provider 中立状态、HTTP Provider 隔离 Codex CLI probe、Codex/OpenAI 登录标签和中英文架构说明；定向测试与修复后 Full 通过。
  - 用户于 2026-07-28 完成本轮第二次集中 GUI 复验并回复“ok，全部验收成功”；5 项修复点均通过。用户随后明确报告真实 Provider 请求、API Key 配置与真实 AI 回答等全部验收成功；能力矩阵 manual_gui 和 user_validated 均更新为 passed，具体凭据和逐项 Provider 名单未写入。
```
