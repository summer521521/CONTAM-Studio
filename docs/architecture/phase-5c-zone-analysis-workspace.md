# Phase 5C Zone空气状态分析工作区

## 范围

Phase 5C把Rust已经严格验证的当前Zone `zone_air_state`结果升级为第一个桌面分析工作区：三项原始曲线、确定性统计、完整数据表和用户主动触发的CSV副本导出。它不新增结果类型，也不改变Phase 5A/5B的运行和提取信任链。

```text
Phase 5A严格结果
↓ Rust结果契约验证
ActiveResultContext（仅桌面宿主内存）
├─ WebView安全结果视图 → TypeScript统计 → ECharts/数据表
└─ 原生另存为 → Rust确定性CSV编码 → 不存在的新文件
```

## 确定性分析

`zone-air-state-analysis.ts`只依赖严格结果类型。它不访问React、DOM、Tauri、网络或本地存储，并用一次遍历的在线均值计算三项指标的最小值、最大值、算术平均值及首次极值位置。输入为空、样本数量不一致、索引重复、时间不严格递增或数值非有限时整体拒绝。分析不会排序、插值、平滑、采样、丢弃样本或转换单位。

累计秒按持续时间而非时间戳解释。格式化函数输出`D天 HH:MM:SS`或`D days HH:MM:SS`，同时保留原始秒数。统计是确定性描述，不是舒适性、健康性、规范合规或AI判断。

## 图表和表格

前端新增且只新增`echarts 6.1.0`，使用`echarts/core`模块化注册`LineChart`、网格、提示、图例、数据缩放、轴指示、ARIA和Canvas renderer。单个ECharts实例绘制温度K、参考压力Pa和空气密度kg/m³三条纵向曲线。三张曲线使用相同左右边界、相同累计时间范围和各自可见的累计时间横轴；只保留同步的内部鼠标滚轮缩放，不显示独立拖放滑块。曲线明确关闭平滑、采样、缺失值连接和动画；Tooltip从原始样本索引取值。

统计卡对最小值和最大值分别显示明确的“极值时间”标签。底部ContamX状态来自当前桌面运行状态：尚未运行时只显示待验证，运行中显示运行状态，成功后显示已验证的求解器名称和版本；只有收到稳定的未配置诊断时才显示未配置。

组件用`ResizeObserver`适配面板，主题、语言和结果变化通过`setOption`更新，卸载时断开Observer并销毁实例。图表不是唯一信息入口：工作区同时提供标题、说明、统计、ARIA、键盘可用的视图切换和完整语义化数据表。

## ActiveResultContext

Rust只在Python成功、严格结果契约、项目、Zone、运行和提取身份全部验证后保存`ActiveResultContext`。上下文绑定：

- 项目session和源SHA-256；
- Zone编号、名称和源行号；
- `run_id`和`extraction_id`；
- `active_run`或`selected_manifest`来源；
- 完整严格结果、样本数和SI单位。

提取失败或对话框取消不覆盖旧上下文；新项目或Patch副本激活时清除；新Zone结果成功时替换；新ContamX运行成功时保留旧结果，以便界面明确标记为较早运行。上下文不持久化，不是稳定UUID，也不向WebView序列化manifest、SIM或结果目录路径。

## 导出边界

React只提交`request_id`、项目session、Zone编号、`run_id`和`extraction_id`。它不提交导出路径、样本、CSV、PRJ、manifest、SIM或结果目录。Rust从`ActiveResultContext`重新验证所有身份，并在对话框前、写入前和写入后流式复核源PRJ大小与SHA-256；变化时删除本次新CSV并整体拒绝。目标通过原生保存对话框取得。取消不是错误，现有文件、非`.csv`、源PRJ、缺失父目录和不可用目录整体拒绝。

导出在目标目录用`create_new`创建临时文件，完整写入后`flush`、`sync_all`、关闭并原子重命名；失败清理临时文件。最终目标绝不静默覆盖。WebView只收到文件名、数据行数、字节数和结果身份，不收到路径或底层IO错误。

CSV详细契约见[Zone空气状态CSV导出](zone-air-state-csv-export.md)。

## 当前不支持

不支持多Zone或多运行比较、运行历史、路径流量、污染物、舒适性或合规判断、AI解释、Excel原生格式、云端导出、自动提取和自动导出。当前分析只适用于严格验证的`zone_air_state`。
