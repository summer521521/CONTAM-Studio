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

const patch = read("python/src/contam_studio_core/semantic_patch.py");
const pythonTests = read("python/tests/test_semantic_patch.py");
const rust = read("src-tauri/src/zone_bridge.rs");
const rustTests = read("src-tauri/src/zone_bridge/tests.rs");
const semanticState = read("src/app/semantic-state.ts");
const ai = read("src-tauri/src/codex_app_server.rs");
const architecture = read("docs/architecture/geometry-workbench.md");
const adr = read("docs/adr/ADR-022-limit-first-prj-geometry-write-to-existing-icon-position.md");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const taskLog = read("docs/development/task-log/records/verified-sketchpad-icon-round-trip.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("column is an explicit byte-local operation", patch.includes('"set_spatial_icon_column": ("spatial_icon", 1, "column", "grid_cell")'));
assert("row is an explicit byte-local operation", patch.includes('"set_spatial_icon_row": ("spatial_icon", 2, "row", "grid_cell")'));
assert("SketchPad extents come from rows cols evidence", patch.includes("_SKETCHPAD_HEADER") && patch.includes("_sketchpad_extents"));
assert("coordinate values are canonical non-negative integers", patch.includes('re.fullmatch(r"(?:0|[1-9]\\d*)", value)'));
assert("coordinate bounds fail closed", patch.includes("spatial_coordinate_out_of_bounds"));
assert("final cell collisions fail closed", patch.includes("spatial_icon_collision"));
assert("icon source records remain exact four-token evidence", patch.includes("len(tokens) != 4") && patch.includes("expected_tokens"));
assert("application replans and checks transaction integrity", patch.includes("expected = plan_zone_transaction") && patch.includes("patch_hash_mismatch"));
assert("application rereads and compares the spatial sequence", patch.includes("_verify_spatial_application") && patch.includes("spatial_round_trip_mismatch"));
assert("failed output verification removes only the new target", patch.includes("target.unlink()"));
assert("three official fixtures are exercised", ["demo1c.prj", "valThreeZonesWthCtm-UseApi.prj", "test_GetPrjInfo.prj"].every((name) => pythonTests.includes(name)));
assert("byte-local field order is regression tested", pythonTests.includes("uses_icon_column_row_order") && pythonTests.includes('["column", "row"]'));
assert("bounds collision and tamper guards are tested", ["spatial_icon_collision", "spatial_coordinate_out_of_bounds", "patch_hash_mismatch"].every((code) => pythonTests.includes(code)));
assert("Python bridge plan and apply are exercised", pythonTests.includes("bridge_applies_verified_sketchpad_icon_move_to_new_copy"));
assert("Rust accepts the two verified fields", rust.includes('"set_spatial_icon_column"') && rust.includes('"set_spatial_icon_row"'));
assert("Rust tests reject create delete type and object-number expansion", ["create_spatial_icon", "delete_spatial_icon", "set_spatial_icon_type", "set_spatial_object_number"].every((operation) => rustTests.includes(operation)));
assert("frontend Patch type can carry the two fields", semanticState.includes('"set_spatial_icon_column"') && semanticState.includes('"set_spatial_icon_row"'));
assert("ordinary AI semantic Patch cannot emit coordinate writes", !ai.includes('"set_spatial_icon_column"') && !ai.includes('"set_spatial_icon_row"'));
assert("architecture keeps metric geometry separate", architecture.includes("这不是 Studio metric 几何的 PRJ round trip"));
assert("ADR explicitly forbids adding and deleting icons", adr.includes("不新增或删除图标") && adr.includes("不修改 Level 数量"));
assert("initiative exposes only the reviewed existing-icon subset", initiative.includes("候选移动可进入 Diff 审查") && initiative.includes("任意拖拽、新增/删除图标仍未开放"));
assert("task log records all three evidence sources", ["NISTIR 7049", "OpenStudio", "三套官方 fixture"].every((source) => taskLog.includes(source)));
assert("capability matrix tracks the descriptive task", matrix.capabilities.some((item) => item.id === "verified-sketchpad-icon-round-trip"));
assert("Full verification includes this contract", verify.includes("test-verified-sketchpad-icon-round-trip-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Verified SketchPad Icon Round Trip contract passed: ${checks} assertions.`);
