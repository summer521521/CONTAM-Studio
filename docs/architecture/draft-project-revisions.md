# 不可变项目草稿Revision

## 目的与边界

Phase 3C把单Zone `volume_m3`修改从“批准后立即另存并切换项目”改为应用内部的可逆草稿工作流。原始PRJ仍是不可覆盖资产；当前实现不解析或重建完整PRJ，也不支持Zone名称、编号、其他字段、多Patch事务或复杂分支历史。

## Revision模型

- Revision 0是打开时经SHA-256和大小验证的原始项目基线。它引用原始PRJ，不由应用复制或修改；切回前必须再次验证基线文件未变化。
- Revision 1及以后位于`<app-local-data>/project-drafts/<project-session-id>/snapshots/`。文件名和路径由Rust生成，不进入WebView。
- 每次批准的Patch从当前活动Revision创建一个不存在的新PRJ快照。已有Revision永不原地修改。
- 历史是最多32个Revision的线性序列。Undo/Redo只验证目标并移动活动指针；Undo后新修改会删除Rust确认属于当前会话的不可达快照并截断Redo链。
- 达到历史上限时返回`draft_history_limit_reached`，不静默丢弃早期Revision。
- 项目切换和应用退出时尽可能清理应用拥有的草稿目录。崩溃残留不会在下次启动时自动恢复或信任。

## 稳定Zone身份

Rust使用固定命名空间生成UUID v5：

```text
baseline SHA-256
+ object type "zone"
+ baseline CONTAM number
+ baseline source line
+ baseline Zone name
```

同一原始字节基线及其所有草稿Revision得到相同`zone_id`；不同基线SHA-256不会复用身份。Python继续用CONTAM编号定位PRJ格式字段，React的编辑、结果和导出请求只提交`zone_id`。Rust负责把UUID解析为当前Revision中的CONTAM编号。

每个新快照及每次Undo/Redo都会严格重读全部受支持Zone，并按UUID验证编号、名称和源行号未变化。Patch只允许目标Zone体积出现预期变化；不得按数组位置静默映射。

## Patch应用

```text
React提交session + patch_id
↓
Rust验证Patch绑定当前Revision及源哈希
↓
Rust生成内部下一Revision路径
↓
Python复用apply_zone_volume_patch_to_copy
↓
Rust验证输出路径、哈希、字节变化、严格Zone重读和UUID映射
↓
提交不可变Revision并移动活动指针
```

失败时活动Revision和历史cursor保持不变，旧运行与结果不会被误清除。只有新Revision成功提交后，计划Patch、活动运行、活动结果和CSV导出状态才失效。

## Undo与Redo

Undo和Redo只接收`request_id`与`project_session_id`。切换前验证目标文件存在、大小和SHA-256一致，再严格重读和验证Zone身份。Revision 0若被外部修改则返回`draft_baseline_changed`并保留当前草稿；内部Revision缺失或变化分别返回`draft_revision_missing`或`draft_revision_changed`。

成功切换后，仍存在的当前`zone_id`保持选中；运行、结果、统计图表和CSV导出上下文全部清除，防止旧Revision证据冒充当前项目。

## 另存当前草稿

用户明确触发后，Rust原生保存对话框选择不存在的新`.prj`。目标不得是原始PRJ、任何内部快照或既有文件。Rust在目标目录写入独占临时文件，flush并`sync_all`，再用不可覆盖的提交方式创建最终文件；随后验证SHA-256、大小、严格Zone读取和UUID映射。

安全响应只包含文件名、SHA-256、大小、Zone数、Revision编号和一致性布尔值，不包含绝对路径。成功另存不会切换项目，也不会创建新Revision；当前Revision只标记为已导出。

## 运行与结果绑定

Revision 0运行原始基线；Revision 1及以后运行对应内部快照。Rust在内存中把活动运行和结果绑定`project_session_id`、`revision_id`、当前源路径和SHA-256。运行manifest可以包含内部源路径作为本地审计证据，但路径不进入WebView。Undo、Redo或新Revision成功后清除旧运行、结果和导出状态；手动选择旧manifest仍会被现有路径、哈希、Zone和Revision绑定拒绝。

## 安全边界

- React不提交原始路径、内部快照路径、PRJ文本、完整Patch、Zone数组或CONTAM编号。
- WebView不接收原始绝对路径、内部草稿根、运行/manifest路径、Python路径、Traceback或PRJ全文。
- Tauri capability只开放受控应用命令，没有dialog前端权限、通用文件系统、Shell、HTTP或网络权限。
- 当前草稿不跨应用重启恢复，不是数据库、Git式版本控制或完整PRJ编辑系统。
