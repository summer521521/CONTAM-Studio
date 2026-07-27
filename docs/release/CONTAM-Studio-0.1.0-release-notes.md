# CONTAM Studio 0.1.0

CONTAM Studio 0.1.0是面向CONTAM教学与科研的首个Windows x64桌面版本。

## 主要功能

- 受支持PRJ的语义项目树和安全只读边界。
- Zone名称/体积与FlowPath multiplier结构化草稿Patch。
- Revision、Diff、Undo/Redo和安全副本导出。
- 官方ContamX/SimRead运行和结果证据绑定。
- 单参数、多参数及笛卡尔积研究。
- 结果分页、筛选、排序、参数关系图和时间序列图。
- HTML、PDF、CSV和JSON报告。
- 附件隔离、证据披露、AI仿真方案和批准执行。
- 中英文、深浅主题、窄窗口和键盘工作流。
- 便携版、NSIS及MSI分发。

## 安全原则

- 不直接覆盖原始PRJ。
- 未知语义保持只读。
- AI写入必须经过与GUI相同的Patch和批准链。
- 联网AI默认不连接。
- 运行、结果、报告和诊断不向WebView暴露不受控路径。

## 安装

可选择便携版、NSIS安装器或MSI安装器。首次启动后配置官方ContamX与SimRead路径。未配置工具时，项目浏览、草稿编辑和历史结果仍可使用，运行命令会显示明确错误。

0.1.0采用透明的未签名发布，Windows可能显示“未知发布者”或SmartScreen提示。请只从本仓库GitHub Releases下载，并使用随附的`SHA256SUMS.txt`校验。仓库公开源码采用Apache-2.0；Release资产还通过本仓库GitHub工作流生成Sigstore发布核验记录，但该记录不等同于Windows Authenticode签名。

## 验证与限制

发布提交通过项目Full验证、Rust Clippy/fmt、前端测试/构建、安装器契约、内容扫描和诊断脱敏检查。完整限制见[known-limitations-0.1.0.md](known-limitations-0.1.0.md)。
