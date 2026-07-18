# Tauri-Python Zone读取桥

## 目的与范围

Phase 2C用最小纵向切片验证桌面端能够打开受支持的真实PRJ并展示全部Zone。Phase 3B在同一受控边界中加入Zone体积Patch计划与“另存为新副本”。桥只调用严格读取器和Phase 3A-0领域函数，不调用contamxpy、ContamX或仿真初始化，不支持源文件保存、完整回写、结果读取或AI。

```text
React GUI
↓ Tauri invoke
Rust桌面宿主
↓ 一次性Python进程，stdin/stdout JSON
contam_studio_core.zone_bridge
↓
read_simple_zones / plan_zone_volume_patch / apply_zone_volume_patch_to_copy
```

## 为什么使用一次性进程

- 当前操作均为短时读取或单字段副本写入，不需要常驻Python状态。
- 每个请求结束后Python进程退出，故障和模块状态不会留在桌面主进程。
- 不开放端口，不需要HTTP服务发现、认证、重连或后台进程管理。
- 该选择只验证Phase 2边界；未来是否改为长期受控sidecar必须由性能、打包和多操作证据决定。

一次性进程不是权限沙箱。它不能防御恶意PRJ，也不能替代输入格式限制、源文件哈希验证和最小Tauri权限。

## JSON协议

协议版本为`1.1`。相对`1.0`新增两个显式白名单操作和带`result_type`的结果联合，因此递增次版本。Python从stdin读取一条不超过128 KiB的UTF-8 JSON请求，stdout只输出一条完整JSON响应并换行。

```json
{
  "protocol_version":"1.1",
  "request_id":"UUID",
  "operation":"read_simple_zones",
  "source_path":"F:\\path\\model.prj"
}
```

成功和失败使用同一Envelope：

```json
{
  "protocol_version":"1.1",
  "request_id":"UUID",
  "ok":true,
  "result":{"result_type":"read_zones","project":{"schema_version":"1.0"}},
  "error":null
}
```

失败时`ok=false`、`result=null`，`error`包含稳定`code`、短消息、可空源行号和受限上下文。桥不会返回部分Zone或部分应用结果。`result_type`只允许`read_zones`、`zone_volume_patch_plan`和`zone_volume_patch_application`；Rust分别校验协议、`request_id`、Envelope及每种结果的完整契约。

计划请求由Rust加入活动项目路径、Zone编号和最长80字符的ASCII新记号；Python返回完整Patch和单行Diff。Rust验证后只把安全审阅视图发给WebView，完整Patch保存在内存。应用请求由Rust加入活动源路径、原生保存对话框得到的输出路径及内存中的完整Patch；前端不能提供三者中的任何路径或Patch对象。

## 进程生命周期

1. React生成`request_id`，调用`select_and_read_prj_zones`，不提供文件路径。
2. Rust通过官方原生对话框选择单个`.prj`；取消直接返回`cancelled=true`且不创建错误Envelope。
3. Rust将本地选择转换为路径，确认其存在、为文件且扩展名为`.prj`，随后执行规范化。无效选择不会进入Python。
4. Rust发现允许的Python解释器，以参数数组执行`python -I -m contam_studio_core.zone_bridge`；不使用Shell、`cmd /c`或PowerShell拼接。
5. Rust设置仓库根目录为开发期工作目录，写入JSON后关闭stdin，并并行、有限读取stdout和stderr。
6. 进程结束后Rust验证UTF-8、JSON、协议和`request_id`。任意非空stderr均使请求失败，stderr内容不进入响应或普通日志。
7. 成功结果的`source_path`必须规范化后与Rust实际选择的路径一致；Rust只返回已验证的规范化路径。
8. Python诊断先进入仅可反序列化的Raw类型，由Rust清理后才转换为可序列化到WebView的类型。
9. 打开成功后Rust建立仅存于应用内存的`project_session_id`并清除旧Patch；计划成功后保存完整Patch和`patch_id`。
10. 用户确认“另存为新副本”后，Rust原生保存对话框取得新路径；取消不启动Python且保留审阅。
11. 应用成功后Rust验证应用结果和重读文档，替换活动项目并清除Patch；React切换到新副本。React只接受当前`request_id`对应的结果。

