# AGENT-04多参数研究、结果分析与报告工作流

本批次把研究方案、样本状态、结果证据和报告导出接入现有工作台。研究哈希由项目源哈希、Revision、可支持参数定义、组合模式和组合值确定，不包含随机运行时间；项目、Patch或Revision变化会使旧研究标记为旧版本。

## 运行边界

- 研究样本通过Rust `prepare_study_plan`、`run_study`、`page_study_results`、`analyze_study_results`和`export_study_report`命令进入Python桥；前端不启动ContamX。
- 每个样本在独立工作区中应用语义Patch，再调用官方ContamX和SimRead；样本失败只记录为`failed`，不会覆盖其他成功结果。
- 研究运行使用受控取消标记；取消会让当前样本在安全边界结束后停止，并将剩余样本记录为`cancelled`。重复运行使用独立attempt目录和结果对象，分页视图只展示每个样本的最新attempt，不覆盖旧结果。
- 结果清单、计划和报告使用独占提交，旧文件不覆盖；WebView响应不携带绝对路径。
- AI分析是本地、确定性的证据摘要，只接受带样本ID、Zone、时间点和结果哈希的证据引用；没有证据时返回`evidence_insufficient`。

## 参数支持

研究方案契约登记Zone体积、Zone名称、FlowPath multiplier、Schedule数值和Species初始条件。当前官方工具纵向闭环已验证Zone体积、Zone名称和FlowPath multiplier的语义Patch；Schedule和Species保持方案级登记但在未完成可逆字节写入证据前按`unsupported_parameter`安全降级。

## 报告与验收

研究状态按全成功、全失败、全取消和部分完成分别返回`succeeded`、`failed`、`cancelled`、`partial`。支持HTML、PDF、CSV和JSON四种同源报告，报告包含项目/研究哈希、工具身份、参数、样本统计、关键结果、分析证据、生成时间和来源标签。真实官方fixture运行证据与自动化测试记录在AGENT-04任务日志；真实GUI验收仍由用户完成。
