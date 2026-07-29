import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const failures = [];
let assertions = 0;

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function check(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

const lock = JSON.parse(read("resources/contam-tools.lock.json"));
const toolScript = read("scripts/build-contam-tools.ps1");
const prepareScript = read("scripts/prepare-contam-tools-runtime.ps1");
const releaseScript = read("scripts/build-release.ps1");
const installerScript = read("scripts/build-installers.ps1");
const closureScript = read("scripts/release-closure.ps1");
const releaseAudit = read("scripts/audit-release.mjs");
const panel = read("src/components/workbench/CodexAssistantPanel.tsx");
const releaseSettings = read("src/components/workbench/ReleaseSettings.tsx");
const rustRelease = read("src-tauri/src/release.rs");
const rustCatalog = read("src-tauri/src/ai_provider/catalog.rs");
const rustProvider = read("src-tauri/src/ai_provider/mod.rs");
const rustHttp = read("src-tauri/src/ai_provider/http.rs");
const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json"));

check(lock.product === "NIST CONTAM", "lock file product must identify NIST CONTAM");
check(/^https:\/\/www\.nist\.gov\//i.test(lock.official_page), "lock page must be official NIST HTTPS");
check(/^https:\/\/www\.nist\.gov\//i.test(lock.download_url), "lock download must be official NIST HTTPS");
check(/^[0-9A-F]{64}$/.test(lock.zip_sha256), "lock ZIP digest must be a SHA-256 value");
check(Array.isArray(lock.programs_used) && lock.programs_used.includes("contamx3.exe"), "lock must list ContamX");
check(Array.isArray(lock.programs_used) && lock.programs_used.includes("simread.exe"), "lock must list SimRead");
check(Array.isArray(lock.programs_used) && lock.programs_used.includes("simcomp.exe") && lock.programs_used.includes("prjup.exe"), "lock must list supporting tools");
check(Array.isArray(lock.files) && lock.files.length >= 4, "lock must contain the packaged file hashes");
for (const file of lock.files ?? []) {
  check(typeof file.file === "string" && !path.isAbsolute(file.file), `lock path must be relative: ${file.file}`);
  check(/^[0-9A-F]{64}$/.test(file.sha256), `lock file digest must be SHA-256: ${file.file}`);
}

const hashCheck = toolScript.indexOf("$actualZipSha256 = Get-Sha256Hex $ZipPath");
const expand = toolScript.indexOf("Expand-Archive -LiteralPath");
check(hashCheck >= 0 && expand > hashCheck, "ZIP hash must be checked before extraction");
check(toolScript.includes("SHA-256 mismatch") && toolScript.includes("throw"), "hash mismatch must fail closed");
check(toolScript.includes("www.nist.gov") && toolScript.includes("https"), "acquisition script must pin official NIST HTTPS");
check(toolScript.includes("phase-6c-user-first-runtime"), "acquisition script must use the Phase 6C temp root");
check(prepareScript.includes("resources\\contam-tools.lock.json") && prepareScript.includes("Get-FileHash"), "runtime preparation must verify the lock before sync");
check(prepareScript.includes("src-tauri\\runtime\\contam-tools") && prepareScript.includes("Remove-Item"), "runtime preparation must refresh only the owned runtime tree");
check(releaseScript.includes("prepare-contam-tools-runtime.ps1") && releaseScript.includes("runtime\\contam-tools"), "portable release build must prepare and copy NIST tools");
check(installerScript.includes("prepare-contam-tools-runtime.ps1"), "installer build must prepare NIST tools");
check(closureScript.includes("official_contam_tools_resource") && closureScript.includes("contam-tools.lock.json"), "release closure must record bundled NIST resources");
check(releaseAudit.includes("bundled ContamX runtime") && releaseAudit.includes("bundled SimRead runtime"), "release audit must require bundled ContamX and SimRead");

const resources = tauriConfig.bundle?.resources ?? {};
check(Object.keys(resources).some((source) => source.includes("contam-tools")), "Tauri resources must include the CONTAM runtime");
check(Object.keys(resources).some((source) => source.includes("contam-tools.lock.json")), "Tauri resources must include the tool lock");

check(panel.includes("selectedProvider?.built_in ? []") && panel.includes("manualModels ="), "built-in Providers must not expose legacy manual model IDs");
check(panel.includes("<details className=\"assistant-advanced\">") && panel.includes("manualModelsInput"), "custom manual model input must be under Advanced settings");
check(panel.includes("selectedProvider?.models.filter((item) => item.available)"), "the default model picker must use available catalog entries");
check(panel.includes("advancedModels"), "unverified catalog entries must have a separate advanced area");
check(!releaseSettings.includes("clear_studio_cache") && !releaseSettings.includes("onClearCache()"), "storage settings must not render a deletion action");
check(releaseSettings.includes("storageUsage?.categories") && releaseSettings.includes("onOpenDirectory(\"app-data\")"), "storage settings must expose read-only statistics and the data-folder action");
check(rustRelease.includes("storage_category_paths") && rustRelease.includes("symlink_metadata"), "storage measurement must use an explicit allowlist and skip symlinks");
check(rustRelease.includes("CONTAM_TOOLS_LOCK_JSON") && rustRelease.includes("HashMismatch"), "runtime discovery must verify the locked tool identity");
check(rustRelease.includes("resource_dir") && rustRelease.includes("Legacy user paths remain a diagnostic-only fallback"), "bundled tools must precede legacy diagnostic paths");

check(rustCatalog.includes("parse_openai_models") && rustCatalog.includes("openai_model_verification"), "OpenAI catalog must filter supported text-generation models");
check(rustCatalog.includes("parse_anthropic_models") && rustCatalog.includes("has_more"), "Anthropic catalog must handle pagination");
check(rustCatalog.includes("generateContent") && rustCatalog.includes("strip_prefix(\"models/\")"), "Gemini catalog must filter generateContent and normalize IDs");
check(rustProvider.includes("model-catalog.json") && rustProvider.includes("models_failure_with_fallback"), "catalog cache and stale fallback must be wired through Rust");
check(rustHttp.includes("Policy::none") && rustHttp.includes("MAX_RESPONSE_BYTES"), "HTTP redirect and response-size boundaries must remain enforced");

try {
  const trackedRuntime = execFileSync("git", ["-C", root, "ls-files", "src-tauri/runtime/contam-tools"], { encoding: "utf8" });
  check(!/\.(exe|dll|zip)$/im.test(trackedRuntime), "runtime binaries and ZIPs must not be tracked");
} catch (error) {
  failures.push(`git runtime tracking check failed: ${error.message}`);
}

for (const required of [
  "docs/adr/ADR-018-adopt-user-first-online-enhanced-runtime.md",
  "docs/user-guide/local-data-and-privacy.md",
  "docs/ai/provider-capability-matrix.md",
  "docs/licensing/nist-contam-runtime.md",
]) {
  check(fs.existsSync(path.join(root, required)), `required Phase 6C document is missing: ${required}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 6C user-first contract passed: ${assertions} assertions.`);
}
