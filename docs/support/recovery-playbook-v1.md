# 恢复与支持包候选

## 可恢复状态

| 状态 | 用户可见动作 | 保留内容 |
| --- | --- | --- |
| `unknown_cleanup` | 重试复核或退出 | Lease、进程摘要、清理证据 |
| `recovery_required` | 只读打开、导出支持包 | 损坏清单、版本、哈希摘要 |
| `missing_companion` | 重新选择明确文件 | 基线与失败原因 |
| `tool_changed` | 重新探测并确认 | 工具安全身份 |
| `expired_citation` | 回到当前 Revision 重新生成证据 | 旧 Trace 不自动回放 |

支持包预览必须先显示相对 OwnedArtifactStore 路径、大小、依赖和排除项；默认不包含原始 PRJ、附件全文、凭据、绝对路径或完整结果样本。导出使用新目标，不覆盖已有文件。本文不执行真实用户数据收集。
