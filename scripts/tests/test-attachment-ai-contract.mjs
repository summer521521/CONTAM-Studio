import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const failures = [];
const fail = (message) => failures.push(message);
let contract;
try { contract = JSON.parse(fs.readFileSync(path.join(root, "contracts", "attachment-ai.v1.json"), "utf8")); } catch (error) { fail(`invalid contract: ${error.message}`); }
if (contract) {
  if (contract.limits?.file_bytes !== 50 * 1024 * 1024 || contract.limits?.batch_bytes !== 100 * 1024 * 1024 || contract.limits?.archive_ratio !== 20) fail("attachment limits drift");
  for (const item of ["macro", "script", "embedded_executable", "javascript", "encrypted", "external_link"]) if (!contract.active_content?.includes(item)) fail(`missing active-content refusal ${item}`);
  if (contract.remote_default !== "disabled" || contract.path_visibility !== "never_to_webview_or_model") fail("remote/path privacy drift");
  for (const item of ["shell_forbidden", "generic_filesystem_forbidden", "raw_prj_forbidden", "dynamic_mcp_forbidden"]) if (!contract.machine_authority?.includes(item)) fail(`missing AI authority boundary ${item}`);
  if (contract.approval?.single_use !== true || contract.approval?.hash_bound !== true || contract.approval?.expiry_minutes !== 15) fail("approval policy drift");
}
if (failures.length) { for (const failure of failures) console.error(`[FAIL] ${failure}`); process.exit(1); }
console.log("Attachment and AI contract passed: limits, active-content refusal, privacy, authority, and approval are closed.");
