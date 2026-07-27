import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const sourceRoot = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const checker = path.join(sourceRoot, "scripts", "tests", "test-patch-transaction-contract.mjs");
const tempBase = "F:\\Codex_File\\temp\\contam-studio";
fs.mkdirSync(tempBase, {recursive: true});
const tempRoot = fs.mkdtempSync(path.join(tempBase, "patch-contract-"));
const source = JSON.parse(fs.readFileSync(path.join(sourceRoot, "contracts", "patch-transaction.v1.json"), "utf8"));
function expectFailure(name, mutate, code) {
  const root = path.join(tempRoot, name);
  fs.mkdirSync(path.join(root, "contracts"), {recursive: true});
  const value = structuredClone(source);
  mutate(value);
  fs.writeFileSync(path.join(root, "contracts", "patch-transaction.v1.json"), `${JSON.stringify(value)}\n`, "utf8");
  const result = spawnSync(process.execPath, [checker, root], {encoding: "utf8"});
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0 || !output.includes(`[${code}]`)) throw new Error(`${name} mutation was accepted: ${output}`);
}
try {
  expectFailure("missing-diff", (value) => { value.approval.diff_required = false; }, "approval");
  expectFailure("multi-operation", (value) => { value.allowed_operations.push({kind: "replace_scalar", object_category: "zone", field: "temperature"}); }, "operation");
  expectFailure("path-authority", (value) => { value.forbidden_authority_fields = value.forbidden_authority_fields.filter((field) => field !== "source_path"); }, "forbidden");
} finally { fs.rmSync(tempRoot, {recursive: true, force: true}); }
console.log("PatchTransaction mutation tests passed: missing approval, unsupported operation, and path authority were rejected.");
