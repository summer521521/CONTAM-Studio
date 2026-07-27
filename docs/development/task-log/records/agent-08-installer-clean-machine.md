# AGENT-08：安装器与干净机验收

```yaml
task_id: AGENT-08
phase: Phase 12
title: 安装器与干净机验收
status: automated_verified
record_origin: live
started_at_utc: 2026-07-27T05:30:00Z
ended_at_utc: 2026-07-27T06:22:48Z
duration_seconds: 3168
base_commit: 35c2925
branch: codex/agent-08-installer-clean-machine
task_source: 用户任务“AGENT-08 安装器与干净机验收”
task_summary: 使用F:\\Codex_File下的本地NSIS/WiX工具链完成未签名Windows安装器、安装边界、升级卸载策略、诊断脱敏和干净机验收准备。
goals: 在不修改系统环境、注册表、服务、正式工作区和用户文件的前提下形成可审计的0.1.0安装器候选。
allowed_scope: 隔离克隆中的打包脚本、契约测试、发布文档、能力矩阵和任务日志；F:\\Codex_File下的工具缓存、测试副本和构建产物。
forbidden_scope: 正式F:\\CONTAM Studio、用户PRJ/CSV/SIM、真实AppData、凭据、Token、Cookie、SSH密钥、全局工具安装、系统PATH、注册表、服务、代码签名、上传和Release。
validation: scripts\\verify.ps1 -Mode Full、工具链哈希/版本校验、便携构建、NSIS/MSI构建、内容扫描、隔离安装升级卸载测试、cargo fmt、Clippy、pnpm test/build和git diff --check。
delivery_status: automated_verified
token_usage: not provided by client
notes: 自动化完成：本地NSIS 3.12与WiX 3.14.1通过固定SHA-256校验并生成未签名NSIS/MSI；便携版、包内容/敏感信息扫描、脱敏诊断和发布元数据通过。安装器宿主机安装/升级/卸载未执行（本机无Sandbox/VM且禁止注册表修改），clean Windows acceptance保持blocked_environment；signature=unsigned，official ContamX/SimRead本批未独立运行。不读取或修改真实PRJ、CSV、SIM和真实用户AppData数据；首次Tauri打包尝试可能写入其自身的本机helper缓存，最终产物已使用F:\\Codex_File本地工具链重新打包。未读取凭据或正式F:\\CONTAM Studio；无新增依赖、无管理员权限、无上传发布。
```
