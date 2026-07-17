import { describe, expect, it } from "vitest";
import {
  INITIAL_PROJECT_STATE,
  projectReducer,
  selectedZone,
  zoneSelectionKey,
  type ProjectInspection,
  type ReaderDiagnostic,
} from "./project-state";

function project(zoneCount = 2): ProjectInspection {
  const zones = Array.from({ length: zoneCount }, (_, index) => ({
    contam_number: index + 1,
    name: `Zone${index + 1}`,
    flags: index + 3,
    level_number: 1,
    relative_height: index,
    volume_m3: 100 + index,
    source_line_number: 20 + index,
  }));
  return {
    schema_version: "1.0",
    reader_mode: "strict_contam_3_4_simple_zone_v1",
    source_path: "F:\\models\\sample.prj",
    source_sha256: "a".repeat(64),
    source_size_bytes: 1000,
    source_unchanged: true,
    header_version: "3.4.0.4",
    header_variant: 0,
    declared_zone_count: zoneCount,
    zones,
    first_zone: zones[0] ?? null,
    diagnostics: [],
  };
}

const issue: ReaderDiagnostic = {
  code: "invalid_zone_field",
  message: "invalid",
  source_line_number: 12,
  context: { field: "Vol", token: "bad" },
};

describe("projectReducer", () => {
  it("moves from idle through loading to loaded", () => {
    const selecting = projectReducer(INITIAL_PROJECT_STATE, {
      type: "selection_started",
      sequence: 1,
    });
    expect(selecting.status).toBe("selecting");

    const loading = projectReducer(selecting, {
      type: "loading_started",
      sequence: 1,
      requestId: "request-1",
    });
    expect(loading.status).toBe("loading");

    const loaded = projectReducer(loading, {
      type: "loading_succeeded",
      sequence: 1,
      requestId: "request-1",
      project: project(),
    });
    expect(loaded.status).toBe("loaded");
    expect(loaded.project?.zones).toHaveLength(2);
    expect(selectedZone(loaded)?.name).toBe("Zone1");
  });

  it("maps reader rejection to unsupported and keeps a previous project", () => {
    const loadedProject = project();
    const previous = {
      ...INITIAL_PROJECT_STATE,
      status: "selecting" as const,
      activeSequence: 2,
      project: loadedProject,
      selectedZoneKey: zoneSelectionKey(loadedProject, loadedProject.zones[1]),
    };
    const loading = projectReducer(previous, {
      type: "loading_started",
      sequence: 2,
      requestId: "request-2",
    });
    const failed = projectReducer(loading, {
      type: "loading_failed",
      sequence: 2,
      requestId: "request-2",
      issue,
    });
    expect(failed.status).toBe("unsupported");
    expect(failed.project).toBe(loadedProject);
    expect(selectedZone(failed)?.name).toBe("Zone2");
  });

  it("moves from loading to error for a bridge failure", () => {
    const selecting = projectReducer(INITIAL_PROJECT_STATE, {
      type: "selection_started",
      sequence: 1,
    });
    const loading = projectReducer(selecting, {
      type: "loading_started",
      sequence: 1,
      requestId: "request-1",
    });
    const failed = projectReducer(loading, {
      type: "loading_failed",
      sequence: 1,
      requestId: "request-1",
      issue: {
        code: "python_process_timeout",
        message: "timed out",
        source_line_number: null,
        context: {},
      },
    });
    expect(failed.status).toBe("error");
    expect(failed.issue?.code).toBe("python_process_timeout");
  });

  it("ignores stale responses from an older request", () => {
    const current = {
      ...INITIAL_PROJECT_STATE,
      status: "loading" as const,
      activeSequence: 4,
      activeRequestId: "request-4",
    };
    const stale = projectReducer(current, {
      type: "loading_succeeded",
      sequence: 3,
      requestId: "request-3",
      project: project(),
    });
    expect(stale).toBe(current);
  });

  it("represents a zero-Zone project without a selection", () => {
    const selecting = projectReducer(INITIAL_PROJECT_STATE, {
      type: "selection_started",
      sequence: 1,
    });
    const loading = projectReducer(selecting, {
      type: "loading_started",
      sequence: 1,
      requestId: "request-1",
    });
    const loaded = projectReducer(loading, {
      type: "loading_succeeded",
      sequence: 1,
      requestId: "request-1",
      project: project(0),
    });
    expect(loaded.status).toBe("loaded");
    expect(loaded.selectedZoneKey).toBeNull();
    expect(selectedZone(loaded)).toBeNull();
  });

  it("selects another Zone by a non-persistent composite key", () => {
    const loadedProject = project();
    const state = {
      ...INITIAL_PROJECT_STATE,
      status: "loaded" as const,
      project: loadedProject,
      selectedZoneKey: zoneSelectionKey(loadedProject, loadedProject.zones[0]),
    };
    const selected = projectReducer(state, {
      type: "zone_selected",
      zoneKey: zoneSelectionKey(loadedProject, loadedProject.zones[1]),
    });
    expect(selectedZone(selected)?.name).toBe("Zone2");
  });
});
