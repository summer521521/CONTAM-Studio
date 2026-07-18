# Phase 4B-1受控桌面ContamX运行

## 纵向闭环

```text
React：request_id + project_session_id
↓ 显式Tauri ACL
Rust：活动项目路径/SHA-256 + <app-local-data>/runs
↓ 一次性Python JSON桥，75秒宿主超时
Python：run_contamx，60秒求解器超时
↓
新的run_id/workspace/evidence/manifest.json
↓ Rust契约验证
WebView安全运行摘要
```

React不能提交PRJ、求解器、运行根或manifest路径。Rust从内存活动项目取得规范化源路径和SHA-256，运行根固定在应用本地数据目录；Python在求解器探测和运行目录创建前验证活动项目身份。求解器仍只由`CONTAM_STUDIO_CONTAMX`显式配置，不回退PATH、注册表、磁盘扫描或自动下载。

## 进程与证据边界

ContamX正常退出、超时、`wait()`错误、terminate/kill失败和流捕获失败都进入有界收口。只有进程退出已确认、stdout/stderr读取线程停止且证据冻结后，Python才计算生成物哈希并写可信manifest。若最终无法确认退出，返回`run_process_termination_failed`，保留不可信残留工作区供排查，但不写Phase 5A可接受的manifest，也不声明生成物最终哈希。版本探测使用相同的有界终止和流读取原则。

## 桌面会话

Rust只在内存保存最新成功`ActiveRunContext`：项目session、源SHA-256、`run_id`及规范化manifest路径。打开新项目或Patch切换到新副本时清除；失败运行保留上一次成功上下文。路径不进入WebView，React只接收状态、运行ID、官方求解器名称/版本、时间、退出码、超时、SIM数量和源文件不变标志。

本切片不自动加载刚完成的结果。用户仍通过Phase 5B-1原生清单选择器加载结果；下一切片才会直接使用Rust内存中的活动运行manifest。当前也不提供运行取消、历史列表、批量运行、配套输入自动发现或求解器设置页。
