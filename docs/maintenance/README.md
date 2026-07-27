# CONTAM Studio维护入口

这里保存对后续更新真正有用的维护资料。临时克隆、编译缓存、一次性脚本和历史安装产物不属于源码仓库。

## 日常开发

1. 从`main`创建`codex/<task>`分支。
2. 开始时建立`docs/development/task-log/records/`任务日志并标记`in_progress`。
3. 使用fixture或`F:\Codex_File`中的副本，不使用用户唯一PRJ/CSV/SIM。
4. 修改GUI和AI时复用同一语义领域接口。
5. 完成后运行：

```powershell
powershell -NoProfile -File scripts\verify.ps1 -Mode Full
git diff --check
```

6. 用户完成GUI验收后再合并`main`。

## 发布

- [版本升级与发布](release-process.md)
- [GitHub下载与用户更新](github-download-and-update.md)
- [代码签名策略](code-signing-policy.md)
- [0.1.0发布包](../release/release-kit-v1.md)
- [最终交接](../release/final-handoff-v1.md)
- [已知限制](../release/known-limitations-0.1.0.md)

## 不应提交

- `node_modules`
- `python/.venv`
- `src-tauri/target`
- `dist`
- 安装器、便携EXE和运行结果
- 用户PRJ/CSV/SIM
- 证书、私钥、Token和密码

这些内容应由锁文件和构建脚本重建，发布二进制放在GitHub Release资产中。
