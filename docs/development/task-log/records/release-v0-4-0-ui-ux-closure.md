# Release 0.4.0：Phase 7 用户体验收口与公开发布

```yaml
task_id: release-v0-4-0-ui-ux-closure
phase: Release 0.4.0
title: Phase 7 User-first Workbench Release Closure
status: in_progress
record_origin: live
started_at_utc: 2026-07-30T07:16:27.8721640Z
ended_at_utc: null
duration_seconds: null
base_commit: bf5287488db0dac2e9fc7164efb6dc676e41d425
branch: main
task_source: 用户明确授权提交、推送并发布最近完成的 Phase 7 更新
task_summary: 将已完成 GUI 验收的 Phase 7A/7B 工作台改造统一升级为 v0.4.0，完成最终自动验证、源码提交、Windows 发布资产构建、审计、标签与 GitHub Release。
goals:
  - 统一 package、Python、Cargo 和 Tauri 的 0.4.0 版本
  - 对最终代码状态运行一次 Full 与发布合同检查
  - 提交并推送 main，构建新的 Portable、NSIS 和 MSI
  - 核验冻结 Worker、官方 CONTAM 资源、清单、哈希和敏感内容扫描
  - 创建 v0.4.0 标签并发布 GitHub Release
allowed_scope:
  - 当前工作树内 Phase 7A/7B、UAT 案例、版本元数据、发布文档和任务日志
  - 受控发布脚本、外部发布产物目录、Git 提交与推送、GitHub 标签与 Release
forbidden_scope:
  - 读取真实凭据、Credential Manager、Cookie、WebView 数据库或真实 AppData
  - 发起真实 Provider 请求或保存真实账号、密钥、请求和回答
  - 伪造代码签名、干净机、精确缩放或未执行的验收状态
validation:
  - final Full：仅启动一次并自然结束；外层工具超时后未捕获最终退出码和 QA-01 汇总，已观察其依次执行至 Python、前端、Rust、Windows CI 变异、生产构建和 Clippy/Cargo 阶段，不将其虚构为 QA-01 passed
  - focused final gate：前端 182/182、Python 345/345、Rust 129 passed + 1 ignored、前端生产构建、cargo check --locked、综合案例合同、任务日志合同 80 条、release metadata 和 git diff --check 均通过
  - release metadata：package、Python、Cargo 与 Tauri 均为 0.4.0
  - source commit and push：pending
  - portable/NSIS/MSI build and audit：pending
  - GitHub Release：pending
delivery_status: in_progress
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - v0.3.0 发布说明和历史证据保持不变，本任务新增 v0.4.0 发布资料。
  - Phase 7B 真实 GUI 已通过；精确显示缩放矩阵、真实 Provider、签名和独立干净机仍按真实执行状态记录。
```
