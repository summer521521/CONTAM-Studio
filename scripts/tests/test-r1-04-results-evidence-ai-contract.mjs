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

const rust = read("src-tauri/src/zone_bridge.rs");
const rustTests = read("src-tauri/src/zone_bridge/tests.rs");
const lib = read("src-tauri/src/lib.rs");
const desktop = read("src/app/desktop-api.ts");
const controller = read("src/app/controllers/result-dataset-controller.ts");
const dataset = read("src/app/result-dataset-state.ts");
const datasetTests = read("src/app/result-dataset-state.test.ts");
const evidence = read("src/app/evidence-lineage.ts");
const results = read("src/components/workbench/results/ResultsWorkspace.tsx");
const chart = read("src/components/workbench/results/MultiZoneResultChart.tsx");
const visualModel = read("src/app/spatial-model.ts");
const visualWorkspace = read("src/components/workbench/visual/VisualModelWorkspace.tsx");
const visualCanvas = read("src/components/workbench/visual/VisualCanvasKonva.tsx");
const viewportTests = read("src/components/workbench/visual/viewport-command.test.ts");
const aiState = read("src/app/ai-state.ts");
const assistantContext = read("src/app/assistant-context.ts");
const assistantContextTests = read("src/app/assistant-context.test.ts");
const assistantPanel = read("src/components/workbench/CodexAssistantPanel.tsx");
const assistantConversation = read("src/components/workbench/assistant/AssistantConversation.tsx");
const assistantPatch = read("src/components/workbench/assistant/AssistantPatchProposal.tsx");
const assistantSettings = read("src/components/workbench/assistant/AiProviderSettings.tsx");
const settings = read("src/components/workbench/pages/SettingsPage.tsx");
const pythonSpatial = read("python/src/contam_studio_core/spatial_projection.py");
const pythonSpatialTests = read("python/tests/test_spatial_projection.py");
const packageJson = JSON.parse(read("package.json"));
const vite = read("vite.config.ts");
const zh = read("src/i18n/locales/zh-CN.json");
const en = read("src/i18n/locales/en.json");

assert("multi-Zone dataset schema is versioned", rust.includes('ZONE_RESULT_DATASET_SCHEMA: &str = "zone_result_dataset.v1"') && dataset.includes('ZONE_RESULT_DATASET_SCHEMA = "zone_result_dataset.v1"'));
for (const [name, value] of [["MAX_RESULT_DATASET_ZONES", "64"], ["MAX_RESULT_DATASET_SAMPLES", "250_000"], ["MAX_RESULT_DATASET_PAYLOAD_BYTES", "32 * 1024 * 1024"]]) {
  assert(`Rust dataset bound ${name}`, rust.includes(`const ${name}: usize = ${value}`));
}
for (const field of ["project_session_id", "project_source_hash", "revision_id", "run_id", "run_manifest_identity", "extraction_batch_id", "dataset_fingerprint"]) {
  assert(`dataset binds ${field}`, rust.includes(`${field}:`) && dataset.includes(`${field}:`));
}
for (const status of ["ready", "partial", "failed", "cancelled", "stale"]) {
  assert(`frontend represents dataset status ${status}`, dataset.includes(`\"${status}\"`));
}
for (const metric of ["temperature_k", "reference_pressure_pa", "air_density_kg_m3"]) {
  assert(`dataset only exposes verified metric ${metric}`, rust.includes(`\"${metric}\"`) && dataset.includes(`\"${metric}\"`));
}
assert("dataset uses exact common times without interpolation", rust.includes("exact_common_result_times") && rust.includes('"exact_common"') && !dataset.includes("interpolateSample"));
assert("per-Zone failures form partial truth", rust.includes("per_zone_failures") && rust.includes('"partial"') && datasetTests.includes("preserves partial truth"));
assert("hard identity failures cannot become partial", rust.includes("result_dataset_failure_is_hard") && rust.includes("identity_mismatch") && rust.includes("source_mismatch"));
assert("dataset fingerprint is deterministic canonical SHA-256", rust.includes("canonical_bytes") && rust.includes("sha256_bytes(&canonical_bytes)") && rustTests.includes("zone_result_dataset_is_deterministic_partial_and_uses_exact_common_times"));
assert("dataset extraction reuses bounded Rust command", rust.includes("pub async fn extract_active_run_zone_air_state_dataset") && desktop.includes("extract_active_run_zone_air_state_dataset") && controller.includes("extractActiveRunZoneAirStateDataset"));
assert("dataset cancellation is explicit", rust.includes("pub async fn cancel_zone_result_dataset") && desktop.includes("cancel_zone_result_dataset") && lib.includes("cancel_zone_result_dataset"));
assert("dataset cancellation and stale responses have tests", rustTests.includes("result_dataset_cancellation_and_stale_retention_are_identity_bound") && datasetTests.includes("does not let a cancelled or late request replace trusted state"));
assert("refresh failure retains trusted dataset", dataset.includes('status: "stale"') && dataset.includes("refreshIssue") && datasetTests.includes("retains the last trusted dataset"));
assert("raw result arrays are not persisted in browser storage", !dataset.includes("localStorage") && !controller.includes("localStorage"));

