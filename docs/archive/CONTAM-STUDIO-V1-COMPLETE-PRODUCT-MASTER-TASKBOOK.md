# CONTAM Studio v1 Complete Product Master Taskbook

> Revision 2, 2026-07-24: continuous implementation first, one consolidated H review, one guided U acceptance, and a separate release authorization.

## 中文使用说明

这是一份交给低思考强度模型连续执行的完整产品任务书。正文采用紧凑的工程英语，是为了让后续模型准确识别固定任务ID、接口名、状态词和验收词；本节用中文说明你真正会得到什么。

最终目标不是“给现有软件加一个聊天框”，而是完成一个可以安装和日常使用的CONTAM工作台：

1. 保留原有CONTAM/ContamW/ContamX使用方式，不重写求解器，不默认覆盖原始PRJ。
2. 改善项目打开、对象查看、修改审批、场景管理、运行、结果、比较、导出和报告的界面与操作。
3. 支持经过验证的仿真类型，而不是假装任意PRJ、任意建筑图和任意物理问题都能自动完成。
4. AI可以读取用户明确选择并确认披露的图片、PDF、Office文件、表格、文本、日志和受控CONTAM证据。
5. AI可以根据需求询问缺失参数、选择受支持模板、制定方案、准备修改、执行用户批准的完整任务、处理技术错误、比较结果并写报告。
6. AI不能直接拿到整个硬盘、通用Shell、任意文件写入、隐藏联网、自动覆盖/删除或自行批准工程假设。
7. 没有AI、没有网络或没有Codex时，打开、修改、运行、结果、比较和导出等核心功能仍可使用。
8. 软件完成后，仓库还必须包含一套面向非软件工程用户的中文架构学习材料和七次入门练习。

任务书共有108张正式任务卡，分为13个Wave。任务卡是需求清单，不是108次停机、汇报、全量测试和审批。自2026-07-24起采用“连续实现版”执行协议：低思考模型从当前干净分支继续，把全部可自动实现内容做成一个完整候选版本，然后再统一复核。

| Wave | 你可以把它理解为 | 主要结果 |
|---:|---|---|
| 0 | 把前面未通过复核的工程基础修好 | 得到可信开发基线 |
| 1 | 明确v1到底服务谁、完成什么 | 产品契约和支持范围 |
| 2 | 把开发原型改成真正工作台 | 安全、清楚、可反复使用的界面 |
| 3 | 看懂经过验证的CONTAM项目内容 | 无损文档边界和领域对象 |
| 4 | 安全修改和管理不同仿真方案 | Patch、Diff、Revision、模板、场景 |
| 5 | 管好ContamX/SimRead和本地数据 | 进程、取消、历史、输入、存储 |
| 6 | 完成结果分析与科研证据 | 分页结果、统计、比较、研究、报告 |
| 7 | 让普通Windows用户能够安装 | Python运行时、工具、安装器、离线验证 |
| 8 | 安全接收各种图片和文件 | 附件中心、解析、预览、引用、隐私 |
| 9 | 建立强AI的受控运行基础 | App Server、证据、语义工具、审批 |
| 10 | 让AI完成一整个受支持仿真任务 | 需求到方案、运行、结果、报告 |
| 11 | 系统性找问题 | CI、交互测试、模糊测试、安全、性能 |
| 12 | 真正交付并帮助你学习 | GUI验收、用户测试、发布、架构课程 |

任务书里的角色含义：

- L：低思考强度模型。按本任务书已经冻结的保守默认值连续设计、实现、测试、构建和整理证据。
- H：高思考强度模型。在完整自动化候选版本形成后集中复核高风险设计，不再逐卡阻断实现。
- U：你。在候选版本完成后集中体验真实GUI、连接官方工具、决定分发与最终发布，不需要处理中间工程细节。

低思考模型可以无人值守地完成“自动化候选版本”，但不能自行声称完成真实GUI体验、官方工具许可、干净电脑安装、目标用户试用、签名或发布。缺少这些外部证据时，只把对应验收项记为`pending_final_acceptance`并继续，不得停在中间等待。

完整产品本身仍包含桌面界面、CONTAM语义、进程与数据、附件安全、AI权限、安装和测试，工程量不小；本版删掉的是重复流程，不是删掉产品功能。实现过程中不再为每张小卡单独建日志、跑Full、提交或请求批准。

~~~yaml
task_id: CONTAM-STUDIO-V1-COMPLETE
purpose: complete the supported CONTAM Studio product without harming native CONTAM use
audience: low-reasoning implementation model, high-reasoning reviewer, user/product owner
planning_artifact_only: true
source_workspace: F:\CONTAM Studio
execution_workspace: F:\Codex_File\temp\contam-studio-v1-complete
stable_main_at_planning: 81205f49301859007e39b193e6a5b6ff0b5aebb4
unreviewed_foundation: codex/batch-03x-foundations@22aa972c37ea9a2cc5cb09f27589d8dee3b205d8
resume_branch: codex/contam-studio-v1-complete
resume_head_2026_07_24: 24cb7aa9bd20ff96dd866829735065563d4dab98
resume_next_card: close FE-04 under the ATT-02 follow-up rule, then DOM-05
planned_cards: 108
effort_policy: do not estimate, pause, or report based on card count or elapsed hours; implement continuously
reporting: continuous implementation; return only at a true hard stop or after the complete automated candidate
push: forbidden until an explicit later user instruction
~~~

## 0. What "Complete" Means

CONTAM Studio v1 is a Windows-first, offline-first, bilingual desktop workbench for teaching and research. It preserves official CONTAM use instead of replacing it:

~~~text
user requirement + supported files/images
  -> local evidence extraction and missing-input questions
  -> compatible existing PRJ or approved template
  -> semantic scenario plan
  -> structured Patch and deterministic Diff
  -> explicit user approval
  -> official ContamX and SimRead
  -> trusted result store, comparison, report, evidence package
~~~

The AI is strong in the same useful sense as Codex: it can understand a task, inspect selected evidence, ask precise questions, make a plan, use registered semantic tools, prepare a complete supported simulation, run an approved action bundle, diagnose technical errors, analyse results, and write a report. It must never silently invent a building, a physical boundary condition, a unit, an occupancy/source schedule, a scientific conclusion, or a file write. If a request exceeds an approved profile, it asks for the missing data, proposes a supported template, or says it cannot safely perform that part.

### v1 Definition Of Done

1. Standard Windows 10/11 x64 users can install, use, update manually, and uninstall Studio without Node, Rust, source code, or system Python.
2. Users can tell whether a project is editable, read-only, incompatible, corrupt, missing inputs, or missing verified tools.
3. A supported workflow is complete: inspect -> draft -> Diff -> approve -> run -> results -> compare -> export -> report.
4. Mouse, keyboard, template wizard, spreadsheet mapping, and AI all use the same semantic domain operations.
5. Original PRJ files are never overwritten by default; unknown content is preserved or the project is read-only/rejected.
6. Runs and results are tied to immutable inputs, actual tool identity, companion inputs, bounded process evidence, and retention policy.
7. Images, PDFs, Office documents, spreadsheets, text, safe archives, and CONTAM artifacts enter through a safe attachment broker with explicit remote disclosure.
8. Core work remains functional with AI disabled, disconnected, or offline.
9. AI has no generic filesystem, Shell, network, raw PRJ write, dynamic MCP, or permission authority.
10. Actual release requires automated, real-tool, clean-machine, GUI, user-study, security, licensing, and publication evidence. Tests alone are not a release.

## 1. Target Architecture And Trust Boundary

~~~mermaid
flowchart LR
  UI["React workbench"]
  Host["Tauri/Rust trusted host"]
  Domain["Python CONTAM domain core"]
  Tools["Official ContamX + SimRead"]
  Store["Owned artifact/evidence store"]
  Attach["Attachment broker/adapters"]
  Agent["Optional Codex App Server runtime"]
  Gateway["Semantic CONTAM tool gateway"]
  UI -->|stable IDs and user intent| Host
  Host -->|bounded typed protocol| Domain
  Domain -->|controlled arguments| Tools
  Host <--> Store
  Host <--> Attach
  Agent <--> Gateway
  Gateway --> Host
  Attach -->|selected sanitized evidence| Agent
  UI -->|preview and approval| Host
~~~

| Layer | Owns | Never owns |
|---|---|---|
| React/WebView | interaction, rendering, harmless local preferences, review controls | file paths, raw PRJ, authority, output ownership, tool identity |
| Rust/Tauri | ACL, trusted identity, revisions, artifacts, processes, policy, indexes, evidence registry | CONTAM scientific semantics |
| Python | PRJ profile semantics, deterministic Patch calculation, result semantics, official-tool adaptation | generic desktop permissions or final file commit |
| Official tools | numeric solve and official conversion | project lifecycle, permissions, AI approval |
| AI | plans, explanation, tool requests, report narrative | direct files, commands, state changes, scientific truth |

### AI authority modes

| Mode | User-facing purpose | Allowed | Not allowed |
|---|---|---|---|
| Explain | answer from selected evidence | read-only evidence tools | attachments without preview, any state change |
| Collaborate | inspect and ask questions | selected attachment evidence, plan draft | Patch/run/export |
| Prepare | make a reviewed simulation plan | candidate operations/action bundle draft | execution |
| Execute approved plan | finish an exact pre-approved bundle | revalidated Patch, run, extract, compare, report | deviation, generic retry, overwrite/delete |
| Never in v1 | broad agent power | none | Shell, generic files, generic network, hidden defaults, autonomous loops |

## 2. Non-Negotiable Execution Rules

