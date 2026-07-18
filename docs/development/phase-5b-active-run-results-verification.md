# Phase 5B-2最新成功运行结果验证

验证日期：2026-07-18

## 实现边界

- 新命令`extract_active_run_zone_air_state`只接受`request_id`、`project_session_id`和`zone_number`，不接受任何路径、`run_id`或完整运行对象，也不打开原生对话框。
- Rust从内存`ActiveRunContext`取得最新成功manifest，验证项目session、源SHA-256、`run_id`和规范化路径`<app-local-data>/runs/<run_id>/evidence/manifest.json`。
- 活动运行入口和手动清单入口复用同一个`extract_zone_air_state`Python操作、45秒桥超时及严格结果验证；活动入口额外要求返回`run_id`匹配，并在返回WebView前复核活动项目和运行仍是本次上下文。
- React对活动运行直接进入`loading`；手动入口继续使用`selecting → loading`。新请求使旧响应和旧阶段事件失效。
- 新成功运行不会自动提取或替换旧表格。旧结果与最新成功`run_id`不同时显示非错误过期提示；手动清单入口始终保留。

## 自动验证

- Python：266项通过；Ruff通过。Python领域代码未修改。
- Rust：18项通过；`cargo fmt --check`和`cargo check`通过。覆盖活动运行上下文路径/身份拒绝、返回`run_id`绑定、无dialog、共享验证、显式ACL和45秒超时。
- 前端：48项通过；生产构建通过。覆盖活动/手动来源状态、旧请求保护、过期判断、双入口、安全API参数和中英文文案。
- Markdown相对链接、JSON解析和`git diff --check`通过。

## 非GUI真实闭环

使用官方`test_GetPrjInfo.prj`、NIST官方ContamX 3.4.0.3和同包SimRead，在`F:\Codex_File\CONTAM-Studio\phase-5b-active-run-results`执行：

```text
run_contamx
→ 成功Phase 4 manifest与非空SIM
→ extract_zone_air_state（Zone 1）
→ run_id严格一致
```

- `run_id`：`20260718T131406Z-77fb5182`
- 状态：`succeeded`；退出码0
- 主要结果：1个非空SIM，545892字节
- 提取返回相同`run_id`，Zone 1名称为`One`，样本数577
- 首样本：293.15 K、-1.4222 Pa、1.2041 kg/m³，`day_type=null`，累计时间0秒
- 再次提取前后源PRJ、Phase 4 manifest和SIM的SHA-256及大小完全一致

临时运行、SIM、NFR/XRF和结果manifest只位于`F:\Codex_File`，不会提交仓库。

## 手动GUI验收

状态：`passed`。

本任务未使用Computer Use、未自动操作Tauri窗口，也未生成新截图。用户在真实Tauri窗口确认：最新运行入口不打开清单选择器；Zone 1和Zone 2均显示577个样本且`run_id`匹配；手动较早清单显示过期提示；重新加载最新运行后提示消失；手动取消保留结果；项目切换清除运行与结果；中英文和双主题正常。验收证据见[PR #12评论](https://github.com/summer521521/CONTAM-Studio/pull/12#issuecomment-5011558413)。

## 未实现

不包括运行结束后自动提取、运行历史、磁盘扫描、运行取消、曲线、导出、多Zone或多运行比较、其他结果类型、设置页、AI或长期sidecar。
