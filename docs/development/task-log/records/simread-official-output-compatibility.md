# SimRead Official Output Compatibility

```yaml
task_id: simread-official-output-compatibility
phase: Geometry Workbench
title: SimRead 官方输出兼容性
status: completed
record_origin: live
started_at_utc: 2026-08-17T06:26:37Z
ended_at_utc: 2026-08-17T06:49:24Z
duration_seconds: 2727
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；语义创作基础的官方 SimRead 探测暴露数值空白格式与无节点空气状态结果两项兼容性问题。
task_summary: 兼容官方 NFR 数值字段的首尾 ASCII 空白，并把成功 SimRead 未提供节点空气状态结果与进程或文件读取失败分开表达，保留现有运行证据和安全边界。
goals:
  - 允许官方 NFR 数值 token 的首尾 ASCII 空白，同时继续拒绝内部空白、非法数值、非 ASCII 与列结构异常
  - 新增受控诊断以表达 SimRead 已完成但运行没有节点空气状态结果
  - 在 Rust、结果数据集和双语结果界面中保持该诊断的身份与用户语义
  - 用隔离官方证据、聚焦回归和最终 Full 验证该兼容性修复
allowed_scope:
  - Python SimRead 解析与结果提取诊断
  - Rust/Tauri 结果诊断传播与数据集失败语义
  - React 结果状态、双语文案、聚焦测试、任务日志和能力矩阵
forbidden_scope:
  - 重写 ContamX 或 SimRead、伪造 NFR、将无节点空气状态写成求解失败或结果成功
  - 修改原始 PRJ、真实用户工程、真实凭据、真实 AppData、GUI 验收、提交、推送、打包、签名或发布
validation:
  - 开发中运行 NFR 解析、SimRead 运行器、Rust 诊断和结果界面聚焦测试
  - 收口时运行 Python 全量、前端全量、Rust 测试、构建、合同、任务日志和一次最终 Full
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: implementation=complete；automated_verified=passed（最终 Full 通过）；github_windows_ci=pending_push；manual_gui=not_run；real_tools=passed；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
```

## 发现基线

- 上一任务保留的官方证据已经确认两种不同事实：一个运行由 SimRead 明确报告没有节点污染物结果；另一个运行已生成 NFR，但数值字段的官方空白格式被本地严格解析器拒绝。
- 两种情况都不能覆盖 ContamX 成功、运行清单、stdout/stderr 或可用的其他官方输出证据。
- 本任务只修正结果读取兼容性和用户语义，不扩展 CONTAM 求解或 PRJ 写入范围。

## 实施结果

- NFR 数值字段只去除列边界的 ASCII 空格；内部空格、非法数值、非 ASCII 和列结构异常仍然拒绝。
- 官方 SimRead stdout 中的 `Node contaminant results not available` 只映射为 `simread_node_air_state_unavailable`。结果清单保留进程退出码、stdout/stderr 和官方生成的 `.lfr/.xrf`，不把它伪装成 ContamX 求解失败或可用时间序列。
- Rust 结果数据集把该诊断作为可保留的 Zone 级失败，其他成功 Zone 仍可形成 partial 数据集；项目、Revision、run、manifest、source hash 和 extraction 身份校验未放宽。
- 主结果页现在在没有多 Zone 数据集时接收兼容读取的同一诊断，统一显示“求解已完成但节点空气状态不可用”和“读取失败”；兼容单 Zone 面板在无结果时也保留加载、错误和技术详情状态。

## 聚焦验证

- Python SimRead、结果和 Zone bridge：107 passed。
- 前端结果/组件/数据集聚焦测试：54 passed。
- Rust `zone_bridge` library tests：63 passed、1 ignored。
- `pnpm build`：通过；仅保留既有大 chunk 警告。
- 新增 SimRead 官方输出兼容性合同，锁定 Python、Rust、React 和能力矩阵的跨层语义。

## 真实官方工具复测

隔离根目录：`F:\Codex_File\simread-official-output-compatibility\official-recheck-20260817`。

- 锁定 NIST `contamx3.exe` 3.4.0.3 和 `simread.exe` 3.4.0.3；文件 SHA-256 与 `resources/contam-tools.lock.json` 一致。
- `valThreeZonesWthCtm-UseApi.prj`：ContamX 退出码 0；SimRead Zone 1、2、3 均退出码 0、状态 `succeeded`，各有 289 个样本；官方 NFR 的边界空格已被兼容解析；每个结果仍标记 `day_type_not_available`，没有推断日类型。
- `demo1c.prj`：ContamX 退出码 0；SimRead 进程退出码 0 但没有节点空气状态输出，CLI 以退出码 1 返回 `simread_node_air_state_unavailable`。失败清单显示 `process_started=true`、`.lfr/.xrf` 已生成，保留官方运行证据。
- 两个源 fixture 的 SHA-256 在运行前后保持：`demo1c.prj` 为 `1E2623D8904C0D37F0EB207099782AD2C1895DBA4032E0511B9C8A188748F406`；`valThreeZonesWthCtm-UseApi.prj` 为 `1CAFB2F0FEF511F19EF88358238A1C1175C593187691FF7545DB982F5E6E75ED`。

## 最终验证

- 第一次 Full 在 Rust format check 处失败，84 项通过、1 项失败；唯一问题是 `src-tauri/src/zone_bridge.rs` 中一行常量的 `rustfmt` 换行格式。
- 仅修复该确定性格式问题后，`cargo fmt --check` 和 Docs 门禁（55 checks）通过。
- 修复后的最终 Full 退出码为 `0`，汇总为 `QA-01 passed: 85 checks passed`；Python 409 passed、前端 407 passed、Rust 179 passed/1 ignored，生产构建、Clippy、Cargo check、合同和 `git diff --check` 均通过。
- 最终 Full 日志：`F:\Codex_File\simread-official-output-compatibility\full-verification-final.log`；退出码：`F:\Codex_File\simread-official-output-compatibility\full-verification-final-exit.txt`。

GitHub Windows CI、GUI、真实 Provider、打包、签名、发布和用户验收仍按独立状态记录；本任务没有使用 Computer Use、真实凭据、真实 AppData 或用户工程。
