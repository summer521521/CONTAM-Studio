# Phase 5A验证记录

## 环境与来源

- 平台：Windows x64；Python 3.12项目虚拟环境。
- 官方工具：NIST `contam-x-3.4.0.3-win64.zip`，ZIP SHA-256为`3F11B44513F1046D378226B3D63644493B78F0E8241DC70F83E319A458A14052`。
- 官方资料：[NIST CONTAM下载页](https://www.nist.gov/el/beed/nist-multizone-modeling/software/contam/download-contam)和[CONTAM 3.4用户指南](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1887r1.pdf)。
- `simread.exe`版本3.4.0.3，大小34816字节，SHA-256为`85AF9B559DEBB6ECF9BA2F73705CEF60F14D32C5F8ED9B524823FA3AC85A6958`，PE架构Windows x64。
- 无参数调用稳定返回官方用法说明；固定stdin可以非交互生成`.nfr`和`.xrf`。

## 真实运行

使用Phase 4A成功清单`20260718T041511Z-426b4cfa`和Zone 1 `One`。Phase 4清单绑定的PRJ哈希为`ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e`，SIM哈希为`e8ccad872512dca288a9f06c95f0a9cb8d7175f2853e2b14ce16f63fa390cf39`。提取在`F:\Codex_File\CONTAM-Studio\phase-5a-zone-air-state-results\extractions`之外的独立目录完成，未写入Phase 4运行目录。

真实`.nfr`表头为`Date\tTime\tNode\tT (C)\tP (Pa)\tD (kg/m3)`，Zone 1得到577个样本。首行原始值为`1/1 00:00:00 1 20.000 -1.4222e+00 1.2041`，结构化结果为：day_of_year=1、day_type=`null`、sim_time_seconds=0、temperature_k=293.15、reference_pressure_pa=-1.4222、air_density_kg_m3=1.2041。温度转换和日期/时间转换均为确定性规则；`sim_time_seconds`表示从首个样本起算的累计秒数，结果模型不推断CONTAM日类型。

重复提取使用新的extraction_id，不覆盖旧清单；不存在的Zone会生成失败清单且不返回部分结果。源PRJ、Phase 4运行目录和SIM哈希在提取前后保持不变。失败工作区保留供审计。

本机真实提取记录包括`20260718T045328Z-70401b70`和`20260718T045941Z-998b0d47`；Zone 99失败案例返回结构化`zone_result_not_found`，未改变Phase 4证据。

## 检查边界

已覆盖严格文本解析、有限数值、Zone编号、时间顺序、空结果和非ASCII拒绝；默认测试不依赖外部simread。当前没有GUI、结果图表、CSV导出、污染物或路径流量读取，也没有直接SIM二进制解析器。
## 加固回归记录

- 真实官方回归仍为Zone 1 `One`、577个样本；首样本`day_type=null`、`sim_time_seconds=0`、293.15 K、-1.4222 Pa、1.2041 kg/m³。
- `simread.exe`和Phase 4 `contamx3.exe`均使用完整名称、版本、PE架构、大小和SHA-256绑定；manifest哈希在提取前后保持一致。
- 真实失败A：Zone 99在SimRead启动前返回`zone_result_not_found`，失败manifest记录`process_started=false`，没有NFR/XRF。
- 受控失败B：让严格解析器拒绝真实SimRead生成的NFR；失败manifest记录`process_started=true`、退出码、stdout/stderr和NFR/XRF哈希，Phase 4证据未改变。
- 自动测试共255项通过；新增直接编排`extract_zone_air_state()`的Phase 4快照字段、源/快照交叉绑定、结果工作区路径、Zone预验证、SimRead替换检测、工作区输入TOCTOU、解析失败证据、stdin失败、wait异常后的terminate/kill收口、终止确认、真实阻塞流关闭与二次join、证据冻结、最终证据和结果清单Schema测试。
- 最新真实成功提取目录为`20260718T055139Z-b89db45f`；最新受控的SimRead运行后解析失败目录为`20260718T054836Z-e10e83de`，后者保留了命令、stdout/stderr证据以及`.nfr`/`.xrf`生成物哈希。

## 证据链收尾

- Phase 4主PRJ的`source_path`、`source_sha256`、`source_size_bytes`与快照的同名源字段、`snapshot_sha256`、`snapshot_size_bytes`以及运行目录实际PRJ逐项相等；成功Phase 4清单的`diagnostics`必须为空。
- 提取工作区在复制后、Zone读取和SimRead探测后、正式启动前、进程结束后及写result-manifest前复核PRJ/SIM；SimRead在探测、正式启动前和写清单前复核同一文件身份。result-manifest的`run_manifest`现在是包含`path`、`sha256`和`unchanged`的结构化对象，`source_run.solver`完整记录ContamX身份。
- 失败清单通过同一模型路径生成，保留真实`process`状态（stdin、退出码、超时、terminate/kill请求、退出确认、管道关闭、流捕获与冻结）及实际stdout/stderr元数据。工作区创建前的配置、路径和Phase 4清单拒绝不生成伪造清单；工作区创建后的失败保留审计目录，并在写入前记录各类最终证据状态。未确认退出的NFR/XRF不写最终哈希和大小，而是标记为非稳定快照。
- 最新真实成功回归提取目录为`20260718T070716Z-c7f0bbb5`，仍返回577个样本，首样本为day_type=`null`、sim_time_seconds=0、293.15 K、-1.4222 Pa、1.2041 kg/m³；Zone 99回归目录`final-zone99`在SimRead启动前生成失败清单，`process_started=false`且无生成物。
