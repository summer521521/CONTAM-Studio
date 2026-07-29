# ADR-018：采用用户优先、本地优先且联网增强的运行时

状态：accepted for Phase 6C implementation

日期：2026-07-29

## 背景

Phase 6B 已建立 Provider Profile、Codex App Server、受控 HTTP 网关和 Credential Manager 凭据边界，但默认界面仍暴露了较多协议细节，官方模型需要用户手填 ID，运行 ContamX/SimRead 还容易被理解为必须自行配置路径。Phase 6C 将这些实现能力收敛成普通用户可完成的主流程，同时保留诊断和安全边界。

## 决策

1. 产品定位使用“Windows 优先、本地优先、联网增强的 CONTAM 桌面工作台”。项目、仿真和用户文件仍在本机；AI、官方模型目录、更新检查和官方资源获取是显式联网场景。
2. 内置 Codex、OpenAI、Anthropic 和 Gemini 模型目录由 Rust 网关获取并转换为统一模型结构。OpenAI 使用 `/v1/models` 并筛选 Responses/文本生成能力；Anthropic 分页读取 `/v1/models`；Gemini 读取官方 `v1beta/models` 并要求 `generateContent`。不再把某个“最新模型”硬编码为唯一选项。
3. 模型目录缓存只保存非敏感模型元数据，TTL 为 24 小时；刷新失败保留上次列表并标记过期。当前选择被目录移除时清空选择并要求用户重新选择，不静默替换。自定义 Provider 在目录缺失时才允许在高级设置填写手动模型。
4. HTTP 请求仍只经过 Rust `reqwest` 网关，禁止重定向、限制响应体、保留 HTTPS/回环白名单和现有取消/超时边界。Gemini 模型目录使用其官方模型接口的 API-Key 请求头，OpenAI-compatible 对话使用官方 Bearer 形状。
5. 发布构建在构建期从官方 NIST 页面获取 ContamX ZIP，先校验 ZIP SHA-256 再解压；锁定清单记录 ZIP 和每个工具文件哈希。二进制不进入 Git，构建脚本把已验证运行时同步为 Tauri Resource、Portable、NSIS/MSI 的输入。运行时按开发 override、内置资源、旧版诊断路径排序，并在每次使用前再次验证哈希。
6. 普通界面只显示 Provider、连接状态、当前模型、主要动作和必要风险。Endpoint、手动模型、工具路径、协议和诊断移入可折叠高级区域；Diff、确认、错误、数据风险和无障碍语义保留。
7. 设置页增加本地数据统计，只在 Rust 固定白名单目录下统计数量和大小，不读取正文，不提供删除按钮。API Key 仍不进入 Profile、Archive、日志或前端持久化状态。

## 不采用的方案

- 不抓取 OpenAI 或其他 Provider 文档 HTML 作为运行时模型目录。
- 不在前端建立绕过 Rust 网关的 Provider 请求路径。
- 不把 Antigravity、Claude Code 或其他 Agent 的本地登录会话当作可复用凭据；只有用户显式配置的受支持 HTTP API 才能作为自定义 Provider。
- 不把 NIST 二进制提交到仓库，也不使用第三方镜像或第一次仿真时静默下载。
- 不把“自动测试通过”提升为真实 Provider、GUI、安装器、签名或发布通过。

## 影响

首次构建需要网络访问官方 NIST 页面并保留构建缓存；终端用户运行已打包应用时不需要自行下载求解器。模型目录可能为空、过期或因权限/限流刷新失败，此时界面保留状态并给出下一步。旧配置中的工具路径只作为高级诊断兼容项，普通保存不再写入它们。

## 证据

- [统一 Provider 能力矩阵](../ai/provider-capability-matrix.md)
- [本地数据与隐私说明](../user-guide/local-data-and-privacy.md)
- [NIST 工具锁定清单](../../resources/contam-tools.lock.json)
- [NIST 官方下载页](https://www.nist.gov/el/beed/nist-multizone-modeling/software/contam/download-contam)