读取和计划超时为10秒，应用超时为15秒；stdout上限2 MiB，stderr上限16 KiB。超时后Rust终止Python进程；超过上限的内容继续被排空但不保存在内存中。stderr必须为空且不会返回前端，Python正常用户输入错误通过stdout Envelope表达。

## Python发现

开发期顺序固定为：

1. `CONTAM_STUDIO_PYTHON`指定的绝对、存在的文件路径；
2. 仓库内`python/.venv/Scripts/python.exe`；
3. 返回`python_runtime_not_found`。

显式配置无效时失败关闭，不回退到项目虚拟环境或PATH。默认不尝试系统Python、`F:/python/python.exe`、Codex通用环境或Microsoft Store别名。安装包内Python冻结和定位尚未实现。

## 错误分类

- **文件与格式**：`source_not_found`、`non_ascii_prj`、`unsupported_prj_version`、Zone区块/数量/终止符/字段/条件尾部错误、`source_changed_during_read`。
- **运行时与进程**：`python_runtime_not_found`、`python_process_start_failed`、`python_process_timeout`、`python_process_failed`。
- **输出边界**：stdout/stderr过大或非UTF-8、响应不是JSON。
- **协议契约**：协议或`request_id`不匹配、Envelope或结果结构无效。
- **桥接请求**：请求过大、非UTF-8、非JSON、缺失字段或未知操作。
- **会话与Patch**：项目session或Patch缺失/不匹配、协议结果无效、前置条件或后置验证失败。
- **桌面入口**：文件/保存对话框失败、输出路径无效或已存在、操作繁忙、Tauri invoke失败和未知内部错误。

Rust只接受不超过80字符的`[a-z0-9_]`诊断code；Python原始message被固定安全消息替换。context只保留已批准的数字或最长120字符的短字符串，Phase 3B仅补充实际需要的`zone_number`、`old_token`和`new_token`，仍拒绝路径、命令、环境、对象和文件内容。成功diagnostics与失败error执行相同清理。TypeScript继续重复白名单和截断，作为第二道防线。

## 文件与权限边界

- `build.rs`通过`AppManifest`只登记打开、计划和应用三个命令；main窗口capability仅包含`core:default`及这三个命令的显式权限。
- 前端没有dialog、文件系统、Shell、HTTP或远程URL权限，也没有`@tauri-apps/plugin-dialog`依赖。
- Rust侧文件选择器只显示`.prj`筛选，不扫描磁盘；取消不是错误。筛选之后仍验证文件、扩展名和规范化路径。
- Rust只把内部持有的规范化选择路径作为结构化字段传入Python，不把路径拼接成命令。
- 前端计划命令只提交session、Zone编号和新记号；应用命令只提交session和`patch_id`。源路径来自Rust活动项目，输出路径来自Rust原生保存对话框，完整Patch只来自Rust内存。
- 输出必须是不存在的新`.prj`，不得等于源路径；取消、已存在或无效路径均不会覆盖文件。
- Python返回路径必须规范化后与选择路径一致；错配时整体返回`python_response_source_mismatch`，错误上下文不包含路径。
- 严格读取器只读取源文件，读取前后比较SHA-256和大小，不创建临时文件或结果文件。
- 完整源路径只在项目摘要中由用户展开查看；错误面板不显示内部命令、项目内容或Traceback。
- 新项目失败时保留上一个成功项目并显示问题；首次失败保持欢迎页，不显示部分项目树。

## 当前不支持与待验证

- Python运行时冻结、安装包集成、签名、升级和卸载。
- 进程主动取消、进程树清理及大量并发请求；当前UI在选择和读取期间禁用重复打开，状态层仍拒绝旧响应。
- 完整PRJ、Zone条件尾部、其他区块、源文件保存和完整回写；当前未知区块仅通过单记号替换时保留原始字节。
- 稳定UUID、跨重启session、多个Patch、撤销/重做和其他字段编辑。
- ContamX、contamxpy、仿真工作区、结果文件和运行追踪。
- HTTP服务、常驻sidecar、远程调用、云服务和AI。
