# 当前状态

记录日期：2026-07-19。

## Phase 3C不可变草稿与撤销工作流

- 当前切片把原始PRJ固定为Revision 0基线，并由Rust在应用本地数据目录管理Revision 1及以后的不可变草稿快照。每次用户批准的`volume_m3` Patch只创建新快照，不覆盖源文件或已有快照。
- Zone获得由基线SHA-256、对象类型、CONTAM编号、基线源行号和名称生成的确定性UUID v5。该`zone_id`在同一基线的全部草稿、撤销、重做、运行和结果中稳定；不同字节基线不会复用身份。
- Rust线性历史支持撤销、重做、Undo后新修改截断Redo链，以及将当前Revision复制为用户明确选择且不存在的新PRJ。草稿不跨应用重启恢复，另存副本不自动切换项目。
- 活动ContamX运行、SimRead结果、统计图表和CSV导出均绑定当前Revision；Revision改变后旧运行、结果和导出上下文失效。当前仍只允许修改`Zone.volume_m3`，不是完整PRJ编辑器。
- 首轮真实GUI验收除草稿另存外均通过；另存复核发现并修复SHA-256十六进制大小写比较缺陷，修改后Revision的真实严格重读回归通过，当前仅待用户聚焦复核另存成功、拒绝覆盖和取消路径。ContamX状态在当前会话首次实际probe前显示待验证、运行成功后显示已验证版本，属于预期行为。

## Phase 5C Zone空气状态分析工作区

