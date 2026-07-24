# CONTAM Studio v1 威胁模型候选

## 资产与信任边界

| 资产 | 保护目标 | 边界 |
| --- | --- | --- |
| 用户原始 PRJ/CSV/SIM | 不覆盖、不泄露、可追溯 | 原生选择器与 Rust 主机；Python 只读快照 |
| Studio-owned Revision/Run/Result | 哈希、归属、恢复 | OwnedArtifactStore 与 commit-last 清单 |
| 官方 ContamX/SimRead | 身份、参数、输出证据 | ToolRegistry 与受控进程 Lease |
| Attachment/AI 证据 | 有界披露、无主动内容 | Quarantine、EvidenceBundle、批准 Broker |
| WebView 命令 | 最小权限、不可伪造 | Tauri ACL、Rust 重绑定稳定 ID |

## 攻击者与入口

假设攻击者可以提供恶意 PRJ、ZIP、PDF、Office、CSV、日志、伪造结果清单或提示注入文本；不能假设攻击者拥有凭据、系统管理员权限或正式项目目录写权限。入口包括原生文件选择、导入副本、受控工具路径、WebView payload、App Server 事件和恢复清单。

## 主要缓解

- 路径全部由 Rust/显式选择拥有；WebView、AI 和 Python 返回值不提供路径、Shell、原始 PRJ 或任意查询。
- PRJ 未知语法只读，Patch 绑定基线哈希、稳定对象、Diff、前置条件和单次批准；源文件不可写。
- ZIP 先枚举后处理，拒绝遍历、大小写碰撞、加密、符号链接、可执行文件和压缩炸弹。
- PDF/Office 不执行 JavaScript、宏、公式、嵌入文件或外链；CSV 公式仅作为不可信文本。
- 工具替换、进程清理不明、结果网格不兼容、审批过期和引用失效均 fail-closed。

## 残余风险与证据边界

真实 Windows Job Object、官方工具输出、App Server 版本协议、Office/PDF 视觉渲染、第三方渗透测试和用户研究尚未在本隔离环境完成，统一标为 `pending_final_acceptance`。本文是候选安全结论，不是第三方渗透测试或发布批准。

## 事件恢复

1. 进程状态为 `unknown_cleanup` 时保留证据并禁止新运行，重启后复核 Lease。
2. 清单哈希不匹配时进入 recovery/read-only，不自动删除唯一证据。
3. 附件解析失败只删除 Studio-owned quarantine 副本，不触碰外部来源。
4. AI Trace/历史损坏时停止回放，保留原始审计清单并允许用户显式删除。
