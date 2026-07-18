# Phase 5C Zone空气状态分析与CSV验证

验证日期：2026-07-18。

## 自动验证

- Python：`python\.venv\Scripts\python.exe -m pytest`，266项通过；Ruff通过。
- 前端：`pnpm test`，9个文件、89项通过；`pnpm build`通过。
- Rust：默认`cargo test`为23项通过、1项真实结果测试按设计忽略；`cargo check`与`cargo fmt --check`通过。新增源PRJ流式SHA-256已用标准向量、官方fixture副本和变化拒绝验证；真实结果测试通过显式环境变量单独执行并使用生产CSV编码和原子写入路径。
- 通用：JSON解析、锁文件、Markdown相对链接和`git diff --check`通过。

## 构建影响

新增唯一运行时依赖`echarts 6.1.0`并使用模块化入口。基线前端产物为JS 368.69 kB（gzip 111.97 kB）、CSS 23.89 kB（gzip 5.15 kB）；本切片为JS 940.07 kB（gzip 303.55 kB）、CSS 26.11 kB（gzip 5.53 kB）。增量为JS 571.38 kB（gzip 191.58 kB）、CSS 2.22 kB（gzip 0.38 kB）。构建保留大于500 kB的Vite提示，未误导入React包装库、地图、3D、WebGL或第二个图表库。

## 官方非GUI闭环

临时证据仅保存在`F:\Codex_File\CONTAM-Studio\phase-5c-zone-analysis-workspace`，未提交到仓库。

- 官方ContamX 3.4.0.3运行ID：`20260718T161738Z-830520f3`，退出码0，耗时71 ms。
- 官方SIM：545892字节，SHA-256 `E8CCAD1594EFEB47850D5B2E86B8AEEFF9A909B3B480A5D9FCD9846D2690CF39`。
- 结果提取ID：`20260718T161837Z-b6d606a8`。
- Zone 1 `One`：577个样本；首样本0秒、293.15 K、-1.4222 Pa、1.2041 kg/m³；末样本172800秒。
- 生产TypeScript分析模块对真实JSON计算样本数、起止时间和三项统计；结果与独立重算一致。该稳态样例三项指标恒定，首次极值均落在首样本。
- 生产Rust CSV编码和原子写入路径对同一结果执行两次，两个CSV均为58550字节，SHA-256均为`468536B92F6E9E6B8E37452A55B11B3C684D04622702F35D13C1D17B494DC019`。
- Python标准库`csv`独立重读：13列、577行、CRLF；首末行、`run_id`、`extraction_id`和数值与严格结果一致，`day_type`为空。
- CSV不包含源PRJ、manifest或SIM绝对路径。源PRJ、运行manifest和SIM哈希在闭环前后不变。

## GUI状态

自动实现和非GUI证据已完成。根据项目规则，真实Tauri中英文、双主题、图表交互和原生导出验收为`pending_user`；本切片不新增或更新GUI截图。
