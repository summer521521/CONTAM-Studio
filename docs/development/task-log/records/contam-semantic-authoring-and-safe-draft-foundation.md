# CONTAM Semantic Authoring and Safe Draft Foundation

```yaml
task_id: contam-semantic-authoring-and-safe-draft-foundation
phase: Geometry Workbench
title: CONTAM 语义对象创作与安全草稿基础
status: completed
record_origin: live
started_at_utc: 2026-08-13T14:29:39Z
ended_at_utc: 2026-08-13T15:45:14Z
duration_seconds: 4535
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进；当前 Geometry Workbench 已完成真实建筑几何编辑，下一目标是让几何对象能够创建有物理意义的 CONTAM Zone 与 Airflow Path 草稿，而不再只能绑定既有 PRJ 对象。
task_summary: 基于 NIST CONTAM 3.4 PRJ 文档、官方 fixture 与公开参考实现，建立应用自有语义草稿、严格跨语言验证和只写新副本的 PRJ 增量创作链；Zone 体积与路径元件必须是显式物理输入，几何推导只能作为可审查建议。
goals:
  - 建立版本化 CONTAM 语义草稿，覆盖普通 Level、well-mixed Zone 和受支持的 Airflow Path
  - Zone 与 Geometry Zone Region、Airflow Path 与 Geometry Opening/Anchor 使用同一稳定身份绑定
  - 几何面积乘层高只能生成体积建议，未经明确采用不得成为仿真输入
  - Airflow Path 只能引用当前 PRJ 中已验证的 plr_orfc 或 plr_leak3 元件
  - 将新增 Zone、初始浓度和路径按官方区段规则写入全新草稿副本，并明确不伪造 SketchPad 图标
  - 写入后重新解析、核对差异和身份，并保留原始 PRJ 字节不变
allowed_scope:
  - TypeScript、Python 与 Rust 的语义草稿契约、验证、命令和项目绑定持久化
  - Geometry Workbench 的 Zone/FlowPath 属性创作、显式确认和 Patch/Diff 接入
  - 已验证 PRJ 区段的最小增量写入、官方 fixture 与 ContamX 聚焦验证
  - 必要的 ADR、架构、双语文案、权限、合同、任务日志和统一验证
forbidden_scope:
  - 重写 ContamX、覆盖原始 PRJ、静默推断体积或 airflow element 参数
  - CFD、1D Zone、AHS、duct、control、schedule、污染源或任意未知 PRJ 结构创作
  - 第二套画布、第二套撤销历史、前端路径或文件系统权限
  - 真实用户工程、真实凭据、Computer Use、提交、推送、打包、签名或发布
validation:
  - 开发中运行语义草稿、PRJ 增量写入、三端验证、Geometry 绑定与桌面命令聚焦测试
  - 收口时运行全量测试、生产构建、描述性合同、任务日志、diff check 和一次最终 Full
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed。
  - github_windows_ci=pending_push；manual_gui=not_run；real_tools=passed（本任务要求的官方 ContamX 求解）；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
  - SimRead 额外探测未通过：一个 fixture 无节点状态结果，另一个触发现有严格解析器的官方数值空格格式拒绝；不计作本任务 ContamX 可求解副本失败，也不虚构结果读取通过。
```

## 当前证据

- NIST TN 1887r1 Appendix A 明确规定 Level/Icon、Zone、Initial Zone Concentration 和 Airflow Path 的区段顺序、计数、终止标记及字段。
- 三个仓库内官方 fixture 共同证明普通 well-mixed Zone 使用 19 字段记录，普通 Airflow Path 使用当前严格读取器接受的 30 字段记录。
- 几何闭合区域不等于物理 Zone：体积、初始温度、压力及 airflow element 必须作为显式建模事实保存。

## 实施记录

