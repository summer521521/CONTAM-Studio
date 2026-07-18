# Phase 3A-0 Zone体积Patch验证

## 环境与范围

- Windows 11 x64
- Python 3.12.10，项目虚拟环境`python/.venv`
- 严格读取模式`strict_contam_3_4_simple_zone_v1`
- 唯一修改字段`volume_m3`
- 所有实际输出和contamxpy隔离临时目录位于`F:/Codex_File/CONTAM-Studio/phase-3a-zone-volume-patch/`

本验证没有修改React、Tauri命令或权限，没有调用ContamX运行项目，也没有把contamxpy加入Patch计划或应用路径。

## 官方fixture闭环

| 源样例 | Zone | 旧记号 | 新记号 | 源大小 | 输出大小 | 输出SHA-256 |
|---|---:|---:|---:|---:|---:|---|
| `test_GetPrjInfo.prj` | 1 `One` | `600` | `650.0` | 10978 | 10980 | `aac8ad0a3788a8cd8654b0c70dbfa6f5a097447b1e2fc4cc42e719b1281f5f5c` |
| `valThreeZonesWthCtm-UseApi.prj` | 1 `one` | `300` | `325` | 9932 | 9932 | `b45f230e1e4154a4ed47bfe7d06b14ecdf3631125c9c0df72053e15854a40707` |
| `demo1c.prj` | 1 `Attic` | `90` | `95.5` | 7668 | 7670 | `267ec8f1e6ca4a25267e8c4cef79ec6eebe6783677fc801c3c9998f72fe8aade` |

三份输出均由严格读取器重新读取，目标体积分别为650.0、325.0和95.5。Zone数量、编号、名称及其他已解析字段不变。源fixture前后SHA-256仍为：

- `test_GetPrjInfo.prj`：`ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e`
- `valThreeZonesWthCtm-UseApi.prj`：`1cafb2f0fef511f19ef88358238a1c1175c593187691ff7545db982f5e6e75ed`
- `demo1c.prj`：`1e2623d8904c0d37f0eb207099782ad2c1895dba4032e0511b9c8a188748f406`

## 字节保留证据

每个输出均按Patch记录的绝对字节范围执行独立比较：目标范围之前字节完全相同，目标范围替换为批准的新ASCII记号，目标范围之后字节完全相同。三份样例的前缀与后缀比较均为`true`。因此空格、CRLF或LF、行内注释、其他行、文件结尾和所有未解析区块均保持原字节；没有通过语义模型重新序列化PRJ。

Patch应用目录未新增SIM、LOG或XLOG。contamxpy交叉验证产生的ACH、CEX、CSM、LOG、RST、SIM和XLOG只存在于Phase 2A隔离临时目录，并在调用结束后清理。

## contamxpy交叉验证

对新副本`test_GetPrjInfo-zone1-650-verified.prj`执行现有Phase 2A隔离检查。contamxpy 0.0.9通过`setupSimulation(1)`返回7个Zone，首个Zone为编号1、名称`One`、体积650.0；检查前后该副本SHA-256均为`aac8ad0a3788a8cd8654b0c70dbfa6f5a097447b1e2fc4cc42e719b1281f5f5c`。该执行只用于交叉验证，不是Patch运行依赖，也不是纯文档读取。

## 自动检查

最终执行：

```powershell
python\.venv\Scripts\python.exe -m pytest .\python\tests
python\.venv\Scripts\python.exe -m ruff check .\python
pnpm test
pnpm build
cargo test --manifest-path src-tauri\Cargo.toml
cargo check --manifest-path src-tauri\Cargo.toml
cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
git diff --check
```

Python测试包含56项Phase 3A-0新增测试，覆盖三份官方fixture、单记号字节比较、LF/CRLF、行内注释、无变化值、非法数字、全部关键前置条件、输出路径竞态、写入失败清理、后置验证失败删除、CLI和静态依赖边界。完整Python测试共133项通过；Ruff、前端15项Vitest、前端构建、Rust 20项测试、Cargo check与fmt及`git diff --check`均通过。

## 验证边界

本验证只证明三个官方简单Zone样例的单个`Vol`记号可安全写入全新副本。它不证明完整PRJ保存、复杂Zone回写、未知区块语义可编辑、并发Patch、多字段修改、撤销、稳定UUID、GUI审批或AI应用已经解决。
