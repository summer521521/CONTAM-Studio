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

CLI缺失时，AI侧栏显示安装提醒、联网和落盘影响、哈希锁定策略以及官方手动命令。一键安装只在用户点击确认后执行，React只发送`request_id`。Rust使用固定的OpenAI官方`https://chatgpt.com/codex/install.ps1`入口、固定Windows PowerShell路径和固定参数；当前审阅脚本大小为30133字节，SHA-256为`95923C2AC60B963C95435AAEAEFEAAB3CBC01559E21FCE1FA501EE1F9793AC0E`。下载超过128 KiB、哈希变化、运行超过180秒、非零退出或安装后`codex --version`复核失败均整体拒绝。上游脚本变化必须先由新版本Studio重新审阅并更新锁定值，不能静默接受。

该入口是Rust内部固定操作，不是通用命令执行能力。它不接受用户URL、参数或目标目录，不向WebView开放Shell、文件系统或HTTP插件权限，不自动登录、不读取认证文件、不提权，也不修改项目。安装使用当前Windows用户范围并由Codex维护独立程序包缓存；已经存在可探测CLI时不会重复安装。安装临时目录位于应用本地数据，完成后尽力清理。

连接时Rust在应用本地数据目录创建空的`ai/codex-runtime/<session>/`工作目录，并以`codex app-server --stdio`启动。该目录不是项目、草稿、运行、结果或仓库目录，且不会写入PRJ、SIM、manifest或上下文文件。进程使用管道JSONL、受控环境、有界消息和有界关闭流程；应用退出或用户断开时关闭stdin并终止子进程。

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

默认仅选择`selected_zone`和`draft_summary`。不发送路径、PRJ正文、内部快照、manifest、SIM、日志或完整577条样本。React先请求Rust生成最终预览；预览绑定项目session、Revision、Zone、范围、语言、模型和推理强度。任一维度变化都会使预览与旧Thread失效，必须重新预览。

## 只读Thread与回答

Thread使用受控空目录、`read-only`沙箱、`never`审批、临时会话、空MCP和动态工具集合；Turn再次指定只读且禁用网络工具。若服务端不能确认只读沙箱与`never`审批，返回`codex_readonly_mode_unavailable`，不会降级到可写权限。

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

## 工具拦截与停止

Rust监视命令执行、文件修改、MCP、动态工具、网页搜索、Computer Use、审批和权限请求等事件。命中后立即请求`turn/interrupt`，丢弃回答，只记录事件类别并返回`ai_tool_use_blocked`。不记录命令、路径或请求正文。

停止按钮只中断当前Turn，保留已完成回答；协议故障时连接转为故障并可由用户手动重连。Phase 6A不持久化Thread，不支持AI写入、完整项目问答、完整曲线分析、其他AI后端或自主Agent。

## 诊断

对外诊断为稳定白名单，例如`codex_cli_not_found`、`codex_cli_install_failed`、`codex_cli_installer_unsupported`、`codex_not_authenticated`、`codex_readonly_mode_unavailable`、`ai_context_stale`、`ai_tool_use_blocked`和`ai_response_contract_invalid`。诊断不包含CLI路径、项目路径、下载输出、stderr、RPC正文、凭据或Traceback。