for (const tab of ["overview", "timeseries", "spatial", "evidence"]) {
  assert(`results workspace includes ${tab} tab`, results.includes(`\"${tab}\"`));
}
assert("results preserve separate solver and extraction states", results.includes("solveSucceeded") && results.includes("state.status"));
assert("multi-Zone chart is a lazy ECharts surface", results.includes('import("./MultiZoneResultChart")') && chart.includes('from "echarts/core"'));
assert("chart does not connect missing values", chart.includes("connectNulls: false"));
assert("visible result series are capped at eight", dataset.includes("MAX_VISIBLE_RESULT_SERIES = 8"));
assert("result table is paged", dataset.includes("RESULT_TABLE_PAGE_SIZE = 100") && results.includes("ResultDataTable"));
assert("missing values remain null", dataset.includes("return null") && datasetTests.includes("without replacing missing values with zero"));
assert("statistics are deterministic one-pass selectors", dataset.includes("datasetMetricStatistics") && dataset.includes("mean += (value - mean) / count"));
assert("pressure diverges only across zero", dataset.includes('metric === "reference_pressure_pa" && statistics.minimum < 0 && statistics.maximum > 0'));
assert("color range is fixed to all dataset times", dataset.includes('rangeStrategy: "dataset_all_times"'));
assert("spatial result overlay binds semantic IDs", results.includes("resultOverlay") && visualWorkspace.includes("resultOverlay") && visualCanvas.includes("icon.binding.semantic_id"));
assert("spatial results do not invent polygons", !results.includes("polygon") && !visualCanvas.includes("ZonePolygon"));
assert("selection stays semantic", results.includes("onSelectSemantic") && visualWorkspace.includes("onSelectSemantic") && !results.includes("useReducer"));

assert("evidence lineage has controlled states", evidence.includes('"verified" | "partial" | "failed" | "stale" | "unavailable"'));
for (const kind of ["project", "revision", "snapshot", "run", "manifest", "extraction", "dataset"]) {
  assert(`evidence lineage includes ${kind}`, evidence.includes(`kind: \"${kind}\"`) || evidence.includes(`id: \"${kind}\"`));
}
assert("evidence chain cannot claim green when incomplete", evidence.includes('node.status === "unavailable"') && evidence.includes('return "verified"'));
assert("evidence view does not expose absolute paths", !evidence.includes("source_path") && !evidence.includes("baseline_source_path"));
assert("result evidence reuses the same lineage selector", results.includes("buildEvidenceLineage") && results.includes("evidenceChainStatus"));

assert("AI analysis selection is typed in frontend and Rust", aiState.includes("interface AiAnalysisSelection") && rust.includes("struct AiAnalysisSelection"));
for (const intent of ["explain_object", "diagnose_run_result", "propose_change", "simulation_plan"]) {
  assert(`AI intent ${intent} is bounded in both layers`, aiState.includes(`\"${intent}\"`) && rust.includes(`\"${intent}\"`));
}
assert("AI context binds dataset, metric and selected time", rust.includes("result_dataset_fingerprint") && rust.includes("selected_time_seconds") && assistantContext.includes("resultDatasetFingerprint"));
assert("AI context rejects stale dataset fingerprints", rust.includes('"ai_context_stale"') && rustTests.includes("ai_result_context_discloses_only_selected_exact_values_and_binds_fingerprint"));
assert("AI receives only selected exact values", rust.includes('"selected_values"') && rustTests.includes('pointer("/result_summary/samples")'));
assert("assistant receipt strips path parents", assistantContext.includes("safeLeafName") && assistantContextTests.includes('toBe("demo.prj")'));
for (const excluded of ["credentials", "absolute_paths", "original_prj_text", "complete_result_series"]) {
  assert(`receipt explicitly excludes ${excluded}`, assistantContext.includes(`\"${excluded}\"`));
}
assert("preview receipt identity changes with bound inputs", assistantContext.includes("assistantReceiptMatchesPreview") && assistantContextTests.includes("changes identity for every preview-binding input"));
assert("AI answer separates facts, interpretation and limits", assistantConversation.includes("assistant.facts") && assistantConversation.includes("assistant.interpretation") && assistantConversation.includes("assistant.limitations"));
assert("AI patch has only a review action", assistantPatch.includes("onReview(patch)") && assistantPatch.includes("reviewSemanticPatch") && !assistantPatch.includes("applyPatch"));
assert("AI patch joins the existing semantic review callback", assistantPanel.includes("onUseSemanticPatch") && assistantPanel.includes("onReviewPatch={onUseSemanticPatch}"));
assert("Provider secrets are absent from the main assistant panel", !assistantPanel.includes('type="password"') && !assistantPanel.includes("assistant.providerEndpoint") && !assistantPanel.includes("assistant.providerApiKey"));
assert("Provider secrets stay in Settings advanced UI", settings.includes("AiProviderSettings") && assistantSettings.includes('type="password"') && assistantSettings.includes("provider-settings-advanced"));
assert("Provider missing and failed remain distinct", settings.includes("providerNotConfigured") && settings.includes("providerConnectionFailed"));

