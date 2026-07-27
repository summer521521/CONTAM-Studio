# AGENT-08 开发者交接

## 构建入口

在隔离克隆中运行（需要重新生成便携版时使用默认模式）：

```powershell
scripts\release-closure.ps1 -ArtifactRoot F:\Codex_File\artifacts\contam-studio\agent-08 -ToolchainRoot F:\Codex_File\toolchains\contam-studio-packaging
```

若只需使用已有的当前构建输入进行本地NSIS/WiX重打包，可使用：

```powershell
scripts\build-release.ps1 -ArtifactRoot F:\Codex_File\artifacts\contam-studio\agent-08 -SkipBuild
scripts\release-closure.ps1 -ArtifactRoot F:\Codex_File\artifacts\contam-studio\agent-08 -ToolchainRoot F:\Codex_File\toolchains\contam-studio-packaging -SkipBuild
```

脚本先生成便携版，再通过`resolve-packaging-toolchain.ps1`校验NSIS/WiX文件哈希和版本。工具链不存在或校验失败时只写`blocked_environment`，不从PATH猜测工具、不安装全局组件。

## 产物

版本产物位于`F:\Codex_File\artifacts\contam-studio\agent-08\0.1.0`：

- `portable/CONTAM-Studio.exe`
- `installers/*.exe`（NSIS，未签名）
- `installers/*.msi`（本地WiX 3.14.1，未签名）
- `manifest.json`
- `release-closure-status.json`
- `diagnostics/release-diagnostics.json`

这些产物不能提交到仓库。正式发布前仍须完成代码签名、干净Windows安装验收和用户批准。

## 数据与卸载

安装目录、用户配置、项目工作区、运行临时目录、结果缓存和日志目录必须分离。安装/卸载测试只能使用`F:\Codex_File\temp`下的测试目录；不得以测试参数指向真实AppData或用户工程。本机没有Sandbox/VM，且严格禁止宿主机注册表修改，因此安装/升级/卸载实测保持`blocked_environment`。
