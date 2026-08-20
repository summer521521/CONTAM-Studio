# Project Geometry Document and SketchPad Preview

```yaml
task_id: project-geometry-document-and-sketchpad-preview
phase: Geometry Workbench
title: 项目级建筑几何文档与 SketchPad 有损投影预览
status: completed
record_origin: live
started_at_utc: 2026-08-11T05:06:04Z
ended_at_utc: 2026-08-11T05:39:24Z
duration_seconds: 2000
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；总监选择先解决 Studio 建筑草稿重启丢失，再提供不直接写 PRJ 的 SketchPad 候选位置预览。
task_summary: 在 Rust/Tauri 权威边界内按 PRJ 基线身份保存、恢复和备份 application-owned building_geometry.v1；以纯确定性函数生成仅供比较的既有 Zone 图标候选移动并叠加到只读 SketchPad，不自动应用。
goals:
  - 建立严格、限额、哈希绑定且不暴露路径的 geometry_document.v1
  - 以应用本地数据目录和 PRJ baseline SHA-256 作为项目级存储边界
  - 原子保存并保留一代已验证备份，主文件损坏时只读恢复备份
  - React 在项目/Revision 切换时阻止迟到 load/save 污染，并对已确认几何自动保存
  - 从 Studio Zone 区域质心生成显式有损、不可直接应用的 SketchPad 候选移动叠层
allowed_scope:
  - building geometry 合同、Rust/Tauri 存储命令、前端 desktop-api 与 geometry controller
  - SketchPad 预览纯函数、Konva 只读叠层、中英文状态文案和聚焦测试
  - Geometry Workbench 架构、ADR、合同、任务日志和能力矩阵
forbidden_scope:
  - localStorage 保存建筑几何、前端接收本机路径、相邻 PRJ sidecar 或修改原始 PRJ
  - 自动应用投影、创建删除 PRJ 图标、推断真实 CONTAM 墙体或宣称无损 round trip
  - 读取真实 AppData、真实用户工程、凭据或 Provider 数据
  - Computer Use、提交、推送、打标签、打包、签名或发布
validation:
  - 开发中运行 geometry document、投影、controller、Tauri 命令和 Rust 存储聚焦测试
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

- 当前 `building_geometry.v1` 与命令历史只在 React 会话中存在，项目重新打开后不会恢复。
- `floating_workbench_layout.v1` 只适合主题和布局偏好，继续禁止存储项目模型。
- 当前 SketchPad 画布显示的是 PRJ 的可信离散图标；Studio 毫米几何只能生成明确标注为有损的比较预览。

## 实现结果

- 新增严格 `geometry_document.v1`：只接受 application-owned、available 的 `studio_metric_draft`，绑定 PRJ 基线 identity、canonical geometry SHA-256、单调文档修订和保存时间。
- Rust 只在 `<app-local-data>/geometry-documents/<baseline-sha256>.json` 读写，不接收 WebView 路径。保存采用进程内串行化、乐观修订、临时文件、`sync_all`、重命名和写后重读；保留一代已验证备份，损坏主文件进入隔离。
- 新增 Tauri `load_project_geometry_document` / `save_project_geometry_document`、精确 ACL、生成权限、desktop-api 与 68 命令权威合同。保存响应不回传几何正文或本机路径。
- React 稳定父层先恢复文档再开放新建，确认后的几何以 350 ms 合并自动保存；项目、source、Revision 或请求序列变化会丢弃迟到 load/save。备份恢复、保存中、失败与重试均有中英文状态。
- 设置页存储统计新增 `geometry-documents` 用户数据类别；隐私指南明确它不是 PRJ sidecar，卸载与清理不会被静默执行。
- 新增 `sketchpad_projection_preview.v1`：按 Level 计算 Studio Zone 多边形质心，将相对位置归一化到现有绑定 Zone 图标边界并翻转 Y 轴。输出稳定检测最终单元碰撞，固定 `lossy=true`、`can_apply=false`。
- SketchPad 只显示不接收事件的虚线箭头和幽灵锚点；预览不调用 Patch planner、不创建或删除图标、不写原始 PRJ 或副本。
- 新增 [ADR-023](../../../adr/ADR-023-store-project-geometry-as-app-owned-document.md)、两份 JSON Schema、架构/威胁模型/当前状态/研发事实源和数据生命周期声明。

## 验证结果

- Geometry document / SketchPad projection / Hook / desktop-api / visual workspace 聚焦前端：6 个文件，35 项通过；新增 Hook 时序测试覆盖 350 ms 合并、期望修订和项目切换后的迟到恢复。
- Rust geometry document：4 项通过，覆盖主文件 round trip、备份轮换、损坏恢复、冲突、身份拒绝和并发首次保存。
- Project Geometry Document 合同：32 项断言通过。
- Tauri 命令合同：68 个命令精确一致；Rust authority：4 个文件、8 个进程调用注册通过。
- 数据生命周期：8 项声明通过；变异测试通过。
- 生产构建通过；主入口 618.25 kB，Geometry Workbench 43.42 kB，Konva 保持 lazy；既有 ECharts 550.62 kB 警告保留，未提高阈值。
- 严格 Clippy、Cargo check、Rust fmt、任务日志合同和 `git diff --check` 通过。`git diff --check` 只有 LF/CRLF 转换提示，无 whitespace error。

## Full 运行事实

本任务共运行三次 Full，失败证据均保留：

1. 第一次退出码 1，52 项通过、1 项失败，用时 24.826 秒。唯一失败是旧 Geometry Editor 合同仍要求“仅当前会话”；实现和 UI 已改为应用数据持久化且仍不写 PRJ。修正该事实漂移后聚焦合同通过。
2. 第二次退出码 1，73 项通过、1 项失败，用时 87.700 秒。唯一失败是 Rust ACL 单测仍硬编码 67 个权限；本任务增加两项权限后实际为 69。修正计数并补入命令名称后，聚焦 Rust 测试和 68 命令 Tauri 合同通过。
3. 最终 Full 退出码 0，用时 75.896 秒，`QA-01 passed: 74 checks passed`。Python 391 项、前端 306 项、Rust 165 项通过且 1 项按设计忽略；生产构建、Clippy、Cargo check、Windows CI 合同与 12 项变异测试均通过。

证据目录：[project-geometry-document-and-sketchpad-preview](<F:/Codex_File/project-geometry-document-and-sketchpad-preview>)。最终日志：[full-verification-final-2.log](<F:/Codex_File/project-geometry-document-and-sketchpad-preview/full-verification-final-2.log>)。

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
