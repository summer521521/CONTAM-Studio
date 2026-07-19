# 许可策略

## 当前结论

- CONTAM主体许可结论必须以NIST官方资料和实际分发包中的声明为准，研究报告中的总结不能替代发布前核验。
- CONTAM或其分发内容中的部分组件可能带有单独版权、许可或notice要求，必须逐项识别。
- 未来若捆绑ContamX，应记录二进制来源、版本和校验信息，并在安装包及仓库材料中保留所需的第三方声明。
- CONTAM Studio是独立项目，不是NIST官方产品，不得暗示NIST认可、维护或背书。
- CONTAM Studio自身代码和内容采用何种许可证尚未由用户决定。
- Phase 5C新增`echarts 6.1.0`，来源为Apache ECharts官方包，许可证为Apache-2.0。项目只使用模块化Canvas折线图组件；发布前第三方声明需包含该依赖及其许可证文本。
- Phase 3C新增Rust `uuid 1.24.0`，只启用确定性UUID v5所需feature，来源为官方crates.io包，许可证为Apache-2.0 OR MIT。未新增前端或Python运行时依赖；发布前第三方声明需包含该crate及实际锁定的传递依赖。
- Phase 6A未新增Rust、前端或Python运行时依赖。外部Codex CLI/App Server可以由用户单独安装，也可以在用户明确确认后由Studio调用固定OpenAI官方安装入口；CLI二进制不捆绑进仓库或安装包，Studio只实现公开stdio协议客户端和受控安装编排。官方OpenAI Codex仓库采用Apache-2.0。研究时查看的`llm-for-zotero`为AGPL-3.0，本项目未复制其代码、协议包装、注释或UI，因此未引入其代码许可义务；发布前仍需在产品说明中明确Codex是外部可选工具并链接官方来源。

## Phase 0处理

本阶段只记录许可决策边界，不创建正式`LICENSE`文件，不把MIT、Apache-2.0或其他候选方案写成既定结论。

## 发布前核对清单

- 从NIST官方页面和目标ContamX分发包核对主体许可与免责声明原文。
- 盘点ContamX及随包组件的第三方notice、再分发和署名要求。
- 决定Studio自身许可证，并确认与依赖和分发方式兼容。
- 准备来源、修改说明、第三方声明以及“非NIST官方产品”说明。
- 核对安装器、About页面、仓库和发布包中的声明是否一致。
