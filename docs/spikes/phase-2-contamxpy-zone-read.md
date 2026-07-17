# Phase 2A：contamxpy只读Zone技术Spike

## 结论

contamxpy 0.0.9可在本机Python 3.12和Windows x64环境安装、导入，并通过官方公开API从官方真实PRJ取得Zone数量和首个Zone字段。源PRJ保持不变，但API没有纯“只加载”入口：`setupSimulation(1)`会执行稳态初始化、生成结果文件，损坏输入还可能导致原生访问冲突。因此，contamxpy不适合在GUI或主Python进程中直接作为无副作用读取器；本Spike只在临时副本和一次性隔离进程中调用它。

## 测试环境

| 项目 | 实际值 |
|---|---|
| 操作系统 | Windows 11 x64，版本10.0.26200 |
| Python | 3.12.10，64位AMD64 |
| 项目环境 | `python/.venv` |
| contamxpy | 0.0.9 |
| contamxpy wheel | `contamxpy-0.0.9-cp37-abi3-win_amd64.whl` |
| wheel SHA-256 | `6e4c9930acfe7bed11a0e5ef777afe049a4205953a717511bcde0695cc57b3e8` |
| ContamX API版本 | `3.4.1.7-64bit` |

未为本项目直接加入NumPy。contamxpy声明的CFFI和pycparser由pip作为传递依赖安装。

## 官方样例

- 包：`contamxpy-0.0.9.tar.gz`。
- 包SHA-256：`c4e337ef4665391f90bdd32321360d7b8967273e648b3379c344ee22a4799250`。
- 包内位置：`demo_files/test_GetPrjInfo.prj`。
- 仓库位置：`fixtures/contam/official-contamxpy/test_GetPrjInfo.prj`。
- 样例SHA-256：`ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e`。
- 大小：10978字节。
- 必要配套文件：无；本次公开API调用可单独加载该PRJ。
- 许可：保留源码包根目录的`LICENSE.txt`，来源与用途记录见fixture README。

## 公开API调用

只使用contamxpy文档和源码中公开的Python接口：

1. `contamxpy.cxLib(path, cb_option=True)`创建状态并注册项目数据回调。
2. `cxLib.getVersion()`取得ContamX API版本。
3. `cxLib.setupSimulation(1)`读取PRJ并触发项目数据回调。
4. `cxLib.nZones`和`cxLib.zones`取得Zone数量和公开`Zone`对象。
5. `cxLib.endSimulation()`结束本次状态。

未调用私有`_getZoneInfo`，未访问未公开内存结构，未调用`doSimStep`，也没有自行解析PRJ文本。

## Zone读取结果

| 字段 | 实际值 | 来源 |
|---|---:|---|
| Zone数量 | 7 | `cxLib.nZones` |
| 编号 | 1 | `Zone.nr` |
| 名称 | `One` | `Zone.name` |
| flags | 3 | `Zone.flags` |
| 体积 | 600.0 m³ | `Zone.volume` |
| 楼层编号 | 1 | `Zone.level_nr` |
| 楼层名称 | `<1>` | `Zone.level_name` |

该公开Zone对象没有提供稳定UUID、Zone高度、原始文本位置、未知区块、注释或无损回写信息。本Spike不推断这些字段。

## 文件安全证据

- 读取前SHA-256：`ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e`。
- 读取后SHA-256：`ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e`。
- fixture目录读取前后文件名和全部文件哈希一致。
- 直接在临时副本上调用时，contamxpy生成`.ach`、`.cex`、`.csm`、`.log`、`.rst`、`.sim`、`.xlog`和`_sarin.cex`文件。
- 正式检查器只把源PRJ复制到临时目录后再调用contamxpy，生成物在返回前列入诊断并随临时目录清理。

## 错误行为

对内容为`not a CONTAM project`的`.prj`执行直接原生调用时，contamxpy进程报告“Not a ContamW or LoopDA 3.4 file”，随后以Windows访问冲突`0xC0000005`退出，并产生`.xlog`。因此检查器使用一次性子进程包含原生崩溃；父进程将其转换为退出码4的明确加载错误。该子进程是单次安全边界，不是长期服务、微服务或桌面sidecar生命周期实现。

## 事实、推断与建议

### 事实

- Python 3.12.10可安装并导入contamxpy 0.0.9的`cp37-abi3-win_amd64` wheel。
- 官方样例可取得7个Zone和首个Zone的真实公开字段。
- 源PRJ哈希不变，但`setupSimulation(1)`会产生多个结果文件。
- 官方文档说明`setupSimulation(1)`会运行稳态初始化；公开API没有独立的只加载方法。
- 损坏输入可能使原生进程访问冲突，不能依赖Python异常保护主进程。

### 推断

- contamxpy适合作为受隔离的Zone数据来源候选，但不适合直接嵌入GUI进程或被描述为无副作用PRJ解析器。
- 临时副本可保护源文件，但不能消除稳态初始化的计算语义、性能成本和原生健壮性风险。

### 建议

- 暂不直接进入Phase 2B的GUI/Tauri连接；先明确Phase 2是否允许以`setupSimulation(1)`稳态初始化换取只读元数据，或向官方确认是否存在纯加载API。
- 若项目接受该限制，Phase 2B只能复用本Spike的临时副本、单次进程隔离、哈希验证和结构化错误，不得让Tauri获得任意Shell权限，也不得在用户PRJ目录直接调用contamxpy。
- 不开展PRJ文本自解析、保存或回写，未知内容继续保持未支持状态。

## 验证结果

- pytest：9项通过。
- Ruff：通过。
- CLI：成功输出UTF-8 JSON；测试覆盖不存在文件、非PRJ和损坏PRJ的受控错误。
- 前端与Rust：在本次提交前重新构建检查。
