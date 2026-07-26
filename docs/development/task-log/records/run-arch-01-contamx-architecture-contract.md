# RUN-ARCH-01：ContamX架构契约修复

```yaml
task_id: RUN-ARCH-01
phase: Runtime
title: 修复ContamX成功运行被桌面架构契约拒绝
status: completed
record_origin: live
started_at_utc: 2026-07-24T13:49:03.2902746Z
ended_at_utc: 2026-07-26T03:23:16.2613366Z
duration_seconds: 135252.971
base_commit: 99825d5012c69f933cc95e72ebe44fc2b7276192
branch: main
task_source: 用户真实桌面运行失败截图与应用生成的运行manifest
task_summary: 对齐Python生产运行器的windows-x64身份与Rust桌面验证器，增加跨层黄金和拒绝旧错误值的回归测试。
goals:
  - 接受经过生产运行器验证的windows-x64 ContamX 3.4.0.3成功证据。
  - 拒绝旧的x86契约值，防止黄金夹具再次掩盖跨层漂移。
  - 使用仓库fixture验证真实ContamX运行，不修改用户项目。
allowed_scope:
  - Rust运行响应验证、Python/Rust黄金、定向测试、任务日志和必要状态文档。
forbidden_scope:
  - 用户PRJ/CSV/SIM、凭据、全局环境、工具二进制、系统配置和发布。
validation:
  - Rust定向测试、Python桥黄金、真实仓库fixture运行、Full和git diff --check。
delivery_status: ready_for_main
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 截图对应运行实际exit_code=0且生成非空SIM；失败发生在Rust把windows-x64误写为x86的后置契约校验。耗时包含用户跨任务回合的暂停时间；用户已明确确认修复后GUI验收成功。
```

## Evidence

- 应用生成manifest：solver.version=`3.4.0.3`、architecture=`windows-x64`、exit_code=`0`、source.unchanged=`true`。
- 生成SIM大小为545892字节；桌面返回`run_response_contract_invalid`。

## Resolution

- Rust生产验证器、Rust测试夹具、Python桥黄金和跨语言JSON黄金统一使用`windows-x64`。
- 新增负例确认旧`x86`值失败关闭，避免错误黄金再次掩盖生产漂移。
- 真实生产Python桥使用官方ContamX和仓库fixture成功：1个SIM、exit_code=0、源PRJ未变化。
- 用户确认修复后的真实桌面GUI验收成功。
- 最终Full一次通过54项：Python321、前端150、Rust86 passed/1 ignored；Ruff、Clippy、构建、格式、Docs、契约和`git diff --check`通过。
