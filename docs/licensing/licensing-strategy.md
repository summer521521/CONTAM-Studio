# 许可策略

## 当前结论

- CONTAM Studio自身源码自0.1.0起采用Apache License 2.0，完整条款见仓库根目录`LICENSE`。
- CONTAM主体许可结论必须以NIST官方资料和实际分发包中的声明为准，研究报告中的总结不能替代发布前核验。
- CONTAM或其分发内容中的部分组件可能带有单独版权、许可或notice要求，必须逐项识别。
- 0.1.0不捆绑ContamX、SimRead或Codex。未来若改变分发方式，必须重新核对来源、再分发条件、版本、哈希和notice。
- CONTAM Studio是独立社区项目，不是NIST或OpenAI官方产品，不得暗示其认可、维护或背书。
- Phase 5C新增`echarts 6.1.0`，来源为Apache ECharts官方包，许可证为Apache-2.0。项目只使用模块化Canvas折线图组件；发布前第三方声明需包含该依赖及其许可证文本。
- Phase 3C新增Rust `uuid 1.24.0`，只启用确定性UUID v5所需feature，来源为官方crates.io包，许可证为Apache-2.0 OR MIT。未新增前端或Python运行时依赖；发布前第三方声明需包含该crate及实际锁定的传递依赖。
- Phase 6A未新增Rust、前端或Python运行时依赖。外部Codex CLI/App Server可以由用户单独安装，也可以在用户明确确认后由Studio调用固定OpenAI官方安装入口；CLI二进制不捆绑进仓库或安装包，Studio只实现公开stdio协议客户端和受控安装编排。官方OpenAI Codex仓库采用Apache-2.0。研究时查看的`llm-for-zotero`为AGPL-3.0，本项目未复制其代码、协议包装、注释或UI，因此未引入其代码许可义务；发布前仍需在产品说明中明确Codex是外部可选工具并链接官方来源。
- Phase 6B新增或显式启用的主要Rust依赖：`reqwest 0.13.4`（MIT OR Apache-2.0）、`rustls 0.23.42`（Apache-2.0 OR ISC OR MIT）、`keyring 4.1.5`（MIT OR Apache-2.0）、`zeroize 1.9.0`（Apache-2.0 OR MIT）、`futures-util 0.3.32`（MIT OR Apache-2.0）、`url 2.5.8`（MIT OR Apache-2.0）、`tokio 1.52.4`（MIT）和`uuid 1.24.0`（Apache-2.0 OR MIT）。其中`rustls`由`reqwest`的TLS特性引入，不是Cargo清单中的直接依赖。实际传递依赖以`src-tauri/Cargo.lock`为准，发布前仍需做完整锁文件许可证审计。
- Phase 6B不复制Cherry Studio社区版的Provider代码、注释、协议包装或UI；其AGPL-3.0只作为架构分层研究参考，不进入本仓库。Gemini、Anthropic、OpenRouter、DeepSeek及Codex文档是外部API规范来源，不是随应用分发的代码或依赖。

## 许可证边界

Apache-2.0只覆盖CONTAM Studio贡献者有权许可的仓库内容。仓库内保留的第三方夹具、依赖、商标和外部工具继续适用其自身条款；汇总见根目录`THIRD_PARTY_NOTICES.md`。`package.json`、`Cargo.toml`和GitHub许可证识别应与根许可证一致。

## 发布前核对清单

- 从NIST官方页面和目标ContamX分发包核对主体许可与免责声明原文。
- 盘点ContamX及随包组件的第三方notice、再分发和署名要求。
- 确认Studio自身Apache-2.0许可证与新增依赖和分发方式继续兼容。
- 准备来源、修改说明、第三方声明以及“非NIST官方产品”说明。
- 核对安装器、About页面、仓库和发布包中的声明是否一致。
