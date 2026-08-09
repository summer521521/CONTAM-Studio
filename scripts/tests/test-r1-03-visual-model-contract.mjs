import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", ".."));
const failures = [];
let checks = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(name, condition) {
  checks += 1;
  if (!condition) failures.push(name);
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

const pythonProjection = read("python/src/contam_studio_core/spatial_projection.py");
const pythonBridge = read("python/src/contam_studio_core/zone_bridge.py");
const prjSections = read("python/src/contam_studio_core/prj_sections.py");
const rustBridge = read("src-tauri/src/zone_bridge.rs");
const model = read("src/app/spatial-model.ts");
const semanticState = read("src/app/semantic-state.ts");
const projectPage = read("src/components/workbench/pages/ProjectPage.tsx");
const workspace = read("src/components/workbench/visual/VisualModelWorkspace.tsx");
const canvas = read("src/components/workbench/visual/VisualCanvasKonva.tsx");
const zh = read("src/i18n/locales/zh-CN.json");
const en = read("src/i18n/locales/en.json");
const packageJson = JSON.parse(read("package.json"));
const vite = read("vite.config.ts");

assert("versioned Python projection exists", pythonProjection.includes('SPATIAL_SCHEMA_VERSION = "spatial_projection.v1"'));
for (const name of ["MAX_SPATIAL_LEVELS", "MAX_SPATIAL_ICONS", "MAX_SPATIAL_STRING_BYTES", "MAX_SPATIAL_COORDINATE", "MAX_SPATIAL_PAYLOAD_BYTES"]) {
  assert(`Python projection has bounded constant ${name}`, pythonProjection.includes(name));
}
for (const parserCheck of ["levels plus icon data", "level_count", "icon_count", "spatial_section_missing", "spatial_duplicate_section"]) {
  assert(`Python projection validates ${parserCheck}`, pythonProjection.includes(parserCheck));
}
assert("shared PRJ parser validates section terminators", prjSections.includes("section_terminator_missing") && prjSections.includes('lines[cursor].strip() != "-999"'));
assert("Python projection preserves unknown icons", pythonProjection.includes('return "unknown"') && pythonProjection.includes("spatial_unknown_icon_type"));
assert("semantic bridge returns spatial projection", pythonBridge.includes("spatial_projection") && pythonBridge.includes("project_spatial"));
assert("semantic bridge does not expose source text", !pythonBridge.includes("source_text") && !pythonBridge.includes("read_text()"));

for (const rustCheck of ["SpatialProjectionPayload", "deny_unknown_fields", "validate_spatial_projection", "MAX_SPATIAL_PAYLOAD_BYTES", "spatial_revision_mismatch", "spatial_identity_mismatch", "spatial_duplicate_icon_id", "spatial_dangling_binding"]) {
  assert(`Rust boundary validates ${rustCheck}`, rustBridge.includes(rustCheck));
}
assert("Rust bridge requests the active revision", rustBridge.includes("revision_id: active.active_revision().revision_id"));
assert("Rust boundary rejects forbidden fields through typed payloads", rustBridge.includes("serde_json::from_value(value.clone())") && rustBridge.includes("forbidden"));

for (const typeName of ["SpatialProjection", "SpatialLevel", "SpatialIcon", "SpatialBinding", "SpatialUnavailableReason", "VisualWorkspaceMode", "VisualLayerVisibility", "VisualViewport", "VisualSelectionProjection"]) {
  assert(`explicit frontend type ${typeName}`, model.includes(`type ${typeName}`) || model.includes(`interface ${typeName}`));
}
for (const transform of ["classifySpatialIconType", "spatialBoundsForIcons", "fitViewport", "zoomViewportAtPointer", "buildSpatialBindingIndex", "buildTopologyLayout", "resetVisualContext"]) {
  assert(`pure frontend transform ${transform}`, model.includes(`function ${transform}`));
}
assert("semantic snapshot carries one spatial fact source", semanticState.includes("spatial_projection: SpatialProjection"));
assert("visual workspace is lazy from project page", projectPage.includes('await import("../visual/VisualModelWorkspace")'));
assert("Konva is lazy behind the visual workspace", workspace.includes('lazy(() => import("./VisualCanvasKonva"))'));
const konvaImporters = sourceFiles(path.join(root, "src")).filter((file) => {
  const content = fs.readFileSync(file, "utf8");
  return /from\s+["'](?:konva|react-konva)["']/.test(content);
});
assert("Konva imports exist only in the lazy canvas module", konvaImporters.length === 1 && path.basename(konvaImporters[0]) === "VisualCanvasKonva.tsx");
assert("approved exact Konva versions are installed", packageJson.dependencies?.konva === "10.3.0" && packageJson.dependencies?.["react-konva"] === "19.2.5");
assert("canvas drag is limited to the viewport stage", (canvas.match(/\bdraggable\b/g) ?? []).length === 1 && canvas.includes("<Stage") && !canvas.includes("Transformer") && !canvas.includes("write_prj"));
assert("topology drawing uses indexed endpoint lookup", canvas.includes("topologyNodeById") && !canvas.includes("topology.nodes.find"));
assert("topology edge disclosure includes the flow element fact", canvas.includes("element: edge.flowElementId") && zh.includes("元件 {{element}}") && en.includes("element {{element}}"));
assert("visual workspace provides DOM object explorer", workspace.includes("visual-object-explorer") && workspace.includes("aria-label={t(\"visual.objectList.results\")}"));
assert("visual workspace provides canvas fallback", workspace.includes("ErrorBoundary") && workspace.includes("switchTopology") && workspace.includes("objectListOpen"));
assert("visual workspace exposes live selection announcement", workspace.includes('aria-live="polite"'));
assert("visual workspace uses one keyboard focus owner", workspace.includes('role="region"') && !workspace.includes('role="application"') && !workspace.includes('tabIndex={0}') && (canvas.match(/tabIndex=\{0\}/g) ?? []).length === 1);
assert("frontend does not parse raw PRJ", !model.includes("readFile") && !workspace.includes("readFile") && !canvas.includes("readFile"));
assert("visual layer reuses semantic selection instead of a reducer", workspace.includes("onSelectSemantic") && canvas.includes("onSelectSemantic") && !workspace.includes("useReducer") && !canvas.includes("useReducer"));
assert("no competing canvas framework is present", !["react-flow", "reactflow", "pixi.js", "three"].some((name) => read("package.json").toLowerCase().includes(name)));
assert("chunk warning limit is not raised", !vite.includes("chunkSizeWarningLimit"));

for (const [locale, content] of [["Chinese", zh], ["English", en]]) {
  assert(`${locale} has schematic notice`, content.includes("schematicNotice"));
  assert(`${locale} has topology notice`, content.includes("topologyNotice"));
  assert(`${locale} has unknown icon text`, content.includes("unknownIcon") || content.includes("Unrecognized icon type") || content.includes("未识别图标类型"));
}
assert("R1-03 pure and component tests exist", fs.existsSync(path.join(root, "src/app/spatial-model.test.ts")) && fs.existsSync(path.join(root, "src/components/workbench/visual/VisualModelWorkspace.test.tsx")));
assert("R1-03 task log exists", fs.existsSync(path.join(root, "docs/development/task-log/records/r1-03-visual-model-workspace.md")));
assert("R1-03 does not create another work-package namespace", !pythonProjection.includes("Phase") && !workspace.includes("Batch") && !canvas.includes("QA"));

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`R1-03 visual model contract passed: ${checks} assertions.`);
