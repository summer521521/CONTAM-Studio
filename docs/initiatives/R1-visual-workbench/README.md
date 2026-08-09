# CONTAM Studio Renewal R1

> 当前研发事实源：CONTAM Studio 可视化科学工作台重构 R1。

R1 将现有 CONTAM 桌面程序收敛为面向学生、教师、研究人员和工程分析人员的 Windows 优先、本地优先、联网增强、中文优先且支持英文的可视化科学工作台。R1 先建立可信工程基础，再逐步加入空间、拓扑、结果和证据视图；不会用界面演示替代 PRJ 领域证据。

## 产品目标

- 让用户在同一工作台中理解空间/楼层模型、气流拓扑、仿真结果和证据链。
- 保留官方 ContamX 数值求解、Rust/Tauri 权限边界、Python 领域 Worker 和可审查的 Revision/Patch 流程。
- 让 GUI、AI 和结果分析共用同一套语义领域接口。
- 在没有 AI、网络或远程 Provider 时，项目、草稿、仿真、结果和报告核心流程仍可本地运行。

## 非目标

- 不建设通用 IDE、BIM/CFD 平台或多求解器平台。
- 不重写 ContamX，不把 CONTAM 做成只读聊天框，也不让 AI 任意修改 PRJ。
- R1-01 不实现最终空间画布，不提前引入 Konva、React Flow、PixiJS、VTK.js 或其他画布运行时依赖。
- 不在 R1 中增加云同步、多人协作、自动更新、账户体系或 macOS/Linux 正式发行。

## 五个固定工作包

| 工作包 | 目标与完成定义 | 当前状态 |
| --- | --- | --- |
| R1-01 Foundation Reset | Windows CI 在有/无 F: 盘环境可复现；旧路线图归档；R1 入口、任务日志和状态矩阵一致；App/CSS/令牌/基础组件具备下一轮可复用边界。 | director_review_passed |
| R1-02 Workbench & Task Journeys | 固定项目、运行、结果、研究主路径，完成任务入口和状态/错误反馈的行为回归。 | director_review_passed |
| R1-03 Visual Model Workspace | 在有领域证据的前提下交付首个二维空间/楼层只读切片；未验证对象保持只读。 | director_review_passed |
| R1-04 Results, Evidence & AI Experience | 将结果、证据、AI 上下文和可审查 Patch 体验连接到同一工作区。 | completed |
| R1-05 Final UAT & Release Readiness | 统一 GUI 截图矩阵、目标用户验收、干净 Windows 安装、签名和发布准备。 | completed（等待总监审查） |

每个工作包必须有一份主任务日志；不得为同一工作包的微小检查创建平行编号或重复日志。

## 不可突破的边界

- 官方 ContamX 承担数值求解，禁止重写求解器。
- 前端和 AI 不直接修改原始 PRJ；修改只能在草稿、内存模型或新副本中进行。
- GUI 与 AI 共用语义领域接口；任何写入都必须经过结构化 Patch、Diff、确定性验证、用户确认和快照追踪。
- 未知或暂不支持的 PRJ 内容不得静默丢失，无法可靠保存时整体保持只读。
- Rust/Tauri 控制文件、网络、凭据引用、进程树、项目/草稿/运行/结果身份和权限；异步 stale-result 防护不得退化。
- 不读取真实 API Key、Credential Manager、Cookie、WebView 数据库、真实 AppData 或真实用户唯一工程。

## 状态定义

- `implementation`：代码和文档是否达到该工作包的完成定义。
- `automated_verified`：本地聚焦测试、合同、构建或 Full 的真实结果；不等于 GUI 或发布。
- `github_windows_ci`：GitHub 托管 Windows runner 的真实运行结果；未推送新代码时只能写 `pending_push` 或 `not_run`。
- `manual_gui`：用户在桌面程序中的人工验收；Codex 不把进程启动或脚本通过写成 GUI 通过。
- `real_provider`：真实 Provider、真实账号和真实回答的回归结果；Mock 不计入此状态。
- `packaged`：从精确提交生成并审计的安装/便携产物；不等于干净机安装成功。
- `signed`：真实代码签名证据；未使用签名私钥时保持 `not_run`。
- `released`：正式 Release、标签和资产已真实创建并核验；未发布保持 `no`。
- `user_validated`：用户对约定范围的最终确认；自动化结果不能替代它。

## 当前事实

- 候选产品版本：`0.5.0`；产品 SemVer 与 R1 研发编号完全分离。当前产物来自未提交工作树，只是本地候选，不是正式发布资产。
- `R1-05 Final UAT & Release Readiness` 的本轮 blocker closure 已完成本地实现和自动验证，DeepSeek 结构化输出与三项 GUI 缺陷已有代码/测试证据；当前隔离 GUI 证据为 partial，因 fixture 运行仍返回 `contamx_solver_not_configured`，没有把空结果或历史候选包截图写成多 Zone 成功结果。等待总监最终审查；R1-03 已获总监审查通过，R1-04 已由独立 closure Full 以退出码 0、67 项检查通过完成自动验证收口。
- R1-01 已通过总监审查；其未提交修改是 R1-02 不可回退的工作树基线。
- 当前任务日志：[r1-05-final-uat-release-readiness.md](../../development/task-log/records/r1-05-final-uat-release-readiness.md)。
- R1-03 已增加版本化空间投影、Rust 有界验证、只读 SketchPad/气流拓扑工作区、可访问对象列表与项目/revision 变化时的视觉上下文重置；本轮不执行正式截图矩阵。
- R1-04 在既有 SimRead、空间投影和 AI 边界上增加身份绑定的多 Zone 数据集、结果四标签页、Evidence Lineage 与 Context Receipt；AI Patch 继续只进入统一审查链路。
- R1-04 的 NIST acquisition/temp-root 遗留通过共享 PowerShell 5.1 SHA-256 与重定向进程回归修复；所有失败和最终 closure Full 证据均保留在 R1-04 临时证据目录。
- R1-05 已重新核对 NIST 官方页面：产品发布页为 3.4.0.8，而官方 Windows x64 ZIP 与包内 ContamX/SimRead/SimComp/PrjUp 文件版本为 3.4.0.3；锁定 ZIP SHA-256 未变化，未静默升级工具。
- 能力状态矩阵：[capability-status-matrix.json](../../capability-status-matrix.json)。
- 当前产品事实：[current-state.md](../../current-state.md)。
- 历史路线图：[phases.md](../../roadmap/phases.md)、[next-development-execution-plan.md](../../roadmap/next-development-execution-plan.md)，仅供追溯。
- 深度调研：[GUI 深度调研报告](../../research/2026-07-contam-studio-deep-research.md)。

## 验证与交付纪律

R1-02 已完成聚焦合同、前端测试、生产构建与一次最终 Full：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -Mode Full
```

该次 Full 退出码为 0，64 项检查通过；完整日志位于任务指定的 `F:\\Codex_File\\r1-02-workbench-task-journeys` 临时证据目录。本轮不提交、不推送、不打标签、不打包、不签名、不发布；GUI 截图矩阵和用户视觉验收仍统一留给 R1-05。
