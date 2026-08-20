# ADR-024：SketchPad 候选位置必须经过 Semantic Patch 审查

- 状态：Accepted
- 日期：2026-08-11

## 背景

Studio metric 建筑几何与 CONTAM SketchPad 是两种不同事实。`sketchpad_projection_preview.v1` 能把 Zone 质心相对关系转换为既有 Zone 图标的候选网格位置，但该转换有损，不能直接成为写文件授权。另一方面，Python/Rust 已验证的最小 PRJ 子集只允许修改既有图标的 `column` 与 `row`，并能通过应用管理的不可变草稿副本完成写后重读。

## 决策

- 预览继续固定 `lossy=true`、`can_apply=false`；Canvas 叠层和 Konva Node 永远不是写入命令。
- 新增纯前端准备边界，只把同一项目 session、source SHA-256、identity 与 Revision 下的无冲突候选转换为 `set_spatial_icon_column` / `set_spatial_icon_row`。
- 准备边界重新检查 ID、非负整数坐标、变化标记、重复目标、最终单元冲突和 Rust 单次 128 操作上限，只输出实际变化的字段。
- 用户在画布浮层点击“审查候选移动”只会调用现有 `plan_semantic_patch` 并打开统一检查器。Rust 返回的精确 Diff、source hash 与 Patch hash 可见后，用户必须第二次点击“应用”。
- 应用继续只调用现有 `apply_semantic_patch_to_draft`，创建新的应用管理 PRJ 草稿副本；原始 PRJ、已有草稿和相邻文件不得覆盖。
- plan/apply 响应必须与当前 request、project session、Revision、source hash、Patch 和操作数量一致；项目上下文改变后的迟到响应直接丢弃。

## 理由

该设计复用已经过 fixture、Python 和 Rust 验证的最小写入原语，不增加平行文件写入接口。把“候选比较”“生成 Diff”“确认应用”分开，可以诚实保留有损语义，同时让用户获得可理解、可撤销且可审计的工作流。

## 后果

- 正式 UI 现在开放的是候选位置审查，不是任意 SketchPad 拖拽或 ContamW 等价编辑。
- 新增、删除、改类型、改 object number、跨 Level 移动、墙体/房间构造写回和普通 AI 坐标 Patch 继续禁止。
- 如果有未完成语义修改、仿真/附件操作、碰撞、超限或上下文失效，候选审查关闭失败，不覆盖用户当前工作。
- 用户应用后进入新的草稿 Revision；若需导出或替换外部文件，仍走既有独立导出流程。

## 替代方案

- 直接把预览结果写入 PRJ：拒绝，因为预览有损且绕过 Diff 与确认。
- 新建 SketchPad 专用写入命令：拒绝，因为会复制已有 Semantic Patch 权限边界。
- 让 AI 或 Canvas 拖拽直接生成并应用操作：拒绝，因为扩大权限并形成第二套业务状态。

## 待验证事项

- 视觉集成完成后执行正式 Tauri GUI、系统缩放、键盘、中英文与三主题截图矩阵。
- 在用户授权的隔离 fixture 上验证候选审查、取消和应用后的官方工具行为；自动测试不能替代该证据。
