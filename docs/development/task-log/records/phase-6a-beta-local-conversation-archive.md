# Phase 6A-Beta-2 本地只读对话档案

```yaml
task_id: phase-6a-beta-local-conversation-archive
phase: Phase 6A-Beta-2
title: 本地只读对话档案、跨重启查看与可删除会话
status: completed
record_origin: live
started_at_utc: 2026-07-20T02:43:34.3080778Z
ended_at_utc: 2026-07-20T06:31:48.5076878Z
duration_seconds: 13694
base_commit: e745e8338612dfe277386a7692453fdd16e2f1fe
branch: codex/phase-6a-codex-readonly-assistant
task_source: ChatGPT Web coordination
task_summary: 在不放宽Codex只读权限、项目上下文披露和跨绑定失效边界的前提下，增加用户可见的本地已完成问答档案、跨重启查看和可删除管理。
goals:
  - 仅自动保存通过结构化契约的已完成问答，并由Rust写入受控应用本地目录。
  - 让历史记录按可信项目、Revision、Zone和披露绑定可查看且明确标记，不自动再次发送给模型。
  - 提供单条删除、当前绑定清空和全部本地档案清除，且不影响项目、草稿、运行或结果。
allowed_scope:
  - Phase 6A Rust App Server适配器和受控本地档案、前端AI侧栏、测试、文档和任务日志
forbidden_scope:
  - AI写入、认证文件读取、模型权限放宽、文件工具、Shell工具、MCP、项目搜索、完整结果发送、其他AI后端、GUI自动化
files_changed:
  - Rust Codex App Server适配器、受控本地档案命令与最小ACL
  - AI状态、桌面桥边界、AI侧栏、本地化和样式
  - Phase 6A架构、ADR、风险、验证记录和任务日志
validation:
  - "Python: 266 passed；Ruff check通过。"
  - "Rust: 74 passed、1 ignored；fmt check和cargo check通过。"
  - "Frontend: 11个测试文件、129项测试通过；pnpm build通过。"
  - "通用: Markdown相对链接71个文件/92条通过；8个跟踪JSON可解析；冻结pnpm锁文件与Cargo metadata检查通过；git diff --check通过。"
  - "非GUI: Rust受控临时目录测试覆盖默认关闭、跨Revision过滤、200条保留上限、敏感或损坏档案拒绝；未执行GUI自动化。"
delivery_status: included_in_delivery_commit
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/15
manual_gui_validation_status: pending_user
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 既有用户未跟踪PRJ和CSV保持未读取、未修改、未暂存；src-tauri/Cargo.toml的预存时间戳工作树变化保持不触碰。
  - 客户端未提供精确逐任务Token数据。
  - 手动GUI验收仍为pending_user；需要验证显式开启、跨重启同基线同Zone查看、删除/清空、关闭后不再新增以及不自动重发给模型。
```
