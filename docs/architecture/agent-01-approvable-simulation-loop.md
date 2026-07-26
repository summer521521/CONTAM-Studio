# AGENT-01受限可审批仿真闭环

## 范围

AGENT-01只支持已打开项目中的一个Zone体积目标。计划必须同时包含单个Zone、有限正体积、运行意图和温度/压力分析意图。它只允许以下顺序固定的动作：

1. `replace_zone_volume(zone_id,new_volume_token)`
2. `run_current_revision`
3. `analyze_active_zone_result(zone_id)`

任何缺少参数的请求返回`needs_input`；完整PRJ、多个Zone、多参数、附件、路径、Shell、原始PRJ和动作JSON注入返回`unsupported`。计划和动作均使用封闭字段集合，未知字段失败关闭。

## 批准与执行

Rust保存就绪计划并在批准时生成`action_bundle.v1`SHA-256。该哈希绑定项目session、Revision、Zone、完整计划、批准时刻和15分钟期限。批准只能领取一次；过期、重放、项目/Revision/源哈希/Zone变化或并发执行均拒绝。

已领取的操作只复用既有领域函数：先创建不可变草稿Revision，再运行已验证身份的官方ContamX，随后以官方SimRead读取`zone_air_state`，最后生成仅包含统计与限制的安全分析输入。任一步失败都会停止后续步骤，保留已创建草稿与上一份可信结果，且不会制造结果或远程AI回答。原始PRJ保持不写入。

## 前端与AI边界

React只调用`prepare_simulation_plan`和`approve_and_run_simulation_plan`，显示安全Diff和Rust返回的固定时间线；它不拥有执行状态机。只读AI模式仍使用Phase 6A的独立、用户主动配置App Server流程。AGENT-01不把Shell、路径、通用文件系统、动态MCP或直接Tauri命令交给AI，也不在未配置联网AI时伪造模型分析。

## 自动证据

Rust、前端、Python和命令权限契约测试覆盖封闭Schema、拒绝、批准失效、顺序、失败和迟到响应。真实非GUIfixture闭环使用官方ContamX `3.4.0.3`和SimRead `3.4.0.3`，获得成功运行与`zone_air_state`提取；源fixture SHA-256为`CE37F7BFB7F95AC49BABB117E49A22BBBA5DA7694491060B3166554EFCCCD96E`，执行后仍与基线字节和目录树一致。真实GUI、键盘、主题、窄窗口、安装和发布验证不在本证据范围内。
