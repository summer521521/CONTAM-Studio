# FND-03 CI工作流解析与供应链修复

```yaml
task_id: FND-03
phase: Wave 0
checkpoint: 03
title: 修复CI工作流受限解析器与供应链门禁
status: automated_verified
record_origin: live
started_at_utc: 2026-07-23T09:02:27.1069462Z
ended_at_utc: 2026-07-23T10:05:33.1898205Z
duration_seconds: 3786
base_commit: aa09c38c983d8a471caa3288b0a78b4509c708a1
branch: codex/contam-studio-v1-complete
task_source: CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md
task_summary: 以无新增依赖的受限YAML语法解析替换脆弱源码匹配，对未知形式和供应链漂移失败关闭。
goals:
  - 覆盖bare、quoted、anchored、aliased、commented和malformed uses键。
  - 拒绝隐藏可变引用、评论中的伪Full、权限/Action/runner/timeout漂移。
  - 每种变异均断言非零退出和预期诊断类别，实际工作流仅声明本地合同通过。
allowed_scope:
  - scripts/tests/test-windows-ci-contract.ps1及其变异自测、scripts/verify.ps1、缺陷账本、任务日志和索引。
forbidden_scope:
  - 工作流权限扩大、新Action/依赖、真实托管CI、发布、用户文件和原工作区。
validation:
  - 本地受限工作流合同通过：当前bare uses工作流只使用允许的语法、结构、权限、Action SHA、runner、timeout和Full入口。
  - 变异自测通过12项：quoted key/value、anchor、alias、commented、malformed uses、隐藏可变ref、评论伪Full、权限、Action、runner、timeout漂移均以非零退出和预期诊断类别失败。
  - Full通过30项检查：Python 278 passed；前端145 passed；Rust 77 passed、1 ignored；构建、Clippy、Cargo check、Windows CI合同、账本检查及其变异检查通过。
  - git diff --check通过。
delivery_status: automated_verified
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 本卡只验证本地工作流合同，不把本地静态检查写成GitHub托管CI证据。新增语法限制不引入YAML或运行时依赖；解释性环境、真实托管CI、发布和用户数据均未执行。
```
