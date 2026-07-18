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

项目已建立**Phase 2C：真实PRJ只读Zone展示闭环**。用户可从Tauri原生文件选择器主动选择受支持的PRJ，由Rust宿主通过一次性受控Python进程调用严格Zone读取器，随后在桌面工作台查看真实项目摘要、全部Zone和只读属性。文件选择与读取合并为一个显式授权的Rust命令，前端只能提交`request_id`，不能指定源路径。该能力仍只覆盖经验证的CONTAM 3.4简单Zone子集，不代表完整PRJ已加载；未知版本、复杂尾部和未验证布局会整体拒绝。当前没有PRJ保存与回写、ContamX运行或AI能力。

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

Phase 1实现了React前端与最小Tauri桌面宿主；Phase 2A建立了Python隔离执行检查核心；Phase 2B-1增加了独立的严格Zone纯文档读取器；Phase 2C用结构化协议将该读取器接入桌面工作台。Rust在结果跨IPC前清理诊断、拒绝非空stderr，并确认响应路径与用户选择的规范化路径一致。contamxpy隔离稳态初始化入口没有接入GUI。

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

## Python严格Zone文档读取

完成`python/`依赖安装后，可对仓库内的官方测试样例执行纯文档读取：

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.prj_zone_reader `
  fixtures\contam\official-contamxpy\test_GetPrjInfo.prj --json
```

该入口固定使用`strict_contam_3_4_simple_zone_v1`，只支持文件头`ContamW 3.4.0.0`和`ContamW 3.4.0.4`下经验证的19字段简单Zone记录。它不调用contamxpy、ContamX或仿真初始化，不创建结果文件；遇到未知版本、复杂条件字段、非ASCII或未验证布局时整体拒绝。Phase 2C桌面桥复用同一个读取入口，不另建Zone字段解释。详见[兼容范围](docs/architecture/prj-zone-reader-support.md)。

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
- [Phase 2C开发与验证](docs/development/phase-2c-verification.md)
- [阶段路线图](docs/roadmap/phases.md)
- [风险登记表](docs/risks/risk-register.md)
- [架构决策记录](docs/adr/README.md)
- [Phase 2A Zone读取技术Spike](docs/spikes/phase-2-contamxpy-zone-read.md)
- [Phase 2B-0 Zone格式证据调查](docs/spikes/phase-2-prj-zone-format.md)
- [AI安全边界](docs/ai/ai-safety-boundary.md)
- [许可策略](docs/licensing/licensing-strategy.md)
- [深度研究报告](docs/research/2026-07-contam-studio-deep-research.md)