1. Work only in a clean clone under F:\Codex_File\temp\contam-studio-v1-complete. Do not modify or inspect user PRJ/SIM/CSV, real AppData, credentials, system settings, or the dirty source workspace.
2. For a fresh execution start with Wave 0. For the current clean branch `codex/contam-studio-v1-complete@24cb7aa`, accept the recorded Batch A and Batch B ledger through DOM-04, close FE-04 under its ATT-02 follow-up rule, and continue at DOM-05. Do not reclone, redo automated-verified cards, or rerun their old Full checks. The old BATCH-03X branch remains changes_requested and is not the baseline.
3. Execute cards as requirements inside the five continuous batches in Section 3. One batch may cover many cards and one coherent implementation may satisfy several cards.
4. Read AGENTS.md and this taskbook once when starting/resuming, then read only the ADRs/tests relevant to the current batch. Maintain one truthful task log and one status ledger per batch, not one log per card.
5. Each boundary change needs focused positive and fail-closed negative tests. Run focused tests while developing; run Full and git diff --check only at the five batch checkpoints, not after every card. Batch E adds one final clean stability Full.
6. Missing GUI, official-tool, clean-Windows, licence, provider, H-review, or user evidence does not stop implementation. Mark the exact row `pending_final_acceptance`, keep the affected dangerous capability disabled when required, and continue all independent work.
7. Never claim synthetic fixtures are real ContamX, SimRead, Codex, App Server, GUI, installation, or user evidence.
8. No rebase, amend, squash, force push, merge, publish, global dependency mutation, or broad Tauri permission expansion. Project-scoped dependencies are pre-authorized only under Section 2.1; record them in manifests, locks, notices, and the batch log.
9. Unknown PRJ grammar or uncertain preservation becomes read-only/deferred. Missing external tools, providers, licences, formats, or real evidence becomes a disabled/deferred capability. Continue other work instead of requesting approval.
10. Never execute macros, scripts, installers, embedded executables, arbitrary archives, or prompt text as instructions.
11. Never repeat the same failing command without a relevant code/configuration change. After three materially different, documented attempts on an optional capability, fail closed, mark only that capability `deferred_with_reason`, and continue the batch.
12. A true hard stop exists only when continuing would require touching protected user/system data, using credentials, packaging a proprietary/official/licence-unknown binary that cannot be omitted, enabling broad machine authority, transmitting unconfirmed user data, publishing, or when the repository itself is no longer safely recoverable. This does not prohibit a local unpublished candidate containing the project-built frozen Python worker and locked permissive dependencies already authorized by Section 2.1.
13. Do not use `deferred_with_reason` as a shortcut for difficult or lengthy work. The supported P0 inspect -> Patch -> revision -> run -> result -> compare -> report workflow, core offline UI, attachment broker, semantic AI gateway, bounded ActionBundle, installer candidate, tests, and learning documents must be implemented unless a true hard stop makes that exact capability impossible.
14. Do not create new task explosions, subcard marathons, audit-only batches, speculative frameworks, or another master plan. ADRs and contracts record decisions needed by working code; they are not substitutes for working UI -> Rust -> Python/tool -> evidence vertical slices.
15. No placeholder screen, fake recent item/tree/result, inert button, hard-coded success, mock-only production path, or documentation-only claim satisfies a product card. When external evidence is unavailable, keep the real adapter disabled but complete the surrounding production path, strict interface, synthetic contract tests, and honest unavailable state.

### Checkpoint verification

~~~powershell
git -c core.quotepath=false status --short --branch
powershell -NoProfile -File scripts\verify.ps1 -Mode Full
git diff --check
~~~

Focused tests may run as often as needed. `Full` runs once at the end of Batches A-D. Batch E runs it twice only when the first run is clean and the second run is being used as final stability evidence. Retry a failure only after a relevant change; do not burn time rerunning an unchanged failure.

### 2.1 Pre-Authorized Conservative Defaults

The user authorizes these defaults for creation of the automated candidate. They supersede every card-level phrase such as `Role: H`, `Role: U`, `after Hx`, `until approved`, `only then`, `unlock`, or `Stop`. Those labels now identify final review ownership, not an implementation stop.

1. **Product/profile:** v1 first completes the smallest workflow already supported by sourced fixtures and current verified semantics: inspect a compatible existing PRJ, make a controlled Zone-volume scenario change, review a deterministic Diff, run external official ContamX, extract a supported Zone air-state result through SimRead, compare revisions, and create an evidence-backed report. A second profile is scenario comparison over the same proven object/result families. New object families may be implemented only with sourced goldens; otherwise they remain visible read-only and are listed as deferred, without blocking the product.
2. **PRJ/document:** the selected source is immutable. Work only on Studio-owned copies and immutable revisions. Preserve original bytes, encoding/newlines, spans, ordering, comments, and opaque/unknown content. A no-op is byte-identical. If preservation or reference semantics cannot be proved, classify the project/object read-only; never guess or normalize it.
3. **Patch:** GUI, templates, import mapping, and AI all emit the same versioned `PatchTransaction`: source/baseline/current hashes, profile, stable object and operation IDs, typed before/proposed values and units, preconditions, evidence, expiry, idempotency key, and provenance. Reject stale or ambiguous patches. Apply to a new revision, reparse and validate it, and never renumber or rewrite unknown references speculatively.
4. **Process:** on Windows create one Job Object per controlled operation, enable `KILL_ON_JOB_CLOSE`, create the child suspended, assign it before resume, and fail closed if ownership cannot be established. Use one monotonic absolute total deadline; reserve a bounded cleanup portion, drain stdout/stderr concurrently under byte limits, terminate the whole Job on cancel/timeout/exit, and reject late success. Public states are `queued`, `starting`, `running`, `cancel_requested`, `succeeded`, `failed`, `timed_out`, `cancelled`, and `unknown_cleanup`; `cancelled` requires job/process termination proof. Route ContamX, SimRead, Python workers, and Codex App Server through the shared controller where their lifecycle permits it.
5. **Process dependency:** a target-specific direct dependency on the already resolved `windows-sys` family is allowed with minimum required features, `MIT OR Apache-2.0` evidence, lockfile update, and no global installation. Prefer the version compatible with the locked Tauri tree and record binary/package cost.
6. **Storage:** distinguish external source/export paths from Studio-owned `revision`, `run`, `result`, `report/evidence`, `attachment-derivative`, `AI-archive`, `cache`, `temporary`, and `quarantine` objects. Never delete external sources/exports. Persistent user work is retained by default; only owned incomplete temporary objects older than 24 hours and reproducible cache may be automatically reclaimed. Use a default 10 GiB soft quota and 20 GiB hard quota; warn at soft quota, reclaim only eligible cache/temp, then reject new writes rather than deleting persistent work. AI archive remains opt-in.
7. **Storage lifecycle:** cleanup shows exact objects, paths relative to the owned root, sizes, dependencies, and exclusions before confirmation; active, pinned, last recoverable revisions, evidence cited by a report, sources, and exports cannot be selected. Migration is versioned copy -> hash/parse verification -> atomic activation with rollback; unknown/newer schemas open recovery/read-only. Uninstall retains Studio data by default; a separate in-app purge requires preview and explicit confirmation.
8. **Official tools/distribution:** ContamX and SimRead remain external user-selected executables for v1. Record exact path identity internally, version, hash, PE architecture, and changed/missing state; do not scan the disk/PATH broadly and do not bundle them without later licence approval. Build an unsigned, unpublished local installer candidate with a project-owned frozen Python sidecar and notices; signing, update channel, tag, and publication remain final user actions.
9. **Dependencies/formats:** project-scoped libraries are allowed when needed, actively maintained, locked, compatible with commercial/research desktop distribution, and permissively licensed (`MIT`, `BSD`, `Apache-2.0`, `ISC`, or clearly compatible equivalent). Record licence, purpose, alternatives, package size, native/runtime cost, and notices. Reject or defer a format when no safe compatible library exists; never install system/global packages or execute active content.
10. **Attachments:** default intake limits are 50 MiB per file and 100 MiB per batch, 40 megapixels per image, 200 PDF pages, 20 workbook sheets, 100,000 rows per sheet, 200 columns, 1,000,000 non-empty cells, 1,000 archive entries, 500 MiB expanded archive size, nesting depth 2, and compression ratio 20:1. Limits must be configurable downward and enforced before expensive work. Reject encrypted content, macros, scripts, legacy active binaries, external links requiring fetch, embedded executables, traversal, links, normalization collisions, and unsupported containers. Preserve original attachment as external evidence only when explicitly selected; AI receives only sanitized derivatives and citations.
11. **AI/provider:** AI is optional and disabled until the user connects an exact supported local Codex App Server. Reuse its own authentication without reading or copying credentials. No generic Shell, filesystem, network, raw PRJ writer, dynamic MCP, or hidden tool. A remote turn receives only the user-selected disclosure preview and records provider/version, derivative hashes, pages/sheets/items, purpose, and consent receipt.
12. **AI actions:** the assistant may prepare candidate patches and one complete bounded `ActionBundle`. Execution requires one explicit user approval for the exact ordered bundle hash, project/revision hashes, tools, outputs, limits, and expiry; approval is single-use and expires after 15 minutes. Any semantic deviation, new attachment, changed input/tool, broader output, or scientific assumption creates a new review. Allow at most two purely technical retries that do not alter approved scientific inputs.
13. **GUI/external evidence:** implement and automate all feasible states now. Manual GUI feel, real official tools, clean-machine installation, remote provider behavior, target-user study, signing, and publication stay `pending_final_acceptance`; they never block unrelated code.
14. **Feature enablement:** unreviewed PRJ writes, state-changing AI actions, remote attachment transmission, destructive cleanup, and migration stay behind explicit feature/policy flags or fail-closed runtime checks. The complete implementation and tests may exist before final H/U review; the unsafe capability must not silently turn itself on.

### Consolidated final gates

| Gate | Decision | Owner |
|---|---|---|
| H-FINAL | one concentrated review of foundation, lossless PRJ, Patch, process, storage, result, attachment, AI gateway, authority and security after all automated batches | H |
| U-FINAL | one guided acceptance of product scope, GUI, real tools, remote disclosure, clean Windows, installer data behavior and target-user workflow | U with H/L support |
| RELEASE | licence/signing/package hashes/tag/channel/publication | U, explicit separate instruction |

## 3. Card Format

Cards are acceptance requirements inside these uninterrupted batches:

