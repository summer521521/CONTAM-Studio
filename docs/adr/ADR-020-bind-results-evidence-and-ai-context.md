# ADR-020：将结果、证据和 AI 上下文绑定到同一可信身份

状态：Accepted

## 背景

单 Zone 结果足以验证 SimRead 纵向链路，但不能支持多 Zone 科学比较、固定尺度的空间映射或可审计的 AI 解释。如果前端自行合并提取、读取清单或向 AI 发送大数组，将绕过 Rust 身份边界，也容易把不同项目、Revision 或 run 的数据混在一起。

## 决策

1. 在 Rust 受控 SimRead 链路上建立 `zone_result_dataset.v1`。数据集绑定 project session、source hash、Revision、run、manifest、extraction batch 和确定性 fingerprint。
2. 每次最多读取 64 个 Zone、250000 个样本，序列化 payload 不超过 32 MiB；提取顺序执行并支持身份绑定的取消。单 Zone 失败形成 partial，项目、source、Revision 或 run 不匹配形成硬失败。
3. 时间轴只使用完全相同或精确公共时刻，不做静默插值。当前指标限定为温度、参考压力和空气密度。
4. 前端只消费类型化数据集。图表缺失值保持缺失，空间着色只绑定既有 Zone 语义身份，颜色范围固定为当前数据集全部时刻。
5. Evidence Lineage 从项目/Revision、快照、ContamX、manifest、SimRead 和数据集的同一状态构建；链路不完整时不得显示为完整验证。
6. AI Context Receipt 使用同一 run、dataset fingerprint、指标和时刻。Rust 只披露选定精确时刻的有界值，不披露完整序列、路径、凭据或原始 PRJ。
7. AI 意图只改变提示与上下文选择，不改变权限。任何建议修改只能进入既有 Semantic Patch Review、Diff、确定性验证和用户确认流程。

## 理由

- 将科学数据、证据和解释绑定在同一个可信身份上，避免跨项目或跨运行污染。
- 在 Rust 协调官方 SimRead，保留文件和进程权限边界。
- 使用 exact time 使比较可解释，不把隐式插值误认为官方结果。
- 复用语义 selection 和 Patch Review，避免图表、画布或 AI 建立第二套业务状态和写入路径。

## 后果

- 多 Zone 提取当前顺序执行，优先保证外部进程数量和身份可控，而不是追求最大吞吐量。
- 时间轴不一致时只展示真实公共时刻并告知用户；不会生成补点。
- 结果数组不写入 localStorage 或 AI Archive。刷新失败时前端可保留最后一个可信数据集并标记 stale。
- R1-04 不增加运行时依赖，继续复用 ECharts 与 R1-03 的 lazy Konva 边界。

## 未选择的方案

- 前端直接读取 SIM、NFR 或 run manifest：绕过 Rust 文件边界。
- 引入新的结果数据库或二进制解析器：当前没有格式和版本证据。
- 自动重采样或缺失值补零：会改变结果语义。
- AI 直接应用 Patch：绕过 Diff、验证和用户确认。

## 待验证

- R1-05 的中英文、深浅色、窗口缩放和正式 GUI 联动矩阵。
- 干净 Windows 环境中的官方工具、安装包和签名证据。
- 真实 Provider 回归；R1-04 自动测试不读取凭据或调用真实 Provider。
