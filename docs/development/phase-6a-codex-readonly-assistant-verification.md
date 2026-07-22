# Phase 6A Codex只读AI助手验证

验证日期：2026-07-19。

## 实现边界

- 用户点击连接前不发现账号、不启动App Server，也不发起模型请求。
- 工作台首次绘制后仅执行一次有界本地`codex --version`探测，以显示CLI已安装或缺失；该探测不启动App Server、不读取账号或模型目录、不修改认证，也不发送项目上下文或模型请求。
- 启动状态探测不再对CLI可执行文件执行前后两次全量SHA-256，只复核普通文件、大小、修改时间和严格版本输出；显式连接及安装后验证继续使用前后完整SHA-256，轻量提示不能替代执行身份验证。
- Rust通过显式路径、精确的官方用户安装位置或当前`PATH`发现Codex，以参数数组执行`--version`和`app-server --stdio`；不扫描`.codex`，不读取认证文件。
- CLI缺失时只显示提醒；用户二次确认后，Rust才以固定PowerShell路径和参数下载固定OpenAI官方安装脚本，校验大小和SHA-256并执行。React不能提供URL、命令、参数或路径，Tauri没有通用Shell、文件系统或HTTP权限。
- App Server工作目录位于应用本地数据的空AI目录，不是项目、草稿、运行、结果或仓库目录。
- 上下文只从Rust活动状态生成；默认披露当前Zone和草稿摘要，不含路径、PRJ正文、日志、manifest、SIM或完整577条样本。
- Thread要求`read-only`沙箱、`never`审批、空MCP/动态工具/环境/能力根；工具事件触发中断并丢弃回答。
- 回答必须符合关闭且有界的四字段JSON Schema；原始模型文本、推理、RPC和stderr不进入WebView。

## 自动验证

- Rust：`58 passed, 1 ignored`；`cargo fmt --check`和`cargo check`通过。新增覆盖环境变量、官方用户安装位置和PATH优先级、固定安装入口与脚本哈希、超时和错误映射、安装响应路径隔离、显式ACL，以及继承指令来源和受控运行根的只读Thread响应；原有账号、模型、JSONL、只读Thread/Turn、上下文绑定、工具拦截和连接清理回归保持。
- 前端：Vitest和TypeScript/Vite生产构建通过。新增覆盖启动后的本地CLI检查状态、已安装但未连接状态、无App Server连接的探测边界、安装状态、缺失提醒、双语确认文案、已确认预览的收起/展开及收起后仍可发送；原有模型、范围、Rust预览、生成/停止和结构化回答回归保持。
- Python：`266 passed`；Ruff通过。AI没有增加Python文件读取接口，既有Zone、Patch、ContamX、SimRead和结果回归保持通过。
- 通用：63个Markdown文件相对链接、8个已跟踪JSON、pnpm冻结锁校验、Cargo锁元数据、依赖清单和`git diff --check`通过。Phase 6A没有新增依赖。

## 真实Codex探测

当前机器已安装OpenAI官方独立Codex CLI，真实`codex --version`返回`codex-cli 0.144.6`。Studio的新发现顺序会在未设置`CONTAM_STUDIO_CODEX`时优先采用精确的当前用户官方安装位置，避免Microsoft Store WindowsApps入口抢先命中；WebView仍只收到版本和`official_install`来源，不收到实际路径或文件哈希。

真实App Server验证完成`initialize`、`initialized`、`account/read`和`model/list`：账号为已认证ChatGPT Plus；服务端返回4个可用模型，其中`gpt-5.6-sol`为默认模型，推理强度保持服务端返回顺序。真实只读Thread确认`readOnly`、`networkAccess=false`和`never`审批；最小官方fixture Zone上下文得到四字段Schema回答，无命令、文件、审批或其他工具事件，回答不含项目路径。第二个Turn在中断请求到达前已经自行完成，因此本次不能把真实`turn/interrupt`写成已验证中断成功；Fake App Server回归继续覆盖中断协议。

## 后续协议与预览修正

- 已安装CLI `0.144.6`的Thread响应会报告继承的进程级指令来源，并将受控空AI目录报告为唯一`runtimeWorkspaceRoots`项。前者不是项目上下文；Rust只验证其为有界字符串数组，绝不读取、保留或暴露路径或内容。后者只允许为空或唯一等于Rust创建的受控空目录；仍要求`readOnly`、`networkAccess=false`和`never`，其他根目录一律拒绝。
- 已确认的结构化上下文预览现在可以显式收起和再次展开，收起不会改变`preview_id`或使发送资格失效；项目、Revision、Zone、模型、推理强度或范围变化仍会使其失效。

## 连接恢复与披露提示

