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
const planner = read("src/app/geometry/geometry-direct-manipulation.ts");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const controller = read("src/app/runtime/useGeometryWorkbench.ts");
const navigator = read("src/components/workbench/geometry/GeometryObjectNavigator.tsx");
const css = read("src/styles/features/geometry.css");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const architecture = read("docs/architecture/geometry-workbench.md");
const taskLog = read("docs/development/task-log/records/geometry-direct-manipulation-and-precision-editing.md");
const verify = read("scripts/verify.ps1");

assert("command schema exposes the atomic move operation", schema.properties.operation.enum.includes("move_vertices"));
assert("TypeScript command union exposes the atomic move operation", model.includes('| "move_vertices"'));
assert("atomic move payload is bounded", commands.includes("value.length > 128") && commands.includes("geometry_command_vertex_batch_invalid"));
assert("atomic move rejects duplicate vertex ids", commands.includes("seen.has(item.vertex_id)"));
assert("atomic move verifies every target exists before mutation", commands.includes("const missing = moves.find") && commands.indexOf("const missing = moves.find") < commands.indexOf("for (const move of moves)"));
assert("final candidate still uses complete geometry validation", commands.includes("validateBuildingGeometry(candidate"));

assert("direct manipulation has a 128 vertex safety budget", planner.includes("MAX_DIRECT_MANIPULATION_VERTICES = 128"));
assert("selected Zone handle rendering is bounded", planner.includes("MAX_DIRECT_MANIPULATION_HANDLES = 256") && planner.includes(".slice(0, MAX_DIRECT_MANIPULATION_HANDLES)"));
assert("X propagation follows vertical walls", planner.includes("xConnected = connectedVertices(vertexId, context.verticalAdjacency"));
assert("Y propagation follows horizontal walls", planner.includes("yConnected = connectedVertices(vertexId, context.horizontalAdjacency"));
assert("canvas memoizes the orthogonal adjacency context", canvas.includes("useMemo(() => createOrthogonalManipulationContext(level), [level])"));
assert("drag planning snaps metric coordinates", planner.includes("snappedCoordinate(requestedTarget.x") && planner.includes("DIRECT_MANIPULATION_SNAP_MM = 250"));
assert("drag planning rejects coordinate collisions", planner.includes("geometry_direct_move_duplicate_vertex"));
assert("wall and Zone selections expose their real vertices", planner.includes('selection.kind === "wall"') && planner.includes('selection.kind === "zone"'));

assert("canvas keeps drag preview local", canvas.includes("vertexMovePreview") && canvas.includes("displayLevel"));
assert("canvas commits only a structured atomic operation", canvas.includes("onCommitOperations([plan.operation]") && !/vertex\.x\s*=(?!=)/.test(canvas));
assert("canvas guards stage panning from child drag events", canvas.includes("event.target === event.target.getStage()"));
assert("selected handles are real draggable Konva controls", canvas.includes("handleVertexIds") && canvas.includes("draggable") && canvas.includes("onDragMove"));
assert("canvas provides arrow-key vertex movement", canvas.includes('selection?.kind === "vertex"') && canvas.includes('"ArrowLeft"') && canvas.includes("commitVertexMove"));
assert("dragging focuses the keyboard canvas", canvas.includes("rootRef.current?.focus()"));

assert("precision editor uses one-millimetre planning", workbench.includes("planOrthogonalVertexMove(activeLevel, selectedVertex.id, { x, y }, 1)"));
assert("precision editor commits through the controller", workbench.includes("controller.commitOperations([plan.operation]"));
assert("precision inputs have labelled DOM controls", workbench.includes('htmlFor="geometry-vertex-x"') && workbench.includes('htmlFor="geometry-vertex-y"'));
assert("history still groups operation arrays as gestures", controller.includes("setUndoEntries((current) => [...current, {") && controller.includes("commandCount: operations.length"));
assert("complete DOM object navigation still includes vertices", navigator.includes("level.vertices.map"));
assert("precision editor has focus-visible styling", css.includes(".geometry-vertex-coordinate-editor input:focus-visible"));
assert("Chinese direct manipulation copy exists", Boolean(zh.geometry.editor.coordinateEditor?.apply) && Boolean(zh.geometry.editor.issue?.invalidMove));
assert("English direct manipulation copy exists", Boolean(en.geometry.editor.coordinateEditor?.apply) && Boolean(en.geometry.editor.issue?.invalidMove));
assert("initiative documents direct manipulation truth", initiative.includes("共享角点") && initiative.includes("move_vertices"));
assert("architecture documents preview and atomic validation", architecture.includes("正交连通传播") && architecture.includes("原子 `move_vertices`"));
assert("task log is singular and current", taskLog.includes("task_id: geometry-direct-manipulation-and-precision-editing") && /status: (in_progress|completed)/.test(taskLog));
assert("contract is included in unified verification", verify.includes("test-geometry-direct-manipulation-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Geometry Direct Manipulation contract passed: ${checks} assertions.`);
