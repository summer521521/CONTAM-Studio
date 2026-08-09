import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
let checks = 0;
function assert(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
}

const packageJson = JSON.parse(read("package.json"));
const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const lock = JSON.parse(read("resources/contam-tools.lock.json"));
const cargo = read("src-tauri/Cargo.toml");
const python = read("python/pyproject.toml");
const integrity = read("scripts/lib/contam-integrity.ps1");
const acquisition = read("scripts/build-contam-tools.ps1");
const preparation = read("scripts/prepare-contam-tools-runtime.ps1");
const redirected = read("scripts/tests/test-contam-tools-redirected-process.ps1");
const rust = read("src-tauri/src/zone_bridge.rs");
const rustTests = read("src-tauri/src/zone_bridge/tests.rs");
const dataset = read("src/app/result-dataset-state.ts");
const results = read("src/components/workbench/results/ResultsWorkspace.tsx");
const interactions = read("src/components/workbench/results/ResultsWorkspace.interaction.test.tsx");
const openaiCatalog = read("src-tauri/src/ai_provider/catalog.rs");
const studioSettings = read("src/app/runtime/useStudioSettings.ts");
const releaseSettings = read("src/components/workbench/ReleaseSettings.tsx");
const desktopApi = read("src/app/desktop-api.ts");
const notices = read("THIRD_PARTY_NOTICES.md");
const releaseNotes = read("docs/release/CONTAM-Studio-0.5.0-release-notes.md");
const limitations = read("docs/release/known-limitations-0.5.0.md");
const taskLog = read("docs/development/task-log/records/r1-05-final-uat-release-readiness.md");
const verify = read("scripts/verify.ps1");

assert("candidate version is synchronized", packageJson.version === "0.5.0" && tauri.version === "0.5.0" && cargo.includes('version = "0.5.0"') && python.includes('version = "0.5.0"'));
assert("shared SHA helper uses the bounded PowerShell 5.1 implementation", integrity.includes("Security.Cryptography.SHA256") && integrity.includes("ComputeHash") && integrity.includes("FileStream") && integrity.includes("finally"));
assert("acquisition and preparation share one integrity implementation", acquisition.includes("lib\\contam-integrity.ps1") && preparation.includes("lib\\contam-integrity.ps1") && !acquisition.includes("Get-FileHash") && !preparation.includes("Get-FileHash"));
assert("redirected process regression checks exact hash failure before extraction", redirected.includes("RedirectStandardOutput") && redirected.includes("RedirectStandardError") && redirected.includes("WindowStyle") && redirected.includes("SHA-256 mismatch") && redirected.includes("extracted"));
assert("official release and packaged tool versions remain distinct", lock.release_version === "3.4.0.8" && lock.contamx_version === "3.4.0.3" && lock.zip_sha256 === "3F11B44513F1046D378226B3D63644493B78F0E8241DC70F83E319A458A14052");
assert("third-party and release facts do not call the tool ContamX 3.4.0.8", notices.includes("containing product release as CONTAM 3.4.0.8") && notices.includes("reports the packaged runtime as 3.4.0.3") && releaseNotes.includes("包内 ContamX、SimRead、SimComp 和 PrjUp 的 Windows 文件版本均为 3.4.0.3"));
assert("Rust retains only ready or successful partial datasets", rust.includes("result_dataset_is_trusted") && rust.includes('dataset.status == "ready"') && rust.includes('dataset.status == "partial"') && rustTests.includes("last_trusted_result_dataset_requires_ready_or_successful_partial_data"));
assert("frontend preserves a separate last trusted dataset", dataset.includes("lastTrustedDataset") && dataset.includes("isTrustedResultDataset") && dataset.includes("state.lastTrustedDataset"));
assert("time selection uses recorded timestamps without interpolation", dataset.includes("nearestAvailableResultTime") && results.includes("ResultTimeSelector") && interactions.includes("nearest recorded time without interpolation"));
assert("result pagination and tabs have mounted interaction tests", results.includes("Math.min(currentPage, pages - 1)") && interactions.includes("clamps pagination") && interactions.includes("ArrowRight") && interactions.includes("Home") && interactions.includes("End"));
assert("tabs expose stable relationships and a single roving tab stop", results.includes("aria-controls") && results.includes("aria-labelledby") && results.includes("tabIndex={activeTab === item ? 0 : -1}"));
assert("OpenAI catalog uses a versioned default-deny documented capability intersection", openaiCatalog.includes("openai.responses.structured_outputs.v1") && openaiCatalog.includes("gpt-5.2-pro") && !openaiCatalog.includes('lower.starts_with("gpt-")') && openaiCatalog.includes("official_api+{OPENAI_MODEL_CAPABILITY_POLICY_VERSION}"));
assert("tool probes remain diagnostic-only and cannot overwrite authoritative setup", studioSettings.includes("selectAndProbeOfficialTool") && !studioSettings.includes("setStudioSetup((current)") && releaseSettings.includes("不会改变运行配置") && desktopApi.includes("saveStudioPreferences") && !desktopApi.includes("contamxPath") && !desktopApi.includes("simreadPath"));
assert("candidate limitations keep external evidence honest", limitations.includes("pending_user") && limitations.includes("真实 Provider 回归状态为 `failed`") && limitations.includes("不是最终发布资产"));
assert("R1-05 uses its one allowed task log", taskLog.includes("task_id: r1-05-final-uat-release-readiness") && /status: (in_progress|completed)/.test(taskLog));
assert("R1-05 contract is included in Full", verify.includes("test-r1-05-final-uat-release-readiness-contract.mjs"));
assert("R1-05 adds no unapproved runtime dependency", Object.keys(packageJson.dependencies).every((name) => !["react-flow", "pixi.js", "three", "d3"].includes(name)));

console.log(`R1-05 final UAT and release-readiness contract passed: ${checks} assertions.`);
