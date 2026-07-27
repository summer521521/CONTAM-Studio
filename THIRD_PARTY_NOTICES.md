# Third-party notices

CONTAM Studio自身源码采用Apache License 2.0。以下名称、软件和资料不因本项目许可证而改变其各自许可、版权或商标状态。

## 外部工具

- CONTAM、ContamX和SimRead由NIST发布，0.1.0不将其可执行文件打包进应用。用户需从可信官方来源单独取得并配置。CONTAM Studio不是NIST官方产品。
- Codex CLI和Codex App Server是可选的外部OpenAI工具，0.1.0不将其可执行文件打包进应用。CONTAM Studio不是OpenAI官方产品。

## 仓库夹具

`fixtures/contam/official-contamxpy/`保留了其目录内`LICENSE.txt`和来源记录。这些文件只用于兼容性测试和验证，其原有声明优先适用。

## 软件依赖

JavaScript、Rust和Python依赖的精确版本分别由`pnpm-lock.yaml`、`src-tauri/Cargo.lock`和`python/requirements-ci.lock`锁定。依赖保留各自许可证。主要直接依赖包括Apache ECharts、React、Tauri、i18next及其生态组件；完整依赖树应在每次发布前由锁文件重新审计。

本文件用于归属和边界说明，不替代任何第三方许可证原文。
