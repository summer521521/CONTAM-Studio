import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const packageJson = JSON.parse(read("package.json"));
const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const cargo = read("src-tauri/Cargo.toml");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!packageJson.version || !cargoVersion || !tauri.version) failures.push("missing version source");
for (const [label, value] of [["Cargo", cargoVersion], ["Tauri", tauri.version]]) {
  if (value !== packageJson.version) failures.push(`${label} version ${value} does not match package ${packageJson.version}`);
}
if (tauri.productName !== "CONTAM Studio") failures.push("tauri productName must be CONTAM Studio");
if (!Array.isArray(tauri.bundle?.targets) || !tauri.bundle.targets.includes("nsis") || !tauri.bundle.targets.includes("msi")) failures.push("Windows NSIS/MSI targets are not configured");
if (fs.existsSync(path.join(root, "dist"))) {
  const forbidden = ["F:\\CONTAM Studio", "node_modules", "python\\.venv"];
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target); else files.push(target);
    }
  };
  walk(path.join(root, "dist"));
  for (const file of files) {
    const data = fs.readFileSync(file);
    const text = data.toString("utf8");
    for (const marker of forbidden) if (text.includes(marker)) failures.push(`build output contains forbidden marker ${marker}: ${path.relative(root, file)}`);
  }
}
if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Release metadata passed: version ${packageJson.version}; package/Cargo/Tauri agree.`);
}
