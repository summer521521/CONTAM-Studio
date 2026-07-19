# Tauri-Python Zone读取桥

## 目的与范围

Phase 2C用最小纵向切片验证桌面端能够打开受支持的真实PRJ并展示全部Zone。Phase 3B加入Zone体积Patch，Phase 3C让Rust把同一Python副本应用结果登记为不可变草稿Revision；Phase 5B加入结果提取，Phase 4B加入活动项目ContamX运行。Phase 5C的CSV只使用Rust已验证的活动结果，不新增Python操作。桥不调用contamxpy。

```text
React GUI
↓ Tauri invoke
Rust桌面宿主
↓ 一次性Python进程，stdin/stdout JSON
contam_studio_core.zone_bridge
↓
read_simple_zones / plan_zone_volume_patch / apply_zone_volume_patch_to_copy / extract_zone_air_state / run_active_project
```

## 为什么使用一次性进程

- 当前操作均为短时读取或单字段副本写入，不需要常驻Python状态。
- 每个请求结束后Python进程退出，故障和模块状态不会留在桌面主进程。
- 不开放端口，不需要HTTP服务发现、认证、重连或后台进程管理。
- 该选择只验证Phase 2边界；未来是否改为长期受控sidecar必须由性能、打包和多操作证据决定。

一次性进程不是权限沙箱。它不能防御恶意PRJ，也不能替代输入格式限制、源文件哈希验证和最小Tauri权限。

## JSON协议

协议版本为`1.2`。相对`1.1`新增显式白名单操作`extract_zone_air_state`及其结果类型，原有读取和Patch字段语义不变。Python从stdin读取一条不超过128 KiB的UTF-8 JSON请求，stdout只输出一条完整JSON响应并换行。

```json
{
  "protocol_version":"1.2",
  "request_id":"UUID",
  "operation":"read_simple_zones",
  "source_path":"F:\\path\\model.prj"
}
```

成功和失败使用同一Envelope：

```json
{
  "protocol_version":"1.2",
  "request_id":"UUID",
  "ok":true,
  "result":{"result_type":"read_zones","project":{"schema_version":"1.0"}},
  "error":null
}
```

失败时`ok=false`、`result=null`，`error`包含稳定`code`、短消息、可空源行号和受限上下文。桥不会返回部分Zone、部分应用结果或部分结果样本。`result_type`显式允许读取、Patch、结果提取和`contamx_run`；Rust分别校验协议、`request_id`、Envelope及每种结果的完整契约。

计划请求由Rust把前端`zone_id`解析为当前Revision的Zone编号，再加入活动源路径和最长80字符的ASCII新记号；Python返回完整Patch和单行Diff。Rust验证后只把安全审阅视图发给WebView，完整Patch保存在内存。应用请求由Rust加入当前Revision路径、Rust生成的内部下一Revision路径及内存中的完整Patch；前端不能提供路径、CONTAM编号或Patch对象。

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
10. 用户确认“应用到草稿”后，Rust在应用本地数据目录生成不存在的内部下一Revision路径；此步骤不打开保存对话框。
11. 应用成功后Rust验证输出路径、哈希、严格重读、稳定Zone UUID和单字段变化，登记不可变Revision并移动活动指针。Undo/Redo只验证并切换指针；另存当前草稿由独立Rust原生保存命令完成，且不切换项目。
12. 结果命令由Rust原生选择Phase 4 JSON清单，并在应用本地数据目录创建受控结果根；Rust向Python传入活动项目路径、哈希和Zone编号，验证返回的样本契约后只向WebView发送不含路径的结果视图。
13. 最新运行结果命令不打开对话框，从Rust `ActiveRunContext`取得受控manifest；它额外验证项目session、源SHA-256、运行根和返回`run_id`，但复用第12步相同的Python操作与结果验证。
14. 两种结果入口成功后，Rust保存仅存在于内存且绑定`revision_id`的`ActiveResultContext`。CSV导出重新验证项目、Revision、Zone、运行和提取身份，原生选择目标并在Rust中编码；React不提交路径、样本或CSV，导出不启动Python。新Revision、Undo或Redo成功后旧运行和结果上下文失效。

