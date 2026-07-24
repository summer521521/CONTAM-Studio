import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const failures = [];

function fail(code, message) { failures.push(`[${code}] ${message}`); }
function readJson(relative) {
  const file = path.join(root, relative);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { fail("missing_or_invalid_json", `${relative}: ${error.message}`); return null; }
}
function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { fail("missing_file", relative); return ""; }
  return fs.readFileSync(file, "utf8");
}
function sha256(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { fail("missing_fixture", relative); return ""; }
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function expect(condition, code, message) { if (!condition) fail(code, message); }

const processContract = readJson("contracts/process-lifecycle.v1.json");
const storeContract = readJson("contracts/owned-artifact-store.v1.json");
const glossary = readJson("contracts/bilingual-terminology.v1.json");
const design = readJson("contracts/design-system.v1.json");
const journeys = readJson("contracts/user-journeys.v1.json");
const informationArchitecture = readJson("contracts/information-architecture.v1.json");
const interfaces = readJson("contracts/architecture-interfaces.v1.json");

if (processContract) {
  const states = ["queued", "starting", "running", "cancel_requested", "succeeded", "failed", "timed_out", "cancelled", "unknown_cleanup"];
  expect(JSON.stringify(processContract.status_vocabulary) === JSON.stringify(states), "process_states", "Public process status vocabulary drifted.");
  expect(processContract.job_object?.required === true, "process_job_required", "Job Object is not required.");
  expect(processContract.job_object?.create_suspended === true && processContract.job_object?.assign_before_resume === true, "process_job_order", "Child assignment order is not fail-closed.");
  expect(processContract.job_object?.kill_on_close === true, "process_job_kill_on_close", "KILL_ON_JOB_CLOSE policy missing.");
  expect(processContract.cleanup_reserve?.shared_deadline === true, "process_deadline", "Shared absolute deadline is missing.");
  for (const [name, value] of Object.entries(processContract.operations || {})) expect(Number.isInteger(value.total_budget_seconds) && value.total_budget_seconds > 0, "process_budget", `${name} has invalid total budget.`);
  expect(processContract.stream_limits?.stdout_bytes === 4194304 && processContract.stream_limits?.stderr_bytes === 4194304, "process_stream_limit", "Stream limits drifted.");
  for (const evidence of ["operation_id", "tool_identity", "deadline", "pid_proof", "job_proof", "exit_code", "stream_frozen", "artifact_refs", "generation"]) expect(processContract.required_evidence.includes(evidence), "process_evidence", `Missing process evidence ${evidence}.`);
}

if (storeContract) {
  expect(storeContract.root === "app_local_data_dir/owned-artifacts", "store_root", "Owned store root drifted.");
  expect(storeContract.soft_quota_bytes === 10 * 1024 ** 3 && storeContract.hard_quota_bytes === 20 * 1024 ** 3, "store_quota", "Quota defaults drifted.");
  expect(storeContract.temporary_reclaim_age_hours === 24, "store_reclaim_age", "Temporary reclaim age drifted.");
  const categories = ["external_source", "export", "revision", "run", "result", "report_evidence", "attachment_derivative", "ai_archive", "cache", "temporary", "quarantine"];
  for (const category of categories) expect(Object.hasOwn(storeContract.categories || {}, category), "store_category", `Missing artifact category ${category}.`);
  for (const key of ["artifact_id", "schema_version", "category", "relative_path", "size_bytes", "created_at_utc", "last_used_at_utc", "sha256", "dependencies", "status"]) expect(storeContract.required_metadata.includes(key), "store_metadata", `Missing artifact metadata ${key}.`);
  for (const key of ["active", "pinned", "last_recoverable_revision", "report_referenced", "external_source", "export", "symlink", "junction", "path_escape"]) expect(storeContract.protected_from_cleanup.includes(key), "store_protection", `Missing cleanup protection ${key}.`);
  expect(storeContract.migration?.rollback === true && storeContract.uninstall?.retain_by_default === true, "store_recovery", "Migration rollback or uninstall retention policy missing.");
}

if (glossary) {
  expect(glossary.default_language === "zh-CN" && glossary.parity_required === true, "glossary_defaults", "Glossary defaults drifted.");
  for (const [key, value] of Object.entries(glossary.labels || {})) expect(typeof value["zh-CN"] === "string" && typeof value.en === "string" && value["zh-CN"].length > 0 && value.en.length > 0, "glossary_parity", `Label ${key} lacks bilingual values.`);
  for (const [key, value] of Object.entries(glossary.units || {})) expect(value.canonical && Array.isArray(value.display_allowed) && value.display_allowed.includes(value.canonical), "unit_contract", `Unit ${key} lacks canonical display.`);
}

if (design) {
  for (const token of ["protected-source", "draft-revision", "deterministic-evidence", "ai-interpretation", "run-active", "warning", "failure", "unsupported"]) expect(design.tokens.includes(token), "design_token", `Missing design token ${token}.`);
  for (const state of ["loading", "empty", "read_only", "unsupported", "failure", "recovery"]) expect(design.required_states.includes(state), "design_state", `Missing design state ${state}.`);
  expect(design.scaling.minimum_percent === 100 && design.scaling.maximum_percent === 200 && design.color_alone_is_meaning === false, "design_accessibility", "Scaling or semantic color policy drifted.");
}

if (journeys) {
  expect(journeys.journeys?.length >= 10, "journey_set", "Journey set is incomplete.");
  for (const journey of journeys.journeys || []) {
    for (const field of journeys.required_fields || []) expect(Object.hasOwn(journey, field), "journey_field", `${journey.id || "unknown"} lacks ${field}.`);
    expect(typeof journey.id === "string" && typeof journey.screen === "string" && typeof journey.tool === "string", "journey_identity", "Journey identity is invalid.");
  }
}
if (informationArchitecture) {
  for (const surface of ["Project", "Draft", "Runs", "Results", "Compare", "Report", "Attachments", "Assistant", "Settings", "Activity", "Evidence"]) expect(informationArchitecture.surfaces.includes(surface), "ia_surface", `Missing information architecture surface ${surface}.`);
  for (const state of ["no_project", "ready_read_only", "ready_editable", "patch_review", "running", "unknown_cleanup", "recovery_required"]) expect(informationArchitecture.states.includes(state), "ia_state", `Missing state ${state}.`);
  expect(informationArchitecture.preference_keys.length === 5 && informationArchitecture.forbidden_preference_values.includes("absolute_path"), "ia_preferences", "Preference policy drifted.");
}
if (interfaces) {
  for (const name of ["DocumentIndex", "SemanticGraph", "PatchTransaction", "ProcessController", "OwnedArtifactStore", "ResultStore", "AttachmentBroker", "AiGateway", "Packaging", "Observability"]) expect((interfaces.interfaces || []).some((item) => item.name === name && item.owner && item.boundary), "interface_set", `Missing architecture interface ${name}.`);
}

const profiles = read("docs/product/supported-profiles-v1.md");
expect(sha256("fixtures/contam/official-contamxpy/test_GetPrjInfo.prj") === "ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e", "profile_hash", "Candidate A fixture hash changed.");
expect(sha256("fixtures/contam/official-nist-tutorials/demo1c.prj") === "1e2623d8904c0d37f0eb207099782ad2c1895db a4032e0511b9c8a188748f406".replace(/\s/g, ""), "profile_hash", "Candidate B fixture hash changed.");
expect(profiles.includes("Candidate A") && profiles.includes("Candidate B") && profiles.includes("pending_final_acceptance"), "profile_doc", "Supported profile contract is incomplete.");
for (const file of ["docs/adr/ADR-012-controlled-process-lifecycle.md", "docs/adr/ADR-013-owned-artifact-store-lifecycle.md", "docs/adr/ADR-014-v1-architecture-interface-set.md", "docs/product/v1-product-contract.md", "docs/product/user-journeys-v1.md", "docs/ui/information-architecture-v1.md", "docs/ui/design-system-v1.md", "docs/product/bilingual-terminology-v1.md"]) expect(fs.existsSync(path.join(root, file)), "baseline_document", `Missing ${file}.`);

if (failures.length) { for (const failure of failures) console.error(failure); process.exit(1); }
console.log("v1 baseline contract passed: process, storage, product, profile, design, and bilingual boundaries are machine-checked.");
