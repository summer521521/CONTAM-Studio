# Phase 3C不可变草稿、撤销与另存副本验证

验证日期：2026-07-19。

## 自动验证

- Python：`266 passed`；Ruff通过。覆盖既有严格读取、Patch、ContamX和SimRead回归。
- Rust：默认测试`27 passed, 1 ignored`；另以真实Phase 5A结果显式运行被忽略的生产CSV契约测试，`1 passed`。默认测试覆盖确定性UUID、真实Python Patch生成Revision 1/2、Undo/Redo、Redo链截断、基线变化拒绝、字节精确另存、不覆盖和路径不泄露；`cargo fmt --check`及`cargo check`通过。
- 前端：Vitest为`10 files, 99 tests passed`；生产构建通过。覆盖UUID选择、草稿Revision替换、导出状态、工具栏禁用与可访问名称、快捷键和安全桌面API。
- 通用：Markdown相对链接、JSON解析、锁文件、依赖许可证和`git diff --check`均在交付前复核。

## 非GUI真实闭环

验证产物只允许位于`F:\Codex_File\CONTAM-Studio\phase-3c-draft-snapshots-undo`，不提交PRJ副本、内部快照、SIM、manifest、NFR或CSV。闭环使用官方`test_GetPrjInfo.prj`：

1. 记录原始SHA-256、大小和目录清单，建立Revision 0及Zone 1确定性UUID。
2. 通过生产Python Patch接口连续创建两个只改变Vol记号的内部副本，Rust测试将其登记为Revision 1和2。
3. 验证UUID不变、每个Revision哈希不同，Undo 2→1→0和Redo 0→1→2返回预期体积。
4. Undo到Revision 1后创建新Revision 2，验证旧Redo链不可达且未覆盖任何快照。
5. 把当前Revision字节精确另存为不存在的新PRJ，严格重读并验证Zone身份一致；源文件保持不变。
6. 对当前Revision使用官方ContamX运行、官方SimRead提取Zone 1结果，并以既有生产契约验证统计输入和CSV编码。

实际结果：

- Revision 0：Zone 1体积`600.0`，SHA-256为`CE37F7BFB7F95AC49BABB117E49A22BBBA5DA7694491060B3166554EFCCCD96E`，大小10978字节。
- Revision 1：体积`650.0`，SHA-256为`AAC8AD0A3788A8CD8654B0C70DBFA6F5A097447B1E2FC4CC42E719B1281F5F5C`，大小10980字节。
- 原Revision 2：体积`700.0`，SHA-256为`D0E36E0AD3D3C0E3C72E7D1F4616BB632A50A8105DA4FEE49B511FE441D672D9`。Undo至Revision 1后生成的新Revision 2体积为`675.0`，SHA-256为`AE75A469A1D2563028C5B7B140921A8167BAAB558C2FEC466F98CB8EACAFC466`；旧Redo链在Rust生产历史测试中不可达并清理。
- Zone 1稳定UUID始终为`b1fa4253-7260-5b20-95f4-94d13bf8b6fa`。严格读取源、两个原Revision、新分支Revision和另存副本均得到7个Zone，除目标Vol记号外字节保持不变。
- 另存副本与当前Revision 2字节、SHA-256及大小完全一致，未自动切换项目且未覆盖既有文件。
- 官方ContamX运行ID为`20260719T005210Z-a73dbc22`，版本3.4.0.3，退出码0，产生1个非空SIM；manifest绑定当前Revision SHA-256 `AE75...C466`。
- 官方SimRead提取ID为`20260719T005210Z-7eb2d6fd`，Zone 1得到577个样本；首样本为293.15 K、-1.4222 Pa、1.2041 kg/m³。结果manifest绑定同一运行和Revision SHA-256，六项最终证据均为true。
- 生产TypeScript统计输入得到0至172800秒、577个严格递增样本；三项常量数据的最小值、最大值和平均值分别为293.15 K、-1.4222 Pa和1.2041 kg/m³。
- 生产Rust CSV编码得到577个数据行、578个CRLF、58550字节，SHA-256为`2C736618178CD87A5904BF03F3209184197F6F83AA39BBB321ABF86EA43C7451`，不包含项目绝对路径。
- 验证结束后原始PRJ的SHA-256、大小、修改时间及源目录直接条目均与开始证据一致；临时验证产物全部位于任务专用`F:\Codex_File`目录，未进入仓库。

## 安全断言

- React只提交`zone_id`、session、Revision和Patch/运行/结果安全身份，不提交路径或CONTAM编号。
- Rust内部快照路径不序列化到WebView；项目视图只含文件名。
- Revision切换失败不移动cursor、不清除可靠运行或结果；成功切换才清除旧上下文。
- 原始PRJ、已有目标和内部快照均不可覆盖。
- 当前只支持`Zone.volume_m3`，不声称完整PRJ无损编辑。

## GUI状态

用户于2026-07-19完成首轮真实GUI验收：Patch审阅、Revision 1/2、Undo/Redo、Redo链截断、快捷键、当前草稿运行、结果、统计、CSV、双语和双主题均正常；项目切换会清除旧草稿历史。ContamX在本次桌面会话首次运行前显示“状态待验证”，运行成功后显示已验证的`contamx3.exe 3.4.0.3`，符合按实际probe结果更新状态的契约。

首轮验收发现“另存当前草稿”在字节复制成功后误报`draft_export_verification_failed`并删除输出。原因是Python项目SHA-256使用小写十六进制，Rust本地复核使用大写十六进制，而导出路径曾使用区分大小写的字符串比较。修复后导出复核按SHA-256语义进行大小写无关比较，并在严格重读前规范化已创建的输出路径；聚焦真实Python桥测试验证修改后Revision的字节、大小、Zone UUID和Zone视图全部一致。当前手动GUI状态：`pending_user_recheck`，只需复核另存成功、同名拒绝和取消保留草稿，不重复已通过项目。
