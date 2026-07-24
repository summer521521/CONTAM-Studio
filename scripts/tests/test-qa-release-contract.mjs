import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const failures = [];
const fail = (message) => failures.push(message);
let contract;
try { contract = JSON.parse(fs.readFileSync(path.join(root, "contracts", "qa-release.v1.json"), "utf8")); } catch (error) { fail(`invalid contract: ${error.message}`); }
if (contract) {
  for (const mode of ["Docs", "Fast", "Full", "Package", "RealTool", "Security", "AgentEval", "Release"]) if (!contract.modes?.includes(mode)) fail(`missing QA mode ${mode}`);
  for (const item of ["task_log", "contracts", "python", "frontend", "rust", "diff_check"]) if (!contract.required_local_checks?.includes(item)) fail(`missing local check ${item}`);
  for (const key of ["path_leak", "source_overwrite", "active_content_execution"]) if (contract.security?.[key] !== false) fail(`security boundary drift ${key}`);
  if (contract.performance?.validation_bypass !== false || contract.performance?.full_data_required !== true || contract.performance?.accessibility_required !== true) fail("performance safety drift");
  if (contract.release?.signed !== false || contract.release?.published !== false || contract.release?.auto_update !== false || contract.release?.ai_default !== "disabled" || contract.release?.remote_default !== "disabled") fail("release defaults drift");
  for (const row of ["gui", "real_tool", "clean_machine", "user_study", "h_review", "u_review"]) if (!contract.manual_rows?.includes(row)) fail(`missing manual row ${row}`);
}
if (failures.length) { for (const failure of failures) console.error(`[FAIL] ${failure}`); process.exit(1); }
console.log("QA and release contract passed: local checks, security, performance, release defaults, and manual rows are explicit.");
