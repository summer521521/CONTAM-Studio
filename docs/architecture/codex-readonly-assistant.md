# Codex App Server只读AI助手

## 边界

Phase 6A的AI链路为：

```text
React AI侧栏
↓ 仅安全身份、问题、范围、模型和推理强度
Tauri受控命令
↓ Rust生成并披露可信上下文快照
本地codex app-server
↓ 用户现有ChatGPT订阅和联网模型
结构化只读解释
```

`codex app-server`进程在本机运行，但模型推理需要联网；它不是本地离线模型。用户未主动点击连接前不启动进程。AI不可用时，项目读取、草稿、运行、结果和CSV功能不受影响。

技术契约依据任务执行时的OpenAI官方[Codex App Server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)及实际协议类型。App Server协议仍可能演进，因此所有请求、响应和通知均由版本绑定的严格子集解析。

## CLI与进程

Rust按以下顺序发现Codex：

1. `CONTAM_STUDIO_CODEX`指定的绝对`codex.exe`路径；
2. 当前Windows用户的OpenAI官方独立安装位置；
3. 当前进程`PATH`中名为`codex.exe`的普通文件。

不扫描磁盘、注册表、其他用户目录或`.codex`，也不修改`PATH`。探测使用参数数组执行`codex --version`，限制时间与输出，WebView只收到版本和来源，不收到路径或stderr。显式环境变量仍高于官方用户安装位置和`PATH`，因此管理员或开发环境可以保持确定的受控覆盖。

桌面工作台首次绘制后会进行一次仅本地的有界CLI版本探测，用于把“Codex CLI已安装，AI未连接”与“未检测到Codex CLI”区分开。该启动探测只检查规范化候选文件的普通文件身份、大小和修改时间，并以参数数组执行一次有界`codex --version`；它不读取整个大型可执行文件计算哈希，不启动`codex app-server`，不读取账号或模型目录，不修改认证，也不发送项目上下文或模型请求。进程运行上限为5秒，停止确认和stdout/stderr共享捕获各有3秒上限，不能再因单个流线程无界等待而长期卡住状态。

轻量启动提示不是执行信任凭据。只有用户明确点击“连接Codex”后，Rust才对同一路径执行完整的前后SHA-256、大小和修改时间复核，并在两次身份快照之间执行版本探测；受控安装完成后的复核也使用该严格路径。这样既避免冷文件缓存或安全软件让首次状态提示读取数百MB两次，又不放宽真正启动App Server时的二进制身份边界。

CLI缺失时，AI侧栏显示安装提醒、联网和落盘影响、哈希锁定策略以及官方手动命令。一键安装只在用户点击确认后执行，React只发送`request_id`。Rust使用固定的OpenAI官方`https://chatgpt.com/codex/install.ps1`入口、固定Windows PowerShell路径和固定参数；当前审阅脚本大小为30133字节，SHA-256为`95923C2AC60B963C95435AAEAEFEAAB3CBC01559E21FCE1FA501EE1F9793AC0E`。下载超过128 KiB、哈希变化、运行超过180秒、非零退出或安装后`codex --version`复核失败均整体拒绝。上游脚本变化必须先由新版本Studio重新审阅并更新锁定值，不能静默接受。

该入口是Rust内部固定操作，不是通用命令执行能力。它不接受用户URL、参数或目标目录，不向WebView开放Shell、文件系统或HTTP插件权限，不自动登录、不读取认证文件、不提权，也不修改项目。安装使用当前Windows用户范围并由Codex维护独立程序包缓存；已经存在可探测CLI时不会重复安装。安装临时目录位于应用本地数据，完成后尽力清理。

连接时Rust在应用本地数据目录创建空的`ai/codex-runtime/<session>/`工作目录，并以`codex app-server --stdio`启动。该目录不是项目、草稿、运行、结果或仓库目录，且不会写入PRJ、SIM、manifest或上下文文件。每次连接先取得单调递增的内部连接租约；只有仍持有该租约且尚未被替换的连接才能发布账号、模型目录和可用状态。并发连接、失效连接或迟到的初始化结果不能覆盖当前连接，也不能用于启动新的Turn。

