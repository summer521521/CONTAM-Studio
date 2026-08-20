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

const documentSchema = json("contracts/geometry/geometry-document-v1.schema.json");
const previewSchema = json("contracts/geometry/sketchpad-projection-preview-v1.schema.json");
const rust = read("src-tauri/src/zone_bridge/geometry_document.rs");
const zoneBridge = read("src-tauri/src/zone_bridge.rs");
const lib = read("src-tauri/src/lib.rs");
const capability = json("src-tauri/capabilities/default.json");
const desktopApi = read("src/app/desktop-api.ts");
const documentDomain = read("src/app/geometry/geometry-document.ts");
const runtime = read("src/app/runtime/useGeometryWorkbench.ts");
const runtimeTests = read("src/app/runtime/useGeometryWorkbench-persistence.test.tsx");
const projection = read("src/app/geometry/sketchpad-projection-preview.ts");
const visualWorkspace = read("src/components/workbench/visual/VisualModelWorkspace.tsx");
const visualCanvas = read("src/components/workbench/visual/VisualCanvasKonva.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const release = read("src-tauri/src/release.rs");
const releaseSettings = read("src/components/workbench/ReleaseSettings.tsx");
const dataLifecycle = json("contracts/data-lifecycle.v1.json");
const architecture = read("docs/architecture/geometry-workbench.md");
const adr = read("docs/adr/ADR-023-store-project-geometry-as-app-owned-document.md");
const privacy = read("docs/user-guide/local-data-and-privacy.md");
const taskLog = read("docs/development/task-log/records/project-geometry-document-and-sketchpad-preview.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("geometry document schema is closed and versioned", documentSchema.additionalProperties === false && documentSchema.properties.schema_version.const === "geometry_document.v1");
assert("geometry document revision is bounded", documentSchema.properties.document_revision.minimum === 1 && documentSchema.properties.document_revision.maximum === 4294967295);
assert("geometry document accepts only available Studio-owned metric geometry", JSON.stringify(documentSchema.properties.geometry).includes('"studio_metric_draft"') && JSON.stringify(documentSchema.properties.geometry).includes('"application_owned":{"const":true}'));
assert("preview schema is permanently lossy and non-applicable", previewSchema.properties.lossy.const === true && previewSchema.properties.can_apply.const === false);
assert("preview carries review-time project context", ["project_session_id", "source_sha256", "identity_sha256", "revision_id"].every((field) => previewSchema.required.includes(field)));
assert("preview payload is bounded", previewSchema.properties.moves.maxItems === 4096 && previewSchema.properties.diagnostics.maxItems === 64);

assert("Rust storage envelope rejects unknown fields", rust.includes("#[serde(deny_unknown_fields)]") && rust.includes("StoredGeometryDocument"));
assert("Rust binds storage to app-local data and baseline identity", rust.includes("app_local_data_dir") && rust.includes('join("geometry-documents")') && rust.includes("baseline_source_sha256"));
assert("Rust validates canonical geometry hashes", rust.includes("canonicalize_json") && rust.includes("geometry_document_hash_mismatch"));
assert("Rust serializes writes and rejects optimistic conflicts", rust.includes("GEOMETRY_DOCUMENT_IO") && rust.includes("geometry_document_conflict") && rust.includes("checked_add(1)"));
assert("Rust rotates one verified backup and quarantines corrupt primary", rust.includes('with_extension("json.bak")') && rust.includes('with_extension("json.corrupt")') && rust.includes("recovered_from_backup"));
assert("Rust uses temporary synchronized verified writes", rust.includes("create_new(true)") && rust.includes("sync_all") && rust.includes("read_document_file(path"));
assert("Rust load and save recheck active project context after blocking IO", rust.match(/geometry_context_is_current/g)?.length >= 2 && rust.includes("geometry_document_stale"));
assert("Rust tests cover round trip recovery conflict and concurrency", ["round_trips_and_rotates_one_verified_backup", "corrupt_primary_recovers_backup", "save_rejects_revision_conflicts", "concurrent_first_saves_are_serialized"].every((name) => rust.includes(name)));

assert("Tauri exposes only explicit geometry document commands", zoneBridge.includes("load_project_geometry_document") && zoneBridge.includes("save_project_geometry_document") && lib.includes("zone_bridge::load_project_geometry_document") && lib.includes("zone_bridge::save_project_geometry_document"));
assert("Tauri ACL grants both explicit commands", capability.permissions.includes("allow-load-project-geometry-document") && capability.permissions.includes("allow-save-project-geometry-document"));
assert("desktop API sends identity context and expected revision without paths", desktopApi.includes('"load_project_geometry_document"') && desktopApi.includes('"save_project_geometry_document"') && desktopApi.includes("expectedDocumentRevision") && !documentDomain.includes("Path"));
assert("frontend validates restored geometry and prevents save payload echo", documentDomain.includes("validateBuildingGeometry") && documentDomain.includes("save response leaked a model payload"));
assert("runtime loads before editing and debounces save", runtime.includes('status: "loading"') && runtime.includes("loadProjectGeometryDocument") && runtime.includes("saveProjectGeometryDocument") && runtime.includes("}, 350)"));
assert("runtime ignores stale async persistence", runtime.includes("persistenceSequence") && runtime.includes("activeContextKey.current !== expectedContextKey"));
assert("runtime tests cover debounce revision and late project responses", runtimeTests.includes("advanceTimersByTimeAsync(349)") && runtimeTests.includes("expectedRevision") && runtimeTests.includes("ignores a late restore"));
assert("geometry model is not stored in localStorage", !runtime.includes("localStorage") && !documentDomain.includes("localStorage") && !rust.includes("localStorage"));

assert("projection uses deterministic Zone centroids and y inversion", projection.includes("function centroid") && projection.includes("zone_centroid_normalized_to_existing_icon_bounds") && projection.includes("invert ? 1 - ratio : ratio"));
assert("projection verifies project source and revision identity", projection.includes("projection.identity_sha256") && projection.includes("projection.source_sha256") && projection.includes("projection.revision_id"));
assert("projection detects final occupancy collisions", projection.includes("sketchpad_projection_candidate_collision") && projection.includes("const occupancy = new Map"));
assert("projection cannot invoke Patch planning or write PRJ", projection.includes("lossy: true") && projection.includes("can_apply: false") && !projection.includes("planSemanticPatch") && !projection.includes("applySemanticPatch"));
assert("Konva renders a non-interactive ghost overlay", visualWorkspace.includes("projectionPreview") && visualCanvas.includes("projectionPreview") && visualCanvas.includes("listening={false}") && visualCanvas.includes("dash="));
assert("workbench presents preview and persistence status", workbench.includes("buildSketchpadProjectionPreview") && workbench.includes("controller.persistence.status") && workbench.includes("projectionPreview"));

assert("geometry documents are declared and labeled as user data", release.includes('"geometry-documents"') && release.includes('root.join("geometry-documents")') && releaseSettings.includes('"geometry-documents": ["建筑几何文档"') && dataLifecycle.entries.some((entry) => entry.id === "project_geometry_documents"));
assert("privacy guide explains app-owned non-sidecar storage", privacy.includes("geometry-documents") && privacy.includes("不是 PRJ 的相邻 sidecar"));
assert("architecture and ADR retain no-PRJ-write boundary", architecture.includes("can_apply=false") && architecture.includes("不调用 `plan_semantic_patch`") && adr.includes("不会生成 Patch") && adr.includes("修改原始 PRJ"));
assert("descriptive task is tracked without a new numbered phase", taskLog.includes("task_id: project-geometry-document-and-sketchpad-preview") && matrix.capabilities.some((item) => item.id === "project-geometry-document-and-sketchpad-preview"));
assert("Full verification includes this contract", verify.includes("test-project-geometry-document-and-sketchpad-preview-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Project Geometry Document and SketchPad Preview contract passed: ${checks} assertions.`);
