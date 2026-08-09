# CONTAM Studio 项目规则

当前研发事实源是 [CONTAM Studio Renewal R1](docs/initiatives/R1-visual-workbench/README.md)。
禁止继续创建新的 Phase、QA、Batch 或其他平行编号；R1-01 至 R1-05 是当前固定工作包。

## 产品与安全边界

- 项目面向 CONTAM 教学与科研，是 Windows 优先、本地优先、联网增强的双语科学工作台。
- 数值求解必须使用官方 ContamX；禁止重写 CONTAM 求解器。
- 前端和 AI 不直接修改原始 PRJ；GUI 与 AI 共用语义领域接口。
- 未知 PRJ 内容不得静默丢失；无法可靠保存时保持只读。
- AI 写入必须经过结构化 Patch、Diff、确定性验证、用户确认、快照和追踪。
- reducer、controller、desktop-api、Tauri/Rust 权限和异步 stale-result 防护不得绕过或退化。
- 默认离线；联网 AI 只能由用户主动配置和调用。不得读取真实凭据、Credential Manager 内容、Cookie、WebView 数据库、真实 AppData 或真实用户唯一工程。

## R1 工程规则

- 每个 R1 工作包只维护一份主任务日志；开始记录 `in_progress`，结束记录 UTC 时间、耗时、摘要和真实验证结果。
- 开发阶段运行聚焦测试；工作包收口时运行一次 Full。只有因本轮确定性问题修复且确有必要时才再次运行最终 Full，并如实记录次数。
- 必须分开记录 implementation、automated_verified、github_windows_ci、manual_gui、real_provider、packaged、signed、released 和 user_validated。
- GUI 截图矩阵统一留给 R1-05；除非用户或总监明确授权，不使用 Computer Use、坐标点击、图像识别或反复截图。
- Codex 负责代码、自动测试、构建检查和非 GUI 验证，不把脚本通过写成人工 GUI、真实 Provider 或远程 CI 通过。
- 临时下载、日志、缓存和测试产物优先放在 `F:\Codex_File` 分类目录；脚本必须同时支持 `RUNNER_TEMP`、无 F: 盘和系统临时目录。
- 新增运行时依赖必须先评估许可证、维护状态、包体和 Tauri 成本；Konva、React Flow、PixiJS 等画布依赖留给对应 R1 工作包。
- 未经明确授权不提交、推送、打标签、发布、签名、修改系统配置或批量删除。
