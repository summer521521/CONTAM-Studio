import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import type { ProjectInspection, ProjectState } from "../../app/project-state";
import { zoneSelectionKey } from "../../app/project-state";
import { BottomPanel } from "./BottomPanel";
import { ContextSidebar } from "./ContextSidebar";
import { ProjectSidebar } from "./ProjectSidebar";
import { ZoneVolumePatchDialog } from "./ZoneVolumePatchDialog";
import { ZoneAirStateResults } from "./ZoneAirStateResults";
import { TopBar } from "./TopBar";
import { INITIAL_RESULT_STATE } from "../../app/result-state";
import { INITIAL_RUN_STATE } from "../../app/run-state";

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

const zoneResult = {
  schema_version: "1.0" as const,
  result_type: "zone_air_state" as const,
  run_id: "run-1",
  extraction_id: "extract-1",
  zone_number: 1,
  zone_name: "One",
  source_line_number: 243,
  unit_system: "SI" as const,
  sample_count: 1,
  samples: [{ index: 0, day_of_year: 1, day_type: null, sim_time_seconds: 0, temperature_k: 293.15, reference_pressure_pa: -1.4222, air_density_kg_m3: 1.2041 }],
  day_type_source: "not_available_in_simread_nfr_v1",
  time_contract: "elapsed_seconds_from_first_sample",
};

beforeAll(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("real project components", () => {
  it("keeps the real run action disabled until a supported project is available", () => {
    const markup = renderToStaticMarkup(
      <TopBar
        language="zh-CN"
        theme="light"
        onLanguageChange={() => undefined}
        onThemeToggle={() => undefined}
        onOpenProject={() => undefined}
        openDisabled={false}
        onRunProject={() => undefined}
        runDisabled={true}
        onPlaceholder={() => undefined}
      />,
    );
    expect(markup).toContain("tool-button-run");
    expect(markup).toMatch(/tool-button-run[^>]*disabled/);
  });
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
        runState={INITIAL_RUN_STATE}
        onViewCurrentZoneResults={() => undefined}
        viewRunResultsDisabled={true}
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

  it("renders a real Zone air-state table and null day type", () => {
    const markup = renderToStaticMarkup(
      <ZoneAirStateResults
        state={{ ...INITIAL_RESULT_STATE, status: "loaded", result: zoneResult, resultSource: "selected_manifest" }}
        activeRunId={null}
        onLoadLatest={() => undefined}
        onSelectManifest={() => undefined}
        disabled={false}
      />,
    );
    expect(markup).toContain("真实Zone空气状态摘要");
    expect(markup).toContain("293.15");
    expect(markup).toContain("—");
    expect(markup).toContain("<table");
  });

  it("shows first-load cancellation without a result table", () => {
    const markup = renderToStaticMarkup(
      <ZoneAirStateResults
        state={{ ...INITIAL_RESULT_STATE, status: "cancelled" }}
        activeRunId={null}
        onLoadLatest={() => undefined}
        onSelectManifest={() => undefined}
        disabled={false}
      />,
    );
    expect(markup).toContain("已取消运行清单选择，未加载结果");
    expect(markup).not.toContain("<table");
  });

  it("retains the result table and shows a safe cancellation or error notice", () => {
    const cancelled = renderToStaticMarkup(
      <ZoneAirStateResults
        state={{ ...INITIAL_RESULT_STATE, status: "cancelled", result: zoneResult }}
        activeRunId={null}
        onLoadLatest={() => undefined}
        onSelectManifest={() => undefined}
        disabled={false}
      />,
    );
    expect(cancelled).toContain("本次加载已取消");
    expect(cancelled).toContain("293.15");
    expect(cancelled).toContain("<table");

    const failed = renderToStaticMarkup(
      <ZoneAirStateResults
        state={{
          ...INITIAL_RESULT_STATE,
          status: "error",
          result: zoneResult,
          issue: {
            code: "simread_not_configured",
            message: "F:\\secret\\Traceback.txt",
            source_line_number: null,
            context: {},
          },
        }}
        activeRunId={null}
        onLoadLatest={() => undefined}
        onSelectManifest={() => undefined}
        disabled={false}
      />,
    );
    expect(failed).toContain("本次加载失败");
    expect(failed).toContain("293.15");
    expect(failed).not.toContain("secret");
    expect(failed).not.toContain("Traceback");
  });

  it("provides the retained cancellation notice in English", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("results.cancelledRetained")).toBe(
      "This load was cancelled; the last successful results remain visible.",
    );
    await i18n.changeLanguage("zh-CN");
  });

  it("shows latest-run actions and a non-error stale result notice", async () => {
    await i18n.changeLanguage("en");
    const empty = renderToStaticMarkup(
      <ZoneAirStateResults
        state={INITIAL_RESULT_STATE}
        activeRunId="run-2"
        onLoadLatest={() => undefined}
        onSelectManifest={() => undefined}
        disabled={false}
      />,
    );
    expect(empty).toContain("Load latest run results");
    expect(empty).toContain("Choose existing run manifest");

    const stale = renderToStaticMarkup(
      <ZoneAirStateResults
        state={{ ...INITIAL_RESULT_STATE, status: "loaded", result: zoneResult, resultSource: "selected_manifest" }}
        activeRunId="run-2"
        onLoadLatest={() => undefined}
        onSelectManifest={() => undefined}
        disabled={false}
      />,
    );
    expect(stale).toContain("This table still comes from an earlier run");
    expect(stale).not.toContain('class="results-inline-status is-error"');
    await i18n.changeLanguage("zh-CN");
  });

  it("renders a safe ContamX run summary without local paths", () => {
    const markup = renderToStaticMarkup(
      <BottomPanel
        activeTab="logs"
        projectState={state}
        runState={{
          ...INITIAL_RUN_STATE,
          status: "succeeded",
          projectSessionId: "session-1",
          summary: {
            status: "succeeded",
            run_id: "run-1",
            solver_name: "contamx3.exe",
            solver_version: "3.4.0.3",
            started_at_utc: "2026-07-18T12:00:00Z",
            duration_ms: 500,
            exit_code: 0,
            timed_out: false,
            sim_artifact_count: 1,
            source_unchanged: true,
          },
        }}
        onViewCurrentZoneResults={() => undefined}
        viewRunResultsDisabled={false}
        onTabChange={() => undefined}
        onCollapse={() => undefined}
      />,
    );
    expect(markup).toContain("contamx3.exe 3.4.0.3");
    expect(markup).toContain("run-1");
    expect(markup).toContain("查看当前Zone结果");
    expect(markup).not.toContain("F:\\");
    expect(markup).not.toContain("manifest");
  });
});
