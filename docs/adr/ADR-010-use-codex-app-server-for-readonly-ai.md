# ADR-010：首个AI后端使用Codex App Server

- 状态：已接受
- 日期：2026-07-19

## 背景

CONTAM Studio已经有由Rust持有的可信项目、草稿、运行和结果状态。首个AI切片需要使用用户现有ChatGPT订阅，同时不能让模型读取项目目录、原始PRJ或内部证据，也不能收集API Key或复制认证材料。

## 决策

Phase 6A使用OpenAI官方Codex CLI提供的本地`codex app-server`作为唯一AI后端。React只调用显式Tauri命令；Rust负责CLI发现、stdio JSON-RPC、账号与模型目录、上下文快照、只读Thread、回答校验、停止和工具事件拦截。

应用只调用`account/read`检查已有登录，不调用`account/login/start`或`account/logout`，不读取`auth.json`或其他`.codex`文件，不复制OAuth Token，不保存OpenAI API Key，也不修改用户全局Codex配置。未登录时由用户自行在终端执行`codex login`。

Thread必须使用受控空目录、只读沙箱和禁止审批升级的策略。服务端不能确认只读时整体拒绝。上下文只从Rust可信活动状态产生，用户发送前查看精确披露；项目、Revision、Zone、模型、语言或范围变化时旧预览和Thread失效。

任何命令、文件修改、工具、搜索、Computer Use或审批事件都会触发Turn中断并丢弃回答。Phase 6A只显示严格结构化解释，不提供AI Patch、AI运行或自主操作。

## 理由

- 使用用户已有ChatGPT订阅，不需要Studio收集API Key；
- App Server提供富客户端需要的账号、模型、Thread、Turn、中断和事件协议；
- 认证刷新由Codex管理，Studio只获得清理后的状态；
- Rust可在模型之前建立路径隔离、上下文披露和确定性协议验证；
- AI故障与联网状态不会影响离线核心工作流。

## 后果

- App Server在本机运行，但模型请求发送到Codex服务；该方案不是离线模型；
- Plus/Pro订阅额度、速率限制和网络可用性由Codex服务管理；
- App Server协议可能演进，需要继续以官方当前协议和真实CLI验证兼容性；
- Phase 6A不支持本地模型、OpenAI Compatible API、Ollama、其他云提供方、跨重启聊天、完整结果序列、工具或写入。

## 替代方案

- 直接OpenAI API：需要单独API Key管理，不符合本阶段订阅身份目标；
- 读取Codex认证文件或Legacy内部后端：越过认证边界，拒绝；
- 直接运行交互式Codex CLI：不提供适合桌面状态机的结构化协议；
- 本地模型或其他提供方：不在Phase 6A范围。

## 许可与来源

协议事实来自OpenAI官方[Codex仓库](https://github.com/openai/codex)及[App Server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)。上游仓库采用Apache-2.0。CONTAM Studio未复制App Server实现代码，也未复制AGPL项目`llm-for-zotero`的代码、包装器或UI；只独立实现公开的客户端架构。

## 实现后续：受控CLI安装

用户明确要求桌面端在CLI缺失时提供安装提醒和一键安装。该后续不改变AI只读决策：安装必须由用户二次确认，React不能提交URL、命令、参数或路径；Rust只执行固定OpenAI官方安装入口，并在执行前验证当前已审阅脚本的大小和SHA-256。脚本身份变化、超时、非零退出或安装后版本探测失败时拒绝继续。该受控操作不登录、不读取认证文件、不提升权限、不修改项目，也不向WebView开放通用Shell、文件系统或HTTP能力。
