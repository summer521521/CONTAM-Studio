# 安全策略

## 支持版本

当前只对最新GitHub Release提供安全修复。0.1.x修复不承诺兼容未发布的开发提交。

## 报告漏洞

请使用GitHub仓库的“Security”页面提交私密漏洞报告，不要在公开Issue中粘贴用户PRJ、SIM、CSV、凭据、绝对路径或可利用细节。报告应尽量包含受影响版本、最小复现、预期影响和不含敏感数据的证据。

维护者确认问题前，不会要求上传真实研究项目。若需要样例，请先生成最小化、匿名化夹具。

## 发布安全边界

- 官方下载入口只有本仓库GitHub Releases。
- 每个资产提供SHA-256清单。
- 未获得公开可信Authenticode证书前，Release必须明确标记`unsigned`。
- GitHub Sigstore证明只证明指定Release资产及其哈希由本仓库工作流核验，不等同于Windows Authenticode身份签名。
- 不静默替换已发布资产；修复使用新版本。
