import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const required = [
  "src-tauri/src/release.rs",
  "src/app/release-state.ts",
  "src/components/workbench/ReleaseSettings.tsx",
  "scripts/check-release-metadata.mjs",
  "scripts/audit-release.mjs",
  "scripts/build-release.ps1",
  "scripts/build-installers.ps1",
  "scripts/file-sha256.mjs",
  "docs/architecture/agent-06-packaging-release.md",
  "docs/development/task-log/records/agent-06-packaging-release.md",
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`missing ${file}`);
const config = JSON.parse(read("src-tauri/tauri.conf.json"));
if (config.bundle?.active !== true) failures.push("Tauri bundle must be active for release candidates");
if (JSON.stringify(config.bundle?.targets ?? []) !== JSON.stringify(["nsis", "msi"])) failures.push("Tauri bundle targets must be deterministic NSIS then MSI");
const release = read("src-tauri/src/release.rs");
for (const marker of ["get_studio_setup", "save_studio_setup", "select_and_probe_official_tool", "get_diagnostics_summary", "export_sanitized_diagnostics", "ToolStatus::NotConfigured", "config_version_unsupported"]) {
  if (!release.includes(marker)) failures.push(`release boundary missing ${marker}`);
}
const audit = read("scripts/audit-release.mjs");
for (const marker of ["\.prj", "\.sim", "node_modules", "PRIVATE KEY", "unsigned_build"]) if (!audit.includes(marker.replaceAll("\\", ""))) failures.push(`artifact audit missing ${marker}`);
if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log("AGENT-06 release contract passed: config, wizard boundary, diagnostics and artifact audit are present.");
}
