import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const packageJson = JSON.parse(read("package.json"));
const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const matrix = JSON.parse(read("docs/capability-status-matrix.json"));
const cargo = read("src-tauri/Cargo.toml");
const cargoLock = read("src-tauri/Cargo.lock");
const python = read("python/pyproject.toml");
const rootReadme = read("README.md");
const geometryReadme = read("docs/initiatives/geometry-workbench/README.md");
const releaseNotes = read("docs/release/CONTAM-Studio-0.6.0-release-notes.md");
const limitations = read("docs/release/known-limitations-0.6.0.md");
const historicalNotes = read("docs/release/CONTAM-Studio-0.5.0-release-notes.md");
const historicalLimitations = read("docs/release/known-limitations-0.5.0.md");
const taskLog = read("docs/development/task-log/records/geometry-workbench-v0.6.0-candidate.md");
const taskIndex = read("docs/development/task-log/index.md");
const verify = read("scripts/verify.ps1");
let checks = 0;

function assert(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
}

const version = String(packageJson.version);
const geometry = matrix.capabilities.find((item) => item.id === "geometry-workbench-integration-closure");
assert("candidate version is exactly 0.6.0", version === "0.6.0");
assert("package, Tauri, Cargo and Python versions agree", tauri.version === version && /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1] === version && /^version\s*=\s*"([^"]+)"/m.exec(python)?.[1] === version);
assert("Cargo lock root package version agrees", /name\s*=\s*"contam-studio"\s+version\s*=\s*"0\.6\.0"/m.test(cargoLock));
assert("v0.5.0 historical documents remain separate", historicalNotes.includes("# CONTAM Studio v0.5.0") && historicalLimitations.includes("# CONTAM Studio 0.5.0 已知限制") && historicalNotes.includes("v0.5.0 已正式发布") && !historicalNotes.includes("# CONTAM Studio v0.6.0"));
assert("v0.6.0 release documents exist", releaseNotes.includes("# CONTAM Studio v0.6.0") && limitations.includes("# CONTAM Studio 0.6.0 已知限制"));
assert("root README distinguishes stable v0.5.0 from local v0.6.0 candidate", rootReadme.includes("v0.5.0 是当前已发布的稳定版本") && rootReadme.includes("v0.6.0 是当前 Geometry Workbench 的本地候选版本") && rootReadme.includes("尚未公开发布"));
for (const [label, text] of [["v0.6.0 release notes", releaseNotes], ["v0.6.0 limitations", limitations]]) {
  assert(`${label} has no machine-private path or file URL`, !/file:\/\/|(?:[A-Z]:\\|[A-Z]:\/)/.test(text));
}
assert("Geometry Workbench status is synchronized", geometry?.implemented === "complete" && geometry?.automated_verified === "passed" && geometry?.browser_design_qa === "passed" && geometry?.github_windows_ci === "passed" && geometry?.merged_to_main === "yes" && geometry?.manual_gui === "partial" && geometry?.real_tools === "passed" && geometry?.real_provider === "not_run" && geometry?.packaged === "no" && geometry?.signed === "not_run" && geometry?.released === "no" && geometry?.user_validated === "not_run");
assert("candidate notes describe the Geometry Workbench scope", releaseNotes.includes("全画布建筑工作区") && releaseNotes.includes("三套视觉主题") && releaseNotes.includes("多楼层建筑构造") && releaseNotes.includes("整数毫米坐标") && releaseNotes.includes("校准 PNG、JPEG 或 PDF") && releaseNotes.includes("安全 Patch/Diff"));
assert("candidate limitations keep unsupported and pending states explicit", limitations.includes("不能等价、无损地写回任意 CONTAM SketchPad") && limitations.includes("125%/200% Windows 系统缩放尚未正式人工验收") && limitations.includes("真实 Provider") && limitations.includes("MSI 只做构建、文件结构、版本、签名状态和哈希静态审计"));
assert("original PRJ and safe new-copy boundaries remain explicit", geometryReadme.includes("原始 PRJ 不被前端或 AI 直接写入") && geometryReadme.includes("导出到新副本") && releaseNotes.includes("只导出到新的 PRJ 副本"));
assert("candidate remains unpublished and unsigned", releaseNotes.includes("尚未创建 Git 标签、GitHub Release 或公开下载资产") && limitations.includes("候选包未进行代码签名") && limitations.includes("不是正式发布资产"));
assert("candidate task log is indexed and starts with legal status", taskLog.includes("task_id: geometry-workbench-v0-6-0-candidate") && /status: (?:in_progress|completed)/.test(taskLog) && taskIndex.includes("records/geometry-workbench-v0.6.0-candidate.md"));
assert("candidate contract is wired into Docs and therefore Full", verify.includes("test-geometry-workbench-v0.6.0-candidate-contract.mjs"));

console.log(`Geometry Workbench v0.6.0 candidate contract passed: ${checks} assertions.`);