| Batch | Cards | Checkpoint result |
|---|---|---|
| A | FND-01 through PRD-08; already automated-verified on the current branch | conservative ADR/product/architecture baseline |
| B | FE-01 through DRAFT-08 | usable workbench, lossless supported domain, common Patch/revision/scenario path |
| C | PROC-01 through DIST-06 | controlled processes/tools/data/results/reports and local installer candidate |
| D | ATT-01 through AGT-08 | bounded multimodal attachment hub and complete supported simulation assistant |
| E | QA-01 through CLOSE-01 | automated quality/security/performance, documentation, learning set, and final acceptance package |

For each batch:

1. Confirm branch/worktree/base once and open one batch log with a card-status table.
2. Implement all applicable cards in dependency order. A vertical slice may satisfy multiple cards; do not create empty scaffolding merely to tick IDs.
3. Run focused tests for changed boundaries and affected suites. Keep working through failures; do not run Full per card or per commit.
4. External/manual rows become `pending_final_acceptance` and optional unsupported rows become `deferred_with_reason`; neither blocks independent cards.
5. At the checkpoint, reconcile the status table, run one Full and diff check, then create a small number of coherent vertical-slice commits including the batch log.
6. Continue immediately into the next batch without reporting. Do not wait at old H/U labels.

Card Acceptance/Verify clauses define the intended evidence. For the automated candidate, a card may be `automated_verified` while its real GUI/tool/provider/clean-machine row remains `pending_final_acceptance`. Only the consolidated final review may call the product accepted or released.

## 4. Wave 0: Foundation Recovery

### FND-01 Isolated clone and baseline
- Do: create a new clone, separate venv/cache/temp roots, branch codex/contam-studio-v1-complete from verified origin/main; record OS/tool versions and first Full counts.
- Do: confirm no borrowed node_modules, junctioned venv, user fixtures, real AppData, secrets, or dirty original files are read.
- Test: path/branch checker, origin SHA check, Full, diff check.
- Accept: reproducible clean baseline and truthful log.

### FND-02 Defect ledger for BATCH-03X review
- Do: create a structured ledger for every existing H finding: workflow parser, cache producer, placeholder Unicode, task log truth, module visibility, process callsite inventory, SAFE command tests, DATA mapping, RESULT labeling.
- Do: give each finding a reproduction input, expected failure reason, regression card, severity, owner, and H re-review criterion.
- Test: ledger checker fails for a missing regression or false completed state.
- Accept: the unreviewed branch is recorded as changes_requested and no defect can disappear into prose.

### FND-03 CI and supply-chain parser remediation
- Do: replace fragile source-string checks with a deliberately restricted parser/grammar that rejects unsupported YAML forms rather than skipping them.
- Do: test bare/quoted/anchored/aliased/commented/malformed uses keys, hidden mutable refs, fake Full command in comments, permission drift, action drift, runner drift, and timeout drift.
- Test: every mutation asserts nonzero exit and expected diagnostic class; actual workflow passes locally without claiming hosted CI.
- Accept: workflow contract cannot hide unpinned actions or skipped Full.

### FND-04 Cache, placeholder, and task-log remediation
- Do: make pnpm store producer/consumer checking include workspace config and resolved path; reject storeDir/node_modules redirection and duplicate producers.
- Do: decode JSON before placeholder scan; reject escaped undeclared placeholders, duplicate/unused declarations, malformed placeholder syntax.
- Do: enforce task-log critical keys, finite duration, UTC parsing, status vocabulary, and index/record equality.
- Test: expected diagnostic mutations for every bypass.
- Accept: hidden configuration and false status evidence fail closed.

### FND-05 Rust visibility and process inventory remediation
- Do: cover public structs/enums/traits/types/statics/constants/unions/extern/reexports/modules, unknown syntax, and required public facade reexports.
- Do: make process inventory bidirectional and function-scope aware; every discovered Command/Popen call must be registered and every registration must point to the right function.
- Test: public union/extern/glob escape, hidden module, wrong owner, ninth process call, wrong function map.
- Accept: new public or process authority cannot bypass contracts.

### FND-06 SAFE, DATA, RESULT evidence remediation
- Do: test actual command paths for staging cleanup failures and lower-case SHA reread.
- Do: bind lifecycle declarations to actual functions and storage joins; mark counterfactual result measurements as non-production.
- Do: test metadata bounds rather than a hardcoded boolean and prove no failure cleanup deletes a competing target.
- Test: real command regression, reverse inventory mutations, result boundary suite.
- Accept: automated evidence describes what production actually does.

### FND-07 Process/storage ADRs
- Role: L using Section 2.1 defaults; H reviews at H-FINAL. Do: write the definitive ADRs for Job Object lifecycle, total deadlines, cancellation, pipe draining, PID proof, artifact classes, quota, migration, cleanup, uninstall, recovery, and public status vocabulary.
- Continue: incorporate the existing evidence package, commit the ADRs with Batch A, and proceed directly to FND-08/PRD work.
- Accept: implementation has one explicit conservative process/persistence policy and does not invent card-local variants.

### FND-08 H0 admission
- Role: L automated admission now; H repeats the independent review at H-FINAL. Do: reconcile every ledger defect, verify intended mutation reasons with focused foundation suites, and record the admitted implementation SHA list without claiming H approval. The single Batch A Full runs after PRD-08.
- Accept: no open foundation defect is hidden; unresolved optional defects are isolated and the implementation continues.

## 5. Wave 1: Product Contract And Design Target

### PRD-01 v1 product contract
- Role: L drafts from Section 2.1 defaults; H+U reviews at final acceptance. Preserve historical v0.1 contract, publish candidate v1 scope, personas, P0/P1, non-goals, release blockers, data-safety red lines, measurable completion criteria.
- Do: define complete simulation as a supported-profile workflow, not arbitrary geometry reconstruction or unbounded autonomous agent.
- Accept: U1-ready product contract with no invented scientific/legal decisions.

### PRD-02 User journeys
- Do: map learner, researcher, teacher, offline, AI-assisted, failure, and recovery journeys from first launch to evidence/report.
- Do: for every step list user intent, visible information, irreversible action, confirmation, error recovery, evidence output, screen, semantic tool, and test.
- Verify: journey-to-card traceability checker and bilingual terminology review.

### PRD-03 Supported profile candidates
- Role: L defines the frozen narrow profiles and evidence gaps; H+U reviews at final acceptance. Define at least two profile candidates with source/license/hash, required PRJ sections, editable objects, companion inputs, result types, units, official-tool proof, exclusions, and required human inputs.
- Do: select a recommended smallest meaningful profile such as controlled ventilation/contaminant scenario; never promise full arbitrary PRJ.
- Accept: U1 has an evidence-backed profile decision to approve.

### PRD-04 Information architecture
- Do: freeze Project, Draft, Runs, Results, Compare, Report, Attachments, Assistant, Settings, Activity, and Evidence surfaces.
- Do: remove fake recent projects, fake trees, Phase vocabulary, placeholder actions; hide unavailable destinations.
- Verify: route/state diagram and safe local preference policy.

### PRD-05 Design system
- Do: define semantic tokens for protected source, draft, run state, deterministic evidence, AI interpretation, warning/failure; focused desktop density; stable panel/control dimensions; icon tooltips; modal/toast rules.
- Verify: token contract, bilingual overflow checks, 100-200 percent scaling specification.

### PRD-06 Bilingual terminology contract
- Do: create controlled Chinese/English glossary, unit/rounding rules, domain key namespaces, user-vs-internal terminology boundary.
- Test: key parity, placeholder parity, unsafe HTML/path leakage, untranslated dev error mutation.
- Accept: UI distinguishes fact, deterministic validation, AI interpretation, uncertainty, and unsupported condition.

### PRD-07 Architecture ADR set
- Role: L writes candidate ADRs from Section 2.1; H reviews them together at H-FINAL. Freeze interfaces for document index, semantic graph, Patch transaction, process/controller, artifacts, results, attachment broker, AI gateway, packaging, observability.
- Do: record dependencies, license/maintenance/package cost, compatibility/migration/version rules.
- Accept: low model has exact boundaries and no excuse for ad hoc cross-layer changes.

### PRD-08 U1 profile approval
- Role: L records the Section 2.1 profile and authority defaults; U+H reviews them at final acceptance.
- Accept: Waves 2-3 continue immediately; unresolved scientific object families are explicitly read-only/deferred rather than blocking the supported profile.

## 6. Wave 2: Safe Workbench UX

### FE-01 Real Patch approval modal
- Do: centralize a modal state that blocks project open/switch, navigation, run, export, undo/redo, attachment changes, conflicting shortcuts, and assistant actions while a Patch Diff awaits approval.
- Do: permit only Back, Cancel, Apply; restore focus to the initiating control on every exit path; show protected original, active revision, object, before/after, unit, deterministic validation, and stale reason.
- Test: every blocked command, direct malicious invoke rejected by Rust, late response, Escape/focus, language/theme/selection preservation.
- Accept: users cannot accidentally act around a pending change; manual GUI feel remains `pending_final_acceptance` without blocking implementation.

### FE-02 Project-switch draft protection
- Do: detect unexported draft work and offer Cancel, Export Draft Copy, or Discard Session Draft according to the frozen policy.
- Do: keep the old project fully usable after picker cancel, unsupported project, parse failure, export failure, or stale response.
- Test: concurrent opens, duplicate request, late response, discard confirmation, export collision, no source/user-export deletion.
- Accept: switching projects cannot silently lose work or leave a visible project disabled.

### FE-03 Application-exit protection
- Do: add a Rust-owned close protocol for active draft, run, export, ingestion, and AI work; browser beforeunload is not authoritative.
- Do: offer only policy-approved choices and never report a process stopped until process evidence confirms it.
- Test: repeated close, late completion, cancelled cleanup, failed draft export, unknown_cleanup recovery on next launch.
- Accept: exit is honest and bounded; unresolved cleanup stays visible.

