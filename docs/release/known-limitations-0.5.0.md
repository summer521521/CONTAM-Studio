# CONTAM Studio 0.5.0 已知限制

- 目标平台为 Windows 10/11 x64；未提供 macOS 或 Linux 候选。
- 候选包未签名，Windows 可能显示未知发布者或 SmartScreen 提示。
- 125% 和 200% 系统显示缩放需要修改系统设置，本轮不执行，保持 `pending_user`；不能用浏览器缩放代替。
- 用户明确授权后，本轮使用临时 DeepSeek Key 发起了真实 Provider 请求；请求到达 Provider，但返回内容未通过应用的严格结构化回答契约，因此真实 Provider 回归状态为 `failed`。Context Receipt、Provider 状态和 Patch Review 的 GUI 验收不能冒充真实模型回答通过。
- SketchPad 是基于严格 PRJ 图标记录的示意布局，不是按比例平面图；气流拓扑的边长不代表空间距离。
- 多 Zone 结果当前只支持温度、参考压力和空气密度，不伪造污染物浓度、ACH、流量、暴露或 infiltration。
- 时间选择只使用数据集存在的精确时刻；任意输入确定性吸附到最近真实时刻，不进行插值。
- 无法可靠保存的 PRJ 内容保持只读；AI 建议不能直接写入原始 PRJ。
- 用户数据不会因卸载候选应用而自动删除。另一台独立干净 Windows 的人工验收若未执行，保持 `not_run`。
- 当前工作树尚未提交，因此本轮生成的候选包不是最终发布资产；正式发布必须从总监批准后的精确提交重新构建。
