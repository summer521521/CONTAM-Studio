# UAT-02 CONTAM Studio综合验收案例v1

## 用途

本案例用于界面重构、交互调整和运行问题排查后的集中验证。它把正向流程、只读边界和两个当前可复现的结果失败场景放进同一个案例包，避免只验证“能打开首页”或只依赖随机真实项目。

它不是CONTAM建模教程，也不是科学模型模板。所有PRJ来自仓库已有溯源记录的官方夹具，准备时只复制到`F:\Codex_File`，不修改仓库源文件。

## 准备案例

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-comprehensive-validation-case.ps1
```

记下脚本输出的`CASE_ROOT`。以下路径均相对于该目录。

开始前：

1. 退出其他正在运行的CONTAM Studio实例。
2. 使用当前候选包或`pnpm tauri dev`，不要只用浏览器中的`pnpm dev`代替桌面验证。
3. 不配置真实Provider也能完成基线案例。
4. 不操作真实项目和真实AppData。
5. 将截图放入案例目录的`screenshots`，导出放入`exports`。
6. 在`manual-results-template.csv`中填写`passed`、`failed`、`blocked`或`not_applicable`。

## A. 启动与整体界面

### START-01 首屏与主任务

1. 启动应用。
2. 观察React加载前和加载后的首屏。
3. 找到打开项目的主要动作。

预期：

- 不出现长期无说明黑屏或假项目。
- 首屏能够看出这是CONTAM工作台以及下一步是打开项目。
- 默认视图没有依赖真实账号或网络。
- 没有路径、哈希和协议说明堆满主界面。

### START-02 布局、主题和语言

1. 在浅色/深色之间切换。
2. 在中文/English之间切换。
3. 调整左右侧栏和底部面板。
4. 重启应用，观察安全偏好是否保留。
5. 在设置中恢复默认布局。

预期：

- 主题和语言切换后没有混合语言、透明文字或不可读图表。
- 仅保存语言、主题和安全布局偏好，不显示真实项目路径。
- 恢复默认布局后主要操作重新可见。

## B. 三Zone可编辑主路径

打开：

```text
projects/editable/valThreeZonesWthCtm-UseApi.prj
```

### EDIT-01 项目理解

预期：

- 状态为可编辑基线，而不是虚构的空项目。
- 1个Level、3个Zone、4条FlowPath、1个只读Species。
- Zone分别为：
  - `one`，300 m³；
  - `two`，600 m³；
  - `three`，900 m³。
- 原始来源受保护，未知区块保持不透明但不丢失。

### EDIT-02 Patch与Diff

依次准备以下操作：

1. Zone 1体积：`300 → 350 m³`。
2. Zone 2名称：`two → studio-two`。
3. FlowPath 1 multiplier：`1 → 1.25`。

先在Diff阶段取消一次，再重新计划并应用。

预期：

- 输入非法数字时不生成可应用Patch。
- Diff准确显示三处before/after和单位。
- 取消不产生Revision。
- 应用后只产生新的不可变Revision，原始PRJ哈希仍为：
  `1cafb2f0fef511f19ef88358238a1c1175c593187691ff7545db982f5e6e75ed`。
- Undo后恢复基线值；Redo后恢复修改值。
- 旧Zone选择和迟到响应不会覆盖当前Revision。

### EDIT-03 草稿保护与导出

1. 保持未导出的脏草稿。
2. 尝试打开另一个项目。
3. 在保护对话框中先取消。
4. 再次切换并选择导出草稿。
5. 将副本保存到`exports`。
6. 再次选择同名目标。

预期：

- 第一次取消后项目和草稿均保留。
- 导出只创建新文件，不覆盖现有目标。
- 同名目标被拒绝或要求选择新名称，不能删除既有文件。

### EDIT-04 ContamX与已知结果失败

对当前Revision运行官方ContamX，再加载Zone 1结果。

预期：

- ContamX 3.4.0.3运行成功，退出码为0。
- 成功运行证据保留。
- 当前0.4.0严格结果解析预计返回：
  `zone_result_contract_invalid`
- 相关字段为`reference_pressure_pa`，原因是NFR数值空格格式不受支持。
- 界面不得把该错误显示成仿真失败，也不得生成虚假图表。
- 错误应说明“运行成功、结果解析失败”和下一步，而不是只显示内部堆栈。

该行是已知诊断场景。以后如果解析器正式支持该格式，应更新案例预期，而不是继续期待失败。

## C. 七Zone可信结果路径

打开：

```text
projects/results/test_GetPrjInfo.prj
```

### RESULT-01 只读原因

预期：

- 7个Zone、1个Level、18条FlowPath和1个Species。
- 项目整体为只读，当前原因代码为`volume_range_invalid`。
- 编辑控件不可用，但浏览、运行和结果能力仍可按真实支持范围工作。
- 不把AHS零体积Zone静默删除或改成普通Zone。

### RESULT-02 官方运行与结果

1. 运行ContamX。
2. 加载Zone 1结果。
3. 切换Zone 2和Zone 3。

预期：

- ContamX退出码0。
- 每个Zone均为577个样本。
- 时间从0秒到172800秒，间隔300秒。
- 温度为293.15 K，空气密度为1.2041 kg/m³。
- Zone 1/2/3参考压力分别为-1.4222、-3.4082、-2.0136 Pa。
- 图表、统计和表格使用相同样本和单位。
- 图表缩放不会改变原始数据。

### RESULT-03 CSV导出

1. 将Zone 1结果导出到`exports`。
2. 检查UTF-8、CRLF、13列和首末时间。
3. 再次导出到同一目标。

预期：

- CSV内容与当前Zone、运行和Revision绑定。
- 不覆盖已有文件。
- 取消导出不会清除当前结果。

## D. NIST多Level边界

打开：

```text
projects/boundary/demo1c.prj
```

### BOUNDARY-01 多层树与只读呈现

预期：

- 3个Level和7个Zone。
- 包含Attic、Bathroom、Bedroom1/2、LivingDining、Kitchen和CrawlSpace。
- 当前为只读边界，不显示可应用Patch。
- 树节点、检查器和面包屑之间的选择保持一致。

### BOUNDARY-02 无节点结果

运行ContamX并尝试提取Bathroom结果。

预期：

- ContamX运行成功。
- 当前严格结果路径返回`simread_output_missing`。
- 界面保留运行成功证据并解释没有可用Zone节点结果。
- 不显示空白成功页或伪造零值。

## E. Study计划与失败真实性

回到三Zone可编辑案例，建立两参数网格：

- Zone 1 volume：300、350、400 m³。
- FlowPath 1 multiplier：0.75、1.00、1.25。

预期：

- 计划阶段显示9个组合。
- 超过组合上限时在启动前阻止。
- 运行过程中可取消，完成/失败/取消样本分开统计。
- 受当前三Zone结果格式问题影响的样本不得计为成功结果。
- Schedule和Species参数仍显示为不支持，而不是可编辑占位符。

本行运行9个官方案例，时间允许时执行；仅检查计划界面时标记`not_applicable`，不要写成完整Study通过。

## F. 附件与AI披露

导入`attachments`中的全部文件。

预期：

- TXT：受限文本。
- CSV：受限表格预览，公式样式单元格不被执行。
- JSON：结构化受限文本。
- PNG：只显示尺寸等本地元数据，不声称已发送像素。
- ZIP：只显示受控条目元数据。
- `invalid-signature.png`：因扩展名与magic bytes不一致被拒绝。
- 拒绝单个附件不应清除其他已接受附件。

在没有真实Provider时打开AI：

- 核心项目、运行和结果仍可使用。
- 内置Provider没有普通手动模型ID。
- 自定义Provider的手动模型只在高级设置中出现。
- 不输入真实Key，不发送远程请求。

## G. 存储、缩放、键盘和恢复

### UX-01 存储与工具

- 设置页显示ContamX/SimRead就绪和版本。
- 存储统计按类别显示。
- 只执行“打开数据目录”，不要清理数据。
- 主界面不默认展示工具绝对路径和哈希。

### UX-02 Windows缩放

分别检查100%、150%和200%缩放，以及最小支持窗口：

- 主操作不被永久遮挡。
- 文本可换行，不重叠。
- 图表、弹窗和底部按钮可到达。
- 不依赖横向滚动才能确认危险操作。

### UX-03 键盘

- Tab顺序与视觉顺序一致。
- 图标按钮有可理解的名称。
- Modal焦点被限制在对话框内。
- Escape只执行取消，不执行Apply、Discard或Delete。

### RECOVERY-01 关闭保护

创建未导出的草稿并关闭应用：

1. 第一次选择取消。
2. 第二次选择导出后关闭。
3. 重新启动并检查没有伪造的运行中状态。

预期：

- 取消保持应用和草稿。
- 导出成功后才关闭。
- 失败导出不关闭窗口。
- 重启后不会把未知进程状态显示为成功。

## 通过标准

以下任一项为阻断：

- 原始PRJ被覆盖或哈希变化。
- 失败状态显示为成功。
- 当前项目、Zone、Revision或运行身份串线。
- 应用崩溃、窗口无法恢复或确认按钮不可达。
- 界面、日志、Archive或导出出现API Key、Cookie或非必要绝对路径。
- 200%缩放下无法完成核心流程。

已知诊断场景本身不是阻断；错误归因错误、证据丢失或把失败伪造成成功才是阻断。

完成后同时保留：

- 填写后的`manual-results-template.csv`；
- `ux-observation-template.md`；
- 必要截图；
- 导出文件；
- 应用版本和候选包SHA-256。
