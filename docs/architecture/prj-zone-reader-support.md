# PRJ简单Zone只读兼容范围

## 定位

`contam_studio_core.prj_zone_reader`是纯文档、只读且整体拒绝未知格式的最小读取器。它只提取经官方文档和样例共同验证的Zone子集，不调用contamxpy、ContamX、子进程或仿真初始化，不创建临时文件，也不表示完整PRJ已经加载。

- `reader_mode`：`strict_contam_3_4_simple_zone_v1`
- CLI：`python -m contam_studio_core.prj_zone_reader <PRJ路径> --json`
- 支持的精确文件头版本：`ContamW 3.4.0.0`、`ContamW 3.4.0.4`
- 文件头尾部字段：必须是整数，仅作为`header_variant`返回

其他旧版本、`3.4.0.8`、未来版本和未知文件头均以`unsupported_prj_version`拒绝，不按`3.4`前缀推定兼容。

## 支持的Zone记录

读取器严格匹配唯一的`<非负十进制数量> ! zones:`标记。数量行后必须紧跟以`!`开头的字段说明行；说明文本只用于确认已观察布局，不参与字段解释。

每个Zone必须位于单一物理行，移除行内`!`注释后恰好包含以下19个普通ASCII空格分隔字段：

```text
nr flags ps pc pk pl relHt Vol T0 P0 name color u_Ht u_V u_T u_P cdaxis vf_type cfd
```

- 整数字段必须使用十进制整数记号；`nr`必须为正且文件内不重复。
- `relHt`、`Vol`、`T0`和`P0`只接受普通ASCII十进制或科学计数法，并且转换结果必须有限；不接受Python下划线数字分隔符、NaN、Infinity、十六进制或额外字符，也不额外推测业务取值范围。
- 名称必须是最长15字符、不含空白的单一ASCII记号；不转义、改写大小写或规范化。
- `cdaxis`、`vf_type`和`cfd`必须全部为0。
- 声明数量的记录后必须立即出现独立的`-999`终止符。
- 文件使用严格ASCII解码，仅接受LF或CRLF行尾。

成功结果返回全部Zone、首个Zone、源文件SHA-256、大小、文件头、原始CONTAM编号和源行号。CONTAM编号只作为外部格式编号；当前不创建或伪造稳定UUID。

## 整体拒绝边界

下列情况不会返回部分Zone：

- 非ASCII字节、未列入允许清单的文件头或非整数文件头尾部。
- Zone区块缺失、出现多个候选、数量无效或字段说明行缺失。
- 记录数量不一致、终止符缺失、空行、纯注释行、续行或非19字段记录。
- 字段类型无效、非有限浮点数、重复或非正Zone编号。
- 含空格、非ASCII或超过15字符的Zone名称。
- 非零`cdaxis`、`vf_type`、`cfd`及其他未验证条件尾部。
- 读取前后源文件大小或SHA-256变化。

错误通过结构化`ReaderDiagnostic`返回，包含稳定错误码、消息、可空源行号和有限上下文。读取器不进行宽松恢复，也不在失败后调用Phase 2A的contamxpy检查入口。

## 明确不支持

- 其他PRJ区块、完整PRJ AST、未知区块解释或保留模型。
- PRJ保存、回写、编号重排、Zone编辑、Patch、Diff、撤销或稳定UUID映射。
- 含空格或非ASCII名称、条件字段、CFD/一维Zone尾部和未验证布局。
- GUI、Tauri命令、文件选择器或Python sidecar接入。

## 扩展原则

兼容范围只能在NIST官方文档与来源明确的官方样例共同支持，并通过纯读取结果、文件不变性和隔离contamxpy结果交叉验证后扩大。新增版本或布局必须更新集中允许列表、结构化错误、官方fixture、测试和本文件；不得以来源不明的用户文件或单次成功为依据泛化兼容性。