进程使用管道JSONL、受控环境、有界消息和有界关闭流程。断开、替换或应用退出时，Rust先关闭stdin，再以固定上限确认退出，必要时请求kill，并以固定上限等待stdout/stderr读取线程结束。只有进程、两个流线程和运行目录都已确认收口时才视为关闭完成；未完成的连接会保留在Rust受控的退役列表中，后续受控操作和退出路径会再次尝试收口，而不会把仍可能持有管道或运行目录的连接伪装为已清理。Windows Job Object进程树治理仍是Beta残余风险。

项目打开、Zone切换或Revision变化只会使已披露上下文和Thread失效，不会把一个健康的App Server当作项目资源而重启。若此时存在活动Turn，Rust先以原子标记声明唯一一次`turn/interrupt`请求；该Turn完成或失败前不会让新Turn与它重叠。若取消、超时或工具拦截后未在固定上限内收到同一Thread和Turn的终态`turn/completed`，Rust会废弃并有界关闭整个连接，而不是让可能仍在服务端活动的旧Turn进入下一次会话。失效后的旧预览、Thread、令牌摘要和回答均不能重新绑定到新上下文。反之，Rust会在复用目录、账号或模型目录前无阻塞检查子进程是否仍存活；已退出、不完整或已断开的连接会清除其旧目录、账号和模型缓存，并在用户下一次明确点击“连接Codex”时创建新的受控会话，不能把失效目录伪装为可用连接。

`pnpm tauri dev`从命令发出到首次窗口显示仍可能受Vite、Rust增量状态、链接器和安全软件影响；这段开发构建等待发生在React首次绘制和上述CLI探测之前。它与窗口出现后的轻量CLI状态探测，以及用户主动连接后的严格二进制复核、App Server启动、账号读取、模型目录请求和联网模型响应，都是独立阶段。窗口配置使用与工作台一致的背景色减少开发加载时的白色闪屏，但不把开发构建或网络等待伪装成离线即时连接。

## 协议子集

Phase 6A只处理初始化、账号读取、模型目录、Thread/Turn、Turn中断、Agent Message和有限状态通知。每行必须是有界UTF-8 JSON对象，请求ID严格匹配；未知通知忽略，未知服务端请求安全拒绝。原始RPC、stderr、推理文本和内部错误不进入React。

账号只返回认证状态、认证模式、计划类型和是否需要重新登录。应用不读取认证文件，不调用登录或登出RPC。未登录时只提示用户在终端执行`codex login`。

模型和推理强度来自当前`model/list`目录。Rust保留服务端顺序、过滤隐藏模型，并拒绝React提交目录外的模型或推理强度。

## 可信上下文

上下文只由Rust活动状态生成，允许范围为：

- `project_summary`：安全文件名、Zone数量、读取器模式、头版本和Revision；
- `selected_zone`：`zone_id`、显示编号、名称、属性、来源行号和单位；
- `draft_summary`：Revision、dirty、exported、Undo/Redo能力；
- `run_summary`：当前Revision成功运行的安全摘要；
- `result_summary`：当前Zone结果首末样本、范围和样本数；
- `diagnostics`：白名单诊断码、清理文案和来源行号。

默认仅选择`selected_zone`和`draft_summary`。不发送路径、PRJ正文、内部快照、manifest、SIM、日志或完整577条样本。React先请求Rust生成最终预览；预览绑定项目session、Revision、Zone、范围、语言、模型和推理强度。确认后的预览可在界面收起而不失效；任一绑定维度变化仍会使预览与旧Thread失效，必须重新预览。

## 只读Thread与回答

Thread使用受控空目录、`read-only`沙箱、`never`审批、临时会话、空MCP和动态工具集合；Turn再次指定只读且禁用网络工具。Rust要求Thread响应确认`readOnly`、`networkAccess=false`、`never`审批和受控`cwd`；`runtimeWorkspaceRoots`只能为空或唯一等于该受控空目录，不能包含项目、草稿、运行或结果目录。App Server可能单独报告继承的进程级指令来源；这些不是Studio披露的项目上下文，Studio不读取其内容，也不将路径或内容发送到WebView或用户消息。若服务端不能确认上述只读契约，返回`codex_readonly_mode_unavailable`，不会降级到可写权限。

