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

const runtime = read("src/app/runtime/WorkbenchRuntime.tsx");
const controller = read("src/app/runtime/useGeometryWorkbench.ts");
const destination = read("src/components/workbench/DestinationContent.tsx");
const projectPage = read("src/components/workbench/pages/ProjectPage.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const wallAirflow = read("src/app/geometry/geometry-wall-airflow.ts");
const objectNavigator = read("src/components/workbench/geometry/GeometryObjectNavigator.tsx");
const studioSettings = read("src/app/runtime/useStudioSettings.ts");
const factories = read("src/app/geometry/geometry-factories.ts");
const layout = read("src/app/geometry/geometry-layout.ts");
const geometryCss = read("src/styles/features/geometry.css");
const tokens = read("src/styles/tokens.css");
const app = read("src/app/App.tsx");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const taskLog = read("docs/development/task-log/records/geometry-editor-integration.md");
const designQa = read("design-qa.md");
const packageJson = json("package.json");

assert("runtime owns the geometry controller", runtime.includes("useGeometryWorkbench") && runtime.includes("geometryWorkbench"));
assert("destination passes one controller into the project page", destination.includes("geometryWorkbench") && projectPage.includes("GeometryWorkbench"));
assert("geometry workbench stays behind a lazy boundary", projectPage.includes("lazy(async () =>") && projectPage.includes("GeometryWorkbench"));
assert("quality harness and its image fixture are development only", app.includes("const GeometryQualityHarness = import.meta.env.DEV") && app.includes("geometry-quality") && !workbench.includes("ai-plan-source-demo"));
assert("first launch stays on the project journey", !studioSettings.includes('setActiveDestination("settings")'));
assert("studio drafts are metric and not PRJ round trips", factories.includes('source_kind: "studio_metric_draft"') && factories.includes('prj_round_trip: "unsupported"'));
assert("teaching geometry is explicitly identified", factories.includes("geometry_teaching_example_not_prj"));
assert("drawing gestures publish atomically", controller.includes("commitGeometryOperationBatch") && controller.includes("return { committed: false, state: history"));
assert("multi-command gestures undo and redo as units", controller.includes("undoGeometryOperationBatch") && controller.includes("redoGeometryOperationBatch") && controller.includes("GeometryAuthoringHistoryEntry") && controller.includes("entry.commandCount"));
for (const tool of ["select", "pan", "wall", "zone", "door", "window", "flow_path", "dimension"]) {
  assert(`modeling tool ${tool} is exposed`, workbench.includes(`id: "${tool}"`));
}
assert("wall drawing is orthogonal and snapped", canvas.includes("snapMetricPoint") && canvas.includes("orthogonalEndpoint"));
assert("zone drawing requires an explicit semantic Zone", canvas.includes("selectedZoneId") && canvas.includes("geometry_zone_target_missing"));
assert("openings attach to real walls", canvas.includes('operation: "place_opening"') && canvas.includes("wall_id: wall.id"));
assert("flow paths attach through real openings via the bounded parent planner", canvas.includes("onLinkWallFlowPath(opening.id)") && workbench.includes("planWallFlowPathLink") && wallAirflow.includes('operation: "link_flow_path"') && wallAirflow.includes("opening_id: openingId"));
assert("every geometry object has a searchable paged DOM path", objectNavigator.includes("geometryNavigatorItems") && objectNavigator.includes("PAGE_SIZE = 50") && ["zone_regions", "walls", "openings", "flow_path_anchors", "vertices"].every((collection) => objectNavigator.includes(collection)));
assert("draft status distinguishes app-local persistence from PRJ write", workbench.includes("controller.persistence.status") && workbench.includes("geometry.persistence.status") && zh.geometry.persistence.detail.saved.includes("原始 PRJ 未修改") && en.geometry.persistence.detail.saved.includes("original PRJ is unchanged"));
assert("building notation includes area scale north and door swing", canvas.includes("polygonAreaM2") && canvas.includes("metricScaleBar") && canvas.includes("doorSwingArc") && canvas.includes("geometry-canvas-orientation"));
assert("layout reflows and reserves the footer", layout.includes("reflowFloatingWorkbenchLayout") && layout.includes("FLOATING_FOOTER_RESERVE"));
assert("priority panels repair collisions", layout.includes("tools.x + tools.width + 12 > theme.x"));
assert("all three complete themes remain available", ["engineering-blueprint", "architectural-paper", "night-laboratory"].every((theme) => tokens.includes(`[data-geometry-theme="${theme}"]`)));
assert("floating panels are visibly layered", geometryCss.includes(".geometry-floating-panel") && geometryCss.includes("box-shadow: var(--geometry-panel-shadow)"));
assert("Chinese geometry editor copy exists", Boolean(zh.geometry?.editor?.tools?.wall) && Boolean(zh.geometry?.editor?.themes?.["architectural-paper"]));
assert("English geometry editor copy exists", Boolean(en.geometry?.editor?.tools?.wall) && Boolean(en.geometry?.editor?.themes?.["architectural-paper"]));
assert("task log is singular and current", taskLog.includes("task_id: geometry-editor-integration") && /status: (in_progress|completed)/.test(taskLog));
assert("design QA has a final result and same-input comparison", designQa.includes("Result: passed") && designQa.includes("Same-input comparison"));
assert("no second canvas framework was introduced", !["react-flow", "reactflow", "pixi.js", "three", "fabric"].some((name) => Object.keys(packageJson.dependencies).includes(name)));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Geometry Editor Integration contract passed: ${checks} assertions.`);
