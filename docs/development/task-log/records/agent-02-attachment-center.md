# AGENT-02：Attachment Center and Evidence Disclosure

```yaml
task_id: AGENT-02
phase: Phase 7
title: Attachment Center and Evidence Disclosure
status: automated_verified
record_origin: live
started_at_utc: 2026-07-26T04:41:17.4265193Z
ended_at_utc: 2026-07-26T05:17:28.8708832Z
duration_seconds: 2171
base_commit: c665f7af771012d56ef02db6ef41a44240e6c4ae
branch: codex/agent-02-attachment-center
task_source: 用户任务“AGENT-02 Attachment Center and Evidence Disclosure”
task_summary: 将受限附件隔离、类型检查、证据披露和AGENT-01失效边界接入桌面产品。
goals:
  - 所有附件仅以Studio拥有的quarantine副本处理，不覆盖、移动或删除用户源文件。
  - 只向用户明确选择且经过有界预览的EvidenceBundle披露证据。
  - 附件集合变化立即使AI预览、仿真计划和批准令牌失效。
allowed_scope:
  - src、src-tauri/src、python/src、tests、contracts、docs和任务日志。
forbidden_scope:
  - 用户PRJ/CSV/SIM、凭据、真实AppData、全局环境、动态MCP、Shell、通用文件系统、tag、签名和发布。
validation:
  - 定向附件/证据/Rust/前端/权限测试、非用户fixture验证、AGENT-01回归、Full和git diff --check。
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 附件隔离、受限证据、计划/批准失效、权限契约和自动验证均已完成。图片像素真实传输未验证，故保持元数据披露和fail-closed；真实GUI、键盘、窄窗口、主题、完整Office视觉渲染、完整PRJ和发行仍为pending_user或未完成。本任务未读取或修改用户工程与敏感数据。
```
