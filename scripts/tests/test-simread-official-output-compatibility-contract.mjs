import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", ".."));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const matrix = JSON.parse(read("docs/capability-status-matrix.json"));
const capability = matrix.capabilities.find((item) => item.id === "simread-official-output-compatibility");
let passed = 0;

function assert(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  passed += 1;
}

const taskLog = read("docs/development/task-log/records/simread-official-output-compatibility.md");
const parser = read("python/src/contam_studio_core/zone_air_state_results.py");
const runner = read("python/src/contam_studio_core/simread_runner.py");
const rust = read("src-tauri/src/zone_bridge.rs");
const resultsWorkspace = read("src/components/workbench/results/ResultsWorkspace.tsx");

const taskStatusPattern = /(?:^|\r?\n)status: (?:in_progress|completed)(?:\r?\n|$)/;
assert("task log has an active or completed status", taskStatusPattern.test(taskLog));
const taskLogCrlf = taskLog.replace(/\r?\n/g, "\r\n");
assert("task status remains portable under CRLF", taskStatusPattern.test(taskLogCrlf));
const taskLogWithoutTrailingNewline = taskLogCrlf.replace(/(?:\r\n|\n)+$/, "");
assert("task status remains valid without a trailing newline", taskStatusPattern.test(taskLogWithoutTrailingNewline));
assert("task log records the official unavailable diagnostic", taskLog.includes("simread_node_air_state_unavailable"));
assert("task log records the successful official sample count", taskLog.includes("289 个样本"));
assert("parser strips only ASCII field-boundary spaces", parser.includes('token.strip(" ")'));
assert("runner recognizes the official no-node marker", runner.includes("NODE_CONTAMINANT_RESULTS_NOT_AVAILABLE"));
assert("runner emits the stable no-node diagnostic", runner.includes('"simread_node_air_state_unavailable"'));
assert("Rust keeps the no-node diagnostic as a soft dataset failure", rust.includes("result_dataset_failure_is_hard") && rust.includes("SIMREAD_NODE_AIR_STATE_UNAVAILABLE_DIAGNOSTIC"));
assert("main results receives the compatibility reader state", resultsWorkspace.includes("resultState.status === \"error\""));
assert("main results exposes the effective read failure status", resultsWorkspace.includes("effectiveReadStatus"));
assert("matrix marks implementation complete", capability?.implemented === "complete");
assert("matrix records the current automated verification state", ["partial", "passed"].includes(capability?.automated_verified));
assert("matrix records real official tools passed", capability?.real_tools === "passed");
assert("matrix keeps GUI unclaimed", capability?.manual_gui === "not_run");

console.log(`SimRead official output compatibility: ${passed} assertions passed.`);
