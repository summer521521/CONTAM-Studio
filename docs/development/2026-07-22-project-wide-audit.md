# CONTAM Studio全项目审计

审计日期：2026-07-22

审计基线：`8de5b189e3a0dc5c37dc7cec9a14d4df87072f52`

当前分支：`codex/phase-6a-codex-readonly-assistant`

## 结论

CONTAM Studio的总体方向正确，不应推倒重来。官方ContamX、离线优先、原始PRJ默认不覆盖、GUI与AI共用语义接口、结构化Patch和确定性证据链，都是值得长期保留的核心原则。

当前产品成熟度更准确地说是**工程质量较高的Developer Alpha**，还不是普通学生、教师或研究人员可自行安装并完成真实任务的User Beta。下一步不应直接进入Phase 7 AI Patch，而应先完成：

```text
P0数据安全修复
→当前分支真实GUI收口与合并
→状态真相、产品契约和质量门
→Windows分发与工具链配置
→当前Alpha用户试用
→选择一个旗舰教学/科研场景
→领域读取/人工Patch/结果/前后比较
→User Beta与发布
→最后再设计AI写入
```

## 审计范围

- 检查产品愿景、用户场景、范围、路线图、ADR、风险、许可、研究、当前状态和任务日志。
- 检查React/TypeScript、Rust/Tauri、Python领域核心、ContamX/SimRead边界、测试和发布配置。
- 未读取、修改或暂存工作树中既有的未跟踪PRJ和CSV正文；它们仍按用户文件处理。
- 本审计完成项目级证据检查和现有自动验证，不等于完成正式安全审计、安装包验证或真实GUI验收。

## 验证基线

| 检查 | 结果 |
|---|---|
| Python测试 | `266 passed` |
| Ruff | 通过 |
| 前端测试 | `11`个文件、`129 passed` |
| 前端生产构建 | 通过；懒加载图表chunk约`554.81 kB`并触发Vite大chunk警告 |
| Rust测试 | `74 passed, 1 ignored` |
| Rust格式与检查 | `cargo fmt --check`、`cargo check`通过 |
| Rust Clippy严格门 | 未通过；`cargo clippy --all-targets -- -D warnings`报告多项可维护性诊断 |
| 中英文资源 | 各`504`个叶子键，无缺键或类型不一致 |
| GUI与安装包 | 本轮未执行；按项目规则保持`pending_user`或`not_run` |

## 做得好的部分

1. **产品边界克制。**`docs/product/vision.md:5-25`和`docs/product/scope.md:16-37`清楚排除了重写求解器、通用BIM、多求解器和自主Agent。
2. **写入链路有真实防线。**Patch绑定SHA-256、大小、行号、旧记号和Revision，React不能提交路径或完整Patch。
3. **运行和结果可追溯。**ContamX、SimRead、输入快照、manifest、结果和CSV之间已有明确身份绑定。
4. **AI默认只读。**Codex路径把本地进程、联网模型、披露范围、工具拦截和无AI降级分开处理，而不是只依赖提示词。
5. **测试数量和失败关闭意识明显高于普通原型。**现有自动测试全部通过，且大量覆盖错误契约、路径泄漏、旧响应和状态失效。

## 主要发现

### P0：草稿另存竞态可删除其他进程刚创建的文件

`src-tauri/src/zone_bridge.rs:4363-4400`中的`copy_draft_atomically()`先以临时文件写入，再用`hard_link`独占提交；但只要整个闭包返回错误，代码就无条件执行`remove_file(output)`。如果另一个进程恰好在提交瞬间创建同名目标，`hard_link`会返回`AlreadyExists`，随后Studio会删除那个不属于本次操作的文件。

现有测试只覆盖“调用前目标已存在”，没有覆盖“提交瞬间被并发创建”。这违反项目的不可覆盖边界。修复前不得再把该路径描述为并发安全。

Python Patch和Rust CSV的最终输出在成功拥有后也存在“路径被外部替换，再按路径清理”的窄TOCTOU残余风险，但它们没有上述“提交失败即可确定删除第三方文件”的同型缺陷。后续应统一采用“验证临时文件→复核可信状态→最后独占提交”的commit-last模式，或在清理前验证文件身份。

### P1：当前没有普通用户可用的Windows交付物

- `src-tauri/tauri.conf.json:30-32`明确设置`bundle.active=false`。
- `src-tauri/src/zone_bridge.rs:1273-1291`从编译期仓库根寻找`python/.venv/Scripts/python.exe`；安装目录中不会存在该开发结构。
- ContamX和SimRead只能通过环境变量配置，界面中的Settings仍是占位操作。
- `docs/architecture/overview.md:117-125`仍把Python冻结、工具发现、Windows安装、签名和升级列为未验证事项。

