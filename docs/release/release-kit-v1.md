# v1 本地发布包候选

## 固定内容

- 分支：`codex/contam-studio-v1-complete`；不得在此阶段 push、tag、签名或发布。
- Tauri per-user Windows 安装路径，标准用户运行；官方 ContamX/SimRead 外部选择，不随包分发。
- Python worker 使用项目锁定依赖；不使用 PATH 或全局 Python；AI、远程披露、状态写入默认关闭。
- 包含版本、SHA-256、依赖许可证、SBOM、回滚和数据保留说明；用户源文件与导出不属于自动清理对象。

## 交付前命令

```powershell
powershell -NoProfile -File scripts\verify.ps1 -Mode Full
git diff --check
```

Release、签名、上传、自动更新、真实工具和干净电脑行都保留 `pending_final_acceptance`，不伪造发布证据。
