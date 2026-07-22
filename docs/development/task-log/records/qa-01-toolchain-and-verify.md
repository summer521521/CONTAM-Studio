# QA-01工具链基线与统一验证入口

```yaml
task_id: qa-01-toolchain-and-verify
phase: QA-01
title: 固定工具链和统一验证入口
status: completed
record_origin: live
started_at_utc: 2026-07-22T05:27:55.2544791Z
ended_at_utc: 2026-07-22T05:33:43.6150992Z
duration_seconds: 348.361
base_commit: 457e289840e2f765d080472ffb49a24608bca0ce
branch: main
task_source: 当前用户指令
task_summary: 建立Windows工具链版本基线和Docs/Fast/Full统一验证入口，不改变产品行为。
goals:
  - 固化项目Python、Node、pnpm和Rust MSVC工具链基线。
  - 让文档、锁文件、差异、测试、构建、格式和Cargo检查可由一个脚本分档执行。
  - 验证入口不自动安装工具、不读取未跟踪用户文件、不执行后续质量任务。
allowed_scope:
  - scripts/verify.ps1
  - docs/development/toolchain-baseline.json
  - docs/development/toolchain-baseline.md
  - README.md中的开发验证入口说明
  - docs/roadmap/next-development-execution-plan.md中的QA-01交付说明
  - docs/development/task-log/index.md与本任务日志
forbidden_scope:
  - 产品源码、测试行为和依赖
  - 全局环境、全局Python、系统配置和管理员设置
  - Clippy、QA-02、SAFE-02和其他后续任务
  - 未跟踪用户文件、PRJ/CSV和Cargo.toml
validation:
  - "Docs模式通过：10个已跟踪JSON可解析，84个已跟踪Markdown文件的相对链接无缺失，两个锁文件已跟踪且无差异，工作树和暂存区git diff --check通过。"
  - "工具链版本检查通过：项目Python 3.12.10、Node.js 24.13.0、pnpm 11.14.0、rustc/cargo 1.97.1和stable-x86_64-pc-windows-msvc。"
  - "Fast模式通过17项：Python pytest 266 passed、Ruff通过、前端129 passed、Rust 75 passed/1 ignored。"
  - "Full模式通过20项：Fast全部通过，并完成pnpm build、cargo fmt --check和cargo check --locked。"
  - "生产构建保留既有大chunk警告；未执行安装、依赖变更、Clippy、QA-02或SAFE-02。"
  - "git diff --cached --check通过；提交范围未包含产品源码、依赖、Cargo.toml或用户PRJ/CSV。"
delivery_status: included_in_qa_01_delivery_commit
commit: current_main_commit
push: current_main_branch
files_changed:
  - scripts/verify.ps1
  - docs/development/toolchain-baseline.json
  - docs/development/toolchain-baseline.md
  - README.md
  - docs/roadmap/next-development-execution-plan.md
  - docs/development/task-log/index.md
  - docs/development/task-log/records/qa-01-toolchain-and-verify.md
manual_gui_validation_status: not_required
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 使用隔离的main工作树；原工作区和用户未跟踪文件保持未触碰。
  - 入口使用Windows PowerShell 5.1兼容语法，捕获合法stderr但仍严格按进程退出码判定失败。
```
