# R1-03 空间模型工作区架构

## 纵向数据流

```text
受控 read_semantic_project
        ↓
Python semantic bridge
  levels / zones / flow_paths
  + spatial_projection.v1
        ↓
Rust typed bounded validation
  identity / source / revision / limits / bindings
        ↓
SemanticSnapshot（唯一模型事实源）
        ↓
TypeScript pure visual transforms
  SketchPad view model / deterministic topology / fit / visibility
        ↓
ProjectPage lazy visual workspace
  Konva canvas + DOM object explorer
```

空间投影不是另一个项目读取命令。`read_semantic_project` 同时返回已有语义对象和可选的 `spatial_projection`；空间区段缺失或校验失败时，Zone、FlowPath 和拓扑模式仍可用，前端显示稳定原因码对应的用户文案。

## 数据契约

`spatial_projection.v1` 包含项目 identity、source hash、revision、Level、bounds、图标、binding、source line evidence 和 warnings。图标的原始事实为 `icon_type, column, row, object_number`。稳定 ID 由项目身份、Level、类型、坐标、对象编号和重复序号确定性生成，不使用数组下标。

Rust 对出站 payload 使用拒绝未知字段的 serde 类型。状态、数量、UTF-8 字节长度、坐标、稳定 ID 唯一性、bounds 一致性和当前 semantic snapshot 的绑定引用在发送到 WebView 前检查；异常只返回去敏的稳定错误码。

## 两种视图

- SketchPad 把 column/row 映射到显示网格，只绘制已验证墙体段、图标锚点和标签；不推断房间多边形、面积或物理距离。
- 气流拓扑以 Zone 为节点，外部/环境/未解析端点为边界节点，FlowPath 为有向边。节点按 Level、CONTAM number 和稳定 ID 排序，布局重复打开保持一致；边长不代表空间距离。

画布没有拖动图元、编辑手柄、保存按钮或 PRJ 写入命令。点击图标、节点或边只调用现有 semantic selection；真实写入仍必须经过 Patch、Diff、验证、确认和 Revision。

## 性能与无障碍

Python 和 Rust 只在项目/revision 变化时重新读取；视口、缩放、平移和图层偏好在前端处理。Zone/FlowPath 索引使用 `Map`，拓扑布局为确定性排序，图标列表分页避免为大型项目渲染十万行 DOM。Konva 只在 ProjectPage lazy chunk 加载，Canvas 失败时对象列表和键盘控件仍可用。

## R1-04 接口

后续结果/AI 体验应使用 `SpatialProjection`、`TopologyLayout`、`VisualSelectionProjection` 和 `projectSessionId/revisionId` 作为输入；不要从 Konva 实例读取业务身份，也不要把空间 payload 复制到 localStorage。
