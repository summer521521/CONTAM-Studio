# CONTAM Studio 0.3.0 发布包

## 资产

- `CONTAM-Studio-v0.3.0-windows-x64-portable.zip`
- `CONTAM-Studio-v0.3.0-windows-x64-setup.exe`
- `CONTAM-Studio-v0.3.0-windows-x64.msi`
- `CONTAM Studio_0.3.0_x64_en-US.msi`
- `SHA256SUMS.txt`
- `manifest.json`
- `release-closure-status.json`

便携 ZIP 内必须同时包含 `CONTAM-Studio.exe`、`runtime/python-worker/contam-studio-python-worker.exe`、`runtime/python-worker/_internal/`、`runtime/contam-tools/` 下锁定的 ContamX/SimRead/SimComp/PrjUp、`resources/contam-tools.lock.json`、运行时清单、许可证和第三方声明。

CONTAM 工具在构建期由 `scripts/prepare-contam-tools-runtime.ps1` 调用 NIST 官方获取脚本生成。ZIP SHA-256 必须在解压前匹配，四个打包程序的文件哈希必须与 `resources/contam-tools.lock.json` 一致。源码 Git 不包含 ZIP、EXE、DLL 或缓存；发布脚本会将已验证的临时运行时复制到 Portable 和 Tauri Resource 输入。

## 一致性要求

- `package.json`、Python、Cargo 和 Tauri 版本均为 `0.3.0`。
- `v0.3.0` 标签、Worker 清单、主程序构建、安装器清单和 GitHub Release 必须指向同一 release commit。
- `manifest.json` 逐文件保存便携目录和安装器的 SHA-256；`SHA256SUMS.txt` 保存公开上传资产哈希。
- 公开资产必须由本轮构建产生，不复用 0.1.0 二进制。
- 发布构建必须通过资源发现和哈希校验；`official_contam_tools_resource=locked_and_included` 只证明资源进入构建输入，不替代官方测试夹具运行、干净机安装或用户验收。

## 签名与验收

- `unsigned_build=true` 和 `signature=unsigned` 是没有 Authenticode 证书时的真实状态。
- Full、冻结 Worker 脱离源码冒烟、Job Object 孙进程回收、内容/凭据扫描、NSIS/MSI 构建和本机隔离安装验证均应独立记录。
- 用户已对 Phase 6B GUI、真实 Provider 请求、API Key 配置使用和真实 AI 回答给出通过结论；发布包验证不保存任何凭据、账号或请求内容。
- 另一台全新 Windows 的独立人工验收若未实际执行，保持 `not_run`，不得由本机隔离测试推断。

## 用户核验

```powershell
Get-FileHash -Algorithm SHA256 ".\CONTAM-Studio-v0.3.0-windows-x64-portable.zip"
Get-FileHash -Algorithm SHA256 ".\CONTAM-Studio-v0.3.0-windows-x64-setup.exe"
Get-FileHash -Algorithm SHA256 ".\CONTAM-Studio-v0.3.0-windows-x64.msi"
Get-FileHash -Algorithm SHA256 ".\CONTAM Studio_0.3.0_x64_en-US.msi"
```

输出应与同一 GitHub Release 中的 `SHA256SUMS.txt` 完全一致。安装包没有 Authenticode 签名时，不能把哈希或 GitHub 证明表述为 Windows 发布者签名。
