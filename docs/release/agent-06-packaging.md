# AGENT-06 打包与Windows发布准备

## 当前构建

- 版本来源：`package.json`；脚本会校验Cargo和Tauri版本一致。
- 便携构建目录：`F:/Codex_File/artifacts/contam-studio/agent-06/0.1.0/portable/`。
- 内容白名单：`CONTAM-Studio.exe`和`manifest.json`；`scripts/audit-release.mjs`拒绝PRJ、SIM、CSV、fixture、node_modules、虚拟环境、用户路径、密钥和诊断日志。
- 当前状态：`unsigned_build`。本机未配置代码签名证书，也未上传或创建Release。
- Tauri配置保留NSIS/MSI目标；本机未发现`makensis`、WiX `candle/light`或`wix`，因此安装器状态为`not_built_without_verified_windows_packager`，不能声称安装器已生成。

## 目录与首次启动

安装目录只放应用资源。配置目录、数据目录、运行临时目录、结果缓存和日志目录由Tauri用户目录提供。首次启动设置页允许选择数据目录并使用固定的`--version`探测ContamX和SimRead；状态区分未配置、路径不存在、无权限、不可执行、版本不受支持、架构不匹配和探测失败。工具缺失时打开、草稿和历史结果仍可用，运行按钮返回明确错误。

## 升级与卸载

配置文件带schema版本，旧版配置按幂等规则迁移；迁移先写临时文件并保留旧副本，失败不会清除原配置。已有数据目录包含内容时，应用明确要求受控迁移而不是静默切换。研究结果使用已有哈希标识，旧版本结果无法读取时显示旧版本提示，不静默混用。卸载默认只移除应用文件，保留用户配置、工程和结果，不触碰ContamX/SimRead或外部目录；清理缓存只能删除Studio拥有的缓存目录。

## SmartScreen与验收边界

未签名构建在Windows可能显示“Windows已保护你的电脑”或发布者未知提示。用户应确认来源后从“更多信息”继续，正式分发前必须另行完成组织证书签名和干净机验证。本批没有可用的干净Windows隔离环境，因此`clean-machine acceptance: blocked`；用户已完成当前开发环境的首次启动、配置、诊断、目录和主题GUI验收，真实安装器、升级和卸载仍需干净Windows环境验证。
