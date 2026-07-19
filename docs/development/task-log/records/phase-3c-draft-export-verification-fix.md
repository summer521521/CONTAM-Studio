# Phase 3C草稿副本导出验证修复

```yaml
task_id: phase-3c-draft-export-verification-fix
phase: Phase 3C
title: 修复草稿副本导出后的Zone身份验证
status: completed
record_origin: live
started_at_utc: 2026-07-19T01:42:26.5848528Z
ended_at_utc: 2026-07-19T01:47:43.4045925Z
duration_seconds: 316
base_commit: 0c3242ce48e7ff7135d8969933c6e73a037c8dd7
branch: codex/phase-3c-draft-snapshots-undo
task_source: ChatGPT Web coordination
task_summary: 根据Phase 3C手动GUI反馈，修复当前草稿另存为新PRJ后被错误判定为身份不一致并删除的问题，同时保留原始文件、不可变revision和路径隔离边界。
goals:
  - 复现并修复draft_export_verification_failed
  - 让导出副本使用项目基线Zone UUID语义验证当前revision
  - 保持失败删除不完整输出且不破坏当前草稿
  - 增加聚焦Rust回归测试并更新Draft PR
allowed_scope: Rust草稿导出验证、聚焦测试、Phase 3C验证文档和任务日志
forbidden_scope: Phase 3C架构重写、新编辑字段、GUI自动验收、ContamX状态语义变更、Phase 4或Phase 5功能扩展
files_changed: Rust草稿导出复核及真实桥回归测试；Phase 3C当前状态、验证记录和任务日志
validation:
  - Rust默认测试27 passed、1 ignored；cargo fmt --check和cargo check通过
  - 聚焦回归使用真实Python桥创建修改后Revision，字节复制后严格重读、SHA-256、大小、Zone UUID和Zone视图均一致
  - Python pytest 266 passed；Ruff通过
  - 前端Vitest 10个文件、99项通过；生产构建通过
  - 57个已跟踪Markdown文件相对链接和git diff检查通过
dependencies: 无新增依赖
manual_gui_validation_status: passed
delivery_status: pushed_draft_pr
pull_request: https://github.com/summer521521/CONTAM-Studio/pull/14
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 根因是Python项目哈希使用小写十六进制、Rust本地哈希使用大写十六进制，而导出复核曾进行区分大小写比较；现按SHA-256语义比较并规范化输出路径后严格重读。用户随后完成草稿另存成功、同名拒绝、取消保留草稿及全部31项Phase 3C GUI验收，证据：https://github.com/summer521521/CONTAM-Studio/pull/14#issuecomment-5013736336。ContamX在首次运行前显示待验证、运行成功后显示已验证版本符合当前桌面会话契约。客户端未提供精确逐任务Token数据。
```
