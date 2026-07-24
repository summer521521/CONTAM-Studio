# ADR-012：Controlled Process Lifecycle

## 状态

`candidate_for_h_final`。Revision 2允许在候选版本中先实现；H-FINAL复核整体政策，不在单卡前阻断实现。

## 决策

所有由Studio控制的外部进程使用同一生命周期语义。适配器可以拒绝不具备所需生命周期能力的工具，但不得绕过控制器或回退到全局进程命令。

### Windows Job Object

- 每个操作创建独立Job Object，并启用`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`。
- 子进程以suspended状态创建，先以`AssignProcessToJobObject`归属，再ResumeThread；任一步失败都关闭Job并返回`process_ownership_failed`。
- Python worker、ContamX、SimRead和Codex App Server均使用该控制器；不使用`taskkill`、名称匹配或全局进程枚举。
- Job句柄由控制器独占；关闭、取消、超时和应用退出都先终止Job，再等待退出确认。没有退出确认时状态只能是`unknown_cleanup`，不能写可信成功或已清理。

### Deadline and streams

- 每个操作只生成一个单调时钟绝对deadline；启动、stdin、等待、terminate/kill、stdout/stderr排空和线程join共享同一预算。
- 总预算由操作配置决定：Zone bridge 45秒、ContamX 75秒、SimRead 45秒、Codex App Server 180秒安装/90秒Turn；不得通过单独重置子步骤延长总预算。
- 控制器预留`max(1秒,min(10秒,total_budget/4))`作为收口预算。进入收口后不再接受业务结果。
- stdout和stderr并发排空，每个流最多4 MiB；超出继续排空但标记截断。stdin写入、流线程和Job退出都必须在剩余预算内完成。

### Public status and evidence

公开状态固定为：`queued`、`starting`、`running`、`cancel_requested`、`succeeded`、`failed`、`timed_out`、`cancelled`、`unknown_cleanup`。

- `succeeded`要求退出码、Job退出、两个流冻结、输入/输出证据和后置验证全部成立。
- `timed_out`要求达到deadline且Job终止已确认；未确认时改为`unknown_cleanup`。
- `cancelled`只有在用户取消被记录且Job/子进程退出已确认时成立；否则为`unknown_cleanup`。
- 每次操作记录operation_id、工具身份、启动/结束时间、预算、PID证明、Job归属证明、退出码、超时/取消请求、流摘要和artifact引用；绝对路径只留在Rust内部。
- 迟到结果按operation_id和生命周期代际丢弃，不得发布到活动项目或结果Store。

### Compatibility and dependency

优先使用锁定Tauri树已存在的`windows-sys`系列，以最小`Win32_Foundation`、`Win32_System_JobObjects`和`Win32_System_Threading` feature直接声明；许可证记录为`MIT OR Apache-2.0`，不安装全局依赖。若目标工具不支持Job归属，保持该工具禁用并报告可操作诊断。

## 验收边界

自动化候选必须覆盖：睡眠子进程/孙进程、持有管道、超时、主动取消、启动失败、Job归属失败、迟到结果和应用退出。真实ContamX、Codex和GUI体验仍标记`pending_final_acceptance`，不能用模拟结果冒充。
