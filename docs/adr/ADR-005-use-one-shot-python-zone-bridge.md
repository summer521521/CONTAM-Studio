# ADR-005：Phase 2采用一次性Python Zone读取桥

## 状态

已接受。

## 背景

Phase 2B-1已建立严格、纯文档的简单Zone读取器。Phase 2C需要让Tauri桌面宿主受控调用该读取器，同时避免React直接访问文件系统、避免Rust复制PRJ字段解释，也避免为了单次读取过早建立常驻服务。

项目当前只验证打开一个由用户主动选择的PRJ并返回结构化只读结果。安装包尚未冻结Python运行时，未来写入、仿真和结果读取也尚未形成统一进程需求。

## 决策

- Phase 2的Zone读取采用“一次请求启动一次Python进程，stdin接收一条JSON请求，stdout返回一条JSON响应，完成后退出”的最小桥接方式。
- 协议固定包含版本、`request_id`、有限操作名和成功/失败共用的Envelope；失败不得返回部分Zone。
- Rust宿主负责Python发现、参数数组启动、工作目录、超时、输出上限、进程终止和协议验证；不使用Shell或命令字符串拼接。
- 文件选择和读取合并为唯一的`select_and_read_prj_zones`应用命令。React只传`request_id`；Rust打开原生对话框、验证并规范化所选本地PRJ路径，再在内部调用Python桥。
- 应用命令通过`AppManifest`登记，并由main窗口capability显式授予`allow-select-and-read-prj-zones`；前端不持有dialog、文件系统、Shell或HTTP权限。
- Python响应先反序列化为Rust内部Raw类型。诊断code、message和context在跨IPC前由Rust验证与清理，TypeScript清理只作为第二道防线。
- 任意非空stderr使本次桥接整体失败；成功结果的`source_path`必须规范化后与用户实际选择的文件一致。
- Python桥只复用严格Zone读取器，不调用contamxpy、ContamX或仿真初始化。
- React只通过有限Tauri命令取得结构化结果，不直接读取PRJ、启动Python或访问任意文件系统。
- 开发期Python只从`CONTAM_STUDIO_PYTHON`绝对路径或仓库内`python/.venv/Scripts/python.exe`发现；不回退到PATH中的任意Python。
- 当前不建立HTTP、FastAPI、WebSocket、长期Python服务或复杂RPC框架。
- 一次性进程用于生命周期和故障边界，不是权限沙箱，也不能将不受信任的恶意PRJ变为安全输入。

## 理由

- 请求范围小且读取时间短，一次性进程足以验证Tauri-Python契约，并天然释放Python状态。
- JSON便于Python、Rust和TypeScript分别验证，且不会把PRJ文本或内部对象暴露给前端。
- 不开放端口、不建立服务发现和认证，降低离线桌面阶段的攻击面与维护成本。
- 保留了未来基于真实性能、打包和多操作需求替换进程形式的空间。

## 后果

- 每次读取承担Python启动成本，当前10秒超时和输出上限适合受支持的小型Zone读取切片，但不代表适合仿真或大项目。
- 桌面开发运行依赖项目Python虚拟环境；安装包暂不具备自带Python运行时。
- 旧请求的UI结果由请求序号和`request_id`丢弃；当前没有跨进程主动取消协议。
- 任何协议字段变化需要同时更新Python、Rust和TypeScript验证，并递增协议版本或保持向后兼容。
- 子进程退出、崩溃、无效输出和超时必须转成结构化错误，不能让Tauri主进程崩溃或把Traceback传给用户。
- 文件选择由Rust拥有，减少WebView以任意路径调用读取器的能力；代价是选择与读取成为一个桌面操作，前端不再观察两者之间的独立路径状态。

## 替代方案

- **React直接启动Python或读取文件**：绕过Tauri能力控制和统一错误边界，拒绝。
- **Rust重新解析PRJ**：形成第二套Zone语义并增加漂移风险，拒绝。
- **本地HTTP/FastAPI服务**：需要端口、生命周期、认证和故障恢复，对当前单操作切片过重，拒绝。
- **长期Python sidecar**：可能降低启动成本，但当前缺少多操作、性能和打包证据，暂缓。
- **把contamxpy接入打开流程**：会执行稳态初始化并产生结果文件，违反ADR-004，拒绝。

## 待验证事项

- Windows安装包内Python运行时的冻结、来源、许可、签名、定位和升级。
- 大型受支持PRJ的启动开销、内存、10秒超时和2 MiB响应上限是否合适。
- 主动取消、应用退出时进程树清理和并发读取的长期策略。
- 后续仿真执行是否复用相同Envelope但采用独立运行工作区和更长生命周期。
- 协议兼容测试、版本迁移和打包后的路径隐私策略。
