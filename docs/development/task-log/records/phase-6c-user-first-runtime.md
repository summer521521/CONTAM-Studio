# Phase 6C 用户优先官方模型目录、内置 NIST 工具与界面减负

```yaml
task_id: phase-6c-user-first-runtime
phase: Phase 6C
title: 用户优先的官方模型目录、内置 NIST 工具与界面减负
status: completed
record_origin: live
started_at_utc: 2026-07-29T04:02:14.0198376Z
ended_at_utc: 2026-07-29T05:02:46.0698730Z
duration_seconds: 3632.05
base_commit: 6cd3d7a4424a4f4479ab56d2303e9b47531db338
branch: main
task_source: User-provided Phase 6C implementation brief
task_summary: 将现有多 Provider 和官方 ContamX 工作台调整为用户优先、联网增强的运行时，并补齐模型目录、内置工具资源、只读存储透明度和文档证据。
goals:
  - 为 Codex、OpenAI、Anthropic、Gemini 和自定义兼容 Provider 提供统一、可缓存、可离线回退的模型目录边界
  - 为发布资源建立 NIST 官方 ContamX 工具获取、哈希锁定、资源发现和许可说明
  - 减少默认界面中的工程实现细节，同时保留 Diff、确认、风险、错误和无障碍信息
  - 增加只读本地存储统计、用户隐私说明、架构 ADR、当前状态和自动验证
allowed_scope:
  - Phase 6C Rust/Tauri、TypeScript/React、构建资源配置、脚本、自动测试和当前状态文档
  - NIST 官方下载页面核对及 F:\Codex_File\phase-6c-user-first-runtime 下的可重复验证临时产物
forbidden_scope:
  - 真实 API Key、账号、Cookie、WebView 数据库、Credential Manager 内容和真实 AppData
  - 原始 PRJ 直接写入、绕过结构化 Patch/Diff/验证/用户确认、系统设置、全局依赖和版本号
  - 提交、推送、打标签、发布、真实 Provider 请求、GUI 验收和安装包/签名声明
validation:
  - 聚焦测试在开发期间按修改范围运行；实现完成后仅启动一次 scripts\\verify.ps1 -Mode Full；外层工具在120秒时限返回超时，未取得该次脚本的最终退出码，因此不宣称 Full 通过
  - Full 之后仅重跑失败的 Clippy 及必要的 Rust/Windows CI 聚焦检查；修复 3 个 Clippy 阻断后 Clippy、fmt、cargo check、Rust 全测试和 Windows CI 合同均通过
  - git diff --check、Cargo/TypeScript/前端/Provider Mock/工具资源/任务日志契约检查按实际结果记录
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 未读取真实凭据或真实用户 AppData；未提交、推送、打标签或发布。
  - 官方 NIST 下载页于 2026-07-29 重新核对，当前记录仍为 CONTAM 3.4.0.8、ContamX 3.4.0.3 Windows x64 ZIP 及页面所列 SHA-256。
  - 自动化证据：Phase 6C 合同47项、Tauri命令合同63项、数据生命周期7项、前端19个测试文件176项、Rust全测试127通过/1忽略、NIST哈希门禁、Windows CI合同及变异检查、Clippy、fmt和cargo check均已取得通过结果。
  - PHASE-6C-CLOSE-01 已在最终 0.3.0 代码状态下重新取得可审计 Full 证据：61 checks passed，退出码0；初次收口时的 Full 捕获超时和3个Clippy问题已由收口任务解决。
```
