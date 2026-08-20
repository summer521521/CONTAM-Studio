import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
let checks = 0;
const assert = (label, condition) => { checks += 1; if (!condition) failures.push(label); };

const panel = read("src/components/workbench/assistant/GeometryVisionDraftPanel.tsx");
const css = read("src/styles/features/assistant.css");
const en = read("src/i18n/locales/en.json");
const zh = read("src/i18n/locales/zh-CN.json");
const draft = read("src/app/geometry/geometry-ai-draft.ts");
const verify = read("scripts/verify.ps1");
const taskLog = read("docs/development/task-log/records/geometry-assistant-draft-evidence-review.md");

assert("evidence receipt exposes project, revision, baseline, attachment, model, and request", [
  "project_session_id", "revision_id", "baseline_geometry_hash", "attachment_sha256",
  "controller.modelId", "controller.requestId",
].every((field) => panel.includes(field)));
assert("opaque evidence values are shortened instead of exposing full hashes", panel.includes("shortEvidence") && panel.includes("slice(0, 12)"));
assert("observations, assumptions, and warnings have bounded detail views", panel.includes("observations.slice(0, 6)") && panel.includes("assumptions.slice(0, 6)") && panel.includes("warnings.slice(0, 6)"));
assert("operation details are bounded and do not dump arbitrary JSON", panel.includes("MAX_OPERATION_DETAILS = 256") && panel.includes("operations.slice(0, MAX_OPERATION_DETAILS)") && !panel.includes("JSON.stringify") && !panel.includes("imageBytes") && !panel.includes("imagePath"));
assert("all safe vision operation kinds have human-readable summaries", ["add_vertex", "add_wall", "create_zone_region", "place_opening"].every((operation) => panel.includes(`operation === \"${operation}\"`) || panel.includes(`\"${operation}\"`)));
assert("operation summaries use bounded typed fields", panel.includes("parameters.vertex") && panel.includes("parameters.wall") && panel.includes("parameters.zone_region") && panel.includes("parameters.opening"));
assert("the display remains an integrated collapsible review section", panel.includes("<details className=\"assistant-geometry-details\">") && css.includes(".assistant-geometry-details"));
assert("confirmation still uses the existing controller approval path", panel.includes("controller.confirm()") && !panel.includes("commitAiOperations"));
assert("English locale contains evidence and operation labels", ["details", "evidence", "projectSession", "operationDetails", "operationType", "noItems"].every((key) => en.includes(`\"${key}\"`)));
assert("Chinese locale contains evidence and operation labels", ["details", "evidence", "projectSession", "operationDetails", "operationType", "noItems"].every((key) => zh.includes(`\"${key}\"`)));
assert("the rendered fields are backed by the strict draft contract", draft.includes("observations: string[]") && draft.includes("assumptions: string[]") && draft.includes("operations: GeometryOperationInput[]"));
assert("the task is registered in the Full verification gate", verify.includes("Geometry Assistant Draft Evidence contract") && taskLog.includes("geometry-assistant-draft-evidence-review"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Geometry Assistant Draft Evidence contract passed: ${checks} assertions.`);
