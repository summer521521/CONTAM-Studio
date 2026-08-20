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

const planner = read("src/app/geometry/geometry-wall-airflow.ts");
const plannerTests = read("src/app/geometry/geometry-wall-airflow.test.ts");
const validation = read("src/app/geometry/geometry-validation.ts");
const commands = read("src/app/geometry/geometry-commands.ts");
const python = read("python/src/contam_studio_core/building_geometry.py");
const pythonTests = read("python/tests/test_building_geometry.py");
const rust = read("src-tauri/src/geometry_contract.rs");
const bridge = read("src-tauri/src/zone_bridge.rs");
const geometryDocument = read("src-tauri/src/zone_bridge/geometry_document.rs");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const editor = read("src/components/workbench/geometry/WallFlowPathEditor.tsx");
const factory = read("src/app/geometry/geometry-factories.ts");
const styles = read("src/styles/features/geometry.css");
const aiDraft = read("src/app/geometry/geometry-ai-draft.ts");
const rustVision = read("src-tauri/src/codex_app_server/geometry_vision.rs");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const architecture = read("docs/architecture/geometry-workbench.md");
const taskLog = read("docs/development/task-log/records/wall-airflow-boundaries-and-outdoor-context.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("wall boundary classifier requires two-Zone interior walls", planner.includes('zoneIds.length === 2 && wall.kind === "interior"'));
assert("wall boundary classifier requires one-Zone exterior walls", planner.includes('zoneIds.length === 1 && wall.kind === "exterior"'));
assert("unknown and contradictory boundaries fail closed", planner.includes("geometry_wall_flow_path_boundary_unresolved"));
assert("duplicate or missing Zone identities fail closed", planner.includes("uniqueZoneIdsByContamNumber") && planner.includes("result.has(number) ? null : id"));
assert("duplicate semantic FlowPath identities fail closed", planner.includes("uniqueSemanticIds") && planner.includes("uniqueFlowIds.get(id) !== true"));
assert("occupied wall or vertical FlowPaths are excluded", planner.includes("boundFlowPathIds.has(id)") && planner.includes("vertical_flow_path_anchors"));
assert("interior matching requires exact distinct Zone endpoints", planner.includes('boundary.kind === "interior"') && planner.includes("fromZoneId === toZoneId"));
assert("outdoor endpoint requires category and null CONTAM number", planner.includes('endpoint?.category === "outdoor" && endpoint.contam_number === null'));
assert("both Zone-to-outdoor directions remain representable", planner.includes('exteriorSide: "from"') && planner.includes('exteriorSide: "to"'));
assert("planner preserves semantic endpoint orientation in the anchor", planner.includes("from_zone_id: option.fromZoneId") && planner.includes("to_zone_id: option.toZoneId"));
assert("one opening accepts at most one wall FlowPath", planner.includes("geometry_wall_flow_path_opening_already_bound"));
assert("new anchor identity is globally collision checked", planner.includes("allGeometryObjectIds(geometry).has(id)"));
assert("saved anchors have verified invalid and unavailable audit states", planner.includes('status: "verified"') && planner.includes('status: "invalid"') && planner.includes('status: "unavailable"'));

assert("TypeScript contract requires exact adjacent and endpoint Zone sets", validation.includes("endpointZones.size === adjacentZones.size") && validation.includes("geometry_flow_path_zone_mismatch"));
assert("TypeScript contract checks host wall kind", validation.includes('wall?.kind === "interior"') && validation.includes('wall?.kind === "exterior"'));
assert("TypeScript contract rejects a second anchor on one opening", validation.includes("geometry_flow_path_opening_duplicate"));
assert("Python contract repeats exact set and wall-kind validation", python.includes("endpoint_zones != adjacent_zones") && python.includes('wall_kind == "interior"') && python.includes('wall_kind == "exterior"'));
assert("Rust contract repeats exact set and wall-kind validation", rust.includes("endpoint_zones != adjacent_zones") && rust.includes('wall_kind == Some("interior")') && rust.includes('wall_kind == Some("exterior")'));
assert("closed link command payload remains the only mutation path", commands.includes('case "link_flow_path"') && commands.includes("parseFlowPathAnchor") && commands.includes("exactKeys"));

assert("domain tests cover both semantic directions and exact interior matching", plannerTests.includes("both semantic directions") && plannerTests.includes("both exact Zone identities"));
assert("domain tests cover duplicate and occupied identities", plannerTests.includes("duplicate Zone numbers") && plannerTests.includes("occupied paths"));
assert("domain tests cover tampering and saved-anchor audit", plannerTests.includes("tampered candidates") && plannerTests.includes("audits verified"));
assert("Python tests cover explicit boundary and unique opening binding", pythonTests.includes("requires_one_explicit_boundary_and_exact_zone_set") && pythonTests.includes("geometry_flow_path_opening_duplicate"));
assert("Rust tests cover explicit boundary and unique opening binding", rust.includes("wall_flow_path_requires_explicit_boundary_and_unique_opening_binding"));
assert("Rust independently resolves semantic Zone numbers and FlowPath endpoints", rust.includes("validate_geometry_semantic_flow_bindings") && rust.includes("ResolvedSemanticEndpoint"));
assert("Rust semantic tests cover direction missing identity and vertical endpoints", rust.includes("trusted_semantic_snapshot_proves_wall_and_vertical_flow_path_endpoints") && rust.includes("geometry_flow_path_semantic_missing"));
assert("trusted semantic evidence is cached only after a current bridge read", bridge.includes("TrustedSemanticSnapshot") && bridge.includes("state.trusted_semantic_snapshot = Some") && bridge.includes("still_current"));
assert("project replacement clears trusted semantic evidence", bridge.includes("state.trusted_semantic_snapshot = None"));
assert(
  "geometry saves bind cached evidence to project revision and source identity",
  /snapshot\.project_session_id\s*==\s*active\.project_session_id/.test(geometryDocument)
    && /snapshot\.revision_id\s*==\s*active\.active_revision\(\)\.revision_id/.test(geometryDocument)
    && /snapshot\s*\.source_sha256\s*\.eq_ignore_ascii_case\(&active\.source_sha256\)/.test(geometryDocument),
);
assert("FlowPath geometry cannot save without trusted semantic context", geometryDocument.includes("geometry_document_semantic_context_unavailable") && geometryDocument.includes("validate_geometry_semantic_flow_bindings"));
assert("geometry document tests cover semantic evidence before persistence", geometryDocument.includes("flow_path_geometry_save_requires_current_trusted_semantic_evidence"));

assert("canvas delegates semantic linking to the stable parent", canvas.includes("onLinkWallFlowPath(opening.id)") && !canvas.includes("semantic_flow_path_id: selectedFlowPathId"));
assert("canvas uses neutral interior and exterior marks instead of guessed wind direction", canvas.includes('anchor.exterior_side === "none" ? "↔" : "EXT"'));
assert("workbench derives contextual options in memoized parent state", workbench.includes("matchingWallFlowPathOptions") && workbench.includes("useMemo"));
assert("workbench routes direct binding through the bounded planner", workbench.includes("planWallFlowPathLink") && workbench.includes("controller.commitOperations([plan.operation]"));
assert("workbench audits existing anchors against current semantics", workbench.includes("auditWallFlowPathAnchor"));
assert("dedicated editor shows boundary endpoints and audit state", editor.includes("geometry-wall-flow-endpoints") && editor.includes("audit?.status"));
assert("dedicated editor supports explicit bind and unbind actions", editor.includes("onBind") && editor.includes("onUnbind"));
assert("teaching geometry no longer binds an arbitrary first FlowPath", factory.includes("matchingWallFlowPathOptions") && !factory.includes("semantic_flow_path_id: ids.flowPaths[0]"));
assert("geometry CSS owns the new contextual editor", styles.includes(".geometry-wall-flow-editor") && styles.includes(".geometry-wall-flow-binding.is-invalid"));

assert("Chinese boundary and failure copy is complete", Boolean(zh.geometry.editor.wallAirflow?.boundary?.exterior) && Boolean(zh.geometry.editor.issue?.wallFlowSemanticMismatch));
assert("English boundary and failure copy is complete", Boolean(en.geometry.editor.wallAirflow?.boundary?.exterior) && Boolean(en.geometry.editor.issue?.wallFlowSemanticMismatch));
assert("ordinary AI drafts cannot create wall FlowPath bindings", !aiDraft.includes('operation: "link_flow_path"'));
assert("Codex vision schema cannot create wall FlowPath bindings", !rustVision.includes('"link_flow_path"'));
assert("initiative documents exact wall endpoint binding", initiative.includes("Zone—ambient") && initiative.includes("matchingWallFlowPathOptions"));
assert("architecture documents the wall airflow authority boundary", architecture.includes("geometry-wall-airflow.ts") && architecture.includes("室内/室外边界"));
assert("one current task log records this delivery", taskLog.includes("task_id: wall-airflow-boundaries-and-outdoor-context") && /status: (in_progress|completed)/.test(taskLog));
assert("capability matrix has one current entry", matrix.capabilities.filter((item) => item.id === "wall-airflow-boundaries-and-outdoor-context").length === 1);
assert("contract is included in unified verification", verify.includes("test-wall-airflow-boundaries-outdoor-context-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Wall Airflow Boundaries and Outdoor Context contract passed: ${checks} assertions.`);
