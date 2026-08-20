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

const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const qualityHarness = read("src/components/workbench/geometry/GeometryQualityHarness.tsx");
const app = read("src/app/App.tsx");
const projectPage = read("src/components/workbench/pages/ProjectPage.tsx");
const destination = read("src/components/workbench/DestinationContent.tsx");
const runtime = read("src/app/runtime/WorkbenchRuntime.tsx");
const visionPanel = read("src/components/workbench/assistant/GeometryVisionDraftPanel.tsx");
const geometryCss = read("src/styles/features/geometry.css");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const taskLog = read("docs/development/task-log/records/spatial-command-deck.md");
const imagePath = path.join(root, "src/assets/ai-plan-source-demo.jpg");

for (const className of [
  "geometry-deck-commandbar",
  "geometry-deck-navigator",
  "geometry-tool-dock",
  "geometry-deck-inspector",
  "geometry-ai-draft-dialog",
  "geometry-deck-status",
]) {
  assert(`${className} is rendered and styled`, workbench.includes(className) && geometryCss.includes(`.${className}`));
}

assert("project mode is an immersive canvas", destination.includes("is-immersive-project") && geometryCss.includes("editor-surface.is-immersive-project"));
assert("project, run, and results navigation stay on the shared runtime route", workbench.includes('onNavigate("run")') && workbench.includes('onNavigate("results")'));
assert("themes moved into the overflow menu", workbench.includes("geometry-deck-overflow") && workbench.includes("GEOMETRY_THEMES.map"));
assert("no standalone theme floating panel is rendered", !workbench.includes("geometry-panel-theme-picker") && !workbench.includes('t("geometry.editor.panels.theme")'));
assert("all existing geometry tools remain available", ["select", "pan", "wall", "zone", "door", "window", "flow_path", "dimension"].every((tool) => workbench.includes(`id: "${tool}"`)));
assert("AI draft preview is a distinct non-applied overlay", canvas.includes("aiDraftPreview") && canvas.includes("dash={[220, 120]"));
assert("AI draft comparison is reversible", workbench.includes("aiDraftGenerated") && workbench.includes("setAiDraftVisible((value) => !value)"));
assert("image attachments remain on the existing attachment state path", runtime.includes("attachmentState") && destination.includes("onAttachmentImport") && projectPage.includes("onAttachmentSelect"));
assert("production AI generation is gated by selected image, metric geometry, and Codex Luna readiness", visionPanel.includes("image?.selected_by_user === true") && visionPanel.includes("codexVisionReady") && runtime.includes("useGeometryVisionDraft(projectState, geometryWorkbench)"));
assert("Codex Luna draft remains a confirmable non-applied suggestion", workbench.includes("geometryAi.confirm()") && workbench.includes("geometryAi.status !== \"ready\""));
assert("the component contains no embedded credential", !workbench.includes("sk-"));
assert("the visual fixture remains development-only", app.includes("import.meta.env.DEV") && app.includes("geometry-quality") && qualityHarness.includes("qualityAiDemo"));
assert("the generated plan asset is bounded", fs.existsSync(imagePath) && fs.statSync(imagePath).size < 500_000);
assert("Chinese command-deck copy is complete", Boolean(zh.geometry?.deck?.ai?.boundary) && Boolean(zh.geometry?.deck?.modes?.studio));
assert("English command-deck copy is complete", Boolean(en.geometry?.deck?.ai?.boundary) && Boolean(en.geometry?.deck?.modes?.studio));
assert("responsive and accessibility modes are explicit", geometryCss.includes("@media (max-width: 900px)") && geometryCss.includes("@media (forced-colors: active)") && geometryCss.includes("@media (prefers-reduced-motion: reduce)"));
assert("task log is singular and current", taskLog.includes("task_id: spatial-command-deck") && /status: (in_progress|completed)/.test(taskLog));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Spatial Command Deck contract passed: ${checks} assertions.`);
