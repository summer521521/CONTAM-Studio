import { describe, expect, it } from "vitest";
import type { SemanticSnapshot } from "./semantic-state";
import {
  DEFAULT_VISUAL_LAYERS,
  SPATIAL_SCHEMA_VERSION,
  VISUAL_MAX_SCALE,
  VISUAL_MIN_SCALE,
  activeSpatialLevel,
  buildSpatialBindingIndex,
  buildTopologyLayout,
  clampVisualScale,
  classifySpatialIconType,
  fitViewport,
  iconVisible,
  projectVisualSelection,
  resetVisualContext,
  spatialBoundsForIcons,
  wallSegments,
  zoomViewportAtPointer,
  type SpatialIcon,
  type SpatialProjection,
} from "./spatial-model";

function icon(overrides: Partial<SpatialIcon> = {}): SpatialIcon {
  return {
    id: "icon-1",
    icon_type: 5,
    kind: "zone",
    column: 10,
    row: 20,
    object_number: 1,
    binding: { kind: "zone", semantic_id: "zone-1", status: "bound", reason: null },
    evidence: { source_line: 70 },
    ...overrides,
  };
}

function projection(): SpatialProjection {
  const icons = [icon()];
  return {
    schema_version: SPATIAL_SCHEMA_VERSION,
    status: "available",
    identity_sha256: "a".repeat(64),
    source_sha256: "b".repeat(64),
    revision_id: "revision-1",
    levels: [{
      level_number: 1,
      name: "One",
      reference_height: 0,
      delta_height: 3,
      reference_height_unit: 0,
      delta_height_unit: 0,
      bounds: spatialBoundsForIcons(icons),
      icons,
    }],
    warnings: [],
    unavailable_reason: null,
  };
}

function semanticSnapshot(): SemanticSnapshot {
  return {
    result_type: "semantic_project_snapshot",
    source_sha256: "b".repeat(64),
    identity_sha256: "a".repeat(64),
    revision_state: "baseline_editable",
    project: { object_id: "project-1", object_kind: "Project" },
    levels: [],
    zones: [
      { object_id: "zone-2", object_kind: "Zone", contam_number: 2, name: "Two", fields: { level_number: 2 } },
      { object_id: "zone-1", object_kind: "Zone", contam_number: 1, name: "One", fields: { level_number: 1 } },
    ],
    flow_paths: [
      {
        object_id: "path-2",
        object_kind: "FlowPath",
        contam_number: 2,
        from_endpoint: { category: "zone", contam_number: 1 },
        to_endpoint: { category: "zone", contam_number: 2 },
        flow_element_id: "element-2",
        direction: 1,
        multiplier: 0.5,
      },
      {
        object_id: "path-1",
        object_kind: "FlowPath",
        contam_number: 1,
        from_endpoint: { category: "outdoor", contam_number: null },
        to_endpoint: { category: "zone", contam_number: 1 },
        flow_element_id: "element-1",
        direction: 0,
        multiplier: 1,
      },
    ],
    schedules: [],
    species: [],
    sources: [],
    sections: [],
    read_only_reason: null,
    spatial_projection: projection(),
  };
}

