# AGENT-08 安装器与干净机验收

## 分层状态

| 层级 | 状态 | 说明 |
| --- | --- | --- |
| portable build | passed | 0.1.0便携版已生成并通过内容审计 |
| installer build | passed | 使用F盘本地NSIS 3.12与WiX 3.14.1重新打包；未写入系统 |
| installer install/upgrade/uninstall | blocked_environment | 本机无Windows Sandbox/VM；为遵守不修改注册表边界未在宿主机执行安装器 |
| clean Windows acceptance | blocked_environment | 仅在可用Windows Sandbox/VM/另一台干净Windows上验收；不为此启用系统功能 |
| signature | unsigned | 未读取证书或私钥，不伪造签名 |
| official ContamX/SimRead | not_tested | 本批不使用用户工具路径；只做fixture和配置边界检查 |
| upload/release | not_performed | 不创建tag、不上传、不发布 |

## 产物与哈希

产物目录：`F:\Codex_File\artifacts\contam-studio\agent-08\0.1.0`。

| 文件 | SHA-256记录 |
| --- | --- |
| `portable/CONTAM-Studio.exe` | `manifest.json` |
| `installers/CONTAM Studio_0.1.0_x64-setup.exe` | `manifest.json`与`installer-status.json` |
| `installers/CONTAM Studio_0.1.0_x64_en-US.msi` | `manifest.json`与`installer-status.json` |

`installers/installer-status.json`和`release-closure-status.json`保存了工具版本和输出哈希；包内容扫描通过，未发现用户工程、fixture、凭据、Cookie、Token或开发机绝对路径。

## 本地工具链证据

工具链清单见[`agent-08-packaging-toolchain.json`](agent-08-packaging-toolchain.json)。来源为官方发布页和官方发布资产：

- NSIS 3.12：SourceForge官方NSIS文件页解析出的下载资产，SHA-256在清单中固定；许可证随压缩包`COPYING`保留。
- WiX 3.14.1：官方WiX v3发布资产，`LICENSE.TXT`声明Microsoft Reciprocal License（MS-RL）。

缓存位于`F:\Codex_File`，构建脚本只在当前PowerShell进程内临时扩展PATH；不会持久化系统环境变量。

## 安全边界

- 安装包扫描拒绝PRJ、CSV、SIM、NFR、fixture、node_modules、Python虚拟环境、Token、Cookie、密钥和开发机绝对路径。
- 安装器使用Tauri的current-user策略，不申请管理员权限；卸载默认只删除应用文件，保留用户项目、研究结果、配置和外部ContamX/SimRead。
- 诊断包只包含脱敏状态，不包含项目正文、附件正文、凭据或完整路径。

## 待验收

若没有隔离的干净Windows环境，必须保持`clean Windows acceptance: blocked_environment`，不能把当前本机构建或用户GUI验收写成干净机通过。签名和正式发布需要单独的用户决定。可在具备Sandbox/VM后执行`scripts/tests/test-installer-isolated.ps1`，不要在宿主机绕过注册表边界。