- 当前Zone的严格`zone_air_state`结果新增模块化ECharts三联曲线、确定性统计和完整语义化数据表切换。曲线不插值、不平滑、不采样，统计使用一次遍历在线均值且不改变原始样本或SI单位。
- Rust新增仅存在于桌面进程内存的`ActiveResultContext`，绑定项目session/SHA-256、Zone、运行、提取、来源和完整严格结果。提取失败或取消不覆盖，新项目和Patch副本清除，新运行成功保留旧结果以显示过期提示。
- 新增显式ACL命令`export_active_zone_air_state_csv`。React只提交结果身份；Rust在对话框前、写入前和写入后复核源PRJ SHA-256，路径由原生保存对话框取得，CSV使用固定13列、UTF-8、CRLF、RFC转义和公式注入防护生成，并以不可覆盖的同目录原子写入提交。
- 新增唯一前端依赖`echarts 6.1.0`（Apache-2.0），使用模块化Canvas折线图入口。自动检查及官方ContamX→SimRead→统计→生产Rust CSV→独立CSV重读的非GUI闭环已通过。用户已完成修正后的真实Tauri复核，Phase 5C手动GUI状态为`passed`；证据见[PR #13评论](https://github.com/summer521521/CONTAM-Studio/pull/13#issuecomment-5013358557)。

## Phase 4B-1受控桌面ContamX运行

- 新增显式ACL命令`run_active_contam_project`。React只提交request和项目session；Rust从活动项目内存取得规范化路径与SHA-256，并使用`<app-local-data>/runs`。
- Python桥新增`run_active_project`白名单操作，复用Phase 4A `run_contamx()`；项目SHA不匹配在求解器probe和运行目录创建前以`run_project_mismatch`拒绝。
- ContamX异常进程经过有界wait/terminate/kill/管道关闭和流线程冻结。无法确认退出时保留不可信残留目录，但不写Phase 5A可接受manifest或最终生成物哈希。
- Rust验证成功响应与活动项目、官方3.4.0.3身份、受控manifest路径和非空SIM一致，只向WebView发送安全摘要；最新成功manifest路径仅存Rust内存，项目或Patch副本切换时清除。
- 非GUI官方运行已成功并由Phase 5A验证器接受。自动验证与真实桌面手动验收均已完成；用户验收证据见[PR #11评论](https://github.com/summer521521/CONTAM-Studio/pull/11#issuecomment-5011099169)。Phase 4B-1已完成。

## Phase 5B-1桌面Zone空气状态摘要

- 新增受控`select_and_extract_zone_air_state`桌面命令。React只提交request、项目session和CONTAM Zone编号；Rust通过原生JSON对话框取得Phase 4运行清单，并将结果根目录限制在应用本地数据目录。
- Python桥新增显式`extract_zone_air_state`操作，复用Phase 5A接口并在SimRead启动前验证当前项目规范化路径、源SHA-256和Zone身份。
- React新增真实`zone_air_state`摘要和可滚动表格，当前只显示用户选择运行清单对应的当前Zone；Phase 5C在同一严格结果上增加曲线、统计和受控CSV，但仍不接受任意SIM。
- Phase 5B-1自动测试和真实Tauri交互已完成；官方Zone 1 `One`显示577个样本，首样本为293.15 K、-1.4222 Pa和1.2041 kg/m³，中英文与双主题正常，源PRJ及Phase 4 manifest/SIM保持不变。

## Phase 5B-2最新成功运行直达结果

- Phase 5B-2新增显式ACL命令`extract_active_run_zone_air_state`。React只提交request、活动项目session和Zone编号；命令不打开文件选择器，也不接受manifest、运行根或`run_id`。
- Rust验证`ActiveRunContext`与当前项目session/SHA-256一致，manifest严格位于`<app-local-data>/runs/<run_id>/evidence/manifest.json`，并复用Phase 5B-1相同的Python Phase 5A桥与结果契约。
- 活动运行入口返回的`run_id`必须与最新成功运行一致；Python返回后还会再次确认活动项目和运行未被替换。WebView只收到安全结果视图。
- 手动“选择已有运行清单”入口继续可用。新运行完成后旧表格不会被自动替换，而是显示非错误的过期提示，等待用户主动加载最新运行。
- 自动检查、非GUI官方闭环和真实桌面手动验收均已通过；用户验收证据见[PR #12评论](https://github.com/summer521521/CONTAM-Studio/pull/12#issuecomment-5011558413)。Phase 5B-2已完成。

## Phase 0初始状态

- 项目根目录最初包含`docs/`、`examples/`、`fixtures/`和`references/`四个目录；后三者为空。
- 唯一已有文件是研究报告`docs/research/2026-07-contam-studio-deep-research.md`。
- 初始目录没有Git仓库、项目基础文档、正式代码或技术栈依赖。
- Phase 0已建立Git仓库、项目规则、产品与架构文档，并将私有远程仓库设为`summer521521/CONTAM-Studio`。

## Phase 1实现

- 包管理器采用pnpm 11.9.0，仅提交`pnpm-lock.yaml`。
- 建立Tauri 2、React、TypeScript和Vite桌面应用；Rust端只保留应用启动所需的最小代码。
- 前端主要依赖为React 19、i18next、react-i18next、lucide-react和react-resizable-panels。
- 建立顶部工具栏、活动栏、模拟项目结构、中央欢迎页、属性/AI占位面板、底部面板和状态栏。
- 简体中文与英文可即时切换，浅色与深色主题可切换；语言、主题、面板尺寸、折叠状态和当前标签保存在`localStorage`中，并对损坏数据回退默认值。
- 未实现的打开、新建、保存、运行、设置等操作只显示“Phase 1占位功能”提示，不执行真实文件或求解器操作。
- Tauri能力仅启用`core:default`，未开放文件系统、Shell、HTTP、远程URL或自动更新能力。
- 工作台截图保存于`docs/ui/phase-1-workbench-shell.png`。

## 当前代码结构

```text
src/                  React工作台、组件、国际化和样式
src-tauri/            最小Tauri宿主、配置、能力和Windows图标
python/               隔离检查、严格Zone读取、Phase 3B JSON桥、副本Patch和测试
fixtures/contam/      有来源记录的contamxpy与NIST官方PRJ样例
docs/                 项目决策、状态与界面截图
package.json          前端脚本和依赖
pnpm-lock.yaml        唯一的Node依赖锁文件
```

## Phase 4A独立ContamX运行核心

- 分支`codex/phase-4a-contamx-run-core`在Windows x64、Python 3.12.10环境实现独立`contamx_runner`模块；当前不接入React、Tauri或桌面运行按钮。
- 使用NIST官方`contam-x-3.4.0.3-win64.zip`（CONTAM 3.4.0.8发布页，SHA-256为`3F11B44513F1046D378226B3D63644493B78F0E8241DC70F83E319A458A14052`）。包内实测可执行文件为`contamx3.exe`，Windows文件版本和官方`--Version`输出均为`3.4.0.3`，PE架构为Windows x64；求解器未复制进仓库。
- 求解器只接受CLI绝对路径或`CONTAM_STUDIO_CONTAMX`，不回退PATH、磁盘扫描、注册表或自动下载；当前还必须同时匹配官方3.4.0.3 EXE的文件名、大小、SHA-256、PE架构、Windows版本资源和受限`--Version`输出。
- 每次运行只在源项目目录树之外创建新的`run_id/workspace`和`evidence`；PRJ和显式配套文件绑定最初证据，并对复制前源、复制后源和workspace副本进行三方校验，进程启动前与结束后再次复核。ContamX使用参数数组、`shell=False`、固定工作目录和白名单Windows环境运行，manifest记录源目录文件/子目录清单、输入完整性、流证据、退出码、超时和全部生成物哈希。
- 真实运行已使用官方`test_GetPrjInfo.prj`完成，退出码为0，生成非空`.sim`以及`.log`、`.xlog`等文件；源PRJ哈希、大小和源目录内容保持不变。运行输出仅保留在`F:\Codex_File`任务目录中，未提交二进制或运行产物。
- Phase 4A运行核心只把非空`.sim`作为主要结果存在证据，不解析SIM内容；失败、超时和非零退出同样保留失败manifest。桌面运行在Phase 4B-1接入，但仍不支持批量运行、自动结果读取、进程树完整治理、求解器打包和分发。
- Phase 4A运行核心及边界加固完成后，Python测试合计180项通过；Ruff、前端测试/构建和Rust测试/检查保持通过。

## Phase 1验证

- `pnpm build`通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`通过。
- Tauri桌面应用已实际启动，窗口成功创建且像素检查确认不是白屏或黑屏。
- 在本地渲染界面中验证了中英文、浅色/深色主题、面板折叠和刷新后的状态恢复；浏览器控制台无错误或警告。
- `git diff --check`在提交前执行。

## Phase 2A技术Spike

- 使用Windows 11 x64、Python 3.12.10和项目虚拟环境`python/.venv`。
- 固定运行依赖`contamxpy==0.0.9`；开发依赖仅为pytest 8.4.2和Ruff 0.12.12。
- 官方样例`test_GetPrjInfo.prj`来自contamxpy 0.0.9源码分发包，原样复制并保留官方`LICENSE.txt`。
- 通过公开`cxLib`、`setupSimulation(1)`、`nZones`和`zones`接口取得7个Zone；首个Zone为编号1、名称`One`。
- 临时副本在启动contamxpy前验证SHA-256与源文件读取前哈希一致；不一致时禁止调用原生库。
- 执行前后源样例SHA-256均为`ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e`，fixture目录未产生新文件。
- 结构化结果使用`source_unchanged`、`execution_mode=isolated_steady_initialization`和`generated_artifacts`区分源文件状态、执行语义与生成物。
- contamxpy会执行稳态初始化并生成SIM、LOG等文件；检查器将输入复制到临时目录，并用一次性子进程隔离原生崩溃和生成物，不建立长期sidecar服务。该子进程不是权限沙箱，也不能防御恶意构造的PRJ。
- 损坏PRJ的直接原生调用实测可能以Windows访问冲突退出，因此不允许在GUI或主Python进程中直接调用该加载路径。
- Python核心尚未接入React或Tauri，也未开放新的Tauri权限。

## Phase 2A验证

- `python/.venv/Scripts/python.exe -m pytest ./python/tests`通过，共12项测试。
- `python/.venv/Scripts/python.exe -m ruff check ./python`通过。
- 官方样例CLI输出可解析的UTF-8 JSON，原生诊断未混入标准输出。
- 前端构建和Rust检查在本次提交前重新执行。

## Phase 2B-1严格Zone文档读取

- 新增独立`prj_zone_reader`，固定`reader_mode=strict_contam_3_4_simple_zone_v1`。
- 读取器只使用Python标准库，不导入contamxpy、`subprocess`、`tempfile`或Phase 2A执行入口，不调用ContamX或仿真初始化。
- 精确支持`ContamW 3.4.0.0`和`ContamW 3.4.0.4`文件头，以及单行、19字段、ASCII名称、三个条件字段均为0的简单Zone记录。
- 对非ASCII、未知版本、重复区块、数量或终止符不一致、字段类型错误、重复编号、含空格或超长名称、条件尾部及未验证布局返回结构化错误，整个调用不返回部分结果。
- 数据模型返回全部Zone、首个Zone、源文件哈希与大小、文件头、原始CONTAM编号和源行号；当前不创建稳定UUID。
- 官方fixture新增contamxpy样例`valThreeZonesWthCtm-UseApi.prj`和NIST教程样例`demo1c.prj`，均保留原始文件名、字节和来源记录。
- 三份官方样例分别读取7、3、7个Zone；首个Zone为`One`、`one`、`Attic`，并与Phase 2A隔离contamxpy结果的编号、名称、flags、体积和楼层一致。
- 纯读取前后官方样例的SHA-256、大小和目录内容不变，没有生成结果文件。
- 独立CLI为`python -m contam_studio_core.prj_zone_reader <PRJ路径> --json`；原`inspect_prj`继续表示隔离稳态初始化检查。
- Python测试共65项通过，覆盖严格ASCII十进制/科学计数法、超长整数结构化错误和CLI无Traceback边界；Ruff、前端构建和Rust检查在本次提交前重新执行。
- 该读取器尚未接入React或Tauri，不支持其他PRJ区块、保存、回写或编辑。

## Phase 2C真实Zone桌面闭环

- Phase 2B-1在PR #4最终以65项Python测试、Ruff、前端构建和Cargo检查通过的状态合并至`main`；合并提交为`7a33ece`。
- 文件选择和读取合并为Rust侧唯一的`select_and_read_prj_zones`命令。React只提交`request_id`，无法向命令指定源路径；Rust打开原生对话框，验证本地文件、`.prj`扩展名并规范化路径后才调用Python。
- `build.rs`通过`AppManifest`登记该命令，main窗口capability只授予`core:default`与`allow-select-and-read-prj-zones`；前端dialog依赖和权限已移除，未开放文件系统、Shell、HTTP、远程URL或自动更新能力。
- React不读取文件、不启动进程；Rust宿主把内部持有的规范化选择路径作为JSON请求字段，通过参数数组启动一次性Python进程，并将结构化Envelope返回前端。取消选择以独立`cancelled`响应返回，不伪装为读取错误。
- Python桥现使用协议`1.2`，显式允许读取、计划Zone体积Patch、应用到副本和提取Zone空气状态四个操作；stdout仅输出一条JSON，运行诊断不进入前端，未处理异常不会泄露Traceback。
- Python解释器按`CONTAM_STUDIO_PYTHON`绝对路径、仓库内`python/.venv/Scripts/python.exe`顺序发现；缺失时返回`python_runtime_not_found`，不回退到PATH、全局Python或Microsoft Store别名。
- Rust端超时为10秒，stdout上限2 MiB、stderr上限16 KiB；超时终止进程，并拒绝非UTF-8、无效JSON、协议不匹配、request_id不匹配、非零退出、超大输出及任意非空stderr。
- Python响应先进入不可序列化到WebView的Raw类型；Rust验证诊断code，以固定消息替换Python原始message，并对白名单context执行类型检查与120字符截断。成功diagnostics和失败error使用同一规则，TypeScript清理保留为第二道防线。
- Python成功结果的`source_path`必须规范化后与Rust实际选择路径一致；不一致、路径失效或无法规范化时整体返回`python_response_source_mismatch`，不返回两个路径。
- 前端项目状态使用`idle/selecting/loading/loaded/cancelled/unsupported/error`互斥状态；请求序号与`request_id`共同阻止旧响应覆盖新状态。新项目加载失败时保留上一次成功项目，首次失败保持欢迎页。
- Phase 2C最初以源哈希、CONTAM编号和源行号组成临时选择键；Phase 3C已由基线SHA-256及Zone身份生成稳定UUID v5并取代该临时键。CONTAM编号继续只用于显示和外部格式映射。
- 项目摘要明确显示文件头、Zone数、源文件大小、SHA-256缩略值、严格读取模式及未解析其他PRJ区块的边界；不支持文件不会显示部分项目树。
- Node依赖包括`@tauri-apps/api 2.11.1`和模块化图表`echarts 6.1.0`，测试依赖为`vitest 4.1.10`；前端`@tauri-apps/plugin-dialog`已移除。Rust依赖保留`serde 1.0.228`、`serde_json 1.0.150`、`tauri-plugin-dialog 2.7.1`，并新增仅启用v5功能的`uuid 1.24.0`。相关项目均为MIT、Apache-2.0或双许可证，来自持续维护的官方仓库。
- 正式界面截图为`docs/ui/phase-2c-real-zone-project.png`，内容来自实际Tauri窗口，PNG为1443×931。

## Phase 2C验证

- Python测试77项通过，覆盖桥接成功/失败Envelope、协议、request_id、非法stdin、未知操作、内部异常、stdout/stderr契约和源文件完整性；Ruff通过。
- 前端Vitest测试15项通过，覆盖单参数桌面API、取消/响应契约、状态转换、一般错误、旧响应、零Zone、多Zone、Zone选择、属性、只读提示和双语错误文案；前端构建通过。
- Cargo测试20项通过，覆盖显式ACL、取消、诊断清理、路径一致性、非空stderr、解释器发现、请求/响应契约、进程失败、超时、非UTF-8、无效JSON、输出限制和三个官方fixture；Cargo检查通过。
- 实际启动`pnpm tauri dev`并在真实Tauri窗口验证文件选择、取消、Zone切换、中英文、浅色/深色主题、错误展示和失败后保留上一次成功项目。
- 三份官方fixture在GUI分别显示7、3、7个Zone，首个Zone依次为`One`、`one`、`Attic`；源SHA-256和大小保持不变，fixture目录没有新增SIM、LOG或XLOG。
- 在`F:/Codex_File/CONTAM-Studio/phase-2c-zone-gui-integration/`验证未知版本、非ASCII、缺失Zone区块、超长整数、NaN、Infinity、十六进制和超大科学计数法；均结构化拒绝且stdout只有一条JSON、stderr为空、无Traceback。

## Phase 3A-0 Zone体积副本Patch

- 新增`zone_volume_patch`和冻结dataclass模型，固定`schema_version=1.0`、`patch_type=replace_zone_volume`、`status=planned`，唯一支持字段为`volume_m3`。
- 严格读取器与Patch共用`strict_numeric.parse_ascii_finite_float`，只接受有限ASCII十进制或科学计数法；Patch使用`Decimal`判断数值无变化并保留用户合法新记号。
- Patch绑定源规范化路径、SHA-256、大小、读取模式、文件头、CONTAM编号、Zone名称、源行号、旧记号、旧数值和绝对字节范围；Vol为19字段记录中从0开始计数的`token_index=7`。
- 计划接口只读源文件并生成结构化Patch与目标Zone单行Diff，不创建输出或临时文件。
- 应用接口重新验证全部前置条件，不重新定位失效Patch；输出必须是父目录已存在、后缀为`.prj`且尚不存在的新路径，规范化后不得指向源文件。
- 输出严格使用`source[:byte_start]+new_token+source[byte_end:]`生成；通过同目录临时文件完整写入、flush、`fsync`和不会覆盖既有目标的独占落盘完成，未使用整份PRJ重建或无条件覆盖。
- 后置验证确认源哈希与大小不变、输出仅目标记号变化、严格读取器可重读、Zone数量与身份不变、目标Zone其他字段及其他Zone不变；失败会删除本次新建副本。
- 三份官方fixture分别把Zone 1体积从600改为650.0、300改为325、90改为95.5；目标范围前后字节比较均完全相同，源SHA-256与大小不变，输出目录无新增SIM、LOG或XLOG。
- `test_GetPrjInfo`修改副本经Phase 2A隔离contamxpy 0.0.9交叉验证，官方API返回7个Zone和首个Zone体积650.0；生成物只存在于隔离临时目录并已清理，contamxpy不是Patch运行依赖。
- 独立CLI支持`plan --json`、`plan --diff`和`apply --output ... --json`；成功stdout不混入诊断，失败stderr为结构化JSON且不显示Traceback，默认不覆盖。
- Phase 3A-0新增56项Python测试，完整Python测试共133项通过；Ruff、前端及Rust回归检查也在本次提交前通过。
- Phase 3A-0交付时尚未接入React或Tauri；其领域函数在Phase 3B被复用，仍不支持源文件覆盖、Zone名称或其他字段、多Patch、稳定UUID、撤销、完整PRJ保存或AI自动应用。

## Phase 3B Zone体积桌面审阅与副本闭环

- Rust新增仅存在于进程内的活动项目session和完整Patch上下文；打开新项目会清除旧Patch，session不落盘、不写入`localStorage`且不是稳定UUID。
- 前端计划请求只提交`request_id`、`project_session_id`、Zone编号和新体积记号；应用请求只提交`request_id`、session和`patch_id`，不能提供源路径、输出路径或完整Patch。
- Python协议升级为`1.1`，显式白名单支持读取、计划和应用三个操作；计划复用Phase 3A-0领域函数并返回完整Patch和单行Diff，应用严格解码Rust保存的Patch、创建副本并再次严格读取。
- Rust验证完整计划结果后只向WebView返回安全审阅视图；源路径、字节范围、前置条件和完整Patch不跨IPC。Python诊断仍在Rust边界清理，TypeScript清理仅作为第二道防线。
- 用户明确点击“另存为新副本”后，输出路径才由Rust原生保存对话框取得。取消不启动Python且保留审阅；源路径、既有输出、错误后缀或无效父目录均失败关闭。
- 应用成功后Rust验证应用结果和重读文档，桌面切换到新副本并保持目标Zone选择；失败保留原项目。打开、计划和应用由宿主门闩串行化，session和`patch_id`防止旧操作覆盖新状态。
- main窗口ACL仅授予`core:default`和打开、计划、应用三个受控应用命令；前端仍无dialog、文件系统、Shell或HTTP权限。
- Python测试142项、前端Vitest 28项和Rust测试12项已通过；Ruff、前端构建、Cargo检查及格式检查通过。实际Tauri窗口验证在文件选择阶段被用户按下`Escape`中止，未据此声称完整桌面闭环或正式Phase 3B截图已验证。

## 尚未实现

桌面GUI已接入一个Zone体积的Diff审阅、不可变草稿Revision、稳定Zone UUID、撤销/重做和安全另存副本，并可对当前Revision运行ContamX、读取`zone_air_state`、显示曲线与统计和导出CSV。尚未实现完整PRJ加载、其他区块解析、源文件保存或回写、完整领域模型、多字段或多Patch事务、跨重启草稿恢复、其他结果类型、多Zone/多运行比较、运行历史、AI调用、网络服务或Python打包分发；Phase 3C和Phase 5C不得解释为完整编辑或结果分析系统。

## 待验证问题

- PRJ完整格式、无损解析、无损回写、未知区块保留、编号重排和复杂引用关系。
- 一次性Python进程方案在安装包中的运行时冻结、定位、升级、签名和取消策略；是否需要在后续阶段改为长期受控sidecar仍待证据。
- ContamX支持版本、发现方式、捆绑方式及对应许可和第三方声明。
- Windows 10/11 64位安装、签名、sidecar生命周期和依赖兼容性。
- 中英文CONTAM术语表及其与官方术语的一致性。
- AI提供方的本地/联网边界、上下文披露、审批协议和确定性验证契约。
## Phase 5A官方SimRead结果提取

- 已验证与Phase 4相同NIST官方包中的`simread.exe`：3.4.0.3、Windows x64、34816字节，SHA-256为`85AF9B559DEBB6ECF9BA2F73705CEF60F14D32C5F8ED9B524823FA3AC85A6958`。
- 结果入口绑定成功的Phase 4 manifest，复制PRJ和SIM到全新提取工作区；不接受任意SIM路径，不修改Phase 4运行证据。
- 首个结果类型为`zone_air_state`，通过官方`.nfr`文本严格读取Zone空气状态，单位为K、Pa和kg/m³。真实Zone 1 `One`得到577个样本，首样本为293.15 K、-1.4222 Pa、1.2041 kg/m³。
- Phase 5B/5C已在桌面展示当前Zone并支持受控CSV副本导出；当前仍没有路径流量、污染物浓度、直接SIM二进制解析或其他结果类型。
## Phase 5A加固状态

- Phase 4 manifest现在以单次bytes快照严格验证，完整绑定官方ContamX身份、PRJ/SIM哈希和运行目录；主PRJ的source与snapshot字段必须逐项一致，成功清单diagnostics必须为空。
- 提取阶段在多个时点复核Phase 4证据、工作区PRJ/SIM和SimRead二进制身份；工作区创建后成功和失败均通过同一result-manifest模型保留进程、流证据和SimRead生成物。工作区创建前的拒绝不写伪造清单。
- Zone在启动SimRead前预验证；公开CLI不接受直接NFR或SIM。
- `day_type`返回null并标注不可用来源；累计时间从首个样本起算。当前仍只支持`zone_air_state`，桌面分析不改变这一领域边界。
- 当前Phase 5A Python测试共255项通过，新增编排级TOCTOU、进程收口、父管道关闭、流证据冻结、最终证据和清单Schema验证；真实Zone 1仍为577个样本。