- App Server在项目打开后若异常退出、stdout提前关闭或目录状态不完整，Rust会在复用连接前通过非阻塞进程状态检查清除旧目录、账号、模型、预览和Thread；下一次用户明确点击连接时会关闭旧进程并建立新的受控会话，不能把失效目录返回给WebView。
- 发送前必须有Rust生成的上下文预览，这是只读披露边界，不是隐藏的加载条件。问题输入旁会明确说明“先查看并确认上下文后才能发送”；确认后即使收起预览，发送资格仍保留。
- `pnpm tauri dev`的冷启动与用户点击连接后的App Server/账号/模型目录联网阶段独立。窗口使用工作台背景色减轻开发加载时的白色闪屏；首次连接仍可能需要数秒，不能被描述为离线即时模型。
- 本轮新增前端状态回归和Rust失效连接回归已通过；用户反馈已证明真实会话可在打开项目和加载结果后生成结构化回答。重新验证项目先打开再连接、冷启动视觉体验和手动重连仍保留为`pending_user`，未由自动化GUI操作替代。

## 项目上下文刷新期间的连接竞态修复

- 用户手动验收报告“项目已打开后连接Codex不成功”。非GUI复现确认本机官方CLI和App Server本身正常：`initialize`、`account/read`和`model/list`均完成，账号为ChatGPT Plus，模型目录返回4项。
- 根因位于前端状态归约：项目、Revision或Zone刷新会按设计清空旧AI上下文，但此前也会清除正在进行的CLI探测或App Server连接的`request_id`。后续合法的探测或连接成功响应因此被视为旧响应并丢弃，界面可能停留在“正在连接”或不可用状态。
- 现在仅在`probing`、`installing`和`connecting`阶段保留该非项目绑定请求的身份；上下文预览、Turn和结构化回答仍在项目绑定变化时立即失效，不能跨项目、Revision或Zone复用。
- 新增归约回归覆盖“项目在CLI探测中打开”和“项目在App Server连接中打开”两种顺序，证明后续对应响应仍可进入`installed`或`available`。本轮前端为11个文件、124项测试通过，生产构建通过；真实App Server的非GUI协议复测通过。用户需在更新后的桌面窗口复测“先打开项目，再点击连接Codex”，本项GUI状态保持`pending_user`。

## 启动与CLI探测性能收口

- 用户反馈`pnpm tauri dev`到窗口显示约30秒、窗口内CLI检查约65秒。两者不是同一阶段：前者主要位于开发构建和链接阶段，后者经代码审计定位到启动探测对约341MB的`codex.exe`做前后两次全量SHA-256，在冷缓存或安全软件检查下可能被显著放大。
- 当前实现把首次状态提示改为元数据前后复核加一次严格、有界的`codex --version`；本机直接版本探测约0.06秒。完整哈希仍仅用于用户主动连接和安装后验证，未降低App Server执行身份边界。
- `--version`进程上限为5秒；终止确认和双流共享捕获分别不超过3秒。新增测试验证版本输出严格解析、超时常量和两个流共享同一join期限。真实Tauri冷启动与窗口内提示时延仍需用户在更新后复测，因此本项手动GUI状态保持`pending_user`。

用户复测进一步把剩余时延定位为：原生窗口约5秒出现，随后约15秒处于前端首屏尚未绘制的黑色表面。这段时间早于首次CLI状态探测，不应继续归因于Codex。`index.html`现在自带不依赖React、i18n或运行时脚本的双语启动表面，HTML一到达WebView即可显示明确的启动状态；React挂载后会直接替换该节点。Zone结果的ECharts模块同时改为按需动态加载，生产首屏JavaScript由约985KB降至约431KB，图表约555KB独立延后到真实结果图表需要时加载。该改动不自动连接Codex、不读取项目或账号，也不改变只读AI边界；真实Tauri首屏仍需用户复测，状态保持`pending_user`。

本次未重新执行一键安装，因为当前官方CLI已经可用，避免无意义地修改用户安装。重新下载的官方`install.ps1`为30133字节，SHA-256为`95923C2AC60B963C95435AAEAEFEAAB3CBC01559E21FCE1FA501EE1F9793AC0E`，与生产锁定值一致。真实验证未提升权限、未修改`PATH`、未读取`.codex`、未发起登录、未发送用户科研项目，也未运行ContamX。

## Phase 3C收口

