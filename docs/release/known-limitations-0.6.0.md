# CONTAM Studio 0.6.0 已知限制

- v0.6.0 目前是本地候选，不是正式发布资产；v0.5.0 仍是已发布稳定版本。
- Studio 建筑构造尚不能等价、无损地写回任意 CONTAM SketchPad；只有经过验证的语义创作子集可以导出到新的 PRJ 副本。
- SketchPad 图标是严格解析后的示意锚点，不是建筑真实轮廓；Studio 草稿中的房间构造也不宣称等价于 ContamW 平面编辑。
- AI Luna 几何草案依赖用户选择、预览、确定性验证和二次确认，不会自动应用，也不能直接修改原始 PRJ。
- 125%/200% Windows 系统缩放尚未正式人工验收；浏览器视觉检查不等于系统缩放验收。
- 独立干净 Windows 机器尚未验收，`clean_machine=not_run`。
- 候选包未进行代码签名，`signed=unsigned`，Windows 可能显示未知发布者或 SmartScreen 提示。
- 本轮不运行真实 Provider，`real_provider=not_run`；自动测试和本地候选验证不代表真实模型回答通过。
- MSI 只做构建、文件结构、版本、签名状态和哈希静态审计，不进行管理员安装。
- Portable 和 NSIS 仅在隔离目录中验证；隔离安装测试不等同于用户最终验收。
- 官方 NIST 页面发布版本与包内工具版本继续分开记录：发布页为 CONTAM 3.4.0.8，锁定 Windows 包内 ContamX/SimRead 等文件版本为 3.4.0.3。
- 未经验证的任意 PRJ 几何、污染物、ACH、暴露、流量或其他结果能力不会因 Geometry Workbench 候选而自动获得。
