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

const schema = json("contracts/geometry/geometry-edit-command-v1.schema.json");
const model = read("src/app/geometry/geometry-model.ts");
const commands = read("src/app/geometry/geometry-commands.ts");
const planner = read("src/app/geometry/geometry-level-construction.ts");
const plannerTests = read("src/app/geometry/geometry-level-construction.test.ts");
const domainTests = read("src/app/geometry/geometry-domain.test.ts");
const batchTests = read("src/app/runtime/geometry-operation-batch.test.ts");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const canvasTests = read("src/components/workbench/geometry/geometry-canvas.test.ts");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const controller = read("src/app/runtime/useGeometryWorkbench.ts");
const issues = read("src/components/workbench/geometry/geometry-interaction-issues.ts");
const aiDraft = read("src/app/geometry/geometry-ai-draft.ts");
const rustVision = read("src-tauri/src/codex_app_server/geometry_vision.rs");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const architecture = read("docs/architecture/geometry-workbench.md");
const taskLog = read("docs/development/task-log/records/multi-level-navigation-and-construction-reuse.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("schema governs Level construction copy", schema.properties.operation.enum.includes("copy_level_construction"));
assert("TypeScript operation union governs Level construction copy", model.includes('| "copy_level_construction"'));
assert("copy parameters are closed", commands.includes('["level_id", "source_level_id", "vertex_id_map", "wall_id_map", "opening_id_map"]'));
assert("copy source must be another existing Level", commands.includes("parameters.source_level_id === level.id") && commands.includes("findLevel(geometry, parameters.source_level_id)"));
assert("copy target must be completely empty including vertical construction", planner.includes("levelIsEmptyConstructionTarget") && commands.includes("if (!levelIsEmptyConstructionTarget(level, geometry))"));
assert("copy has explicit bounded object counts", planner.includes("MAX_LEVEL_COPY_VERTICES = 10_000") && planner.includes("MAX_LEVEL_COPY_WALLS = 10_000") && planner.includes("MAX_LEVEL_COPY_OPENINGS = 5_000"));
assert("planner reserves IDs across every geometry object kind", planner.includes("function allGeometryIds") && planner.includes("zone_regions.map") && planner.includes("flow_path_anchors.map"));
assert("command requires complete source ID maps", commands.includes("geometry_command_level_copy_mapping_invalid") && commands.includes("sameStringSet(vertexMappings.map"));
assert("command rejects duplicate and existing target IDs", commands.includes("new Set(targetIds).size !== targetIds.length") && commands.includes("targetIds.some((id) => existingIds.has(id))"));
assert("copied walls are detached from SketchPad icon identity", commands.includes("source_icon_id: null"));
assert("copied openings clear Zone adjacency", commands.includes("adjacent_zone_ids: []"));
assert("copy operation never writes Zone or FlowPath collections", !commands.slice(commands.indexOf('case "copy_level_construction"'), commands.indexOf('case "place_opening"')).includes("level.zone_regions =") && !commands.slice(commands.indexOf('case "copy_level_construction"'), commands.indexOf('case "place_opening"')).includes("level.flow_path_anchors ="));

assert("planner tests cover deterministic complete maps", plannerTests.includes("complete deterministic ID maps for construction only"));
assert("planner tests cover source, target, and collision guards", plannerTests.includes("non-empty targets") && plannerTests.includes("ID collisions across every object kind"));
assert("planner and UI share empty-target semantics", plannerTests.includes("shares strict empty-target") && workbench.includes("levelIsEmptyConstructionTarget(activeLevel, geometry)"));
assert("multi-Level semantic membership fails closed", planner.includes("semanticObjectBelongsToGeometryLevel") && plannerTests.includes('semanticObjectBelongsToGeometryLevel("2", 2, 3)'));
assert("domain tests prove construction-only copying", domainTests.includes("copies only aligned construction") && domainTests.includes("target.zone_regions").valueOf());
assert("domain tests reject tampered maps and occupied targets", domainTests.includes("rejects incomplete mappings, ID conflicts, and non-empty copy targets"));
assert("one copy command is one undoable history entry", batchTests.includes("copies one Level construction shell as one undoable history entry") && batchTests.includes("undoGeometryOperationBatch"));

assert("workbench exposes a real active Level selector", workbench.includes("geometry-level-select") && workbench.includes("setActiveLevelId(event.target.value"));
assert("Level switching clears selection and transient diagnostics", workbench.includes("previousActiveLevelId") && workbench.includes("controller.clearDiagnostics()") && controller.includes("clearDiagnostics"));
assert("navigator filters semantic Zones by active Level", workbench.includes("semanticObjectBelongsToGeometryLevel") && workbench.includes("activeZoneEntries.slice(0, 5)"));
assert("workbench offers an explicit other-Level underlay", workbench.includes("referenceLevelId") && workbench.includes("geometry.editor.levels.referenceActive"));
assert("underlay is visibly identified as non-interactive", workbench.includes("geometry-level-underlay-badge") && Boolean(zh.geometry.editor.levels?.referenceActive) && Boolean(en.geometry.editor.levels?.referenceActive));
assert("copy control requires a selected source and empty active Level", workbench.includes("!copySourceLevelId || !activeLevel || !geometry || !levelIsEmptyConstructionTarget(activeLevel, geometry)"));
assert("copy submits one planner-produced operation", workbench.includes("planLevelConstructionCopy") && workbench.includes("controller.commitOperations([plan.operation], null)"));

assert("canvas accepts only an explicit reference Level ID", canvas.includes("referenceLevelId: string | null"));
assert("canvas excludes the active Level from its reference", canvas.includes("item.id === referenceLevelId && item.id !== level.id"));
assert("canvas underlay does not listen for interaction", canvas.includes("<Layer listening={false} opacity={0.28}>"));
assert("canvas underlay is limited to walls and openings", canvas.includes("referenceLevel.walls.map") && canvas.includes("referenceLevel.openings.map"));
assert("viewport fit includes the selected underlay", canvas.includes("mergeBounds(mergeBounds(activeBounds, referenceBounds), underlayBounds(underlay))") && canvasTests.includes("fits an empty active Level to its selected alignment underlay"));

assert("Level-copy failures have user-facing issue routing", issues.includes("levelConstructionIssueKey") && issues.includes("geometry_command_level_copy_target_not_empty"));
assert("Chinese Level controls are complete", Boolean(zh.geometry.editor.levels?.copyConstruction) && Boolean(zh.geometry.editor.issue?.levelCopyRejected));
assert("English Level controls are complete", Boolean(en.geometry.editor.levels?.copyConstruction) && Boolean(en.geometry.editor.issue?.levelCopyRejected));
assert("AI draft operation parser cannot copy Levels", !aiDraft.includes("copy_level_construction"));
assert("Codex vision schema cannot copy Levels", !rustVision.includes("copy_level_construction"));
assert("initiative documents Level navigation and construction-only reuse", initiative.includes("多楼层") && initiative.includes("copy_level_construction"));
assert("architecture documents non-interactive underlay and semantic exclusions", architecture.includes("对齐底图") && architecture.includes("不复制 Zone") && architecture.includes("不复制 FlowPath"));
assert("one descriptive task log records this delivery", taskLog.includes("task_id: multi-level-navigation-and-construction-reuse") && /status: (in_progress|completed)/.test(taskLog));
assert("capability matrix has one current entry", matrix.capabilities.filter((item) => item.id === "multi-level-navigation-and-construction-reuse").length === 1);
assert("contract is included in unified verification", verify.includes("test-multi-level-navigation-construction-reuse-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Multi-level Navigation and Construction Reuse contract passed: ${checks} assertions.`);