这不是技术路线不可行。NIST当前Windows x64官方包同时包含ContamX、SimRead、SimComp和PrjUp并公布SHA-256；Tauri 2也正式支持外部sidecar以及NSIS/MSI安装包。阻塞点是项目尚未完成分发决策和集成，而不是缺少可用平台能力：

- [NIST Download CONTAM](https://www.nist.gov/el/beed/nist-multizone-modeling/software/contam/download-contam)
- [Tauri Embedding External Binaries](https://v2.tauri.app/develop/sidecar/)
- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)

### P1：当前功能闭环的用户价值仍过窄

当前可安全读取的领域面是严格简单Zone子集，只能修改`volume_m3`；结果只包含当前Zone的温度、参考压力和空气密度。`docs/architecture/prj-zone-reader-support.md:47-56`、`docs/roadmap/phases.md:27-33`和`docs/current-state.md:192-203`都明确承认完整PRJ、其他字段、运行历史、多运行比较和Python打包尚未完成。

用户场景却包含路径或调度参数、修改前后比较、复杂PRJ和批量科研场景，见`docs/product/users-and-use-cases.md:9-11,25-31`。因此Phase 6只读AI虽然边界做得严谨，但产品主链路仍没有证明“学生或研究生可完成一个有学术意义的实验”。

推荐的v0.1旗舰候选是“教师提供项目→调整一个经过验证的物理参数→运行→读取污染物或气流结果→与基线比较→导出证据”。其中“教室CO2/污染物浓度前后比较”最贴近产品定位，但必须先通过3至5名目标用户观察确定，不能由模型直接替用户冻结需求。

### P1：审批、项目替换和草稿生命周期存在工作流缺口

1. `src/styles/app.css:976-983`的Patch遮罩避开顶部栏和活动栏；`src/app/App.tsx:1014-1024`没有把`review`纳入全局禁用条件。审阅期间仍可能打开、运行、Undo或导出。Rust会拒绝部分失效请求，但界面没有形成真正的审批模态。
2. `src/app/project-state.ts:270-318`在打开其他项目取消或失败后保留旧项目，却把状态改为`cancelled/error/unsupported`；`src/app/App.tsx:1024`又只允许`loaded`运行，造成“旧项目仍可见但不可继续运行”。
3. 草稿不跨重启恢复是已接受边界，但打开其他项目或退出时没有未导出草稿确认。原始PRJ不会丢失，用户当前会话中的修改劳动会无提示丢失。

这三项应分别修复，不应混成一次大规模前端重构。

### P1：子进程外层超时不是内部预算的真实包络

Rust桥外层固定`run=75s`、`extract=45s`，见`src-tauri/src/zone_bridge.rs:32-35`。Python内部ContamX路径包含版本探测、60秒主运行和多轮terminate/kill/join，最坏预算超过100秒；SimRead的probe、30秒提取和收口最坏也超过60秒。

同时`src-tauri/src/zone_bridge.rs:1553-1604`在超时后对Python直接`kill()`，随后使用无上界`child.wait()`和线程`join()`；它没有治理Python启动的ContamX/SimRead进程树。结果可能是Rust先杀Python、官方工具仍持有管道或继续写入，外层调用无法按文档承诺有界结束。

应先统一预算和失败证据，再用Windows Job Object的kill-on-close治理整个进程树；主动取消也应复用同一机制。

### P1：架构边界正确，但文档职责和代码形态已经漂移

- `src-tauri/src/zone_bridge.rs`超过6000行，混合协议、进程、项目session、Revision、Patch、运行、结果、CSV、命令和测试。
- `src-tauri/src/codex_app_server.rs`超过5400行，混合CLI发现、安装、JSON-RPC、连接、Turn、档案、持久化和测试。
- `src/app/App.tsx`超过1200行，集中多个Reducer和大部分异步编排。
- Python协议版本和操作常量分别维护在Rust与Python；TypeScript类型又单独维护。`python/README.md:3,41-43`仍写协议`1.0`、64 KiB和只读单操作，而实际代码及架构文档已是`1.2`、128 KiB和五个操作。

不建议因此更换技术栈或改为常驻服务。应先新增一份职责ADR，把实际且合理的边界写清：

| 层 | 应承担 | 不应承担 |
|---|---|---|
| React | 交互、呈现、非可信客户端状态和第二道响应检查 | 路径、文件写入、求解器、可信身份决策 |
| Rust/Tauri | 可信桌面编排：路径、权限、session、Revision、UUID、原子提交、子进程、持久化身份和IPC验证 | PRJ语法解释、科学结果语义、任意Shell |
| Python | PRJ语义、字节Patch、ContamX/SimRead适配和科学结果解析 | 桌面权限、用户对话框、WebView状态 |
| 官方工具 | ContamX求解和SimRead转换 | Studio工作流和AI审批 |

随后按修改热点逐个抽取模块，并先补特征测试；不要让低思考模型一次性拆分三个大文件。

### P1：项目缺少自动质量门和一致的契约测试

- 仓库没有`.github/workflows`，当前自动测试结果只存在于本机记录。
- 前端组件测试主要使用`renderToStaticMarkup`；Patch焦点、点击、窗口关闭和App编排没有DOM交互测试。
- `src/app/desktop-api.test.ts`主要检查函数参数个数和源码字符串，没有验证真实`invoke`命令名及载荷。
- Rust Clippy严格模式当前失败，说明它还不是可持续质量门。
- Python开发依赖只有范围约束，没有已批准的可复现锁定策略。

应先建立Windows CI、仓库结构检查、双端黄金契约夹具和前端命令可用性特征测试，再允许低思考模型扩展新的跨语言操作。

### P1：状态文档不是单一真相源

- 当前本地`main`停在Phase 3C，Phase 6A在独立分支上；最新Beta-2真实GUI仍是`pending_user`，见`docs/development/phase-6a-codex-readonly-assistant-verification.md:80-89`。
- `docs/current-state.md:3`日期仍为2026-07-19；同文件前部描述Phase 6A已实现，`192-194`又写“正在接入”。
- `docs/roadmap/phases.md:43-48`的Phase 5没有就地写当前进展，完成信息被追加在Beta之后的`71-77`，并重复Phase 4B。
- README、current-state、roadmap、验证记录和任务日志重复维护阶段叙述，低思考模型很容易把“实现”“检查通过”“GUI通过”“已合并”“已打包”混为一谈。

应建立唯一状态矩阵，逐切片记录`implemented`、`automated_verified`、`manual_gui`、`merged_to_main`、`packaged`、`user_validated`六个维度，其他文档只引用或摘要。

### P1：许可与研究证据尚不能支撑发布

- 根目录没有Studio自身`LICENSE`和完整`THIRD_PARTY_NOTICES`；`docs/licensing/licensing-strategy.md:9,18-24`仍等待用户决定。
- 研究报告含64个`turn...`内部引用占位符，没有可点击来源，且部分历史建议已被后续ADR替代。
- NIST允许再分发和修改CONTAM，但二进制分发必须保留CVODE等第三方声明；见[NIST CONTAM Software Disclaimer](https://www.nist.gov/el/beed/nist-multizone-modeling/software/contam/contam-software-disclaimer)。

因此可以继续做分发Spike，但在User Beta前必须由用户确定Studio许可证、ContamX/SimRead捆绑策略和第三方声明。

### P2：界面仍暴露开发阶段而不是用户任务

- TopBar、欢迎页和错误文案仍显示`Phase 6A`、`Phase 4 manifest`和`Phase 1 placeholder`。
- New、Settings、Recent、Search、Run history和部分项目树/Inspector仍为占位或模拟内容。
- 浅色辅助文本对比度、焦点覆盖、减少动画、Tab/树键盘关系和英文最小窗口缩放仍需专项验收。
- 运行证据长期保存在应用目录，但UI没有持久运行目录、保留策略和存储管理。

Developer Alpha可以保留调试信息，User Beta界面必须使用用户术语，并隐藏未实现命令或明确放入开发者模式。

## 建议的产品契约

### Developer Alpha

供开发者和少量受指导用户验证安全闭环。允许只支持严格PRJ子集和一个字段，但必须诚实显示兼容范围，不能声称可分发或支持完整CONTAM项目。

### User Beta

建议主Persona为“使用教师提供案例的学生/研究生”；教师是案例准备和分发者，复杂科研项目作为后续扩展。Beta至少满足：

1. 干净Windows 10/11 x64机器无需Node、Rust或项目`.venv`即可安装和启动。
2. 用户能在界面配置或使用已捆绑的ContamX/SimRead，失败时得到可操作诊断。
3. 完成一个旗舰任务：打开→审阅→人工修改→Diff→Undo/Redo→运行→结果→前后比较→导出。
4. 原始PRJ不变，结果绑定Revision、求解器和manifest，未知内容不被静默解释或丢弃。
5. 3至5名Alpha用户中至少80%无需开发者代操作完成任务；User Beta扩大到5至10人，保持零数据损坏、零静默语义错误和零未披露联网。
6. AI始终是可选增强；无Codex和无网络时核心任务完整可用。

## 暂停项

在以下门禁全部满足前，暂停Phase 7 AI Patch：

- P0输出竞态已修复并有确定性回归测试。
- 至少两个GUI人工写操作已稳定复用同一语义Patch接口。
- 多操作事务、引用完整性、拒绝、审批、回滚和审计Schema已由高思考模型与用户冻结。
- User Beta已证明核心工作流有价值，AI不是在补偿基础产品缺失。

同样不应提前建设完整PRJ AST、常驻HTTP/WebSocket sidecar、插件市场、多求解器抽象、云同步或跨平台正式发行。

具体任务依赖、范围、验收和验证命令见[后续执行任务书](../roadmap/next-development-execution-plan.md)。
