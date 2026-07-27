# 0.1.0开发环境清理记录

## 保留

- 正式源码和学习资料：`F:\CONTAM Studio`及GitHub仓库。
- 最终发布产物：`F:\Codex_File\artifacts\contam-studio\release\0.1.0`。
- 本地打包工具链：`F:\Codex_File\toolchains\contam-studio-packaging`。
- 可恢复源码归档：`F:\Codex_File\archives\contam-studio\0.1.0`。
- 空测试父目录：`F:\Codex_File\temp\contam-studio`；变异测试会在其中创建并自动删除独立子目录。
- 历史总任务书：`docs/archive/`，只作设计追溯。

## 清理

以下内容在确认没有唯一未保存代码后删除：

- 已合并的AGENT隔离克隆和旧工作树。
- pnpm、Rust、pytest和一次性重打包临时目录。
- AGENT-06、AGENT-07和AGENT-08中间发布产物。
- 可由源码、锁文件和构建脚本重建的`dist`、`target`及缓存。

发现的两类非主线内容先归档再删除：

- 旧`batch-03x`独立提交保存为Git bundle。
- AGENT-03早期未提交修改保存为补丁和文件副本。

清理不读取或删除用户PRJ、CSV、SIM、真实AppData、凭据或最终0.1.0发布资产。
