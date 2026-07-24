import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const failures = [];
const fail = (code, message) => failures.push(`[${code}] ${message}`);
let manifest;
try { manifest = JSON.parse(fs.readFileSync(path.join(root, "contracts", "fixture-manifest.v1.json"), "utf8")); }
catch (error) { fail("json", error.message); }
const tracked = (() => {
  try { return execFileSync("git", ["-C", root, "ls-files", "fixtures/contam"], {encoding: "utf8"}).trim().split(/\r?\n/).filter(Boolean); }
  catch (error) { fail("git", error.message); return []; }
})();
if (manifest) {
  if (manifest.version !== 1 || manifest.root !== "fixtures/contam" || manifest.redistribution_policy !== "only_manifested_sources") fail("identity", "Fixture manifest identity or redistribution policy is invalid.");
  const entries = Array.isArray(manifest.fixtures) ? manifest.fixtures : [];
  const paths = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.path !== "string" || paths.has(entry.path)) { fail("entry", "Fixture paths must be unique and nonempty."); continue; }
    paths.add(entry.path);
    const full = path.join(root, manifest.root, entry.path);
    if (!fs.statSync(full, {throwIfNoEntry: false})?.isFile()) { fail("missing", `Fixture ${entry.path} is missing.`); continue; }
    const bytes = fs.readFileSync(full);
    const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
    if (hash !== entry.sha256 || bytes.length !== entry.size_bytes) fail("identity", `Fixture ${entry.path} hash or size changed.`);
    if (typeof entry.license_file !== "string" || !fs.statSync(path.join(root, manifest.root, entry.license_file), {throwIfNoEntry: false})?.isFile()) fail("license", `Fixture ${entry.path} has no tracked source license/readme.`);
    if (!Array.isArray(entry.exclusions) || entry.exclusions.length === 0) fail("exclusions", `Fixture ${entry.path} must declare exclusions.`);
  }
  for (const relative of tracked) {
    const extension = path.extname(relative).toLowerCase();
    if (manifest.forbidden_derived_extensions.includes(extension)) fail("derived", `Derived file ${relative} may not be tracked.`);
    if (extension === ".prj" && !paths.has(relative.slice("fixtures/contam/".length))) fail("unmanifested", `PRJ ${relative} is not in the fixture manifest.`);
  }
}
if (failures.length) { for (const failure of failures) console.error(failure); process.exit(1); }
console.log(`Fixture manifest contract passed: ${manifest.fixtures.length} source-manifested PRJ fixtures are hash-bound and derived outputs are excluded.`);
