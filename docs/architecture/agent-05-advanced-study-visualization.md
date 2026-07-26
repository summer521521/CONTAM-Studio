# AGENT-05高级研究参数与可视化

## 数据边界

研究结果仍由官方ContamX/SimRead路径产生。`zone_bridge._run_official_study`只保留每个样本最多512个时间点的结构化投影；完整提取物由结果哈希绑定，不进入前端或AI请求。缺失值使用`null`，不转换为零。

## Schedule与Species

现有`DaySchedule`、`WeekSchedule`和`SpeciesProjection`继续提供严格只读语义投影。官方fixture没有足够的、可证明字节跨度的Schedule写入证据，Species初始浓度也没有可安全绑定的单字段Patch。因此`create_study_plan`对`schedule_value`和`species_initial`在计划阶段返回`unsupported_parameter`，桌面显示只读原因，不把失败样本伪装成成功。后续接入必须先增加真实格式证据、旧值校验和原子Patch测试。

## 可视化

`study_visualization.py`提供确定性的参数关系点和时间序列整形：只接受成功样本、64位结果哈希和有限数值，统一执行512点上限、稳定排序和空状态。React的`StudyCharts`复用ECharts，支持参数/指标/样本/Zone筛选、缩放重置、深浅主题和窄窗口。HTML/PDF报告复用相同投影，PDF使用矢量坐标绘制关系图、时间序列和分页样本表，并保留项目哈希、研究哈希、来源和AI证据说明。

## AI证据

结果分析新增参数相关性和时间峰值的描述性结论。每条结论引用`sample_id`、`parameter_values`、`zone_id`、`metric`、`timestamp`和`result_hash`，并明确相关性不等于因果关系；无可信结果时返回证据不足。
