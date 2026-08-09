import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import { DEFAULT_VISUAL_PREFERENCES, SPATIAL_SCHEMA_VERSION, type SpatialProjection } from "../../../app/spatial-model";
import type { SemanticSnapshot } from "../../../app/semantic-state";
import { AccessibleObjectExplorer, VisualModelWorkspace, type ExplorerItem } from "./VisualModelWorkspace";

const projection: SpatialProjection = {
  schema_version: SPATIAL_SCHEMA_VERSION,
  status: "available",
  identity_sha256: "a".repeat(64),
  source_sha256: "b".repeat(64),
  revision_id: "revision-1",
  levels: [{
    level_number: 1,
    name: "First floor",
    reference_height: 0,
    delta_height: 3,
    reference_height_unit: 0,
    delta_height_unit: 0,
    bounds: { min_column: 4, max_column: 8, min_row: 3, max_row: 7 },
    icons: [{
      id: "icon-zone-1",
      icon_type: 5,
      kind: "zone",
      column: 6,
      row: 5,
      object_number: 1,
      binding: { kind: "zone", semantic_id: "zone-1", status: "bound", reason: null },
      evidence: { source_line: 42 },
    }],
  }],
  warnings: [],
  unavailable_reason: null,
};

const snapshot: SemanticSnapshot = {
  result_type: "semantic_project_snapshot",
  source_sha256: projection.source_sha256,
  identity_sha256: projection.identity_sha256,
  revision_state: "draft",
  project: { object_id: "project-1", object_kind: "project", name: "Fixture" },
  levels: [{ object_id: "level-1", object_kind: "level", level_number: 1, name: "First floor" }],
  zones: [{ object_id: "zone-1", object_kind: "zone", contam_number: 1, level_number: 1, name: "Classroom" }],
  flow_paths: [],
  schedules: [],
  species: [],
  sources: [],
  sections: [],
  spatial_projection: projection,
  read_only_reason: null,
};

beforeAll(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("R1-03 visual model workspace", () => {
  it("exposes native toolbar controls, scale evidence, and an accessible canvas region", () => {
    const markup = renderToStaticMarkup(
      <VisualModelWorkspace
        snapshot={snapshot}
        projection={projection}
        selectedSemanticObjectId="zone-1"
        preferences={DEFAULT_VISUAL_PREFERENCES}
        onSelectSemantic={() => undefined}
      />,
    );

    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain("SketchPad 示意");
    expect(markup).toContain("气流拓扑");
    expect(markup).toContain("示意布局，不代表按比例平面图。");
    expect(markup).toContain('class="visual-canvas-region" role="region"');
    expect(markup).not.toContain('role="application"');
    expect(markup).not.toContain('class="visual-model-workspace" tabindex=');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("First floor · 1");
    expect(markup).not.toContain("visual.");
  });

  it("keeps an unavailable spatial projection truthful and offers topology fallback", () => {
    const unavailable: SpatialProjection = {
      ...projection,
      status: "unavailable",
      levels: [],
      unavailable_reason: "spatial_section_missing",
    };
    const markup = renderToStaticMarkup(
      <VisualModelWorkspace
        snapshot={{ ...snapshot, spatial_projection: unavailable }}
        projection={unavailable}
        selectedSemanticObjectId={null}
        preferences={DEFAULT_VISUAL_PREFERENCES}
        onSelectSemantic={() => undefined}
      />,
    );

    expect(markup).toContain("当前项目没有可用的 SketchPad 投影");
    expect(markup).toContain("切换到气流拓扑");
    expect(markup).not.toContain("First floor");
  });

  it("provides a paged DOM object mirror with bound and unbound states", () => {
    const items: ExplorerItem[] = [
      { id: "zone-icon", kind: "zone", label: "Zone · #1", detail: "6, 5", semanticId: "zone-1" },
      { id: "unknown-icon", kind: "unknown", label: "未识别图标类型 162 · #1", detail: "4, 3", semanticId: null },
    ];
    const markup = renderToStaticMarkup(
      <AccessibleObjectExplorer
        items={items}
        selectedSemanticObjectId="zone-1"
        onSelect={() => undefined}
        onLocate={() => undefined}
      />,
    );

    expect(markup).toContain('type="search"');
    expect(markup).toContain('aria-label="可视化对象"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("未绑定语义对象");
    expect(markup).toContain("第 1 / 1 页");
  });
});
