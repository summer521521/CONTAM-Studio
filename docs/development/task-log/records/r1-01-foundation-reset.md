# R1-01 Foundation Reset

```yaml
task_id: r1-01-foundation-reset
phase: Renewal R1
title: Foundation Reset——Windows CI、研发治理与前端基础重置
status: completed
record_origin: live
started_at_utc: 2026-08-01T09:03:44Z
ended_at_utc: 2026-08-01T09:34:05Z
duration_seconds: 1821
base_commit: 4aa64c507ecf730b79c77aec31ae8474717c37b5
branch: main
task_source: 用户提供的 R1-01 Foundation Reset 任务书
task_summary: 修复 Windows CI 可移植性、建立 Renewal R1 当前事实源，并在保持领域安全边界的前提下拆分前端工作台基础结构。
goals:
  - 消除脚本对 F:\\Codex_File\\phase-6c 临时目录和历史产品版本的硬编码依赖
  - 建立唯一的 Renewal R1 当前执行入口并清晰归档旧路线图
  - 在不改变行为和安全边界的前提下拆分 App、样式层、设计令牌和最小基础组件
allowed_scope:
  - Windows CI 脚本、契约测试和版本一致性检查
  - R1 治理文档、README、AGENTS、任务日志和能力状态导航
  - React/Tauri 前端编排结构、CSS 分层、语义设计令牌和基础 UI 组件
  - 本轮聚焦测试、Full 自动验证和 F:\\Codex_File 下的临时证据
forbidden_scope:
  - 真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 和用户唯一工程
  - 官方 ContamX 求解器重写、最终空间画布、R1-02 至 R1-05 功能
  - 新增非必要运行时依赖、Computer Use、截图验收、打包、签名、发布、提交和推送
validation:
  - 已记录基准：main 与 origin/main 均为 4aa64c507ecf730b79c77aec31ae8474717c37b5，工作树干净，产品版本为 0.4.0
  - 聚焦：Python pytest 345 passed、Ruff passed；前端 pnpm test 为 22 个测试文件/184 tests passed；Rust cargo test --locked 为 129 passed、1 ignored；cargo fmt、Clippy、Cargo check、pnpm build 通过。
  - 聚焦合同：Windows CI、临时根、版本/发布元数据、Phase 6C、R1-01 foundation（40 assertions）、任务日志和综合验证夹具合同通过；综合夹具为 3 个项目、3-operation Patch、6 个附件、完整校验和。
  - Fast：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\verify.ps1 -Mode Fast`，QA-01 57 checks passed。
  - 最终 Full：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\verify.ps1 -Mode Full`，QA-01 63 checks passed，退出码 0；完整日志为 `F:\\Codex_File\\r1-01-foundation-reset\\full-verification.log`，日志末尾记录 `FINAL_EXIT_CODE=0`。
  - `git diff --check` 通过；仅有 Git 的 LF/CRLF 转换提示，无 diff 语法错误。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 接手前没有未提交工作树修改；本轮修改必须保留在当前工作树且不得提交或推送。
  - 未读取真实凭据、真实 AppData 或真实用户唯一工程；GUI、真实 Provider、GitHub Windows CI、打包、签名和发布不在本轮自动验证中。
  - automated_verified=passed；github_windows_ci=pending_push；manual_gui=not_run；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run。
  - 本轮未提交、未推送、未打标签、未打包、未签名、未发布；修改保留在当前工作树，等待总监审查。
```
