import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../.."));
const contract = JSON.parse(fs.readFileSync(path.join(root, "contracts", "document-envelope.v1.json"), "utf8"));
const required = new Set(contract.required_fields || []);
const failures = [];
const fail = (code, message) => failures.push(`[${code}] ${message}`);
if (contract.version !== 1 || contract.name !== "DocumentEnvelope" || contract.schema_version !== "document_envelope.v1") fail("identity", "DocumentEnvelope identity is invalid.");
if (contract.max_bytes !== 16777216 || contract.max_line_bytes !== 1048576) fail("limits", "Envelope resource limits drifted.");
for (const field of ["source_sha256", "source_size_bytes", "encoding", "newline_style", "final_newline", "line_spans", "opaque_sections", "profile", "editable"]) if (!required.has(field)) fail("required", `Missing ${field}.`);
if (JSON.stringify(contract.encodings) !== JSON.stringify(["ascii"]) || JSON.stringify(contract.newline_styles) !== JSON.stringify(["lf", "crlf", "mixed", "none"])) fail("evidence", "Encoding/newline evidence is not closed.");
if (contract.unknown_policy !== "preserve_bytes_and_read_only" || contract.write_policy !== "reject_until_profile_writer_is_proven") fail("policy", "Unknown content must remain preserved and read-only.");
if (failures.length) { for (const failure of failures) console.error(failure); process.exit(1); }
console.log("DocumentEnvelope contract passed: bounded byte evidence and unknown-content read-only policy are closed.");
