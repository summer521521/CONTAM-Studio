# Phase 6C 后续：候选安装包纠正与本地发布收口

```yaml
task_id: phase-6c-followup-package-correction
phase: Phase 6C follow-up
title: 纠正旧 target 重封装导致的旧界面、版本探测和 NSIS 卸载目录问题
status: completed
record_origin: live
started_at_utc: 2026-07-29T06:57:00Z
ended_at_utc: 2026-07-29T07:25:54.7000969Z
duration_seconds: 1794.7000969
base_commit: e04fa95e8cc67e7b4b7541bfeda68f838d00c891
branch: main
task_source: 用户反馈 post-fix-installer-check 安装包仍显示旧界面、工具版本探测失败且卸载残留安装目录
task_summary: 修正 NSIS 直接卸载时把临时解压目录误当安装目录的问题，从当前源代码重新构建 0.3.0 Tauri 应用并生成带锁定 NIST runtime 的 NSIS、MSI 和 Portable 候选产物。
goals:
  - 让候选安装包包含当前版本探测实现和界面减负实现
  - 让 NSIS 卸载器通过升级参数或安装记录解析真实安装根目录
  - 隐藏无必要的卸载路径字段，保留数据删除确认且默认不删除用户数据
  - 生成可供一次 GUI/UAT 使用的本地候选产物
allowed_scope:
  - NSIS/WiX 本地重打包脚本、安装器契约、Tauri 构建、Portable/installer 候选产物和任务日志
forbidden_scope:
  - 真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData、宿主机注册表实测、提交、推送、打标签和发布
initial_status: in_progress
validation:
  - build-installers.ps1 从当前工作树重新执行 Tauri 前端和 Rust release 构建，退出码 0；pnpm build 在构建流程中通过
  - NSIS v3.12 与 WiX 3.14.1 本地重打包通过；生成脚本解析真实安装记录或 /_?= 参数，不再使用临时 $EXEDIR；卸载路径控件隐藏，应用数据复选框默认未选中
  - release-closure.ps1 -SkipBuild -RequireInstallers 退出码 0；portable_build=passed、installer_build=built_unsigned、official_contam_tools_resource=locked_and_included
  - node scripts/audit-release.mjs 对候选 Portable 根通过；node scripts/check-release-metadata.mjs 通过
  - 官方 NIST 工具脚本测试通过；ZIP SHA-256 为 3F11B44513F1046D378226B3D63644493B78F0E8241DC70F83E319A458A14052，四个 runtime 文件逐文件哈希与锁定清单一致
  - Portable 隔离 smoke：ContamX --Version 退出码 0 且返回 3.4.0.3 64 bit；官方 test_GetPrjInfo.prj 副本运行退出码 0 并生成 SIM；SimRead Windows 文件版本为 3.4.0.3；源夹具哈希未变化
  - cargo test --locked release::tests 为 8 passed；pnpm exec vitest run 为 19 个文件、176 个测试通过；Phase 6C 合同 47 项、AGENT-08 安装器合同、运行时合同、发布闭环合同通过
  - git diff --check 通过；未在宿主机执行安装器或卸载器，避免修改注册表
delivery_status: working_tree_only_and_external_candidate_artifacts
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 旧的 post-fix-installer-check 是基于旧 src-tauri/target/release 输入的重封装，不代表当前源代码；本记录产物来自重新执行 Tauri 构建后的输入。
  - 最终候选资产位于外部 release-assets 目录；setup.exe SHA-256 为 29FB32145333852E888F998B6C50D952A759683DEA61ED56274D7699345B56A0，MSI SHA-256 为 F0EED7F60863E93EE69C4F19F04B6360E45973ED71626D38A26B20FDAFC79585，Portable ZIP SHA-256 为 70C553EC830A4CC14610E4EBF850CB6A6348E9C9BEAD70D1C4C2CB4FEB74A59D。
  - 未读取真实 API Key、Credential Manager、Cookie、WebView 数据库或真实 AppData；未修改用户文件。
  - 未提交、推送、打标签或发布；候选包未签名，GUI/UAT 和真实 Provider 状态仍需用户验证。
```
