# CONTAM Studio v0.4.0

CONTAM Studio v0.4.0 是一次面向真实用户任务的工作台重构。它保留本地优先、可信草稿、确定性验证和受控 Provider 边界，同时减少 IDE 式界面噪声，让项目打开、仿真运行、结果分析和研究工作更直接。

## 主要变化

- 主导航收敛为“项目、运行、结果、研究”四个用户任务入口，项目搜索进入项目树。
- 无项目首页以“打开 CONTAM 项目”为主动作，不再展示伪最近项目或大段工程说明。
- 首屏显示当前项目、当前 Zone、当前状态和下一步，设置、结果、研究及 AI 侧栏均可一致返回项目工作区。
- Problems、Logs、Results 底部面板默认折叠，仅在问题或运行需要时自动展开。
- 设置页按外观、AI 与 Provider、仿真工具、数据与隐私、高级诊断组织；端点、手动模型 ID、密钥和诊断细节采用渐进披露。
- 工作台持久化状态升级到 v2；恢复布局会重建分栏并恢复项目树、属性面板与底部面板的默认状态。
- 结果页区分“求解失败”与“ContamX 已成功求解，但结果读取未完成”，保留真实运行证据且不伪造图表或零值。
- 统一浅色/深色设计令牌、信息层级、间距、按钮、焦点状态和中英文文案。
- 新增综合验收案例包，覆盖受支持项目、草稿 Patch、附件、真实工具运行与结果读取边界。

## 可信边界

- 原始 PRJ 不由 GUI 或 AI 直接覆盖；受支持修改仍经过 Patch、Diff、确定性验证、用户确认、撤销/重做和另存副本。
- API Key 仍只由 Rust 通过 Windows Credential Manager 使用，不进入 Profile、Archive、日志或前端持久化状态。
- 官方 ContamX 3.4.0.3、SimRead、SimComp 和 PrjUp 仍由 NIST 来源及逐文件 SHA-256 锁定清单进入发布包。
- 本版本没有后台自动更新，也不会静默上传项目文件。

## 验证摘要

- Phase 7 自动测试、TypeScript/Vite 构建、Rust 检查与测试、Python 全量测试、综合案例合同及任务日志合同均通过。
- 真实 Tauri GUI 已验证项目入口、布局恢复、中英文、浅色/深色、350→420 草稿安全链、ContamX 3.4.0.3 求解、七区域 SimRead 577 样本成功路径，以及结果读取失败语义。
- 精确 1280×720、1440×900、125%/200% 系统缩放矩阵未执行，不由约等尺寸截图替代。
- 本轮未发起真实 Provider 回归请求；既有 Provider 能力与凭据边界未因本次 UI 重构而绕过。

## 下载与安全

Windows x64 提供便携 ZIP、NSIS 安装器和 MSI。公开资产附带 `SHA256SUMS.txt`、`manifest.json` 与 `release-closure-status.json`。

本版本未进行 Authenticode 代码签名，Windows 可能显示未知发布者或 SmartScreen 提示。CONTAM Studio 不是 NIST、OpenAI 或其他 Provider 的官方产品。
