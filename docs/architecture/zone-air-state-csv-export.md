# Zone空气状态CSV导出契约

## 编码

CSV由Rust内存中的`ActiveResultContext`确定性生成：UTF-8、CRLF行尾、`.`小数点、固定列顺序和RFC 4180兼容转义。数字使用Rust可往返解析的十进制表示，不进行显示精度截断；`day_type=null`输出为空字段；样本顺序与严格结果一致。

固定列为：

```text
run_id
extraction_id
zone_number
zone_name
source_line_number
unit_system
sample_index
day_of_year
day_type
sim_time_seconds
temperature_k
reference_pressure_pa
air_density_kg_m3
```

文本字段包含逗号、双引号、CR或LF时使用双引号包裹，内部双引号加倍。为避免表格软件公式注入，以`=`、`+`、`-`、`@`、Tab或CR开头的文本字段会先加单引号；该规则不适用于真正的数值字段。

## 文件安全

- 输出路径只来自Rust原生保存对话框；React不提供路径或CSV正文。
- 只允许用户明确选择尚不存在的新`.csv`文件，不覆盖既有文件。
- 临时文件与目标位于同一目录，使用独占创建、完整写入、`flush`、`sync_all`和原子提交。
- 写入或提交失败时清理本次临时文件；成功后重新验证文件大小。
- 响应只返回文件名、577类数据行数、字节数和结果身份，不返回绝对路径。

相同活动结果两次编码必须产生完全相同的字节。CSV不包含源PRJ路径、manifest路径、SIM路径、文件正文、stdout或stderr。
