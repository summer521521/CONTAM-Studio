# CONTAM Studio版本升级与发布

## 版本准备

1. 确认`main`干净并已同步`origin/main`。
2. 同步`package.json`、`src-tauri/Cargo.toml`和`src-tauri/tauri.conf.json`版本。
3. 更新发布说明、已知限制、能力矩阵、UAT和任务日志。
4. 运行Full验证。
5. 从最终提交生成便携版、NSIS和MSI。

## 产物规则

- 构建目录位于`F:\Codex_File\artifacts\contam-studio\release\<version>`。
- 安装包不提交Git。
- 二进制必须绑定发布标签指向的提交。
- 对EXE和MSI使用可信代码签名证书进行Authenticode签名。
- 对签名后的最终文件生成`SHA256SUMS.txt`。
- 重新运行内容与敏感信息扫描。

## GitHub发布

1. 推送最终`main`。
2. 创建带说明的版本标签，例如`v0.1.0`。
3. 创建GitHub Release。
4. 上传便携版、NSIS、MSI和`SHA256SUMS.txt`。
5. 发布说明必须列出平台、安装方式、已知限制、签名主体和干净机证据状态。
6. 下载GitHub上的资产并复核哈希。

## 签名边界

- 不在仓库、任务日志或Release中保存PFX、私钥或密码。
- 不使用自签名证书冒充公开可信签名。
- 没有可信证书时保持Release为草稿，不把资产描述为已签名。
- 证书到期或吊销后重新发布必须使用新版本和新哈希，不静默替换既有正式资产。

## 后续开发

发布后从最新`main`创建新任务分支。不要直接修改或移动既有Release资产；修复使用`0.1.1`，兼容功能升级使用`0.2.0`。
