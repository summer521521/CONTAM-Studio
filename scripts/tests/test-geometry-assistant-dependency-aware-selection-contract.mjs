import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
let checks = 0;
const assert = (label, condition) => { checks += 1; if (!condition) failures.push(label); };

const draft = read("src/app/geometry/geometry-ai-draft.ts");
const runtime = read("src/app/runtime/useGeometryVisionDraft.ts");
const panel = read("src/components/workbench/assistant/GeometryVisionDraftPanel.tsx");
const css = read("src/styles/features/assistant.css");
const en = read("src/i18n/locales/en.json");
const zh = read("src/i18n/locales/zh-CN.json");
const tests = read("src/app/geometry/geometry-ai-draft.test.ts");
const hookTests = read("src/app/runtime/useGeometryVisionDraft.test.tsx");
const verify = read("scripts/verify.ps1");
const taskLog = read("docs/development/task-log/records/geometry-ai-dependency-aware-selection.md");

assert("selection change exposes explicit dependency and removal results", draft.includes("GeometryAiSelectionChange") && draft.includes("autoIncludedIndices") && draft.includes("removedDependentIndices"));
assert("dependency analysis is based on the trusted baseline geometry", draft.includes("existingVertices") && draft.includes("existingWalls") && draft.includes("operationIndexMaps"));
assert("walls depend on newly proposed endpoint vertices", draft.includes('entry.operation.operation === "add_wall"') && draft.includes("start_vertex_id") && draft.includes("end_vertex_id"));
assert("openings depend on their proposed host wall", draft.includes('entry.operation.operation === "place_opening"') && draft.includes('"wall_id"'));
assert("zone regions depend on proposed boundary vertices and walls", draft.includes('entry.operation.operation === "create_zone_region"') && draft.includes("outer_vertex_ids") && draft.includes("wallEdgeProducers"));
assert("dependencies resolve transitively in deterministic order", draft.includes("geometryAiOperationDependencies") && draft.includes("resolved") && draft.includes("sort((left, right) => left - right)"));
assert("selecting a dependent operation closes over prerequisites", draft.includes("toggleGeometryAiOperationSelection") && draft.includes("autoIncludedIndices = dependencies.filter"));
assert("deselecting a prerequisite removes selected dependents", draft.includes("removedDependentIndices") && draft.includes("geometryAiOperationDependencies(draft, geometry, candidate).includes(index)"));
assert("hook uses the same baseline-bound dependency resolver", runtime.includes("toggleGeometryAiOperationSelection") && runtime.includes("autoIncludedOperationIndices"));
assert("side panel explains automatic prerequisites and marks them", panel.includes("selectionDependencies") && panel.includes("autoIncludedOperationSet") && panel.includes("dependency"));
assert("compact bilingual styling is present", css.includes(".assistant-geometry-selection-note") && css.includes(".assistant-geometry-operations em") && en.includes('"selectionDependencies"') && zh.includes('"selectionDependencies"'));
assert("pure, hook, and Full contract coverage is registered", tests.includes("geometryAiOperationDependencies") && hookTests.includes("auto-includes prerequisites") && verify.includes("Geometry Assistant Dependency-aware Selection contract") && taskLog.includes("geometry-ai-dependency-aware-selection"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Geometry Assistant Dependency-aware Selection contract passed: ${checks} assertions.`);
