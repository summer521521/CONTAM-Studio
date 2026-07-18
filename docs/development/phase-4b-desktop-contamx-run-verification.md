# Phase 4B-1自动验证记录

验证日期：2026-07-18

## 状态

- 自动验证：已完成
- 非GUI真实运行：已完成
- 手动GUI验收：`pending_user`

## 自动边界

- Python直接覆盖活动项目路径/SHA-256绑定、probe前拒绝、正常/超时/wait错误/terminate/kill/阻塞流收口、无法确认退出时不写可信manifest及桥接Envelope。
- Rust覆盖显式ACL、75秒运行桥超时、运行响应身份/路径/SIM契约、安全WebView视图以及活动运行上下文清除与失败保留。
- 前端覆盖只含request/session的桌面API、运行状态旧响应保护、项目切换清理、失败保留旧摘要和中英文安全摘要。

完整检查结果以本分支任务日志和Draft PR为准。

- Python：266项通过；Ruff通过
- Rust：15项通过；`cargo fmt --check`和`cargo check`通过
- 前端：44项通过；生产构建通过
- Markdown相对链接、JSON文档和`git diff --check`通过

## 非GUI真实运行

使用NIST官方`contamx3.exe` 3.4.0.3和官方`test_GetPrjInfo.prj`调用新增`run_active_project`桥操作：

- `run_id`：`20260718T105334Z-e7b1bf40`
- 状态：`succeeded`
- 退出码：0；未超时
- 主要结果：1个非空SIM，545892字节
- Phase 5A `_validate_phase4_manifest`接受该manifest
- 源PRJ SHA-256、大小和源目录直接项清单前后不变
- 运行证据只保存在`F:\Codex_File`任务目录，未提交仓库

## GUI验收边界

Codex未使用Computer Use，也未声称完成真实桌面手动验收。用户需按交付报告中的清单验证顶部运行按钮、运行中状态、安全摘要、重复运行、项目切换、缺少配置、中英文和双主题。
