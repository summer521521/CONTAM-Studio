# Phase 6C 后续：工具探测、卸载清理与界面提示

```yaml
task_id: phase-6c-followup-runtime-probe-uninstall-ui
phase: Phase 6C follow-up
title: 修复官方工具版本探测、卸载目标和默认界面提示密度
status: completed
record_origin: live
started_at_utc: 2026-07-29T06:29:00Z
ended_at_utc: 2026-07-29T06:41:37.0149022Z
duration_seconds: 757.015
base_commit: e04fa95e8cc67e7b4b7541bfeda68f838d00c891
branch: main
task_source: 用户反馈的版本探测失败、灰色说明过多和卸载残留问题
task_summary: 按官方 ContamX/SimRead 的真实探测契约修复运行时状态，减少默认界面说明并保留悬停提示，令 NSIS 卸载器以自身目录为目标并覆盖 runtime 清理。
goals:
  - 让内置 ContamX 和 SimRead 在设置页显示真实可用版本
  - 将主要工程说明收进可悬停提示，保留必要状态、风险和操作
  - 让 NSIS 卸载器直接清理自身安装目录及其 runtime，并验证空目录不残留
allowed_scope:
  - Rust工具探测、React界面、双语文案、NSIS重打包脚本、隔离卸载测试和任务日志
forbidden_scope:
  - 真实凭据、真实AppData、用户工程、注册表实测、提交、推送、打标签和发布
initial_status: in_progress
validation:
  - 官方临时资源中 ContamX --Version 退出码0并报告3.4.0.3；SimRead无版本开关，Windows版本资源为3.4.0.3；未读取真实用户数据
  - Rust release 聚焦测试8项通过；前端19个测试文件176项通过；pnpm build通过
  - cargo check、Clippy、cargo fmt、Phase 6C合同47项、AGENT-08安装器合同、运行时合同均通过
  - 正式本地 NSIS/WiX 重打包通过；生成的 NSIS 源包含以 $EXEDIR 为卸载目标的补丁
  - git diff --check通过；未在宿主机执行安装/卸载，避免修改注册表
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 未读取真实API Key、Credential Manager、Cookie、WebView数据库或真实AppData。
  - 未修改真实用户文件；未提交、推送、打标签或发布。
  - 宿主机安装/卸载未执行；仅编译并审查了带卸载补丁的本地NSIS/WiX候选生成物。
```
