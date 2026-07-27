# CONTAM Studio 0.1.0最终交接

## 发布范围

CONTAM Studio 0.1.0是Windows x64、离线优先、中英文双语的CONTAM教学与科研桌面工作台。它保留官方ContamX/SimRead作为求解和结果读取工具，通过Rust拥有的桌面权限边界、Python语义领域核心和React工作台提供以下闭环：

1. 打开并识别受支持PRJ。
2. 浏览Project、Level、Zone、FlowPath和Species语义对象。
3. 在不可变草稿中审阅并应用受支持的结构化Patch。
4. 运行官方ContamX并通过SimRead取得可信结果。
5. 执行单参数或多参数研究。
6. 分页、筛选、排序和可视化研究结果。
7. 导出HTML、PDF、CSV和JSON报告。
8. 使用附件证据、哈希绑定批准和AI解释；无AI时核心流程仍可用。

## 数据与AI边界

- 原始PRJ不由前端或AI直接覆盖。
- 未知或无法可靠回写的语义保持只读。
- 写入必须经过结构化Patch、Diff、确定性验证和用户批准。
- AI联网由用户主动启用；路径、原始PRJ、完整SIM和未批准附件不进入披露上下文。
- AI结果解释必须携带sample、Zone、指标、时间和结果哈希证据。

## 分发状态

- 便携版：已构建并通过自动内容审计。
- NSIS：已构建并通过自动内容审计。
- MSI：已构建并通过自动内容审计。
- 干净Windows：用户接受门禁，但没有独立外部执行证据，记录为`waived_by_user`。
- 签名：必须由真实可信代码签名证书完成；不得用自签名证书冒充。
- 发布：以Git标签、GitHub Release和发布资产签名/哈希为最终事实。

## 已知限制

完整列表见[known-limitations-0.1.0.md](known-limitations-0.1.0.md)。关键限制包括Schedule/Species参数化只读降级、非任意PRJ完整编辑、图片像素未进入远程AI协议、没有自动更新，以及只支持Windows x64。

## 验证入口

```powershell
powershell -NoProfile -File scripts\verify.ps1 -Mode Full
git diff --check
```

发布产物、哈希、签名和归档清单必须与0.1.0标签指向同一提交。
