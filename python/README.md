# CONTAM Studio Python核心

本目录是Phase 2A的最小只读技术Spike，不是Python sidecar服务，也未与React或Tauri连接。

## 环境

- Python要求：3.12或更高版本。
- 运行依赖：`contamxpy==0.0.9`。
- 开发依赖：pytest、Ruff。

从仓库根目录创建环境并安装：

```powershell
py -3.12 -m venv python\.venv
python\.venv\Scripts\python.exe -m pip install -e ".\python[dev]"
```

## 只读检查

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.inspect_prj `
  fixtures\contam\official-contamxpy\test_GetPrjInfo.prj --json
```

检查器先计算源文件哈希，再将PRJ复制到临时目录，并在一次性子进程中调用contamxpy公开API。这样可隔离contamxpy产生的结果文件和损坏输入导致的原生进程崩溃；它不是长期运行的服务或桌面sidecar。

## 已知边界

- contamxpy 0.0.9没有公开的“仅加载”入口；Zone列表由`setupSimulation(1)`触发的回调填充。
- 官方文档说明该调用会执行稳态初始化，并且实测会产生SIM、LOG等文件，因此所有调用必须在临时副本上完成。
- 本Spike没有PRJ解析、保存、回写、ContamX时间步运行或GUI接入。
