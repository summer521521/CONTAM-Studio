import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const contractPath = path.join(root, "contracts", "data-lifecycle.v1.json");
const failures = [];

function fail(code, message) {
  failures.push(`[${code}] ${message}`);
}

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    fail("data_missing_file", `${relativePath} is missing.`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function functionExists(source, name, python) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = python
    ? new RegExp(`^\\s*(?:async\\s+)?def\\s+${escaped}\\s*\\(`, "m")
    : new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:async\\s+)?fn\\s+${escaped}\\b`, "m");
  return pattern.test(source);
}

let contract;
try {
  contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
} catch (error) {
  fail("data_contract", `Unable to decode data-lifecycle.v1.json: ${error.message}`);
}

if (contract) {
  const declaredFunctions = new Set();
  const declaredJoins = new Set();
  const sources = new Map();
  for (const entry of contract.entries) {
    const source = sources.get(entry.path) || read(entry.path);
    sources.set(entry.path, source);
    const python = entry.path.endsWith(".py");
    for (const name of entry.functions) {
      const key = `${entry.path}:${name}`;
      declaredFunctions.add(key);
      if (!functionExists(source, name, python)) fail("data_function_missing", `${key} is not a production function.`);
    }
    for (const join of entry.joins) {
      const key = `${entry.path}:${join}`;
      declaredJoins.add(key);
      if (!source.includes(`"${join}"`)) fail("data_join_missing", `${key} is not reachable in the declared production file.`);
    }
  }
  for (const [relativePath, source] of sources) {
    if (relativePath.endsWith(".rs")) {
      for (const match of source.matchAll(/\.join\("([^"]+)"\)/g)) {
        if (!contract.allowed_rust_literal_joins.includes(match[1])) fail("data_join_undisclosed", `${relativePath} discovers an undeclared literal join ${match[1]}.`);
      }
    }
  }
  if (declaredFunctions.size !== contract.entries.reduce((count, entry) => count + entry.functions.length, 0)) fail("data_duplicate_function", "Lifecycle function declaration is duplicated.");
  if (declaredJoins.size !== contract.entries.reduce((count, entry) => count + entry.joins.length, 0)) fail("data_duplicate_join", "Lifecycle storage join declaration is duplicated.");
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`Data lifecycle contract passed: ${contract.entries.length} lifecycle declarations bind production functions and storage joins.`);
