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
const forbiddenContent = [/F:\\\\CONTAM Studio/i, /C:\\\\Users\\[^\\]+\\/i, /BEGIN (RSA|OPENSSH) PRIVATE KEY/i, /password\s*=/i];
for (const file of files) {
  const relative = path.relative(root, file);
  if (forbiddenNames.some((pattern) => pattern.test(relative))) failures.push(`forbidden artifact name: ${relative}`);
  const bytes = fs.readFileSync(file);
  if (bytes.length <= 8 * 1024 * 1024) {
    const text = bytes.toString("utf8");
    for (const pattern of forbiddenContent) if (pattern.test(text)) failures.push(`forbidden content ${pattern}: ${relative}`);
  }
}
if (!files.some((file) => /manifest\.json$/i.test(file))) failures.push("artifact manifest is missing");
const manifest = {
  schema_version: 1,
  artifact_root: "F:/Codex_File/artifacts/contam-studio/agent-06",
  unsigned_build: true,
  files: files.map((file) => ({ path: path.relative(root, file).replaceAll("\\", "/"), sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") })).sort((a, b) => a.path.localeCompare(b.path)),
};
if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(manifest, null, 2));
}
