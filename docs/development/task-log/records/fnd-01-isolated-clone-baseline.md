# FND-01隔离克隆与基线

```yaml
task_id: FND-01
phase: Wave 0
checkpoint: 01
title: 建立隔离克隆与可重复基线
status: automated_verified
record_origin: live
started_at_utc: 2026-07-23T07:59:18.1301281Z
ended_at_utc: 2026-07-23T08:17:27.9904150Z
duration_seconds: 1089
base_commit: 81205f49301859007e39b193e6a5b6ff0b5aebb4
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md
task_summary: 在指定临时根建立独立克隆、环境与首次Full基线，不读取或修改原脏工作区及用户数据。
goals:
  - 从已核验的origin/main精确提交建立专用分支。
  - 使用独立Python虚拟环境、pnpm存储、Rust构建和临时目录。
  - 记录操作系统、工具版本、首次Full计数及隔离检查结果。
allowed_scope:
  - scripts/tests/test-isolated-clone-baseline.ps1、任务日志和索引。
  - F:\Codex_File下本任务专用可重建环境、缓存和临时目录。
forbidden_scope:
  - F:\CONTAM Studio中的文件、用户PRJ/SIM/CSV、真实AppData、凭据、全局环境和系统设置。
validation:
  - 隔离检查通过：克隆根、分支、origin URL、origin/main及merge-base均与任务书冻结值一致。
  - node_modules与python/.venv均为本克隆普通目录，不是junction、symlink或其他reparse point。
  - 首次Full通过27项检查：Python 278 passed；前端145 passed；Rust 77 passed、1 ignored；构建、Clippy、Cargo check及Windows CI契约通过。
  - git diff --check通过；隔离检查器对错误分支和错误origin SHA均以非零退出。
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Windows NT 10.0.26200.0；PowerShell 5.1.26100.8875；Git 2.53.0.windows.2；Python 3.12.10；Node 24.13.0；pnpm 11.14.0；rustc/cargo 1.97.1。任务书SHA-256为3882C5D17E008E8C0F2F5004F4C9CC6C485415CFC2D31766D684C107519770BF。pnpm存储位于F:\Codex_File\cache\contam-studio-v1-complete\pnpm-store，Cargo home/target和后续TEMP/TMP位于本任务专用F:\Codex_File目录；首次pip可编辑构建曾由pip自行使用并清理系统临时目录，未读取或保留用户工程数据。真实GUI、ContamX、SimRead、App Server、安装和用户证据均未执行。
```
