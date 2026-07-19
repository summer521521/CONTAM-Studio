# 架构概览

## 决策状态

Tauri 2、React+TypeScript、Python和官方ContamX构成已批准的首选方向。Phase 2C已验证一次性Python进程可完成严格Zone读取；Phase 3B在同一显式协议中加入Zone体积Patch。Phase 3C由Rust管理不可变草稿Revision、确定性Zone UUID和Undo/Redo，Python仍只承担严格读取与单字段副本应用。Python冻结、安装包路径及长期进程形式仍未定型。

## 概念架构

```text
React GUI
↓
Tauri桌面宿主
↓
受控通信接口
↓
Python CONTAM领域核心
↓
官方ContamX
```

Phase 2C当前实际读取路径为：

```text
React打开操作
↓ Tauri官方原生文件对话框
Rust受控命令
↓ 一次性Python进程，stdin/stdout JSON
严格Zone纯文档读取器
```

该路径不调用contamxpy或ContamX。React只接收结构化结果，不直接读取文件或启动进程；详细边界见[Tauri-Python Zone桥](tauri-python-zone-bridge.md)。

Phase 3A-0建立的修改路径在Phase 3C形成可逆草稿闭环：

```text
严格Zone读取结果+源文件字节
↓ 哈希、大小、行号、旧记号和字节范围绑定
结构化volume_m3 Patch+单行Diff
↓ Rust内存保管完整Patch，React只审阅安全视图
用户确认“应用到草稿”+Rust生成内部新Revision
↓ 应用时重新验证
不可变内部PRJ快照
↓ 字节公式与严格读取器后置验证
已验证Revision→Undo/Redo指针或安全另存副本
```

前端不能提交源路径、内部快照路径、输出路径、完整Patch或CONTAM编号。Rust以稳定`zone_id`解析当前Revision中的外部编号；该路径不重建整份PRJ，只替换目标Zone的一个Vol ASCII记号。详细边界见[Zone体积副本Patch](zone-volume-patch.md)和[不可变草稿Revision](draft-project-revisions.md)。

Phase 4A的独立运行路径与项目打开、Patch应用分离：

```text
明确配置的NIST ContamX可执行文件 + PRJ
↓ 运行前哈希与大小校验
新的run_id/workspace输入快照
↓ 参数数组、shell=False、固定cwd、一次性进程
ContamX生成物与stdout/stderr证据
↓ 哈希、退出码、超时和源目录清单
不可覆盖的evidence/manifest.json
```

该路径只接受CLI绝对路径或`CONTAM_STUDIO_CONTAMX`，不回退PATH，不把求解器放入仓库。`contamxpy`的`inspect_prj`仍是隔离稳态初始化检查和交叉验证入口，不是正式运行管理器；Phase 4A也不解析SIM结果值。详细边界见[ContamX运行工作区](contamx-run-workspace.md)。

Phase 4B-1将同一运行核心接入受控桌面命令：React只提交request和项目session，Rust提供活动项目身份及应用本地运行根，验证成功manifest后只返回安全摘要，并在内存保留最新成功运行上下文。详细边界见[Phase 4B-1受控桌面运行](phase-4b-desktop-contamx-run.md)。

### 分层职责

| 层 | 主要职责 | 不承担的职责 |
|---|---|---|
| React GUI | 双语交互、领域对象呈现、Diff与审批界面 | 直接编辑原始PRJ、直接调用求解器 |
| Tauri桌面宿主 | 窗口、文件选择、能力控制、进程生命周期和桌面打包 | CONTAM领域规则和数值求解 |
| 受控通信接口 | 暴露有限、结构化、可验证的领域操作 | 任意Shell或任意文件写入 |
| Python领域核心 | 领域模型、文件处理、验证、快照、运行清单和结果边界 | 重写CONTAM数值算法 |
| 官方ContamX | 数值求解 | Studio交互、AI审批和项目版本管理 |

## GUI与AI共用接口

```text
GUI操作
┐
├→统一语义化工具接口→领域模型→ContamX
┘
AI操作
```

GUI和AI不能各自建立文件写入路径。所有变更必须转换为领域级操作并经过相同的结构检查、引用检查、Patch/Diff、快照和运行追踪机制。AI默认只读或建议，不能绕过用户确认。

## 文件与运行边界

- 原始PRJ默认不覆盖；编辑发生在草稿、内存模型或明确副本中。
- 未知或暂不支持的内容不得静默丢失；不能可靠保存时保持只读。
- 内部对象使用稳定UUID，CONTAM原始编号只作为外部格式编号或显示信息。
- 保存前进行结构检查，复杂引用和编号重排必须由确定性逻辑处理。
- 每次运行绑定不可变项目快照，并记录求解器、输入和输出之间的关系。
- 测试只处理夹具或副本，不修改用户唯一版本的工程文件。

## 平台与部署边界

- Windows 10/11 64位为首要平台。
- 默认离线运行，核心功能不得依赖AI或网络。
- 联网AI由用户主动配置和启用，桌面能力遵循最小权限。
- 当前不引入复杂微服务、插件系统或多求解器抽象。

## 待技术Spike验证

- 一次性Python桥的主动取消、安装包定位、运行时冻结、升级和签名方式。
- 后续阶段是否需要长期受控sidecar；当前不建立HTTP、WebSocket或常驻服务。
- ContamX及其他必要组件的发现、捆绑和升级方式。
- PRJ分段、未知内容保留、无损回写、编号重排与复杂引用处理策略。
- 结果文件首选读取路径和跨版本兼容性。
- ContamX进程树治理、求解器安装包分发和签名升级策略。
- Windows安装、签名、依赖兼容和许可声明方案。
Phase 5A在独立运行证据之后增加官方SimRead后处理边界：

```text
Phase 4成功manifest + PRJ/SIM快照
↓
独立提取workspace
↓ 参数数组、shell=False、固定stdin
NIST simread.exe
↓
严格解析.nfr
↓
zone_air_state
```

该路径不修改Phase 4运行目录，也不接受任意SIM作为可信入口。详见[SimRead结果提取架构](simread-result-extraction.md)。

### 当前Zone结果分析与CSV

```text
严格ZoneAirStateResult
↓ Rust契约验证并保存ActiveResultContext
├─ WebView安全视图 → 纯TypeScript统计 → ECharts/语义化表格
└─ Rust原生另存为 → 确定性CSV → 不存在的新文件
```

Phase 5C只分析已验证的当前Zone `zone_air_state`。图表不插值、不平滑、不采样，统计不改变样本或单位；React不能提交路径、样本或CSV。CSV由Rust内存活动结果生成并以不可覆盖的原子写入提交。详见[Phase 5C分析架构](phase-5c-zone-analysis-workspace.md)和[CSV契约](zone-air-state-csv-export.md)。
