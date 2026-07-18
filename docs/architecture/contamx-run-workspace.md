# ContamX运行工作区

## 范围

Phase 4A建立独立的Python运行核心，用NIST官方ContamX在隔离工作区执行一个明确的PRJ快照。它不接入React或Tauri，不读取SIM结果值，也不提供批量运行、运行队列或完整进程树治理。

## 求解器发现与验证

- 只接受CLI显式的绝对路径或环境变量`CONTAM_STUDIO_CONTAMX`，优先使用CLI；不回退PATH、注册表、磁盘扫描或自动下载。
- 当前只接受已验证的`contamx3.exe` 3.4.0.3：大小1605120字节、SHA-256为`3B9A5EE9A6A3EA3CDC569DF607F4EC2A1AD4E74E53FEF8FBEC0B7E540A5D3AAD`、PE machine为`0x8664`、Windows文件版本为`3.4.0.3`。任一静态证据不匹配时，不执行该文件。
- 静态身份全部匹配后，才以参数数组执行`[contamx3.exe, --Version]`；使用5秒超时和64 KiB流上限，并要求官方实际输出`3.4.0.3 64 bit`与静态证据一致。该版本把版本文本写入stderr，探测器只接受单一输出通道，不把原始输出写入错误。
- 当前验证来源为NIST CONTAM 3.4.0.8下载页提供的`contam-x-3.4.0.3-win64.zip`，ZIP SHA-256为`3F11B44513F1046D378226B3D63644493B78F0E8241DC70F83E319A458A14052`。只有全部证据通过后才记录NIST来源；未来版本必须显式加入验证表。

## 运行生命周期

每次运行创建新的`run_id`目录：

```text
<run-root>/<run-id>/
  workspace/        ContamX唯一工作目录
  evidence/         manifest.json、stdout.bin、stderr.bin
```

`run_root`必须位于源PRJ目录树之外；等于源目录、位于其子目录或经路径规范化、符号链接、junction解析后落入源目录树均在创建目录前拒绝。源目录初始清单也在创建运行目录前采集，稳定记录直接文件和直接子目录。

每个输入采用同一三方快照流程：复制前读取源哈希和大小，复制到workspace，读取副本证据，再次读取源证据；三者必须与最初绑定值完全一致。进程启动前再次复核全部源输入和副本；运行结束后再次确认主PRJ及显式配套文件未变化。重复输入、主PRJ重复作为配套输入或目标文件名冲突会在创建运行目录前拒绝。ContamX以参数数组`[contamx3.exe, <snapshot.prj>]`、`shell=False`和`cwd=workspace`启动；不会把输出写入源目录。

子进程环境不是父进程环境的副本。当前Windows白名单只保留存在的`SystemRoot`、`WINDIR`、`TEMP`、`TMP`，并用Windows系统目录构造受控`PATH`；求解器仍由绝对路径启动，不通过`PATH`发现。所有`CONTAM_STUDIO_*`、Python环境变量、虚拟环境变量及其他自定义父进程变量均不传入。

## 证据与成功判定

manifest使用`schema_version=1.0`和`execution_mode=isolated_contamx_process`，记录求解器、输入快照、命令数组、工作目录、退出码、耗时、超时、stdout/stderr证据及全部生成文件的相对路径、大小、SHA-256、后缀和分类。stdout/stderr各保留最多4 MiB，超出部分继续排空但标记截断。

成功不只依赖退出码0：当前还要求未超时、源PRJ、显式配套输入和源目录清单均未变化，stdout/stderr证据完整，并存在非空`.sim`主要结果文件。`.log`和`.xlog`记录为求解器日志，其他生成物逐项记录但本阶段不解析其内容。流证据创建、读取、写入或线程收尾失败会产生`run_stream_capture_failed`；超时后无法确认进程退出会产生`run_process_termination_failed`，均不得标记成功。运行目录创建后的快照、启动、捕获或后置验证失败会尽量保留失败manifest与工作区。

manifest先写同目录临时文件、flush并fsync，再使用独占硬链接落盘，拒绝覆盖已存在的运行证据。当前代码不使用Shell字符串、不调用`cmd /c`或PowerShell，也不把原始求解器输出写到CLI标准输出。

## 边界与后续

- 一次性进程隔离运行目录和原生崩溃，但当前不是权限沙箱，也未实现Windows Job Object进程树治理。
- `contamxpy.inspect_prj`继续是隔离稳态初始化检查和交叉验证入口，不属于正式ContamX运行管理器。
- 求解器安装包冻结、签名、分发、许可声明和升级策略尚未决定。
- Phase 5才解析SIM等结果文件；当前只确认主要结果存在并记录其哈希。
