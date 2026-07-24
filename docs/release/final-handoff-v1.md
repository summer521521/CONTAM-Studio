# CONTAM Studio v1 自动化候选交接

## 当前范围

隔离分支 `codex/contam-studio-v1-complete` 已从 `24cb7aa` 继续完成五批连续实现：严格 PRJ/气流/计划/污染物域、Patch/不可变 Revision/Scenario、受控进程与工具身份、Run/Result/Compare/Sweep/Report、AttachmentBroker、AI 证据与批准边界、质量/安全/性能/恢复文档、UAT/发行候选和中文学习集。

## 自动化证据

- Batch E 第一次 Full：54项通过。
- Batch E 第二次稳定性 Full：54项通过。
- Python 项目解释器：321 passed，Ruff 通过。
- 前端：150 passed，生产构建通过。
- Rust：85 passed，1 ignored（需要明确真实 Phase 5A 结果输入），Clippy/Cargo/格式通过。
- Git `diff --check`、契约和突变测试通过。

## 明确未宣称

真实 Windows Job Object/干净机器、官方 ContamX/SimRead 目标工具身份与数值成绩、PDF/Office 视觉渲染、真实 App Server 远程披露、人工 GUI、H/U 评审、签名、推送、发布和用户研究均为 `pending_final_acceptance`。这些行不启用危险能力，也不阻塞离线核心。

## 下一次人工动作

1. 使用 [UAT-01 矩阵](../uat/manual-acceptance-matrix-v1.md) 在干净 Windows 标准用户环境逐行记录。
2. 由 H 对域语义、Patch、进程、存储、附件、AI 工具与威胁模型做一次集中复核。
3. 由 U 决定真实工具、GUI、远程披露和发行许可；发布仍需单独明确指令，当前不得 tag/push/sign/upload。

## 保护声明

正式 `F:\CONTAM Studio`、用户 PRJ/CSV/SIM、真实 AppData、凭据、全局环境和远端均未触碰；所有测试夹具和中间产物留在隔离克隆或项目工具生成目录。