用户已完成Phase 3C全部31项真实GUI验收，包括修复后的草稿另存成功、拒绝覆盖和取消保留草稿。证据见[PR #14最终验收评论](https://github.com/summer521521/CONTAM-Studio/pull/14#issuecomment-5013736336)。Phase 3C状态已改为`passed`，历史任务时间、耗时和Token字段未变。

## PR #15最终可靠性收口

- App Server连接以单调租约发布：并发连接被拒绝，迟到初始化和替换后的连接不能覆盖当前账号、模型目录或可用状态；已替换连接也不能启动新的Turn。
- 上下文失效、用户停止、超时和工具拦截共享单次原子`turn/interrupt`声明。只有收到同一Thread和Turn的终态`turn/completed`才允许保留连接；无法确认终态时废弃整个连接并进行有界关闭，避免旧Turn的迟到事件进入下一次会话。
- 关闭按stdin、子进程、stdout/stderr读取线程和受控运行目录的顺序收口。未完成的关闭不会伪装为成功，连接会保留在Rust受控退役列表中并在后续操作或退出路径重试；仍未引入Windows Job Object进程树治理。
- Rust回归现为`70 passed, 1 ignored`，新增覆盖连接租约、替换连接、Turn开始后状态不明、工具拦截后终态确认、单次中断声明、受阻流线程、运行目录延后清理和退役连接重试。Python为`266 passed`，前端为`121 passed`，本轮未修改Python或React业务接口。
- 此收口仅通过自动化和非GUI协议测试验证；真实用户GUI复验仍由用户执行，不将其写为自动验收通过。

## Phase 6A-Beta-1同会话记录

- AI侧栏现在只把已完成且符合关闭四字段Schema的问答记录在当前React内存中。每条记录包括问题、Turn标识和结构化回答，最多保留12条；不保存原始模型文本、推理、令牌对象、路径、PRJ正文、结果文件或完整结果序列。
- 同一项目session、Revision、Zone、披露范围、界面语言、模型和推理强度不变时，重新生成预览或收起预览不会清空已完成记录。项目、Revision、Zone、模型、推理强度、披露范围、语言、连接和应用生命周期变化会同时清空Thread、预览和可见记录。
- 用户停止时，当前请求代际立即失效；先前完成记录和问题输入保留，未完成Turn的迟到回答不会进入记录。该逻辑复用既有Rust中断与终态确认边界，不新增工具、权限、网络、文件读取或持久化能力。
- 本轮前端状态/渲染回归为`123 passed`，覆盖记录顺序、12条上限、预览刷新保留、停止丢弃部分回答、迟到回答拒绝、绑定失效、断开清空和双语显示；生产构建通过。Python回归为`266 passed`且Ruff通过；Rust回归为`70 passed, 1 ignored`，`cargo fmt --check`和`cargo check`通过。真实Tauri GUI复验仍为`pending_user`，不以自动化替代。

## Phase 6A-Beta-2本地只读对话档案

- 本地档案默认关闭。用户明确启用后，只有已完成且通过关闭结构化回答Schema的问答会由Rust保存到应用本地数据目录；档案不保存Thread、认证、原始JSON-RPC、推理、令牌、路径、PRJ正文、manifest、SIM、日志或完整结果序列。
- Rust以原始项目基线SHA-256和稳定Zone UUID筛选可见档案。相同基线项目与Zone的历史Revision会显示并标记为历史记录；不同基线或Zone不会显示。档案从不自动进入后续模型上下文、不恢复Thread，也不改变项目、草稿、运行、结果或CSV状态。
- 保存采用严格文件Schema、敏感模式拒绝、200条和2 MiB上限、受控临时文件、`sync_all`和原子重命名。用户可删除单条、清空当前Zone历史或清空全部本地档案；关闭档案只停止后续保存，历史记录仍须由用户明确删除。
- Rust回归为`74 passed, 1 ignored`，新增覆盖默认关闭、仅安全历史视图、基线/Zone过滤、跨Revision标记、200条保留和损坏/敏感档案拒绝。前端为11个文件、129项测试通过，覆盖安全归档视图、保存标识、上下文失效、档案显示、删除/清空回调和无路径桌面API。Python为`266 passed`，Ruff通过；前端生产构建、`cargo fmt --check`、`cargo check`均通过。
- 通用检查：71个Markdown文件的92个相对链接、8个已跟踪JSON、`pnpm install --frozen-lockfile --offline`、`cargo metadata --locked`、依赖/许可证表面检查和`git diff --check`通过。此切片没有新增运行时依赖。
- 本轮未以GUI自动化替代用户验收；真实本地档案启用、跨重启显示、单条删除、当前Zone清空、全部清空、关闭后不再保存以及中英文/主题显示仍为`pending_user`。

## 手动GUI状态

本次用户明确确认`PH6-01=completed`。本段只记录这一条用户GUI状态证据，不把Codex自动检查或非GUI协议复测当作GUI证据，也不补写本消息未提供的逐项操作、截图、时延、安装或进程观察。
