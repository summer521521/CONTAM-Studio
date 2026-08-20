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
const styles = read("src/styles/features/geometry.css");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const runtime = read("src/app/runtime/useGeometryWorkbench.ts");
const persistenceTests = read("src/app/runtime/useGeometryWorkbench-persistence.test.tsx");
const taskLog = read("docs/development/task-log/records/geometry-workbench-user-modeling-closure.md");
const index = read("docs/development/task-log/index.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("workbench exposes one compact draft lifecycle status cluster", workbench.includes("geometry-deck-status-cluster") && workbench.includes("geometry-deck-draft-status"));
assert("teaching geometry is visibly distinguished from an ordinary Studio draft", workbench.includes("controller.teachingExample") && workbench.includes("geometry.editor.footer.teaching"));
assert("draft status discloses that the original PRJ is not written", workbench.includes("geometry.deck.draftStatus") && workbench.includes("geometry.deck.draftStatusDetail"));
assert("export success gives the next safe run step", workbench.includes("geometry.editor.semanticExport.nextStep") && zh.geometry.editor.semanticExport.nextStep.includes("打开项目") && en.geometry.editor.semanticExport.nextStep.includes("Open this copy"));
assert("lifecycle status stays compact at narrow widths", styles.includes(".geometry-deck-draft-status") && styles.includes("max-width: 150px") && styles.includes("display: none"));
assert("export remains gated by exact persisted geometry and semantic hashes", runtime.includes("semantic_authoring_export_persistence_pending") && runtime.includes("persistence.geometryHash === history.geometry_hash.toLowerCase()") && runtime.includes("persistence.semanticDraftHash === expectedSemanticHash"));
assert("restore regression binds the next save to the restored document revision", persistenceTests.includes("restores geometry and semantic authoring together") && persistenceTests.includes("expect(expectedRevision).toBe(7)") && persistenceTests.includes("documentRevision).toBe(8"));
assert("one descriptive task log and matrix row own this target", taskLog.includes("task_id: geometry-workbench-user-modeling-closure") && index.includes("Geometry Workbench User Modeling Closure") && matrix.capabilities.filter((item) => item.id === "geometry-workbench-user-modeling-closure").length === 1);
assert("Full verification includes the closure contract", verify.includes("test-geometry-user-modeling-closure-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Geometry Workbench User Modeling Closure contract passed: ${checks} assertions.`);