### FE-04 Split frontend controllers
- Do: freeze behavior tests, then extract every controller that has real state in the current product: project, draft, run, result, and AI. Do not invent an empty Attachment controller before ATT-02; ATT-02 must add and extract the real controller when AttachmentBroker state exists.
- Do: preserve generation/request IDs, stale-response invalidation, command availability, modal ownership, and safe-view types.
- Test: controller unit tests plus cross-controller conflict/race tests; migrate all controllers coherently and run Full only at the Batch B checkpoint.
- Accept: root App becomes composition/layout rather than the current product state machine; the status ledger records the explicit ATT-02 follow-up without keeping FE-04 or Batch B open.

### FE-05 Real workbench navigation
- Do: implement the approved Project, Draft, Runs, Results, Compare, Report, Attachments, Assistant, Settings, Activity, and Evidence destinations.
- Do: default to useful Project work; hide unavailable actions; no fake recent data, project tree, settings, Phase labels, or marketing landing screen.
- Test: route availability for no project, read-only/incompatible project, review modal, active run, results, disconnected AI, narrow window.
- Accept: every visible command performs a real supported action or clearly states why unavailable.

### FE-06 Project Health
- Do: present safe filename, hash prefix, version/profile, source protection, editable/read-only/unsupported areas, missing companions, and tool readiness.
- Do: map every issue to the smallest corrective action/help entry; never show absolute paths, raw Python errors, manifests, command lines, or raw logs.
- Test: all compatibility classifications, project/revision invalidation, localization, accessibility, long labels.
- Accept: users understand safety and readiness before editing/running.

### FE-07 Semantic object explorer and inspector
- Do: build a stable-ID tree for Project, Levels, Zones, Paths, Schedules, Species, Sources, Scenarios, Runs, Results, Attachments.
- Do: render editable/read-only/opaque fields from host capability descriptors; show units, references, evidence, and support badges.
- Test: keyboard tree semantics, duplicate labels, stale ID, missing child, revision remap, bilingual names, screen reader.
- Accept: no selection or edit authority depends on UI index, path, or CONTAM number.

### FE-08 Real Settings, Help, Recovery
- Do: implement language/theme, tool status/configuration, privacy/AI opt-in, storage display/cleanup preview, offline help, diagnostics, and recovery center.
- Do: keep paths/secrets in Rust; settings see safe tool identity/status only; support bundle preview precedes export.
- Test: corrupt settings, migration, reset, language switch, privacy race, tool refresh, support archive collision/redaction.
- Accept: configuration is useful without expanding desktop permissions.

## 7. Wave 3: Lossless Supported PRJ Domain

### DOM-01 Sourced fixture corpus
- Do: manifest every fixture/template by provenance, primary source, licence/redistribution, version, SHA-256, size, profile, intended test, and exclusions.
- Do: include minimal positive official/synthetic fixtures and negatives for corrupt sections, unknown version/encoding, duplicates, broken references, unsupported graph.
- Test: source hash before/after, no derived SIM/NFR/log tracked, reject unmanifested tracked PRJ-like assets.
- Accept: no user project or unlicensed mystery file enters tests/releases.

### DOM-02 Lossless document envelope
- Role: L using Section 2.1 defaults; H reviews at H-FINAL. Define original bytes, encoding/newline evidence, section/line/byte spans, opaque sections, profile capabilities, and resource limits.
- Do: conservative index parsing; unknown grammar, ambiguous continuation, mixed encoding, invalid delimiter, oversized input causes read-only/reject.
- Test: exact byte round-trip for no-op accepted documents; LF/CRLF, final newline, comments, oversized line/section/token, malformed terminator mutations.
- Accept: accepted unknown content is provably preserved; no generic AST claim.

### DOM-03 Stable identities and reference graph
- Do: version stable IDs based on baseline identity plus object category/external evidence; define invalidation after number/label/reference changes.
- Do: typed supported reference graph with dangling, duplicate, prohibited cycle, collision, cross-profile, and opaque-reference validation.
- Test: deterministic ordering, valid multi-reference, every invalid edge, persisted identity compatibility.
- Accept: drafts/runs/results/AI bind stable objects, never UI positions.

### DOM-04 Level and Zone projection
- Do: freeze exact profile fields, syntax, units, ranges, source evidence, read-only/editable flags; unsupported fields remain opaque.
- Do: expose only stable ID, safe label/summary, unit, capability, evidence ID.
- Test: numeric boundaries, NaN/Infinity/locale decimals/exponent overflow, official fixture cross-check, bridge/UI goldens.
- Accept: broader inspection without claiming complete Zone semantics.

### DOM-05 Airflow paths/components
- Role: L for semantics supported by sourced goldens; H reviews at H-FINAL. Freeze minimum endpoint categories, direction convention, component types, parameters, references, units, unsupported controls.
- Do: distinguish outdoor/Zone/special endpoints; reject unsupported endpoint/component/control patterns as a whole.
- Test: duplicate path, self-reference, missing component, invalid endpoint, unsupported parameterization, official fixture behavior.
- Accept: profile airflow network is inspectable with exact exclusions.

### DOM-06 Schedules/day types/time profiles
- Role: L for semantics supported by sourced goldens; H reviews at H-FINAL. Freeze grammar, time basis, resolution, day types, coverage, units, boundary/interpolation rules.
- Do: immutable typed series and paged detail; every schedule marked inspect/edit/AI-propose/opaque.
- Test: nonmonotonic/duplicate/missing points, midnight boundary, unsupported day type, invalid unit/range, stale reference.
- Accept: schedule behavior is explicit enough for a real profile.

### DOM-07 Species and sources/sinks
- Role: L for semantics supported by sourced goldens; H reviews at H-FINAL. Freeze first supported species/source forms, units, concentration/reference rules, Zone/path/schedule links, result expectation.
- Do: make source rate, occupancy proxy, outdoor concentration, schedule, and interpretation visible assumptions.
- Test: wrong unit, stale reference, unsafe numeric, multiple unsupported species, nonlinear/advanced source rejection; real official-tool nontrivial result.
- Accept: first contaminant profile has real semantics rather than labels.

### DOM-08 Minimal controls and companion boundary
- Role: L using the conservative supported profile; H reviews at H-FINAL. Use the smallest controls actually proved by fixtures and prefer a no-control profile when it answers the question safely.
- Define: explicit companion types, chooser, containment, hashes, case collisions, Unicode, missing/changed behavior, no recursive discovery/PATH/registry.
- Test design: missing, replaced, path escape, duplicate canonical name, oversized companion, run-manifest proof.
- Accept: candidate ADR and fail-closed implementation are complete; unproved controls remain read-only/deferred.

### DOM-09 Compatibility classification
- Do: implement supported_editable, supported_readonly, incompatible, corrupt, missing_companion, tool_incompatible with profile/evidence/safe reason/action.
- Do: never return a misleading partial semantic project for incompatible input; opaque sections allowed only with preservation proof.
- Test: entire corpus, unknown classification/schema field, source hash unchanged, no path/raw-content leak.
- Accept: one trustworthy verdict gates explorer/edit/run/AI.

### DOM-10 H2/H3 domain gate
- Role: L performs the automated audit now; H independently repeats it at H-FINAL. Review byte preservation, resource bounds, semantics, graph, units, companions, safe views, available official evidence, and rejection cases.
- Confirm: no write operation introduced before Patch ADR; no unsupported content defaulted.
- Accept: automated audit and defect list recorded; Wave 4 starts immediately with unreviewed writes feature-gated.

## 8. Wave 4: Semantic Drafts, Templates, Scenarios

### DRAFT-01 PatchTransaction ADR/schema
- Role: L using Section 2.1 defaults; H reviews at H-FINAL. Define schema version, baseline/current revision hashes, profile, stable object/operation, before/proposed values/units, preconditions, evidence, expiry, idempotency, provenance.
- Define: exact allowed operations, one-operation/multi-operation policy, stale conditions, semantic Diff, audit, double-click/lost-response/interrupted-apply behavior.
- Forbid: model/UI paths, raw PRJ edits, byte offsets, CONTAM numbers, revision/patch/output IDs supplied as authority.
- Accept: schema, ADR, contract tests, and fail-closed feature gate exist before state-changing UI/AI code uses it.

### DRAFT-02 First meaningful semantic operation
- Do: implement one profile-backed schedule/source/ventilation parameter via plan -> Diff -> approve -> immutable revision -> strict reread -> graph validation.
- Prove: only approved span/token changes; all other bytes including opaque sections, encoding, newlines, terminators, companion bindings remain equal.
- Test: unit/range, stale revision/object, wrong profile, concurrent target, duplicate request, undo/redo/export, real official-tool before/after.
- Accept: one scientifically useful non-raw edit.

### DRAFT-03 Second independent operation
- Role: L only when the second operation has sourced semantic goldens; otherwise mark this operation deferred and continue. H reviews at H-FINAL.
- Do: reuse exactly the same transaction/Diff/revision/export path; no separate AI/GUI writer.
- Test: each alone, sequential revisions, undo/redo branch, invalid target/layout, official before/after.
- Accept: two human operations prove reusable safety before AI proposals.

### DRAFT-04 Persistent immutable revision history
- Do: persist snapshots, transactions, parent/current pointers, safe summaries, ownership markers, quota/retention using approved artifact schema.
- Do: crash-safe commit-last index, interrupted recovery, reopen read-only/editable only after all identity checks.
- Test: corrupt/partial record, migration, storage full, concurrent write, import impersonation, export/discard/cleanup boundaries.
- Accept: restart does not silently lose approved draft work or threaten source files.

### DRAFT-05 Scenario entities and lineage
- Do: define baseline/child scenarios, purpose, assumptions, variable list, parent, revision, expected result, status, evidence.
- Distinguish: scenario vs run; one scenario can have repeated runs/tool versions but immutable input lineage.
- Test: branch, stale revision, duplicate name/request, cross-baseline rejection, archive/restart recovery.
- Accept: A/B studies are explicit scientific variants.

### DRAFT-06 Approved templates and guided instantiation
- Role: L may use only a redistributable, source-manifested compatible fixture/template; H+U reviews at final acceptance. Define parameter map, required inputs, allowed operations, results, notes, licence/version/hash.
- Do: schema-driven form and assistant intake; every run-affecting default/assumption is reviewed; instantiate only through Patch transactions.
- Test: template conformance against official tools, unsupported graph, migration, missing input, output evidence.
- Accept: a complete supported simulation can begin from a trusted template without generic CAD authoring.

