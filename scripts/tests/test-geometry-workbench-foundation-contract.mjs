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

const geometrySchema = json("contracts/geometry/building-geometry-v1.schema.json");
const commandSchema = json("contracts/geometry/geometry-edit-command-v1.schema.json");
const validationSchema = json("contracts/geometry/geometry-validation-v1.schema.json");
const layoutSchema = json("contracts/geometry/floating-workbench-layout-v1.schema.json");
const fixture = json("contracts/geometry/examples/studio-metric-valid.json");
const python = read("python/src/contam_studio_core/building_geometry.py");
const rust = read("src-tauri/src/geometry_contract.rs");
const model = read("src/app/geometry/geometry-model.ts");
const validation = read("src/app/geometry/geometry-validation.ts");
const commands = read("src/app/geometry/geometry-commands.ts");
const history = read("src/app/geometry/geometry-history.ts");
const layout = read("src/app/geometry/geometry-layout.ts");
const tokens = read("src/styles/tokens.css");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const architecture = read("docs/architecture/geometry-workbench.md");
const adr = read("docs/adr/ADR-021-separate-studio-building-geometry-from-contam-sketchpad.md");
const agents = read("AGENTS.md");
const taskLog = read("docs/development/task-log/records/geometry-workbench-foundation.md");
const verify = read("scripts/verify.ps1");
const packageJson = json("package.json");

assert("building geometry schema is strict and versioned", geometrySchema.properties?.schema_version?.const === "building_geometry.v1" && geometrySchema.additionalProperties === false);
assert("building geometry separates projection and metric coordinate spaces", geometrySchema.$defs?.coordinate_space?.properties?.kind?.enum?.includes("contam_sketchpad_grid") && geometrySchema.$defs?.coordinate_space?.properties?.kind?.enum?.includes("studio_metric"));
assert("building geometry encodes explicit editing and round-trip capabilities", geometrySchema.$defs?.capabilities?.properties?.geometry_editing?.enum?.includes("read_only") && geometrySchema.$defs?.capabilities?.properties?.prj_round_trip?.enum?.includes("unsupported"));
assert("zone regions require explicit loops", geometrySchema.$defs?.zone_region?.properties?.outer_vertex_ids?.minItems === 3);
assert("command schema binds identity revision and hash", ["project_session_id", "geometry_id", "baseline_revision_id", "baseline_geometry_hash", "sequence"].every((key) => commandSchema.required.includes(key)));
assert("validation schema is deterministic and diagnostic", validationSchema.properties?.schema_version?.const === "geometry_validation.v1" && validationSchema.required.includes("geometry_hash") && validationSchema.required.includes("diagnostics"));
assert("floating layout is strict", layoutSchema.additionalProperties === false && layoutSchema.properties?.panels?.maxItems === 7);
assert("floating layout has three approved themes", layoutSchema.properties?.theme?.enum?.join(",") === "engineering-blueprint,architectural-paper,night-laboratory");
assert("shared fixture contains no uncontracted level fields", Object.keys(fixture.levels[0]).sort().join(",") === "elevation,flow_path_anchors,height,id,level_number,name,openings,underlays,vertices,walls,zone_regions");
assert("shared fixture is a metric draft without PRJ round trip", fixture.provenance.source_kind === "studio_metric_draft" && fixture.capabilities.geometry_editing === "studio_draft" && fixture.capabilities.prj_round_trip === "unsupported");

for (const constant of ["MAX_GEOMETRY_LEVELS", "MAX_GEOMETRY_VERTICES", "MAX_GEOMETRY_WALLS", "MAX_GEOMETRY_PAYLOAD_BYTES", "MAX_GEOMETRY_INTERSECTION_COMPARISONS"]) {
  assert(`Python geometry is bounded by ${constant}`, python.includes(constant));
  assert(`Rust geometry is bounded by ${constant}`, rust.includes(constant));
}
assert("Python projects only verified wall constants", python.includes("_WALL_OFFSETS") && python.includes("project_read_only_geometry"));
assert("Python does not infer zone regions", python.includes("geometry_zone_regions_not_inferred") && python.includes("zone_regions: tuple[GeometryZoneRegion, ...] = ()"));
assert("Python canonical hash is sorted SHA-256", python.includes("sort_keys=True") && python.includes("geometry_sha256"));
assert("Rust rejects unknown boundary fields", rust.includes("deny_unknown_fields") && rust.includes("serde_json::from_value"));
assert("Rust binds project and revision", rust.includes("geometry_project_session_stale") && rust.includes("geometry_revision_stale"));
assert("Rust validates topology and openings", rust.includes("geometry_wall_intersection_requires_split") && rust.includes("geometry_opening_out_of_bounds") && rust.includes("geometry_zone_self_intersection"));

