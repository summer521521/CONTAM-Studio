# Phase 6B 多 Provider 只读 AI 验证

## 验证边界

本记录区分 Codex 自动执行证据与用户随后提供的真实验收结论。Codex 自动执行只收录本地代码、Mock Server、契约和定向自动测试证据；执行期间未读取真实 Credential Manager、Codex 认证文件、用户 PRJ/SIM/CSV/AppData，未使用真实 API Key，也未调用真实付费 Provider。用户随后报告真实 Provider 请求、真实 API Key 配置与使用、真实 AI 回答和 GUI 验收通过；本记录只保存聚合结论，不保存凭据、账号或请求/响应内容。安装包、干净机、签名和发布仍未执行或未验收。

## 已执行的定向验证

| 类别 | 命令/证据 | 结果 |
|---|---|---|
| 前端回归 | `pnpm test -- src/app/ai-state.test.tsx src/app/desktop-api.test.ts` | 通过；30 tests |
| 前端全量 | `pnpm test`（Full 门禁内） | 通过；19 files / 173 tests |
| 前端构建 | `pnpm build` | 通过；`tsc -b` 和 Vite production build |
| Provider Rust | `cargo test --manifest-path src-tauri/Cargo.toml --locked ai_provider -- --nocapture` | 通过；15/15 |
| Codex/Archive Rust | `cargo test --manifest-path src-tauri/Cargo.toml --locked codex_app_server -- --nocapture` | 通过；50/50 |
| Rust 编译 | `cargo check --manifest-path src-tauri/Cargo.toml --locked` | 通过；仅保留 Windows linker 信息提示 |
| 命令契约 | `node scripts/tests/test-tauri-command-contract.mjs --strict-generated-permissions` | 通过；62 commands |
| Rust authority | `node scripts/tests/test-rust-authority-contract.mjs .` | 通过；4 Rust files / 8 process registrations |
| 数据生命周期 | `node scripts/tests/test-data-lifecycle-contract.mjs .` | 通过；7 declarations |
| Tauri 命令变异 | `node scripts/tests/test-tauri-command-contract-mutations.mjs` | 通过；6 mutations |
| Rust authority 变异 | `node scripts/tests/test-rust-authority-contract-mutations.mjs` | 通过；5 mutation groups |
| 数据生命周期变异 | `node scripts/tests/test-data-lifecycle-contract-mutations.mjs` | 通过；4 mutation groups |
| Windows CI 契约 | `powershell.exe -NoProfile -File scripts/tests/test-windows-ci-contract.ps1` 及 `test-windows-ci-contract-mutations.ps1` | 通过；基础契约及12项变异 |
| 工作树安全检查 | `cargo fmt --all -- --check`、`git diff --check`、能力矩阵 JSON 解析 | 通过 |
| 敏感模式扫描 | `rg` 扫描仓库内 credential-shaped 模式，并排除测试哨兵/构建输出 | 通过；生产路径无匹配，测试中仅有明确的非真实哨兵 |
| 本轮 GUI 缺陷修复定向回归 | `pnpm exec vitest run src/app/ai-state.test.tsx src/components/workbench/project-components.test.tsx` | 通过；2 files / 51 tests |

Provider Mock 覆盖 OpenAI Responses、OpenAI-compatible Chat Completions、Anthropic Messages 的本地 HTTP 闭环，分别验证 Bearer、无认证和 `x-api-key`/`anthropic-version`，并验证结构化回答、Token usage、SSE 分片、工具调用拒绝、URL 策略、目录模型和 Secret 不进入 View。Codex 回归覆盖 `apiKey` 账号模式、设备码安全字段、空闲账号通知边界和 Archive v1→v2 迁移。

## 最终门

按照任务书，所有实现和定向修复完成后执行最终 Full 门禁：

```powershell
powershell -NoProfile -File scripts/verify.ps1 -Mode Full
```

首次 Full 运行发现旧 ACL 计数断言仍为 53，以及新增 Provider 代码的 6 个 Clippy 告警；修复后重新执行的最终 Full 于 `2026-07-28T12:37:19.2141920Z` 通过，耗时约 `5736.576` 秒，QA-01 报告 `58 checks passed`。最终 Full 包含 Python 345/345、前端 173/173、Rust 118 passed/1 ignored、Windows CI 契约及变异、生产构建、Rust fmt、Clippy、Cargo check；`git diff --check` 通过，锁文件变更由对应依赖清单配对校验通过。敏感信息检查只发现测试用非真实哨兵字符串和字段名，未读取或发现真实凭据；能力矩阵已同步为自动验证 `passed`。该自动门禁结束时，GUI 和真实 Provider/账户/服务尚未纳入自动证据；后续用户验收结论见下文。安装包、干净机、签名和发布仍为 `not_run` 或未验证。

