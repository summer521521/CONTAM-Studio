# Windows CI Cross-environment Contract Portability Fix

```yaml
task_id: windows-ci-cross-environment-contract-portability
phase: Geometry Workbench
title: Windows CI Cross-environment Contract Portability Fix：跨环境合同可移植性修正
status: completed
record_origin: live
started_at_utc: 2026-08-21T03:55:43Z
ended_at_utc: 2026-08-21T03:57:01Z
duration_seconds: 78
base_commit: b54b12f7a1db2bb5dcba732eadf83f185ab128ca
branch: main
task_source: 用户要求修复提交 b54b12f7a1db2bb5dcba732eadf83f185ab128ca 在 GitHub Windows CI 中暴露的 CRLF 合同和私有证据链接问题，并推送后等待精确提交的 Windows CI。
task_summary: 只修正 SimRead 合同的跨换行格式匹配和浏览器验收日志的本机私有证据引用，不改变 Geometry Workbench 产品实现。
goals:
  - 使 SimRead 任务状态合同兼容 LF、CRLF、文件开头和无末尾换行场景
  - 从可移植仓库文档中移除私有本机 file URL 证据链接和绝对路径
  - 运行聚焦合同、Docs、任务日志合同和差异检查
  - 创建后续提交、推送 main 并等待精确提交对应的 Windows CI
allowed_scope:
  - scripts/tests/test-simread-official-output-compatibility-contract.mjs
  - docs/development/task-log/records/geometry-workbench-background-browser-acceptance.md
  - 本任务日志、任务日志索引及合同要求的最小事实同步
forbidden_scope:
  - Geometry Workbench 产品实现、TypeScript、Rust、Python、Tauri 权限、package lock、verify.ps1、GUI、浏览器截图、真实 Provider、真实凭据、真实 AppData、用户工程、打包、签名和发布
validation:
  - SimRead 官方输出兼容性聚焦合同
  - 浏览器任务日志私有路径搜索
  - scripts\\verify.ps1 -Mode Docs
  - scripts\\tests\\test-task-log-contract.ps1
  - git diff --check 和 git diff --cached --check
  - 精确提交对应的 GitHub Windows CI
delivery_status: pending_windows_ci
token_usage: unavailable
notes: 首次失败 CI 为 run 32365671787；失败事实保持不变。SimRead 合同聚焦验证 15 assertions、Docs 60 checks、任务日志合同 111 records 和 git diff --check 均通过。修复提交前 github_windows_ci=pending_push；本任务不运行本地 Full，不修改 Geometry 功能，不复制私有证据进仓库。
```

## 基线与根因

- 基线 HEAD、分支与 `origin/main` 均为 `b54b12f7a1db2bb5dcba732eadf83f185ab128ca`，工作树干净。
- 首次失败 Windows CI：[run 32365671787](https://github.com/summer521521/CONTAM-Studio/actions/runs/32365671787)，其 `Full verification` job 为 `96414526067`。
- SimRead 合同原先只匹配 LF 换行；Windows checkout 的 CRLF 使合法的 `status: completed` 被拒绝。
- 浏览器验收日志包含只能在本机存在的私有 `file:///` 链接，远程 runner 无法解析这些本地证据。

## 修正

- 使用明确的 `(?:^|\\r?\\n)` 与 `(?:\\r?\\n|$)` 边界正则，保留原有状态语义，不放宽为任意文本包含。
- 增加 CRLF 和无末尾换行回归断言。
- 浏览器验收日志保留私有证据事实、文件名和 20 张截图事实，但不再写入绝对路径或 `file:///` 链接。
- 未复制私有验收证据到仓库；未修改 `browser_design_qa=passed`。

## 验证与交付

## 收口记录

- 聚焦 SimRead 合同退出码 0，15 assertions passed；新增 LF/CRLF、文件开头和无末尾换行回归覆盖。
- 私有证据路径搜索退出码 0，浏览器验收日志中的本机 file URL 和绝对路径均为 0 命中。
- `scripts\\verify.ps1 -Mode Docs` 退出码 0，`QA-01 passed: 60 checks passed`。
- `scripts\\tests\\test-task-log-contract.ps1` 退出码 0，111 records 通过；`git diff --check` 退出码 0。
- 首次失败 run 32365671787 没有被改写；提交前 `github_windows_ci=pending_push`。本地 Full 按任务要求未运行，最终 Full 由新提交对应的 Windows CI 承担。
- 未修改 Geometry Workbench 产品实现、`verify.ps1`、包依赖、权限、GUI 或浏览器验收事实。
