import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? process.cwd());
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const required = [
  "docs/user/CONTAM-Studio-0.1.0-user-manual-zh.md",
  "docs/development/agent-07-release-closure-handoff.md",
  "docs/release/agent-07-release-closure.md",
  "docs/release/uninstall-policy.json",
  "docs/development/task-log/records/agent-07-release-closure.md",
  "scripts/release-closure.ps1",
  "scripts/generate-release-diagnostics.mjs",
  "scripts/tests/test-portable-startup.ps1",
  "scripts/audit-release.mjs",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`missing ${file}`);
const packageJson = JSON.parse(read("package.json"));
for (const key of ["test:release-closure", "release:closure"]) if (!packageJson.scripts?.[key]) failures.push(`missing package script ${key}`);
const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
if (tauri.version !== packageJson.version) failures.push("Tauri version drift");
const cargo = read("src-tauri/Cargo.toml");
if (!cargo.includes(`version = \"${packageJson.version}\"`)) failures.push("Cargo version drift");
const uninstall = JSON.parse(read("docs/release/uninstall-policy.json"));
for (const key of ["user_projects", "study_results", "user_configuration", "external_contamx_simread", "external_directories"]) {
  if (uninstall[key] !== "preserve") failures.push(`uninstall policy does not preserve ${key}`);
}
const closure = read("scripts/release-closure.ps1");
for (const marker of ["blocked_environment", "unsigned", "Get-Command makensis", "Get-Command wix", "generate-release-diagnostics", "audit-release"]) {
  if (!closure.includes(marker)) failures.push(`release closure missing ${marker}`);
}
const policy = read("docs/release/uninstall-policy.json");
for (const marker of ["preserve", "requires_admin", "external_contamx_simread"]) {
  if (!policy.includes(marker)) failures.push(`uninstall boundary missing ${marker}`);
}
const diagnostics = read("scripts/generate-release-diagnostics.mjs");
for (const marker of ["unsigned_build", "configured_local_data", "project, attachment, credential, or absolute path content", '"wx"']) {
  if (!diagnostics.includes(marker)) failures.push(`diagnostic boundary missing ${marker}`);
}
if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log("AGENT-07 release closure contract passed: docs, status layers, migration/uninstall boundary and artifact checks are present.");
}
