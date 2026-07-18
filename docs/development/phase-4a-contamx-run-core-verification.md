# Phase 4A ContamX运行核心验证

## 环境

- 日期：2026-07-18。
- 分支：`codex/phase-4a-contamx-run-core`。
- 基线：`41f74d6`。
- Windows x64；项目Python 3.12.10，使用`python/.venv`。
- 官方来源：[NIST Download CONTAM](https://www.nist.gov/el/beed/nist-multizone-modeling/software/contam/download-contam)；命令行契约依据[NIST CONTAM User Guide 3.4](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1887r1.pdf)第2.2节。

## 官方求解器证据

- NIST当前发布页列出的发行版为CONTAM 3.4.0.8，Windows 64位包为`contam-x-3.4.0.3-win64.zip`，官方SHA-256为`3F11B44513F1046D378226B3D63644493B78F0E8241DC70F83E319A458A14052`；下载后本地哈希完全一致。
- 包内目录`contam-x-3.4.0.3-Windows-64bit`包含`contamx3.exe`、`prjup.exe`、`simcomp.exe`和`simread.exe`。本任务只运行`contamx3.exe`，没有将任何二进制复制到仓库。
- `contamx3.exe`大小为1605120字节，SHA-256为`3B9A5EE9A6A3EA3CDC569DF607F4EC2A1AD4E74E53FEF8FBEC0B7E540A5D3AAD`，Windows文件版本为`3.4.0.3`，官方`--Version`输出为`3.4.0.3 64 bit`，PE machine为`0x8664`（Windows x64）。
- NIST软件页面说明该官方软件为美国联邦政府雇员履职产物，属于公有领域并带有免责声明；本仓库不捆绑该二进制，未来分发仍需保留官方来源与声明。
- 官方帮助确认调用形式为`contamx [input-file] [options]`，`[input-file]`是PRJ路径；本次使用相对快照文件名并将工作目录设为workspace。无参数运行会提示输入文件，因此生产核心不使用该交互路径。

## 实际成功运行

源样例为仓库官方fixture：`fixtures/contam/official-contamxpy/test_GetPrjInfo.prj`。

- 源SHA-256：`CE37F7BFB7F95AC49BABB117E49A22BBBA5DA7694491060B3166554EFCCCD96E`。
- 源大小：10978字节。
- 运行ID：`20260718T035011Z-fa906fc6`。
- 运行目录：`F:\Codex_File\CONTAM-Studio\phase-4a-contamx-run-core\runs\20260718T035011Z-fa906fc6`。
- 命令参数数组：`[contamx3.exe, test_GetPrjInfo.prj]`；工作目录为运行目录内的`workspace`。
- 退出码为0，未超时，manifest状态为`succeeded`。
- PRJ快照哈希和大小与源一致；源文件哈希、大小及源目录文件清单运行前后不变。
- 主要结果为非空`workspace/test_GetPrjInfo.sim`，大小545892字节，SHA-256为`E8CCAD872512DCA288A9F06C95F0A9CB8D7175F2853E2B14CE16F63FA390CF39`。同时记录了`.ach`、`.cex`、`.csm`、`.log`、`.rst`、`.xlog`和附加`.cex`生成物的大小与哈希。
- `evidence/stdout.bin`和`evidence/stderr.bin`均存在；该版本主要运行诊断写入stderr，原始字节只保存在evidence，不混入CLI JSON。

## 失败边界

- 在`F:\Codex_File`创建最小损坏PRJ并使用同一官方求解器执行真实失败运行；运行ID为`20260718T034553Z-1b3661a0`，ContamX退出码为2，manifest状态为`failed`，诊断包含`run_process_failed`和`run_expected_artifact_missing`，失败工作区与stdout/stderr证据均保留。
- 自动测试使用受控替身覆盖源文件不存在、未配置或相对求解器路径、快照不匹配时禁止启动、非零退出、超时、原始非UTF-8流截断、源文件变化、manifest拒绝覆盖和CLI无Traceback路径。
- 真实运行未向源fixture目录写入SIM、LOG、XLOG或临时文件；所有真实生成物位于`F:\Codex_File`任务目录。
- 当前未执行恶意PRJ或完整进程树治理实验；失败运行工作区和manifest保留，后续需要验证Windows Job Object和安装包场景。

## 结论

`ready_for_phase_4b_result_reading`：NIST官方Windows x64 ContamX版本、调用契约、输入快照、独立工作区、输出清单和成功证据已实际验证。Phase 5/4B仍需单独设计结果读取，不得把本次运行核心描述为结果分析器。

## 自动检查

- Python：156项测试通过，Ruff通过。
- 前端：28项测试通过，构建通过。
- Rust：12项测试通过，Cargo check和fmt通过。
- `git diff --check`和Markdown相对链接检查通过。
