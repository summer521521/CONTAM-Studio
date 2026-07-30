# Phase 7B UI/UX 与运行体验修复

```yaml
task_id: phase-7b-ui-ux-runtime-polish
phase: Phase 7B
title: User-first Workbench Navigation, Layout Contract and Visual Polish
status: completed
record_origin: live
started_at_utc: 2026-07-30T05:14:19.7028995Z
ended_at_utc: 2026-07-30T05:34:47.8284938Z
duration_seconds: 1228.135
base_commit: bf5287488db0dac2e9fc7164efb6dc676e41d425
branch: main
task_source: User-provided Phase 7A GUI follow-up brief
task_summary: 修复设置页项目入口与布局恢复状态漂移，并进一步收敛四入口工作台的上下文可见性、视觉层级和首屏密度。
goals:
  - 项目入口从任意页面返回项目工作区或无项目首页
  - 恢复布局同步持久化状态、面板实例和重新进入工作台后的默认布局
  - 让当前项目、Zone、状态和下一步动作在首屏可见
  - 保持四入口任务导航、双语文案、可访问性和现有领域/权限边界
allowed_scope:
  - React/TypeScript 工作台、状态纯函数、样式令牌、locale、前端回归测试和任务日志
forbidden_scope:
  - 真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 和真实 Provider 请求
  - 官方 ContamX/SimRead、Rust/Tauri 领域语义、原始 PRJ 覆盖、提交、推送、发布和签名
preexisting_worktree_changes:
  - Phase 7A UI/UAT 改动、综合案例包、examples、准备脚本和既有任务日志
validation:
  - pnpm test：182 项通过（21 个测试文件）
  - pnpm build：TypeScript 与 Vite 生产构建通过；保留既有大 chunk 警告
  - cargo check --manifest-path src-tauri/Cargo.toml：通过
  - 综合案例合同：3 个源项目、3 操作 Patch、6 个附件、完整校验通过
  - 任务日志合同：79 条记录通过
  - git diff --check：通过
  - scripts/verify.ps1 -Mode Full：真实执行一次；因项目 python\.venv\Scripts\python.exe 缺失在工具链门禁失败，后续 Fast/Full 检查被脚本跳过
  - 真实 Tauri 启动：当前工作树 Vite 以 1421 端口启动，cargo run 生成并启动 target/debug/contam-studio.exe；启动证据完成后仅停止本轮精确进程
  - 真实 Tauri GUI：passed（Phase 7B 修复范围）；2026-07-30T06:55:07.7570370Z 使用用户明确授权的 Computer Use 在当前主线工作树生成的真实桌面进程中复验
  - 项目入口：passed；设置、运行、结果、研究和 AI 侧栏状态下可返回项目工作区，无项目时返回欢迎页
  - 布局恢复：passed；恢复后项目树与上下文面板展开、底部面板折叠，顶部动作、真实面板状态与持久化语义一致
  - 视觉与交互：passed；中英文、浅色/深色、项目搜索、四入口导航、AI 未连接状态和设置渐进披露均可操作
  - 草稿安全链：passed；350→420 单字段 Patch 展示 Diff 与原始 PRJ 不覆盖提示，应用生成 Revision 1，撤销恢复 350、重做恢复 420，并另存为新副本
  - 真实工具链：passed；ContamX 3.4.0.3 对测试副本退出码 0、未超时、生成 1 个 SIM，并报告源文件保持不变
  - 真实结果成功路径：passed；test_GetPrjInfo.prj 经 SimRead 提取 577 个样本、累计时间 0–172800 秒，统计摘要、图表与数据表均可显示
  - 结果失败语义：passed；三区域草稿的 bridge_internal_error 被表达为“ContamX 已成功求解，但结果读取未完成”，运行证据保留且未伪造结果
  - 精确 1280×720、1440×900、125%/200% 系统缩放：not_run；不把当前约 1440 宽窗口截图冒充为精确缩放矩阵
  - 截图证据：passed；Computer Use 在本次任务会话中对关键状态逐步截图留证，未向仓库新增截图文件
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 真实 GUI 复验需与自动测试、Tauri 启动链和用户验收分开记录。
  - 首次由验收工具启动的进程未继承 CONTAM_STUDIO_CONTAMX，界面正确阻止运行并提示未配置；按用户既有开发启动方式为新进程显式设置 CONTAM_STUDIO_CONTAMX 与 CONTAM_STUDIO_SIMREAD 后，工具状态显示 3.4.0.3 已就绪，真实求解与七区域结果提取均通过。
  - 草稿另存测试仅写入 F:\Codex_File\CONTAM-Studio\phase-7a-gui-acceptance-20260730；磁盘复核确认原文件 SHA-256 为 DFE97AC38A0F78267B411C1E6E1E01BEB7D66796BCB4FEF704CC215FE0 且第 362 行仍为 350，新副本 SHA-256 为 01641C9DC23D9B223477A80FA3072D64BF50F9FE2F4298735C717D609544CD26 且第 362 行为 420。
  - 未读取真实凭据、Credential Manager、Cookie、WebView 数据库或真实 AppData；未发起 Provider 请求；未修改官方 PRJ；未提交、推送、打包、签名或发布。
```
