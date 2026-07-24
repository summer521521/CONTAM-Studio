import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const failures = [];
const fail = (code, message) => failures.push(`[${code}] ${message}`);
let contract;
try { contract = JSON.parse(fs.readFileSync(path.join(root, "contracts", "patch-transaction.v1.json"), "utf8")); }
catch (error) { fail("json", error.message); }
if (contract) {
  if (contract.version !== 1 || contract.name !== "PatchTransaction" || contract.authority !== "rust") fail("identity", "PatchTransaction must be a v1 Rust-authority contract.");
  const required = new Set(contract.required_fields || []);
  for (const field of ["transaction_id", "baseline_sha256", "current_revision_id", "profile", "object_id", "operation", "before", "proposed", "preconditions", "evidence", "expires_at_utc", "idempotency_key", "provenance"]) if (!required.has(field)) fail("required", `Missing required field ${field}.`);
  const operation = contract.allowed_operations?.[0];
  if ((contract.allowed_operations || []).length !== 1 || !operation || operation.kind !== "replace_scalar" || operation.object_category !== "zone" || operation.field !== "volume_m3" || operation.cardinality !== "one" || operation.requires_reparse !== true) fail("operation", "Only the verified one-Zone volume operation may be enabled.");
  const forbidden = new Set(contract.forbidden_authority_fields || []);
  for (const field of ["source_path", "output_path", "byte_start", "byte_end", "model_path", "ui_path", "contam_number"]) if (!forbidden.has(field)) fail("forbidden", `Authority must forbid ${field}.`);
  if (contract.approval?.diff_required !== true || contract.approval?.user_confirmation_required !== true || contract.approval?.multi_operation !== "reject_until_action_bundle_v1" || contract.approval?.source_overwrite !== false) fail("approval", "Patch approval and source protection defaults are not fail-closed.");
  const provenance = new Set(contract.provenance_required || []);
  for (const field of ["actor", "entrypoint", "request_id", "created_at_utc"]) if (!provenance.has(field)) fail("provenance", `Missing provenance field ${field}.`);
}
if (failures.length) { for (const failure of failures) console.error(failure); process.exit(1); }
console.log("PatchTransaction contract passed: one verified operation, approval, provenance, and source protection are closed.");
