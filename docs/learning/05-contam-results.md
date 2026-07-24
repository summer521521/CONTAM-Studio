# 05 ContamX 与结果

Studio 不实现求解器。运行输入必须是受控副本，ContamX/SimRead 身份、输入快照、退出状态、输出和清理证据进入 Run/Result。结果后端只传有界页，统计在确定性后端计算，比较要求 Profile、对象、单位、时间网格、解析器和计算器完全匹配。

使用 `python/tests/test_process_store_results.py` 观察 512 项分页、缺失值、min/max/mean 和 A/B delta。

问题：为什么不能为了画图偷偷插值或采样？