### DRAFT-07 Scenario workspace
- Do: show baseline, active revision, assumptions, changes, provenance, run/results, stale state; create/branch/rename/archive/export by policy.
- Do: selection controls exact revision eligible for edit/run; comparison candidates come from scenarios, not arbitrary files.
- Test: empty/corrupt/imported/stale scenario, long/bilingual labels, keyboard, malicious ID/payload.
- Accept: users manage controlled variants without raw file juggling.

### DRAFT-08 H3 write-path gate
- Role: L performs the automated write-path audit now; H repeats it at H-FINAL. Audit GUI/template/future-AI paths for direct writes; verify shared transactions, opaque/source preservation, references, persistence identity, audit provenance, and available official-run evidence.
- Continue: AI may implement candidate operations behind its policy flag; multi-operation behavior remains explicit reject unless covered by the frozen ActionBundle contract.
- Accept: automated audit recorded and no bypass is enabled; continue to Batch C.

## 9. Wave 5: Process, Tools, Runs, Data

### PROC-01 Windows process controller
- Role: L using Section 2.1 process defaults; H reviews at H-FINAL. Implement Job Object/suspended assignment, handles/PIDs/deadlines/cancel reason/stream state/final proof.
- Enforce: total and sub-budgets for probe/run/graceful termination/forced termination/drain/join; any Assign/Resume/Wait/Terminate/Query/Join failure is honest failure.
- Test: child trees, injected Windows API failures, timeout/cancel races, all PIDs exited, unknown_cleanup, stale lease.
- Accept: Studio proves bounded ownership of every launched process tree.

### PROC-02 Route all process entrypoints
- Do: route Python bridge, ContamX, SimRead, CLI probe/install helper, attachment conversion, App Server through controller/inventory.
- Preserve: stdout/stderr caps, strict diagnostics, exact args/no shell, late-output rejection, scope binding.
- Test: every registered entrypoint, project switch/exit, cancellation, duplicate/late response; bidirectional inventory.
- Accept: no spawn bypass exists.

### TOOL-01 Official tool identity policy
- Role: L using the external-tool default; H+U reviews licence facts at final acceptance. Record official source/version/hash/PE architecture/licence/upgrade without bundling the binary.
- Implement now: ToolRegistry with missing/unsupported/unverified/verified/changed/blocked states; no PATH/registry/disk scan.
- Test design: wrong name/hash/version/architecture, replacement after probe, safe diagnostics.
- Accept: real target-Windows probe required for verified.

### TOOL-02 Controlled tool setup UI
- Do: native selection or bundled inspection per policy; show safe name/version/hash prefix/compatibility/action only.
- Separate: ContamX, SimRead, Python worker, optional Codex readiness; WebView never passes paths/flags.
- Test: cancel, invalid/replaced binary, migration/reset, re-probe race.
- Accept: users need no environment variable/command line.

### RUN-01 Cancellation/recovery
- Do: Stop binds exact process lease/run ID; running -> cancelling -> cancelled/unknown_cleanup; prior trusted result remains clearly old.
- Persist: cancelled/failed evidence, tool/input identity, cleanup status; app exit/project switch reuse same request.
- Test: stale/duplicate/cross-project cancel, late success rejection, synthetic/available child tree; real official-tool GUI remains `pending_final_acceptance`.
- Accept: cancel never becomes fake success.

### RUN-02 Persistent trusted run history
- Do: persist baseline/revision/scenario, companions, tool identities, status/timestamps/evidence/result availability; WebView sees stable ID/safe summary only.
- Do: restart verification, compatible/stale/foreign/untrusted classification, explicit archive/delete preview, quota/pinning.
- Test: corrupt/missing/moved artifact, migration, deletion isolation, concurrent index, storage full.
- Accept: historical runs remain trustworthy and bounded.

### INPUT-01 Companion inputs
- Do: explicit native chooser, canonicalize/hash/deduplicate/contain, copy only declared files, recheck before/after preparation and launch.
- Reject: missing/changed/case collision/junction escape/traversal/oversize/unsupported; no directory copy/discovery.
- Test: Unicode/spaces/read-only/replacement/cancel; bind evidence to scenario/run/result/report/AI disclosure.
- Accept: every external run input is visible and provable.

### DATA-01 OwnedArtifactStore
- Do: separate versioned roots/ownership/quota/retention for revisions, runs, results, attachments, exports, reports, diagnostics, AI traces.
- Do: create-new/commit-last outputs, startup reconciliation, cleanup preview, confirmation, no automatic deletion of user exports/unique evidence.
- Test: interruption, orphan, corruption, migration, race, quota, cleanup target ownership, uninstall policy.
- Accept: only Studio-owned data is managed; user sources/exports are outside automatic cleanup.

## 10. Wave 6: Results, Comparison, Studies, Reports

### RESULT-01 Trusted result storage
- Role: L using the supported profile and storage defaults; H reviews at H-FINAL. Freeze result schema: run/scenario/baseline/revision, type/object/unit/time basis, parser/SimRead identity, counts/limits/hash/retention.
- Do: full validated data stays in owned store; WebView receives metadata, safe summary, opaque ID, bounded pages.
- Test: failed/partial extraction never becomes result; migration/read-only history; one below/at/above limits; small-result legacy equivalence.
- Accept: no dependence on one 2 MiB JSON result.

### RESULT-02 Paging and deterministic statistics
- Do: closed page/filter/sort schema with fixed limits/cursor binding; reject paths, raw predicates, cross-result/stale cursors.
- Move: min/max/mean/count/first extreme/missing policy/rounding to versioned deterministic backend.
- Test: zero/one/many samples, duplicate extrema, numeric boundaries, large pages, hash integrity; no hidden sampling/smoothing/interpolation.
- Accept: scalable accurate result access.

### RESULT-03 Profile result vertical slices
- Role: L for each result type backed by sourced goldens; H reviews at H-FINAL. Implement SimRead invocation, strict parse, Python semantics, Rust validation/store, UI table/chart, export/report, and fixture evidence.
- Freeze: units, time basis, object association, missing policy, expected grid, limitations.
- Test: unit/object/grid/day-type mismatch, malformed output, tool/source mismatch; real official-tool evidence.
- Accept: only sourced and contract-tested result types enter the candidate; real-tool enablement stays pending final evidence.

### RESULT-04 Multi-object exploration
- Do: stable-ID selection, overview table, coverage/statistics/missingness, compatible overlay only; raw page access always available.
- UI: readable per-object charts, clear loaded/page/sampled wording, keyboard/screen reader alternatives.
- Test: zero/one/many, duplicate labels, incompatible unit/grid, long lists, stale ID, no all-samples/all-objects request.
- Accept: useful multi-Zone research view without transport blowup.

### COMPARE-01 Strict comparison backend
- Role: L using exact-match compatibility; H reviews at H-FINAL. Require same baseline/profile/object/type/unit/time grid/parser/calculator; no silent conversion/interpolation.
- Do: trusted ComparisonRecord with A/B identities, original/delta, sign/percent-zero/missing/rounding policy.
- Test: every incompatibility, corrupt/stale result, real official before/after profile scenario; React/AI cannot provide raw samples.
- Accept: deterministic scientific A/B evidence.

### COMPARE-02 Comparison UI/export
- Do: show compatible candidate selectors, A/B lineage, changed inputs, tools, coverage, units, raw/delta charts/tables, incompatibility reason.
- Export: fixed-schema non-overwriting CSV plus evidence package manifest/hashes from trusted store.
- Test: unavailable/late-invalid candidate, export conflict, long/bilingual labels, accessibility.
- Accept: learners can explain what changed and what solver showed.

### SWEEP-01 Bounded parameter studies
- Role: L using only registered supported parameters and conservative caps; H reviews at H-FINAL. Define allowed parameters/ranges/count/storage/run caps and a concrete review table before execution.
- Do: each case is a normal scenario/revision; sequential by default; cancel preserves completed evidence; partial studies labeled.
- Test: too large/duplicate/zero range, quota, partial failure, cancel, invalid unit, no optimisation claim.
- Accept: controlled sensitivity study, not broad autonomous search.

### REPORT-01 Reproducible reports
- Do: deterministic model for purpose/profile/inputs/assumptions/source protection/scenario/tool/run/results/comparison/limitations/evidence.
- Generate: trusted HTML/PDF-ready package and non-overwriting export; deterministic tables/charts/numbers; AI prose separately labeled/cited.
- Test: missing/failed/partial/corrupt evidence, long labels, bilingual, chart fallback, collision, privacy preview.
- Accept: reviewer can reproduce and audit the simulation.

### RESULT-05 H result/workflow gate
- Role: L performs the automated audit now; H repeats it at H-FINAL. Audit official-tool-to-report slices, units/time/sign policies, partial-failure honesty, store/quotas, no raw path/client samples, and report citations.
- Continue: record external evidence gaps and continue to distribution/AI; deterministic workflow remains usable with AI disabled.
- Accept: automated evidence package and exact pending-final rows exist.

## 11. Wave 7: Windows Distribution And Offline Core

### DIST-01 Distribution ADR
- Role: L using Section 2.1 distribution defaults; H+U reviews at final acceptance. Select the existing Tauri-supported per-user Windows installer path, standard-user operation, WebView2, frozen Python, external official tools, no signing/update channel, rollback, uninstall, and retained data.
- Keep Codex optional/external and list every legal/policy blocker without stopping implementation.
- Accept: one conservative candidate implementation plus fallback and recovery plan.

### DIST-02 Runtime/development dependency split
- Do: inventory Python/Node/Rust/system DLL/official tools/test/build; split production worker requirements and locked reproducibility from dev/verification.
- Do: production never uses PATH/global Python; record licences/notices; do not opportunistically upgrade.
- Test: minimal worker executes every production bridge contract; missing dependency safe failure; origin checker.
- Accept: exact release runtime known.

