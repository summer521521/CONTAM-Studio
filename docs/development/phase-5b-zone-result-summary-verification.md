# Phase 5B-1桌面结果摘要验证

## 目标

验证用户选择Phase 4运行清单后，当前打开项目的Zone 1可以通过Rust受控桥调用Phase 5A并显示真实空气状态样本。测试输出和结果提取目录只放在`F:\Codex_File\CONTAM-Studio\phase-5b-zone-result-summary`，不提交仓库。

## 自动验证

- Python保留Phase 5A全部测试，并新增桥接操作、项目SHA绑定和结构化失败测试。
- 前端测试覆盖结果状态旧响应、项目/Zone切换清理、路径边界和真实样本表格。
- Rust测试与构建覆盖新增命令注册、ACL数量、活动Zone绑定和结果契约；未开放dialog前端、fs、shell或HTTP权限。

## 真实验证记录

2026-07-18在真实Windows Tauri窗口完成验证。打开官方`test_GetPrjInfo.prj`并选择Zone 1 `One`后，通过Rust原生JSON对话框选择Phase 4成功运行`20260718T041511Z-426b4cfa`；NIST SimRead 3.4.0.3提取并在桌面显示577个样本。首样本为0秒、293.15 K、-1.4222 Pa、1.2041 kg/m³，`day_type=null`，表格可纵向滚动。

- 原生manifest对话框取消后没有错误，已有同Zone结果保持可用。
- 使用为官方`demo1c.prj`新建的成功Phase 4 manifest时，在正式SimRead启动前显示稳定的“运行清单不属于当前项目”错误。
- 中文、英文、浅色和深色主题下摘要、按钮、数值和表格均正常显示。
- 源PRJ为10978字节，SHA-256始终为`ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e`。
- Phase 4 manifest为4621字节，SHA-256始终为`769160eced4afeb6240293d2b6f2a9219f11533c7ef1cf6da97317ba98a10fc3`；SIM为545892字节，SHA-256始终为`e8ccad872512dca288a9f06c95f0a9cb8d7175f2853e2b14ce16f63fa390cf39`。
- fixture与仓库目录没有新增SIM、NFR、XRF或运行日志；提取工作区位于Tauri应用本地数据目录。

## 截图

真实Tauri截图为[`../ui/phase-5b-zone-air-state-results.png`](../ui/phase-5b-zone-air-state-results.png)，PNG尺寸1443×931，包含真实项目、Zone 1、577样本摘要和首批官方SimRead结果行，不显示本机完整路径。
