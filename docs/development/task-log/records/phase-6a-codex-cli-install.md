# Phase 6A Codex CLI受控安装

```yaml
task_id: phase-6a-codex-cli-install
phase: Phase 6A
title: Codex CLI安装提醒与受控一键安装
status: completed
record_origin: live
started_at_utc: 2026-07-19T05:05:43.9482639Z
ended_at_utc: 2026-07-19T05:39:25.7094122Z
duration_seconds: 2021
base_commit: 30a5beb002282917cd66825f4b74ef98d2c6b07e
branch: codex/phase-6a-codex-readonly-assistant
task_source: ChatGPT Web coordination
task_summary: 在Phase 6A只读AI助手中增加Codex CLI缺失提醒、明确安装影响的二次确认，以及固定OpenAI官方来源、固定参数和受控证据边界的一键安装；安装完成后重新探测，App Server仍只在用户另行点击连接后启动。
goals:
  - 验证用户新安装的Codex CLI及真实App Server账号和模型目录
  - CLI缺失时提供中英文安装提醒和官方手动命令
  - 仅在用户明确确认后执行固定来源的一键安装并重新探测
  - 不向React开放下载地址、命令、参数、路径或通用Shell能力
allowed_scope: Rust受控安装命令、React安装提示和确认UI、显式Tauri ACL、测试及Phase 6A文档
forbidden_scope: 静默安装、自动登录、认证文件读取、任意命令或下载地址、通用Shell权限、其他AI后端、Phase 6B功能
files_changed: Rust Codex CLI受控发现与安装、显式Tauri命令和ACL、React安装提醒/确认/状态、中英文资源、测试及Phase 6A文档
validation: Python 266项和Ruff通过；前端115项及生产构建通过；Rust 56项通过、1项忽略，cargo check和fmt通过；62个Markdown相对链接、8个JSON、pnpm与Cargo锁、依赖清单和git diff检查通过；真实codex-cli 0.144.6、Plus账号、4个模型和只读Turn已验证
dependencies: 未新增生产依赖；受控安装只使用Windows系统PowerShell和OpenAI官方固定安装入口
manual_gui_validation_status: pending_user
delivery_status: completed_for_existing_draft_pr_15
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/15
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 用户新安装的codex-cli 0.144.6已可从用户本地程序目录发现；两个既有未跟踪PRJ/CSV继续保持未读取业务内容、未修改、未暂存。客户端未提供精确逐任务Token数据。
```
