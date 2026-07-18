# ContamX运行工作区

## 范围

Phase 4A建立独立的Python运行核心，用NIST官方ContamX在隔离工作区执行一个明确的PRJ快照。它不接入React或Tauri，不读取SIM结果值，也不提供批量运行、运行队列或完整进程树治理。

## 求解器发现与验证

- 只接受CLI显式的绝对路径或环境变量`CONTAM_STUDIO_CONTAMX`，优先使用CLI；不回退PATH、注册表、磁盘扫描或自动下载。
- 文件名必须是已从官方Windows压缩包观察到的`contamx3.exe`。
- Windows端通过文件版本资源读取版本，并以PE头确认`0x8664` Windows x64架构；同时记录文件SHA-256和大小。
- 当前验证来源为NIST CONTAM 3.4.0.8下载页提供的`contam-x-3.4.0.3-win64.zip`，压缩包哈希和来源见Phase 4A验证记录。

## 运行生命周期

每次运行创建新的`run_id`目录：

```text
<run-root>/<run-id>/
  workspace/        ContamX唯一工作目录
  evidence/         manifest.json、stdout.bin、stderr.bin
```

运行前计算源PRJ哈希、大小和源目录文件清单，将PRJ（以及调用者明确列出的配套文件）复制到workspace，并验证复制快照完全一致。ContamX以参数数组`[contamx3.exe, <snapshot.prj>]`、`shell=False`和`cwd=workspace`启动；不会把输出写入源目录。

## 证据与成功判定

manifest使用`schema_version=1.0`和`execution_mode=isolated_contamx_process`，记录求解器、输入快照、命令数组、工作目录、退出码、耗时、超时、stdout/stderr证据及全部生成文件的相对路径、大小、SHA-256、后缀和分类。stdout/stderr各保留最多4 MiB，超出部分继续排空但标记截断。

成功不只依赖退出码0：当前还要求未超时、源PRJ和源目录未变化，并存在非空`.sim`主要结果文件。`.log`和`.xlog`记录为求解器日志，其他生成物逐项记录但本阶段不解析其内容。失败和超时同样保留manifest与运行工作区。

manifest先写同目录临时文件、flush并fsync，再使用独占硬链接落盘，拒绝覆盖已存在的运行证据。当前代码不使用Shell字符串、不调用`cmd /c`或PowerShell，也不把原始求解器输出写到CLI标准输出。

## 边界与后续

- 一次性进程隔离运行目录和原生崩溃，但当前不是权限沙箱，也未实现Windows Job Object进程树治理。
- `contamxpy.inspect_prj`继续是隔离稳态初始化检查和交叉验证入口，不属于正式ContamX运行管理器。
- 求解器安装包冻结、签名、分发、许可声明和升级策略尚未决定。
- Phase 5才解析SIM等结果文件；当前只确认主要结果存在并记录其哈希。
