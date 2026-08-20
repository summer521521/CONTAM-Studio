# Calibrated Plan Underlay and Building Tracing

```yaml
task_id: calibrated-plan-underlay-and-building-tracing
phase: Geometry Workbench
title: 校准底图与建筑描图
status: completed
record_origin: live
started_at_utc: 2026-08-13T06:46:40Z
ended_at_utc: 2026-08-13T07:58:57Z
duration_seconds: 4337
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户明确要求继续推进；当前目标按总任务路线进入校准底图与建筑描图。
task_summary: 为每个楼层导入由 Rust 管理的 PNG、JPEG 或 PDF 页面底图，通过两个画布点和真实距离建立毫米比例，并提供原点、旋转、透明度、锁定与显隐控制，使现有几何命令可在真实建筑平面参考上描图。
goals:
  - 底图文件保留在 Studio 管理目录，前端只使用不透明资源身份和有界字节响应
  - PNG/JPEG 和指定 PDF 页面均可在 Konva 建筑画布下层渲染
  - 两点校准、原点、旋转、透明度、显隐和锁定是确定性、可撤销、项目级持久化状态
  - 底图与项目 session、source hash、Revision、Level 和资源 SHA-256 绑定
  - 底图不能创建语义对象、修改原始 PRJ 或绕过既有几何命令历史
  - 已授权图片可继续进入既有 Codex 读图草案链，校准变化会使旧草案失效
allowed_scope:
  - building_geometry.v1、geometry_edit_command.v1、项目几何文档与三端验证
  - Rust/Tauri 底图导入和无路径二进制读取命令、权限与契约
  - Konva 底图层、校准交互、楼层上下文控件、双语文案和 Geometry CSS
  - 必要的按需 PDF 渲染依赖、许可证记录、测试、文档和统一验证
forbidden_scope:
  - 修改用户原始底图或原始 PRJ、向 WebView 暴露绝对路径、静默上传图片
  - 从图片自动推断比例、墙体、Zone 或物理尺寸
  - 新增第二套画布、第二套撤销历史或绕过 Rust 文件权限
  - 真实用户工程、真实凭据、Computer Use、提交、推送、打包或发布
validation:
  - 开发中运行底图领域、命令、三端验证、Rust 资源边界、画布和交互聚焦测试
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
  - github_windows_ci=pending_push；manual_gui=not_run；real_tools=not_run；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
```

## 实施记录

- `building_geometry.v1` 为每个 Level 增加最多一个严格 `plan_underlay`；TypeScript、Python 与 Rust 共同验证资源 UUID、SHA-256、MIME、页面、像素尺寸、原点、比例、旋转、透明度、显隐和锁定，旧应用自有文档在原哈希验证后补空集合。
- `geometry_edit_command.v1` 增加设置、更新和移除底图三个操作。所有校准与变换继续通过现有 controller、命令历史、撤销/重做、几何哈希和项目文档保存链路，不建立第二套 Canvas 状态。
- Rust/Tauri 通过原生选择器导入 PNG、JPEG 和 PDF，复用附件隔离检查，将已验证副本原子保存到项目身份绑定的 `geometry-underlays` 目录。读取和保存重新校验 session、Revision、UUID、边界、普通文件形态、签名、大小和 SHA-256，并在 canonicalize 前拒绝符号链接；WebView 不接收绝对路径。
- Konva 在建筑几何下方渲染可见底图；fit 同时纳入活动 Level、下层参考与底图范围。两点校准保留第一点对应的几何位置，使用整数毫米与微米/像素比例，支持原点、旋转、透明度、锁定、显隐、PDF 页码和移除。
- PDF 使用 `pdfjs-dist@6.2.108` 在用户打开 PDF 底图时动态加载并本地渲染，许可证为 Apache-2.0；未增加第二套画布框架。
- 底图导入会登记为 `selected_by_user=false` 的附件。只有用户明确点击“用于 AI”后，图片才进入既有 Codex 登录、上下文回执与结构化几何草案链；导入不等于联网授权。
- 新增 ADR-025、架构、威胁模型、本地数据说明、中英文界面、Tauri ACL、生命周期合同及 38 项描述性合同断言。

## 验证结果

- 底图前端聚焦：5 个文件、46 项通过；前端全量：52 个文件、388 项通过；生产构建通过。
- Python `test_building_geometry.py`：15 项通过；最终 Full 中 Python 全量 396 项通过，Ruff 通过。
- Rust 底图聚焦：2 项通过；最终 Full 中 Rust 173 项通过、1 项按设计忽略；fmt、严格 Clippy 和 Cargo check 通过。
- Calibrated Plan Underlay 合同：38 项；Tauri 命令合同：70 个命令精确一致；数据生命周期：9 类；既有 Geometry Workbench 描述性合同全部通过。
- `git diff --check`：退出码 0，仅有 Git 的 LF/CRLF 转换提示，无 whitespace error。
- Full 实际运行 2 次：第一次用时约 95.7 秒，82 项通过、1 项失败，唯一原因是 Rust ACL 测试仍硬编码新增两个命令前的 69 权限计数；修正为 71 并由聚焦测试确认后，第二次最终 Full 用时约 92.1 秒，退出码 0，`QA-01 passed: 83 checks passed.`
- 构建保留可见的大 chunk 警告：主入口约 680.41 kB、ECharts Canvas 550.62 kB；PDF 主库 482.52 kB、Worker 1,312.45 kB 均为动态资源，没有提高警告阈值。

## 未执行边界

- 不使用 Computer Use；正式截图矩阵留到 Geometry Workbench 视觉集成完成后。
- 未读取真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程。
- 未执行真实 Provider、官方 ContamX/SimRead、远程 Windows CI、打包、签名、发布或用户验收。
- 未提交、推送、打标签、reset、checkout、clean、stash 或使用 worktree；R1 之后累积 Geometry Workbench 修改完整保留在当前工作树。
