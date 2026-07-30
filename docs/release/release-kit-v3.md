# CONTAM Studio 0.4.0 发布包

## 公开资产

- `CONTAM-Studio-v0.4.0-windows-x64-portable.zip`
- `CONTAM-Studio-v0.4.0-windows-x64-setup.exe`
- `CONTAM-Studio-v0.4.0-windows-x64.msi`
- `SHA256SUMS.txt`
- `manifest.json`
- `release-closure-status.json`

便携 ZIP 必须包含 `CONTAM-Studio.exe`、冻结 Python Worker 及其 `_internal/`、锁定的 ContamX/SimRead/SimComp/PrjUp、`resources/contam-tools.lock.json`、运行时清单、许可证和第三方声明。

CONTAM 工具在构建期由 `scripts/prepare-contam-tools-runtime.ps1` 从 NIST 官方来源准备。源 ZIP 与四个打包程序必须通过锁定清单中的 SHA-256 校验；源码 Git 不提交这些二进制或下载缓存。

## 一致性要求

- `package.json`、Python、Cargo 和 Tauri 版本均为 `0.4.0`。
- `v0.4.0` 标签、冻结 Worker 清单、主程序、安装器清单和 GitHub Release 必须指向同一 release commit。
- Portable、NSIS 和 MSI 必须由本轮构建产生，不复用 0.3.0 资产。
- `manifest.json` 记录发布目录文件哈希；`SHA256SUMS.txt` 记录公开上传资产哈希。
- 资源锁定并进入构建只证明发布输入完整，不替代真实工具运行、干净机安装、GUI 或 Provider 验收。

## 发布状态

- 没有 Authenticode 证书时必须记录 `unsigned_build=true` 与 `signature=unsigned`。
- Full、冻结 Worker 脱离源码冒烟、Windows Job Object 进程树、内容/凭据扫描、NSIS/MSI 构建和安装验收分别记录。
- 本轮 Phase 7 GUI 验收与自动化验证已完成；真实 Provider、本机安装、另一台干净 Windows 和签名状态不得互相推断。

## 用户核验

```powershell
Get-FileHash -Algorithm SHA256 ".\CONTAM-Studio-v0.4.0-windows-x64-portable.zip"
Get-FileHash -Algorithm SHA256 ".\CONTAM-Studio-v0.4.0-windows-x64-setup.exe"
Get-FileHash -Algorithm SHA256 ".\CONTAM-Studio-v0.4.0-windows-x64.msi"
```

输出应与同一 GitHub Release 中的 `SHA256SUMS.txt` 一致。哈希校验不等于 Windows 发布者签名。
