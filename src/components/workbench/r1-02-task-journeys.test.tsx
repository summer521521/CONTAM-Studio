import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { INITIAL_AI_STATE } from "../../app/ai-state";
import { INITIAL_PROJECT_STATE, type ProjectInspection, type ProjectState } from "../../app/project-state";
import { INITIAL_RESULT_EXPORT_STATE } from "../../app/result-export-state";
import { INITIAL_RESULT_STATE } from "../../app/result-state";
import { INITIAL_RUN_STATE } from "../../app/run-state";
import type { StudioSetup } from "../../app/release-state";
import { ProjectPage } from "./pages/ProjectPage";
import { ResultsPage } from "./pages/ResultsPage";
import { RunPage } from "./pages/RunPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ReleaseSettings } from "./ReleaseSettings";
import { filterProjectZones } from "./ProjectSidebar";

const project: ProjectInspection = {
  schema_version: "1.0",
  reader_mode: "strict_contam_3_4_simple_zone_v1",
  source_path: "classroom.prj",
  source_sha256: "a".repeat(64),
  source_size_bytes: 1024,
  source_unchanged: true,
  header_version: "3.4.0.4",
  header_variant: 0,
  declared_zone_count: 1,
  zones: [{ zone_id: "zone-1", contam_number: 1, name: "Classroom", flags: 3, level_number: 1, relative_height: 0, volume_m3: 600, source_line_number: 243 }],
  first_zone: null,
  diagnostics: [],
};

const projectState: ProjectState = {
  ...INITIAL_PROJECT_STATE,
  status: "loaded",
  project,
  projectSessionId: "project-session-1",
  selectedZoneKey: "zone-1",
  draft: { revision_id: "revision-1", revision_number: 1, history_tip: 1, dirty: true, exported: false, can_undo: true, can_redo: false },
};

const readySetup: StudioSetup = {
  schema_version: 1,
  first_run_complete: true,
  language: "zh-CN",
  theme: "light",
  data_directory: "data",
  contamx: { kind: "contamx", status: "available", path: "bundled", version: "3.4.0.3", detail: null },
  simread: { kind: "simread", status: "available", path: "bundled", version: "3.4.0.3", detail: null },
  runtime: { app_version: "0.4.0", commit_sha: "test", build_kind: "development", dirty: true, architecture: "x86_64", operating_system: "windows" },
  storage: { data_directory: "data", config_directory: "config", cache_directory: "cache", log_directory: "logs", temporary_directory: "temp" },
};

const actions = {
  onOpenProject: () => undefined,
  onRunProject: () => undefined,
  onLoadLatestResults: () => undefined,
  onNavigate: () => undefined,
};

