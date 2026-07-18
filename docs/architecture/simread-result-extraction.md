# SimRead结果提取边界

Phase 5A的结果入口必须是Phase 4成功运行清单，而不是用户任意指定的SIM文件。提取器先校验运行状态、PRJ/SIM哈希、求解器身份和安全相对路径，再把PRJ与SIM复制到全新的后处理工作区。

SimRead使用NIST官方`simread.exe` 3.4.0.3。调用采用参数数组、`shell=False`、独立工作目录和固定stdin契约：默认日期、关闭污染物节点结果、开启节点流结果、选择一个节点、关闭链路结果。工具在工作区生成文本结果；Phase 5A只解析节点结果`.nfr`，不修改Phase 4运行目录。

首个结果类型为`zone_air_state`，严格表头为`Date`, `Time`, `Node`, `T (C)`, `P (Pa)`, `D (kg/m3)`。温度按确定性公式`K=C+273.15`转换，压力和密度直接读取；日期和时间转换为年内日和秒数，`day_type`明确标记为`calendar`派生字段，因为官方`.nfr`表头不单独提供日类型列。NaN、Infinity、非ASCII、缺列、重复时间和错误Zone均整体拒绝。

每次提取创建新的`extraction_id`、workspace和evidence，成功与失败均写`result-manifest.json`。原始SIM、PRJ和Phase 4 manifest保持不变。当前不提供GUI、曲线、导出、其他结果类型或直接SIM二进制解析。
