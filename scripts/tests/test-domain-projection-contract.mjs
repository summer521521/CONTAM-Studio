import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const contract = JSON.parse(fs.readFileSync(path.join(root, "contracts", "domain-projection.v1.json"), "utf8"));
const failures = [];
const fail = (message) => failures.push(message);
if (contract.schema_version !== "domain_projection.v1") fail("schema version drift");
if (contract.profile !== "strict_contam_3_4_simple_zone_v1") fail("profile drift");
if (contract.identity !== "baseline_sha256_category_external_identity_uuid5") fail("identity must bind the baseline and external evidence");
for (const field of ["array_index", "display_label", "contam_number", "source_path", "byte_offset"]) {
  if (!contract.authority_forbidden?.includes(field)) fail(`missing authority boundary: ${field}`);
}
for (const field of ["level_id", "level_number", "label", "zone_ids", "capability", "evidence"]) {
  if (!contract.objects?.level?.fields?.includes(field)) fail(`missing Level field: ${field}`);
}
for (const field of ["zone_id", "contam_number", "label", "level_id", "fields", "capabilities", "evidence"]) {
  if (!contract.objects?.zone?.fields?.includes(field)) fail(`missing Zone field: ${field}`);
}
if (JSON.stringify(contract.objects?.zone?.units) !== JSON.stringify({ relative_height: "m", volume_m3: "m3" })) fail("Zone units drift");
if (contract.unsupported_policy !== "reject_projection_without_partial_semantics") fail("unsupported content must fail closed");
if (failures.length) { for (const failure of failures) console.error(`[FAIL] ${failure}`); process.exit(1); }
console.log("Domain projection contract passed: Level/Zone fields, units, evidence, and authority boundaries are closed.");