系统指令要求只依据披露上下文，不读取文件、不运行命令、不修改项目、不运行ContamX、不创建Patch，也不声称分析未发送的数据。回答必须精确匹配四字段Schema：

```json
{
  "deterministic_facts": ["..."],
  "interpretation": "...",
  "limitations": ["..."],
  "suggested_questions": ["..."]
}
```

Rust限制字段、数量、单项长度和总长度。解析失败不显示原始模型文本。界面把模型复述的确定性事实、AI解释和限制分区显示；模型复述不替代应用确定性面板。

## 同会话记录、可选本地档案与失效

Phase 6A-Beta-1只把已经完成且通过四字段Schema验证的问答保留在React内存。每一条记录只包含用户问题、Turn标识和已验证结构化回答；不保存原始JSON-RPC、推理、令牌对象、路径、PRJ文本、结果文件或完整结果序列。记录上限为12条，超过上限时仅移除当前可信绑定中最早的已完成记录。

记录只属于同一项目session、Revision、Zone、披露范围、界面语言、模型和推理强度的可信绑定。重新生成或收起同一绑定的预览不会清空已完成记录；项目、Revision、Zone、模型、推理强度、披露范围、语言变化，或用户清空会话、断开连接、App Server断开和应用重启都会同时废弃Thread、预览和可见记录。用户清空会话只清除这一内存记录，不会自动删除已选择保存的本地档案。

### Phase 6A-Beta-2本地只读对话档案

本地档案默认关闭。用户主动启用后，Rust才会把已完成、通过结构化回答契约的问答写入应用本地数据目录下受控的`ai/conversation-archive/archive.json`；该内部路径、基线SHA-256和档案文件本身都不会进入WebView。档案不保存Thread、原始JSON-RPC、推理、令牌、认证数据、绝对路径、PRJ正文、manifest、SIM、原始日志或完整结果序列。

每条档案仅包含安全的问题文本、已验证的结构化回答、时间、模型/推理强度/语言、披露范围、Revision和Zone身份。Rust用原始基线SHA-256与稳定`zone_id`过滤当前可见历史，因此同一基线项目的同一Zone可查看以前Revision的记录，并明确标记“当前Revision”或“历史Revision”；不同基线或不同Zone的记录不会显示。档案绝不自动加入后续模型上下文、不会恢复Thread，也不会让模型读取过去记录。

档案最多保存200条，序列化文件上限为2 MiB，以受控临时文件、`sync_all`和原子重命名写入。用户可以删除单条、清空当前Zone历史或清空全部本地档案；关闭档案只停止后续保存，既有记录只会在用户明确删除后移除。损坏、超限或含敏感模式的档案会整体拒绝读取或写入，不会降级为未经验证的数据。

用户停止Turn时，React先使当前请求代际失效，Rust继续执行已有的单次`turn/interrupt`和终态确认策略。已经完成的内存记录和已成功写入的本地档案保持不变；未完成Turn的迟到回答不会追加到记录或档案，也不会进入新上下文。停止后保留问题输入，用户可在同一有效预览下明确再次发送。

## 工具拦截与停止

Rust监视命令执行、文件修改、MCP、动态工具、网页搜索、Computer Use、审批和权限请求等事件。带Thread或Turn身份的通知先验证其归属，旧Turn事件不会影响当前Turn；无归属的服务端请求一律安全拒绝。命中当前Turn的工具事件后立即请求`turn/interrupt`，丢弃回答，只记录事件类别并返回`ai_tool_use_blocked`。不记录命令、路径或请求正文。

停止按钮只中断当前Turn，保留已完成回答；协议故障时连接转为故障并可由用户手动重连。Phase 6A不持久化Thread、不自动恢复聊天或重新发送本地档案，不支持AI写入、完整项目问答、完整曲线分析、其他AI后端或自主Agent。

## 诊断

对外诊断为稳定白名单，例如`codex_cli_not_found`、`codex_cli_install_failed`、`codex_cli_installer_unsupported`、`codex_not_authenticated`、`codex_readonly_mode_unavailable`、`ai_context_stale`、`ai_tool_use_blocked`和`ai_response_contract_invalid`。诊断不包含CLI路径、项目路径、下载输出、stderr、RPC正文、凭据或Traceback。
