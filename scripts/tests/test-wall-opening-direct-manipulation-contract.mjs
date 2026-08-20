import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? process.cwd());
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
let checks = 0;
function assert(name, condition) {
  checks += 1;
  if (!condition) throw new Error(`Wall/opening manipulation contract failed: ${name}`);
}

const schema = json("contracts/geometry/geometry-edit-command-v1.schema.json");
const model = read("src/app/geometry/geometry-model.ts");
const commands = read("src/app/geometry/geometry-commands.ts");
const planner = read("src/app/geometry/geometry-wall-opening-manipulation.ts");
const plannerTests = read("src/app/geometry/geometry-wall-opening-manipulation.test.ts");
const domainTests = read("src/app/geometry/geometry-domain.test.ts");
const batchTests = read("src/app/runtime/geometry-operation-batch.test.ts");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const aiDraft = read("src/app/geometry/geometry-ai-draft.ts");
const rustVision = read("src-tauri/src/codex_app_server/geometry_vision.rs");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const architecture = read("docs/architecture/geometry-workbench.md");
const taskLog = read("docs/development/task-log/records/wall-and-opening-direct-manipulation.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("schema exposes update_opening", schema.properties.operation.enum.includes("update_opening"));
assert("TypeScript operation union exposes update_opening", model.includes('| "update_opening"'));
assert("update command accepts only identity offset and width", commands.includes('["level_id", "opening_id", "offset", "width"]'));
assert("update command preserves the existing opening object identity fields", commands.includes("opening.offset = parameters.offset") && commands.includes("opening.width = parameters.width"));
assert("every opening update is followed by complete candidate validation", commands.includes("const validation = validateBuildingGeometry(candidate"));
assert("wall translation delegates to the existing orthogonal batch planner", planner.includes("planOrthogonalVertexMoveWithContext") && planner.includes("operation: GeometryMoveVerticesOperation"));
assert("wall translation is normal-axis only", planner.includes('frame.orientation === "horizontal"') && planner.includes("requestedAxisPosition"));
assert("opening manipulation keeps indexed stable objects", planner.includes("openingsById") && planner.includes("openingsByWall"));
assert("opening editing checks cached snapshot identity", planner.includes("geometry_opening_edit_context_stale"));
assert("opening editing rejects wall bounds", planner.includes("geometry_opening_edit_out_of_bounds"));
assert("opening editing rejects interval overlap", planner.includes("geometry_opening_edit_overlap"));
assert("opening pointer projection follows wall direction", planner.includes("projectedOpeningOffset") && planner.includes("directionX") && planner.includes("directionY"));
assert("planner tests cover horizontal and vertical wall translation", plannerTests.includes("translates a horizontal wall") && plannerTests.includes("translates a vertical wall"));
assert("planner tests cover opening identity and bindings", plannerTests.includes("preserving its identity and bindings"));
assert("planner tests cover overlap bounds and stale cache", plannerTests.includes("rejects overlap and wall bounds") && plannerTests.includes("rejects stale cached opening indices"));
assert("domain tests reject unknown fields and invalid candidates", domainTests.includes("wall_id: \"w2\"") && domainTests.includes("geometry_opening_out_of_bounds") && domainTests.includes("geometry_opening_overlap"));
assert("history tests preserve FlowPath opening identity", batchTests.includes("without replacing its FlowPath identity") && batchTests.includes('opening_id: "door-1"'));
assert("canvas keeps wall and opening previews local", canvas.includes("vertexMovePreview") && canvas.includes("openingUpdatePreview") && canvas.includes("displayLevel"));
assert("canvas commits wall drag as one operation", canvas.includes("commitWallTranslation") && canvas.includes("onCommitOperations([plan.operation], { kind: \"wall\""));
assert("canvas commits opening drag as one operation", canvas.includes("commitOpeningUpdate") && canvas.includes("onCommitOperations([plan.operation], { kind: \"opening\""));
assert("canvas exposes draggable wall and opening objects", (canvas.match(/draggable=\{tool === \"select\"\}/g) ?? []).length >= 2);
assert("canvas exposes gesture previews and release commits", canvas.includes("onDragMove") && canvas.includes("onDragEnd") && canvas.includes("previewOpeningUpdate"));
assert("keyboard alternatives cover walls and openings", canvas.includes('selection?.kind === "wall"') && canvas.includes('selection?.kind === "opening"') && canvas.includes("OPENING_MANIPULATION_SNAP_MM"));
assert("inspector supports exact wall axis", workbench.includes("geometry-wall-axis") && workbench.includes("planOrthogonalWallTranslation(activeLevel"));
assert("inspector supports exact opening offset and width", workbench.includes("geometry-opening-offset") && workbench.includes("geometry-opening-width") && workbench.includes("planOpeningUpdate(activeLevel"));
assert("Chinese interaction copy is complete", Boolean(zh.geometry.editor.wallEditor?.apply) && Boolean(zh.geometry.editor.openingEditor?.apply) && Boolean(zh.geometry.editor.issue?.openingOverlap));
assert("English interaction copy is complete", Boolean(en.geometry.editor.wallEditor?.apply) && Boolean(en.geometry.editor.openingEditor?.apply) && Boolean(en.geometry.editor.issue?.openingOverlap));
assert("AI draft parser does not accept update_opening", !aiDraft.includes('operation.operation === "update_opening"'));
assert("Codex vision schema does not grant update_opening", !rustVision.includes('"const": "update_opening"'));
assert("initiative records the user-visible wall and opening workflow", initiative.includes("墙段") && initiative.includes("门窗") && initiative.includes("update_opening"));
assert("architecture records atomic preview and binding preservation", architecture.includes("墙段法向平移") && architecture.includes("门窗沿墙") && architecture.includes("FlowPath"));
assert("task log is singular and current", taskLog.includes("task_id: wall-and-opening-direct-manipulation") && /status: (in_progress|completed)/.test(taskLog));
assert("capability matrix has one current entry", matrix.capabilities.filter((item) => item.id === "wall-and-opening-direct-manipulation").length === 1);
assert("contract is included in unified verification", verify.includes("test-wall-opening-direct-manipulation-contract.mjs"));

console.log(`Wall and Opening Direct Manipulation contract passed: ${checks} assertions.`);
