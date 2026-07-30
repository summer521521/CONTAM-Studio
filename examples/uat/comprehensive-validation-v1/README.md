# CONTAM Studio 综合验收案例 v1

这是一套面向桌面GUI、领域边界和运行链路的可重复验收案例，不是工程建模模板，也不代表推荐的建筑设计参数。

案例本身不复制或改写官方PRJ。运行准备脚本后，它会把仓库中已有溯源记录的三个官方夹具复制到`F:\Codex_File`下的新目录，并生成附件、校验清单、截图目录和验收记录模板。

## 三条案例路径

1. `editable-three-zone`：三Zone可编辑主路径，覆盖语义树、三字段Patch、Diff、Revision、撤销/重做、草稿切换保护、ContamX运行和失败结果保留。
2. `results-seven-zone`：七Zone可信结果路径，覆盖只读原因、ContamX、SimRead、577个样本、图表、表格和CSV导出。
3. `nist-multilevel-boundary`：NIST三层住宅边界路径，覆盖多Level树、只读呈现、官方运行和无节点结果时的安全错误。

## 准备

从仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-comprehensive-validation-case.ps1
```

脚本每次创建一个新的时间戳目录，不覆盖旧案例。也可以指定目录和运行标识：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-comprehensive-validation-case.ps1 `
  -DestinationRoot F:\Codex_File\CONTAM-Studio\comprehensive-validation-v1 `
  -CaseRunId ui-redesign-round-01
```

生成目录中的`CASE-GUIDE.md`是完整手工验收说明，`manual-results-template.csv`用于逐项记录，`case-manifest.json`保存机器可读预期，`SHA256SUMS.txt`用于证明测试输入未漂移。

开发环境可运行案例合同：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tests\test-comprehensive-validation-case.ps1
```

## 边界

- 只使用测试夹具和生成副本。
- 不读取真实AppData、凭据或真实Provider。
- 不把自动预检替代为GUI、真实工具或用户验收。
- `valThreeZonesWthCtm-UseApi.prj`当前存在一个已复现的SimRead数值空格格式拒绝场景，详见案例清单和验收说明。