assert("TypeScript geometry model is versioned", model.includes('BUILDING_GEOMETRY_SCHEMA_VERSION = "building_geometry.v1"'));
assert("TypeScript uses canonical SHA-256", model.includes("canonicalGeometryJson") && model.includes("sha256Text") && model.includes("TextEncoder"));
assert("frontend validator is bounded", validation.includes("MAX_GEOMETRY_INTERSECTION_COMPARISONS") && validation.includes("geometry_topology_complexity_limit_exceeded"));
assert("commands fail before stale mutation", commands.includes("geometry_command_identity_stale") && commands.includes("geometry_command_revision_stale") && commands.includes("geometry_command_hash_stale"));
assert("read-only projections cannot be edited", commands.includes('geometry.capabilities.geometry_editing !== "studio_draft"') && commands.includes("geometry_command_read_only"));
assert("candidate geometry is validated before ready", commands.includes("validateBuildingGeometry(candidate") && commands.includes('if (validation.status !== "valid")'));
assert("history supports undo redo and branch truncation", history.includes("undoGeometryCommand") && history.includes("redoGeometryCommand") && history.includes("state.entries.slice(0, state.cursor)"));
assert("history rejects command replay", history.includes("committed_command_ids.includes(command.command_id)"));
assert("AI and system commits require hash-bound user approval", history.includes('command.actor !== "user"') && history.includes("approval.baseline_geometry_hash") && history.includes('approved_by: "user"'));
assert("history resets across identity boundaries", history.includes("project_session_id") && history.includes("revision_id") && history.includes("geometry_id"));
assert("layout storage has a dedicated versioned key", layout.includes('FLOATING_WORKBENCH_STORAGE_KEY = "contam-studio:geometry-workbench:v1"'));
assert("layout accepts only whitelisted panels", layout.includes("FLOATING_PANEL_IDS") && layout.includes("isPanelId"));
assert("layout is clamped to the current viewport", layout.includes("clampFloatingPanel") && layout.includes("viewport.width - width"));
assert("layout comments keep domain data out of storage", layout.includes("local preference storage") && !layout.includes("BuildingGeometry"));
for (const theme of ["engineering-blueprint", "architectural-paper", "night-laboratory"]) {
  assert(`theme tokens exist for ${theme}`, tokens.includes(`[data-geometry-theme="${theme}"]`));
}

assert("initiative is the current descriptive fact source", agents.includes("docs/initiatives/geometry-workbench/README.md") && agents.includes("禁止继续创建新的 Phase、QA、Batch、R2"));
assert("initiative states no fake room polygons", initiative.includes("Zone 图标是锚点，不是房间轮廓"));
assert("initiative states current PRJ write boundary", initiative.includes("墙体/房间构造不写回") && initiative.includes("不得声称能无损回写任意 PRJ"));
assert("architecture keeps Canvas out of business truth", architecture.includes("Canvas 只是该状态的投影") && architecture.includes("不保存第二份几何事实"));
assert("ADR separates the two provenances", adr.includes("contam_sketchpad_projection") && adr.includes("studio_metric_draft"));
assert("task log is singular and live", taskLog.includes("task_id: geometry-workbench-foundation") && /status: (in_progress|completed)/.test(taskLog));
assert("foundation contract is included in verification", verify.includes("test-geometry-workbench-foundation-contract.mjs"));
assert("no second canvas framework was added", !["react-flow", "reactflow", "pixi.js", "three", "fabric"].some((name) => Object.keys(packageJson.dependencies).includes(name)));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Geometry Workbench foundation contract passed: ${checks} assertions.`);
