# H-FINAL：v1候选集中复核与主线交付

```yaml
task_id: H-FINAL
phase: Final review
title: v1候选集中代码复核、缺陷修复与主线交付
status: in_progress
record_origin: live
started_at_utc: 2026-07-24T12:50:32.0836652Z
ended_at_utc: null
duration_seconds: null
base_commit: 79e8e13bdad268576e9caa30bd8945d7cc1bd0d0
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md Revision 2
task_summary: 集中审查五批自动化候选的真实接线、权限与数据安全、完成声明和主线可合并性；修复阻塞问题后运行最终验证并交付main。
goals:
  - 区分真实产品实现、未接线库代码、合成证据和外部待验事实。
  - 审查PRJ/Patch、进程、存储、结果、附件、AI、Tauri权限和关闭恢复边界。
  - 修复合并阻塞缺陷、Phase 6A过期产品状态和能力矩阵漂移。
  - Full通过后才允许合并和推送main；不签名、不tag、不发布。
allowed_scope:
  - 当前隔离分支代码、契约、测试、产品/架构/状态/发布文档和任务日志。
forbidden_scope:
  - 用户PRJ/SIM/CSV正文、真实AppData、凭据、系统/全局环境、签名、tag和发布。
validation:
  - 定向边界测试、scripts/verify.ps1 -Mode Full、git diff --check、分支与远端SHA复核。
delivery_status: in_progress
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: GUI、真实ContamX/SimRead、App Server、干净Windows和用户研究不能由自动化复核冒充；缺失证据必须继续明确标记。
```

## Review ledger

| Area | Status | Finding / evidence |
| --- | --- | --- |
| Product truth | corrected | README、当前状态、能力矩阵、Batch C/D/E和交接说明已区分桌面产品、内部研究基础和外部待验事实；候选不再宣称完整v1。 |
| PRJ and Patch | reviewed | 既有生产写入仍限于Rust保存的单Zone体积Patch、不可变Revision和用户选择的新副本；新增完整PRJ投影未接入生产写路径，并已从Python包顶层API撤下。 |
| Process and storage | blocked_future | 新ProcessController只建模状态，不启动/治理进程；OwnedArtifactStore/RunHistory存在未修复的并发提交风险且没有生产入口。PROC/DATA/通用Run产品状态已降级，Windows Job Object仍未实现。 |
| Results and reports | blocked_future | 通用Result/Compare/Sweep/Report只有内部模型和测试；现有桌面仍只使用既有`zone_air_state`严格纵向路径。非覆盖报告写入并发问题在接线前必须修复。 |
| Attachments | blocked_future | AttachmentBroker无Tauri/React入口，且magic、ZIP symlink/Unicode/嵌套、Office外链、PDF文本和quarantine提交仍有缺口；ATT产品任务已改为blocked。 |
| AI authority | reviewed | 生产AI仍是既有Rust只读App Server路径；新增Python gateway无生产接线且嵌套权限/TTL/Trace提交不满足执行型AI要求，AI写入和自动仿真仍未实现。 |
| Desktop permissions | corrected | 删除WebView可写的`set_close_activity`命令、ACL、封装和效果；Rust现直接读取草稿/Patch/项目操作和AI任务状态，另存后再次核对权威Revision状态。命令契约为26项。 |
| Merge readiness | ready | 最终Full一次通过54项：Python 321、前端150、Rust 86 passed/1 ignored；Clippy、构建、格式、Docs、突变契约和`git diff --check`通过。`origin/main=81205f4`仍是候选祖先，可快进交付。 |

## Focused validation

- Rust关闭协议：6 passed，含“WebView声称成功但权威草稿仍未另存”负例。
- 前端关闭/桌面API/项目组件：25 passed；生产构建通过，保留既有大chunk警告。
- Python研究模块13 passed，既有桥黄金与Zone桥30 passed。
- `cargo check`、Clippy `-D warnings`通过。
- Docs模式32项通过；任务日志58条和Tauri 26命令契约通过。
- 最终`Full`：54 checks passed；Python 321、前端150、Rust 86 passed/1 ignored；保留既有Vite大chunk和Rust linker提示。
