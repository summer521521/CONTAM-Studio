# v1 User Journeys and Traceability

每一行描述一个不可省略的用户步骤。`irreversible`只表示可能改变外部状态的操作；无外部证据的行保持`pending_final_acceptance`。

| Journey/step | User intent | Visible information | Irreversible action + confirmation | Recovery | Evidence output | Screen | Semantic tool | Test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| learner/open | 选择教师PRJ | 来源、兼容状态、原始保护、工具状态 | 无 | 取消保持欢迎页；失败保留旧项目 | source hash/size, compatibility code | Project | `inspect_project` | reader positive/negative |
| learner/inspect | 理解Zone和单位 | Zone编号/稳定ID、体积、单位、未知内容摘要 | 无 | 选择其他Zone；不支持项目只读 | safe project summary | Project/Inspector | `read_supported_objects` | golden envelope |
| learner/prepare | 改一个支持字段 | 当前Revision、before/proposed、单位、验证结果、过期时间 | 生成Patch预览，不写文件 | 修改值或取消 | PatchTransaction + Diff | Draft | `plan_zone_volume_patch` | stale/mismatch mutation |
| learner/approve | 确认修改 | 原始保护、Revision、Diff、诊断、影响范围 | Apply需显式确认 | 取消/返回不改变Revision | immutable revision hash | Diff modal | `apply_patch` | command race |
| learner/run | 运行批准Revision | 工具身份、输入快照、预算、状态和取消入口 | 启动/取消需确认 | timeout/cancel保留证据，不发布迟到结果 | run manifest | Runs | `run_approved_bundle` | process controller |
| learner/result | 查看Zone空气状态 | 样本分页、单位、来源Revision、结果状态 | 无 | 缺工具/结果显示可操作错误 | result artifact + citation | Results | `extract_zone_air_state` | paging/boundary |
| learner/compare | 比较基线与变体 | A/B身份、对象、单位、时间网格、差值 | 创建比较快照需确认导出 | 不兼容时保持结果并解释 | comparison evidence | Compare | `compare_revisions` | identity mismatch |
| learner/report | 交付证据 | 输入/工具/Revision/结果/限制和AI标记 | Export新文件需确认 | 目标已存在不覆盖 | report/evidence manifest | Report | `build_report` | deterministic export |
| teacher/review | 审阅学生证据 | 来源、Diff、运行状态、结果和限制 | 无 | 缺证据标记不可复核 | reviewer view | Evidence | `read_evidence_index` | disclosure tests |
| offline/core | 无AI无网络完成任务 | AI disabled、工具配置和本地状态 | 同核心确认 | 网络缺失不影响核心 | local-only audit | Settings/Activity | none | offline contract |
| assistant/explain | 解释用户选择证据 | 精确披露预览、字段、目的和不确定性 | 发送远程请求需二次确认 | 取消或离线保持本地状态 | consent receipt + answer | Assistant | `preview_ai_context` | disclosure mutation |
| failure/recover | 从超时/崩溃恢复 | 状态、剩余证据、可清理对象和下一步 | 清理/重试显示范围 | 旧项目/Revision保持可用 | failure manifest | Activity/Recovery | `recover_owned_artifacts` | crash/recovery |

## Traceability rules

- 每个用户操作只能通过对应语义工具进入Rust可信边界；React按钮disabled不是授权证明。
- 每个不可逆操作都必须有确认、单次幂等键、过期策略和可追踪证据。
- `pending_final_acceptance`只描述缺少真实GUI/工具/用户证据，不得替代自动化测试。
