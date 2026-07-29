# Third-party notices

CONTAM Studio自身源码采用Apache License 2.0。以下名称、软件和资料不因本项目许可证而改变其各自许可、版权或商标状态。

## 外部工具

- CONTAM、ContamX和SimRead由NIST发布。0.2.0不将官方ContamX或SimRead桌面可执行文件打包进应用；用户需从可信官方来源单独取得并配置。CONTAM Studio不是NIST官方产品。
- Codex CLI和Codex App Server是可选的外部OpenAI工具，0.2.0不将其可执行文件打包进应用。CONTAM Studio不是OpenAI官方产品。

## 仓库夹具

`fixtures/contam/official-contamxpy/`保留了其目录内`LICENSE.txt`和来源记录。这些文件只用于兼容性测试和验证，其原有声明优先适用。

## 软件依赖

JavaScript、Rust、Python测试和冻结Worker构建依赖的精确版本分别由`pnpm-lock.yaml`、`src-tauri/Cargo.lock`、`python/requirements-ci.lock`和`python/requirements-worker.lock`锁定。依赖保留各自许可证。主要直接依赖包括Apache ECharts、React、Tauri、i18next及其生态组件；完整依赖树应在每次发布前由锁文件重新审计。

Phase 6B新增或显式启用的主要Rust依赖及其许可证为：`reqwest 0.13.4`（MIT OR Apache-2.0）、`rustls 0.23.42`（Apache-2.0 OR ISC OR MIT）、`ring 0.17.14`（Apache-2.0 AND ISC）、`keyring 4.1.5`（MIT OR Apache-2.0）、`zeroize 1.9.0`（Apache-2.0 OR MIT）、`futures-util 0.3.32`（MIT OR Apache-2.0）、`url 2.5.8`（MIT OR Apache-2.0）、`tokio 1.52.4`（MIT）和`uuid 1.24.0`（Apache-2.0 OR MIT）。实际传递依赖和版本以`src-tauri/Cargo.lock`为准。

0.2.0的Windows包包含Python 3.12.10 one-folder运行时、PyInstaller 6.21.0 bootloader、`contamxpy 0.0.9`、`cffi 2.1.0`及`pycparser 3.0`所需运行组件。PyInstaller采用GPL-2.0-or-later并带有允许分发所生成应用的Bootloader Exception；Python适用PSF许可；contamxpy元数据标记为Public Domain且随包保留NIST声明；cffi为MIT，pycparser为BSD-3-Clause。对应许可证原文复制到`runtime/python-worker/licenses/`，Python发行版中所含OpenSSL等组件的声明由随包`PYTHON-LICENSE.txt`继续保留。

EXPERT-FIX-01将`windows-sys 0.61.2`作为Windows Job Object API的直接Rust依赖；该crate采用MIT OR Apache-2.0。它不引入外部进程管理服务或系统级安装项。

Cherry Studio社区版采用AGPL-3.0；本项目只借鉴Provider分层思想，不复制其代码、注释、协议包装或界面。OpenAI、Anthropic、Google Gemini、OpenRouter和DeepSeek的API文档以及Codex App Server是外部规范/服务来源，不随应用捆绑，也不改变本项目与各服务自身的条款关系。

本文件用于归属和边界说明，不替代任何第三方许可证原文。
