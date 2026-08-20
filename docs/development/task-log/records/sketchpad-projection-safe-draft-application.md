# SketchPad Projection Safe Draft Application

```yaml
task_id: sketchpad-projection-safe-draft-application
phase: Geometry Workbench
title: SketchPad 候选位置安全审查与草稿应用
status: completed
record_origin: live
started_at_utc: 2026-08-11T05:58:26Z
ended_at_utc: 2026-08-11T06:18:35Z
duration_seconds: 1210
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；总监选择把上一目标的有损 SketchPad 候选位置接入已有 Semantic Patch、Diff、用户确认和应用管理草稿副本链。
task_summary: 保持 sketchpad_projection_preview.v1 不可直接应用；新增纯候选转换、上下文与冲突校验，再复用现有语义 Patch planner 和统一检查器完成显式 Diff 审查，不自动应用、不覆盖原始 PRJ。
goals:
  - 将同一项目、source、identity 和 Revision 下的候选移动转换为既有图标 column/row 操作
  - 拒绝碰撞、重复、超限、陈旧或篡改候选，不从 Canvas Node 反推业务写入
  - 从 SketchPad 浮层进入统一 Semantic Patch Diff，并要求第二次用户确认
  - 只通过 Rust 权威边界创建新的应用草稿副本，补强 plan/apply 迟到响应防护
allowed_scope:
  - SketchPad 候选纯转换、React Patch journey、统一检查器入口与双语状态
  - 现有 semantic Patch/Diff/apply 链路的上下文校验、聚焦测试、合同与事实源
forbidden_scope:
  - 直接应用 projection preview、覆盖原始 PRJ、自动确认或绕过 Diff
  - 新增删除图标、改变 icon type/object number/Level/顺序、写入墙体或 Zone 真实构造
  - 普通 AI 生成图标位置 Patch、读取真实 AppData/用户工程/凭据/Provider 数据
  - Computer Use、提交、推送、打标签、打包、签名或发布
validation:
  - 开发中运行候选转换、语义状态、视觉工作区与 Patch 边界聚焦测试
  - 收口时运行一次最终 Full，并独立记录 GUI、远程 CI、Provider、工具、打包和发布状态
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed。
  - github_windows_ci=pending_push；manual_gui=not_run；real_tools=not_run；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
```

## 基线判断

- `sketchpad_projection_preview.v1` 已生成只读、有损且碰撞关闭失败的候选移动，但固定 `can_apply=false`，尚未连接 Patch planner。
- Python/Rust 已验证 `set_spatial_icon_column` 与 `set_spatial_icon_row`，只移动既有图标并创建新的应用草稿副本。
- 产品层必须把“准备候选 Diff”和“确认应用”分成两个用户动作，且项目或 Revision 改变后不得接收迟到 plan/apply 响应。

## 实现结果

- `sketchpad_projection_preview.v1` 新增 project session 与 source SHA-256，但继续固定 `lossy=true`、`can_apply=false`；它仍只是候选比较证据。
- 新增纯 `prepareSketchpadProjectionPatch`：重新校验 schema、项目上下文、安全 ASCII ID、非负整数坐标、变化标记、重复图标/Zone、最终单元冲突和 128 操作上限，只输出实际变化的 `column` / `row` 字段。
- SketchPad 浮层新增“审查候选移动”，只准备现有 Semantic Patch Diff。用户必须在统一检查器中第二次点击应用，Rust 才创建新的应用管理 PRJ 草稿副本。
- 沿用 Python 四整数记录、网格边界、碰撞、事务重算、写后重读与非覆盖副本验证；未增加 Tauri 命令、文件路径参数或第二套写入接口。
- plan 响应现在精确绑定 request、session、Revision、source hash 和操作数量；apply 响应精确绑定 request、session 与 patch。项目上下文改变后的迟到 plan/apply 被丢弃，加载新语义快照会清空旧操作、选择与审查。
- 语义检查器在 planning/review/applying 时锁定字段和 undo/redo，避免已审查 Diff 被界面编辑替换；放弃仍可用。
- 新增 [ADR-024](../../../adr/ADR-024-route-sketchpad-candidates-through-semantic-patch-review.md)，同步 Geometry Workbench 事实源、架构、当前状态和威胁模型。普通 AI 继续不能生成图标坐标操作。

## 自动验证

- 候选转换、预览、语义状态、视觉浮层和 Patch journey 聚焦：5 个文件、16 项通过；Hook 时序覆盖“只生成 Diff、不自动应用”、项目切换后迟到 plan 与 apply 不污染。
- 前端全量：43 个测试文件、314 项通过。
- 生产构建：通过；主入口 627.37 kB，VisualModelWorkspace 11.39 kB，GeometryWorkbench 43.62 kB。既有 ECharts 550.62 kB 警告保留，未提高阈值。
- 新合同：27 项断言通过；Project Geometry Document 33 项、Verified Icon Round Trip 24 项和 R1-02 责任预算合同继续通过。
- Docs：45 项通过；任务日志合同 92 条记录通过；`git diff --check` 通过，仅有 LF/CRLF 转换提示。

## Final Full

本任务最终 Full 只运行一次：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -Mode Full
```

- 退出码：0
- 用时：90.3 秒
- 汇总：`QA-01 passed: 75 checks passed`
- Python：391 项通过
- 前端：314 项通过
- Rust：165 项通过，1 项按设计忽略
- Rust fmt、严格 Clippy、Cargo check、Windows CI 合同与 12 项变异测试：通过
- 日志：[full-verification.log](<F:/Codex_File/sketchpad-projection-safe-draft-application/full-verification.log>)

## 最终状态

| 维度 | 状态 |
| --- | --- |
| implementation | complete |
| automated_verified | passed |
| github_windows_ci | pending_push |
| manual_gui | not_run |
| real_tools | not_run |
| real_provider | not_run |
| packaged | no |
| signed | not_run |
| released | no |
| user_validated | not_run |
| merged_to_main | no |

未使用 Computer Use，未读取真实 AppData、真实用户工程、凭据或 Provider 数据；未提交、推送、打标签、打包、签名或发布。