### DIST-03 Frozen Python worker spike
- Do: task-local reproducible build, no binary/cache/venv in repo; measure size/startup/DLLs/hash differences across two builds.
- Compare: every bridge contract source vs frozen worker; test malformed request, missing DLL/tool, cancel, limits, path safety.
- Accept: source-vs-frozen contract compatibility is automated; no binary committed and package evidence awaits final review.

### DIST-04 Tauri sidecar integration
- Do: approved sidecar/resource config, separate development fallback, Rust identity checks, build manifest; no generic Shell/filesystem capability.
- Test: packaged mode without repo venv/PATH; missing/changed/wrong architecture/duplicate sidecar; no path/arg/env to WebView.
- Accept: packaged launch independent of source tree.

### DIST-05 Installer, About, notices, SBOM
- Do: one version source, task-local package output, About identities/licences/support, machine SBOM and human notices.
- Verify: no dev path/secret/user data/debug/source leakage; hashes/size/manifest/repro record; no fake signing/auto-update.
- Accept: reviewable unsigned local installer candidate; signing/bundling/publication remain pending final acceptance.

### DIST-06 Clean-machine offline matrix
- Role: L prepares the package, automation, and exact matrix; U performs the physical clean-machine rows at U-FINAL. Test what can be automated locally for Win10/11 standard-user install/start/tool setup/open/edit/run/result/compare/report/restart/upgrade/uninstall.
- Test: network off and AI disabled, Unicode/spaces, missing tools, data retention/removal exactly policy.
- Record: package hash, OS, privilege, tool identities, each step; separate P0/P1 cards.
- Accept: matrix and package candidate are complete; actual clean-machine rows remain `pending_final_acceptance` and Batch D continues.

## 12. Wave 8: Multimodal Attachment Hub

### ATT-01 Taxonomy/privacy/capability matrix
- Role: L using Section 2.1 attachment limits and dependency policy; H+U reviews at final acceptance. Define image, PDF, Office, presentation, spreadsheet, text/code/log, structured data, archive, PRJ/SIM/NFR, and unsupported binary.
- Per type define local handling, optional remote path, file/count/bytes/pages/sheets/rows/pixels/decompression limits, retention, evidence/citation shape, unsupported result.
- Define exact disclosure UX and local-only default; attachment is distinct from source project, companion, run/result artifact, export.
- Accept: ADR, disclosure copy candidate, and tests exist; real remote send remains disabled pending runtime consent and final review.

### ATT-02 Rust AttachmentBroker
- Do: native chooser/controlled drop, extension+MIME+magic classification, hash/copy to owned quarantine, safe manifest, quotas/cancel/dedup.
- WebView sees display name/category/hash prefix/status only; delete cleans owned copy, never source.
- Test: interrupted copy, duplicate/type mismatch/corrupt manifest/storage full/restart; no absolute path leak.
- Accept: every attachment begins in trusted broker.

### ATT-03 Security/resource controls
- Role: L using Section 2.1 fail-closed limits; H reviews at H-FINAL. Freeze signatures, nesting/compression, encryption, macro/script/external-link/embedded-object, parsing timeout/memory limits.
- Never execute macros, formulas, scripts, embedded binaries, installers, active content; all extracted text is untrusted data.
- Test: zip bomb/slip, polyglot, malformed image/document, huge dimensions/line/workbook, formula/prompt injection, resource cancellation.
- Accept: adapters fail closed with safe diagnostics.

### ATT-04 Images
- Do: declared PNG/JPEG/WebP and approved formats only; decode header, enforce dimensions/bytes/count, re-encode sanitized derivative, strip EXIF/GPS.
- Do: preview/zoom/purpose/remove/disclosure selection, evidence IDs, optional annotations separate from pixels; visual observations carry confidence.
- Test: rotation/alpha/corrupt/huge/metadata/cancel, synthetic model-input adapter.
- Accept: sketches/screenshots/plans/photos are useful evidence, never authoritative geometry.

### ATT-05 PDF
- Role: L may select a dependency under Section 2.1 or defer unsafe rendering; H reviews at H-FINAL. Freeze parser/renderer, encrypted/password/JavaScript/external-link/embedded-file policy, page/text/render limits.
- Do: bounded local text plus page evidence; selected-page sanitized render only; user chooses exact pages/excerpts for remote AI.
- Test: text/scanned/chart/encrypted/malformed/huge/hostile PDF; citations resolve attachment+page.
- Accept: PDF informs plans with page provenance.

### ATT-06 Office documents/presentations
- Role: L may select dependencies under Section 2.1; H reviews at H-FINAL. Declare supported DOCX/PPTX/ODT formats and safe legacy fallback; containers are data only.
- Extract bounded headings/text/tables/notes and evidence positions; embedded visuals/charts require separately approved rendering and must not be claimed otherwise.
- Test: text/chart/image/macro/malformed/huge/external links; parser/renderer licence and package cost.
- Accept: honest text/visual fidelity and selected disclosure.

### ATT-07 Spreadsheets/tables/schedules
- Role: L may select dependencies under Section 2.1; H reviews at H-FINAL. Support declared CSV/TSV/XLS/XLSX parser, no Excel automation/formula execution; enforce fixed limits.
- Do: headers/sample/typed values/unit/date/formula flags; user mapping wizard from selected range to approved schedule/source schema, preview invalid/missing/interpolation.
- Test: multisheet/empty/duplicate headers/locale date/scientific/formula/malformed/oversized/hidden column; CSV injection defense.
- Accept: schedule/source tables become reviewed semantic transactions.

### ATT-08 Text/structured/log/CONTAM artifacts
- Do: bounded TXT/MD/JSON/XML/YAML/log with encoding/chunk/evidence limits; structured parsing only by declared schema.
- Route PRJ through domain classifier; SIM/NFR/manifests/logs through trusted run/result identity, never generic trusted attachments.
- Test: non-UTF8/huge line/control/schema mismatch/forged manifest/path/secret-like excerpt warning.
- Accept: technical files follow a specific trusted route.

### ATT-09 Safe archives/multifile sets
- Role: L using the fixed ZIP policy and limits; H reviews at H-FINAL. Reject encryption, path traversal, absolute/symlink entries, normalization collisions, duplicate canonical path, nesting/ratio/count/size violations.
- Enumerate first; user selects entries; extract owned quarantine; each entry re-enters normal classifier; bind parent/entry/hash.
- Test: slip/bomb/nested/duplicate/Unicode collision/malformed/cancel/cleanup ownership.
- Accept: archives never bypass file policy or become executable projects.

### ATT-10 H attachment admission
- Role: L performs the automated audit now; H repeats it at H-FINAL. Audit source preservation, bounds, active-content refusal, privacy states, derivatives, citations, cleanup ownership, unsupported UX, and new dependencies.
- Verify: remote disclosure contains only exact selected evidence/derivatives and immutable receipt; no file path reaches WebView/App Server/MCP/model.
- Accept: automated attachment evidence is complete; real remote transmission stays disabled and AI implementation continues using synthetic/local evidence.

## 13. Wave 9: Strong AI Runtime And Semantic Tools

### AI-01 Provider/auth/privacy ADR
- Role: L using the optional local Codex App Server default; H+U reviews at final acceptance. No provider/API-key/billing change and no credential access.
- Define: disabled/read-only/attachments/prepare/approved-execute feature flags, network disclosure, local trace/history, delete/retention, provider/model visibility.
- Rule: core never depends on AI; unavailable safe capability remains unavailable rather than broad Shell fallback.
- Accept: candidate ADR/privacy wording, disabled/offline behavior, and policy tests exist; real disclosure remains runtime opt-in and pending final review.

### AI-02 Version-specific App Server schema evidence
- Role: L. When an exact supported CLI is locally available, generate schema evidence in a task-local root; otherwise implement version-guarded adapters from official checked documentation/fixtures, mark live proof pending, and continue. H reviews at H-FINAL.
- Inspect exact thread/turn/item, image/file inputs, MCP, approvals, sandbox, event, experimental fields; use only proven fields with version guards.
- Test: strict parse/replay, unknown/changed schema fail closed, synthetic modalities, fixed MCP feasibility.
- Accept: no Codex protocol assumption becomes product promise.

### AI-03 Modularize App Server adapter
- Do: characterize existing read-only behavior, then split CLI identity, transport/init, connection lease, thread/turn, event parser, disclosure, archive, policy, gateway.
- Route process through controller; preserve generation/lease, late connection/turn, Stop/disconnect, bounded cleanup, no credential-file reads.
- Test: malformed/out-of-order/error/tool/approval/completion/interrupt/close replay; command/capability contracts.
- Accept: maintainable adapter with unchanged read-only safety.

### AI-04 AiEvidenceBundle/disclosure
- Do: versioned bundle for project/object/revision/scenario/run/result page/statistics/comparison/attachment/diagnostic evidence.
- Bind each item to identity/hash/schema/version/source/expiry/disclosure class; preview exact serialized content; invalidate on trusted state change.
- Enforce item/byte/page/row/sample caps and no path/raw PRJ/manifest/full result/credential/unselected page.
- Test: golden/mutation/leak/stale selection/citation resolution.
- Accept: model sees only reviewed, bounded, cited evidence.

### AI-05 DomainToolGateway
- Role: L using fixed semantic tools and no generic authority; H reviews at H-FINAL. Define Rust tool schemas with policy class/input/output/time/call budgets, evidence, state transition, idempotency.
- Initial read-only tools: inspect_project, list_objects, inspect_object, inspect_revision, list_runs, inspect_run, list_results, read_result_page, compute_statistics, compare_scenarios, inspect_diagnostic, inspect_attachment_evidence.
- Inputs: stable IDs/bounded parameters only; outputs: schema/evidence/source/unit/time/truncation/calculator; no paths/raw files/arbitrary query/Shell.
- Test: direct gateway contracts, mutations, model replay, stale/budget/policy failures.
- Accept: agent power is domain tools, not machine access.

