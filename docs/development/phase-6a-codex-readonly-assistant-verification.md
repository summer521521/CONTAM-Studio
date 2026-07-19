# Phase 6A Codex只读AI助手验证

验证日期：2026-07-19。

## 实现边界

- 用户点击连接前不发现账号、不启动App Server，也不发起模型请求。
- Rust通过显式路径或当前`PATH`发现Codex，以参数数组执行`--version`和`app-server --stdio`；不使用Shell，不扫描`.codex`，不读取认证文件。
- App Server工作目录位于应用本地数据的空AI目录，不是项目、草稿、运行、结果或仓库目录。
- 上下文只从Rust活动状态生成；默认披露当前Zone和草稿摘要，不含路径、PRJ正文、日志、manifest、SIM或完整577条样本。
- Thread要求`read-only`沙箱、`never`审批、空MCP/动态工具/环境/能力根；工具事件触发中断并丢弃回答。
- 回答必须符合关闭且有界的四字段JSON Schema；原始模型文本、推理、RPC和stderr不进入WebView。

## 自动验证

- Rust：`51 passed, 1 ignored`；`cargo fmt --check`和`cargo check`通过。测试覆盖CLI发现与可执行文件身份复核、账号和模型清理、JSONL限制、只读Thread/Turn参数、上下文绑定、预览失效、结构化回答、旧Turn、工具/审批拦截、停止和连接清理。
- 前端：Vitest `11 files, 112 tests passed`；TypeScript和Vite生产构建通过。测试覆盖不自动连接、未安装/未登录状态、模型和推理强度、范围选择、Rust预览、过期保护、生成/停止、结构化分区、双语及安全桌面API。
- Python：`266 passed`；Ruff通过。AI没有增加Python文件读取接口，既有Zone、Patch、ContamX、SimRead和结果回归保持通过。
- 通用：58个Markdown文件相对链接、8个已跟踪JSON、pnpm与Cargo锁、依赖清单和`git diff --check`通过。Phase 6A没有新增依赖。

## 真实Codex探测

当前机器的`PATH`解析到Microsoft Store版Codex桌面应用内的`codex.exe`，但普通桌面进程直接执行该WindowsApps文件时返回`Access is denied`。因此本次能够真实确认发现结果，但不能取得可靠的CLI `--version`，也不能继续完成真实`initialize`、`account/read`、`model/list`、只读Thread、Turn或`turn/interrupt`验证。

本任务未提升权限、未复制WindowsApps二进制、未修改`PATH`、未设置`CONTAM_STUDIO_CODEX`、未读取`.codex`、未发起登录，也未把桌面应用包版本冒充CLI版本。用户可在手动GUI验收前把`CONTAM_STUDIO_CODEX`指向一个普通权限可执行的绝对`codex.exe`，或把官方CLI放入当前进程`PATH`后重新检测。

因此真实Codex集成状态为`blocked_by_local_codex_executable_acl`；Fake App Server和单元测试不能替代真实网络验证。AI不可用不影响项目、草稿、运行、结果与CSV能力。

## Phase 3C收口

用户已完成Phase 3C全部31项真实GUI验收，包括修复后的草稿另存成功、拒绝覆盖和取消保留草稿。证据见[PR #14最终验收评论](https://github.com/summer521521/CONTAM-Studio/pull/14#issuecomment-5013736336)。Phase 3C状态已改为`passed`，历史任务时间、耗时和Token字段未变。

## 手动GUI状态

`pending_user`。真实AI步骤依赖普通权限可执行且已登录的Codex CLI、网络及可用订阅额度；不得把当前ACL阻塞写成已通过。
