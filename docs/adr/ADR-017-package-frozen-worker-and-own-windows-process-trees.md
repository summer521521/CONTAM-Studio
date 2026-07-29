# ADR-017：打包冻结 Python Worker 并由 Windows Job Object 统一治理进程树

- 状态：已接受
- 日期：2026-07-28
- 范围：EXPERT-FIX-01 / CONTAM Studio 0.2.0

## 背景

0.1.0 的 Rust→Python 桥在运行时默认从编译期 `CARGO_MANIFEST_DIR` 推导仓库根目录，并查找 `python/.venv/Scripts/python.exe`。便携版和安装器只携带 Tauri 主程序，因此开发机测试通过不能证明普通用户机器能够运行 Python 领域桥。

Python Worker、Codex App Server、官方 ContamX 和 SimRead 还可能继续创建子进程。只终止直接 `Child` 无法保证取消、超时、断开或 Studio 退出后没有孙进程残留。

## 决策

### 冻结 Worker

- 使用 PyInstaller one-folder 模式生成 Windows x64 Worker；构建依赖在 `python/requirements-worker.lock` 中固定版本和 SHA-256，并安装到 `F:\Codex_File` 下的隔离虚拟环境。
- Worker 与 `_internal` 运行时作为 Tauri `runtime/python-worker` 资源进入 NSIS/MSI，并在便携版中保持相同的相对目录。
- Release 运行时只从主程序目录下的 `runtime/python-worker/contam-studio-python-worker.exe` 发现 Worker。`CONTAM_STUDIO_PYTHON` 只保留为用户显式指定的开发覆盖；仓库 `.venv` 回退只编译进 debug/test 构建。
- Release 构建必须验证 Worker 清单与候选提交一致，并在脱离仓库的目录中完成协议错误包络和真实测试 PRJ 只读两项冒烟；缺少 EXE、`_internal`、清单或任一证据时失败关闭。
- 便携包和安装器仍不捆绑官方 ContamX、SimRead、Codex CLI、API Key、账户或用户工程。

### 进程树所有权

- 所有应用拥有的外部命令先以 `CREATE_SUSPENDED | CREATE_NO_WINDOW` 创建，再分配到设置了 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 的私有 Job Object，最后恢复线程。
- Python Worker 的 ContamX/SimRead 后代、Codex App Server 后代、Codex 安装器和版本探测均继承同一受控树。
- 超时或取消调用 `TerminateJobObject`；直接父进程正常退出后关闭 Job 句柄以清理遗留后代；Studio 正常或异常退出导致句柄关闭时同样收口整棵树。
- 打开用户目录的 `explorer.exe` 不纳入 Job，因为它是用户接管的桌面进程，不属于 Studio 后台工作负载。

## 理由

- one-folder 便于审计 Python DLL、扩展模块、许可证和哈希，也避免 one-file 每次启动自解压带来的额外生命周期与临时目录问题。
- 固定相对资源路径同时适用于 Tauri 安装器和便携目录，不需要注册表、PATH、系统 Python 或编译机源码。
- “暂停→分配 Job→恢复”消除子进程在进入 Job 前抢先创建后代的竞态；kill-on-close 覆盖显式取消和应用退出两类终止路径。

## 后果

- Windows 包体增加约一个 Python 3.12 one-folder 运行时；发布审计必须扫描其文件名、文本、二进制中的开发机路径和凭据形态。
- PyInstaller 仅为构建工具；CONTAM Studio 源码仍为 Apache-2.0。PyInstaller 的 GPL-2.0-or-later bootloader exception、Python、contamxpy 及其传递组件继续适用各自许可证和 notice。
- Release Worker 是 Windows x64 专用资源；macOS/Linux 仍不在本版本支持范围。
- 安装包没有可信 Authenticode 证书时必须继续标记 `unsigned`，Job Object 和冻结运行时通过不能替代签名或独立干净机证据。

## 验证要求

- Rust 单元测试必须真实启动“父进程→孙进程”，分别证明显式 `kill()` 和仅关闭 Job 句柄都能终止孙进程。
- 运行时发现测试必须证明冻结 Worker 优先、显式开发解释器仍可用、Release 配置不存在隐式源码回退。
- 发布候选必须从标签指向的精确提交重建 Worker、Tauri 主程序、NSIS 和 MSI，并通过内容审计、哈希清单、隔离安装/卸载验证及回下载哈希复核。

## 参考

- [Tauri 资源打包](https://v2.tauri.app/develop/resources/)
- [PyInstaller 使用方式](https://pyinstaller.org/en/stable/usage.html)
- [PyInstaller 许可证与 Bootloader Exception](https://pyinstaller.org/en/stable/license.html)
- [Microsoft Windows Job Objects](https://learn.microsoft.com/windows/win32/procthread/job-objects)
