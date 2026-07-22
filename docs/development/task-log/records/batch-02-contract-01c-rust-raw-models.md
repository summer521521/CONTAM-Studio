# BATCH-02 CONTRACT-01C Rust严格桥接Raw模型

```yaml
task_id: batch-02-contract-01c
phase: CONTRACT-01
checkpoint: 10
title: 用deny_unknown_fields反序列化同一Python黄金夹具
status: completed
record_origin: live
started_at_utc: 2026-07-22T09:02:53.0171485Z
ended_at_utc: 2026-07-22T09:13:03.4957369Z
duration_seconds: 610
base_commit: aad3da5
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 关闭Rust桥Envelope、结果和嵌套Raw结构的未知字段，并显式承接Python已返回但Rust不使用的证据字段。
goals:
  - 新增不含Rust zone_id的RawZoneRecord并在可信边界生成Zone UUID。
  - 为五操作黄金成功Envelope建立Rust反序列化测试。
  - 建模result_manifest_path、source_evidence和完整run manifest证据但不暴露给前端。
allowed_scope:
  - src-tauri/src/zone_bridge.rs及相邻Rust契约测试
  - contracts/python-rust-bridge/v1.2/与本卡任务日志
  - 任务书和Full记录
forbidden_scope:
  - Tauri命令、前端序列化、协议版本/错误码、依赖、Cargo文件、权限、GUI和行为重构
  - 原工作区、用户PRJ/CSV、全局环境和凭据
validation:
  - "cargo test --locked --lib python_rust_bridge_goldens_use_closed_raw_models: 1 passed"
  - "同一read/plan/apply/extract/run success.json由RawBridgeEnvelope及各Raw结果模型反序列化通过；RawZoneRecord不含zone_id"
  - "cargo test --locked --lib: 76 passed, 1 ignored"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 26 checks passed; Python 271 passed; frontend 153 passed; Rust 76 passed, 1 ignored; Clippy/build/toolchain/Windows CI contract passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: Raw证据字段仅用于Rust边界校验和夹具反序列化，保持私有，不进入Desktop响应结构；一次Full因fmt未收口，cargo fmt后最终Full通过。
```
