import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const file = path.join(root, "contracts", "supported-domain.v1.json");
const failures = [];
const fail = (message) => failures.push(message);
let contract;
try { contract = JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { fail(`invalid contract: ${error.message}`); }
if (contract) {
  if (contract.schema_version !== "supported_domain.v1") fail("schema version drift");
  const airflow = contract.profiles?.airflow;
  if (JSON.stringify(airflow?.endpoint_categories) !== JSON.stringify(["outdoor", "zone"])) fail("endpoint categories drift");
  if (JSON.stringify(airflow?.supported_flow_models) !== JSON.stringify(["plr_orfc", "plr_leak3"])) fail("flow component allowlist drift");
  if (airflow?.unsupported_policy !== "reject_whole_path_as_opaque") fail("unsupported path policy drift");
  if (contract.profiles?.schedule?.time_basis !== "minutes_since_midnight") fail("schedule time basis drift");
  if (JSON.stringify(contract.profiles?.schedule?.coverage) !== JSON.stringify([0, 1440])) fail("schedule coverage drift");
  for (const status of ["supported_editable", "supported_readonly", "incompatible", "corrupt", "missing_companion", "tool_incompatible"]) {
    if (!contract.compatibility_statuses?.includes(status)) fail(`missing compatibility status ${status}`);
  }
  if (contract.companion_policy?.explicit_declarations_only !== true || contract.companion_policy?.recursive_discovery !== false || contract.companion_policy?.hash_binding !== true) fail("companion boundary is not explicit");
  if (contract.write_gate?.requires_patch_transaction !== true || contract.write_gate?.raw_prj_write !== false || contract.write_gate?.ai_write_default !== false) fail("write gate drift");
}
if (failures.length) { for (const failure of failures) console.error(`[FAIL] ${failure}`); process.exit(1); }
console.log("Supported domain contract passed: airflow, schedule, source, companion, compatibility, and write gates are closed.");
