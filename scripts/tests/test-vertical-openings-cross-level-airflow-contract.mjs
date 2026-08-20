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
const model = read("src/app/geometry/geometry-model.ts");
const planner = read("src/app/geometry/geometry-vertical-connections.ts");
const validation = read("src/app/geometry/geometry-validation.ts");
const commands = read("src/app/geometry/geometry-commands.ts");
const plannerTests = read("src/app/geometry/geometry-vertical-connections.test.ts");
const python = read("python/src/contam_studio_core/building_geometry.py");
const pythonTests = read("python/tests/test_building_geometry.py");
const rust = read("src-tauri/src/geometry_contract.rs");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const navigator = read("src/components/workbench/geometry/GeometryObjectNavigator.tsx");
const controller = read("src/app/runtime/useGeometryWorkbench.ts");
const aiDraft = read("src/app/geometry/geometry-ai-draft.ts");
const rustVision = read("src-tauri/src/codex_app_server/geometry_vision.rs");
const geometryDocument = read("src-tauri/src/zone_bridge/geometry_document.rs");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const architecture = read("docs/architecture/geometry-workbench.md");
const taskLog = read("docs/development/task-log/records/vertical-openings-and-cross-level-airflow.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("geometry schema requires separate vertical construction and airflow collections", geometrySchema.required.includes("vertical_openings") && geometrySchema.required.includes("vertical_flow_path_anchors"));
assert("vertical opening schema is closed and bounded", geometrySchema.$defs.vertical_opening.additionalProperties === false && geometrySchema.$defs.vertical_opening.required.includes("lower_level_id") && geometrySchema.$defs.vertical_opening.required.includes("upper_level_id"));
assert("vertical airflow schema binds construction FlowPath and exact Zone pair", ["vertical_opening_id", "semantic_flow_path_id", "lower_zone_id", "upper_zone_id"].every((key) => geometrySchema.$defs.vertical_flow_path_anchor.required.includes(key)));
assert("command schema governs all four atomic actions", ["place_vertical_opening", "remove_vertical_opening", "link_vertical_flow_path", "unlink_vertical_flow_path"].every((operation) => commandSchema.properties.operation.enum.includes(operation)));
assert("TypeScript model keeps vertical construction and semantic binding distinct", model.includes("interface GeometryVerticalOpening") && model.includes("interface GeometryVerticalFlowPathAnchor"));
assert("controller exposes one tool and one selection domain", controller.includes('"vertical_opening"') && controller.includes('"vertical_flow_path"') && controller.includes("commitOperations"));

assert("planner orders existing Levels and admits only adjacent pairs", planner.includes("Math.abs(firstIndex - secondIndex) !== 1") && planner.includes("level_number"));
assert("planner uses exact integer polygon containment", planner.includes("BigInt(second.x - first.x)") && planner.includes("pointStrictlyInsidePolygon"));
assert("complete opening corners must belong to one Zone per Level", planner.includes("corners.every") && planner.includes("lowerZones.length !== 1 || upperZones.length !== 1"));
assert("same-Level-pair overlap is rejected but touching edges remain representable", planner.includes("verticalOpeningsOverlap") && planner.includes("first.x < second.x + second.width"));
assert("opening and anchor IDs are globally collision checked", planner.includes("allGeometryObjectIds(geometry).has(opening.id)") && planner.includes("allGeometryObjectIds(geometry).has(id)"));
assert("one opening accepts at most one semantic binding", planner.includes("vertical_flow_path_already_bound"));
assert("semantic FlowPath identity cannot be reused by wall or vertical bindings", planner.includes("level.flow_path_anchors") && planner.includes("semanticIds.has(semanticFlowPathId)"));

assert("TypeScript validation independently verifies Level adjacency", validation.includes("geometry_vertical_opening_levels_not_adjacent") && validation.includes("adjacentLevelPair"));
assert("TypeScript validation independently verifies Zone coverage and overlap", validation.includes("geometry_vertical_opening_zone_coverage_invalid") && validation.includes("geometry_vertical_opening_overlap"));
assert("TypeScript validation prevents duplicate FlowPath identity", validation.includes("geometry_flow_path_binding_duplicate") && validation.includes("vertical_flow_path_anchors"));
assert("commands parse closed vertical payload shapes", commands.includes('parseVerticalOpening') && commands.includes('parseVerticalFlowPathAnchor'));
assert("linked openings cannot be deleted", commands.includes("geometry_command_vertical_opening_has_flow_path"));
assert("placement and binding remain separate command cases", commands.includes('case "place_vertical_opening"') && commands.includes('case "link_vertical_flow_path"'));

assert("planner tests cover adjacency geometry coverage overlap and global IDs", plannerTests.includes("non-adjacent Levels") && plannerTests.includes("global ID collisions") && plannerTests.includes("vertical_opening_overlap"));
assert("planner tests cover exact Zone pair binding and semantic reuse", plannerTests.includes("verified lower and upper Zone pair") && plannerTests.includes("reused semantic paths"));
assert("command tests cover separate undo boundaries", plannerTests.includes("separate undoable commands") && plannerTests.includes("undoGeometryCommand"));
assert("command tests reject tampered cross-level payloads", plannerTests.includes("tampered cross-level payloads") && plannerTests.includes("wrong-zone"));

assert("Python model serializes both vertical facts", python.includes("class GeometryVerticalOpening") && python.includes("class GeometryVerticalFlowPathAnchor"));
assert("Python independently uses strict polygon containment", python.includes("_point_strictly_in_polygon") && python.includes("_zones_containing_vertical_opening"));
assert("Python tests cover valid vertical binding and invalid adjacency", pythonTests.includes("validate_as_distinct_facts") && pythonTests.includes("requires_adjacent_levels"));
assert("Rust boundary uses deny_unknown_fields for both vertical structs", (rust.match(/struct GeometryVertical(?:Opening|FlowPathAnchor)/g) ?? []).length === 2 && rust.includes("#[serde(deny_unknown_fields)]"));
assert("Rust validates Level adjacency Zone coverage and duplicate semantic identity", rust.includes("geometry_vertical_opening_levels_not_adjacent") && rust.includes("geometry_vertical_flow_path_zone_mismatch") && rust.includes("geometry_flow_path_binding_duplicate"));
assert("Rust tests include valid and mutated vertical payloads", rust.includes("accepts_vertical_opening_and_explicit_cross_level_flow_path_anchor") && rust.includes("rejects_vertical_level_zone_and_semantic_binding_mutations"));
assert("legacy app-owned documents verify their old hash before geometry collection migration", geometryDocument.indexOf("let actual_hash = geometry_sha256(&stored.geometry)") < geometryDocument.indexOf("migrate_geometry_collections(stored.geometry)"));
assert("legacy migration is all-or-nothing and revalidates the upgraded geometry", geometryDocument.includes("(false, false)") && geometryDocument.includes("_ => return Err(geometry_contract_error())") && geometryDocument.includes("legacy_document_without_vertical_collections_migrates_after_hash_verification"));

assert("canvas places only planner-produced vertical openings", canvas.includes("planVerticalOpeningPlacement") && canvas.includes("onCommitOperations([plan.operation]"));
assert("canvas renders connection direction and target Level", canvas.includes("currentIsLower ? \"↑\" : \"↓\"") && canvas.includes("levelNameById"));
assert("canvas exposes vertical opening and bound path selection", canvas.includes('kind: anchor ? "vertical_flow_path" : "vertical_opening"'));
assert("workbench lists only adjacent Level targets", workbench.includes("adjacentLevelPair(geometry, activeLevel.id, level.id)"));
assert("workbench separates opening kind from semantic binding", workbench.includes("verticalOpeningKind") && workbench.includes("linkSelectedVerticalFlowPath"));
assert("workbench filters semantic FlowPaths by exact Zone endpoints", workbench.includes("matchingVerticalFlowPathOptions") && planner.includes("from_endpoint") && planner.includes("to_endpoint"));
assert("workbench makes binding and unbinding explicit", workbench.includes("bindFlowPath") && workbench.includes("unlink_vertical_flow_path"));
assert("DOM navigator exposes both vertical facts", navigator.includes('kind: "vertical_opening"') && navigator.includes('kind: "vertical_flow_path"'));
assert("copy-to-empty treats a vertical opening as existing construction", workbench.includes("levelIsEmptyConstructionTarget(activeLevel, geometry)"));

assert("Chinese vertical workflow copy is complete", Boolean(zh.geometry.editor.verticalOpening?.bindingHint) && Boolean(zh.geometry.editor.issue?.verticalZoneCoverage));
assert("English vertical workflow copy is complete", Boolean(en.geometry.editor.verticalOpening?.bindingHint) && Boolean(en.geometry.editor.issue?.verticalZoneCoverage));
assert("AI geometry drafts cannot invent vertical openings or bindings", !aiDraft.includes("place_vertical_opening") && !aiDraft.includes("link_vertical_flow_path"));
assert("Codex vision schema cannot invent vertical openings or bindings", !rustVision.includes("place_vertical_opening") && !rustVision.includes("link_vertical_flow_path"));
assert("initiative documents separate construction FlowPath and phantom semantics", initiative.includes("vertical_openings") && initiative.includes("phantom zone") && initiative.includes("link_vertical_flow_path"));
assert("architecture documents cross-level identity and failure boundaries", architecture.includes("vertical_flow_path_anchors") && architecture.includes("相邻 Level") && architecture.includes("上下 Zone"));
assert("one current task log records this delivery", taskLog.includes("task_id: vertical-openings-and-cross-level-airflow") && /status: (in_progress|completed)/.test(taskLog));
assert("capability matrix has one current entry", matrix.capabilities.filter((item) => item.id === "vertical-openings-and-cross-level-airflow").length === 1);
assert("contract is included in unified verification", verify.includes("test-vertical-openings-cross-level-airflow-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Vertical Openings and Cross-level Airflow contract passed: ${checks} assertions.`);
