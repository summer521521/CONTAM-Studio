# CONTAM Studio 0.1.0发布包

## 固定内容

- 平台：Windows 10/11 x64。
- 形式：便携版、NSIS安装器、MSI安装器。
- 权限：current-user安装，标准用户运行。
- 求解器：官方ContamX/SimRead由用户配置，不随Studio重新分发。
- AI：可选、用户主动连接；核心项目、草稿、运行、研究和报告能力不依赖AI。
- 数据：用户源文件、导出、已保存研究和报告不属于自动清理对象。

## 发布门禁

```powershell
powershell -NoProfile -File scripts\verify.ps1 -Mode Full
git diff --check
```

发布还必须满足：

- 标签提交与构建提交一致。
- 产物通过内容和敏感信息扫描。
- 每个资产具有SHA-256。
- Authenticode状态与发布说明一致。
- GitHub Release包含已知限制、安装说明和校验清单。

干净Windows独立执行在0.1.0由用户明确豁免，状态为`waived_by_user`，不是实测通过。没有可信证书时不得把自签名或未签名资产标成正式已签名。
