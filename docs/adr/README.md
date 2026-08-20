# 架构决策记录

ADR用于记录具有长期影响的项目决策、理由、后果和待验证事项。已接受的ADR若需改变，应新增替代ADR，而不是静默改写历史理由。

## 索引

- [ADR-001：使用官方ContamX](ADR-001-use-official-contamx.md)
- [ADR-002：桌面宿主与Python领域核心](ADR-002-desktop-host-and-python-core.md)
- [ADR-003：安全项目编辑](ADR-003-safe-project-editing.md)
- [ADR-004：分离PRJ文档读取与仿真执行](ADR-004-separate-prj-reading-and-simulation.md)
- [ADR-005：Phase 2采用一次性Python Zone读取桥](ADR-005-use-one-shot-python-zone-bridge.md)
- [ADR-006：采用哈希绑定、仅写副本的单字段Patch](ADR-006-use-hash-bound-copy-only-patches.md)
- [ADR-007：使用隔离ContamX运行工作区](ADR-007-use-isolated-contamx-run-workspaces.md)
- [ADR-008：首个结果切片使用官方SimRead](ADR-008-use-official-simread-for-first-results.md)
- [ADR-009：使用不可变草稿Revision与确定性Zone UUID](ADR-009-use-immutable-draft-revisions.md)
- [ADR-010：首个AI后端使用Codex App Server](ADR-010-use-codex-app-server-for-readonly-ai.md)
- [ADR-011：冻结三层职责与可信边界](ADR-011-freeze-layer-responsibilities-and-trust-boundaries.md)
- [ADR-016：采用受控多 Provider 只读 AI Gateway](ADR-016-use-bounded-multi-provider-ai-gateway.md)
- [ADR-018：采用用户优先、本地优先且联网增强的运行时](ADR-018-adopt-user-first-online-enhanced-runtime.md)
- [ADR-019：在可信语义快照上提供只读可视化模型工作区](ADR-019-read-only-visual-model-workspace.md)
- [ADR-020：将结果、证据和 AI 上下文绑定到同一可信身份](ADR-020-bind-results-evidence-and-ai-context.md)
- [ADR-021：分离 Studio 建筑几何与 CONTAM SketchPad 投影](ADR-021-separate-studio-building-geometry-from-contam-sketchpad.md)
- [ADR-022：首个 PRJ 几何写入仅允许移动既有 SketchPad 图标](ADR-022-limit-first-prj-geometry-write-to-existing-icon-position.md)
- [ADR-023：将 Studio 建筑几何保存为应用自有项目文档](ADR-023-store-project-geometry-as-app-owned-document.md)
- [ADR-024：SketchPad 候选位置必须经过 Semantic Patch 审查](ADR-024-route-sketchpad-candidates-through-semantic-patch-review.md)
- [ADR-025：将校准平面底图作为项目绑定的应用资源管理](ADR-025-manage-calibrated-plan-underlays-as-project-bound-app-resources.md)

## 统一格式

每份ADR包含：状态、背景、决策、理由、后果、替代方案和待验证事项。
