# ADR-019：在可信语义快照上提供只读可视化模型工作区

状态：accepted for Renewal R1-03 implementation

日期：2026-08-01

## 背景

R1-02 已建立项目、运行、结果、研究和设置的工作台边界，但项目中央仍缺少能够同时表达 CONTAM 楼层图标事实和气流语义关系的视图。PRJ 的图标网格不是按比例平面图，未知区块和未识别图标也不能为了视觉完整而被猜测或丢弃。

## 决策

1. Python 在既有语义读取链路中解析经过 fixture 验证的 `levels plus icon data` 区段，生成唯一事实源 `spatial_projection.v1`。它只返回受限的 Level、图标、网格坐标、CONTAM 编号、绑定状态和证据行号，不返回原始 PRJ 文本或绝对路径。
2. 图标记录按真实文件和参考实现确认的 `icon_type, column, row, object_number` 读取。Zone 图标只绑定 Zone，Flow/Opening/Fan 图标只绑定 FlowPath，墙体、Note 和 unknown 保持非绑定；未识别值保留原始类型与网格位置。
3. Rust 在语义快照出站前使用 `deny_unknown_fields` 的类型化 payload 和有界 validator 校验 schema、项目身份、source/revision、数量、字符串、坐标、稳定 ID、bounds、绑定引用和不可用状态。空间失败只让 projection 进入 unavailable，不阻断已可用的语义 Zone/FlowPath 快照。
4. React 只消费语义快照和空间投影。SketchPad 是“示意布局，不代表按比例平面图”，不绘制虚构房间多边形；拓扑模式使用确定性 Zone/边界节点与 FlowPath 边，并明确“不代表空间距离”。两种模式都只读，selection 复用现有语义 reducer/controller。
5. Konva 10.3.0 与 react-konva 19.2.5 仅在 ProjectPage 的 lazy visual boundary 后加载。无 Canvas 时仍提供原生控件、分页对象列表、键盘入口、状态说明和拓扑/列表降级。
6. 仅持久化模式、图层可见性等轻量工作区偏好；不持久化模型、Konva 节点、旧项目 viewport 或旧 selection。项目 identity/revision 变化时清理旧视觉上下文并重新 fit。

## 理由

- 空间事实由领域层统一产生，避免前端重复解析 PRJ 或将 UI 推断伪装成科学事实。
- 只读画布保留现有 Patch、Diff、确定性验证、用户确认和快照链路，不增加第二条写入路径。
- 通过 bounded validation、稳定 ID 和 stale-response 校验避免畸形 payload、悬空绑定和旧项目数据污染当前视图。

## 参考与许可证

- [NIST CONTAM User Guide and Program Documentation](https://www.nist.gov/publications/contam-user-guide-and-program-documentation-version-34)
- [NISTIR 7049](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7049.pdf)
- [OpenStudio PrjDefines.hpp](https://github.com/NatLabRockies/OpenStudio/blob/03150b3539f27b244bac75e249ab6b6a9583cc8d/src/airflow/contam/PrjDefines.hpp)
- [OpenStudio PrjSubobjectsImpl.cpp](https://github.com/NatLabRockies/OpenStudio/blob/03150b3539f27b244bac75e249ab6b6a9583cc8d/src/airflow/contam/PrjSubobjectsImpl.cpp)

本实现只采用已核对的最小常量映射，没有复制 OpenStudio 源码，也没有把 OpenStudio 加入依赖；参考实现的 BSD 许可和归属记录在第三方声明中。Konva 与 react-konva 为 MIT，版本和官方许可证链接同样记录在第三方声明中。

## 后果与待验证事项

- 大型图标集在低缩放级别采用标签简化，DOM 对象列表分页为每页 50 项；这不替代 R1-05 的正式视觉矩阵。
- 画布、深浅色、中英文、125%/200% 缩放和 forced-colors 已有代码级响应式与无障碍结构，但本轮不宣称人工 GUI 通过。
- R1-04 可复用 `SpatialProjection`、`TopologyLayout`、`VisualSelectionProjection` 和稳定 project/revision reset 边界接入结果与 AI 证据，不得直接读取画布节点。
