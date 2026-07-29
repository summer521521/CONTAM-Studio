# Phase 6C 后续：修正安装包内置 CONTAM runtime 发现路径

```yaml
task_id: phase-6c-followup-runtime-discovery-correction
phase: Phase 6C follow-up
title: 修正已打包 runtime 位于可执行文件旁侧时仍显示 ContamX 未配置的问题
status: completed
record_origin: live
started_at_utc: 2026-07-29T07:32:00Z
ended_at_utc: 2026-07-29T07:50:54Z
duration_seconds: 1134
base_commit: e04fa95e8cc67e7b4b7541bfeda68f838d00c891
branch: main
task_source: 用户反馈 0.3.0 安装包启动后仍显示 ContamX 未配置
task_summary: Tauri Windows 安装包把 runtime\\contam-tools 放在可执行文件目录旁侧，而 Rust 只探测 resource_dir 下的路径；新增可执行目录及其 sibling runtime 探测，并保留开发布局兼容。
goals:
  - 让 NSIS、MSI 和 Portable 包启动后从可执行文件旁侧发现已验证的 NIST CONTAM runtime
  - 用回归测试固定安装包实际目录布局，避免只验证文件存在而漏掉应用探测路径
  - 生成可供一次 GUI/UAT 使用的替代候选产物
allowed_scope:
  - 内置 NIST runtime 发现路径、回归测试、重新构建和外部候选包验证
forbidden_scope:
  - 真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData、宿主机注册表实测、提交、推送、打标签和发布
initial_status: in_progress
implementation:
  - src-tauri/src/release.rs 新增去重的打包 runtime 根目录候选，覆盖 resource_dir、其父目录和 executable_dir 下的 runtime\\contam-tools
  - 增加 Rust 回归测试，固定覆盖“可执行文件旁侧 runtime”布局
  - Phase 6C 用户优先合同要求 bundled tool discovery 同时保留 resource_dir 和 executable_dir 探测
validation:
  - cargo test --manifest-path src-tauri/Cargo.toml --locked release::tests：9 passed，0 failed
  - cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings：通过
  - node scripts/tests/test-phase-6c-user-first-contract.mjs：47 assertions passed
  - scripts/build-installers.ps1 使用当前工作树重新执行 Vite/Rust release build、NSIS v3.12 与 WiX 3.14.1 重打包：退出码 0
  - scripts/build-release.ps1 -SkipBuild 与 scripts/release-closure.ps1 -SkipBuild -RequireInstallers：退出码 0；release audit 和 metadata audit 通过
  - NIST ZIP SHA-256：3F11B44513F1046D378226B3D63644493B78F0E8241DC70F83E319A458A14052；四个锁定 runtime 文件逐文件哈希一致
  - Portable 目录及解压后的 Portable ZIP 均通过 node scripts/audit-release.mjs
  - 隔离命令行 smoke：ContamX --Version 退出码 0、输出 3.4.0.3 64 bit；官方 test_GetPrjInfo.prj 副本退出码 0、生成 545892 字节 SIM；SimRead Windows 文件版本 3.4.0.3；源夹具未变化
  - 未运行宿主机安装/卸载、真实 Provider 或签名；用户已在本记录候选包上完成 GUI 验收并报告成功
  - GitHub Release 已发布为非 Draft、非 Prerelease；6 个资产已上传，GitHub 记录的大小与 SHA-256 均与本地产物一致
  - git diff --check：通过
delivery_status: github_release_published
source_tree_dirty: false
automated_verified: passed
packaged: passed
manual_gui: passed
real_provider: not_run
user_validated: passed
signed: not_run
released: yes
release_version: v0.3.0
release_url: https://github.com/summer521521/CONTAM-Studio/releases/tag/v0.3.0
release_commit: 72b7d09637ba8bb695b47337a4799531858a055c
released_at_utc: 2026-07-29T08:28:32Z
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
candidate_root: F:\Codex_File\phase-6c-close\post-runtime-discovery-fix\portable-artifacts\0.3.0
candidate_assets:
  - path: F:\Codex_File\phase-6c-close\post-runtime-discovery-fix\portable-artifacts\0.3.0\release-assets\CONTAM-Studio-v0.3.0-windows-x64-setup.exe
    sha256: E9C63ABD32C92B3F432580162E67AF708AAC4819FCC7AF111D10BDECAFE5AF33
  - path: F:\Codex_File\phase-6c-close\post-runtime-discovery-fix\portable-artifacts\0.3.0\release-assets\CONTAM-Studio-v0.3.0-windows-x64.msi
    sha256: 6C072B84BA20376154C4B8CC81EE5C61B522351585C0D332393FE8A23DCFB4BD
  - path: F:\Codex_File\phase-6c-close\post-runtime-discovery-fix\portable-artifacts\0.3.0\release-assets\CONTAM-Studio-v0.3.0-windows-x64-portable.zip
    sha256: 88EDA518CDC97F7396BC58CC68AEC71694EAF139CD8D4F8FD221014E25809461
notes:
  - 之前的候选包只证明 runtime 文件存在，未证明应用从安装目录发现 runtime；该候选包已被本记录产物替代，不要继续使用旧包。
  - 未读取真实 API Key、Credential Manager、Cookie、WebView 数据库或真实 AppData；未修改真实用户文件。
  - 用户于本记录候选包上报告 GUI 验收成功；真实 Provider 未执行，Windows 构建未签名。
  - 功能提交、main 推送、annotated tag 和 GitHub Release 已完成；发布证据由后续文档提交记录。
```
