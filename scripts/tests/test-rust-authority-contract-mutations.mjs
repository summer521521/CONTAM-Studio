import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const sourceRoot = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const checker = path.join(sourceRoot, "scripts", "tests", "test-rust-authority-contract.mjs");
const tempBase = process.env.RUNNER_TEMP
  ? path.join(process.env.RUNNER_TEMP, "contam-studio")
  : path.join("F:\\Codex_File", "temp", "contam-studio");
fs.mkdirSync(tempBase, {recursive: true});
const tempRoot = fs.mkdtempSync(path.join(tempBase, "fnd-05-authority-"));

function copyBaseline(name) {
  const caseRoot = path.join(tempRoot, name);
  fs.mkdirSync(caseRoot, {recursive: true});
  fs.cpSync(path.join(sourceRoot, "contracts"), path.join(caseRoot, "contracts"), {recursive: true});
  fs.cpSync(path.join(sourceRoot, "src-tauri", "src"), path.join(caseRoot, "src-tauri", "src"), {recursive: true});
  fs.cpSync(path.join(sourceRoot, "python", "src"), path.join(caseRoot, "python", "src"), {recursive: true});
  return caseRoot;
}

function append(caseRoot, relativePath, text) {
  const filePath = path.join(caseRoot, relativePath);
  fs.appendFileSync(filePath, `\n${text}\n`, "utf8");
}

function replace(caseRoot, relativePath, from, to) {
  const filePath = path.join(caseRoot, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes(from)) throw new Error(`Mutation source does not contain ${from}.`);
  fs.writeFileSync(filePath, source.replace(from, to), "utf8");
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
  if (baseline.status !== 0) throw new Error(`Baseline authority contract failed: ${baseline.stderr || baseline.stdout}`);
  expectFailure("public-union", "visibility_forbidden_form", (root) => {
    append(root, "src-tauri/src/zone_bridge.rs", "pub union EscapedAuthority { value: usize }");
  });
  expectFailure("public-extern", "visibility_forbidden_form", (root) => {
    append(root, "src-tauri/src/codex_app_server.rs", 'pub extern "C" fn escaped_authority() {}');
  });
  expectFailure("glob-reexport", "visibility_forbidden_form", (root) => {
    append(root, "src-tauri/src/lib.rs", "pub use crate::*;");
  });
  expectFailure("hidden-module", "visibility_unregistered", (root) => {
    append(root, "src-tauri/src/zone_bridge.rs", "mod hidden_authority {\n    pub fn bypass() {}\n}");
  });
  expectFailure("unknown-public-syntax", "visibility_unknown_syntax", (root) => {
    append(root, "src-tauri/src/codex_app_server.rs", "pub macro_rules! bypass { () => {} }");
  });
  expectFailure("missing-facade", "facade_missing", (root) => {
    replace(root, "src-tauri/src/lib.rs", "pub fn run()", "fn run()");
  });
  expectFailure("ninth-process-call", "process_unregistered", (root) => {
    append(root, "src-tauri/src/zone_bridge.rs", "fn ninth_process_authority() { let _ = Command::new(\"unexpected\"); }");
  });
  expectFailure("duplicate-process-call", "process_unregistered", (root) => {
    replace(root, "src-tauri/src/zone_bridge.rs", "let mut command = Command::new(executable);", "let _ = Command::new(executable);\n    let mut command = Command::new(executable);");
  });
  expectFailure("wrong-process-owner", "process_unregistered", (root) => {
    replace(root, "contracts/rust-authority.v1.json", '"owner": "probe_codex_version_at"', '"owner": "run_official_installer"');
  });
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}

console.log("Rust authority mutation tests passed: public forms, facade, function scope, duplicate calls, and wrong-owner registrations were rejected.");