读取和计划超时为10秒，应用超时为15秒，结果提取超时为45秒，桌面ContamX运行桥超时为75秒（大于Python求解器60秒上限）；stdout上限2 MiB，stderr上限16 KiB。超时后Rust终止Python进程；超过上限的内容继续被排空但不保存在内存中。stderr必须为空且不会返回前端，Python正常用户输入错误通过stdout Envelope表达。

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
- **会话、Patch与草稿**：项目session或Patch缺失/不匹配、协议结果无效、前置条件或后置验证失败、Revision缺失/变化、基线变化、UUID映射失败、历史边界及另存验证失败。
- **桌面入口**：文件/保存对话框失败、输出路径无效或已存在、操作繁忙、Tauri invoke失败和未知内部错误。

Rust只接受不超过80字符的`[a-z0-9_]`诊断code；Python原始message被固定安全消息替换。context只保留已批准的数字或最长120字符的短字符串，Phase 3B仅补充实际需要的`zone_number`、`old_token`和`new_token`，仍拒绝路径、命令、环境、对象和文件内容。成功diagnostics与失败error执行相同清理。TypeScript继续重复白名单和截断，作为第二道防线。

## 文件与权限边界

- `build.rs`通过`AppManifest`只登记打开、计划、应用到草稿、Undo、Redo、另存草稿、手动结果提取、活动运行结果提取、活动项目运行和活动结果CSV导出十个命令；main窗口capability仅包含`core:default`及这些命令的显式权限。
- 前端没有dialog、文件系统、Shell、HTTP或远程URL权限，也没有`@tauri-apps/plugin-dialog`依赖。
- Rust侧文件选择器只显示`.prj`筛选，不扫描磁盘；取消不是错误。筛选之后仍验证文件、扩展名和规范化路径。
- Rust只把内部持有的规范化选择路径作为结构化字段传入Python，不把路径拼接成命令。
- 前端计划命令只提交session、稳定`zone_id`和新记号；应用命令只提交session和`patch_id`。活动源和内部Revision路径来自Rust，完整Patch只来自Rust内存。
- 另存命令只提交session和当前`revision_id`，输出路径来自Rust原生保存对话框。目标必须是不存在的新`.prj`，不得等于原始源或内部快照；取消、已存在或无效路径均不会覆盖文件。
- Python返回路径必须规范化后与选择路径一致；错配时整体返回`python_response_source_mismatch`，错误上下文不包含路径。
- 严格读取器只读取源文件，读取前后比较SHA-256和大小，不创建临时文件或结果文件。
- WebView项目摘要只接收源文件名，不接收原始绝对路径、内部快照路径、草稿根、运行目录或manifest路径；错误面板不显示内部命令、项目内容或Traceback。
- 新项目失败时保留上一个成功项目并显示问题；首次失败保持欢迎页，不显示部分项目树。

## 当前不支持与待验证

- Python运行时冻结、安装包集成、签名、升级和卸载。
- 进程主动取消、进程树清理及大量并发请求；当前UI在选择和读取期间禁用重复打开，状态层仍拒绝旧响应。
- 完整PRJ、Zone条件尾部、其他区块、源文件保存和完整回写；当前未知区块仅通过单记号替换时保留原始字节。
- 跨重启草稿恢复、多个Patch、多字段事务、复杂分支历史和其他字段编辑。
- 运行结束后自动提取、任意SIM/NFR入口、其他结果类型、多Zone/多运行比较、Excel原生格式和自动导出。最新成功运行仍必须由用户明确点击后加载，CSV仍必须由用户明确选择新文件。
- HTTP服务、常驻sidecar、远程调用、云服务和AI。
