# Phase 2C开发与验证

记录日期：2026-07-18。

## 开发运行

Phase 2C要求项目Python虚拟环境和桌面工具链同时可用：

```powershell
py -3.12 -m venv python\.venv
python\.venv\Scripts\python.exe -m pip install -e ".\python[dev]"
pnpm install
pnpm tauri dev
```

开发运行时可设置`CONTAM_STUDIO_PYTHON`为经过项目验证的绝对解释器路径。未设置时只使用`python/.venv/Scripts/python.exe`；不要依赖全局Python或PATH别名。

## 自动检查

```powershell
python\.venv\Scripts\python.exe -m pytest .\python\tests
python\.venv\Scripts\python.exe -m ruff check .\python
pnpm test
pnpm build
cargo test --manifest-path .\src-tauri\Cargo.toml
cargo check --manifest-path .\src-tauri\Cargo.toml
git diff --check
```

本次结果：Python 77项通过，Ruff通过；Vitest 11项通过，前端构建通过；Cargo 15项通过，Cargo检查通过。MSVC链接器输出了一条本地化的导入库创建提示，未影响测试或构建。

## 官方fixture

| 文件 | GUI Zone数 | 首个Zone | SHA-256 | 大小 |
|---|---:|---|---|---:|
| `official-contamxpy/test_GetPrjInfo.prj` | 7 | `One` | `ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e` | 10978 |
| `official-contamxpy/valThreeZonesWthCtm-UseApi.prj` | 3 | `one` | `1cafb2f0fef511f19ef88358238a1c1175c593187691ff7545db982f5e6e75ed` | 9932 |
| `official-nist-tutorials/demo1c.prj` | 7 | `Attic` | `1e2623d8904c0d37f0eb207099782ad2c1895dba4032e0511b9c8a188748f406` | 7668 |

三个文件均通过真实Tauri原生文件选择器打开。测试前后Git没有记录fixture修改或新增文件，目录下没有SIM、LOG或XLOG结果文件。

## 桌面手动验证

- 实际启动`pnpm tauri dev`并确认Tauri窗口不是白屏，工作台布局完整。
- 依次打开三份官方fixture，核对全部Zone、首个Zone、文件头、源大小、哈希缩略值及属性检查器。
- 切换任意Zone后，名称、CONTAM编号、flags、楼层、相对高度、体积和源行号同步更新。
- 原生文件选择取消后不显示错误，已加载项目保持不变。
- 新项目加载失败时保留上一个成功项目，同时问题面板显示稳定错误码；首次失败保持欢迎页。
- 简体中文、英文、浅色和深色主题均在真实项目状态下验证，布局没有白屏或明显溢出。
- 正式截图`docs/ui/phase-2c-real-zone-project.png`来自实际浅色Tauri窗口，文件签名为PNG，尺寸1443×931。

## 异常输入

临时输入和诊断位于`F:/Codex_File/CONTAM-Studio/phase-2c-zone-gui-integration/`，不提交到仓库。已验证：

| 输入 | 结果码 |
|---|---|
| 未知`3.4.0.8`文件头 | `unsupported_prj_version` |
| 非ASCII字节 | `non_ascii_prj` |
| 缺少Zone区块 | `zone_section_not_found` |
| 超长整数 | `invalid_zone_field` |
| `NaN`、`Infinity`、十六进制浮点、超大科学计数法 | `invalid_zone_field` |
| 非法桥接JSON | `bridge_request_invalid_json` |

每个Python桥响应均只有一行JSON，stderr为空，不包含Traceback。Rust单元测试另行模拟并验证错误解释器路径、进程启动失败、非零退出、超时、无效UTF-8、无效JSON、协议/请求不匹配、stdout/stderr超限和诊断截断；这些错误均不会触发Rust panic或返回内部命令。

## 当前验证边界

- 没有验证安装包内Python冻结、签名、升级或卸载。
- 没有验证完整PRJ、其他区块、保存、回写、Zone编辑或稳定UUID。
- 没有接入contamxpy、ContamX、仿真运行、结果读取或AI。
- 一次性进程是故障和生命周期边界，不是权限沙箱；当前入口只适用于用户信任但可能损坏、不完整或版本不兼容的项目。
