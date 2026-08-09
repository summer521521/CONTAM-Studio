import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "../.."));
const failures = [];
const read = (relative) => {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    failures.push(`missing ${relative}`);
    return "";
  }
  return fs.readFileSync(target, "utf8");
};

const required = [
  "python/packaging/worker_entry.py",
  "python/requirements-worker.lock",
  "scripts/build-python-worker.ps1",
  "scripts/build-release.ps1",
  "scripts/build-installers.ps1",
  "scripts/prepare-release-assets.ps1",
  "src-tauri/runtime/python-worker/README.md",
  "src-tauri/src/controlled_process.rs",
  "docs/adr/ADR-017-package-frozen-worker-and-own-windows-process-trees.md",
  "docs/release/CONTAM-Studio-0.3.0-release-notes.md",
  "docs/release/known-limitations-0.3.0.md",
  "docs/release/release-kit-v2.md",
];
for (const file of required) read(file);

const packageJson = JSON.parse(read("package.json"));
const pyprojectVersion = read("python/pyproject.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoVersion = read("src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const versionsAgree = (versions) => new Set(Object.values(versions)).size === 1 && semverPattern.test(String(versions.package));
const currentVersions = { package: packageJson.version, python: pyprojectVersion, cargo: cargoVersion, tauri: tauri.version };
if (!semverPattern.test(String(packageJson.version))) failures.push(`package version ${packageJson.version} is not valid SemVer`);
if (!versionsAgree(currentVersions)) failures.push("package/Python/Cargo/Tauri versions must agree and be valid SemVer");
if (!versionsAgree({ package: "0.4.1", python: "0.4.1", cargo: "0.4.1", tauri: "0.4.1" })) failures.push("a normal version change must remain valid without a historical version constant");
if (versionsAgree({ package: "0.4.1", python: "0.4.2", cargo: "0.4.1", tauri: "0.4.1" })) failures.push("version drift fixture was not rejected");
for (const [label, version] of [
  ["Python", pyprojectVersion],
  ["Cargo", cargoVersion],
  ["Tauri", tauri.version],
]) {
  if (version !== packageJson.version) failures.push(`${label} version ${version} does not match package ${packageJson.version}`);
}

const cargo = read("src-tauri/Cargo.toml");
for (const marker of [
  "[target.'cfg(windows)'.dependencies]",
  "windows-sys",
  "Win32_System_Diagnostics_ToolHelp",
  "Win32_System_JobObjects",
  "Win32_System_Threading",
]) {
  if (!cargo.includes(marker)) failures.push(`Cargo process-tree dependency is missing ${marker}`);
}

const controlled = read("src-tauri/src/controlled_process.rs");
for (const marker of [
  "CREATE_SUSPENDED | CREATE_NO_WINDOW",
  "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE",
  "AssignProcessToJobObject",
  "TerminateJobObject",
  "resume_process_threads",
  "kill_terminates_the_complete_windows_process_tree",
  "dropping_the_job_handle_terminates_the_complete_windows_process_tree",
]) {
  if (!controlled.includes(marker)) failures.push(`controlled process boundary is missing ${marker}`);
}

for (const [file, commandCount, controlledCount] of [
  ["src-tauri/src/codex_app_server.rs", 3, 3],
  ["src-tauri/src/zone_bridge.rs", 1, 1],
  ["src-tauri/src/release.rs", 2, 1],
]) {
  const source = read(file);
  const commands = source.match(/\bCommand::new\s*\(/g)?.length ?? 0;
  const controlledSpawns = source.match(/\bControlledChild::spawn\s*\(/g)?.length ?? 0;
  if (commands !== commandCount || controlledSpawns !== controlledCount) {
    failures.push(`${file} process inventory changed: Command::new=${commands}, controlled=${controlledSpawns}`);
  }
}
const releaseSource = read("src-tauri/src/release.rs");
if (!/Command::new\("explorer\.exe"\)[\s\S]{0,100}\.spawn\(\)/m.test(releaseSource)) {
  failures.push("the sole user-owned explorer process exception is missing");
}
if ((read("src-tauri/src/codex_app_server.rs").match(/\.spawn\(\)/g)?.length ?? 0) !== 0) {
  failures.push("Codex production code bypasses ControlledChild");
}
if ((read("src-tauri/src/zone_bridge.rs").match(/\.spawn\(\)/g)?.length ?? 0) !== 0) {
  failures.push("Python bridge production code bypasses ControlledChild");
}

const zone = read("src-tauri/src/zone_bridge.rs");
for (const marker of [
  "runtime/python-worker/contam-studio-python-worker.exe",
  "discover_bridge_runtime",
  "#[cfg(not(debug_assertions))]",
  "let development_root: Option<PathBuf> = None",
  "frozen_worker_is_preferred_and_does_not_require_a_source_tree",
  "release_runtime_discovery_has_no_implicit_source_fallback",
]) {
  if (!zone.includes(marker) && !read("src-tauri/src/zone_bridge/tests.rs").includes(marker)) {
    failures.push(`runtime discovery boundary is missing ${marker}`);
  }
}
if (!/#\[cfg\(any\(test, debug_assertions\)\)\]\s*fn project_root/m.test(zone)) {
  failures.push("compile-time project root is not limited to test/debug builds");
}

const resources = tauri.bundle?.resources ?? {};
if (resources["runtime/python-worker"] !== "runtime/python-worker") {
  failures.push("Tauri frozen worker resource mapping is missing");
}
const workerLock = read("python/requirements-worker.lock")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
if (workerLock.length < 8 || workerLock.some((line) => !/^[A-Za-z0-9_.-]+==[^ ]+ --hash=sha256:[0-9a-f]{64}$/.test(line))) {
  failures.push("worker requirements must be fully pinned with one SHA-256 per artifact");
}

const workerBuild = read("scripts/build-python-worker.ps1");
for (const marker of [
  "--require-hashes",
  "--only-binary=:all:",
  "PYINSTALLER_CONFIG_DIR",
  "--onedir",
  "--hidden-import contamxpy",
  "detached_protocol_smoke",
  "detached_project_read",
  "detached_semantic_project_read",
  "source_fixture_unchanged",
  "runtime-manifest.json",
  "PYINSTALLER-COPYING.txt",
  "PYTHON-LICENSE.txt",
]) {
  if (!workerBuild.includes(marker)) failures.push(`worker build is missing ${marker}`);
}
const releaseBuild = read("scripts/build-release.ps1");
for (const marker of [
  "build-python-worker.ps1",
  "source_tree_required",
  "runtime\\python-worker",
  "CARGO_ENCODED_RUSTFLAGS",
  "--remap-path-prefix",
  "release artifact audit failed",
]) {
  if (!releaseBuild.includes(marker)) failures.push(`release build is missing ${marker}`);
}
const releaseClosure = read("scripts/release-closure.ps1");
for (const marker of ["RequireInstallers", "prepare-release-assets.ps1", "frozen_worker = \"passed\"", "windows_process_tree = \"passed\""]) {
  if (!releaseClosure.includes(marker)) failures.push(`release closure is missing ${marker}`);
}
for (const script of ["scripts/build-installers.ps1", "scripts/repackage-bundles-local.ps1"]) {
  if (read(script).includes("CONTAM Studio_0.1.0")) failures.push(`${script} still hard-codes 0.1.0 artifact names`);
}

const ignore = read(".gitignore");
if (!ignore.includes("src-tauri/runtime/python-worker/*") || !ignore.includes("!src-tauri/runtime/python-worker/README.md")) {
  failures.push("generated frozen runtime is not bounded by .gitignore");
}
const notices = read("THIRD_PARTY_NOTICES.md");
for (const marker of ["PyInstaller 6.21.0", "Python 3.12.10", "contamxpy 0.0.9", "windows-sys 0.61.2"]) {
  if (!notices.includes(marker)) failures.push(`third-party notice is missing ${marker}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log("EXPERT-FIX runtime/distribution contract passed: frozen worker, source-independent discovery, Job Object containment, packaging and notices are bound.");
}
