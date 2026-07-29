import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const root = path.resolve(process.argv[2] ?? process.env.CONTAM_STUDIO_ARTIFACT_ROOT ?? "F:/Codex_File/artifacts/contam-studio/agent-06");
const failures = [];
const files = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target); else files.push(target);
  }
}
walk(root);
const forbiddenNames = [/\.prj$/i, /\.sim$/i, /\.csv$/i, /\.nfr$/i, /fixture/i, /node_modules/i, /\.venv/i, /secret/i, /token/i, /cookie/i, /debug\.log$/i];
const forbiddenProvenance = [/F:\\CONTAM Studio/i, /F:\\Codex_File/i, /F:\\python\\/i, /C:\\Users\\[^\\]+\\/i, /agent-08-installer-clean-machine/i];
const forbiddenSensitiveText = [/BEGIN (RSA|OPENSSH) PRIVATE KEY/i, /password\s*=/i, /api[_-]?key\s*=/i, /bearer\s+[a-z0-9._~-]{16,}/i];
const textExtensions = new Set([".json", ".md", ".txt", ".log", ".ini", ".conf", ".toml", ".yaml", ".yml", ".xml", ".html", ".js", ".mjs", ".css", ".ps1"]);
for (const file of files) {
  const relative = path.relative(root, file);
  if (forbiddenNames.some((pattern) => pattern.test(relative))) failures.push(`forbidden artifact name: ${relative}`);
  const bytes = fs.readFileSync(file);
  const representations = [bytes.toString("utf8"), bytes.toString("utf16le"), bytes.toString("latin1")];
  for (const pattern of forbiddenProvenance) {
    if (representations.some((text) => pattern.test(text))) failures.push(`forbidden provenance ${pattern}: ${relative}`);
  }
  if (textExtensions.has(path.extname(file).toLowerCase())) {
    const text = representations[0];
    for (const pattern of forbiddenSensitiveText) if (pattern.test(text)) failures.push(`forbidden sensitive text ${pattern}: ${relative}`);
  }
}
if (!files.some((file) => /manifest\.json$/i.test(file))) failures.push("artifact manifest is missing");
const manifest = {
  schema_version: 1,
  artifact_root: "external_artifact_root",
  unsigned_build: true,
  files: files.map((file) => ({ path: path.relative(root, file).replaceAll("\\", "/"), sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") })).sort((a, b) => a.path.localeCompare(b.path)),
};
if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(manifest, null, 2));
}
