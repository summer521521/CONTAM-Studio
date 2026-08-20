# ADR-023：将 Studio 建筑几何保存为应用自有项目文档

- 状态：Accepted
- 日期：2026-08-11
- 决策范围：Geometry Workbench / 本地数据生命周期 / SketchPad 互操作

## 背景

`building_geometry.v1` 的 Studio metric 草稿此前只存在于 React 会话。关闭应用或重新打开项目后，用户绘制的墙、开口和 Zone 区域会丢失。把这些数据写入 `localStorage` 会绕过 Rust 权威边界；放在 PRJ 邻近 sidecar 会泄露或依赖用户路径；直接写入 PRJ 则超出已验证的 Section 3 图标位置子集。

Studio metric 几何和 CONTAM SketchPad 图标表达不同事实。前者是应用自有、毫米级建筑构造；后者是 PRJ 中用于模型组织的离散网格图标，不能被解释为真实比例建筑平面图。

## 决策

采用严格的 `geometry_document.v1` 作为 Studio metric 几何的项目级持久化信封：

- 仅保存 `status=available`、`source_kind=studio_metric_draft` 且 `application_owned=true` 的 `building_geometry.v1`。
- 使用原始 PRJ 的基线 SHA-256 作为项目身份键，文件固定存放于 `<app-local-data>/geometry-documents/`；WebView 不提供或接收路径。
- 文档同时绑定项目 identity、canonical geometry SHA-256、单调文档修订号和保存时间。Rust 独立验证内部几何合同和哈希。
- 保存采用临时文件、同步、重命名和写后重读；保留一代已验证 `.json.bak`。无效主文件进入隔离文件，绝不覆盖有效备份。
- 并发写入在 Rust 进程内串行化，并使用期望文档修订号拒绝迟到或冲突保存。项目 session、语义 Revision 或 source hash 改变后，迟到 load/save 不得进入当前 React 状态。
- 恢复时先验证基线 identity，再把当前 session、Revision 和 source hash 重新绑定到应用自有模型；主文件损坏时可从一代备份恢复并在 UI 中提示。
- 应用本地数据统计把 `geometry-documents` 作为用户数据白名单类别；当前不提供删除按钮。

Studio metric 到 SketchPad 只提供 `sketchpad_projection_preview.v1`：按同一 Level 已绑定 Zone 的多边形质心，将相对位置归一化到现有 Zone 图标边界。预览固定 `lossy=true`、`can_apply=false`，碰撞或身份不匹配会阻断。它不会生成 Patch、调用保存规划器、修改原始 PRJ 或写入任何 PRJ 副本。

## 理由

- 应用数据目录可让安装版和便携版共享一致、可统计且不依赖项目目录写权限的恢复行为。
- 基线 SHA-256 能在不向前端暴露路径的情况下稳定识别同一原始项目；活动 source hash 与 Revision 仍用于阻止旧状态污染。
- 单一备份和乐观修订足以覆盖常见崩溃、损坏与并发保存，而不引入复杂数据库或第二套状态系统。
- 只读有损预览让用户理解 Studio 构造与 CONTAM 图标的关系，同时避免把未经验证的转换包装成可应用操作。

## 后果

- Studio 建筑几何可以在关闭应用和重新打开同一基线项目后恢复。
- 几何文档属于用户数据；卸载应用通常不会删除它，清理需要未来独立设计确认、备份和保留策略。
- 命令历史本身不持久化；恢复后以已验证几何快照建立新的会话历史。文档修订用于存储冲突，不替代几何修订。
- 当前仍不能把毫米墙、开口或 Zone 多边形写入 PRJ。未来开放 SketchPad 移动必须重新经过已验证 Patch planner、Diff、用户确认和副本写入链。

## 替代方案

- `localStorage`：拒绝；无法提供 Rust 路径、哈希、原子写入和备份边界。
- PRJ 相邻 sidecar：拒绝；依赖外部目录权限并暴露项目位置，不属于统一应用数据生命周期。
- 直接写 PRJ：拒绝；仅既有图标 column/row 已有验证证据，真实建筑构造没有无损序列化依据。
- 引入数据库：暂不采用；当前单项目文档、单备份和哈希合同足够，新增运行时和迁移成本不合理。

## 待验证事项

- 正式 Tauri GUI 中的关闭、重启、备份恢复和错误重试体验。
- 大型合法几何文档在低性能 Windows 设备上的保存延迟。
- 未来独立的几何文档导出、删除和保留策略；这些能力不得从本 ADR 自动推导。
