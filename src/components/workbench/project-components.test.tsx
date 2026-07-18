import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import type { ProjectInspection, ProjectState } from "../../app/project-state";
import { zoneSelectionKey } from "../../app/project-state";
import { BottomPanel } from "./BottomPanel";
import { ContextSidebar } from "./ContextSidebar";
import { ProjectSidebar } from "./ProjectSidebar";

const project: ProjectInspection = {
  schema_version: "1.0",
  reader_mode: "strict_contam_3_4_simple_zone_v1",
  source_path: "F:\\models\\real.prj",
  source_sha256: "a".repeat(64),
  source_size_bytes: 200,
  source_unchanged: true,
  header_version: "3.4.0.4",
  header_variant: 0,
  declared_zone_count: 2,
  zones: [
    {
      contam_number: 1,
      name: "One",
      flags: 3,
      level_number: 1,
      relative_height: 0,
      volume_m3: 600,
      source_line_number: 243,
    },
    {
      contam_number: 2,
      name: "Two",
      flags: 3,
      level_number: 1,
      relative_height: 0,
      volume_m3: 360,
      source_line_number: 244,
    },
  ],
  first_zone: null,
  diagnostics: [],
};

const state: ProjectState = {
  status: "loaded",
  activeSequence: null,
  activeRequestId: null,
  project,
  selectedZoneKey: zoneSelectionKey(project, project.zones[0]),
  issue: null,
};

beforeAll(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("real project components", () => {
  it("renders all Zones and their CONTAM numbers", () => {
    const markup = renderToStaticMarkup(
      <ProjectSidebar
        projectState={state}
        selectedObject="navigation.classroom"
        selectedZoneKey={state.selectedZoneKey}
        onSelectObject={() => undefined}
        onSelectZone={() => undefined}
        onCollapse={() => undefined}
      />,
    );
    expect(markup).toContain("real.prj");
    expect(markup).toContain("One（编号 1）");
    expect(markup).toContain("Two（编号 2）");
    expect(markup).toContain("真实数据 · 只读预览");
    expect(markup).not.toContain("F:\\models\\real.prj");
  });

  it("renders an explicit empty state for zero Zones", () => {
    const emptyProject = { ...project, declared_zone_count: 0, zones: [] };
    const markup = renderToStaticMarkup(
      <ProjectSidebar
        projectState={{ ...state, project: emptyProject, selectedZoneKey: null }}
        selectedObject="navigation.classroom"
        selectedZoneKey={null}
        onSelectObject={() => undefined}
        onSelectZone={() => undefined}
        onCollapse={() => undefined}
      />,
    );
    expect(markup).toContain("该受支持项目没有Zone");
  });

  it("renders real Zone properties and the read-only boundary", () => {
    const markup = renderToStaticMarkup(
      <ContextSidebar
        activeTab="inspector"
        project={project}
        selectedZone={project.zones[0]}
        selectedObject="navigation.classroom"
        onTabChange={() => undefined}
        onCollapse={() => undefined}
      />,
    );
    expect(markup).toContain("CONTAM编号");
    expect(markup).toContain("600 m³");
    expect(markup).toContain("strict_contam_3_4_simple_zone_v1");
    expect(markup).toContain("尚不支持编辑或保存");
  });

  it("maps a stable error code without exposing a traceback", () => {
    const markup = renderToStaticMarkup(
      <BottomPanel
        activeTab="problems"
        projectState={{
          ...state,
          status: "unsupported",
          issue: {
            code: "unsupported_prj_version",
            message: "Traceback: secret",
            source_line_number: 1,
            context: { header_version: "3.4.0.8" },
          },
        }}
        onTabChange={() => undefined}
        onCollapse={() => undefined}
      />,
    );
    expect(markup).toContain("PRJ文件头版本不受支持");
    expect(markup).toContain("unsupported_prj_version");
    expect(markup).not.toContain("Traceback");
  });

  it("provides key English project and error text", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("project.readOnlyPreview")).toBe("Real data · read-only preview");
    expect(i18n.t("errors.codes.python_process_timeout")).toBe("Python reader timed out");
    await i18n.changeLanguage("zh-CN");
  });
});
