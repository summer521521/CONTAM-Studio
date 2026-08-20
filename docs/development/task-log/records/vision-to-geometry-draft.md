# Vision to Geometry Draft

```yaml
task_id: vision-to-geometry-draft
phase: Geometry Workbench
title: Codex Luna 受控读图与可确认几何草案
status: completed
record_origin: live
started_at_utc: 2026-08-10T07:15:02Z
ended_at_utc: 2026-08-10T08:11:42Z
duration_seconds: 3400
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进 AI 助手真实读图与画图能力，并明确改用 Codex 订阅登录，由 gpt-5.6-luna 独立完成视觉理解和几何草案生成；前序 Spatial Command Deck 已建立不伪造像素能力的禁用入口。
task_summary: 在既有附件隔离、Codex App Server 登录、几何命令历史和用户审批边界内，建立一次性像素披露、Luna 结构化几何草案、确定性本地预览与显式应用确认的纵向链路。
goals:
  - 仅对用户明确选中的 Studio 隔离图片执行一次性像素披露，并在 Rust 内校验格式、哈希、大小和尺寸
  - 固定请求当前 Codex 模型目录中的 gpt-5.6-luna，并要求其同时声明 image 输入能力
  - 通过 Codex App Server 的 localImage 与 outputSchema 生成受限观察和几何操作草案
  - 在前端先执行确定性预览、Diff 和验证，用户确认后才以 ai_suggestion 身份写入几何历史
  - 保留取消、并发互斥、项目/Revision/几何基线过期拦截和中英文无障碍状态
allowed_scope:
  - Rust/Tauri AI Provider、附件隔离读取、项目身份查询、命令权限和契约
  - Geometry Workbench、几何批次预览/审批、desktop-api、i18n、样式和聚焦测试
  - Geometry Workbench 架构、任务日志、能力矩阵和第三方依赖说明
forbidden_scope:
  - 使用、记录或回显用户粘贴过的密钥，读取 Credential Manager、真实 AppData 或用户唯一工程
  - 将不具备 image 输入能力的 Codex 模型用于读图，或绕过结构化 Schema、确定性验证或用户确认
  - 把图片路径或像素返回前端、把图片长期上传到 Provider 文件存储、自动应用草案或直接写 PRJ
  - reset、checkout、clean、stash、worktree、提交、推送、打标签、打包、签名或发布
validation:
  - 使用纯函数与 Rust 单元测试覆盖 Provider payload、图像边界、Schema、取消、过期和审批
  - 运行前端聚焦测试、Rust 聚焦测试、Tauri 命令合同、生产构建和一次最终 Full
  - 真实 Provider、真实 Tauri GUI、打包、签名、发布和用户验收独立记录，不由 Mock 或浏览器测试替代
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed；github_windows_ci=pending_push；manual_gui=not_run；real_tools=not_run；real_provider=not_run；packaged=no；clean_machine=not_run；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
```

## 开始事实

- `main`、`HEAD` 与 `origin/main` 均为 `8c0836b00c9bde4cebcdd0f25871be94fa1f2961`。
- 工作树包含 Geometry Workbench Foundation、Geometry Editor Integration 与 Spatial Command Deck 的累积未提交修改；本任务只做增量实现。
- 现有附件中心只披露图片元数据，`image_pixels_sent=false`；前端无法取得隔离文件路径或像素。
- 本机当前 Codex App Server 生成协议 Schema 明确支持 `localImage` 输入、`outputSchema`、只读 Sandbox 和 `approvalPolicy=never`；图片无需进入前端或转换为 data URL。
- 用户指定固定模型 `gpt-5.6-luna`。实现必须先与当前 Codex 模型目录精确匹配，并验证目录声明包含 `image` 输入；不可静默回退到其他模型。
- Codex 只返回 `geometry_ai_draft.v1` 草案；本地确定性命令和几何验证器仍是是否可应用的权威边界。

## 当前状态

- `implementation=complete`
- `automated_verified=passed`
- `github_windows_ci=pending_push`
- `manual_gui=not_run`
- `real_tools=not_run`
- `real_provider=not_run`
- `packaged=no`
- `clean_machine=not_run`
- `signed=not_run`
- `released=no`
- `user_validated=not_run`
- `merged_to_main=no`

## 实现结果

