import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
let checks = 0;
const assert = (label, condition) => { checks += 1; if (!condition) failures.push(label); };

const shell = read("src/app/runtime/WorkbenchRuntime.tsx");
const sidebar = read("src/components/workbench/ContextSidebar.tsx");
const assistant = read("src/components/workbench/CodexAssistantPanel.tsx");
const visionPanel = read("src/components/workbench/assistant/GeometryVisionDraftPanel.tsx");
const geometry = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const project = read("src/components/workbench/pages/ProjectPage.tsx");
const css = read("src/styles/features/assistant.css");
const taskLog = read("docs/development/task-log/records/geometry-assistant-vision-integration.md");

assert("vision controller is owned once by the runtime", shell.includes("useGeometryVisionDraft(projectState, geometryWorkbench)") && !geometry.includes("useGeometryVisionDraft(projectState"));
assert("the same controller reaches both assistant and canvas", shell.includes("geometryVisionDraft") && sidebar.includes("geometryVisionDraft") && project.includes("geometryVisionDraft={geometryVisionDraft}"));
assert("assistant owns image selection and bounded prompt", visionPanel.includes("onAttachmentSelect") && visionPanel.includes("maxLength={600}") && visionPanel.includes("controller.generate"));
assert("Codex Luna image capability gates generation", assistant.includes("gpt-5.6-luna") && assistant.includes('input_modalities.includes("image")') && visionPanel.includes("codexVisionReady"));
assert("confirmation and discard remain explicit", visionPanel.includes("controller.confirm()") && visionPanel.includes("controller.dismiss") && visionPanel.includes("controller.cancel"));
assert("canvas overlay is derived from ready state only", geometry.includes('geometryAi.status === "ready" ? geometryAi.canvasPreview : null') && geometry.includes("qualityAiDemo && aiDraftOpen"));
assert("production AI entry opens the existing assistant surface", geometry.includes("onOpenAssistant()") && assistant.includes("GeometryVisionDraftPanel"));
assert("the assistant does not expose paths or pixels", !visionPanel.includes("imagePath") && !visionPanel.includes("imageBytes") && !visionPanel.includes("file://"));
assert("styles keep the integrated card compact", css.includes(".assistant-geometry-draft") && css.includes(".assistant-geometry-summary"));
assert("the descriptive task log records independent evidence", taskLog.includes("automated_verified") && taskLog.includes("real_provider=not_run") && taskLog.includes("working_tree_only"));
assert("Full verification includes this contract", read("scripts/verify.ps1").includes("Geometry Assistant Vision Integration contract"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Geometry Assistant Vision Integration contract passed: ${checks} assertions.`);