describe("spatial model pure transformations", () => {
  it("maps only verified icon constants and preserves unknown types", () => {
    expect([1, 2, 3, 4].map(classifySpatialIconType)).toEqual(["flow_path", "flow_path", "flow_path", "flow_path"]);
    expect([5, 6, 7].map(classifySpatialIconType)).toEqual(["zone", "zone", "zone"]);
    expect(classifySpatialIconType(11)).toBe("wall");
    expect(classifySpatialIconType(23)).toBe("opening");
    expect(classifySpatialIconType(28)).toBe("fan");
    expect(classifySpatialIconType(42)).toBe("note");
    expect(classifySpatialIconType(162)).toBe("unknown");
  });

  it("expresses the verified wall direction combinations", () => {
    expect(wallSegments(11)).toHaveLength(2);
    expect(wallSegments(12)).toHaveLength(2);
    expect(wallSegments(18)).toHaveLength(3);
    expect(wallSegments(22)).toHaveLength(4);
    expect(wallSegments(13)).toEqual([]);
  });

  it("computes bounds and fit-to-content without physical units", () => {
    const bounds = spatialBoundsForIcons([
      icon({ column: -4, row: 7 }),
      icon({ id: "icon-2", column: 12, row: 19 }),
    ]);
    expect(bounds).toEqual({ min_column: -4, max_column: 12, min_row: 7, max_row: 19 });
    const viewport = fitViewport(bounds, 800, 600);
    expect(viewport.scale).toBeGreaterThanOrEqual(VISUAL_MIN_SCALE);
    expect(viewport.scale).toBeLessThanOrEqual(VISUAL_MAX_SCALE);
    expect(Number.isFinite(viewport.x)).toBe(true);
    expect(Number.isFinite(viewport.y)).toBe(true);
  });

  it("zooms around the pointer and clamps scale", () => {
    expect(clampVisualScale(0.001)).toBe(VISUAL_MIN_SCALE);
    expect(clampVisualScale(100)).toBe(VISUAL_MAX_SCALE);
    const before = { x: 20, y: 30, scale: 1 };
    const pointer = { x: 200, y: 180 };
    const after = zoomViewportAtPointer(before, pointer, 2);
    expect((pointer.x - before.x) / before.scale).toBe((pointer.x - after.x) / after.scale);
    expect((pointer.y - before.y) / before.scale).toBe((pointer.y - after.y) / after.scale);
  });

  it("applies layer visibility without changing model facts", () => {
    expect(iconVisible(icon({ icon_type: 14, kind: "wall" }), DEFAULT_VISUAL_LAYERS)).toBe(true);
    expect(iconVisible(icon({ icon_type: 14, kind: "wall" }), { ...DEFAULT_VISUAL_LAYERS, walls: false })).toBe(false);
    expect(iconVisible(icon({ icon_type: 250, kind: "unknown" }), { ...DEFAULT_VISUAL_LAYERS, otherIcons: false })).toBe(false);
  });

  it("builds a linear binding index and projects current semantic selection", () => {
    const model = projection();
    const index = buildSpatialBindingIndex(model.levels);
    expect(index.get("zone-1")?.id).toBe("icon-1");
    expect(projectVisualSelection("zone-1", model)).toEqual({ semanticId: "zone-1", iconId: "icon-1", levelNumber: 1 });
    expect(projectVisualSelection("path-missing", model)).toEqual({ semanticId: "path-missing", iconId: null, levelNumber: null });
  });

  it("resets active level and selection when identity or revision changes", () => {
    const model = projection();
    expect(resetVisualContext({ identity: null, revision: null }, model)).toEqual({ changed: true, activeLevel: 1, selection: null });
    expect(resetVisualContext({ identity: model.identity_sha256, revision: model.revision_id }, model).changed).toBe(false);
    expect(activeSpatialLevel(model, 99)?.level_number).toBe(1);
  });

  it("creates a stable level-banded topology with boundary and cross-level facts", () => {
    const snapshot = semanticSnapshot();
    const first = buildTopologyLayout(snapshot);
    const second = buildTopologyLayout({ ...snapshot, zones: [...snapshot.zones].reverse(), flow_paths: [...snapshot.flow_paths].reverse() });

    expect(first).toEqual(second);
    expect(first.nodes.filter((node) => node.kind === "zone").map((node) => node.contamNumber)).toEqual([1, 2]);
    expect(first.nodes.some((node) => node.kind === "boundary" && node.label === "outdoor")).toBe(true);
    expect(first.edges.find((edge) => edge.contamNumber === 2)?.crossLevel).toBe(true);
    expect(first.edges.find((edge) => edge.contamNumber === 1)?.fromNodeId).toContain("boundary:outdoor");
  });

  it("keeps unresolved semantic endpoints explicit instead of inventing zones", () => {
    const snapshot = semanticSnapshot();
    snapshot.flow_paths.push({
      object_id: "path-3",
      contam_number: 3,
      from_endpoint: { category: "zone", contam_number: 999 },
      to_endpoint: { category: "zone", contam_number: 1 },
      direction: 0,
      multiplier: 1,
    });
    const layout = buildTopologyLayout(snapshot);
    expect(layout.nodes).toContainEqual(expect.objectContaining({ id: "zone:999", kind: "unresolved", contamNumber: 999 }));
  });

  it("indexes large fixtures without nested binding scans", () => {
    const icons = Array.from({ length: 5_000 }, (_, index) => icon({
      id: `icon-${index}`,
      object_number: index,
      binding: { kind: "zone", semantic_id: `zone-${index}`, status: "bound", reason: null },
    }));
    const model = projection();
    model.levels[0].icons = icons;
    const index = buildSpatialBindingIndex(model.levels);
    expect(index.size).toBe(5_000);
    expect(index.get("zone-4999")?.id).toBe("icon-4999");
  });

  it("lays out a large semantic topology with stable map-based endpoint binding", () => {
    const size = 5_000;
    const snapshot = semanticSnapshot();
    snapshot.zones = Array.from({ length: size }, (_, index) => ({
      object_id: `zone-${index + 1}`,
      object_kind: "Zone",
      contam_number: index + 1,
      name: `Zone ${index + 1}`,
      level_number: (index % 5) + 1,
    }));
    snapshot.flow_paths = Array.from({ length: size - 1 }, (_, index) => ({
      object_id: `path-${index + 1}`,
      object_kind: "FlowPath",
      contam_number: index + 1,
      from_endpoint: { category: "zone", contam_number: index + 1 },
      to_endpoint: { category: "zone", contam_number: index + 2 },
      direction: 1,
      multiplier: 1,
    }));

    const layout = buildTopologyLayout(snapshot);
    expect(layout.nodes).toHaveLength(size);
    expect(layout.edges).toHaveLength(size - 1);
    expect(layout.edges.at(-1)).toEqual(expect.objectContaining({ fromNodeId: `zone:${size - 1}`, toNodeId: `zone:${size}` }));
  });
});
