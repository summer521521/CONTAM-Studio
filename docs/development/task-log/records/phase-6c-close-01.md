# PHASE-6C-CLOSE-01 最终验证与本地发布候选包

```yaml
task_id: phase-6c-close-01
phase: Phase 6C close
title: 最终验证与本地 v0.3.0 发布候选包
status: completed
record_origin: live
started_at_utc: 2026-07-29T05:11:08.5286356Z
ended_at_utc: 2026-07-29T05:59:21.4177880Z
duration_seconds: 2892.889
base_commit: 6cd3d7a4424a4f4479ab56d2303e9b47531db338
branch: main
task_source: User-provided PHASE-6C-CLOSE-01 implementation brief
task_summary: 将当前 Phase 6C 工作树统一升至 0.3.0，完成一次带可审计日志和退出码的 Full 验证，创建本地提交并构建本地发布候选包。
goals:
  - 统一所有实际构建版本元数据为 0.3.0，并保留历史 0.2.0 记录
  - 取得最终 Full 验证的完整日志、退出码和准确检查数量
  - 从成功验证的精确提交构建 Portable、NSIS 和 MSI 候选包（按正式流程能力）
  - 完成候选包资源、哈希、隔离运行和发布闭环审计
allowed_scope:
  - 版本元数据、当前发布说明、Phase 6C 收口任务日志、自动验证和本地候选包
  - F:\Codex_File\phase-6c-close 下的日志、下载、构建中间物和候选产物
forbidden_scope:
  - 真实 API Key、Credential Manager、Cookie、WebView 数据库、真实 AppData 和用户数据
  - 无关功能重构、系统设置、全局依赖、推送、打标签、GitHub Release 和远端状态
validation:
  - 修复候选包审计发现的开发机路径和安装器中间目录后，最终代码仅运行一次成功 Full：2026-07-29T05:45:12.2512696Z 至 2026-07-29T05:47:01.3525192Z，109.101秒，退出码0，61 checks passed
  - 完整日志保存于 F:\Codex_File\phase-6c-close\full-verification.log，退出码保存于 F:\Codex_File\phase-6c-close\full-verification-exit-code.txt
  - 候选包正式审计退出码0；Portable ZIP 解压后的 4 个锁定 NIST 工具逐文件 SHA-256 校验通过，证据位于 F:\Codex_File\phase-6c-close\portable-smoke-final
  - 隔离官方工具烟测通过：ContamX 3.4.0.3 退出码0并生成非空SIM；SimRead 3.4.0.3 退出码0并生成NFR/XRF；源fixture PRJ哈希未变化，证据位于 F:\Codex_File\phase-6c-close\official-tools-smoke-final
  - Full 失败时只修复明确问题并按规则重跑必要聚焦检查，修复后必须取得一次成功 Full
  - 成功 Full 后运行任务日志合同、能力矩阵校验、git diff --check，并检查 staged diff
delivery_status: local_candidate_ready
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 未读取真实凭据、真实用户 AppData、WebView 数据库或用户文件；未推送、未打标签、未发布。
  - 候选包和验证日志必须位于 F:\Codex_File\phase-6c-close。
  - 聚焦证据：前端19个测试文件176项，Rust全测试127通过/1忽略，Phase 6C合同47项，Tauri命令合同63项，数据生命周期7项，任务日志合同72条，Windows CI变异12项，NIST哈希门禁4个工具文件。
  - Full成功时 automated_verified=passed；候选包审计完成后 packaged=passed；manual_gui=pending_user、real_provider=not_run、user_validated=pending_user、signed=not_run、released=no。
  - 候选包目录为 F:\Codex_File\phase-6c-close\v0.3.0-rc\0.3.0，正式发布资产清单、大小和SHA-256见其 release-assets\SHA256SUMS.txt；候选包包含Portable ZIP、NSIS和MSI，均为未签名本地构建。
  - clean-machine 安装/卸载未在宿主机执行；安装器资源由正式构建和候选包审计覆盖，真实GUI、真实Provider和用户验收保留 pending_user/not_run。
  - 候选包过程中发现并修复两项收口问题：包内工具README开发路径，以及release-closure未清理repackage-work中间目录；两次修复后均按规则重新取得成功 Full。
```
