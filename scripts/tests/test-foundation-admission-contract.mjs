import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const failures = [];
function fail(code, message) { failures.push(`[${code}] ${message}`); }
function readJson(relative) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
  catch (error) { fail("admission_json", `${relative}: ${error.message}`); return null; }
}
const admission = readJson("contracts/foundation-admission.v1.json");
const ledger = readJson("docs/development/foundation-defect-ledger.json");
if (admission) {
  if (admission.version !== 1 || admission.review_status !== "h_final_reviewed_with_deferred_product_work" || admission.h_final_claimed !== true) fail("admission_status", "Admission must record the completed H-FINAL review without claiming deferred product work.");
  if (admission.h_final_record !== "docs/development/task-log/records/h-final-v1-candidate-review.md") fail("admission_status", "H-FINAL record path is invalid.");
  if (!/^[0-9a-f]{40}$/.test(admission.h_final_fix_commit)) fail("admission_status", "H-FINAL fix commit is invalid.");
  if (!/^[0-9a-f]{40}$/.test(admission.baseline_head)) fail("admission_head", "baseline_head must be a full lowercase SHA.");
  let head = "";
  try { head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {encoding: "utf8"}).trim(); }
  catch (error) { fail("admission_git", error.message); }
  try {
    execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", admission.baseline_head, "HEAD"], {stdio: "ignore"});
  } catch { fail("admission_head", `Expected admitted baseline ${admission.baseline_head} to remain an ancestor of HEAD ${head}.`); }
  for (const entry of admission.admitted_commits || []) {
    if (!/^[0-9a-f]{40}$/.test(entry.commit)) fail("admission_commit", `${entry.task} has invalid SHA.`);
    try { execFileSync("git", ["-C", root, "cat-file", "-e", `${entry.commit}^{commit}`], {stdio: "ignore"}); }
    catch { fail("admission_commit", `${entry.task} commit is not reachable.`); }
  }
  if (new Set((admission.admitted_commits || []).map((entry) => entry.task)).size !== 6) fail("admission_set", "Expected exactly FND-01 through FND-06 admission entries.");
}
if (ledger) {
  const findings = Array.isArray(ledger.findings) ? ledger.findings : [];
  if (findings.length !== 9 || findings.some((finding) => finding.status !== "admitted")) fail("admission_ledger", "All nine foundation findings must carry H-FINAL admission evidence.");
}
if (failures.length) { for (const failure of failures) console.error(failure); process.exit(1); }
console.log("Foundation admission contract passed: FND-01..06 are reachable and H-FINAL is recorded without promoting deferred product work.");
