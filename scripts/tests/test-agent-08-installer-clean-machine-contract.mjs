import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? process.cwd());
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const required = [
  "docs/release/agent-08-packaging-toolchain.json",
  "docs/release/agent-08-installer-clean-machine.md",
  "docs/development/agent-08-installer-clean-machine-handoff.md",
  "docs/development/task-log/records/agent-08-installer-clean-machine.md",
  "scripts/resolve-packaging-toolchain.ps1",
  "scripts/build-installers.ps1",
  "scripts/repackage-bundles-local.ps1",
  "scripts/release-closure.ps1",
  "scripts/tests/test-installer-isolated.ps1",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`missing ${file}`);

const manifest = JSON.parse(read("docs/release/agent-08-packaging-toolchain.json"));
if (manifest.system_install !== false || manifest.admin_required !== false || manifest.system_path_modified !== false || manifest.registry_modified !== false) {
  failures.push("toolchain manifest permits system installation or mutation");
}
if (manifest.tools?.nsis?.version !== "3.12" || manifest.tools?.wix?.version !== "3.14.1") failures.push("toolchain versions are not pinned");
for (const tool of [manifest.tools?.nsis, manifest.tools?.wix]) {
  if (!tool?.source_url || !tool?.archive_sha256 || !tool?.license) failures.push("toolchain source/hash/license evidence is incomplete");
}
if (!manifest.tools?.tauri_nsis_utils?.source_url || !manifest.tools?.tauri_nsis_utils?.sha256 || !manifest.tools?.tauri_nsis_utils?.license) failures.push("Tauri NSIS helper source/hash/license evidence is incomplete");
const build = read("scripts/build-installers.ps1");
for (const marker of ["resolve-packaging-toolchain.ps1", "F:\\Codex_File\\toolchains\\contam-studio-packaging", "LOCALAPPDATA", "repackage-bundles-local.ps1", "--bundles nsis msi", "--no-sign", "blocked_environment", "external_toolchain_root"]) {
  if (!build.includes(marker)) failures.push(`installer build boundary missing ${marker}`);
}
if (build.includes("[Environment]::SetEnvironmentVariable") || build.includes("Set-ItemProperty")) failures.push("installer build attempts persistent system mutation");
const closure = read("scripts/release-closure.ps1");
for (const marker of ["agent-08", "ToolchainRoot", "release-diagnostics", "audit-release", "clean_windows_install = \"blocked\"", "signature = \"unsigned\""]) {
  if (!closure.includes(marker)) failures.push(`release closure marker missing ${marker}`);
}
const log = read("docs/development/task-log/records/agent-08-installer-clean-machine.md");
if (!/^status:\s+automated_verified/m.test(log)) failures.push("AGENT-08 log must end automated_verified after automated closure");
if (!/F:\\{1,2}Codex_File/m.test(log) || !/不读取或修改真实PRJ、CSV、SIM/.test(log)) failures.push("AGENT-08 log boundary is missing");
const matrix = JSON.parse(read("docs/capability-status-matrix.json"));
const row = matrix.capabilities.find((item) => item.id === "agent-08-installer-clean-machine");
if (!row || row.merged_to_main !== "no" || row.manual_gui !== "pending_user") failures.push("capability matrix AGENT-08 row is not conservatively pending");
if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log("AGENT-08 installer/clean-machine contract passed: local toolchain, unsigned boundary, artifact scope and pending acceptance are explicit.");
}
