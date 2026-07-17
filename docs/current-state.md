# 当前状态

记录日期：2026-07-17。

## Phase 0初始状态

- 项目根目录最初包含`docs/`、`examples/`、`fixtures/`和`references/`四个目录；后三者为空。
- 唯一已有文件是研究报告`docs/research/2026-07-contam-studio-deep-research.md`。
- 初始目录没有Git仓库、项目基础文档、正式代码或技术栈依赖。
- Phase 0已建立Git仓库、项目规则、产品与架构文档，并将私有远程仓库设为`summer521521/CONTAM-Studio`。

## Phase 1实现

- 包管理器采用pnpm 11.9.0，仅提交`pnpm-lock.yaml`。
- 建立Tauri 2、React、TypeScript和Vite桌面应用；Rust端只保留应用启动所需的最小代码。
- 前端主要依赖为React 19、i18next、react-i18next、lucide-react和react-resizable-panels。
- 建立顶部工具栏、活动栏、模拟项目结构、中央欢迎页、属性/AI占位面板、底部面板和状态栏。
- 简体中文与英文可即时切换，浅色与深色主题可切换；语言、主题、面板尺寸、折叠状态和当前标签保存在`localStorage`中，并对损坏数据回退默认值。
- 未实现的打开、新建、保存、运行、设置等操作只显示“Phase 1占位功能”提示，不执行真实文件或求解器操作。
- Tauri能力仅启用`core:default`，未开放文件系统、Shell、HTTP、远程URL或自动更新能力。
- 工作台截图保存于`docs/ui/phase-1-workbench-shell.png`。

## 当前代码结构

```text
src/                  React工作台、组件、国际化和样式
src-tauri/            最小Tauri宿主、配置、能力和Windows图标
docs/                 项目决策、状态与界面截图
package.json          前端脚本和依赖
pnpm-lock.yaml        唯一的Node依赖锁文件
```

## Phase 1验证

- `pnpm build`通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`通过。
- Tauri桌面应用已实际启动，窗口成功创建且像素检查确认不是白屏或黑屏。
- 在本地渲染界面中验证了中英文、浅色/深色主题、面板折叠和刷新后的状态恢复；浏览器控制台无错误或警告。
- `git diff --check`在提交前执行。

## 尚未实现

当前仍全部使用模拟数据。尚未实现真实文件选择、PRJ读取或写入、领域模型、Patch/Diff/快照、Python领域核心、ContamX发现与运行、结果读取、AI调用或网络服务；这些能力不得从当前界面状态推断为已经可用。

## 待验证问题

- PRJ完整格式、无损解析、无损回写、未知区块保留、编号重排和复杂引用关系。
- Tauri、React、TypeScript与Python之间的具体通信和打包方案。
- ContamX支持版本、发现方式、捆绑方式及对应许可和第三方声明。
- Windows 10/11 64位安装、签名、sidecar生命周期和依赖兼容性。
- 中英文CONTAM术语表及其与官方术语的一致性。
- AI提供方的本地/联网边界、上下文披露、审批协议和确定性验证契约。
