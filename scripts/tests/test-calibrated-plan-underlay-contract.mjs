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
const tauriRegistry = json("contracts/tauri-commands.v1.json");
const lifecycle = json("contracts/data-lifecycle.v1.json");
const model = read("src/app/geometry/geometry-model.ts");
const domain = read("src/app/geometry/geometry-plan-underlay.ts");
const domainTests = read("src/app/geometry/geometry-plan-underlay.test.ts");
const commands = read("src/app/geometry/geometry-commands.ts");
const validation = read("src/app/geometry/geometry-validation.ts");
const controller = read("src/app/runtime/useGeometryWorkbench.ts");
const resourceHook = read("src/app/runtime/useGeometryPlanUnderlay.ts");
const desktopApi = read("src/app/desktop-api.ts");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const rustResource = read("src-tauri/src/zone_bridge/geometry_underlay.rs");
const rustDocument = read("src-tauri/src/zone_bridge/geometry_document.rs");
const rustContract = read("src-tauri/src/geometry_contract.rs");
const python = read("python/src/contam_studio_core/building_geometry.py");
const packageJson = json("package.json");
const notices = read("THIRD_PARTY_NOTICES.md");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const architecture = read("docs/architecture/geometry-workbench.md");
const taskLog = read("docs/development/task-log/records/calibrated-plan-underlay-and-building-tracing.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("Level schema requires a bounded closed underlay collection", geometrySchema.$defs.level.required.includes("underlays") && geometrySchema.$defs.level.properties.underlays.maxItems === 1);
assert("underlay schema binds resource hash and bounded calibration state", geometrySchema.$defs.plan_underlay.additionalProperties === false && ["resource_id", "sha256", "micrometres_per_pixel", "rotation_millidegrees", "locked"].every((key) => geometrySchema.$defs.plan_underlay.required.includes(key)));
assert("command schema exposes add update and remove only through geometry history", ["set_plan_underlay", "update_plan_underlay", "remove_plan_underlay"].every((operation) => commandSchema.properties.operation.enum.includes(operation)));
assert("TypeScript model stores no local path", model.includes("interface GeometryPlanUnderlay") && !model.match(/GeometryPlanUnderlay[\s\S]{0,900}(source_path|absolute_path)/));
assert("underlay domain has invertible transform and two-point calibration", domain.includes("underlayPixelToGeometryPoint") && domain.includes("geometryPointToUnderlayPixel") && domain.includes("planUnderlayCalibration"));
assert("calibration preserves the first picked point and rejects locked input", domain.includes("pixel_origin_x_milli: Math.round(firstPixel.x * 1_000)") && domain.includes("if (underlay.locked"));
assert("underlay domain tests cover rotation calibration and fail-closed cases", domainTests.includes("round trips image and geometry coordinates with rotation") && domainTests.includes("fails closed for locked"));
assert("geometry commands keep resource identity immutable", commands.includes('case "set_plan_underlay"') && commands.includes('case "update_plan_underlay"') && commands.includes("current.resource_id !== underlay.resource_id"));
assert("geometry validation includes underlays in global IDs and payload checks", validation.includes("level.underlays") && validation.includes("isValidPlanUnderlay"));
assert("underlay edits use the existing controller history", controller.includes('"calibrate_underlay"') && workbench.includes('operation: "update_plan_underlay"') && workbench.includes("controller.commitOperations"));

const commandNames = tauriRegistry.commands.map((entry) => entry.command);
assert("Tauri contract registers import and byte read commands", commandNames.includes("select_and_import_geometry_underlay") && commandNames.includes("read_geometry_underlay_resource"));
assert("desktop wrappers do not accept file paths", desktopApi.includes("selectAndImportGeometryUnderlay") && desktopApi.includes("readGeometryUnderlayResource") && !desktopApi.match(/readGeometryUnderlayResource[\s\S]{0,600}(path|filePath)/));
assert("underlay byte reads use one strict camel-case request object", rustResource.includes('serde(rename_all = "camelCase", deny_unknown_fields)') && rustResource.includes("GeometryUnderlayReadRequest") && desktopApi.includes("request: {"));
assert("Rust accepts only PNG JPEG or PDF through native selection", rustResource.includes('add_filter("Plan underlay", &["png", "jpg", "jpeg", "pdf"])'));
assert("Rust reuses quarantine import verification", rustResource.includes("import_attachment_with_python") && rustResource.includes("owned_quarantine_path"));
assert("Rust verifies signatures hashes sizes and project freshness", rustResource.includes("validate_signature") && rustResource.includes("sha256_file") && rustResource.includes("geometry_context_is_current"));
assert("Rust derives app-owned paths from project identity", rustResource.includes('join("geometry-underlays")') && rustResource.includes("context.identity_sha256") && !rustResource.includes("source_path: String"));
assert("Rust rejects symbolic links before canonical resource reads", (rustResource.match(/candidate_metadata\.file_type\(\)\.is_symlink\(\)/g) ?? []).length === 2);
assert("geometry persistence revalidates referenced assets before save", rustDocument.includes("validate_geometry_underlay_references") && rustDocument.indexOf("validate_geometry_underlay_references") < rustDocument.indexOf("save_document_at(&path"));
assert("data lifecycle declares geometry underlays", lifecycle.entries.some((entry) => entry.id === "project_geometry_underlays" && entry.joins.includes("geometry-underlays")));
assert("Python and Rust independently validate underlay fields", python.includes("class GeometryPlanUnderlay") && python.includes("micrometres_per_pixel") && rustContract.includes("struct GeometryPlanUnderlay"));

assert("Konva renders the underlay below building geometry", canvas.includes("<KonvaImage") && canvas.indexOf("<KonvaImage") < canvas.indexOf("displayLevel.zone_regions.map"));
assert("canvas maps underlay origin scale and rotation deterministically", canvas.includes("rotation={-underlay.rotation_millidegrees / 1_000}") && canvas.includes("scaleX={underlay.micrometres_per_pixel / 1_000}"));
assert("fit view includes visible underlay corners", canvas.includes("underlayGeometryCorners") && canvas.includes("mergeBounds(mergeBounds(activeBounds, referenceBounds), underlayBounds(underlay))"));
assert("calibration has a full-canvas capture layer and visible point markers", canvas.includes('tool === "calibrate_underlay"') && canvas.includes("calibrationPoints.map"));
assert("underlay controls remain inside the existing layer popover", workbench.indexOf('className="geometry-underlay-controls"') > workbench.indexOf('className="geometry-deck-layer-popover"'));
assert("AI reuse requires an explicit user selection", workbench.includes("useForAi") && workbench.includes("toggleImageSelection") && rustResource.includes("selected_by_user = false"));
assert("geometry hash changes invalidate stale vision drafts", read("src/app/runtime/useGeometryVisionDraft.ts").includes("history.geometry_hash"));

assert("PDF.js is exact pinned and Apache-2.0 is documented", packageJson.dependencies["pdfjs-dist"] === "6.2.108" && notices.includes("pdfjs-dist 6.2.108") && notices.includes("Apache License 2.0"));
assert("PDF.js and its worker are dynamically imported", resourceHook.includes('import("pdfjs-dist/legacy/build/pdf.mjs")') && resourceHook.includes('import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")'));
assert("PDF rendering is bounded and page-specific", resourceHook.includes("MAX_RENDER_AXIS = 4_096") && resourceHook.includes("getPage(pageNumber)"));
assert("image dimensions and file size are bounded", domain.includes("MAX_UNDERLAY_PIXELS_PER_AXIS = 20_000") && rustResource.includes("MAX_GEOMETRY_UNDERLAY_BYTES"));
assert("Chinese and English underlay workflows are complete", Boolean(zh.geometry.editor.underlay?.calibrate) && Boolean(en.geometry.editor.underlay?.calibrate) && Boolean(zh.geometry.editor.tools?.calibrate_underlay) && Boolean(en.geometry.editor.tools?.calibrate_underlay));
assert("initiative documents real plan tracing without PRJ overclaim", initiative.includes("校准底图") && initiative.includes("不写入原始 PRJ"));
assert("architecture documents managed assets and coordinate transform", architecture.includes("geometry-underlays") && architecture.includes("micrometres_per_pixel"));
assert("one descriptive task log owns this delivery", taskLog.includes("task_id: calibrated-plan-underlay-and-building-tracing") && /status: (in_progress|completed)/.test(taskLog));
assert("capability matrix contains one current entry", matrix.capabilities.filter((item) => item.id === "calibrated-plan-underlay-and-building-tracing").length === 1);
assert("contract is included in unified verification", verify.includes("test-calibrated-plan-underlay-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Calibrated Plan Underlay and Building Tracing contract passed: ${checks} assertions.`);
