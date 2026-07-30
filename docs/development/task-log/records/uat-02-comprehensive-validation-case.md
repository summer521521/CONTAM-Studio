# UAT-02 综合验收案例包

```yaml
task_id: uat-02-comprehensive-validation-case
phase: UAT
title: 创建可重复使用的综合验收案例包
status: automated_verified
record_origin: live
started_at_utc: 2026-07-29T11:16:48.0185853Z
ended_at_utc: 2026-07-29T11:31:08.4572164Z
duration_seconds: 860.439
base_commit: bf5287488db0dac2e9fc7164efb6dc676e41d425
branch: main
task_source: 用户要求制作一个便于后续测试验证的全面案例
task_summary: 基于仓库内经溯源的官方CONTAM夹具，建立自包含、可重置、同时支持手工GUI验收和机器预检的综合案例包。
goals:
  - 选择一个可编辑主案例和两个只读边界案例，覆盖项目、草稿、仿真、结果、研究、附件、AI空状态、双语、无障碍与恢复路径
  - 提供机器可读清单、确定性哈希、受控附件和一键准备脚本
  - 使用项目领域读取器和聚焦测试证明案例包可复现且不修改官方源夹具
allowed_scope:
  - examples/uat/comprehensive-validation-v1、docs/uat、scripts下的案例准备与验证文件
  - docs/development/task-log对应记录与索引
  - F:\Codex_File\CONTAM-Studio\comprehensive-validation-v1下的生成案例
forbidden_scope:
  - 真实用户项目、真实AppData、Credential Manager、API Key、Cookie和真实Provider请求
  - 修改仓库内官方PRJ夹具、应用功能代码、系统设置、全局依赖或发布资产
  - 提交、推送、打标签和发布
validation:
  - 综合案例合同通过：3个源项目身份、严格读取和语义快照、3操作Patch计划、6个真实案例附件及完整SHA-256清单
  - Python附件Broker与语义Patch聚焦回归14项通过
  - 官方ContamX 3.4.0.3对三个夹具均成功退出；七Zone项目Zone 1至3由SimRead各提取577个样本
  - 三Zone结果格式复现zone_result_contract_invalid，NIST demo1c复现simread_output_missing，均作为已知诊断场景记录而非伪造通过
  - 最终外部案例包18个受校验文件全部通过SHA-256复核；任务日志合同和git diff --check通过
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - 最终案例位于F:\Codex_File\CONTAM-Studio\comprehensive-validation-v1\baseline-v1-20260729，绑定源提交bf5287488db0dac2e9fc7164efb6dc676e41d425。
  - 未读取真实凭据、真实Provider或真实用户AppData；未修改仓库官方PRJ；未提交、推送、打标签或发布。
  - 本任务完成的是案例构建和自动预检，完整桌面GUI案例执行仍为pending_user。
```
