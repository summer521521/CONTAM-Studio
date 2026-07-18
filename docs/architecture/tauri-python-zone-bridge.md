# Tauri-Python Zone读取桥

## 目的与范围

Phase 2C用最小纵向切片验证桌面端能够打开受支持的真实PRJ并展示全部Zone。当前链路只调用`strict_contam_3_4_simple_zone_v1`纯文档读取器，不调用contamxpy、ContamX或仿真初始化，不支持保存、回写、编辑、结果读取或AI。

```text
React GUI
↓ Tauri invoke
Rust桌面宿主
↓ 一次性Python进程，stdin/stdout JSON
contam_studio_core.zone_bridge
↓
read_simple_zones
```

## 为什么使用一次性进程

- 当前只有一个短时读取操作，不需要常驻状态。
- 每个请求结束后Python进程退出，故障和模块状态不会留在桌面主进程。
- 不开放端口，不需要HTTP服务发现、认证、重连或后台进程管理。
- 该选择只验证Phase 2边界；未来是否改为长期受控sidecar必须由性能、打包和多操作证据决定。

一次性进程不是权限沙箱。它不能防御恶意PRJ，也不能替代输入格式限制、源文件哈希验证和最小Tauri权限。

## JSON协议

协议版本固定为`1.0`。Python从stdin读取一条不超过64 KiB的UTF-8 JSON请求，stdout只输出一条完整JSON响应并换行。

```json
{
  "protocol_version":"1.0",
  "request_id":"UUID",
  "operation":"read_simple_zones",
  "source_path":"F:\\path\\model.prj"
}
```

成功和失败使用同一Envelope：

```json
{
  "protocol_version":"1.0",
  "request_id":"UUID",
  "ok":true,
  "result":{
    "schema_version":"1.0",
    "reader_mode":"strict_contam_3_4_simple_zone_v1",
    "source_path":"F:\\path\\model.prj",
    "source_sha256":"...",
    "source_size_bytes":1234,
    "source_unchanged":true,
    "header_version":"3.4.0.4",
    "header_variant":3,
    "declared_zone_count":3,
    "zones":[],
    "first_zone":null,
    "diagnostics":[]
  },
  "error":null
}
```

失败时`ok=false`、`result=null`，`error`包含稳定`code`、短消息、可空源行号和受限上下文。桥不会返回部分Zone。Rust再次校验协议版本、`request_id`、Envelope互斥关系、schema、reader mode、Zone数量、首个Zone、SHA-256和`source_unchanged`。

## 进程生命周期

1. React生成`request_id`，调用唯一的`select_and_read_prj_zones`命令，不提供文件路径。
2. Rust通过官方原生对话框选择单个`.prj`；取消直接返回`cancelled=true`且不创建错误Envelope。
3. Rust将本地选择转换为路径，确认其存在、为文件且扩展名为`.prj`，随后执行规范化。无效选择不会进入Python。
4. Rust发现允许的Python解释器，以参数数组执行`python -I -m contam_studio_core.zone_bridge`；不使用Shell、`cmd /c`或PowerShell拼接。
5. Rust设置仓库根目录为开发期工作目录，写入JSON后关闭stdin，并并行、有限读取stdout和stderr。
6. 进程结束后Rust验证UTF-8、JSON、协议和`request_id`。任意非空stderr均使请求失败，stderr内容不进入响应或普通日志。
7. 成功结果的`source_path`必须规范化后与Rust实际选择的路径一致；Rust只返回已验证的规范化路径。
8. Python诊断先进入仅可反序列化的Raw类型，由Rust清理后才转换为可序列化到WebView的类型。
9. React只接受当前请求序号和`request_id`对应的结果。旧结果不能覆盖新项目状态。

当前超时为10秒，stdout上限2 MiB，stderr上限16 KiB。超时后Rust终止Python进程；超过上限的内容继续被排空但不保存在内存中。stderr必须为空且不会返回前端，Python正常用户输入错误通过stdout Envelope表达。

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
- **桌面入口**：文件对话框失败、Tauri invoke失败和未知内部错误。

Rust只接受不超过80字符的`[a-z0-9_]`诊断code；Python原始message被固定安全消息替换。context只保留`byte_offset`、`candidate_count`、`contam_number`、`declared_count`、`expected`、`exit_code`、`field`、`field_count`、`header_variant`、`header_version`、`max_bytes`、`name_length`、`parsed_count`和`token`，且仅允许数字或最长120字符的字符串。成功结果中的diagnostics与失败error执行相同清理。TypeScript继续重复白名单和截断，作为第二道防线。Python消息、Traceback、Rust panic、内部命令和文件内容不向用户展示。

## 文件与权限边界

- `build.rs`通过`AppManifest`只登记`select_and_read_prj_zones`，main窗口capability仅包含`core:default`和`allow-select-and-read-prj-zones`。
- 前端没有dialog、文件系统、Shell、HTTP或远程URL权限，也没有`@tauri-apps/plugin-dialog`依赖。
- Rust侧文件选择器只显示`.prj`筛选，不扫描磁盘；取消不是错误。筛选之后仍验证文件、扩展名和规范化路径。
- Rust只把内部持有的规范化选择路径作为结构化字段传入Python，不把路径拼接成命令。
- Python返回路径必须规范化后与选择路径一致；错配时整体返回`python_response_source_mismatch`，错误上下文不包含路径。
- 严格读取器只读取源文件，读取前后比较SHA-256和大小，不创建临时文件或结果文件。
- 完整源路径只在项目摘要中由用户展开查看；错误面板不显示内部命令、项目内容或Traceback。
- 新项目失败时保留上一个成功项目并显示问题；首次失败保持欢迎页，不显示部分项目树。

## 当前不支持与待验证

- Python运行时冻结、安装包集成、签名、升级和卸载。
- 进程主动取消、进程树清理及大量并发请求；当前UI在选择和读取期间禁用重复打开，状态层仍拒绝旧响应。
- 完整PRJ、Zone条件尾部、其他区块、未知内容保留、保存和回写。
- ContamX、contamxpy、仿真工作区、结果文件和运行追踪。
- HTTP服务、常驻sidecar、远程调用、云服务和AI。
