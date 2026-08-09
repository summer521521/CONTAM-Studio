# R1-03 Visual Model Workspace

```yaml
task_id: r1-03-visual-model-workspace
phase: Renewal R1
title: Visual Model Workspace——可视化模型工作区
status: completed
record_origin: live
started_at_utc: 2026-08-01T12:41:05Z
ended_at_utc: 2026-08-01T14:51:04Z
duration_seconds: 7799
base_commit: 4aa64c507ecf730b79c77aec31ae8474717c37b5
branch: main
task_source: 用户提供的 R1-03 Visual Model Workspace 完整任务书
task_summary: 在现有语义读取链路上增加严格、版本化的空间投影，并交付只读 SketchPad 示意与气流拓扑双模式工作区。
goals:
  - 从官方 fixture 严格投影 Level/Icon 事实，保留 unknown 图标且不伪造空间几何
  - 通过现有 Python semantic bridge 和 Rust/Tauri 边界向前端提供 spatial_projection.v1
  - 使用 lazy-loaded Konva 交付 SketchPad 示意和确定性气流拓扑模式
  - 复用唯一语义 selection，与项目树、属性面板和项目/revision 身份保持一致
  - 提供无需 Canvas 的可访问对象列表、诚实降级状态和代码级响应式支持
allowed_scope:
  - Python 空间投影、现有语义协议扩展、Rust bounded validation 及其测试
  - TypeScript 空间类型和纯转换、React/Konva 只读画布、i18n、CSS、依赖许可和合同
  - R1 文档、任务日志、能力矩阵及 F:\\Codex_File\\r1-03-visual-model-workspace 临时证据
forbidden_scope:
  - 真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 和用户唯一工程
  - 原始 PRJ 直接写入、第二套 selection 或写入链路、伪造 Zone 多边形和物理距离
  - Computer Use、正式截图矩阵、提交、推送、打标签、打包、签名和发布
validation:
  - 开始基准：main、HEAD 与 origin/main 均为 4aa64c507ecf730b79c77aec31ae8474717c37b5。
  - 继承的 R1-01/R1-02 跟踪差异为 35 个文件、660 insertions、5761 deletions；完整开始状态记录在 F:\\Codex_File\\r1-03-visual-model-workspace\\baseline.md。
  - Python spatial/bridge 聚焦测试：45 项通过；官方三个 fixture 锁定 Level/icon 数量、column/row、bounds、稳定 ID、binding 与源哈希不变，缺失/重复/截断/计数/整数/坐标/终止符/超限变异均被拒绝或诚实降级。
  - Python 全量：python/.venv/Scripts/python.exe -m pytest python/tests -q；退出码 0，364 项通过；Ruff 退出码 0。
  - Rust spatial 聚焦：3 项 typed validator 测试和 1 项真实 Python semantic bridge 集成测试通过；后者校验官方 fixture 63 个图标且源文件字节不变。
  - Rust 全量：cargo test --locked；退出码 0，133 项通过、1 项需要显式真实结果 JSON 的测试按设计忽略；cargo fmt --check、Clippy -D warnings、cargo check 均通过。
  - 前端聚焦：spatial model、工作台迁移、语义状态、VisualModelWorkspace 和 locale 共 23 项通过；最终 pnpm test 退出码 0，25 个文件、208 项通过。
  - pnpm build 退出码 0；R1-02 主入口 493.29 kB 增至 498.30 kB（+5.01 kB），Spatial 5.38 kB、VisualModelWorkspace 10.54 kB、Konva Canvas 315.94 kB 均为独立 lazy chunk；既有 ECharts Canvas 550.62 kB 警告保持可见。
  - R1-01/R1-02/R1-03 合同分别通过 41/45/65 项断言；comprehensive-validation-v1 通过 3 个源项目、3-operation Patch、6 个附件和完整校验和。
  - Full 共运行 2 次。第 1 次退出码 0、65 项检查通过、用时 128.046 秒；随后收口审计发现拓扑 tooltip 尚未展示已有的 flow element 事实，补齐该显示和中英文文案，并以 3 个文件、17 项聚焦测试、生产构建和 65 项 R1-03 合同验证修复。
  - 最终 Full：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\verify.ps1 -Mode Full；第 2 次退出码 0，65 项检查通过，用时 98.282 秒；Python 364 项、前端 208 项、Rust 133 项通过，另 1 项需显式真实结果 JSON 的 Rust 测试按设计忽略。
  - Full 日志：F:\\Codex_File\\r1-03-visual-model-workspace\\full-verification-run-1.log 和 F:\\Codex_File\\r1-03-visual-model-workspace\\full-verification.log；退出码证据分别为同目录 full-verification-run-1-exit.txt 与 full-verification-exit.txt。
  - git diff --check：退出码 0；仅有 Git 的 LF/CRLF 提示，无空白错误。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed；github_windows_ci=pending_push；manual_gui=not_run；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
  - R1-01/R1-02 累积修改是本轮不可回退基线；R1-02 已获总监审查通过。
  - 记录顺序判断：NISTIR 7049 prose 对 row/column 的描述存在歧义，但真实 section header、三个官方 fixture 与 OpenStudio IconImpl read/write 共同确认实际顺序为 icon_type、column、row、object_number；回归测试锁定该顺序。
  - spatial_projection.v1 是唯一空间事实源；Python 严格解析，Rust 用 deny_unknown_fields typed payload 校验 identity/source/revision、limits、bounds 和 semantic binding，前端不解析 PRJ。
  - 安全上限：256 Levels、100000 icons、512 UTF-8 bytes/string、坐标绝对值 1000000、1024 warnings、8 MiB payload；均使用命名常量并有边界或变异测试。
  - 图标常量仅使用 NIST/OpenStudio 共同核对的最小映射；未复制 OpenStudio 代码或增加依赖，其 BSD-style 参考归属及 Konva/react-konva MIT 许可已写入 THIRD_PARTY_NOTICES.md。
  - 新直接依赖精确锁定 konva 10.3.0、react-konva 19.2.5；与 React 19.2.7 兼容，且只由 ProjectPage lazy visual boundary 加载。
  - SketchPad 只画经验证的网格图标、墙段和中性锚点；拓扑按 Level、CONTAM number 和稳定 ID 确定性布局。两者复用 semantic selection，画布没有 PRJ 写入、图元拖动或第二套 reducer。
  - 大于 20000 图元/拓扑节点时按可见范围简化绘制；可访问对象列表搜索并每页 50 项。未知图标、unbound、空间 unavailable 和 Canvas failure 均有列表或拓扑降级。
  - 已知限制：本轮只读，不推断房间多边形、物理尺度或结果；未执行 Computer Use、正式 GUI 截图矩阵、125%/200% 人工缩放、真实 Provider、打包、签名、发布或用户验收。
  - R1-04 可复用 SpatialProjection、TopologyLayout、VisualSelectionProjection、semantic selection 与 project/revision reset；不得从 Konva Node 读取业务身份。
  - R1-04 开场已用聚焦测试解决总监遗留项：viewport command sequence 一次性消费、Python/Rust 空间字段边界镜像且 malformed spatial 只降级空间能力、单一 Canvas 焦点路径、确定性二维大型拓扑布局与有效 fit；R1-03 仍保持 completed_waiting_review，是否 director_review_passed 由总监决定。
  - R1-05 启动时收到总监结论：R1-03 director_review_passed。该结论只更新审查事实，不改变本日志既有自动验证、GUI、Provider、打包或发布状态。
  - 未读取真实凭据、Credential Manager、Cookie、WebView 数据库或真实 AppData；未修改用户唯一工程，测试仅使用 fixture 和临时副本。
```
