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

## 实际桌面验证

2026-07-18在分支`codex/phase-3b-zone-volume-gui`、提交`07ee579`上启动真实`pnpm tauri dev`，通过独立Tauri窗口和Windows原生打开/保存对话框完成验证。开发终端未出现未处理前端错误、Rust panic或Python Traceback。

### Fixture 1

- 源文件：`fixtures/contam/official-contamxpy/test_GetPrjInfo.prj`。
- 初始及最终证据：SHA-256为`CE37F7BFB7F95AC49BABB117E49A22BBBA5DA7694491060B3166554EFCCCD96E`，大小为10978字节，最后修改时间为`2026-07-17 06:54:40 UTC`；三项均未变化。
- 实际加载7个Zone；Zone 1为`One`，原体积为`600`，源行号为243。
- 输入`650.0`后，审阅界面显示旧记号`600`、新记号`650.0`及目标Zone单行Diff。返回修改后原始输入保持；修改输入会使旧计划失效。取消修改后项目仍指向源文件，体积仍为600，未创建输出。
- 在原生保存对话框中取消后，审阅界面和Patch计划均保留，未创建文件且未显示错误。再次另存为`test_GetPrjInfo-zone1-650.prj`后，GUI自动切换至新副本，仍显示7个Zone并保持`One`选中，体积为650，成功提示明确说明源PRJ未修改。
- 创建既有文件`existing-output.prj`并记录哈希后，在Windows替换确认中选择该路径；应用返回稳定错误`patch_output_exists`，既有文件仍为17字节且SHA-256仍为`8C8B0A5FFB00B2C3D8A671A1F3ECFAC98666E6B1422ED1492C8BEC084BAB8A8B`，未发生覆盖。

### Fixture 2

- 源文件：`fixtures/contam/official-nist-tutorials/demo1c.prj`。
- 初始及最终证据：SHA-256为`1E2623D8904C0D37F0EB207099782AD2C1895DBA4032E0511B9C8A188748F406`，大小为7668字节，最后修改时间为`2026-07-17 15:00:29 UTC`；三项均未变化。
- 实际加载7个Zone；Zone 1为`Attic`，原体积为`90`，源行号为179。
- 输入`95.5`并审阅单行Diff后，另存为`demo1c-attic-95.5.prj`。GUI自动切换到新副本，仍显示7个Zone并保持`Attic`选中，体积为95.5。

### 字节与生成物

- 两个输出副本均通过严格读取器重读。按Phase 3A记录的目标字节范围验证，输出字节严格等于“源前缀+新Vol记号+源后缀”，仅目标体积记号变化。
- 测试输出目录及仓库fixture目录未产生`.sim`、`.log`或`.xlog`。
- Windows原生保存对话框取消、取消审阅和既有输出拒绝均未产生伪装成功的副本。

### 国际化、主题与截图

- 在Diff审阅状态分别验证简体中文/英文、浅色/深色四种组合；切换期间Patch状态未丢失，按钮、旧值、新值和Diff未截断或遮挡，审阅区保持可操作。
- [Diff审阅截图](../ui/phase-3b-zone-volume-diff-review.png)：1443x931，真实PNG，包含Tauri标题栏、Zone、旧/新记号、单行Diff、另存为按钮和源文件保护提示。
- [副本创建成功截图](../ui/phase-3b-zone-volume-copy-success.png)：1443x931，真实PNG，包含Tauri标题栏、新副本文件名、`One`、体积650和成功提示。
- 截图来自实际Tauri窗口捕获，仅转换为PNG容器，未合成界面内容，也未显示测试目录的完整路径。

本次桌面验证未发现需要修改代码的问题，仅新增正式截图并更新验证记录。

## 残余边界

- 开发期仍依赖项目`python/.venv`或显式`CONTAM_STUDIO_PYTHON`；安装包冻结尚未实现。
- session和`patch_id`只在当前进程内有效，不是稳定UUID，也不跨重启恢复。
- 当前不支持进程级主动取消、多个Patch、撤销、源文件保存或完整PRJ回写。
