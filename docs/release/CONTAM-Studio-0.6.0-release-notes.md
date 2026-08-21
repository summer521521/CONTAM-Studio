# CONTAM Studio v0.6.0 本地候选发布说明

> v0.6.0 当前仅为本地候选版本，尚未创建 Git 标签、GitHub Release 或公开下载资产。v0.5.0 仍是当前已发布稳定版本。

## Geometry Workbench

v0.6.0 将 Geometry Workbench 作为面向教学、科研和工程分析的全画布建筑工作区：

- 中央全画布工作区支持工程蓝图、建筑纸张和夜间实验室三套视觉主题；
- 支持多楼层建筑构造，以及墙体、门窗、房间、竖向开口和 FlowPath 锚点；
- 使用整数毫米坐标、250 mm 捕捉、正交构造、尺寸编辑和手势级撤销/重做；
- 支持校准 PNG、JPEG 或 PDF 页面作为建筑底图；底图是用户明确导入的项目资源，不是 CONTAM 几何事实；
- Studio 建筑草稿独立于原始 PRJ，支持受限 Zone 和 Airflow Path 语义创作；
- 语义创作只允许已验证的对象和 flow element，且只导出到新的 PRJ 副本；
- SketchPad 位置比较保持有损预览，必须经过安全 Patch/Diff、确定性验证和二次确认；
- Codex 订阅登录下提供受控的 Luna 读图草案入口，草案依赖感知选择，不能自动应用；
- 官方 ContamX/SimRead 继续是求解和结果读取的权威工具，Studio 不重写 CONTAM 求解器。

## 数据与安全边界

- 原始 PRJ 不由前端或 AI 直接覆盖；未知或无法可靠保存的内容保持只读；
- 几何编辑、语义创作和 AI 建议共用结构化命令、Diff、确定性验证、用户确认、快照和追踪链路；
- 项目、Revision、源文件哈希、几何 Revision 和结果身份继续绑定；
- API Key 继续由 Windows Credential Manager 管理，不进入 Profile、Archive、日志或前端持久化状态；
- CONTAM Studio 不是 NIST、OpenAI 或其他 Provider 的官方产品。

## Windows 候选资产

计划从通过远程 Windows CI 的精确提交构建 Portable、NSIS 和 MSI 候选。候选构建保持未签名，可能触发 SmartScreen 或未知发布者提示。Portable 启动、隔离 NSIS 安装/覆盖/卸载、MSI 静态审计和官方工具包复测只作为本地候选证据，不代表独立干净 Windows 用户验收。

## 当前状态

- automated_verified：passed；
- browser_design_qa：passed；
- github_windows_ci：passed；
- manual_gui：partial；125%/200% Windows 系统缩放和用户最终验收尚未执行；
- real_tools：passed；
- real_provider：not_run；
- packaged：候选构建前为 no；
- signed：not_run；
- released：no；
- user_validated：not_run。