### AI-06 Policy and approval broker
- Role: L using Section 2.1 authority defaults; H reviews at H-FINAL. Implement risk classes, feature flags, disclosure, identity/freshness, single-use action-hash/expiry/user-bound approval.
- Separate plan approval from exact action approval; block generic tool/file/shell/network/dynamic MCP/permission events.
- Test: injection, forged args, duplicate/stale approval, state switch/race/reconnect/malicious WebView; local safe audit decisions.
- Accept: wording/event order cannot elevate authority.

### AI-07 SimulationPlan and missing-information dialogue
- Do: closed schema for goal/profile/template/evidence/open questions/assumptions/actions/runs/outputs/risks/stop reason.
- Classify each datum as evidence, deterministic derivation, user-confirmed assumption, AI hypothesis, or unknown; ask the smallest missing critical question.
- Validate profile/operation/tool readiness; no hidden defaults for geometry, weather, occupancy, source, schedule, units, result interpretation.
- Test/eval: underspecified/conflicting/impossible/unsupported/injection; editable review invalidates prior plan/approval.
- Accept: careful collaborator planning.

### AI-08 Multimodal transport
- Role: L. Implement capability detection and fail-closed transport using only exact available provider/schema evidence; H reviews at H-FINAL. Unknown modes remain disabled instead of blocking other modalities.
- PDF selected pages only; Office text only unless renderer approved; spreadsheet selected range/mapping; enforce size/count/metadata.
- Record disclosure receipt with evidence IDs, derivative hashes, provider/mode/time/user decision; model cannot request local path/unselected evidence.
- Test: synthetic success, expired/removed/oversize/unsupported/privacy race.
- Accept: multimodal power without disk browsing.

### AI-09 Local trace/citation/history
- Do: safe trace of turn, evidence hash, provider/model label, plan, tools, policy, approvals, outputs/citations/status/timings; minimal retention default.
- Conversation history scoped by project/profile, never auto-replayed; explicit delete item/project/all/disable; expired citations visible.
- Test: corruption/scope change/deleted evidence/disconnect/privacy toggle/migration from existing archive; no pricing invention.
- Accept: auditable and locally erasable work.

### AI-10 Assistant workbench
- Do: task-oriented Attachments, Evidence, Plan, Actions, Activity, Result, Report surfaces; Explain/Collaborate/Prepare/approved-execute selector.
- Show connection/network disclosure/evidence count/plan/tool progress/approval/Stop; visually separate fact, deterministic result, AI interpretation, uncertainty, citation, limitation.
- Test: stream ordering, stop/reconnect/stale plan/attachment removal/action rejection, focus/keyboard/screen reader/bilingual/high DPI.
- Accept: capable and legible, not a black-box chat panel.

### AI-11 H6/H8 admission
- Role: L performs the complete automated audit now; H+U repeats it at final acceptance. Review version proof, no-generic-tool evidence, gateway/policy, attachment transport, privacy, traces/citations, disabled/offline behavior, and synthetic planning evals.
- Implement the Section 2.1 ceiling: candidate Patch and exact hash-bound approved ActionBundle only; all higher authority remains forbidden and state-changing mode stays feature-gated.
- Accept: audit package complete; continue to the complete agent without enabling unreviewed real state changes.

## 14. Wave 10: Complete Supported Simulation Agent

### AGT-01 AI candidate Patch
- Do: model returns only registered operation, stable object, value/unit, evidence/rationale/uncertainty; reject paths/raw edits/numbers/IDs/extra fields/unapproved multi-action.
- Rust rebinds current state and calls the same deterministic manual plan/Diff; model never creates trusted Diff.
- UI separates suggestion, deterministic change/proof, rationale, unanswered risk; second explicit apply approval.
- Test: injection/stale/invalid unit/extra action/double apply/interruption/reconnect.
- Accept: AI prepares, shared safety applies.

### AGT-02 Approved ActionBundle
- Role: L using Section 2.1 action defaults; H reviews at H-FINAL. Define exact ordered actions, input/transaction hashes, scenario, expected tools, allowed outputs, budgets, stop conditions, expiry/idempotency/user approval.
- v1 actions only: approved Patch, exact run, exact extraction, exact statistics/comparison, new report/export.
- Revalidate each step; stop on changed identity/tool, validation failure, unknown cleanup, missing input, untrusted result, policy mismatch; no deviation.
- Test: stale/duplicate/concurrent/crash/partial/order mutation/cancel.
- Accept: one meaningful approval can finish one fully specified supported task.

### AGT-03 Requirements to supported plan
- Do: structured+natural intake for goal/context/project/template/question/files/constraints/outputs; profiles/templates only from registry.
- Extract candidate values from selected evidence with confidence/citation; ask for missing required inputs; user accepts/edits/rejects every assumption.
- Validate completeness/units/ranges/profile/companions/tools/storage; show unmodeled aspects and limitations.
- Eval: conflicting docs, ambiguous plan image, incomplete schedule, unsupported physics, injection.
- Accept: real requirement becomes safe plan.

### AGT-04 Technical diagnosis/retry
- Do: deterministic failure evidence for project/input/tool/process/solver/SimRead/storage/policy; AI sees safe category/log excerpts/evidence only.
- Allowed recovery: explain, ask, exact-input retry, reselect missing companion through user; never hidden physics/model change.
- New significant retry requires visible approval; preserve failure/retry lineage; stop repeated identical failure at cap.
- Test: misleading log/text, tool replacement, timeout, fake success, unavailable action.
- Accept: useful recovery without uncontrolled fixing.

### AGT-05 AI-guided sensitivity study
- Do: propose only approved parameters/ranges with evidence/rationale; editable concrete table includes counts/time/storage.
- User approves concrete scenario list or deterministic hashed generation rule; normal transaction/scenario/run pipeline; sequential default.
- Summaries use complete or explicitly partial trusted records, no extrapolation.
- Eval: excessive range, unsupported variable, duplicate/unit error, optimisation request.
- Accept: bounded research automation.

### AGT-06 Evidence-grounded analysis
- Do: result metadata/pages/statistics/comparisons/limitations via tools; every quantitative claim cites evidence and unit.
- Response schema separates observation, deterministic calculation, physical interpretation, uncertainty, next question; prohibit unsupported causality/health/safety certainty.
- Test: wrong unit/scenario/mixed/expired/missing data, false certainty, citation mismatch, bilingual precision.
- Accept: useful, auditable scientific explanation.

### AGT-07 AI report drafting
- Do: AI drafts narrative from deterministic report model/evidence only; code owns tables/charts/IDs/units/numbers.
- Label and cite AI narrative; user reviews; data change invalidates stale prose; support teaching/detailed research modes.
- Test: missing citation/stale statistic/changed scenario/bilingual/export collision/history retention.
- Accept: writing help without provenance loss.

### AGT-08 End-to-end H/U acceptance
- Run: automated synthetic/template and compatible fixture flows from attachments/requirements/questions/plan/approval/mock-or-available official run/results/comparison/report.
- Verify: every action receipt, stop on unsupported/ambiguous/stale/tool/process/policy failure, no generic authority, offline no-AI core.
- Evaluate: natural language, image, PDF, spreadsheet, malformed/injection, uncertainty; manual GUI disclosure/plan/approve/Stop/delete history.
- Keep real A3 enablement pending H/U final acceptance; do not stop Batch E.
- Accept: the complete automated candidate is integrated and bounded; real provider/tool/GUI rows are explicitly pending.

## 15. Wave 11: Quality, Security, Performance

### QA-01 Release-grade CI
- Do: finish the Windows CI workflow and its local contract/mutation evidence. If push/hosted PR runs and branch-protection access are unavailable, prepare the exact two-run checklist and mark only those remote rows `pending_final_acceptance`.
- Define Fast/Full/Package/RealTool/Security/AgentEval/Release modes; offline deterministic by default; machine-readable summaries.
- Test: CI never reads user/untracked/real AppData/credentials; required failure blocks release.
- Accept: truthful local CI candidate and explicit hosted-evidence status; no invented remote success and no development stop.

### QA-02 Desktop interaction/E2E layers
- Do: test reducers, DOM interactions, Tauri command/payload, Rust services, Python semantics, isolated packaged smoke, and explicit manual-only rows.
- Cover modal focus/keyboard, controller races, tool/run/result/attachment/disclosure/plan/approval/Stop, delayed/reordered/duplicate failures.
- Test state invalidation across all trusted identities; screenshots never substitute manual acceptance.
- Accept: behavior tests replace static source-string confidence.

### QA-03 Property/fuzz/corpus/mutation
- Role: L now; H reviews the corpus and residual risk at H-FINAL. Run bounded synthetic fuzz for document, bridge, results, attachments/archive, tool schemas, bundles, citations.
- Properties: source preservation, idempotency, stale reject, no path leak, no overwrite, compatibility refusal; reproducible seed/minimized fixture.
- Mutations assert expected reason for policy/unit/citation/disclosure/tool/process/storage changes.
- Accept: boundary code challenged beyond examples; no fake formal certification.

### SEC-01 Threat model/review
- Role: L produces the threat model, tests, and candidate conclusion; H independently reviews at H-FINAL. Model assets/attackers/trust/entrypoints/mitigations across files, artifacts, processes, WebView, tools, attachments, AI, installer.
- Review least privilege, canonicalization/junction/TOCTOU/Unicode/archive, output ownership, redaction, tool identity/process proof, policy/approval bypass.
- Produce incident/recovery playbooks; say not a third-party pen test.
- Accept: candidate security conclusion, blockers, and regressions are complete for consolidated review.

### SEC-02 AI/attachment red team
- Do: synthetic injection PDFs/tables/images/archive names/logs, formula strings, bogus science, stale citations, tool escalation.
- Test raw PRJ edit, invented units/geometry, hidden run/delete/overwrite/network, false success, replay/history/project switch attacks.
- Score deterministic policy/citation plus human usefulness; every bypass becomes regression.
- Accept: published non-sensitive findings/residual limits.

### PERF-01 Scale/performance/resilience
- Do: representative sizes; repeated cold start/first paint/open/navigation/Diff/revision/probe/run overhead/result page/chart/attachment/AI plan/report.
- Set budgets for responsiveness/memory/storage/output/cleanup; near-limit projects/results/scenarios/attachments/low storage.
- Never optimize by bypassing validation/full data/accessibility; resolve or document build/linker warnings.
- Accept: repeatable benchmark evidence for declared profiles.

