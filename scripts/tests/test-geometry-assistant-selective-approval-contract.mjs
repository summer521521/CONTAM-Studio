import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
let checks = 0;
const assert = (label, condition) => { checks += 1; if (!condition) failures.push(label); };

const runtime = read("src/app/runtime/useGeometryVisionDraft.ts");
const draft = read("src/app/geometry/geometry-ai-draft.ts");
const batch = read("src/app/runtime/useGeometryWorkbench.ts");
const panel = read("src/components/workbench/assistant/GeometryVisionDraftPanel.tsx");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const css = read("src/styles/features/assistant.css");
const en = read("src/i18n/locales/en.json");
const zh = read("src/i18n/locales/zh-CN.json");
const verify = read("scripts/verify.ps1");
const taskLog = read("docs/development/task-log/records/geometry-ai-selective-operation-approval.md");

assert("controller exposes bounded operation selection actions", runtime.includes("selectedOperationIndices") && runtime.includes("toggleOperation") && runtime.includes("setAllOperationsSelected"));
assert("selection is filtered immutably in original operation order", draft.includes("selectGeometryAiOperations") && draft.includes("selectedIndices.filter") && runtime.includes("selectGeometryAiOperations(draft, currentState.selectedOperationIndices)"));
assert("preview is recomputed locally for the selected subset", runtime.includes("previewGeometryOperationBatch(current, operations)") && runtime.includes("geometryAiCanvasPreview"));
assert("empty selection is rejected before approval or commit", runtime.includes("geometry_ai_operations_empty") && runtime.includes("if (!operations.length)"));
assert("approval hash covers the selected operations only", runtime.includes("geometryOperationBatchSha256(operations)") && batch.includes("approval.operationsSha256") && batch.includes("geometry_ai_approval_scope_mismatch"));
assert("stale project and baseline checks remain before selection approval", runtime.includes("current.geometry_hash.toLowerCase() !== draft.baseline_geometry_hash.toLowerCase()") && batch.includes("approval.baselineGeometryHash"));
assert("canvas preview carries operation indices and selected state", draft.includes("operationIndex") && draft.includes("selectedOperationIndices?:") && canvas.includes("onToggleAiOperation"));
assert("canvas overlay toggles candidate operations without writing geometry", canvas.includes("onToggleAiOperation(vertex.operationIndex)") && canvas.includes("onToggleAiOperation(wall.operationIndex)") && !canvas.includes("commitAiOperations"));
assert("assistant exposes checkbox review and select-all controls", panel.includes("type=\"checkbox\"") && panel.includes("controller.toggleOperation(index)") && panel.includes("controller.setAllOperationsSelected"));
assert("confirmation remains disabled for invalid or empty selection", panel.includes("const canConfirm = ready && selectedOperationCount > 0 && !controller.issue") && panel.includes("disabled={!canConfirm}"));
assert("the review surface stays compact and accessible", css.includes(".assistant-geometry-selection-toolbar") && css.includes(".assistant-geometry-operations input") && panel.includes("aria-labelledby=\"assistant-geometry-evidence-title\""));
assert("both locales and the Full gate carry the selection contract", ["selectedOperationCount", "selectionSummary", "selectAll", "deselectAll", "geometry_ai_selection_invalid", "geometry_ai_operations_empty"].every((key) => en.includes(`\"${key}\"`) && zh.includes(`\"${key}\"`)) && verify.includes("Geometry Assistant Selective Approval contract") && taskLog.includes("geometry-ai-selective-operation-approval"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Geometry Assistant Selective Approval contract passed: ${checks} assertions.`);
