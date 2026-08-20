# ADR-022：首个 PRJ 几何写入仅允许移动既有 SketchPad 图标

- 状态：Accepted
- 日期：2026-08-11
- 决策范围：Geometry Workbench / CONTAM PRJ Section 3

## 背景

CONTAM Studio 已有两类必须分离的事实：PRJ `levels plus icon data` 的离散 SketchPad 投影，以及 Studio 自有的毫米级建筑几何。用户需要接近 ContamW 的绘图体验，但现有证据不能证明墙长、房间面积、门窗宽度等真实建筑尺寸能无损序列化进 PRJ Section 3。

NISTIR 7049 将 Section 3 定义为重建 SketchPad 的 Level/Icon 数据；图标引用 Zone、Path、Duct 等项目对象。NIST 对 SketchPad 的说明同时指出表示的物理尺寸并不重要，关键是多区模型的连通关系。OpenStudio 的独立读写实现和本仓库三套官方 fixture 均将图标记录解释为 `icon, column, row, object_number`。

NISTIR 7049 同一页的字段说明曾写成 `row, col`，但示例表头、示例数值、OpenStudio 代码和真实 fixture 一致为 `col, row`。因此不能只依赖单行自然语言说明。

## 决策

首个 PRJ 几何写入子集限定为：对已存在、已验证并绑定当前项目 identity 与 Revision 的单个 SketchPad 图标，修改 `column` 和/或 `row` 整数 token。

必须满足：

- 只写应用创建的新副本，原始 PRJ 保持不变。
- 不新增或删除图标，不修改 Level 数量、图标数量、顺序、`icon_type` 或 `object_number`。
- 坐标必须落在 PRJ 唯一 `! rows cols` 声明内；同一 Level 的最终坐标不得碰撞。
- 操作通过现有 `semantic_patch.v1` 的计划、Diff、用户确认、Revision 和哈希边界。
- 应用前按当前源文件重新规划事务；应用后严格重读并比较完整 Level/Icon 序列。
- 未知图标和未知 PRJ 区段不解释、不删除；除目标整数 token 外保持原始字节。
- 通用 AI 语义 Patch 暂不允许生成这些操作。未来 AI 若参与，必须从 Geometry Draft 的独立审批链进入，并再次经过本地转换与用户确认。

## 不在本决策内

- 从 Studio 毫米几何自动创建 PRJ 墙、Zone、开口或 FlowPath 图标。
- 将 PRJ SketchPad 作为真实比例建筑图。
- 重写整个 Level/Icon 区段，或修改 Zone/FlowPath 等语义对象定义。
- 在正式 GUI 中开放拖拽；UI 入口需要独立的交互与验收任务。

## 后果

- 项目获得一个很窄但可审计的 PRJ 几何 round-trip 原语，可用于后续 ContamW 兼容交互。
- Studio 真实建筑几何仍需独立持久化；它与 SketchPad 之间只能进行显式、有损、可预览的投影，不能宣传为无损互转。
- 后续扩大子集时，每一种新增/删除图标或语义对象的行为都需要新的官方 fixture、ContamW 行为、官方工具运行和差异证据。

## 证据

- [NISTIR 7049](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7049.pdf)
- [OpenStudio `PrjDefines.hpp`](https://raw.githubusercontent.com/NatLabRockies/OpenStudio/03150b3539f27b244bac75e249ab6b6a9583cc8d/src/airflow/contam/PrjDefines.hpp)
- [OpenStudio `PrjSubobjectsImpl.cpp`](https://raw.githubusercontent.com/NatLabRockies/OpenStudio/03150b3539f27b244bac75e249ab6b6a9583cc8d/src/airflow/contam/PrjSubobjectsImpl.cpp)
- `fixtures/contam/official-nist-tutorials/demo1c.prj`
- `fixtures/contam/official-contamxpy/valThreeZonesWthCtm-UseApi.prj`
- `fixtures/contam/official-contamxpy/test_GetPrjInfo.prj`
