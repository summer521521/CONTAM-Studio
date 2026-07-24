import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const sourceRoot = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const checker = path.join(sourceRoot, "scripts", "tests", "test-fixture-manifest-contract.mjs");
const tempRoot = fs.mkdtempSync(path.join("F:\\Codex_File\\temp\\contam-studio\\", "fixture-contract-"));
const source = JSON.parse(fs.readFileSync(path.join(sourceRoot, "contracts", "fixture-manifest.v1.json"), "utf8"));
function expectFailure(name, mutate, code) {
  const root = path.join(tempRoot, name);
  fs.mkdirSync(path.join(root, "contracts"), {recursive: true});
  fs.mkdirSync(path.join(root, "fixtures", "contam", "official-contamxpy"), {recursive: true});
  fs.mkdirSync(path.join(root, ".git"), {recursive: true});
  fs.copyFileSync(path.join(sourceRoot, "fixtures", "contam", "official-contamxpy", "test_GetPrjInfo.prj"), path.join(root, "fixtures", "contam", "official-contamxpy", "test_GetPrjInfo.prj"));
  fs.writeFileSync(path.join(root, "contracts", "fixture-manifest.v1.json"), `${JSON.stringify(mutate(structuredClone(source)))}\n`, "utf8");
  const result = spawnSync(process.execPath, [checker, root], {encoding: "utf8"});
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0 || !output.includes(`[${code}]`)) throw new Error(`${name} mutation was accepted: ${output}`);
}
try {
  expectFailure("hash", (value) => { value.fixtures[0].sha256 = "0".repeat(64); return value; }, "identity");
  expectFailure("license", (value) => { value.fixtures[0].license_file = "missing.txt"; return value; }, "license");
  expectFailure("exclusions", (value) => { value.fixtures[0].exclusions = []; return value; }, "exclusions");
} finally { fs.rmSync(tempRoot, {recursive: true, force: true}); }
console.log("Fixture manifest mutation tests passed: hash, license, and exclusion bypasses were rejected.");
