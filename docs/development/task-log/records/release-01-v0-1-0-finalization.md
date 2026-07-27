# RELEASE-01：冻结、发布与归档CONTAM Studio 0.1.0

```yaml
task_id: RELEASE-01
phase: Release 0.1.0
title: 冻结、发布与归档CONTAM Studio 0.1.0
status: completed
record_origin: live
started_at_utc: 2026-07-27T07:34:43.5865706Z
ended_at_utc: 2026-07-27T09:32:33.2125379Z
duration_seconds: 7069.626
base_commit: 35c2925
merged_agent_08_commit: 7e7bb02
branch: main
task_source: 用户明确要求合并最后分支、冻结0.1.0范围、签名、正式发布和项目归档，并将干净机验收视为通过。
task_summary: 快进合并AGENT-08，冻结0.1.0支持范围和已知限制，完成最终验证、发布产物、标签、GitHub Release与可恢复归档。
goals: 形成与同一Git提交绑定、范围真实、产物可校验、签名状态可证明、发布可追溯且源码可恢复的CONTAM Studio 0.1.0。
allowed_scope: 主线发布文档、能力矩阵、任务日志、版本标签、GitHub Release，以及F:\\Codex_File下的发布产物与归档。
forbidden_scope: 用户PRJ/CSV/SIM正文、真实AppData内容、凭据导出、私钥导出、伪造可信签名、全局环境和系统配置修改。
validation: scripts\\verify.ps1 -Mode Full、git diff --check、发布扫描、产物SHA-256、签名验证、GitHub Release与归档清单核验。
delivery_status: completed
token_usage: not provided by client
notes: 正式工作区发现两个未跟踪安装测试产物，先移至AGENT-08产物目录并核验哈希；它们随后因被最终release产物取代而随中间产物清理。已将旧batch-03x独立提交保存为Git bundle，将AGENT-03早期未提交内容保存为补丁和文件副本；随后删除36个已合并克隆、缓存、测试和重打包临时目录，并删除被最终release目录取代的AGENT-06/07/08中间产物。正式源码、最终发布产物、本地打包工具链和恢复归档保留。用户于2026-07-27明确批准将GitHub仓库公开并采用Apache-2.0；仓库现为public，GitHub正确识别Apache-2.0，私密漏洞报告已启用。0.1.0发布标签绑定a4f143e5c435519e3e4ace0e2b15a4cf893c5d73；本地Full 58项和GitHub Windows CI run 30253414217通过。最终便携EXE、便携ZIP、NSIS、MSI、许可证、notice、manifest和SHA-256已发布到https://github.com/summer521521/CONTAM-Studio/releases/tag/v0.1.0，远端下载复核8项哈希一致。Windows SDK signtool确认三个二进制均无Authenticode签名，Release明确标记unsigned；GitHub Sigstore发布核验run 30254177097通过，并由gh attestation verify复核。完整本地恢复归档位于F:\\Codex_File\\archives\\contam-studio\\0.1.0\\final-release，Git bundle验证为完整历史。后续申请SignPath Foundation，不以自签名证书冒充公共信任。
```