### OBS-01 Diagnostics/support/recovery
- Do: safe bounded local diagnostic taxonomy/rotation; previewed non-overwriting redacted support bundle; recovery center for interrupted store/process/migration/AI trace.
- Exclude raw project/attachment/credential/path by default; include versions/safe config/error categories/verification.
- Test redaction/archive collision/oversize/corruption/deletion; offline help.
- Accept: users can recover/get help without exposing projects.

## 16. Wave 12: UAT, Release, Learning

### UAT-01 Manual GUI matrix
- Role: L prepares every versioned row and automated evidence; U performs manual rows once at U-FINAL for zh/en, light/dark, 100/150/200 percent, keyboard, minimum window, fresh/restart/switch/exit.
- Each row states precondition/action/visible expected/data assertion/result; record passed/failed/blocked/not_run and exact package/OS/tool.
- Failures become scoped regression cards; no unresolved P0 safety/science/permission/recovery.
- Accept: executable checklist is complete; unperformed physical rows are `pending_final_acceptance` and do not block learning/closeout artifacts.

### BETA-01 Target-user observations
- Role: L prepares the study script, privacy-minimal form, tasks, and analysis template; actual students/researchers/teachers participate only at U-FINAL.
- Measure completion/hints/time/understanding of source protection/assumptions/units/evidence/AI limits; collect minimal personal data.
- P0/P1 reproduction/owner; complex unprofiled requests go backlog, not silent scope.
- Accept: study package is ready; actual observations remain `pending_final_acceptance`.

### RC-01 Release candidate freeze
- Freeze the automated candidate code/dependencies/schemas/profiles/tools/templates/notices/docs; run available Release/CI/package/security/agent evaluation, run the first Batch E Full, and only if it is clean run one second stability Full. Keep clean-machine and real-tool rows pending when unavailable.
- Generate changelog/limitations/migrations/support/SBOM/notices/checksums/verification/rollback; inspect no secret/user/unreviewed/untracked/P0.
- Default AI/state-changing/remote capabilities disabled; package contains no source paths; do not tag/publish.
- Accept: reproducible honest automated RC candidate with a consolidated H/U acceptance package.

### REL-01 Authorized publication
- Role: L prepares but does not execute the publication checklist. Reconfirm candidate version/branch/package hashes/notices/notes; leave tag/channel/upload fields `pending_final_acceptance`.
- Prepare checksums/SBOM/notices/limitations/support/rollback and remote-verification commands; no push/tag/sign/upload/auto-update/telemetry/history rewrite.
- Accept: release kit ready for a later explicit user instruction; continue to learning and CLOSE-01 without publishing.

### LEARN-01 Beginner architecture set
- Create docs/learning/00-start-here, 01-product-map, 02-frontend, 03-rust-host, 04-python-domain, 05-contam-results, 06-attachments-ai, 07-testing-release.
- Explain in plain Chinese: click -> React -> Tauri -> Python -> ContamX/SimRead -> evidence; stable identity, why no raw edits, what AI can/cannot do.
- Include bilingual glossary, small diagrams, current code links, fixture-only examples.
- Accept: user can understand architecture without prior engineering study.

### LEARN-02 Seven-session self-study
- Session 1 concepts/workflow; 2 open-project trace; 3 Patch trace; 4 run/result trace; 5 comparison/report; 6 attachment/disclosure; 7 AI plan/action.
- Each 30-60 minutes with reading, safe fixture exercise, expected observation, reflection question, next topics.
- Accept: user develops a coherent mental model gradually.

### CLOSE-01 Final truth and post-v1 handoff
- Reconcile every card/matrix/log/package/U/H/release status using implemented, automated_verified, GUI, real_tool, clean_machine, user_validated, released, deferred, blocked.
- Never report a plan/synthetic test as implementation/release; archive temporary evidence by policy; no unique evidence deletion.
- Build v1.1 backlog only from explicit limitations/user evidence/postrelease defects; keep generic BIM/arbitrary PRJ/other solvers/cloud/multiuser/unbounded agent separately scoped.
- Accept: truthful maintainable automated-candidate handoff, one consolidated H review request, one guided U acceptance checklist, and a separate release action. This is the first normal return point.

## 17. Final Release Evidence By Area

This table defines evidence required before an actual release, not prerequisites for implementation or `CLOSE-01`. During creation of the automated candidate, produce every feasible row and mark unavailable real-tool/provider/GUI/clean-machine/user/H/U evidence `pending_final_acceptance`; then continue. A missing final row blocks only release or enablement of the affected dangerous capability.

| Area | Evidence required |
|---|---|
| Product | approved v1 contract, supported profile matrix, journeys, exclusions |
| Domain | fixture provenance/licence/hashes, profile grammar, byte preservation, semantic goldens |
| Safety | threat model, output ownership, process-tree proof, mutation/red-team, recovery |
| Tools | actual ContamX/SimRead identities and temporary real-tool transcripts |
| Results | reference outputs, units/time rules, paging/compare contracts |
| Attachments | type/limit matrix, sanitized derivatives, disclosure receipts, malicious corpus |
| AI | App Server version/schema, tool/policy schemas, traces, citations, eval/red-team |
| Distribution | worker/tool manifests, SBOM/notices, checksums, clean-machine matrix |
| User | GUI checklist, Alpha/Beta observations, explicit H/U decisions |
| Learning | architecture guide, glossary, click-to-solver trace, seven-session plan |

## 18. Reporting Policy

The low-reasoning model continues automatically across cards, Waves, checkpoint tests, commits, missing external evidence, and old H/U labels. It does not return at FND-07/FND-08/PRD-08/DOM-10/DRAFT-08/RESULT-05/ATT-10/AI-11/AGT-08, at the end of a Wave, or merely because a real tool, GUI, provider, clean machine, licence decision, or user study is unavailable.

There are only two normal return conditions:

1. `CLOSE-01` has produced the complete automated candidate, final checkpoint evidence, H-FINAL review package, U-FINAL guided checklist, release kit, and learning materials.
2. A true hard stop from Rule 12 prevents all remaining independent work. First isolate or disable the affected capability, record it, and continue everything else. Return early only when no independent work remains or the repository cannot be kept safe.

Progress updates requested by the user are factual snapshots, not permission requests, and execution continues unless the user says to stop.

Every return uses this exact shape:

~~~text
branch and HEAD:
last batch / last card:
automated_verified cards:
pending_final_acceptance (nonblocking):
deferred_with_reason (nonblocking):
true hard stop, if any:
exact final review/evidence required:
commits created and push state:
focused tests:
checkpoint and final Full:
real-tool/GUI facts:
synthetic-only facts:
files/workspaces intentionally untouched:
~~~

## 19. Launcher Prompt

~~~text
严格执行 F:\Codex_File\temp\contam-studio\CONTAM-STUDIO-V1-COMPLETE-PRODUCT-MASTER-TASKBOOK.md。

从现有隔离克隆 F:\Codex_File\temp\contam-studio-v1-complete 的干净分支 codex/contam-studio-v1-complete@24cb7aa 继续。认可Batch A以及Batch B日志中截至DOM-04的自动验证结果；按FE-04的新规则把真实Attachment控制器记到ATT-02后续，不造占位控制器，并关闭FE-04，然后从DOM-05继续。不要重新克隆、重做已验证卡或重新跑它们的旧Full。若HEAD已继续向前且工作树干净，按批次日志从最后一个未完成项继续。

按第3节五个连续批次从头到尾完成全部可自动实现内容。任务卡是需求清单，不是独立会话：每批只建一份总日志和状态表，按纵向功能实现并做少量语义提交；开发时跑定向测试，只在A-D各批末尾跑一次Full和git diff --check，Batch E首次Full干净后再跑一次稳定性Full。批次结束后不要回来汇报，立即继续下一批。不得因为旧的H/U/approved/only-then字样、缺少GUI/真实ContamX或SimRead/Codex/干净电脑/许可证结论而停下；使用第2.1节已经授权的保守默认值，危险能力保持关闭，外部证据标pending_final_acceptance后继续。

同一失败在没有相关修改时禁止重复运行。最多尝试三种实质不同的修复；可选能力仍失败时将该能力fail-closed并标deferred_with_reason，继续所有独立任务。只有第2节Rule 12的真实硬停止阻断全部剩余工作，或完成CLOSE-01自动化候选版本时，才按第18节一次性返回。

保护 F:\CONTAM Studio 原工作区、用户 PRJ/SIM/CSV、真实 AppData、凭据、全局环境和系统设置。允许按第2.1节新增项目范围内、许可明确并锁定的依赖；禁止系统/全局安装和凭据读取。自动测试通过不能写成GUI、真实工具、真实远程AI、用户、签名或发布通过。不得push、rebase、merge、amend、squash、force、tag、签名、上传或发布，除非之后收到明确指令。
~~~

## 20. Primary Documentation To Refresh

Before implementing the relevant cards, use current primary sources:

1. OpenAI Codex App Server docs and exact generated schema for thread/turn/item/events/approvals/sandbox/MCP/modalities.
2. OpenAI file-input and vision docs. Confirm actual provider behavior; PDF may include page images while non-PDF embedded visuals may not, depending on surface.
3. OpenAI strict function/tool schema documentation.
4. Tauri v2 sidecar, capabilities, security, bundle, Windows installer docs.
5. NIST/official CONTAM downloads, versions, hashes, disclaimer, redistribution/third-party notice material.
6. Primary licence/maintenance/package docs for each proposed parser, renderer, archive, worker-freezer dependency.

No provider capability, scientific support, or redistribution right may be claimed from this taskbook, an old task log, a model answer, or a third-party blog alone.

## 21. Final Reminder

This plan deliberately makes the AI powerful through a semantic CONTAM tool gateway, trusted evidence, and approved action bundles. It does not make the AI powerful by giving it the user's disk or a shell. The result should feel like a capable simulation partner to the user while remaining a product that can explain exactly what it changed, ran, calculated, and exported.
