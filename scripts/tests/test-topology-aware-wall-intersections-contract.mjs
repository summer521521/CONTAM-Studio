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
const commands = read("src/app/geometry/geometry-commands.ts");
const planner = read("src/app/geometry/geometry-wall-topology.ts");
const plannerTests = read("src/app/geometry/geometry-wall-topology.test.ts");
const batchTests = read("src/app/runtime/geometry-operation-batch.test.ts");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const controller = read("src/app/runtime/useGeometryWorkbench.ts");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const architecture = read("docs/architecture/geometry-workbench.md");
const taskLog = read("docs/development/task-log/records/topology-aware-wall-intersections-and-segments.md");
const verify = read("scripts/verify.ps1");

assert("split and delete commands remain schema-governed", schema.properties.operation.enum.includes("split_wall") && schema.properties.operation.enum.includes("delete_wall"));
assert("split rejects a point inside an opening", commands.includes("geometry_command_split_crosses_opening"));
assert("split preserves opening identity while moving the host segment", commands.includes("opening.wall_id = parameters.second_wall_id") && commands.includes("opening.offset -= splitDistance"));
assert("split inserts its vertex into affected Zone loops", commands.includes("insertSplitVertexInZoneRegions(level.zone_regions"));
assert("trim protects explicit Zone boundary walls", commands.includes("geometry_command_wall_bounds_zone"));

assert("wall planner uses a stable indexed context", planner.includes("horizontalSorted") && planner.includes("verticalSorted") && planner.includes("lowerBound"));
assert("wall planner enforces exact metric snapping", planner.includes("WALL_TOPOLOGY_SNAP_MM = 250") && planner.includes("Number.isSafeInteger"));
assert("wall planner rejects collinear overlap", planner.includes("geometry_wall_draw_collinear_overlap"));
assert("wall planner bounds intersections and operations", planner.includes("MAX_WALL_DRAW_INTERSECTIONS = 64") && planner.includes("MAX_WALL_DRAW_OPERATIONS = 256"));
assert("wall planner emits explicit splits before segments", planner.includes("const operations: WallTopologyOperation[] = [...splitOperations, ...addVertexOperations, ...addWallOperations]"));
assert("planner tests cover cross and T intersections", plannerTests.includes("materializes two crossings") && plannerTests.includes("creates a T junction"));
assert("planner tests cover extension and opening rejection", plannerTests.includes("extends an existing wall endpoint") && plannerTests.includes("split through an opening"));

assert("split tool is part of the single geometry tool union", controller.includes('| "split"') && workbench.includes('{ id: "split", icon: Scissors }'));
assert("canvas memoizes one topology context per level snapshot", canvas.includes("useMemo(() => createWallTopologyContext(level), [level])"));
assert("canvas previews topology segments and intersections locally", canvas.includes("wallDrawPreview.segments.map") && canvas.includes("wallDrawPreview.intersections.map"));
assert("canvas commits a topology-aware operation batch", canvas.includes("planTopologyAwareWallDrawWithContext") && canvas.includes("onCommitOperations(plan.operations"));
assert("canvas exposes explicit wall splitting", canvas.includes("planWallSplitWithContext") && canvas.includes('tool === "split"'));
assert("keyboard trim uses the structured delete command", canvas.includes('event.key === "Delete"') && canvas.includes('operation: "delete_wall"'));
assert("multi-operation intersections remain one undoable gesture", batchTests.includes("host-wall splits as one undoable gesture") && controller.includes("setUndoEntries((current) => [...current, {") && controller.includes("commandCount: operations.length"));

assert("Chinese topology copy exists", Boolean(zh.geometry.editor.tools?.split) && Boolean(zh.geometry.editor.issue?.splitCrossesOpening) && Boolean(zh.geometry.editor.trimSegment));
assert("English topology copy exists", Boolean(en.geometry.editor.tools?.split) && Boolean(en.geometry.editor.issue?.splitCrossesOpening) && Boolean(en.geometry.editor.trimSegment));
assert("initiative documents explicit intersection semantics", initiative.includes("T/Cross") && initiative.includes("split_wall"));
assert("architecture documents indexed planning and atomic history", architecture.includes("geometry-wall-topology.ts") && architecture.includes("一个撤销批次"));
assert("task log is singular and current", taskLog.includes("task_id: topology-aware-wall-intersections-and-segments") && /status: (in_progress|completed)/.test(taskLog));
assert("contract is included in unified verification", verify.includes("test-topology-aware-wall-intersections-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Topology-aware Wall Intersections contract passed: ${checks} assertions.`);
