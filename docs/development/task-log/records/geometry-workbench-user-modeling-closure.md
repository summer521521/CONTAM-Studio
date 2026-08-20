# Geometry Workbench User Modeling Closure

```yaml
task_id: geometry-workbench-user-modeling-closure
phase: Geometry Workbench
title: Geometry Workbench 用户建模闭环与草稿生命周期收口
status: completed
record_origin: live
started_at_utc: 2026-08-17T12:17:50Z
ended_at_utc: 2026-08-17T12:21:39Z
duration_seconds: 229
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进 Geometry Workbench 用户建模闭环。
task_summary: 在现有建筑几何、语义创作、应用内持久化和安全导出链路上，收口用户可见的草稿生命周期语义，并补充从编辑到保存恢复的事务回归证据。
goals:
  - 明确区分 Studio 应用内建筑草稿、教学示例与原始 PRJ，避免用户误解写回边界。
  - 保持编辑、语义创作、撤销重做、持久化和安全导出使用同一身份与验证链。
  - 导出可求解副本后明确提示当前项目未切换，避免用户误在原始项目上运行。
  - 为恢复的 geometry_document 与 semantic_draft 补充同一文档修订下的回归测试。
allowed_scope:
  - Geometry Workbench 前端状态表达、双语文案、样式、持久化测试、任务日志和能力矩阵。
  - 现有 geometry_document、semantic_authoring_export、Geometry Workbench controller 链路。
forbidden_scope:
  - 原始 PRJ 写回、前端路径/凭据、第二套 reducer 或画布、ContamX 求解器、系统设置、真实用户数据。
  - 提交、推送、打标签、打包、签名和发布。
validation:
  - 先运行持久化与 Geometry Workbench 聚焦测试、TypeScript 构建和任务日志合同。
  - 收口时只运行一次最终 Full；自动、GUI、真实工具、Provider、打包和发布状态分别记录。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
implementation: complete
automated_verified: passed
github_windows_ci: pending_push
manual_gui: not_run
real_tools: not_run
real_provider: not_run
packaged: not_run
signed: not_run
released: no
user_validated: not_run
merged_to_main: no
notes:
  - 工作树保留 Geometry Workbench 既有累积修改；本任务只在其上增量推进。
  - GUI 验收与官方工具证据沿用前一份 GUI 验收记录，不在本任务中重复宣称通过。
```

## 进行中

- 已发现并修正一个用户可见边界缺口：原有状态字段记录了教学示例和未写回 PRJ，但正式工作台没有显示它们。
- 已补充导出成功后的下一步提示：生成的是新副本，当前项目仍保持不变，需重新打开副本后再运行 ContamX。
- 正在补充恢复 geometry_document 与 semantic_draft 后继续编辑并按当前 document revision 保存的回归测试。

## 证据边界

- 本任务不读取真实凭据、真实 AppData、用户唯一工程或真实 Provider。
- 本任务不把自动测试、真实工具或既有 GUI 验收互相替代。

## 最终收口

- 工作台顶部现在以一个紧凑状态岛明确显示“应用内草稿/教学示例”，并通过 tooltip 说明原始 PRJ 未被写入；窄窗口下自动收敛，不增加独立浮窗。
- 语义导出成功后明确说明：导出的是新 PRJ 副本，当前项目仍保持不变，用户需要从“打开项目”选择副本后再运行 ContamX。
- 持久化回归覆盖已恢复 geometry 与 semantic draft、当前 document revision 绑定以及后续编辑保存到下一修订。
- 聚焦验证：闭环合同 9 assertions；持久化、操作批次和视觉回归 19 tests；TypeScript 构建通过；任务日志合同 104 records 通过。
- 唯一最终 Full：`QA-01 passed: 86 checks passed`；Python 409 passed、前端 409 passed、Rust 179 passed + 1 ignored；生产构建、Windows CI 合同、fmt、Clippy 和 Cargo check 均通过。
- 本任务未重复进行 GUI、真实 Provider、真实工具、打包或发布；未提交、未推送，工作树继续保留全部累积修改。
