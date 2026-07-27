# AGENT-07 发布闭环状态

## 分层状态

| 层级 | 状态 | 证据/说明 |
| --- | --- | --- |
| portable build | passed | `F:\\Codex_File\\artifacts\\contam-studio\\agent-07\\0.1.0`已生成、版本清单和内容审计通过 |
| installer build | blocked_environment | 逐项检测NSIS `makensis`和WiX `wix/candle/light`；缺失时不安装、不伪造 |
| clean Windows install | blocked | 当前没有可用的隔离干净Windows环境 |
| signature | unsigned | 未配置代码签名证书，不显示为已签名产品 |
| official ContamX/SimRead | not_tested | 本批不持有或配置用户工具路径，不重复声称独立运行 |

便携可执行文件已完成构建和静态内容审计；未在真实用户AppData上启动烟测，以避免读取或写入真实用户配置。便携启动、安装、升级和卸载仍需用户在隔离环境完成。

## 产物目录

默认输出到：

```text
F:\Codex_File\artifacts\contam-studio\agent-07\0.1.0\
```

便携版只允许包含可执行文件、发布清单、安装器状态和脱敏诊断证据。扫描拒绝PRJ、CSV、SIM、fixture、Token、Cookie、密钥、用户路径、虚拟环境和临时文件。

## 安装与卸载边界

- 可用NSIS/WiX时仍使用Tauri现有current-user安装模式，不申请管理员权限。
- 工具缺失时安装器状态为`blocked_environment`，不修改系统环境。
- 未签名构建可能触发Windows SmartScreen未知发布者提示；正式发布前必须先完成组织证书签名和干净机验收。
- 卸载默认只删除应用文件，保留用户配置、项目、研究结果和外部ContamX/SimRead；缓存和临时目录只有用户明确操作时才清理。
