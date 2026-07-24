import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const failures = [];
const fail = (message) => failures.push(message);
let contract;
try { contract = JSON.parse(fs.readFileSync(path.join(root, "contracts", "batch-c.v1.json"), "utf8")); } catch (error) { fail(`invalid contract: ${error.message}`); }
if (contract) {
  const statuses = ["queued", "starting", "running", "cancel_requested", "succeeded", "failed", "timed_out", "cancelled", "unknown_cleanup"];
  if (JSON.stringify(contract.process?.statuses) !== JSON.stringify(statuses)) fail("process status vocabulary drift");
  for (const key of ["job_proof_required", "pid_proof_required", "stream_frozen_required", "shared_absolute_deadline"]) if (contract.process?.[key] !== true) fail(`${key} missing`);
  if (contract.process?.late_success !== "reject") fail("late success policy drift");
  if (contract.tools?.discovery !== "explicit_selection_only") fail("tool discovery policy drift");
  if (contract.results?.max_page_size !== 512 || contract.results?.cursor !== "result_hash_bound" || contract.results?.statistics !== "deterministic_backend") fail("result transport policy drift");
  if (contract.storage?.soft_quota_bytes !== 10 * 1024 ** 3 || contract.storage?.hard_quota_bytes !== 20 * 1024 ** 3 || contract.storage?.commit_last !== true) fail("storage policy drift");
  if (contract.study?.max_cases !== 32 || contract.study?.sequential_default !== true || contract.study?.no_optimization_claim !== true) fail("study policy drift");
  if (contract.distribution?.standard_user !== true || contract.distribution?.offline_core !== true || contract.distribution?.official_tools_external !== true || contract.distribution?.auto_update !== false) fail("distribution policy drift");
}
if (failures.length) { for (const failure of failures) console.error(`[FAIL] ${failure}`); process.exit(1); }
console.log("Batch C contract passed: process, tools, results, storage, studies, and distribution boundaries are closed.");
