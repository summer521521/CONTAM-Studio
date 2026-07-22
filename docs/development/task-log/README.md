# 开发任务日志

## 目的

记录正式Codex开发、修复、重构和仓库文档任务的范围、时间、验证和交付状态，便于通过Git追溯实现依据。纯问答或未访问仓库的讨论不写入日志。

## 规则

- 时间字段使用ISO 8601 UTC；`duration_seconds`由开始和结束时间计算。
- `record_origin`为`live`表示本次任务实时记录，`reconstructed`表示基于Git、PR和项目文档回填。
- Token只在客户端明确提供逐任务精确数据时记录；否则统一使用`null`并标记`unavailable`，不得估算或读取隐藏会话。
- 记录不包含认证信息、完整环境变量、Cookie、密钥或隐藏会话内容。
- 通过`git log --follow -- docs/development/task-log/records/<记录文件>`定位包含任务记录的交付提交；记录不自引用最终提交SHA。

## 记录结构

阶段回填见[`historical-backfill.md`](historical-backfill.md)，当前任务和后续任务记录放在[`records/`](records/)中，索引见[`index.md`](index.md)。正式任务先写`in_progress`，结束时更新为`completed`或`blocked`。

## 状态词

- `in_progress`：当前正在执行的唯一任务卡。
- `completed`：本卡规定的自动和人工证据均已满足。
- `blocked`：等待前置任务、用户证据或规格决策。
- `automated_verified`：规定的自动检查已通过，但不代表GUI、安装或用户验证通过。
- `pending_user`：实现和自动检查完成，等待用户手动验收。
