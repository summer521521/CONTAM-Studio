# Phase 2B-0：PRJ Zone格式证据调查

## 结论

结论状态：`ready_for_minimal_reader`。

NIST CONTAM 3.4用户指南Appendix A明确给出了Zone区块的位置、数量、字段顺序、条件尾部和`-999`终止规则。4个核心官方样例的简单Zone记录与文档中的基础字段一致；扩展扫描的28个官方PRJ、146条Zone记录均采用19个空格分隔字段。证据足以在下一任务开始一个**严格限定于CONTAM 3.4简单Zone记录、只读且遇到未知格式即拒绝**的最小读取器，但不足以声明完整PRJ解析、跨版本兼容或无损回写。

本任务未实现解析器，也未修改任何官方样例。

## 官方资料

- [NIST CONTAM下载页](https://www.nist.gov/el/beed/nist-multizone-modeling/software/contam/download-contam)：确认CONTAM 3.4正式发布资料与历史版本入口。
- [NIST Technical Note 1887 Rev. 1：CONTAM 3.4 User Guide](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1887r1.pdf)：Appendix A第293至294页说明PRJ为ASCII输入文件、分区结构、注释规则和区块终止方式，第319至320页给出Zone记录格式。
- [NIST CONTAM视频教程页](https://www.nist.gov/el/beed/nist-multizone-modeling/contam-video-tutorials)：提供官方`IntroToCONTAM-part1-6.zip`教程样例。
- contamxpy 0.0.9源码分发包：包内`demo_files`作为官方发布随附样例；源码包SHA-256为`c4e337ef4665391f90bdd32321360d7b8967273e648b3379c344ee22a4799250`。

所有下载、解压、扫描和临时执行内容均位于`F:\Codex_File\CONTAM-Studio\phase-2-prj-zone-format`。标准安装目录下未发现本机CONTAM示例，因此未把本机安装内容计入证据，也未运行安装器。

## 核心样例

| 来源 | 文件头版本 | 文件名 | SHA-256 | Zone数 | 首个Zone |
|---|---|---|---|---:|---|
| contamxpy 0.0.9源码包；仓库保留fixture | `ContamW 3.4.0.4 3` | `test_GetPrjInfo.prj` | `ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e` | 7 | 编号1，flags 3，楼层1，体积600，名称`One` |
| contamxpy 0.0.9源码包`demo_files` | `ContamW 3.4.0.4 0` | `valThreeZonesWthCtm-UseApi.prj` | `1cafb2f0fef511f19ef88358238a1c1175c593187691ff7545db982f5e6e75ed` | 3 | 编号1，flags 3，楼层1，体积300，名称`one` |
| contamxpy 0.0.9源码包`demo_files` | `ContamW 3.4.0.4 0` | `reg_solverContTrace-mz-MH-trans-3day.prj` | `5c72ae7b9b1cece91286dc68d83c48ddf37694c5c8ace5c0b6942e3ed2a78d0d` | 14 | 编号1，flags 19，楼层4，体积21.41，名称`Attic` |
| NIST官方教程包`IntroToCONTAM-part1-6.zip` | `ContamW 3.4.0.0 0` | `demo1c.prj` | `1e2623d8904c0d37f0eb207099782ad2c1895dba4032e0511b9c8a188748f406` | 7 | 编号1，flags 19，楼层3，体积90，名称`Attic` |

教程ZIP的SHA-256为`ee2f4eda11a164ab9affc53dd8c6819f73c4b043a582bb03673f67a1ebba34f7`。4个核心样例均保持原样，仅进行文本观察和哈希计算。

`test_GetPrjInfo.prj`已由Phase 2A与contamxpy交叉验证。此次还在隔离临时目录中验证了`valThreeZonesWthCtm-UseApi.prj`和`demo1c.prj`，当前ContamX API分别返回3个和7个Zone，首个Zone字段与文本观察一致，且源文件哈希不变。`reg_solverContTrace-mz-MH-trans-3day.prj`依赖随包气象文件，本任务只将其用于格式比较，未把缺少配套文件时的执行失败解释为格式证据。

## Zone区块格式

### 官方文档明确说明

- PRJ由固定顺序的区块组成；Zone为Appendix A固定列表中的第14区块。
- 区块以对象数量开始，随后是说明行和对应数量的数据记录，以独立的`-999`记录结束。
- `!`开始行内注释，之后内容被读取器忽略；ContamW保存时不保证保留用户注释。
- Zone数量字段为`_nzone`，之后恰有`_nzone`条Zone数据记录。
- 基础字段顺序为：`nr`、`flags`、`ps`、`pc`、`pk`、`pl`、`relHt`、`Vol`、`T0`、`P0`、`name`、`color`、`u_Ht`、`u_V`、`u_T`、`u_P`、`cdaxis`、`vf_type`、`cfd`。
- `vf_type`非零时增加可变流量节点名称；`cfd`非零时增加CFD名称；`cdaxis`大于零时增加`1D:`及一组一维单元参数，形成条件尾部或续行。
- `pl`是楼层引用，`Vol`是体积，`flags`是Zone标志，`nr`是Zone编号。
- Zone名称是符号名，界面规则为最长15个字符，并要求在同一楼层内唯一。

### 样例观察

- 4个核心样例均以`<数量> ! zones:`定位Zone区块，下一行为字段注释，随后是声明数量的数据行和独立`-999`。
- 扩展扫描覆盖contamxpy源码包19个PRJ和NIST教程包9个PRJ，共28个官方PRJ、146条Zone记录；所有已观察记录均为单行、空格分隔的19个字段。
- 已观察样例没有在Zone数据记录之间插入空行或纯注释行。
- 所有已观察Zone名称均为不含空格的ASCII单一记号；Zone名称中可见括号，但没有非ASCII名称，也没有可证明的空格转义样例。
- 所有核心样例使用CRLF行尾。行尾形式不应被解释为Zone语义。
- 3.4.0.0样例的字段注释以`u[4]`概括单位字段，部分3.4.0.4样例注释写作`uH uT uP uV`；这与Appendix A中单位字段的命名顺序并不完全一致。由于`!`后文本是注释，读取器不得依赖注释标签解释或改写数据尾部。
- 扫描范围内没有找到实际启用`vf_type`、`cfd`或`cdaxis`条件尾部的合格Zone记录，因而未验证这些记录的真实换行和序列化表现。

## 差异与未知事项

| 主题 | 当前证据 | 处理要求 |
|---|---|---|
| 文件头版本 | 核心样例覆盖3.4.0.0和3.4.0.4 | 首期只接受明确列入兼容规则的3.4文件头，不外推到旧版或未来版本 |
| Zone数量与终止 | 文档明确；全部样例一致 | 数量、实际记录数和`-999`必须同时匹配，否则拒绝 |
| 基础字段 | 文档明确；146条观察记录一致 | 下一任务可读取基础字段，但必须验证类型和范围 |
| 条件字段与续行 | 文档描述，样例未覆盖 | 首期遇到非零`vf_type`、`cfd`或`cdaxis`时明确拒绝 |
| 名称中的空格 | 文档未说明文本转义；样例未出现 | 不猜测分词规则，首期只接受已验证的单一ASCII记号 |
| 非ASCII和编码 | 指南称PRJ为ASCII；样例未出现非ASCII | 不声明中文名称支持，遇到非ASCII字节明确诊断 |
| 特殊字符 | 观察到括号等无空格字符，但无正式字符集定义 | 只保留原始记号，不执行转义或规范化 |
| 空行与区块内注释 | 注释语义有文档依据；样例未覆盖空行/纯注释插入 | 首期不做宽松容错，未验证布局即拒绝 |
| 区块定位 | 文档给出固定顺序；样例有`! zones:`标记 | 注释不是语义格式；最小读取器可把已观察标记作为窄范围门槛，但不能声称通用定位 |
| 未知区块 | 不属于本次Zone格式证据 | 保持未知状态；不得因取得Zone就声明完整PRJ已解析 |

## 事实、推断与建议

### 事实

- NIST CONTAM 3.4用户指南明确描述了PRJ区块、注释、终止记录和Zone字段。
- 4个核心官方样例覆盖两个3.4文件头版本；扩展官方样例扫描共28个PRJ、146条简单Zone记录。
- 3个核心样例已通过当前contamxpy/ContamX API取得相同Zone数量和首个Zone字段；该交叉验证执行了稳态初始化，不是格式定义，也不是无副作用加载。
- 未观察到复杂条件尾部、含空格名称、非ASCII名称或区块内空行。

### 推断

- 文档和样例足以定义一个非常窄的CONTAM 3.4简单Zone读取配置，但不足以证明完整Zone语法在真实文件中的全部表现。
- 记录注释之间的单位字段标签差异进一步说明，读取逻辑应基于文档字段和明确数据约束，而不是注释文本。

### 建议

- 下一任务可实现只读取Zone数量和首个Zone的最小读取器，并将支持范围锁定为经验证的3.4文件头、19字段单行记录和ASCII单记号名称。
- 对条件尾部、未知布局、数量不一致、缺少终止标记、非ASCII或未支持版本一律返回结构化错误，不做猜测或部分成功。
- 使用同一官方样例与contamxpy结果交叉验证，但保持“文档读取”和“隔离仿真验证”两条独立路径。
- 在取得复杂官方样例和更明确的编码规则前，不增加保存、回写、编号重排或未知区块重建。

## 本任务边界

- 未实现实验解析器、正式解析器、保存或回写。
- 未接入React、Tauri或现有CLI。
- 未修改Tauri权限、官方fixture或Phase 2A执行代码。
- `ready_for_minimal_reader`只表示下一任务可以实现并验证上述严格子集，不表示PRJ格式已完整解决。
