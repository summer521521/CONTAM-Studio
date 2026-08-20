# Verified SketchPad Icon Round Trip

```yaml
task_id: verified-sketchpad-icon-round-trip
phase: Geometry Workbench
title: 既有 SketchPad 图标位置的可验证副本写入
status: completed
record_origin: live
started_at_utc: 2026-08-11T04:36:00Z
ended_at_utc: 2026-08-11T05:01:01Z
duration_seconds: 1501
base_commit: 8c0836b00c9bde4cebcdd0f25871be94fa1f2961
branch: main
task_source: 用户要求继续推进接近 ContamW 的建筑绘制体验；总监依据官方格式证据先收敛首个可证明 PRJ 几何子集。
task_summary: 证明并实现仅移动既有 CONTAM SketchPad 图标 column/row 的哈希绑定、Diff 审查、写入新副本和严格重读链路；不新增删除图标，不改变对象编号，不把 Studio 毫米几何冒充为 PRJ 原生几何。
goals:
  - 以 NIST 文档、真实官方 fixture 和 OpenStudio 独立实现锁定 Section 3 图标字段顺序
  - 将既有图标 column/row 作为两个显式 Patch 字段接入现有语义 Patch 通道
  - 拒绝越界、碰撞、未知图标 ID、旧值变化、事务篡改和输出覆盖
  - 写入应用所有的新副本并严格重读，保持原始 PRJ、对象编号、图标类型、顺序和未知区段不变
allowed_scope:
  - Python PRJ 空间投影与语义 Patch、Python bridge、Rust 操作白名单、前端 Patch 类型
  - 官方只读 fixture、聚焦测试、合同、Geometry Workbench 架构/ADR/事实源和能力矩阵
  - F:\Codex_File\geometry-prj-roundtrip-research 下的官方文档研究证据
forbidden_scope:
  - 新建或删除 PRJ 图标、Zone、FlowPath、墙或楼层，修改 icon_type/object_number 或重写完整 Section 3
  - 将 studio_metric_draft 宣称为可无损写回的 ContamW 几何
  - 写入原始 PRJ、绕过 Diff/确认/Revision、读取真实用户工程或凭据
  - GUI 验收、Computer Use、提交、推送、打标签、打包、签名或发布
validation:
  - 开发中只运行 semantic/spatial 聚焦测试、Rust allowlist、前端 Patch 类型、Ruff、fmt 和静态合同
  - 收口时运行 Python/前端/Rust 相关回归、构建与一次最终 Full，并保持 GUI、官方工具、远程 CI 和发布状态独立
delivery_status: working_tree_only
token_usage:
  input_tokens: null
  cached_input_tokens: null
  output_tokens: null
  total_tokens: null
  source: unavailable
notes:
  - implementation=complete；automated_verified=passed。
  - github_windows_ci=pending_push；manual_gui=not_run；real_tools=not_run；real_provider=not_run；packaged=no；signed=not_run；released=no；user_validated=not_run；merged_to_main=no。
```

## 证据结论

- NISTIR 7049 Section 3 明确说明该区块用于重建 SketchPad，每条图标记录包含图标类型、网格位置和 zone/path/duct 等对象编号；SketchPad 是二维等尺寸单元格数组，不是毫米级建筑平面几何。
- 同一 NIST 页面正文把坐标次序列为 `row, col`，但紧随其后的真实示例表头与数据为 `!icn col row #`。OpenStudio 固定提交 `03150b3539f27b244bac75e249ab6b6a9583cc8d` 的 `IconImpl::read/write` 也按 `icon, col, row, nr`。本项目三套官方 fixture 与既有解析器同样满足该次序，因此以“示例 + fixture + 独立实现”三方一致为写入事实，不照抄冲突的说明行。
- NIST 对 ContamW 的说明指出建筑模型关注多区网络连通性，SketchPad 表示的物理尺寸并不重要。因此 Studio 的毫米级墙、门窗和区域继续保存在独立建筑几何事实中；本任务不建立二者的无损等价关系。

参考：

- [NISTIR 7049](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7049.pdf)
- [OpenStudio icon constants](https://raw.githubusercontent.com/NatLabRockies/OpenStudio/03150b3539f27b244bac75e249ab6b6a9583cc8d/src/airflow/contam/PrjDefines.hpp)
- [OpenStudio IconImpl read/write](https://raw.githubusercontent.com/NatLabRockies/OpenStudio/03150b3539f27b244bac75e249ab6b6a9583cc8d/src/airflow/contam/PrjSubobjectsImpl.cpp)

## 当前实现

- `semantic_patch.v1` 新增 `set_spatial_icon_column` 与 `set_spatial_icon_row`，单位固定为 `grid_cell`；AI 通用语义 Patch 白名单未开放这两个操作。
- 目标图标 ID 继续由项目 identity、Level、icon type、原坐标、对象编号和重复序号确定性生成；计划后项目或 Revision 变化会使旧事务失效。
- Planner 从受支持 PRJ 头部的唯一 `! rows cols` 声明读取边界，要求所有既有图标与最终坐标均在范围内，且同一 Level 的最终网格位置唯一。
- 每个字段只替换来源行上的一个整数 token。应用前重新规划并比较完整事务和 Patch hash；应用后重新读取源/输出空间投影，验证 Level、图标数量、顺序、类型、对象编号和所有预期坐标。
- 输出只能创建新文件。验证失败时删除本次新建输出，原始 PRJ 不变；已存在目标拒绝覆盖。

## 验证结果

- Python 聚焦：41 项通过。三套官方 fixture 已证明源文件不变、输出可重读、目标行只改变 column/row；越界、碰撞、行列声明缺失和事务篡改均关闭失败。
- Rust：真实 Rust → Python Worker 往返测试通过；只允许两个坐标字段，显式拒绝 create/delete/type/object-number 操作。
- 前端聚焦：2 个文件、14 项通过；生产构建通过。Patch 类型可表达两个坐标字段，但尚未开放正式拖拽或属性编辑入口。
- Final Full：本任务仅运行 1 次，退出码 0，`QA-01 passed: 73 checks passed`。其中 Python 391 项、前端 299 项、Rust 161 项通过，另 1 项按设计忽略；严格 Clippy、Cargo check、Rust fmt、Windows CI 合同及 12 项变异测试均通过。
- Full 日志：`F:\Codex_File\verified-sketchpad-icon-round-trip\full-verification.log`。
- `git diff --check`：退出码 0，仅有 LF/CRLF 转换提示，无 whitespace error。
