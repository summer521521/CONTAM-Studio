# 工具链基线

QA-01在2026-07-22记录当前Windows x64开发基线，机器可读版本见[toolchain-baseline.json](toolchain-baseline.json)。版本基线用于在验证入口中尽早发现解释器、包管理器和Rust工具链漂移；脚本不会自动安装、升级或修改任何工具。

| 工具 | 基线 |
| --- | --- |
| 项目Python | `python/.venv/Scripts/python.exe`，Python 3.12.10 |
| Node.js | 24.13.0 |
| pnpm | 11.14.0 |
| rustc/cargo | 1.97.1 |
| Rust host toolchain | `stable-x86_64-pc-windows-msvc` |
| 锁文件 | `pnpm-lock.yaml`、`src-tauri/Cargo.lock` |

## 统一入口

从仓库根目录执行：

```powershell
powershell -NoProfile -File scripts\verify.ps1 -Mode Docs
powershell -NoProfile -File scripts\verify.ps1 -Mode Fast
powershell -NoProfile -File scripts\verify.ps1 -Mode Full
```

- `Docs`：只读取Git已跟踪的JSON和Markdown，检查相对链接、锁文件和工作树差异。
- `Fast`：增加工具链版本、Python测试与Ruff、前端测试和Rust测试。
- `Full`：在`Fast`基础上增加前端生产构建、Rust格式检查和Cargo检查。

入口只使用已跟踪路径或项目约定的工具目录，不枚举或读取未跟踪用户文件；不执行`pnpm install`、pip安装、工具链安装或Clippy检查。任何子检查失败都会返回非零，并保留具体检查名称。
