# CONTAM Studio Python核心

本目录包含Phase 2B-1严格Zone纯文档读取器、Phase 2A隔离contamxpy检查入口和Phase 2C一次性JSON桥。Phase 2C桥由Tauri按请求启动后退出，不是HTTP服务或长期Python sidecar。

## 环境

- Python要求：3.12或更高版本。
- 运行依赖：`contamxpy==0.0.9`。
- 开发依赖：pytest、Ruff。

从仓库根目录创建环境并安装：

```powershell
py -3.12 -m venv python\.venv
python\.venv\Scripts\python.exe -m pip install -e ".\python[dev]"
```

## 严格Zone文档读取

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.prj_zone_reader `
  fixtures\contam\official-contamxpy\test_GetPrjInfo.prj --json
```

`prj_zone_reader`只使用Python标准库，并以`strict_contam_3_4_simple_zone_v1`读取经验证的CONTAM 3.4简单Zone子集。它不导入contamxpy，不启动子进程或仿真，不创建临时文件；任何不支持的记录都会使整个调用以结构化错误失败。精确兼容范围见[兼容范围](../docs/architecture/prj-zone-reader-support.md)。

## Phase 2C JSON桥

`contam_studio_core.zone_bridge`从stdin读取一条协议`1.0`请求，从stdout输出一条成功/失败共用的JSON Envelope。桌面宿主以`python -I -m contam_studio_core.zone_bridge`启动它；请求只允许`read_simple_zones`操作，并复用上面的严格读取器。

桥接器限制请求为64 KiB、`request_id`为可打印ASCII且不超过128字符、路径不超过32768字符。用户输入错误结构化返回，stdout不混入调试文本，stderr只保留给真正的运行诊断；未处理异常不会泄露Traceback。完整协议和Rust进程边界见[Tauri-Python Zone桥](../docs/architecture/tauri-python-zone-bridge.md)。

## 隔离Zone检查

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.inspect_prj `
  fixtures\contam\official-contamxpy\test_GetPrjInfo.prj --json
```

检查器先计算源文件哈希，再将PRJ复制到临时目录。临时副本哈希必须与源文件读取前哈希一致，否则禁止启动contamxpy工作进程。公开API调用结束后再次验证源文件哈希；结构化结果使用`source_unchanged`说明源PRJ未改变，使用`execution_mode=isolated_steady_initialization`明确执行语义，并通过`generated_artifacts`列出临时生成物。

一次性子进程用于隔离原生崩溃和生成物，它不是权限沙箱，不能防御恶意构造的PRJ。当前入口只处理用户信任但可能损坏、不完整或版本不兼容的项目；未来桌面接入不得把该子进程描述成安全执行环境。

## 已知边界

- contamxpy 0.0.9没有公开的“仅加载”入口；Zone列表由`setupSimulation(1)`稳态初始化触发的回调填充。
- 官方文档说明该调用会执行稳态初始化，并且实测会产生SIM、LOG等文件，因此所有调用必须在临时副本上完成。
- 严格读取器只识别Zone简单子集，不代表完整PRJ解析；Phase 2C桌面只接入该纯文档读取器，没有接入contamxpy检查入口，也没有保存、回写或ContamX时间步运行。
