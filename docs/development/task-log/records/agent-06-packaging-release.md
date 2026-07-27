# AGENT-06：安装、配置、升级、卸载与发布准备

```yaml
task_id: AGENT-06
phase: Phase 10
title: 安装、配置、升级、卸载与发布准备
status: automated_verified
record_origin: live
started_at_utc: 2026-07-26T10:59:40Z
ended_at_utc: 2026-07-26T12:13:50Z
duration_seconds: 4450
base_commit: 495cb5d
branch: codex/agent-06-packaging-release
task_source: 用户任务“AGENT-06 安装、配置、升级、卸载与发布准备”
task_summary: 在最新主线上建立可审计的版本元数据、首次启动配置、官方工具探测、数据目录、诊断和Windows打包准备闭环。
goals: 统一版本来源、保守配置迁移、无工具可用、脱敏诊断、可重复打包审计和明确的安装/卸载边界。
allowed_scope: 隔离工作区中的Rust/Tauri/TypeScript/构建脚本/契约/测试/任务日志/发布文档。
forbidden_scope: 正式F:\\CONTAM Studio、用户PRJ/CSV/SIM、真实AppData、凭据、全局环境、系统服务、签名、上传和正式发布。
validation: 定向测试、版本和包内容审计、scripts\\verify.ps1 -Mode Full、cargo fmt、Clippy、pnpm test/build、git diff --check。
delivery_status: automated_verified
token_usage: not provided by client
notes: 自动化实现和验证完成；便携构建产物位于F:\\Codex_File\\artifacts\\contam-studio\\agent-06\\0.1.0\\portable\\CONTAM-Studio.exe，清单标记unsigned_build。NSIS/WiX工具链缺失，安装器状态为not_built_without_verified_windows_packager；未签名、未上传、未创建Release。clean-machine acceptance: blocked；真实安装、升级和卸载仍待独立干净环境验收。用户已于2026-07-27完成本机GUI验收，manual_gui和user_validated均为passed。本分支未独立运行官方ContamX/SimRead，使用已有fixture/桥接回归证据，不重复声称本轮运行官方工具。未新增依赖、未申请管理员权限、未触碰正式工作区或用户PRJ/CSV/SIM、凭据和全局环境。最终自动化结果：Python 345 passed、前端173 passed、Rust 98 passed/1 ignored、Full QA-01 56 checks passed、Ruff/格式/Clippy/构建通过。

manual_gui: passed
user_validated: passed
gui_scope: 首次启动向导、无工具状态、配置保存、工具探测状态、关于/诊断、目录操作、缓存清理、双语、深浅主题、窄窗口和键盘操作均通过。
```

## 当前边界

- 默认离线，配置只保存用户明确选择的工具路径和数据目录；AI不会收到这些路径。
- 原始PRJ/CSV/SIM、用户工程和已保存结果不进入安装包、诊断包或测试输出。
- 未配置ContamX/SimRead时仍允许打开项目、编辑草稿和查看历史结果；运行命令返回明确错误。
- 当前构建不签名、不上传、不创建正式Release；缺少干净Windows环境时记录为`clean-machine acceptance: blocked`。
