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

const schema = json("contracts/geometry/geometry-edit-command-v1.schema.json");
const model = read("src/app/geometry/geometry-model.ts");
const commands = read("src/app/geometry/geometry-commands.ts");
const planner = read("src/app/geometry/geometry-zone-topology.ts");
const plannerTests = read("src/app/geometry/geometry-zone-topology.test.ts");
const domainTests = read("src/app/geometry/geometry-domain.test.ts");
const canvas = read("src/components/workbench/geometry/GeometryCanvasKonva.tsx");
const workbench = read("src/components/workbench/geometry/GeometryWorkbench.tsx");
const controller = read("src/app/runtime/useGeometryWorkbench.ts");
const issues = read("src/components/workbench/geometry/geometry-interaction-issues.ts");
const aiDraft = read("src/app/geometry/geometry-ai-draft.ts");
const rustVision = read("src-tauri/src/codex_app_server/geometry_vision.rs");
const zh = json("src/i18n/locales/zh-CN.json");
const en = json("src/i18n/locales/en.json");
const initiative = read("docs/initiatives/geometry-workbench/README.md");
const architecture = read("docs/architecture/geometry-workbench.md");
const taskLog = read("docs/development/task-log/records/zone-boundaries-and-room-partitioning.md");
const matrix = json("docs/capability-status-matrix.json");
const verify = read("scripts/verify.ps1");

assert("schema governs partition and merge commands", schema.properties.operation.enum.includes("partition_zone_region") && schema.properties.operation.enum.includes("merge_zone_regions"));
assert("TypeScript command union governs partition and merge", model.includes('| "partition_zone_region"') && model.includes('| "merge_zone_regions"'));
assert("partition parameters are closed", commands.includes('["level_id", "source_region_id", "source_outer_vertex_ids", "new_zone_region"]'));
assert("merge parameters are closed", commands.includes('["level_id", "kept_region_id", "removed_region_id", "merged_outer_vertex_ids", "removed_wall_ids"]'));
assert("partition verifies wall-backed exact boundaries", commands.includes("zoneBoundaryHasWalls(level, sourceOuterVertexIds)") && commands.includes("partitionBoundariesMatch("));
assert("merge verifies the exact shared wall set", commands.includes("sameStringSet(sharedWallIds, removedWallIds)") && commands.includes("mergeBoundariesMatch("));
assert("merge refuses shared openings and removed FlowPath endpoints", commands.includes("geometry_command_zone_merge_boundary_has_opening") && commands.includes("geometry_command_zone_flow_path_conflict"));
assert("Zone mutations reconcile opening adjacency", (commands.match(/return reconcileOpeningAdjacency\(level\);/g) ?? []).length >= 3);

assert("planner owns bounded half-edge budgets", planner.includes("MAX_ZONE_FACE_EDGES = 4_096") && planner.includes("MAX_ZONE_TOPOLOGY_HALF_EDGES = 200_000"));
assert("planner uses exact integer cross products and area", planner.includes("function cross(") && planner.includes("BigInt(second.x - first.x)") && planner.includes("function areaTwice("));
assert("planner excludes the unbounded face", planner.includes("if (areaTwice(rawVertices) <= 0n) continue"));
assert("planner canonicalizes deterministic counter-clockwise loops", planner.includes("normalizedCounterClockwise") && planner.includes("rotateCanonical"));
assert("planner context is tied to stable snapshot references", planner.includes("context.vertices === level.vertices") && planner.includes("context.walls === level.walls") && planner.includes("context.zoneRegions === level.zone_regions"));
assert("point selection rejects wall boundaries and ambiguous faces", planner.includes("geometry_zone_point_on_boundary") && planner.includes("geometry_zone_face_ambiguous"));
assert("partition requires exactly two area-preserving faces", planner.includes("contained.length !== 2 || containedArea !== sourceArea"));
assert("partition chooses the target side from the explicit click", planner.includes("sameIdSet(face.vertexIds, clickedFace.vertexIds)"));
assert("partition preview protects anchored FlowPath adjacency", planner.includes("partitionChangesAnchoredOpening") && planner.includes("geometry_zone_partition_flow_path_conflict"));
assert("merge requires one connected shared boundary", planner.includes("connectedSharedBoundary(sharedEdges)") && planner.includes("geometry_zone_merge_not_adjacent"));
assert("merge preview protects openings and semantic FlowPath endpoints", planner.includes("geometry_zone_merge_boundary_has_opening") && planner.includes("geometry_zone_merge_flow_path_conflict"));

