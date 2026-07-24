import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const sourceRoot = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const checker = path.join(sourceRoot, "scripts", "tests", "test-data-lifecycle-contract.mjs");
const tempBase = path.join("F:\\Codex_File", "temp", "contam-studio");
const tempRoot = fs.mkdtempSync(path.join(tempBase, "fnd-06-data-"));

function copyBaseline(name) {
  const caseRoot = path.join(tempRoot, name);
  fs.mkdirSync(caseRoot, {recursive: true});
  fs.cpSync(path.join(sourceRoot, "contracts"), path.join(caseRoot, "contracts"), {recursive: true});
  fs.cpSync(path.join(sourceRoot, "src-tauri", "src"), path.join(caseRoot, "src-tauri", "src"), {recursive: true});
  fs.cpSync(path.join(sourceRoot, "python", "src"), path.join(caseRoot, "python", "src"), {recursive: true});
  return caseRoot;
}

function mutateJson(caseRoot, mutate) {
  const filePath = path.join(caseRoot, "contracts", "data-lifecycle.v1.json");
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  mutate(value);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function expectFailure(name, diagnostic, mutate) {
  const caseRoot = copyBaseline(name);
  mutate(caseRoot);
  const result = spawnSync(process.execPath, [checker, caseRoot], {encoding: "utf8"});
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0) throw new Error(`Mutation ${name} unexpectedly passed.`);
  if (!output.includes(`[${diagnostic}]`)) throw new Error(`Mutation ${name} missed ${diagnostic}: ${output}`);
}

try {
  const baseline = spawnSync(process.execPath, [checker, sourceRoot], {encoding: "utf8"});
  if (baseline.status !== 0) throw new Error(`Baseline data contract failed: ${baseline.stderr || baseline.stdout}`);
  expectFailure("wrong-function-owner", "data_function_missing", (root) => {
    mutateJson(root, (contract) => { contract.entries[0].functions[0] = "archive_file_path"; });
  });
  expectFailure("unreachable-storage-join", "data_join_missing", (root) => {
    mutateJson(root, (contract) => { contract.entries[0].joins.push("unreachable-storage"); });
  });
  expectFailure("undisclosed-rust-join", "data_join_undisclosed", (root) => {
    const filePath = path.join(root, "src-tauri", "src", "zone_bridge.rs");
    fs.appendFileSync(filePath, '\nfn undisclosed_storage_join() { let _ = PathBuf::from("root").join("undisclosed-storage"); }\n', "utf8");
  });
  expectFailure("stale-function-registration", "data_function_missing", (root) => {
    mutateJson(root, (contract) => { contract.entries[4].functions[0] = "extract_zone_air_state_removed"; });
  });
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}

console.log("Data lifecycle mutation tests passed: wrong owners, unreachable joins, undisclosed joins, and stale functions were rejected.");
