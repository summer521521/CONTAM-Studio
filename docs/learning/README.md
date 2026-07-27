# CONTAM Studio学习入口

这套资料用于在软件完成后理解它为什么这样设计，而不是要求先学完整软件工程。

## 推荐顺序

1. [从这里开始](00-start-here.md)：理解完整数据流。
2. [产品地图](01-product-map.md)：理解用户看到的功能。
3. [React前端](02-frontend.md)：理解界面如何发出语义请求。
4. [Rust桌面宿主](03-rust-host.md)：理解权限、路径和状态为什么由Rust拥有。
5. [Python领域核心](04-python-domain.md)：理解PRJ语义、Patch和未知内容保护。
6. [CONTAM运行与结果](05-contam-results.md)：理解ContamX/SimRead和证据绑定。
7. [附件与AI](06-attachments-ai.md)：理解披露、批准和AI能力边界。
8. [测试与发布](07-testing-release.md)：理解验证、安装器和发布。

也可以直接使用[七次入门学习路线](seven-session-self-study.md)，每次30至60分钟。

## 学习时的安全规则

- 只使用`fixtures/`中的案例或`F:\Codex_File`中的副本。
- 不拿用户唯一项目练习写入。
- 不先读完整代码；从一次点击沿`React -> Rust -> Python -> 官方工具 -> 证据`追踪。
- 看到只读拒绝时先判断它是否在保护未知语义，而不是立刻移除校验。
- 修改练习后运行定向测试和Full验证，不依靠“界面看起来正常”判断正确性。
