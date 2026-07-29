# 从GitHub下载和更新CONTAM Studio

## 普通用户下载

只使用项目的[GitHub Releases页面](https://github.com/summer521521/CONTAM-Studio/releases)。

每个正式版本应提供：

| 文件 | 用途 |
| --- | --- |
| `CONTAM-Studio-v<version>-windows-x64-portable.zip` | 含冻结Worker和许可证的完整便携包 |
| `CONTAM Studio_<version>_x64-setup.exe` | 推荐的NSIS安装器 |
| `CONTAM Studio_<version>_x64_en-US.msi` | 适合Windows Installer管理的MSI |
| `SHA256SUMS.txt` | 文件完整性校验 |
| `manifest.json` | 版本、提交和包内文件哈希 |

源码页中的“Source code”压缩包不是桌面安装包。

## 校验下载

在PowerShell中运行：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath ".\下载的文件.exe"
```

结果应与同一Release中的`SHA256SUMS.txt`一致。签名版本还应在文件属性的“数字签名”页显示发布者和有效签名。

0.2.0没有Authenticode签名，Windows可能显示未知发布者。如同一Release已生成GitHub证明记录，可用GitHub CLI验证：

```powershell
gh attestation verify ".\CONTAM-Studio-v0.2.0-windows-x64-portable.zip" `
  --repo summer521521/CONTAM-Studio `
  --predicate-type "https://github.com/summer521521/CONTAM-Studio/attestations/release-verification/v1"
```

该验证确认下载文件与本仓库发布核验记录匹配，不代表Windows发布者身份，也不替代SHA-256核对。

## 更新

0.2.0不在后台检查或自动下载更新：

1. 保存草稿并退出Studio。
2. 打开GitHub Releases。
3. 阅读新版本说明和已知限制。
4. 下载比当前版本更高的同类型安装包。
5. 校验SHA-256和数字签名。
6. 运行安装包完成覆盖安装。
7. 启动后在“关于”中确认版本。

便携版必须完整解压后运行；不能只复制`CONTAM-Studio.exe`，否则会缺少`runtime/python-worker`。

升级和卸载默认保留用户项目、研究结果、报告、配置及外部ContamX/SimRead。重要研究仍应由用户单独备份。

## 回退

若新版本出现问题：

1. 退出Studio。
2. 备份用户数据目录。
3. 从GitHub Releases下载之前的版本。
4. 校验哈希后重新安装。
5. 如果新版已经迁移数据，只使用应用保留的迁移前快照恢复，不手工编辑数据库或清单。

不要从聊天附件、网盘转载或未知镜像下载可执行文件。
