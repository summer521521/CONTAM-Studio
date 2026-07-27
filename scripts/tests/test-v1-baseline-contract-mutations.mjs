import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const sourceRoot = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const checker = path.join(sourceRoot, "scripts", "tests", "test-v1-baseline-contract.mjs");
const tempBase = process.env.RUNNER_TEMP
  ? path.join(process.env.RUNNER_TEMP, "contam-studio")
  : "F:\\Codex_File\\temp\\contam-studio";
fs.mkdirSync(tempBase, {recursive: true});
const tempRoot = fs.mkdtempSync(path.join(tempBase, "batch-a-contract-"));

function copyCase(name) {
  const root = path.join(tempRoot, name);
  fs.mkdirSync(path.join(root, "contracts"), {recursive: true});
  fs.mkdirSync(path.join(root, "docs", "product"), {recursive: true});
  fs.mkdirSync(path.join(root, "docs", "adr"), {recursive: true});
  fs.mkdirSync(path.join(root, "docs", "ui"), {recursive: true});
  fs.mkdirSync(path.join(root, "fixtures", "contam", "official-contamxpy"), {recursive: true});
  fs.mkdirSync(path.join(root, "fixtures", "contam", "official-nist-tutorials"), {recursive: true});
  for (const relative of ["contracts/process-lifecycle.v1.json", "contracts/owned-artifact-store.v1.json", "contracts/bilingual-terminology.v1.json", "contracts/design-system.v1.json", "contracts/user-journeys.v1.json", "contracts/information-architecture.v1.json", "contracts/architecture-interfaces.v1.json"]) fs.copyFileSync(path.join(sourceRoot, relative), path.join(root, relative));
  for (const relative of ["docs/product/supported-profiles-v1.md", "docs/adr/ADR-012-controlled-process-lifecycle.md", "docs/adr/ADR-013-owned-artifact-store-lifecycle.md", "docs/adr/ADR-014-v1-architecture-interface-set.md", "docs/product/v1-product-contract.md", "docs/product/user-journeys-v1.md", "docs/ui/information-architecture-v1.md", "docs/ui/design-system-v1.md", "docs/product/bilingual-terminology-v1.md"]) { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.copyFileSync(path.join(sourceRoot, relative), target); }
  for (const relative of ["fixtures/contam/official-contamxpy/test_GetPrjInfo.prj", "fixtures/contam/official-nist-tutorials/demo1c.prj"]) fs.copyFileSync(path.join(sourceRoot, relative), path.join(root, relative));
  return root;
}
function expectFailure(name, relative, mutate, diagnostic) {
  const root = copyCase(name);
  const file = path.join(root, relative);
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  mutate(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  const result = spawnSync(process.execPath, [checker, root], {encoding: "utf8"});
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0 || !output.includes(`[${diagnostic}]`)) throw new Error(`Mutation ${name} did not reject as expected: ${output}`);
}
try {
  expectFailure("process-state", "contracts/process-lifecycle.v1.json", (value) => { value.status_vocabulary.pop(); }, "process_states");
  expectFailure("quota", "contracts/owned-artifact-store.v1.json", (value) => { value.hard_quota_bytes = 1024; }, "store_quota");
  expectFailure("glossary", "contracts/bilingual-terminology.v1.json", (value) => { delete value.labels.fact.en; }, "glossary_parity");
  expectFailure("journey-field", "contracts/user-journeys.v1.json", (value) => { delete value.journeys[0].evidence; }, "journey_field");
} finally { fs.rmSync(tempRoot, {recursive: true, force: true}); }
console.log("v1 baseline mutation tests passed: process, storage, and bilingual bypasses were rejected.");
