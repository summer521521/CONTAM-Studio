# EXPERT-FIX-01 与 CONTAM Studio 0.2.0 发布闭环

```yaml
task_id: expert-fix-01-v0-2-0-release
phase: EXPERT-FIX-01 / Release 0.2.0
title: 冻结Python运行时、Windows进程树治理与Phase 6B正式发布
status: completed
record_origin: live
started_at_utc: 2026-07-28T14:48:08.0253760Z
ended_at_utc: 2026-07-29T02:19:10.0055691Z
duration_seconds: 41462
base_commit: 8a1cfa72912be801c099f7e439f26907668bf16e
branch: codex/release-v0.2.0
task_source: 用户明确要求一次性完成本次更新的修复、验证、打包、推送、标签和GitHub Release闭环
task_summary: 修复阻止普通Windows用户使用现有便携版的Python运行时定位和进程树收口问题，并将已验收的Phase 6B多Provider能力作为0.2.0完整打包发布。
goals:
  - 冻结并打包Python worker、依赖和所需资源，证明脱离源码仓库且无系统Python时仍可运行
  - 由Rust统一使用Windows Job Object治理Python、ContamX、SimRead和Codex App Server等受控子进程树
  - 将产品版本、发布说明、已知限制、许可证、能力矩阵和发布元数据更新为0.2.0
  - 从精确候选提交生成便携版、NSIS和MSI，完成内容、凭据、哈希、签名状态和隔离安装验证
  - 仅在本地与远端门禁通过后推送main、创建v0.2.0标签和GitHub Release，并下载回验资产
allowed_scope:
  - Rust进程启动、运行时发现、Tauri资源、Python冻结与发布打包实现及其自动测试
  - 0.2.0版本、发布脚本、安装器、许可证、能力矩阵、发布说明、已知限制和任务日志
  - F:\Codex_File下本任务专用构建、安装测试、下载回验和恢复证据目录
  - 用户明确授权的本地提交、main推送、v0.2.0标签和GitHub Release
forbidden_scope:
  - 读取、导出、记录或提交真实凭据、Codex认证文件、Cookie、私钥、用户PRJ/SIM/CSV或真实AppData内容
  - 修改系统PATH、全局Python、注册表正式安装状态、Windows服务、安全策略或伪造代码签名
  - 重写官方ContamX求解器、绕过语义Patch/审批边界、覆盖用户唯一工程文件或复用旧0.1.0发布资产
validation:
  - Full QA-01 passed: 59 checks passed
  - Python pytest passed: 345 tests
  - Frontend Vitest passed: 175 tests
  - Rust tests passed: 122 passed, 1 ignored
  - Rust format, Clippy, Cargo check, production build and mutation contracts passed
  - Frozen Python worker detached protocol and 7-zone PRJ read passed without source tree; source fixture unchanged
  - Portable ZIP, unsigned NSIS and unsigned MSI built from commit 7500aff68a78ef4c1807b2ce79e5f5f68325717b and passed release artifact audit
  - GitHub Windows CI run 30415119095 passed
  - Stable GitHub Release v0.2.0 published and final downloaded assets matched SHA256SUMS.txt
  - GitHub release asset attestation run 30416432745 passed
  - Independent clean-Windows installation not run; local installer installation not run to protect host registry; Authenticode remains unsigned
delivery_status: published_v0.2.0
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 本任务按一次性发布闭环推进，中途不把本地提交、推送或单个安装包当成最终交付。
  - 默认候选版本为0.2.0；如现有发布契约证明需要不同版本，将在创建远端标签前统一修正。
  - 未读取真实Credential Manager、Codex认证文件、Provider Key或用户工程数据。
  - Release: https://github.com/summer521521/CONTAM-Studio/releases/tag/v0.2.0
  - Windows CI: https://github.com/summer521521/CONTAM-Studio/actions/runs/30415119095
  - Release attestation: https://github.com/summer521521/CONTAM-Studio/actions/runs/30416432745
```
