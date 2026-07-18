# Zone体积副本Patch

## 定位

`contam_studio_core.zone_volume_patch`是Phase 3A-0的严格单字段修改切片。它只为读取模式`strict_contam_3_4_simple_zone_v1`下的`volume_m3`生成结构化Patch，并只应用到调用者明确指定、尚不存在的新`.prj`副本。它不是完整PRJ保存、回写或通用编辑框架，也未接入React、Tauri或AI。

## Patch契约

- `schema_version`：`1.0`
- `patch_type`：`replace_zone_volume`
- `status`：计划阶段固定为`planned`
- 字段：仅`volume_m3`
- `token_index`：`7`，即19字段Zone记录中从0开始计数的第8个`Vol`字段
- 源快照：绑定规范化本地路径、SHA-256、字节大小、读取模式和文件头版本
- 目标前置条件：绑定CONTAM编号、Zone名称、源行号、旧记号、旧数值及绝对字节范围
- 替换：保留用户提交且通过严格数字语法验证的ASCII记号，不由浮点格式化器重新生成
- 预览：只保存目标Zone的旧行和新行，不包含整份PRJ

新体积与严格读取器共用同一个数字验证函数，只接受有限的ASCII十进制或科学计数法。下划线、NaN、Infinity、十六进制、非ASCII及额外字符整体拒绝。计划阶段使用`Decimal`比较数值语义；新旧数值相同即返回`patch_no_change`。

## 字节定位

计划阶段先调用既有`read_simple_zones`，再以二进制方式读取同一源快照。目标物理行依据读取器返回的1基源行号定位；行尾只按实际LF分隔，并保留CRLF。模块复用读取器的严格Zone行解释，随后只在行内注释前定位19个普通空格分隔记号。第8个记号的绝对`byte_start`和`byte_end`必须与读取结果中的编号、名称、flags、楼层、相对高度和体积一致，否则整体拒绝。

定位不依赖全文件字符串搜索，不解析或重建其他PRJ区块。未知区块、注释、空格、行尾和文件结尾通过保留原始字节实现保真，而不是理解后重新序列化。

## 计划与应用

`plan_zone_volume_patch(source_path, contam_number, new_volume_token)`只读源文件，不创建任何文件。它返回尚未应用的结构化Patch和单行Diff预览。

`apply_zone_volume_patch_to_copy(source_path, patch, output_path)`重新验证全部前置条件，不信任计划阶段缓存。应用前再次确认源哈希、大小、读取模式、文件头、Zone编号、名称、行号、字节范围和旧记号；任何偏差均不重新定位旧Patch，而是返回`patch_precondition_failed`。

输出必须是父目录已存在、扩展名为`.prj`且尚不存在的新路径，并且规范化后不得指向源文件。最终字节严格等于：

```text
source_bytes[:byte_start]
+ new_token.encode("ascii")
+ source_bytes[byte_end:]
```

写入先在输出目录创建受控临时文件，完整写入、flush并`fsync`，再通过不会覆盖既有目标的硬链接创建最终文件；不使用无条件覆盖操作。失败时清理临时文件，后置验证失败时删除本次新建的输出副本。

## 后置验证

应用完成后必须同时证明：

- 源文件SHA-256和大小未改变。
- 输出字节与计划的单记号替换完全一致。
- 目标范围之前与之后的所有源字节分别与输出对应字节一致。
- 严格Zone读取器可重新读取输出。
- Zone数量、编号和名称不变。
- 目标Zone只有`volume_m3`变化，其他已解析字段不变；其他Zone完全不变。
- 输出目录没有新增SIM、LOG或XLOG。

## CLI

计划JSON：

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.zone_volume_patch plan SOURCE.prj `
  --zone-number 1 --new-volume 650.0 --json
```

只显示单行Diff时将`--json`替换为`--diff`。应用到新副本：

```powershell
python\.venv\Scripts\python.exe -m contam_studio_core.zone_volume_patch apply SOURCE.prj `
  --zone-number 1 --new-volume 650.0 --output OUTPUT.prj --json
```

成功stdout只包含UTF-8 JSON或单独Diff；结构化错误写入stderr，且CLI边界不显示Traceback。CLI不会覆盖既有输出。

## 当前不支持

- 覆盖源PRJ或既有输出。
- Zone名称、楼层、flags、温度、压力及其他字段。
- 多Patch、Patch合并、并发编辑、撤销栈、稳定UUID或完整PRJ AST。
- 完整PRJ保存、编号重排、未知区块语义修改或复杂Zone记录。
- GUI审批、Tauri写入命令、AI自动应用或ContamX运行。

未来GUI接入必须先展示结构化Patch和Diff，取得用户确认，再通过统一领域接口应用；本切片不能直接交给AI自动执行。
