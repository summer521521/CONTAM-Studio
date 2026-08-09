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

const initiative = read("docs/initiatives/R1-visual-workbench/README.md");
const agents = read("AGENTS.md");
const matrix = JSON.parse(read("docs/capability-status-matrix.json"));
const app = read("src/app/App.tsx");
const runtime = read("src/app/runtime/WorkbenchRuntime.tsx");
const appStyles = read("src/styles/app.css");
const tokens = read("src/styles/tokens.css");
const topBar = read("src/components/workbench/TopBar.tsx");
const shell = read("src/components/workbench/WorkbenchShell.tsx");

for (const relativePath of [
  "scripts/lib/contam-temp-root.ps1",
  "scripts/tests/test-contam-temp-root.ps1",
  "src/components/workbench/DestinationContent.tsx",
  "src/components/workbench/WorkbenchPanels.tsx",
  "src/components/workbench/WorkbenchShell.tsx",
  "src/components/ui/Button.tsx",
  "src/components/ui/IconButton.tsx",
  "src/styles/foundation/reset.css",
  "src/styles/components/buttons.css",
  "src/styles/features/assistant.css",
]) {
  assert(`required R1-01 file exists: ${relativePath}`, fs.existsSync(path.join(root, relativePath)));
}

assert("R1 initiative is the current source of truth", initiative.includes("当前研发事实源"));
assert("historical roadmap is explicitly marked", read("docs/roadmap/phases.md").includes("历史归档"));
assert("historical execution plan is explicitly marked", read("docs/roadmap/next-development-execution-plan.md").includes("历史归档"));
assert("AGENTS forbids parallel phase numbering", agents.includes("禁止继续创建新的 Phase、QA、Batch"));
assert("R1-01 matrix row exists", matrix.capabilities.some((row) => row.id === "r1-01-foundation-reset"));
const r1 = matrix.capabilities.find((row) => row.id === "r1-01-foundation-reset");
assert(
  "R1-01 records local verification and remote GitHub CI as separate passed evidence",
  r1?.automated_verified === "passed" &&
    r1?.github_windows_ci === "passed" &&
    r1?.merged_to_main === "yes"
);
assert("R1-01 keeps GUI validation separate", r1?.manual_gui === "not_run" && r1?.user_validated === "not_run");

for (const layer of ["foundation", "shell", "components", "features", "compatibility"]) {
  assert(`CSS layer declared: ${layer}`, appStyles.includes(layer));
}
for (const imported of ["./foundation/reset.css", "./shell/workbench-shell.css", "./components/buttons.css", "./features/assistant.css", "./compatibility/workbench.css"]) {
  assert(`CSS layer import exists: ${imported}`, appStyles.includes(imported));
}
for (const token of ["--surface-app", "--text-default", "--border-subtle", "--interactive-primary", "--focus-ring", "--motion-duration-standard"]) {
  assert(`semantic token exists: ${token}`, tokens.includes(token));
}

assert("App delegates to the workbench runtime", app.includes("import { WorkbenchRuntime }") && app.includes("<WorkbenchRuntime"));
assert("Workbench runtime composes the workbench shell", runtime.includes("import { WorkbenchShell }") && runtime.includes("<WorkbenchShell"));
assert("App no longer owns panel JSX", !app.includes("<Group") && !app.includes("<ActivityBar") && !app.includes("<BottomPanel"));
assert("TopBar uses the shared Button primitive", topBar.includes("from \"../ui/Button\"") && topBar.includes("<Button"));
assert("WorkbenchShell uses the shared IconButton primitive", shell.includes("from \"../ui/IconButton\"") && shell.includes("<IconButton"));

const tempRootScript = read("scripts/lib/contam-temp-root.ps1");
assert("temp root supports RUNNER_TEMP", tempRootScript.includes("RUNNER_TEMP"));
assert("temp root has an explicit no-F fallback", tempRootScript.includes("[IO.Path]::GetTempPath()"));
assert("temp root exposes containment validation", tempRootScript.includes("Test-ContamPathWithinRoot"));

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`R1-01 foundation contract passed: ${checks} assertions.`);
