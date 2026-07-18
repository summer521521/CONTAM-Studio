# Phase 4B-1自动验证记录

验证日期：2026-07-18

## 状态

- 自动验证：已完成
- 非GUI真实运行：已完成
- 手动GUI验收：`passed`

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

## GUI验收结果

用户已在真实Tauri窗口验证顶部运行按钮、成功摘要、重复运行、项目切换、缺少配置、中英文和双主题。缺少求解器配置时稳定显示结构化错误；正确设置`CONTAM_STUDIO_CONTAMX`后运行成功；切换到另一项目后旧运行摘要清除。验收证据见[PR #11评论](https://github.com/summer521521/CONTAM-Studio/pull/11#issuecomment-5011099169)。该验收不改变原任务时间、自动测试数量或Token记录。