- 新增严格 `contam_semantic_draft.v1`，以固定点整数表达 Zone 体积、初始温度/压力、FlowPath multiplier/位置/高度；TypeScript、Python、Rust 共享 fixture canonical SHA-256 `08ebf8937b1640ca13a55b701a84e3b83b05e77c665e5986ec4a795018229586`。
- `geometry_document.v1` 向后兼容保存 `semantic_draft` 与独立 canonical hash；Rust 重新绑定当前 project session、identity、source hash、Revision、Level、既有 Zone、受支持 flow element 和几何 region/opening/anchor。
- `useGeometryWorkbench` 使用一条 `{commandCount, semanticBefore, semanticAfter}` 历史。创建 Zone 时封闭墙面与语义 Zone 原子提交；创建 Airflow Path 时 opening anchor 与路径原子提交；撤销/重做、持久化和陈旧响应保护不分叉。
- 新 Zone 要求严格 CONTAM name、显示名和明确体积来源。几何估算使用整数毫米多边形面积 × Level height，并且只有用户选择确认采用后才写入 `volume_litres`。
- 新 Airflow Path 只能放在已审计的墙上 opening，端点来自实际 Zone/室外边界，只能引用源 PRJ 中已验证的 `plr_orfc` 或 `plr_leak3` flow element；用户显式填写 multiplier、相对高度和方向。
- Python `semantic_authoring_export.py` 只编辑严格识别的 Zone、Initial Zone Concentration 和 Flow Path 区段。它排他创建新副本、保持其他源字节及换行、写入与 species 数量相同的零初始浓度，并在写后重读 Zone 与 airflow network。
- 新 Tauri 命令 `export_semantic_authoring_draft_copy` 只接受 request/session/Revision，不接受路径或 WebView 提供的草稿。Rust 重新加载当前持久化草稿，通过原生对话框选择不存在的新 `.prj`，核对 Worker 严格响应、对象 ID/编号、源/输出 SHA-256、大小和上下文新鲜度。
- 导出固定 `sketchpad_geometry_written=false`；不会写 Studio 墙、房间轮廓、门窗或 Level icon，也不会把可求解数值对象描述为 ContamW 等价平面图。
- 证据浮层加入“导出可求解 PRJ 副本”动作，只显示安全文件名、新增对象数量和明确 SketchPad 限制，不向前端返回绝对路径。
- 架构、ADR-026、威胁模型、双语文案、Tauri ACL、统一命令合同和描述性合同已同步。

## 验证结果

- 语义草稿、跨语言绑定、原子历史、导出响应和 locale 聚焦前端测试：18 项通过；`pnpm exec tsc --noEmit` 通过。
- Python 语义草稿、增量导出与 Worker 操作：36 项通过。
- Rust 语义草稿合同：4 项通过；语义导出响应所有权/SketchPad 拒绝：1 项通过；`cargo check` 与 `cargo fmt --check` 通过。
- Tauri 命令合同：71 个命令 exact Rust/build/capability/generated permission/TypeScript 集合通过。
- 官方工具 UAT 使用隔离 `demo1c.prj`：源 SHA-256 前后均为 `1E2623D8904C0D37F0EB207099782AD2C1895DBA4032E0511B9C8A188748F406`；新副本 SHA-256 为 `98035D754FC432546C3D29CEF50DBF0E020AFBE47940DD4B7E922A4C9DA09955`，新增 Zone #8 与 Airflow Path #18。
- 锁定 SHA-256 的官方 ContamX 3.4.0.3 对该副本求解成功，退出码 0，生成 `.sim` 与 `.xlog`；运行输入保持不变。证据清单：`F:\Codex_File\contam-semantic-authoring-foundation\official-tool-uat-final-20260813\contamx-run\20260813T153220Z-25afbb05\evidence\manifest.json`。
- SimRead 额外探测保持失败事实：`demo1c` 返回 `simread_output_missing`（没有 node contaminant results）；`valThreeZonesWthCtm-UseApi` 求解成功后，严格结果解析返回“结果数值空格格式不受支持”。
- 第一次 Full 退出码 1：57 项通过、6 项失败；Docs 门禁发现 Rust authority 漏登记 2 个公开响应类型和 1 个 Tauri 命令，另有 4 个 Geometry 描述性合同仍查找已被统一语义历史取代的 `undoBatchSizes`。Fast/Full 主体因门禁失败未启动。
- 上述确定性合同漂移已修正；Rust authority 及 mutation、Geometry Foundation、Editor Integration、Direct Manipulation、Topology-aware Intersections 聚焦复测全部通过。按项目规则允许为本轮确定性修复再运行一次最终 Full。
- 第二次 Full 进入全部执行阶段，83 项通过、1 项失败：严格 Clippy 发现本轮为几何文档增加语义草稿参数后，两个保存函数超过参数计数阈值，另有一个三集合返回值触发 type-complexity；其余 Docs、Python、前端、Rust tests、生产构建、Windows CI 合同、fmt 与 Cargo check 均通过。
- 已将三集合提取为 `SemanticContextSets` 类型，并按仓库现有 Tauri facade 规则对两个固定协议签名显式限定 `too_many_arguments`；严格 `cargo clippy --locked --all-targets -- -D warnings` 聚焦复测通过。由于第二次 Full 的唯一失败已确定性修复，将再运行一次最终 Full 并如实记录总次数。
- 第三次最终 Full 退出码 0：`QA-01 passed: 84 checks passed`。Docs/描述性合同、Python、前端、Rust、生产构建、Windows CI 合同及 12 个 mutation、fmt、严格 Clippy、Cargo check 全部通过；Rust 为 179 passed、1 ignored。Full 总运行次数为 3，前两次失败及修复事实均保留在本记录中。
