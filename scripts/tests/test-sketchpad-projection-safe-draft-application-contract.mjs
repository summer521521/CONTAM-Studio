import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const failures = [];
let checks = 0;

function assert(label, condition) {
  checks += 1;
  if (!condition) failures.push(label);
}

const previewSchema = json("contracts/geometry/sketchpad-projection-preview-v1.schema.json");
const preview = read("src/app/geometry/sketchpad-projection-preview.ts");
const preparation = read("src/app/geometry/sketchpad-projection-patch.ts");
const preparationTests = read("src/app/geometry/sketchpad-projection-patch.test.ts");
const journey = read("src/app/runtime/useProjectPatchJourney.ts");
const journeyTests = read("src/app/runtime/useProjectPatchJourney.test.tsx");
const semanticState = read("src/app/semantic-state.ts");
const semanticPanel = read("src/components/workbench/SemanticPropertyPanel.tsx");
const visual = read("src/components/workbench/visual/VisualModelWorkspace.tsx");
const geometryWorkbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const projectPage = read("src/components/workbench/pages/ProjectPage.tsx");
const destination = read("src/components/workbench/DestinationContent.tsx");
const runtime = read("src/app/runtime/WorkbenchRuntime.tsx");
const pythonPatch = read("python/src/contam_studio_core/semantic_patch.py");
const rust = read("src-tauri/src/zone_bridge.rs");
const ai = read("src-tauri/src/codex_app_server.rs");
const architecture = read("docs/architecture/geometry-workbench.md");
const threatModel = read("docs/security/threat-model-v1.md");
const adr = read("docs/adr/ADR-024-route-sketchpad-candidates-through-semantic-patch-review.md");
const taskLog = read("docs/development/task-log/records/sketchpad-projection-safe-draft-application.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("preview remains permanently lossy and non-applicable", previewSchema.properties.lossy.const === true && previewSchema.properties.can_apply.const === false && preview.includes("can_apply: false"));
assert("preview binds project session source identity and revision", ["project_session_id", "source_sha256", "identity_sha256", "revision_id"].every((field) => previewSchema.required.includes(field)));
assert("preparation is pure and does not call desktop write APIs", !preparation.includes("desktop-api") && !preparation.includes("planSemanticPatch") && !preparation.includes("applySemanticPatchToDraft"));
assert("preparation requires the exact non-applicable preview contract", preparation.includes('preview.schema_version !== "sketchpad_projection_preview.v1"') && preparation.includes("preview.lossy !== true") && preparation.includes("preview.can_apply !== false"));
assert("preparation validates safe bounded context", preparation.includes("safeAscii(preview.project_session_id, 128)") && preparation.includes("SHA256.test(preview.source_sha256)"));
assert("preparation validates non-negative integer coordinates", preparation.includes("Number.isSafeInteger(value)") && preparation.includes("value >= 0") && preparation.includes("value <= 1_000_000_000"));
assert("preparation rejects duplicate identities and final cells", preparation.includes("semanticZoneIds.has") && preparation.includes("iconIds.has") && preparation.includes("targetCells.has"));
assert("preparation rejects tampered change flags", preparation.includes("move.changed !== (columnChanged || rowChanged)"));
assert("preparation shares the Rust 128-operation ceiling", preparation.includes("MAX_SKETCHPAD_PROJECTION_PATCH_OPERATIONS = 128") && preparation.includes("operations.length > MAX_SKETCHPAD_PROJECTION_PATCH_OPERATIONS"));
assert("preparation emits only the two verified coordinate operations", preparation.includes('operation: "set_spatial_icon_column"') && preparation.includes('operation: "set_spatial_icon_row"') && preparation.includes('unit: "grid_cell"'));
assert("preparation tests cover deterministic fields collision tamper and limits", ["deterministic order", "change_flag_invalid", "candidate_collision", "operation_limit"].every((value) => preparationTests.includes(value)));

assert("review journey validates preview against active project context", journey.includes("preview.project_session_id === projectState.projectSessionId") && journey.includes("preview.revision_id === projectState.draft?.revision_id") && journey.includes("preview.source_sha256.toLowerCase()"));
assert("review journey refuses busy or existing edits", journey.includes("simulationBusy || attachmentBusy || semanticState.operations.length > 0") && journey.includes("sketchpad_projection_review_busy"));
assert("review journey selects a semantic Zone then uses the existing planner", journey.includes('type: "object_selected"') && journey.includes("planSemanticOperationSet(prepared.operations, \"sketchpad_projection\")") && journey.includes("planSemanticPatch("));
assert("review never auto-applies", journeyTests.includes("never calls apply automatically") && journeyTests.includes("expect(desktop.apply).not.toHaveBeenCalled()"));
assert("plan and apply responses are exact-context validated", semanticState.includes("semanticPlanResponseIssue") && semanticState.includes("semanticApplyResponseIssue") && journey.includes("activeSemanticContextRef.current !== contextKey"));
assert("project context changes clear stale semantic state", semanticState.includes('case "snapshot_loading": return { ...INITIAL_SEMANTIC_STATE') && semanticState.includes('case "context_changed": return INITIAL_SEMANTIC_STATE'));
assert("journey tests reject late plan and apply pollution", journeyTests.includes("drops a late plan response") && journeyTests.includes("drops a late apply response"));
assert("review locks editable semantic fields until apply or discard", semanticPanel.includes("reviewLocked") && semanticPanel.includes("disabled={reviewLocked}"));

assert("floating SketchPad UI offers review rather than direct apply", visual.includes("onReviewSketchpadProjection") && visual.includes("projectionPreview.review") && !visual.includes("applySemanticPatchToDraft"));
assert("review callback crosses only the existing React composition chain", [geometryWorkbench, projectPage, destination, runtime].every((source) => source.includes("onReviewSketchpadProjection")) && runtime.includes("reviewSketchpadProjection"));
assert("Python still enforces bounds collisions exact records and new-copy apply", pythonPatch.includes("spatial_coordinate_out_of_bounds") && pythonPatch.includes("spatial_icon_collision") && pythonPatch.includes("len(tokens) != 4") && pythonPatch.includes("apply_transaction_to_copy"));
assert("Rust still limits semantic operations and binds active context", rust.includes("operations.len() > 128") && rust.includes("set_spatial_icon_column") && rust.includes("set_spatial_icon_row"));
assert("ordinary AI still cannot emit coordinate operations", !ai.includes('"set_spatial_icon_column"') && !ai.includes('"set_spatial_icon_row"'));
assert("architecture threat model and ADR preserve two-step confirmation", architecture.includes("第二次确认") && threatModel.includes("精确 Diff 与第二次用户确认缺一不可") && adr.includes("预览继续固定 `lossy=true`、`can_apply=false`"));
assert("descriptive task and capability are tracked", taskLog.includes("task_id: sketchpad-projection-safe-draft-application") && matrix.capabilities.some((item) => item.id === "sketchpad-projection-safe-draft-application"));
assert("Full verification includes the safe application contract", verify.includes("test-sketchpad-projection-safe-draft-application-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`SketchPad Projection Safe Draft Application contract passed: ${checks} assertions.`);
