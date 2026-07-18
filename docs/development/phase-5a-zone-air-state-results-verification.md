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
- 自动测试共230项通过；覆盖manifest类型与哈希、路径隔离、Zone预验证、严格NFR边界、day_type语义、进程证据和可信CLI入口。
- 最新真实成功提取目录为`20260718T055139Z-b89db45f`；最新受控的SimRead运行后解析失败目录为`20260718T054836Z-e10e83de`，后者保留了命令、stdout/stderr证据以及`.nfr`/`.xrf`生成物哈希。
