# R1-04 Results, Evidence & AI Experience

```yaml
task_id: r1-04-results-evidence-ai-experience
phase: Renewal R1
title: Results, Evidence & AI Experience——结果、证据与 AI 体验整合
status: completed
record_origin: live
started_at_utc: 2026-08-01T23:46:44Z
ended_at_utc: 2026-08-02T01:50:26Z
duration_seconds: 7422
base_commit: 4aa64c507ecf730b79c77aec31ae8474717c37b5
branch: main
task_source: 用户提供的 R1-04 Results, Evidence & AI Experience 完整任务书
task_summary: 在现有运行、SimRead、R1-03 视觉投影和只读 AI 边界上建立结果、空间、证据与 AI 的连续可信工作流。
goals:
  - 收口 R1-03 viewport 命令、Python/Rust 空间边界、Canvas 焦点和大型拓扑 fit 遗留项
  - 建立有界、身份绑定、可取消并支持 partial 的 zone_result_dataset.v1
  - 重构结果页为概览、时间序列、空间和证据四个科学分析表面
  - 让证据链与 AI 上下文回执复用同一事实，并保持结构化 Patch 审查边界
  - 完成无障碍、响应式、i18n、性能和自动验证收口
allowed_scope:
  - 现有 Python/Rust/desktop-api 结果读取链路的有界批量扩展及测试
  - React 结果、证据和 AI 体验拆分，复用 ECharts、Konva、语义 selection 和 Patch review
  - R1-03 总监遗留修复、R1-04 文档/合同/状态事实源及 F:\\Codex_File 临时证据
forbidden_scope:
  - 真实 Provider、凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程
  - 前端直接读取结果文件或 PRJ、AI 直接写 PRJ、伪造污染物/ACH/流量/空间几何
  - Computer Use、正式截图矩阵、提交、推送、打标签、打包、签名和发布
validation:
  - 开始基准：main、HEAD 与 origin/main 均为 4aa64c507ecf730b79c77aec31ae8474717c37b5。
  - 开始时存在 47 个已跟踪修改/删除文件和 60 个未跟踪路径；R1-01/R1-02/R1-03 累积工作树被声明为不可回退基线。
  - 完整开始记录：F:\\Codex_File\\r1-04-results-evidence-ai-experience\\baseline.md。
  - R1-03 遗留聚焦验证：viewport command sequence 对 fit/reset/zoom/locate 只消费一次，项目或 Revision 重置不重放旧命令；Canvas 只保留内部 region 一个键盘焦点所有者；大型拓扑改为确定性二维分行并保留大模型 fit 下限。
  - Python spatial 聚焦：29 项通过；Python/Rust 镜像校验 level/icon/坐标/object number/unit/计数、字符串、warning 与 8 MiB payload 边界，空间异常降级为 unavailable 而 levels/zones/flow_paths 语义读取继续成功。
  - 多 Zone/AI/Rust 聚焦通过；zone_result_dataset.v1 限制 64 Zones、250000 样本和 32 MiB payload，覆盖 success、partial、身份硬失败、取消、晚到响应、时间轴差异、确定性 fingerprint 和最后可信结果保留。
  - 前端聚焦覆盖 dataset reducer/selectors、Evidence Lineage、Context Receipt、viewport lifecycle、结果四标签页、空间结果、语义 selection 与无障碍替代路径；最终 pnpm test 退出码 0，30 个文件、244 项通过。
  - pnpm build 退出码 0；主入口 511.58 kB（R1-03 基线 493.29 kB，增加 18.29 kB），Results 28.96 kB、AI 34.18 kB、Konva 316.84 kB、ECharts 550.62 kB；ECharts 既有警告保持可见，未提高阈值。
  - Python 全量：python/.venv/Scripts/python.exe -m pytest python/tests -q，退出码 0，374 项通过；Ruff 退出码 0。
  - Rust 全量：cargo test --locked，退出码 0，137 项通过、1 项按设计忽略；cargo fmt --check、严格 Clippy -D warnings 和 cargo check 均通过。
  - R1-01/R1-02/R1-03/R1-04 合同分别通过 41/45/66/97 项断言；comprehensive-validation-v1 通过 3 个源项目、3-operation Patch 和 6 个附件；任务日志合同通过 84 份记录。
  - Full 实际共运行 5 次并全部保留证据。第 1 次退出码 1、43 项通过/3 项失败、用时 22.648 秒；第 2 次退出码 1、65 项通过/1 项失败、用时 80.150 秒；随后修正 Tauri 65 命令合同并聚焦通过。
  - 第 3 次为总监追加 Full，退出码 1、64 项通过/2 项失败；失败仅为 NIST acquisition 和 temp-root 合同。日志为 F:\\Codex_File\\r1-04-results-evidence-ai-experience\\full-verification-director-final.log。
  - R1-05 先增加 PowerShell 5.1 共享 SHA-256 实现、RUNNER_TEMP/system temp/no-F 回退和 hidden redirected-process 回归。第 4 次 closure Full 退出码 1、45 项通过/1 项失败、用时 46.026 秒；唯一失败为 Phase 6C 合同仍引用已移除的 Get-FileHash 名称，证据另存为 full-verification-closure-run-1.log。
  - 第 5 次 closure Full：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\verify.ps1 -Mode Full；退出码 0、67 项检查通过、用时 129.692 秒。最终日志为 F:\\Codex_File\\r1-04-results-evidence-ai-experience\\full-verification-closure.log，退出码证据为 full-verification-closure-exit.txt。
  - git diff --check 退出码 0；仅有 Git 的 LF/CRLF 工作树提示，无空白错误。
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed；github_windows_ci=pending_push；manual_gui=not_run；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
  - R1-04 最终自动证据已由 R1-05 开场的独立 closure Full 关闭；前三次和第一次 closure 失败均保留，未删除或改写。
  - 结果工作区通过概览、时间序列、空间和证据四个标签复用同一身份绑定数据集；缺失值不补零，压力仅在真实跨零时使用发散色带，颜色范围固定为当前可信数据集全部时刻。
  - Evidence Lineage 串联项目/Revision、输入快照、ContamX、manifest、SimRead、dataset 与 AI/导出；默认不显示绝对路径，链路不完整不显示全链已验证。
  - AI 主面板只展示 Provider/model/status、意图、Context Receipt、对话和 Patch 审查入口；API Key/Endpoint 留在设置高级区，Patch 仍只进入现有统一 review，不直接应用或写 PRJ。
  - 不升级 ContamX/SimRead 锁定版本；NIST 新版本仅记录到 R1-05 待办。
  - 参考概念图只用于信息层级判断，不复制其中模型、Zone、压力、Patch 或导航事实；本轮不进行截图验收。
  - 未读取真实凭据、Credential Manager、Cookie、WebView 数据库、真实 AppData 或用户唯一工程；未运行真实 Provider、Computer Use、截图验收、提交、推送、打标签、打包、签名或发布。
```
