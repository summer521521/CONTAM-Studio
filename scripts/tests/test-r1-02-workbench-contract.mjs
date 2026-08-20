import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", ".."));
const failures = [];
let checks = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function lineCount(content) {
  return content.split(/\r?\n/).length;
}

function assert(name, condition) {
  checks += 1;
  if (!condition) failures.push(name);
}

const app = read("src/app/App.tsx");
const runtime = read("src/app/runtime/WorkbenchRuntime.tsx");
const destination = read("src/components/workbench/DestinationContent.tsx");
const activity = read("src/components/workbench/ActivityBar.tsx");
const settings = read("src/components/workbench/pages/SettingsPage.tsx");
const run = read("src/components/workbench/pages/RunPage.tsx");
const state = read("src/app/workbench-state.ts");
const zh = read("src/i18n/locales/zh-CN.json");
const en = read("src/i18n/locales/en.json");
const vite = read("vite.config.ts");

assert("App is a small composition root", lineCount(app) <= 80 && app.includes("WorkbenchRuntime"));
assert("runtime stays within the reviewed responsibility budget", lineCount(runtime) <= 640 && runtime.includes("geometryVisionDraft"));
for (const hook of ["useWorkbenchLayout", "useStudioSettings", "useProjectPatchJourney", "useAssistantEvidenceJourney", "useHostStageEvents", "useCloseLifecycle"]) {
  assert(`runtime delegates to ${hook}`, runtime.includes(hook));
}

for (const destinationName of ["project", "run", "results", "studies", "settings"]) {
  assert(`destination boundary handles ${destinationName}`, destination.includes(`props.destination === "${destinationName}"`) || destination.includes(`${destinationName}:`));
}
for (const page of ["ResultsPage", "ResearchPage", "SettingsPage"]) {
  assert(`${page} has a lazy boundary`, destination.includes(`const ${page} = lazy(`));
}
assert("destination loading state is explicit", destination.includes("<Suspense") && destination.includes("<LoadingState"));
assert("destination errors are contained", destination.includes("<ErrorBoundary"));
assert("legacy page routers were removed", !fs.existsSync(path.join(root, "src/components/workbench/DestinationPage.tsx")) && !fs.existsSync(path.join(root, "src/components/workbench/WelcomePage.tsx")));

assert("activity navigation has no standalone search destination", !activity.includes('id: "search"'));
for (const destinationName of ["run", "results", "studies"]) {
  assert(`activity navigation exposes ${destinationName}`, activity.includes(`key: "${destinationName}"`));
}
assert("activity navigation exposes project", activity.includes('key: "projects"') && activity.includes('onNavigate("project")'));
assert("activity navigation exposes settings", activity.includes('onNavigate("settings")'));
assert("current activity uses aria-current", activity.includes("aria-current"));

for (const category of ["appearance", "ai", "tools", "privacy", "diagnostics"]) {
  assert(`settings category exists: ${category}`, settings.includes(`id: "${category}"`));
}
assert("provider not configured and connection failed remain distinct", settings.includes("providerNotConfigured") && settings.includes("providerConnectionFailed"));
assert("run journey separates solver and reader failures", run.includes("runState.status === \"error\"") && run.includes("readFailed") && run.includes("retryRead"));
assert("technical run evidence is disclosed", run.includes("<Disclosure") && run.includes("technical-detail-list"));

assert("workbench layout schema is v4", state.includes("version: 4") && state.includes("PREVIOUS_WORKBENCH_STORAGE_KEY") && state.includes("visualWorkspace"));
assert("layout reset preserves language and theme", state.includes("language: state.language") && state.includes("theme: state.theme"));
assert("main UI strings do not expose historical phase labels", !zh.includes("Phase 2C") && !zh.includes("Phase 4") && !en.includes("Phase 2C") && !en.includes("Phase 4"));
assert("Vite chunk warnings are not hidden", !vite.includes("chunkSizeWarningLimit"));

const compatibility = read("src/styles/compatibility/workbench.css");
assert("compatibility CSS is a narrow documented seam", lineCount(compatibility) <= 40);
for (const feature of ["project", "run", "results", "research", "settings", "assistant"]) {
  const css = read(`src/styles/features/${feature}.css`);
  assert(`feature CSS owns real rules: ${feature}`, lineCount(css) >= 20 && /\{[\s\S]*\}/.test(css));
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`R1-02 workbench contract passed: ${checks} assertions.`);
