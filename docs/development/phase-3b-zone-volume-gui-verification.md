# Phase 3B Zone体积桌面闭环验证

## 范围

本切片把Phase 3A-0的`volume_m3` Patch接入Tauri桌面：选择真实Zone、输入新数字记号、生成单行Diff、人工确认、原生“另存为新副本”、应用后重读并切换到副本。它不提供“保存当前项目”，不覆盖源PRJ，也不支持其他字段、多个Patch、撤销、稳定UUID、ContamX或AI。

## 边界验证

- 前端计划参数只有`request_id`、`project_session_id`、CONTAM Zone编号和新记号；应用参数只有`request_id`、session和`patch_id`。
- 源路径来自Rust活动项目，输出路径来自Rust原生保存对话框，完整Patch只保存在Rust内存。前端审阅类型不含路径、字节范围或完整前置条件。
- 打开、计划和应用通过原子门闩串行化；session或Patch不匹配时整体拒绝。Rust不会在等待对话框或Python时持有普通状态锁。
- 保存对话框取消不会启动Python并保留审阅；既有输出、非`.prj`、源路径及无效父目录均不会覆盖文件。
- Python协议`1.1`仅允许读取、计划和应用三个显式操作。计划复用`plan_zone_volume_patch`和Diff函数；应用复用`apply_zone_volume_patch_to_copy`并再次调用严格读取器。
- Rust在跨IPC前验证计划、应用和新项目契约，并清理诊断；TypeScript清理是第二道防线。前端不会接收Python原始message、Traceback、命令或未批准context。
- 读取和计划超时10秒，应用超时15秒；请求上限128 KiB、stdout 2 MiB、stderr 16 KiB，任意非空stderr整体失败。

## 自动检查

2026-07-18执行：

```powershell
python\.venv\Scripts\python.exe -m pytest .\python\tests
python\.venv\Scripts\python.exe -m ruff check .\python
pnpm test
pnpm build
cargo test --manifest-path src-tauri\Cargo.toml
cargo check --manifest-path src-tauri\Cargo.toml
cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
git diff --check
```

结果：Python 142项、前端28项、Rust 12项测试通过；Ruff、前端构建、Cargo检查和格式检查通过。Python测试覆盖三个官方fixture的读取回归，以及桥接计划、严格Patch解码、应用重读、哈希/大小一致性、清理失败和请求上限。Rust测试覆盖活动session、完整Patch仅宿主持有、路径/哈希/目标验证、保存取消、输出路径、显式ACL、诊断清理和真实计划/应用契约。前端测试覆盖编辑入口、原始输入、无路径请求、Diff审阅、取消、旧响应、失败保留项目、成功切换副本和可访问性。

## 实际桌面验证状态

已启动真实`pnpm tauri dev`并确认Phase 3B工作台窗口渲染；在继续原生文件选择交互时，桌面控制被用户按下`Escape`中止。因而本次未将两个官方fixture的完整人工另存闭环、保存取消、既有输出拒绝和正式审阅截图记为已验证。代码与自动测试已完成，但这些交互验收项须在后续继续验证；不得用浏览器渲染或合成图替代真实Tauri证据。

## 残余边界

- 开发期仍依赖项目`python/.venv`或显式`CONTAM_STUDIO_PYTHON`；安装包冻结尚未实现。
- session和`patch_id`只在当前进程内有效，不是稳定UUID，也不跨重启恢复。
- 当前不支持进程级主动取消、多个Patch、撤销、源文件保存或完整PRJ回写。
