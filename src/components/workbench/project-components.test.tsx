import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import type { ProjectInspection, ProjectState } from "../../app/project-state";
import { zoneSelectionKey } from "../../app/project-state";
import { BottomPanel } from "./BottomPanel";
import { ContextSidebar } from "./ContextSidebar";
import { ProjectSidebar } from "./ProjectSidebar";
import { ZoneVolumePatchDialog } from "./ZoneVolumePatchDialog";

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
  projectSessionId: "request-1",
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
        patchState={{
          status: "idle",
          newVolumeToken: "",
          planRequestId: null,
          applyRequestId: null,
          projectSessionId: null,
          zoneNumber: null,
          patchId: null,
          review: null,
          issue: null,
        }}
        onStartVolumeEdit={() => undefined}
        onVolumeTokenChange={() => undefined}
        onPlanVolumePatch={() => undefined}
        onCancelVolumeEdit={() => undefined}
        onTabChange={() => undefined}
        onCollapse={() => undefined}
      />,
    );
    expect(markup).toContain("CONTAM编号");
    expect(markup).toContain("600 m³");
    expect(markup).toContain("strict_contam_3_4_simple_zone_v1");
    expect(markup).toContain("修改体积");
    expect(markup).toContain("原始PRJ保持不变");
  });

  it("renders raw volume editing input without a path parameter", () => {
    const markup = renderToStaticMarkup(
      <ContextSidebar
        activeTab="inspector"
        project={project}
        selectedZone={project.zones[0]}
        selectedObject="navigation.classroom"
        patchState={{
          status: "editing",
          newVolumeToken: "6.5e2",
          planRequestId: null,
          applyRequestId: null,
          projectSessionId: "session-1",
          zoneNumber: 1,
          patchId: null,
          review: null,
          issue: null,
        }}
        onStartVolumeEdit={() => undefined}
        onVolumeTokenChange={() => undefined}
        onPlanVolumePatch={() => undefined}
        onCancelVolumeEdit={() => undefined}
        onTabChange={() => undefined}
        onCollapse={() => undefined}
      />,
    );
    expect(markup).toContain('value="6.5e2"');
    expect(markup).toContain('inputMode="decimal"');
    expect(markup).toContain("生成修改预览");
  });

  it("renders an accessible, non-editable single-line Diff review", () => {
    const markup = renderToStaticMarkup(
      <ZoneVolumePatchDialog
        projectFileName="real.prj"
        review={{
          project_session_id: "session-1",
          patch_id: "patch-1",
          zone_number: 1,
          zone_name: "One",
          field: "volume_m3",
          old_token: "600",
          new_token: "650.0",
          old_value: 600,
          new_value: 650,
          source_line_number: 243,
          old_line: "1 ... 600 ... One",
          new_line: "1 ... 650.0 ... One",
          diff_text: "--- real.prj\n+++ proposed-copy.prj\n@@ Zone 1 @@\n-old\n+new",
        }}
        applying={false}
        issueCode={null}
        onBack={() => undefined}
        onCancel={() => undefined}
        onApply={() => undefined}
      />,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-labelledby="patch-review-title"');
    expect(markup).toContain("另存为新副本");
    expect(markup).toContain("-1 ... 600 ... One");
    expect(markup).toContain("+1 ... 650.0 ... One");
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
