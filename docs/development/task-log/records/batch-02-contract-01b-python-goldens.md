# BATCH-02 CONTRACT-01B Python黄金桥接测试

```yaml
task_id: batch-02-contract-01b
phase: CONTRACT-01
checkpoint: 09
title: 用真实Python桥生成五操作Envelope并与黄金JSON比较
status: completed
record_origin: live
started_at_utc: 2026-07-22T08:55:47.2292165Z
ended_at_utc: 2026-07-22T09:01:21.2576222Z
duration_seconds: 334
base_commit: b6dfe83
branch: main
task_source: 当前用户BATCH-02指令
task_summary: 为Read、Plan、Apply、Run和Result增加路径规范化、真实桥生成和确定性mock黄金测试。
goals:
  - Read/Plan/Apply使用已跟踪PRJ和pytest临时目录。
  - Run/Result用确定性dataclass和mock，不启动官方工具。
  - 黄金比较不能把夹具读取结果与自身比较。
allowed_scope:
  - python/tests/test_bridge_contract_goldens.py
  - contracts/python-rust-bridge/v1.2/操作黄金JSON
  - 本卡任务日志、任务书和Full记录
forbidden_scope:
  - 官方ContamX/SimRead执行、新依赖、协议行为、后端、权限、GUI和Cargo文件
  - 原工作区、用户PRJ/CSV、全局环境和凭据
validation:
  - "powershell.exe -NoProfile -File python\\.venv\\Scripts\\python.exe -m pytest python\\tests\\test_bridge_contract_goldens.py: 5 passed"
  - "Read/Plan/Apply调用已跟踪valThreeZonesWthCtm-UseApi.prj，Apply输出位于pytest tmp_path；五个Envelope按精确路径占位符与success.json相等"
  - "Run使用ContamXRunResult等确定性dataclass mock；Result使用ZoneAirStateSeries和确定性mock；未运行官方工具"
  - "powershell.exe -NoProfile -File scripts\\verify.ps1 -Mode Full: 26 checks passed; Python 271 passed; frontend 153 passed; Rust 75 passed, 1 ignored; Clippy/build/toolchain/Windows CI contract passed"
delivery_status: completed
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes: 仅使用仓库已跟踪PRJ；黄金比较使用真实handle_request生成Envelope，未把读取黄金夹具当作生产输入。
```
