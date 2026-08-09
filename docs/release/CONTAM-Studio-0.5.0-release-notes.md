# CONTAM Studio v0.5.0 候选发布说明

CONTAM Studio v0.5.0 Renewal R1 将项目、只读可视化模型、官方工具运行、多 Zone 结果、证据链与 AI 上下文整合为面向教学和科研的连续工作流。

## 主要变化

- 重构“项目、运行、结果、研究”工作台，默认隐藏端点、路径、哈希和内部诊断等技术细节。
- 新增只读 SketchPad 示意与气流拓扑视图；仅显示严格投影的 Level、图标、Zone 和 FlowPath 事实，不伪造房间几何或物理距离。
- 新增 `zone_result_dataset.v1` 多 Zone 结果契约，支持温度、参考压力与空气密度的真实时间序列、精确时刻空间投影和 partial/stale 状态。
- 新增项目→Revision→ContamX→运行清单→SimRead→数据集证据链。
- AI 助手显示上下文回执，区分证据事实、模型解释、局限和建议；修改建议仍只能进入统一 Patch/Diff/确定性验证和用户确认。
- Provider 继续使用官方模型目录；内置 Provider 不提供自由模型 ID，自定义 OpenAI-compatible 的手动模型位于高级设置。
- 数据、凭据和原始 PRJ 边界不变：API Key 由 Windows Credential Manager 管理，GUI 与 AI 不直接覆盖原始 PRJ。

## 官方工具事实

NIST 官方页面当前标记产品发布版本为 CONTAM 3.4.0.8，但该页面提供的 Windows x64 下载为 `contam-x-3.4.0.3-win64.zip`。包内 ContamX、SimRead、SimComp 和 PrjUp 的 Windows 文件版本均为 3.4.0.3。CONTAM Studio 按工具实际版本显示“ContamX 3.4.0.3”，ZIP 与逐文件 SHA-256 由 `resources/contam-tools.lock.json` 锁定。

## 发布边界

- 当前文件描述本地候选状态；正式提交、远程 Windows CI、最终重建、标签和 GitHub Release 尚未执行。
- Windows 构建未进行 Authenticode 签名，可能触发未知发布者或 SmartScreen 提示。
- 本轮不读取真实 Provider 凭据，也不发起真实 Provider 回归请求。
- CONTAM Studio 不是 NIST、OpenAI 或其他 Provider 的官方产品。
