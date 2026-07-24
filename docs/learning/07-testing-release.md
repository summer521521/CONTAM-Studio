# 07 测试与发布

本地验证分为 Docs、Fast、Full、Package、RealTool、Security、AgentEval 和 Release。自动化可以证明 Python/Rust/前端/契约和变异测试；不能冒充真实 GUI、官方工具、干净电脑、H/U 评审或签名发布。

最后检查：

```powershell
powershell -NoProfile -File scripts\verify.ps1 -Mode Full
git diff --check
```

发布候选保持 unsigned、unpublished、AI/远程默认关闭；用户源文件、导出和唯一证据不自动清理。

问题：什么证据必须留给 H/U，而不能由本地测试替代？
