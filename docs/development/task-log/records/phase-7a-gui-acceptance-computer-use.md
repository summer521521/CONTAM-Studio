# Phase 7A 真实 Tauri GUI 集中验收

```yaml
task_id: phase-7a-gui-acceptance-computer-use
phase: Phase 7A
title: 使用用户授权的 Computer Use 执行真实 Tauri GUI 集中验收
status: completed
record_origin: live
started_at_utc: 2026-07-30T03:21:14.0349852Z
ended_at_utc: 2026-07-30T04:30:48.8175237Z
duration_seconds: 4175
base_commit: bf5287488db0dac2e9fc7164efb6dc676e41d425
branch: main
task_source: 用户明确要求使用 Computer Use 完成验收并保留多组截图
task_summary: 在真实 Tauri 窗口中使用综合案例验证 Phase 7A 的用户优先布局、双语双主题、设置、Patch、运行、结果和失败边界。
goals:
  - 验证无项目首页、四入口导航、项目内搜索、默认折叠面板和设置渐进披露
  - 验证三区域 Patch/Diff/草稿、七区域 ContamX/SimRead 结果和多楼层只读边界
  - 验证求解成功与结果读取失败被分开表达，且不展示伪造结果
  - 在 F:\Codex_File 下保存覆盖关键状态的真实窗口截图和验收记录
allowed_scope:
  - 用户明确授权的 CONTAM Studio GUI 自动操作和截图
  - 综合案例包副本、临时运行/导出产物及任务日志状态
forbidden_scope:
  - 真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 和真实 Provider 请求
  - 用户唯一工程、官方仓库 fixture、系统设置、提交、推送、打标签、打包、签名和发布
preexisting_worktree_changes:
  - Phase 7A 实现、UAT-02 综合案例包、examples、准备脚本及相关任务日志
validation:
  - 真实 Tauri GUI：partial；真实 Tauri 窗口已完成设置、项目树、搜索、Patch/Diff/草稿、ContamX 求解、SimRead 结果成功与失败边界、AI 未连接和键盘焦点路径验收；发现两个用户体验缺陷
  - 截图证据：passed；证据目录为 F:\Codex_File\CONTAM-Studio\phase-7a-gui-acceptance-20260730
  - 真实 Provider：not_run；未连接 Codex、未发送 Provider 请求、未读取凭据
  - 精确 1280x720、1440x900、125%/200% 缩放：not_run
  - 安装器、签名、发布：not_run
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 用户已在本轮明确授权 Computer Use，因此允许实际操作 GUI；截图不能替代自动测试、真实 Provider、安装器、签名或发布证据。
  - PASS：设置中按用户任务分组可见，ContamX 与 SimRead 均显示 3.4.0.3 已就绪；中英文、浅色/深色切换已在前序截图中留证。
  - PASS：三区域 UAT 副本完成体积 300→350 的结构化 Patch、Diff 审阅、草稿 Revision 1 应用和另存副本；原始 PRJ 未覆盖。证据：06-volume-patch-diff-review.png、07-draft-revision-applied.png、导出文件 editable-volume350-uat.prj。
  - PASS：带真实工具环境启动的 Tauri 进程中，test_GetPrjInfo.prj（7 Zone）ContamX 3.4.0.3 退出码 0，SimRead 成功生成 577 个样本、累计时间 172800 秒，并显示温度/参考压力/空气密度曲线。证据：13-seven-zone-run-success.png、14-seven-zone-results-summary.png、15-seven-zone-results-chart.png。
  - PASS：demo1c.prj 只读边界案例识别为 3 Levels、7 Zones，项目树和对象均标记只读；ContamX 退出码 0。证据：16-boundary-three-level-seven-zone-readonly.png。
  - PASS：结果读取失败被正确表达为“ContamX 已成功求解，但结果读取未完成”，未伪造图表或零值；三区域案例技术码为 bridge_internal_error，边界案例技术码为 simread_output_missing。证据：11-results-read-failure-separated.png、12-results-read-details.png、17-boundary-results-read-failure-separated.png、18-boundary-results-read-details.png。
  - PASS：项目树搜索 Kitchen 可筛选并选择 CONTAM 编号 6，属性面板同步显示 Kitchen/6；Tab 可移动到项目动作、结果动作和 Problems 标签。证据：20-zone-search-kitchen-filter.png、21-zone-search-selection-properties.png、22-keyboard-tab-focus-navigation.png。
  - FINDING：设置页点击左侧“项目”只切换项目树显示，不返回项目/首页中心工作区；设置中心内容仍保持“工作台设置”。证据：24-project-nav-does-not-leave-settings.png。
  - FINDING：设置页“恢复工作台布局”后，顶部/设置状态文案出现“展开底部面板”，但真实底部 Problems/Run/Results 面板仍在展开状态，内部控件仍显示“折叠底部面板”，状态与实际布局不一致。证据：23-layout-reset-bottom-panel-state.png。
  - 既有启动方式若未把 ContamX/SimRead 环境变量传入 Tauri 进程，会出现“未配置受支持的 ContamX”；本轮使用进程级环境变量重新启动后已证明真实工具链可运行。证据：09-contamx-run-failed-contamx-not-configured.png、10-contamx-run-success.png。
  - 本轮未修改代码、未读取真实凭据、未触碰真实 AppData、未提交、未推送、未打包、未签名、未发布。
```