beforeAll(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("R1-02 task journeys", () => {
  it("gives the no-project home one truthful primary action and engine status", () => {
    const markup = renderToStaticMarkup(<ProjectPage projectState={INITIAL_PROJECT_STATE} runState={INITIAL_RUN_STATE} resultState={INITIAL_RESULT_STATE} setup={readySetup} availability={{ openProject: true, runProject: false }} {...actions} />);
    expect(markup).toContain("打开 CONTAM 项目");
    expect(markup).toContain("仿真引擎已就绪 · ContamX 3.4.0.3");
    expect(markup).not.toContain("Endpoint");
    expect(markup).not.toContain("SHA-256");
  });

  it("shows project identity, draft capability, Zone selection, and a next step", () => {
    const markup = renderToStaticMarkup(<ProjectPage projectState={projectState} runState={INITIAL_RUN_STATE} resultState={INITIAL_RESULT_STATE} setup={readySetup} availability={{ openProject: true, runProject: true }} {...actions} />);
    expect(markup).toContain("classroom.prj");
    expect(markup).toContain("草稿 Revision 1");
    expect(markup).toContain("Classroom");
    expect(markup).toContain("建议下一步");
    expect(markup).toContain("<details");
  });

  it("filters project objects by user-visible name or CONTAM number and supports an empty result", () => {
    expect(filterProjectZones(project.zones, "class")).toHaveLength(1);
    expect(filterProjectZones(project.zones, "1")).toHaveLength(1);
    expect(filterProjectZones(project.zones, "missing")).toEqual([]);
  });

  it("keeps the run action disabled with a reason until the engine is ready", () => {
    const markup = renderToStaticMarkup(<RunPage projectState={projectState} runState={INITIAL_RUN_STATE} resultState={INITIAL_RESULT_STATE} setup={null} availability={{ openProject: true, runProject: true, loadActiveResult: false }} {...actions} />);
    expect(markup).toContain("正在检查仿真引擎");
    expect(markup).toMatch(/<button[^>]*disabled/);

    const missingToolMarkup = renderToStaticMarkup(<RunPage projectState={projectState} runState={INITIAL_RUN_STATE} resultState={INITIAL_RESULT_STATE} setup={{ ...readySetup, contamx: { ...readySetup.contamx, status: "resource_missing", path: null, version: null } }} availability={{ openProject: true, runProject: true, loadActiveResult: false }} {...actions} />);
    expect(missingToolMarkup).toContain("仿真引擎尚未就绪");
    expect(missingToolMarkup).toMatch(/<button[^>]*disabled/);
  });

  it("separates ContamX failure from result-reading failure", () => {
    const solverFailure = renderToStaticMarkup(<RunPage projectState={projectState} runState={{ ...INITIAL_RUN_STATE, status: "error", projectSessionId: "project-session-1", issue: { code: "contamx_solver_not_configured", message: "internal path", source_line_number: null, context: {} } }} resultState={INITIAL_RESULT_STATE} setup={readySetup} availability={{ openProject: true, runProject: true, loadActiveResult: false }} {...actions} />);
    expect(solverFailure).toContain("ContamX 求解失败");
    expect(solverFailure).toContain("设置 → 仿真工具");
    expect(solverFailure).not.toContain("internal path");

    const readFailure = renderToStaticMarkup(<RunPage projectState={projectState} runState={{ ...INITIAL_RUN_STATE, status: "succeeded", projectSessionId: "project-session-1", summary: { status: "succeeded", run_id: "run-1", solver_name: "contamx3.exe", solver_version: "3.4.0.3", started_at_utc: "2026-08-01T00:00:00Z", duration_ms: 10, exit_code: 0, timed_out: false, sim_artifact_count: 1, source_unchanged: true } }} resultState={{ ...INITIAL_RESULT_STATE, status: "error", projectSessionId: "project-session-1", issue: { code: "zone_result_contract_invalid", message: "internal result detail", source_line_number: null, context: {} } }} setup={readySetup} availability={{ openProject: true, runProject: true, loadActiveResult: true }} {...actions} />);
    expect(readFailure).toContain("ContamX 已完成求解，但结果读取未完成");
    expect(readFailure).toContain("重试读取结果");
  });

  it("explains the no-result route and offers a real next action", () => {
    const markup = renderToStaticMarkup(<ResultsPage projectState={projectState} runState={INITIAL_RUN_STATE} resultState={INITIAL_RESULT_STATE} resultExportState={INITIAL_RESULT_EXPORT_STATE} activeRunId={null} theme="light" availability={{ openProject: true, loadActiveResult: false, selectManifest: true, exportResult: false }} onOpenProject={() => undefined} onLoadLatestResults={() => undefined} onSelectManifestResults={() => undefined} onExportResults={() => undefined} onNavigate={() => undefined} />);
    expect(markup).toContain("当前项目还没有可读取的运行结果");
    expect(markup).toContain("前往运行");
  });

  it("presents the five settings categories and keeps advanced content out of the default category", () => {
    const markup = renderToStaticMarkup(<SettingsPage language="zh-CN" theme="light" aiState={INITIAL_AI_STATE} setup={readySetup} setupBusy={false} storageUsage={null} onOpenAssistant={() => undefined} onSettingsReset={() => undefined} onChooseDataDirectory={async () => null} onProbeTool={async () => null} onSaveDataDirectory={async () => undefined} onOpenStudioDirectory={async () => undefined} onClearStudioCache={async () => undefined} onCopyDiagnostics={async () => undefined} onExportDiagnostics={async () => undefined} />);
    for (const label of ["外观", "AI 与 Provider", "仿真工具", "数据与隐私", "高级诊断"]) expect(markup).toContain(label);
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain("commit SHA");
    expect(markup).not.toContain("Provider API Key");
  });

  it("keeps legacy tool probes diagnostic-only and preserves authoritative setup status", () => {
    const markup = renderToStaticMarkup(<ReleaseSettings setup={readySetup} language="zh-CN" theme="light" busy={false} onChooseDataDirectory={async () => null} onProbeTool={async () => ({ ...readySetup.contamx, path: "diagnostic-only" })} onSaveDataDirectory={async () => undefined} onOpenDirectory={async () => undefined} onClearCache={async () => undefined} onCopyDiagnostics={async () => undefined} onExportDiagnostics={async () => undefined} section="tools" />);
    expect(markup).toContain("已就绪 · ContamX 3.4.0.3");
    expect(markup).toContain("旧版工具只读诊断");
    expect(markup).toContain("不会改变运行配置");
    expect(markup).not.toContain("diagnostic-only");
    expect(markup).not.toContain("配置已保存");
  });
});
