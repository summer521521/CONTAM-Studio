# Windows CI工具链与Action边界

本文件只记录`Windows CI / Full verification`所需的CI工具，不进入桌面运行时和打包产物。所有Action均使用工作流中的完整commit SHA；缓存只用于缩短CI安装时间，不改变产品依赖、权限或运行时身份。

| Action | 许可证 | 维护状态 | CI用途 | 桌面打包成本 |
| --- | --- | --- | --- | --- |
| `actions/checkout` | MIT | GitHub官方维护 | 获取当前checkout源码 | 0 |
| `pnpm/action-setup` | MIT | pnpm项目维护 | 提供固定pnpm版本 | 0 |
| `actions/setup-node` | MIT | GitHub官方维护 | 提供固定Node.js版本 | 0 |
| `actions/setup-python` | MIT | GitHub官方维护 | 提供固定CPython版本 | 0 |
| `dtolnay/rust-toolchain` | MIT | Rust工具链维护者维护 | 提供固定MSVC Rust及rustfmt/clippy | 0 |
| `actions/cache` | MIT | GitHub官方维护 | 只缓存pnpm、pip下载和Cargo registry/git | 0 |

允许缓存的路径只有pnpm store、runner临时目录中的pip cache、用户Cargo registry和git cache。`python/.venv`、`node_modules`、`src-tauri/target`和工作区内容不缓存。
