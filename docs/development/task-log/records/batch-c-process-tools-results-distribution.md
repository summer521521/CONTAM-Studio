# Batch C：Process, Tools, Runs, Results and Distribution

```yaml
task_id: BATCH-C
phase: Wave 5-7
checkpoint: C
title: Controlled processes, trusted results, studies, reports and Windows candidate boundaries
status: automated_verified
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
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Batch C功能、契约、Python/前端/Rust测试已纳入Batch E两次干净Full；真实Windows Job Object、官方ContamX/SimRead、干净电脑、签名和发行发布证据标记pending_final_acceptance，危险能力保持关闭。
```

## Status ledger

| Card | Status | Evidence / note |
| --- | --- | --- |
| PROC-01 | automated_verified | Added bounded ProcessController Lease state machine with Job/PID/stream/cleanup proof requirements, shared deadline and honest timeout/cancel/unknown_cleanup states; real Windows Job Object evidence remains pending_final_acceptance. |
| PROC-02 | pending_user | Existing Rust/Python entrypoints retain their established bounded wrappers; complete bidirectional inventory and real Job Object routing require final Windows evidence and are tracked without enabling a bypass. |
| TOOL-01 | automated_verified | Added explicit ToolRegistry with missing/unsupported/unverified/verified/changed/blocked states, hash/version/architecture identity, replacement detection and path-free safe views; no PATH/registry scan. |
| TOOL-02 | pending_user | Existing Settings tool surfaces and safe identity views are present; native chooser and real target-Windows probe remain pending_final_acceptance. |
| RUN-01 | automated_verified | Process cancellation proof and Run status vocabulary reject late success and preserve prior result identity. |
| RUN-02 | automated_verified | Added hash-bound RunRecord and non-overwriting persistence for baseline, Revision, Scenario, tools, inputs and evidence. |
| INPUT-01 | automated_verified | Companion boundary from Batch B is reused for explicit hash-bound inputs; recursive discovery and untrusted path expansion remain forbidden. |
| DATA-01 | automated_verified | Added OwnedArtifactStore categories, commit-last manifests, soft/hard quotas, protected cleanup preview and confirmation-only deletion. |
| RESULT-01 | automated_verified | Added trusted ResultRecord with run/scenario/baseline/revision/tool/parser/calculator identity, bounded samples and immutable hash. |
| RESULT-02 | automated_verified | Added closed result paging cursors and deterministic min/max/mean/count/missing statistics. |
| RESULT-03 | pending_user | Existing official SimRead Zone result adapter remains the only enabled sourced vertical slice; new generic result types are not claimed. |
| RESULT-04 | automated_verified | Result samples use stable object IDs, exact time grids and bounded pages; no raw path or unbounded transport is exposed by the new backend. |
| COMPARE-01 | automated_verified | Added exact-match ComparisonRecord requiring profile/object/unit/grid/parser/calculator compatibility and explicit zero/missing policies. |
| COMPARE-02 | pending_user | Existing UI/export path remains available; manual comparison GUI and target-user evidence remain pending_final_acceptance. |
| SWEEP-01 | automated_verified | Added bounded registered-parameter SweepPlan with unique values, case list, run/storage caps and approval hash. |
| REPORT-01 | automated_verified | Added deterministic ReportModel and non-overwriting HTML/JSON output with assumptions, lineage, tools, evidence and separately labeled AI narrative. |
| RESULT-05 | automated_verified | Automated result/comparison/report boundaries are covered; real official-tool-to-report and clean-machine rows remain pending_final_acceptance. |
| DIST-01 | automated_verified | Candidate distribution policy remains per-user Tauri, standard-user, offline-first, external official tools, no signing/update channel, and retained data. |
| DIST-02 | automated_verified | Existing locked Python/Node/Rust manifests and package-origin checks remain the dependency split evidence. |
| DIST-03 | pending_user | Frozen worker spike is represented by locked source contracts; binary build, size and DLL evidence require target Windows packaging review. |
| DIST-04 | pending_user | Tauri packaging boundary remains explicit without generic Shell/filesystem capability; packaged sidecar verification awaits clean-machine evidence. |
| DIST-05 | pending_user | Installer/About/notices/SBOM publication artifacts remain unsigned and unpublished pending target review. |
| DIST-06 | pending_user | Offline clean-machine matrix is prepared by policy; physical Win10/11 standard-user execution remains user-owned evidence. |
