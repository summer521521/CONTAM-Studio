# ADR-013：OwnedArtifactStore Lifecycle

## 状态

`candidate_for_h_final`。本ADR是所有草稿、运行、结果、报告、附件、AI档案、缓存和临时对象的统一存储政策。

## 对象类别与所有权

| 类别 | 所有者 | 默认持久性 | 自动删除 |
| --- | --- | --- | --- |
| `external_source` | 用户路径 | 外部 | 永不由Studio删除 |
| `export` | 用户路径 | 外部 | 永不由Studio删除 |
| `revision` | Studio | 持久 | 仅用户显式删除且无依赖 |
| `run` | Studio | 持久 | 仅用户显式删除且不活动 |
| `result` | Studio | 持久 | 仅用户显式删除且无报告引用 |
| `report_evidence` | Studio | 持久 | 仅用户显式删除且无外部引用 |
| `attachment_derivative` | Studio | 持久 | 随附件依赖确认后删除 |
| `ai_archive` | Studio、默认关闭 | 持久 | 用户显式删除 |
| `cache` | Studio | 可重建 | 可按配额回收 |
| `temporary` | Studio | 短期 | 归属可证明且超过24小时才可自动回收 |
| `quarantine` | Studio | 直到处理 | 不自动删除，需用户确认 |

所有对象必须有artifact_id、schema_version、类别、相对OwnedArtifactStore路径、大小、创建/最后使用时间、sha256、依赖、状态和归属project/revision/run标识。来源和导出路径只作为外部引用，不能进入删除集合。

## 目录与配额

默认根为Tauri `app_local_data_dir()`下的`owned-artifacts/`，子目录固定为`revisions`、`runs`、`results`、`reports`、`attachments`、`ai`、`cache`、`temporary`和`quarantine`。软配额10 GiB触发警告并允许回收合格cache/temp；硬配额20 GiB拒绝新写入，不删除持久用户工作。配额计算以已验证文件大小为准，目录项、符号链接、junction和未知对象不能计入可回收空间。

## 清理、恢复与迁移

- 启动仅回收归属可证明、未活动且超过24小时的temporary和可重建cache；运行、结果、revision、报告证据和附件默认保留。
- 清理预览显示相对OwnedArtifactStore路径、大小、依赖和排除原因；活动对象、固定对象、最后可恢复revision、报告引用证据、external_source、export、junction/symlink和路径逃逸一律不可选。
- 迁移执行版本化`copy -> hash/parse verify -> fsync -> atomic activation`；失败回滚到旧版本。未知或更高schema进入recovery/read-only，不静默降级或丢字段。
- 应用崩溃恢复先扫描manifest和临时锁，保留不可信目录为quarantine；只有通过身份、哈希和解析验证的对象才能重新进入活动索引。
- 卸载默认保留Studio数据；应用内purge必须先预览、列出对象和依赖，并二次确认。安装器不静默删除数据。

## WebView边界

WebView只接收安全摘要：artifact_id、类别、状态、相对用户可读标签、大小、时间、依赖计数、可清理原因和诊断代码；不得接收绝对路径、原始PRJ、manifest正文、凭据或完整样本。
