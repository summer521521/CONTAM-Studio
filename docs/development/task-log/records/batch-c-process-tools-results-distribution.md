# Batch C：Process, Tools, Runs, Results and Distribution

```yaml
task_id: BATCH-C
phase: Wave 5-7
checkpoint: C
title: Controlled processes, trusted results, studies, reports and Windows candidate boundaries
status: blocked
record_origin: live
started_at_utc: 2026-07-24T12:18:47Z
ended_at_utc: 2026-07-24T12:39:13.9859801Z
duration_seconds: 1226.985
base_commit: 24cb7aa
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md Revision 2
task_summary: 建立受控进程、工具身份、运行与结果可信存储、严格比较、参数研究、可复现报告以及离线发行候选边界。
goals:
  - 所有运行状态、取消和清理结果诚实且绑定精确Lease、Revision、工具和输入证据。
  - 结果分页、统计、比较和报告确定性，不能把部分或不兼容数据伪装成可信结果。
  - OwnedArtifactStore只管理Studio-owned对象，外部来源和导出永不自动删除。
  - Windows发行保持标准用户、离线、无签名无自动更新，真实安装验收待用户完成。
allowed_scope:
  - src、src-tauri/src、python/src、contracts、scripts/tests、docs/development/task-log、docs/architecture、docs/product、docs/ui、docs/development
forbidden_scope:
  - F:\CONTAM Studio原工作区、用户PRJ/SIM/CSV、真实AppData、凭据、系统设置、全局依赖、推送和发布
validation:
  - 开发中运行受影响的Python/Rust/前端定向测试；Batch C结束时运行一次Full和git diff --check。
delivery_status: blocked_not_integrated
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: H-FINAL确认本批新增Python代码是未接入桌面生产路径的研究基础。ProcessController只验证状态词，不控制真实进程或Windows Job Object；存储、运行历史、通用结果、比较、研究和报告也没有Tauri/React入口。本批产品交付状态改为blocked，定向测试仅证明内部模型行为。
```

## Status ledger

| Card | Status | Evidence / note |
| --- | --- | --- |
| PROC-01 | blocked | Python状态模型未启动或治理进程，也未接入现有Rust/Python进程入口；Windows Job Object和统一取消/退出证据未实现。 |
| PROC-02 | pending_user | Existing Rust/Python entrypoints retain their established bounded wrappers; complete bidirectional inventory and real Job Object routing require final Windows evidence and are tracked without enabling a bypass. |
| TOOL-01 | foundation_tested | ToolRegistry内部模型有定向测试，但没有桌面生产入口。 |
| TOOL-02 | pending_user | Existing Settings tool surfaces and safe identity views are present; native chooser and real target-Windows probe remain pending_final_acceptance. |
| RUN-01 | foundation_tested | 仅验证候选状态模型；真实ContamX入口仍使用既有运行器。 |
| RUN-02 | blocked | RunRecord未接入生产路径，且H-FINAL发现其非覆盖写入需要并发提交修复。 |
| INPUT-01 | automated_verified | Companion boundary from Batch B is reused for explicit hash-bound inputs; recursive discovery and untrusted path expansion remain forbidden. |
| DATA-01 | blocked | OwnedArtifactStore未接入生产路径，非覆盖提交仍存在检查后替换竞争。 |
| RESULT-01 | foundation_tested | 通用ResultRecord为内部模型；当前产品仍只启用既有`zone_air_state`纵向路径。 |
| RESULT-02 | foundation_tested | 分页与统计仅有内部定向测试。 |
| RESULT-03 | pending_user | Existing official SimRead Zone result adapter remains the only enabled sourced vertical slice; new generic result types are not claimed. |
| RESULT-04 | foundation_tested | 未形成新的桌面后端或IPC入口。 |
| COMPARE-01 | foundation_tested | ComparisonRecord尚未接入GUI或真实结果工作流。 |
| COMPARE-02 | pending_user | Existing UI/export path remains available; manual comparison GUI and target-user evidence remain pending_final_acceptance. |
| SWEEP-01 | foundation_tested | SweepPlan是未接线的有界数据模型，不会执行参数研究。 |
| REPORT-01 | blocked | ReportModel未接入产品，输出提交仍需并发安全修复。 |
| RESULT-05 | blocked | 未完成官方工具到通用结果/比较/报告的生产闭环。 |
| DIST-01 | policy_only | 只形成候选策略，没有安装包。 |
| DIST-02 | foundation_tested | 现有锁文件和来源检查通过，不代表打包完成。 |
| DIST-03 | pending_user | Frozen worker spike is represented by locked source contracts; binary build, size and DLL evidence require target Windows packaging review. |
| DIST-04 | pending_user | Tauri packaging boundary remains explicit without generic Shell/filesystem capability; packaged sidecar verification awaits clean-machine evidence. |
| DIST-05 | pending_user | Installer/About/notices/SBOM publication artifacts remain unsigned and unpublished pending target review. |
| DIST-06 | pending_user | Offline clean-machine matrix is prepared by policy; physical Win10/11 standard-user execution remains user-owned evidence. |
