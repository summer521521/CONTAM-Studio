import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const contractPath = path.join(root, "contracts", "rust-authority.v1.json");
const failures = [];

function fail(code, message) {
  failures.push(`[${code}] ${message}`);
}

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    fail("authority_missing_file", `${relativePath} is missing.`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function cleanRust(source) {
  let output = "";
  let blockDepth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (blockDepth > 0) {
      if (char === "/" && next === "*") {
        blockDepth += 1;
        output += "  ";
        index += 1;
      } else if (char === "*" && next === "/") {
        blockDepth -= 1;
        output += "  ";
        index += 1;
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (quote !== null) {
      if (char === "\n") {
        quote = null;
        output += "\n";
        escaped = false;
      } else {
        output += " ";
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = null;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      output += "  ";
      index += 1;
      while (index + 1 < source.length && source[index + 1] !== "\n") {
        index += 1;
        output += " ";
      }
      continue;
    }
    if (char === "/" && next === "*") {
      blockDepth = 1;
      output += "  ";
      index += 1;
      continue;
    }
    if (char === '"') {
      quote = char;
      output += " ";
      continue;
    }
    output += char;
  }
  if (blockDepth !== 0) fail("visibility_unknown_syntax", "unterminated Rust block comment.");
  return output;
}

function expectedSet(expected) {
  const set = new Set();
  for (const [kind, names] of Object.entries(expected)) {
    for (const name of names) set.add(`${kind}:${name}`);
  }
  return set;
}

function scanPublicItems(relativePath, source, expected) {
  const clean = cleanRust(source);
  const expectedItems = expectedSet(expected);
  const actual = new Set();
  const lines = clean.split("\n");
  const declaration = /^\s*pub(?:\s*\((?<restricted>[^)]*)\))?\s+(?:(?:async|unsafe|extern\s+"[^"]+")\s+)*(?<kind>fn|struct|enum|trait|type|static|const|union|use|mod)\b\s*(?<name>[A-Za-z_][A-Za-z0-9_]*)?/;
  const field = /^\s*pub(?:\s*\((?<restricted>[^)]*)\))?\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*:/;
  for (const [index, line] of lines.entries()) {
    if (!/\bpub\b/.test(line)) continue;
    if (/^\s*pub(?:\s*\([^)]*\))?\s+extern\b/.test(line)) {
      fail("visibility_forbidden_form", `${relativePath}:${index + 1} exposes forbidden extern authority.`);
      continue;
    }
    const match = line.match(declaration);
    const fieldMatch = line.match(field);
    if (!match && !fieldMatch) {
      fail("visibility_unknown_syntax", `${relativePath}:${index + 1} contains unsupported public Rust syntax.`);
      continue;
    }
    if (fieldMatch) {
      const visibility = fieldMatch.groups.restricted ? `pub(${fieldMatch.groups.restricted})` : "pub";
      if (visibility === "pub") fail("visibility_public_field", `${relativePath}:${index + 1} exposes field ${fieldMatch.groups.name}.`);
      continue;
    }
    const kind = match.groups.kind === "fn" ? "functions" : {
      struct: "structs",
      enum: "enums",
      trait: "traits",
      type: "types",
      static: "statics",
      const: "constants",
      union: "unions",
      use: "reexports",
      mod: "modules"
    }[match.groups.kind];
    const name = match.groups.name || (match.groups.kind === "use" ? line.replace(/^\s*pub\s+use\s+/, "").replace(/\s*;.*$/, "").trim() : "");
    const visibility = match.groups.restricted ? `pub(${match.groups.restricted})` : "pub";
    if (visibility !== "pub") continue;
    const key = `${kind}:${name}`;
    actual.add(key);
    if (match.groups.kind === "union" || match.groups.kind === "use" && /::\s*\*/.test(line) || match.groups.kind === "mod") {
      fail("visibility_forbidden_form", `${relativePath}:${index + 1} exposes forbidden ${match.groups.kind} authority.`);
    }
  }
  for (const key of actual) if (!expectedItems.has(key)) fail("visibility_unregistered", `${relativePath} exposes unregistered ${key}.`);
  for (const key of expectedItems) if (!actual.has(key)) fail("visibility_missing", `${relativePath} is missing required ${key}.`);
  return { actual, clean };
}

function scanFacade(relativePath, source, requiredFacade) {
  const clean = cleanRust(source);
  for (const name of requiredFacade.functions) {
    if (!new RegExp(`^\\s*pub\\s+fn\\s+${name}\\b`, "m").test(clean)) fail("facade_missing", `${relativePath} is missing public function ${name}.`);
  }
  for (const name of requiredFacade.reexports) {
    if (!new RegExp(`^\\s*pub\\s+use\\s+.*${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "m").test(clean)) fail("facade_missing", `${relativePath} is missing public re-export ${name}.`);
  }
  for (const name of requiredFacade.public_modules) {
    if (!new RegExp(`^\\s*pub\\s+mod\\s+${name}\\b`, "m").test(clean)) fail("facade_missing", `${relativePath} is missing public module ${name}.`);
  }
}

function countBraces(line) {
  return (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
}

function scanRustProcesses(relativePath, source) {
  const clean = cleanRust(source);
  const lines = clean.split("\n");
  let braceDepth = 0;
  let pendingFunction = null;
  let functionContext = null;
  let implContext = null;
  const calls = [];
  const occurrences = new Map();
  for (const [index, line] of lines.entries()) {
    if (functionContext && braceDepth < functionContext.bodyDepth) functionContext = null;
    if (implContext && braceDepth < implContext.bodyDepth) implContext = null;
    const implMatch = line.match(/^\s*impl(?:<[^>]+>)?\s+([A-Za-z_][A-Za-z0-9_]*)/);
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    if (implMatch && opens > closes) implContext = {name: implMatch[1], bodyDepth: braceDepth + opens};
    const fnMatch = line.match(/^\s*(?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (fnMatch) pendingFunction = fnMatch[1];
    if (pendingFunction && opens > 0) {
      functionContext = {
        name: pendingFunction,
        owner: implContext ? `${implContext.name}::${pendingFunction}` : pendingFunction,
        bodyDepth: braceDepth + opens
      };
      pendingFunction = null;
    }
    if (/\b(?:std::process::)?Command::new\s*\(/.test(line)) {
      if (!functionContext) fail("process_owner_unknown", `${relativePath}:${index + 1} process call has no function owner.`);
      const owner = functionContext?.owner;
      const occurrence = (occurrences.get(owner) || 0) + 1;
      occurrences.set(owner, occurrence);
      calls.push({path: relativePath, kind: "rust_command", owner, occurrence, line: index + 1});
    }
    braceDepth += opens - closes;
    if (functionContext && braceDepth < functionContext.bodyDepth) functionContext = null;
    if (implContext && braceDepth < implContext.bodyDepth) implContext = null;
  }
  return calls;
}

function scanPythonProcesses(relativePath, source) {
  const lines = source.split("\n");
  const functions = [];
  const calls = [];
  const occurrences = new Map();
  for (const [index, line] of lines.entries()) {
    const fn = line.match(/^(?<indent>\s*)(?:async\s+)?def\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (fn) {
      const indent = fn.groups.indent.length;
      while (functions.length && functions.at(-1).indent >= indent) functions.pop();
      functions.push({name: fn.groups.name, indent});
    }
    if (/\b(?:subprocess\.)?Popen\s*\(/.test(line)) {
      const indent = line.match(/^\s*/)[0].length;
      const owner = [...functions].reverse().find((item) => item.indent < indent)?.name;
      if (!owner) fail("process_owner_unknown", `${relativePath}:${index + 1} process call has no function owner.`);
      const occurrence = (occurrences.get(owner) || 0) + 1;
      occurrences.set(owner, occurrence);
      calls.push({path: relativePath, kind: "python_popen", owner, occurrence, line: index + 1});
    }
  }
  return calls;
}

function processKey(item) {
  return `${item.path}|${item.kind}|${item.owner}|${item.occurrence ?? 1}`;
}

let contract;
try {
  contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
} catch (error) {
  fail("authority_contract", `Unable to decode rust-authority.v1.json: ${error.message}`);
}

if (contract) {
  for (const file of contract.rust) {
    const source = read(file.path);
    scanPublicItems(file.path, source, file.expected);
    scanFacade(file.path, source, file.required_facade);
  }
  const registered = new Map(contract.process.map((item) => [processKey(item), item]));
  if (registered.size !== contract.process.length) fail("process_duplicate_registration", "Process inventory contains duplicate registrations.");
  const discovered = [];
  for (const file of contract.process) {
    if (discovered.some((item) => item.path === file.path)) continue;
    const source = read(file.path);
    discovered.push(...(file.kind === "rust_command" ? scanRustProcesses(file.path, source) : scanPythonProcesses(file.path, source)));
  }
  const discoveredMap = new Map(discovered.map((item) => [processKey(item), item]));
  for (const key of discoveredMap.keys()) if (!registered.has(key)) fail("process_unregistered", `Discovered process call ${key} has no registration.`);
  for (const key of registered.keys()) if (!discoveredMap.has(key)) fail("process_stale_registration", `Registered process call ${key} was not discovered.`);
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`Rust authority contract passed: ${contract.rust.length} Rust files and ${contract.process.length} process call registrations are bidirectionally bound.`);
