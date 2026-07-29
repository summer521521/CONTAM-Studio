# CONTAM Studio v0.3.0

CONTAM Studio v0.3.0 定位为“Windows 优先、本地优先、联网增强的 CONTAM 桌面工作台”。本版本把官方模型目录、用户优先界面、只读本地存储透明度和哈希锁定的 NIST CONTAM 工具资源纳入同一条发布路径。

## 主要变化

- Codex、OpenAI、Anthropic、Gemini 和 OpenAI-compatible Provider 使用统一模型目录；内置 Provider 不要求普通用户手动填写模型 ID。
- 模型目录从官方接口获取，按当前适配器能力筛选，支持 24 小时非敏感缓存、过期标记和失败回退。
- 自定义 Provider 在官方目录不可用时才可在高级设置中填写手动模型。
- NIST 官方 ContamX 3.4.0.3 Windows x64 及 SimRead、SimComp、PrjUp 通过锁定清单和逐文件 SHA-256 校验进入构建输入。
- 默认 AI 和工具设置减少协议、端点、路径、哈希等工程细节；Diff、确认、错误和数据风险仍保留。
- 设置中新增只读“存储与隐私”统计；不会读取文件正文，也不提供删除按钮。
- 项目、仿真和用户文件继续在本地运行；联网仅在用户主动配置并调用 Provider 或官方服务时发生，不会静默上传项目文件。

## 来源与资源

- NIST 官方来源：[CONTAM 下载页面](https://www.nist.gov/el/beed/nist-multizone-modeling/software/contam/download-contam)。
- 工具锁定清单：`resources/contam-tools.lock.json`。
- API Key 只由 Rust 通过 Windows Credential Manager 使用，不进入 Profile、Archive、日志或前端持久化状态。
- CONTAM Studio 不是 NIST、OpenAI 或其他 Provider 的官方产品。

## 状态边界

自动化验证、候选包审计、GUI 验收和用户验收均已通过；本轮未进行真实 Provider 回归请求，不能据此推断真实 Provider 已验证。

Windows 构建当前未进行代码签名，可能触发 SmartScreen；`signed=not_run`。API Key 仍由 Windows Credential Manager 管理。正式 GitHub Release 的标签、资产和 URL 以发布后任务记录为准。
