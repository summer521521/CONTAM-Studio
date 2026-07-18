# CONTAM Studio

CONTAM Studio是一个面向教学与科研的现代化、离线优先、中英文双语CONTAM桌面工作台，使人和AI能够通过同一套安全、结构化、可审查的接口使用官方ContamX。

## 目标用户

- 建筑环境、暖通、通风和室内空气品质相关专业的学生。
- 使用CONTAM开展教学的教师。
- 使用CONTAM开展科研的研究人员和研究生。

项目当前不面向大众消费者、复杂企业平台或大型设计院完整工作流。

## 核心价值

- 保留官方ContamX作为数值求解内核，不重写CONTAM求解算法。
- 提供现代、双语且离线优先的教学与科研工作流。
- 让GUI和AI共用语义化领域接口，所有修改均可审查、验证和追溯。
- 将原始PRJ、项目快照和运行结果置于明确的数据安全边界内。

## 当前阶段

项目已建立**Phase 3B：Zone体积Diff审阅与另存副本桌面闭环**。用户可为已加载Zone输入新的`volume_m3`数字记号，审阅单行Diff，明确确认后由Rust原生保存对话框选择一个尚不存在的新PRJ路径。完整Patch和源路径只保存在Rust内存会话，前端不能提交路径或Patch；Python重新验证全部前置条件后仅创建副本，成功时桌面切换到新副本。该能力不覆盖源PRJ，也不代表完整PRJ保存、回写、撤销或多Patch已经实现；ContamX运行和AI仍未接入。

## 架构方向

当前已批准的首选方向是React+TypeScript前端、Tauri 2桌面宿主、Python CONTAM领域核心和官方ContamX求解器，Windows 10/11 64位为首要平台。Phase 2C已在开发环境验证Tauri与Python之间的一次性进程JSON桥；Python运行时冻结、安装包集成及长期进程策略仍需后续Spike验证。

```text
React GUI
↓
Tauri桌面宿主
↓
受控通信接口
↓
Python CONTAM领域核心
↓
官方ContamX
```

Phase 1实现了React前端与最小Tauri桌面宿主；Phase 2建立了严格Zone纯文档读取器和桌面只读闭环；Phase 3A-0建立哈希绑定、仅写副本的Python Patch。Phase 3B将计划、Diff审阅、原生另存为和副本重读接入同一一次性Python桥。Rust持有活动项目快照与完整Patch，React只取得审阅视图；contamxpy隔离稳态初始化入口没有接入GUI。

## 开发启动

需预先安装Node.js、pnpm、Python 3.12、Rust MSVC工具链和Visual Studio C++桌面开发组件。项目使用自己的`python/.venv`，不依赖PATH中的任意Python。

```powershell
py -3.12 -m venv python\.venv
python\.venv\Scripts\python.exe -m pip install -e ".\python[dev]"
pnpm install
pnpm tauri dev
```

仅构建前端可运行`pnpm build`，前端单元测试运行`pnpm test`。开发环境可通过`CONTAM_STUDIO_PYTHON`显式指定一个绝对Python解释器路径；未配置时只检查仓库内`python\.venv\Scripts\python.exe`，不会回退到系统PATH。

![Phase 2C真实PRJ只读Zone工作台](docs/ui/phase-2c-real-zone-project.png)

Phase 3B的桌面审阅流程和验证状态见[开发与验证记录](docs/development/phase-3b-zone-volume-gui-verification.md)。

## Python严格Zone文档读取

完成`python/`依赖安装后，可对仓库内的官方测试样例执行纯文档读取：

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.prj_zone_reader `
  fixtures\contam\official-contamxpy\test_GetPrjInfo.prj --json
```

该入口固定使用`strict_contam_3_4_simple_zone_v1`，只支持文件头`ContamW 3.4.0.0`和`ContamW 3.4.0.4`下经验证的19字段简单Zone记录。它不调用contamxpy、ContamX或仿真初始化，不创建结果文件；遇到未知版本、复杂条件字段、非ASCII或未验证布局时整体拒绝。Phase 2C桌面桥复用同一个读取入口，不另建Zone字段解释。详见[兼容范围](docs/architecture/prj-zone-reader-support.md)。

## Python Zone体积副本Patch

计划一个尚未应用的Patch：

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.zone_volume_patch plan `
  fixtures\contam\official-contamxpy\test_GetPrjInfo.prj `
  --zone-number 1 --new-volume 650.0 --json
```

将同一修改应用到调用者指定、尚不存在的新副本：

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.zone_volume_patch apply `
  fixtures\contam\official-contamxpy\test_GetPrjInfo.prj `
  --zone-number 1 --new-volume 650.0 `
  --output F:\Codex_File\CONTAM-Studio\phase-3a-zone-volume-patch\new-copy.prj --json
```

该入口只支持`volume_m3`，不会覆盖源文件或既有输出。应用时会重新验证Patch前置条件，并在落盘后证明输出严格等于单个Vol记号替换、严格读取器可重读且其他已解析Zone字段不变。`--diff`只显示目标Zone单行预览。详见[Zone体积副本Patch架构](docs/architecture/zone-volume-patch.md)。

## Python隔离Zone检查

完成`python/`依赖安装后，可对仓库内的官方测试样例执行隔离Zone检查：

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.inspect_prj `
  fixtures\contam\official-contamxpy\test_GetPrjInfo.prj --json
```

该命令没有接入桌面界面。它保证源PRJ哈希不变，但检查过程并非无副作用加载：contamxpy会执行稳态初始化并产生结果文件，所有生成物仅存在于已验证哈希的临时副本目录并在完成后清理。

## 主要非目标

本项目不是新的CONTAM求解器、ContamW换皮、只有聊天框的AI包装、通用BIM平台或多求解器仿真平台。当前不建设完整CAD/三维建模、其他求解器集成、插件市场、云同步、账户与多人协作、企业权限体系，也不承诺macOS或Linux正式发行。

## 文档导航

- [当前状态](docs/current-state.md)
- [产品愿景](docs/product/vision.md)
- [范围与非目标](docs/product/scope.md)
- [用户与使用场景](docs/product/users-and-use-cases.md)
- [架构概览](docs/architecture/overview.md)
- [PRJ简单Zone只读兼容范围](docs/architecture/prj-zone-reader-support.md)
- [Tauri-Python Zone桥](docs/architecture/tauri-python-zone-bridge.md)
- [Zone体积副本Patch](docs/architecture/zone-volume-patch.md)
- [Phase 2C开发与验证](docs/development/phase-2c-verification.md)
- [Phase 3A-0开发与验证](docs/development/phase-3a-zone-volume-patch-verification.md)
- [Phase 3B开发与验证](docs/development/phase-3b-zone-volume-gui-verification.md)
- [阶段路线图](docs/roadmap/phases.md)
- [风险登记表](docs/risks/risk-register.md)
- [架构决策记录](docs/adr/README.md)
- [Phase 2A Zone读取技术Spike](docs/spikes/phase-2-contamxpy-zone-read.md)
- [Phase 2B-0 Zone格式证据调查](docs/spikes/phase-2-prj-zone-format.md)
- [AI安全边界](docs/ai/ai-safety-boundary.md)
- [许可策略](docs/licensing/licensing-strategy.md)
- [深度研究报告](docs/research/2026-07-contam-studio-deep-research.md)
