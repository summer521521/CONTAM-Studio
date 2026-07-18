# SimRead结果提取边界

Phase 5A的结果入口必须是Phase 4成功运行清单，而不是用户任意指定的SIM文件。提取器先校验运行状态、PRJ/SIM哈希、求解器身份和安全相对路径，再把PRJ与SIM复制到全新的后处理工作区。

SimRead使用NIST官方`simread.exe` 3.4.0.3。调用采用参数数组、`shell=False`、独立工作目录和固定stdin契约：默认日期、关闭污染物节点结果、开启节点流结果、选择一个节点、关闭链路结果。工具在工作区生成文本结果；Phase 5A只解析节点结果`.nfr`，不修改Phase 4运行目录。

首个结果类型为`zone_air_state`，严格表头为`Date`, `Time`, `Node`, `T (C)`, `P (Pa)`, `D (kg/m3)`。温度按确定性公式`K=C+273.15`转换，压力和密度直接读取；日期和时间转换为年内日和从首个样本起算的累计秒数。官方`.nfr`不提供CONTAM真实日类型，因此`day_type`固定为`null`，并以`day_type_source=not_available_in_simread_nfr_v1`说明，不推断工作日、周末或schedule day type。NaN、Infinity、非ASCII、缺列、重复时间和错误Zone均整体拒绝。

每次提取创建新的`extraction_id`、workspace和evidence。工作区创建后，无论SimRead进程失败还是严格解析失败，都通过同一result-manifest结构保留命令、进程状态、stdout/stderr和已生成物证据；工作区创建前的manifest、路径和配置拒绝不会伪造提取清单。原始SIM、PRJ和Phase 4 manifest保持不变。该Python提取层自身不实现GUI、曲线或导出；Phase 5B/5C只消费其严格结果。其他结果类型和直接SIM二进制解析仍未实现。
# Phase 5A加固边界

Phase 4运行清单由同一份完整bytes读取、UTF-8解码、JSON解析并计算SHA-256。提取开始、复制后、SimRead启动前、SimRead完成后和写入结果清单前都会复核manifest、PRJ和SIM证据；任何变化整体失败。

Phase 4求解器身份必须完整匹配`contamx3.exe`、3.4.0.3、Windows x64、1605120字节和已验证SHA-256，且来源必须为NIST官方包。PRJ和SIM是提取输入快照，不是SimRead生成物；`generated_outputs`只记录`.nfr`、`.xrf`等实际生成文件。

工作区创建后，成功和失败使用同一`ResultExtractionManifest`模型，记录命令语义、进程是否启动、stdin写入、退出码、超时、终止请求与退出确认、stdout/stderr捕获状态和生成物哈希。wait异常、超时、stdin或流失败均进入有界的terminate→wait→kill→wait收口流程；随后关闭父进程stdin/stdout/stderr并进行二次join。`termination_succeeded`只有在确认退出后才为真，流线程未结束时`capture_complete=false`；`stream_evidence_frozen`只表示本进程不会继续写流证据，不能替代`exit_confirmed`。不存在的Zone在启动SimRead前拒绝，并写入`process_started=false`的失败清单；SimRead解析失败仍保留已生成文本与流证据。工作区创建前的拒绝没有可审计工作区，因此不写result-manifest。

写入成功或失败清单前都执行统一最终证据复核，分别记录Phase 4 manifest、Phase 4 PRJ/SIM、提取工作区PRJ/SIM和SimRead二进制是否保持不变；证据变化会导致失败，但不会丢失已创建工作区中的失败清单。只有确认SimRead退出时，`generated_outputs_stable=true`，生成物才写入最终`sha256`和`size_bytes`；无法确认退出时生成物使用`stable=false`及空哈希/大小表示manifest创建时的非稳定快照。

公开CLI只有`probe-simread`和以Phase 4 manifest为第一个参数的`extract`，不接受直接NFR或SIM。`day_type`在当前模型中返回`null`，并以`day_type_source=not_available_in_simread_nfr_v1`说明官方NFR未提供CONTAM日类型；不推断工作日、周末或schedule day type。`sim_time_seconds`是从首个样本起算的累计秒数。
