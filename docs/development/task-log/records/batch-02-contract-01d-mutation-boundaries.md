# BATCH-02 CONTRACT-01D 契约变异与边界测试

```yaml
task_id: batch-02-contract-01d
phase: CONTRACT-01
checkpoint: 11
title: 覆盖桥Envelope、Schema、大小边界和诊断清理变异
status: completed
record_origin: live
started_at_utc: 2026-07-22T09:13:54.6980112Z
ended_at_utc: 2026-07-22T09:19:36.0736073Z
duration_seconds: 341
base_commit: fcb3f62
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 增加动态未知字段、协议/领域Schema错配、请求和流边界及安全诊断清理测试。
goals:
  - 覆盖Envelope、结果和深层嵌套未知字段拒绝。
  - 覆盖五操作请求大小、stdout/stderr上限和协议/领域Schema错配。
  - 证明诊断清理不会把路径、凭据或未允许上下文暴露给WebView。
allowed_scope:
  - src-tauri/src/zone_bridge.rs测试
  - python/tests/test_bridge_contract_mutations.py
  - 本卡任务日志、任务书和Full记录
forbidden_scope:
  - 生产协议字段、命令名、错误码、超时、依赖、Cargo文件、权限、GUI和官方工具执行
  - 原工作区、用户PRJ/CSV、全局环境和凭据
validation:
  - "python\\.venv\\Scripts\\python.exe -m pytest python\\tests\\test_bridge_contract_mutations.py: 7 passed；五操作请求精确上限及超1字节、协议/领域Schema错配和诊断清理通过"
  - "cargo test --locked --lib contract_mutations_reject_unknown_fields_at_every_depth_and_stream_limits: 1 passed；Envelope、result、深层字段和stdout/stderr边界通过"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 26 checks passed; Python 278 passed; frontend 153 passed; Rust 77 passed, 1 ignored; Clippy/build/toolchain/Windows CI contract passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 只通过内存Value、已跟踪夹具和pytest临时对象制造变异，不运行官方工具；一次Full因Rust格式未收口，cargo fmt后最终Full通过。
```
