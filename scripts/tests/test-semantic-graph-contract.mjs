import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const contract = JSON.parse(fs.readFileSync(path.join(root, "contracts", "semantic-graph.v1.json"), "utf8"));
const failures = [];
const fail = (code, message) => failures.push(`[${code}] ${message}`);
if (contract.version !== 1 || contract.name !== "SemanticGraph" || contract.identity !== "stable_uuid_v1") fail("identity", "SemanticGraph identity is invalid.");
if (contract.object_id_source !== "baseline_hash_category_external_evidence") fail("source", "Stable ID source must include baseline and external evidence.");
if (JSON.stringify(contract.ordering) !== JSON.stringify(["category", "object_id"]) || JSON.stringify(contract.edge_ordering) !== JSON.stringify(["source_id", "target_id", "kind"])) fail("ordering", "Graph ordering is not deterministic.");
for (const code of ["invalid_object_id", "duplicate_object_id", "dangling_reference", "self_reference", "duplicate_edge", "prohibited_cycle"]) if (!contract.reject_codes.includes(code)) fail("reject", `Missing graph rejection ${code}.`);
for (const field of ["array_index", "display_label", "contam_number", "source_path"]) if (!contract.ui_authority_forbidden.includes(field)) fail("authority", `UI must not use ${field} as object authority.`);
if (failures.length) { for (const failure of failures) console.error(failure); process.exit(1); }
console.log("SemanticGraph contract passed: stable IDs, deterministic ordering, and invalid-reference rejection are closed.");
