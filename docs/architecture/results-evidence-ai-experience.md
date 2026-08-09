# 结果、证据与 AI 体验架构

## 可信数据链

```text
Project session + source hash + Revision
  -> immutable run input snapshot
  -> official ContamX + run manifest
  -> official SimRead per-Zone extraction
  -> bounded zone_result_dataset.v1
  -> Results / Spatial overlay / Evidence Lineage / AI Context Receipt
```

ContamX 求解和 SimRead 结果读取是两个独立状态。求解成功但读取失败时，run manifest 和求解证据继续保留；UI 不把它改写为“求解失败”。

## `zone_result_dataset.v1`

Rust 从活动项目和活动 run 出发，顺序协调既有单 Zone SimRead 提取。数据集精确绑定 `project_session_id`、`project_source_hash`、`revision_id`、`run_id`、`run_manifest_identity` 和 `extraction_batch_id`。fingerprint 对排序后的身份、请求 Zone、成功序列、逐 Zone 失败和时间身份进行确定性 SHA-256，不包含创建时间。

边界为 64 个 Zone、250000 个总样本和 32 MiB payload。一个 Zone 失败时保留其他可信序列并返回 partial；项目、source、Revision、run 或 manifest 身份不一致是硬失败。取消和 late response 由 sequence、request ID 与当前身份共同阻断。刷新失败不会把最后可信数据集清空成零值，而是显示 stale 状态。

仅支持当前 SimRead 契约已经验证的 temperature、reference pressure 和 air density。时间比较只取完全相同或精确公共时刻，不插值、不平滑、不把缺失值填为 0。

## 结果工作区

结果页分为概览、时间序列、空间和证据四个表面。ECharts 只接收选中的真实 Zone 序列，默认最多八条；DOM 表格提供分页替代路径。统计 selector 使用有限数值的一次遍历计算 min、max、mean。

空间结果复用 `SpatialProjection`、确定性 topology layout 和唯一 semantic selection。结果通过 Zone semantic ID 映射到已有锚点或拓扑节点，不通过 Konva node、数组下标或坐标反推身份，也不绘制房间多边形。温度和密度使用顺序色带；参考压力仅在数据范围跨 0 时使用以 0 为中心的发散色带。范围固定为数据集全部时刻，缺失值使用中性轮廓。

## Evidence Lineage

Evidence Lineage 的节点状态限定为 verified、partial、failed、stale 和 unavailable。默认视图只显示用户名称、短身份、时间、工具和版本；不读取任意 manifest，也不显示绝对路径。只有所有必要节点均 verified 时，整条链路才能显示 verified。

## AI 上下文

React 构建人类可读 Context Receipt，Rust 重新验证项目、Revision、run、dataset fingerprint、指标和选中时刻。AI 只接收用户选择 scope 对应的有界事实；结果摘要最多包含选中精确时刻的值和证据计数，不包含完整时间序列、绝对路径、凭据或原始 PRJ。

Provider、模型、意图、scope、附件、项目、Revision、selection、run、dataset fingerprint、指标或时刻变化都会使旧 preview 失效。模型回答在 UI 中分为事实、解释、局限和下一步。AI Patch 只显示目标、字段、当前值、建议值和依据，主操作是进入既有 Semantic Patch Review；画布、结果页和助手均没有直接 PRJ 写入能力。

## 状态与性能

稳定项目、运行和结果身份位于工作台父层；标签页切换、tooltip、游标和 viewport 不重建这些状态。Results、ECharts、Konva 和 AI 面板保留语义 lazy boundary。R1-04 不增加运行时依赖，也不提高 Vite chunk warning 阈值。