assert("planner tests cover deterministic closed face creation", plannerTests.includes("extracts deterministic bounded faces") && plannerTests.includes("creates a Zone from an interior click"));
assert("planner tests cover explicit binary partition", plannerTests.includes("partitions one existing Zone into two explicitly bound semantic rooms"));
assert("planner tests cover partition FlowPath protection", plannerTests.includes("before an anchored FlowPath adjacency can change"));
assert("planner tests cover controlled merge dependencies", plannerTests.includes("divider has an opening") && plannerTests.includes("removed Zone owns a FlowPath endpoint"));
assert("domain tests cover atomic partition adjacency reconciliation", domainTests.includes("partitions one Zone atomically") && domainTests.includes("window-right"));
assert("domain tests cover atomic merge and semantic release", domainTests.includes("releases one semantic binding") && domainTests.includes("removed_wall_ids"));
assert("domain tests reject tampered merge payloads", domainTests.includes("rejects merge payload tampering"));

assert("canvas memoizes one Zone topology context per level snapshot", canvas.includes("useMemo(() => createZoneTopologyContext(level), [level])"));
assert("canvas keeps Zone topology preview local", canvas.includes("zoneTopologyPreview") && canvas.includes("setZoneTopologyPreview"));
assert("canvas commits only planner-produced Zone operations", canvas.includes("planZonePartitionWithContext") && canvas.includes("planZoneMergeWithContext") && canvas.includes("onCommitOperations([plan.operation]"));
assert("canvas clears transient topology state on Escape", canvas.includes("setZoneTopologyPreview(null)") && canvas.includes('event.key === "Escape"'));
assert("controller retains one tool and one command history", controller.includes('| "partition"') && controller.includes('| "merge"') && controller.includes("commitOperations"));
assert("partition and merge stay contextual instead of growing the global dock", !workbench.includes('{ id: "partition"') && !workbench.includes('{ id: "merge"'));
assert("navigator exposes every active-Level semantic Zone through one compact selector", workbench.includes("activeZoneEntries.map") && workbench.includes("zoneEditor.semanticPlaceholder"));
assert("inspector exposes complete unbound Zone target selection", workbench.includes("unboundZoneOptions") && workbench.includes("zoneEditor.targetPlaceholder"));
assert("inspector makes retained merge identity explicit", workbench.includes("toggleZoneMerge") && workbench.includes("zoneEditor.mergeActive"));
assert("interaction issues distinguish missing target and source", issues.includes("geometry_zone_target_missing") && issues.includes("geometry_zone_partition_source_missing"));

assert("Chinese Zone topology copy is complete", Boolean(zh.geometry.editor.zoneEditor?.targetLabel) && Boolean(zh.geometry.editor.issue?.zoneFlowPathConflict) && Boolean(zh.geometry.editor.issue?.zonePartitionSourceMissing));
assert("English Zone topology copy is complete", Boolean(en.geometry.editor.zoneEditor?.targetLabel) && Boolean(en.geometry.editor.issue?.zoneFlowPathConflict) && Boolean(en.geometry.editor.issue?.zonePartitionSourceMissing));
assert("AI geometry drafts cannot partition or merge rooms", !aiDraft.includes("partition_zone_region") && !aiDraft.includes("merge_zone_regions"));
assert("Codex vision schema cannot partition or merge rooms", !rustVision.includes("partition_zone_region") && !rustVision.includes("merge_zone_regions"));
assert("initiative documents closed-wall Zone semantics", initiative.includes("封闭墙环 Zone") && initiative.includes("partition_zone_region") && initiative.includes("merge_zone_regions"));
assert("architecture documents exact face extraction and FlowPath protection", architecture.includes("geometry-zone-topology.ts") && architecture.includes("有向半边") && architecture.includes("FlowPath 端点"));
assert("one current task log records this delivery", taskLog.includes("task_id: zone-boundaries-and-room-partitioning") && /status: (in_progress|completed)/.test(taskLog));
assert("capability matrix has one current entry", matrix.capabilities.filter((item) => item.id === "zone-boundaries-and-room-partitioning").length === 1);
assert("contract is included in unified verification", verify.includes("test-zone-boundaries-room-partitioning-contract.mjs"));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Zone Boundaries and Room Partitioning contract passed: ${checks} assertions.`);