assert("viewport commands use one-time sequence consumption", visualCanvas.includes("lastHandledCommandRef") && visualCanvas.includes("shouldConsumeViewportCommand"));
assert("viewport lifecycle tests cover every command and reset", viewportTests.includes('"fit", "reset", "zoom_in", "zoom_out", "locate"') && viewportTests.includes("does not replay") && viewportTests.includes("identity or revision reset"));
assert("visual workspace has one focus owner", visualWorkspace.includes('role="region"') && !visualWorkspace.includes('role="application"') && !visualWorkspace.includes('tabIndex={0}') && (visualCanvas.match(/tabIndex=\{0\}/g) ?? []).length === 1);
assert("topology uses deterministic two-dimensional layout", visualModel.includes("Math.ceil(Math.sqrt(entries.length))") && !visualModel.includes("Math.random"));
for (const name of ["MAX_SPATIAL_LEVELS", "MAX_SPATIAL_ICONS", "MAX_SPATIAL_ICON_TYPE", "MIN_SPATIAL_OBJECT_NUMBER", "MAX_SPATIAL_OBJECT_NUMBER", "MAX_SPATIAL_COORDINATE", "MAX_SPATIAL_PAYLOAD_BYTES"]) {
  assert(`Python/Rust mirror spatial boundary ${name}`, pythonSpatial.includes(name) && rust.includes(name));
}
assert("malformed spatial remains semantic-project degradable", pythonSpatialTests.includes("semantic") && pythonSpatialTests.includes("unavailable") && rustTests.includes("spatial_unavailable"));

assert("R1-04 adds no runtime dependency", packageJson.dependencies?.konva === "10.3.0" && packageJson.dependencies?.["react-konva"] === "19.2.5" && packageJson.dependencies?.echarts === "6.1.0");
assert("no competing canvas or chart framework was added", !["react-flow", "reactflow", "pixi.js", "three", "chart.js", "recharts"].some((name) => JSON.stringify(packageJson.dependencies ?? {}).toLowerCase().includes(name)));
assert("chunk warning limit remains visible", !vite.includes("chunkSizeWarningLimit"));
assert("frontend does not parse raw PRJ or result binaries", !results.includes("readFile") && !visualWorkspace.includes("readFile") && !assistantPanel.includes("readFile"));
assert("frontend cannot directly write PRJ", !results.includes("write_prj") && !assistantPatch.includes("write_prj") && !visualCanvas.includes("write_prj"));
assert("R1-04 Chinese and English result text exists", zh.includes("resultsWorkspace") && en.includes("resultsWorkspace"));
assert("R1-04 Chinese and English receipt text exists", zh.includes('"receipt"') && en.includes('"receipt"'));
assert("R1-04 behavior tests exist", fs.existsSync(path.join(root, "src/app/evidence-lineage.test.ts")) && fs.existsSync(path.join(root, "src/app/assistant-context.test.ts")) && fs.existsSync(path.join(root, "src/components/workbench/results/MultiZoneResultChart.test.ts")));
assert("R1-04 architecture facts exist", fs.existsSync(path.join(root, "docs/adr/ADR-020-bind-results-evidence-and-ai-context.md")) && fs.existsSync(path.join(root, "docs/architecture/results-evidence-ai-experience.md")));
assert("R1-04 task log exists", fs.existsSync(path.join(root, "docs/development/task-log/records/r1-04-results-evidence-ai-experience.md")));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`R1-04 results, evidence and AI contract passed: ${checks} assertions.`);