## 本轮 UAT GUI 反馈与最终状态

用户启动本机开发窗口并提供了 Provider 面板截图和一轮集中反馈。本轮完整问题清单如下：

1. 右下角状态栏以 Codex CLI 为中心，显示“Codex CLI 已安装”等 Provider 无关信息。
2. 选择 Google Gemini 时，Provider 可用卡片仍显示 Codex CLI 版本。
3. Codex 登录与 OpenAI Platform API Key 在视觉上区分不够明确。
4. 界面没有明确说明 Codex 是独立的 App Server 后端，而其他 Provider 是直接 HTTP API 接入；也没有说明其他本地 Agent 的登录会话不会自动复用。

已在同一批修改中处理：

- 底部状态栏改为 `AI：Provider · 通用状态`，不再显示 Codex CLI 安装状态。
- HTTP Provider 不再读取或显示 Codex CLI probe；Codex 专用 CLI 信息只保留在 Codex 路径的面板内。
- Provider 下拉项明确标注 `Codex（ChatGPT/Codex登录）` 与 `OpenAI（Platform API Key直连）`；Codex 认证区明确标注 Codex 登录。
- 增加中英文架构说明，明确 Codex App Server、直接 HTTP Provider、API 路径和其他本地 Agent 登录不自动复用的边界。

修复后的最终 Full 门禁再次通过：QA-01 `58 checks passed`；Python `345 passed`；前端 `19 files / 175 tests passed`；Rust `118 passed / 1 ignored`；生产构建、Rust fmt、Clippy、Cargo check、Windows CI 契约和 `git diff --check` 均通过。

修复批次最初状态为 `automated_fix_complete_pending_user`；第二次集中 GUI 复验后，本轮代表性 GUI 状态更新为 `manual_gui=passed`。用户随后补充真实 Provider 请求、API Key 配置与使用及真实 AI 回答的聚合验收结论，最终状态更新为 `user_validated=passed`。具体 Provider/协议覆盖未逐项留存；安装包、干净机、签名和发布仍未验证。

## 第二次集中 GUI 复验

复验日期：2026-07-28。用户在当前修复后的原生开发窗口中完成了本轮 5 项集中复核，并回复“ok，全部验收成功”。复验结果为通过：

- Gemini、OpenRouter 状态栏不再以 Codex CLI 为中心。
- Gemini Provider 状态卡不再显示 Codex CLI 版本。
- Codex 登录与 OpenAI Platform API Key 直连标签已能区分。
- Codex App Server、HTTP Provider 和其他本地 Agent 登录不自动复用的说明已显示。
- 切回 Codex 后，认证区显示 Codex 登录，用户未提交任何凭据给本记录。

本结果属于代表性 GUI 复验；随后用户补充报告真实 Provider 请求、真实 AI 回答和真实 Key 处理均已验收成功。完整 A-J UAT 细节和发布验收证据仍未逐项留存。

## 用户提供的真实 Provider 验收结果

验收日期：2026-07-28。用户明确报告“真实 Provider 请求、真实 API Key、真实 AI 回答等全部验收成功”。本记录只保存聚合结论，不保存 Provider 账号、Key、验证码、邮箱、请求内容或响应内容：

- 真实 Provider 请求：用户报告通过。
- 真实 API Key 配置与使用：用户报告通过；本记录未读取或展示 Key。
- 真实 AI 回答：用户报告通过。

依据用户提供的最终验收结果，能力矩阵更新为 `manual_gui=passed`、`user_validated=passed`。具体 Provider 名称、协议逐项清单和费用明细未写入本记录，避免引入敏感信息；该状态基于用户的聚合性验收声明。

## 尚未逐项留存的证据

- 具体 Provider 名称、协议覆盖、费用和账户状态未写入本记录。
- Windows 打包、安装、干净机、签名和发布仍未验收。

## 0.2.0 发布关联

Phase 6B 已随提交 `7500aff68a78ef4c1807b2ce79e5f5f68325717b` 纳入稳定版 `v0.2.0`。便携 ZIP、NSIS 和 MSI 已生成、发布、回下载并通过 SHA-256 校验，GitHub Release 资产证明工作流通过；安装器仍为未签名构建，独立干净 Windows 安装与本机安装均未执行。本节只更新交付状态，不改写上文 Phase 6B 原始自动测试和用户真实 Provider/GUI 验收证据。