- 几何读图不再经过 DeepSeek、Gemini 或 API Key Provider。该入口只接受现有 Codex App Server 的 ChatGPT 订阅登录，并固定使用模型目录中可用且声明 `image` 输入的 `gpt-5.6-luna`；模型缺失、认证模式不符或图片能力未声明时关闭失败，不回退其他模型。
- 用户点击生成时，Rust 从 Studio 自有隔离区重新验证所选 PNG/JPEG 的 UUID、选择状态、文件归属、大小、尺寸、签名和 SHA-256；WebView 始终不接收路径或像素。图片通过 App Server `localImage` 只交付给一次性临时 Thread。
- Luna 回合固定为 `approvalPolicy=never`、只读 Sandbox、`networkAccess=false`、空 MCP/动态工具/环境，并以闭合 `outputSchema` 只接受 `add_vertex`、`add_wall`、`create_zone_region` 和 `place_opening` 四类最多 256 个操作。
- Rust 再次验证项目、Revision、source/identity、geometry hash、图片 hash、稳定 ID、操作顺序、同楼层引用、Zone 语义绑定和数量上限；项目或图片变化、取消、迟到回合、工具/审批事件和协议不确定状态均拒绝结果。
- 前端先在不修改历史的候选几何上重放操作，并以独立叠加层显示候选 Zone、墙和开口。只有用户再次点击确认后，操作才以 `ai_suggestion` 身份和逐命令 `approved_by=user` 证据进入同一可撤销历史；原始 PRJ 仍不可写。
- 补齐第 66 个 Tauri 命令的命令契约、ACL、自动生成权限和 Rust 权威登记；未新增运行时依赖。

## 验证结果

- 前端全量：37 个测试文件，296 项通过；生产构建通过。主入口 608.20 kB，Geometry Workbench lazy chunk 34.97 kB；既有 ECharts 550.62 kB 与主入口体积警告保留，未提高阈值。
- Python：384 项通过；Ruff 通过。
- Rust：157 项通过、1 项按设计忽略；`cargo fmt --check`、严格 Clippy 和 `cargo check` 通过。Codex 几何聚焦测试 4 项通过。
- 合同：Geometry Foundation 51、Editor Integration 30、Spatial Command Deck 23、Vision to Geometry Draft 19；Tauri 命令集合 66 个完全一致；Rust 权威合同及变异测试通过。
- 首次 Docs 预检发现新公开 Tauri 命令未登记于 `rust-authority.v1.json`，因此以 40 项通过、2 项失败退出；登记后聚焦复测与 Docs 42 项全部通过。该问题在最终 Full 前修复。
- 最终 Full 仅运行 1 次，退出码 `0`，汇总 `QA-01 passed: 72 checks passed`，用时约 149.4 秒。日志：`F:\\Codex_File\\vision-to-geometry-draft\\full-verification.log`；退出码证据：`F:\\Codex_File\\vision-to-geometry-draft\\full-verification-exit.txt`。
- `git diff --check` 通过，仅有 Git 的 LF/CRLF 转换提示，无 whitespace error；未发现凭据形状的仓库字符串。

## 未执行边界

- 本轮没有发起真实 Codex 图片推理，故 `real_provider=not_run`；自动 Schema、Mock、载荷和模型目录测试不替代真实订阅请求。
- 当前代码成功以 `pnpm tauri dev --no-watch` 启动真实 debug 程序和 WebView2。Computer Use 在重新绑定开发窗口时先报告窗口所有者变化，按规范重置后仍无法激活已捕获窗口，因此在任何页面点击、图片披露或 Provider 请求前停止；这只证明启动链可运行，不构成 GUI 或真实 Provider 验收，`manual_gui` 与 `real_provider` 均保持 `not_run`。本轮精确启动的 18 个进程已清理，1420 端口和 `contam-studio.exe` 均确认停止；既有 1422 开发服务未触碰。
- 未进行系统缩放或用户验收；此前 Browser Design QA 不提升本任务的 `manual_gui`。
- 未读取 Credential Manager、API Key、Cookie、WebView 数据库、真实 AppData 或用户唯一工程，也未使用用户曾粘贴的任何密钥。
- 工作树继续保留 Geometry Workbench Foundation、Editor Integration、Spatial Command Deck 与本任务的累积修改；未 reset、checkout、clean、stash、worktree、提交、推送、打标签、打包、签名或发布。
