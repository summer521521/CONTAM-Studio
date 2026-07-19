import { describe, expect, it } from "vitest";
import {
  desktopOpenIssue,
  INITIAL_PROJECT_STATE,
  isDraftExportSummaryValid,
  isDraftSummaryValid,
  isSafeProjectInspection,
  projectReducer,
  selectedZone,
  zoneSelectionKey,
  type ProjectInspection,
  type ReaderDiagnostic,
} from "./project-state";

function project(zoneCount = 2): ProjectInspection {
  const zones = Array.from({ length: zoneCount }, (_, index) => ({
    zone_id: `00000000-0000-5000-8000-${String(index + 1).padStart(12, "0")}`,
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
    source_path: "sample.prj",
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
const draft = { revision_id: "00000000-0000-5000-8000-000000000099", revision_number: 0, history_tip: 0, dirty: false, exported: false, can_undo: false, can_redo: false };

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
      projectSessionId: "request-1",
      draft,
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
      projectSessionId: "request-3",
      draft,
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
      projectSessionId: "request-1",
      draft,
    });
    expect(loaded.status).toBe("loaded");
    expect(loaded.selectedZoneKey).toBeNull();
    expect(selectedZone(loaded)).toBeNull();
  });

  it("selects another Zone by its stable UUID", () => {
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

  it("replaces a revision while preserving the selected stable UUID", () => {
    const baseline = project();
    const selectedId = baseline.zones[1].zone_id;
    const state = {
      ...INITIAL_PROJECT_STATE,
      status: "loaded" as const,
      project: baseline,
      projectSessionId: "session-1",
      draft,
      selectedZoneKey: selectedId,
    };
    const revision = {
      ...baseline,
      source_sha256: "b".repeat(64),
      zones: baseline.zones.map((zone) => zone.zone_id === selectedId ? { ...zone, volume_m3: 650 } : zone),
    };
    const nextDraft = { ...draft, revision_id: "00000000-0000-5000-8000-000000000100", revision_number: 1, history_tip: 1, dirty: true, can_undo: true };
    const next = projectReducer(state, {
      type: "draft_replaced",
      project: revision,
      projectSessionId: "session-1",
      targetZoneId: selectedId,
      draft: nextDraft,
    });
    expect(next.selectedZoneKey).toBe(selectedId);
    expect(selectedZone(next)?.volume_m3).toBe(650);
    expect(next.draft?.can_undo).toBe(true);
  });

  it("marks only the active revision as exported", () => {
    const state = { ...INITIAL_PROJECT_STATE, draft: { ...draft, dirty: true } };
    expect(projectReducer(state, { type: "draft_exported", revisionId: "old" })).toEqual(state);
    expect(projectReducer(state, { type: "draft_exported", revisionId: draft.revision_id }).draft?.exported).toBe(true);
  });
});

describe("desktop open response", () => {
  it("treats cancellation without an envelope as a normal response", () => {
    expect(
      desktopOpenIssue(
        { request_id: "request-1", cancelled: true, project_session_id: null, envelope: null, draft: null },
        "request-1",
      ),
    ).toBeNull();
  });

  it("rejects a cancellation carrying an envelope", () => {
    const invalid = desktopOpenIssue(
      {
        request_id: "request-1",
        cancelled: true,
        project_session_id: null,
        draft: null,
        envelope: {
          protocol_version: "1.0",
          request_id: "request-1",
          ok: false,
          result: null,
          error: issue,
        },
      },
      "request-1",
    );
    expect(invalid?.code).toBe("desktop_response_contract_invalid");
  });

  it("rejects a response for another request", () => {
    const invalid = desktopOpenIssue(
      { request_id: "request-2", cancelled: true, project_session_id: null, envelope: null, draft: null },
      "request-1",
    );
    expect(invalid?.code).toBe("desktop_response_request_mismatch");
  });

  it("rejects paths and inconsistent draft metadata at the WebView boundary", () => {
    expect(isSafeProjectInspection(project())).toBe(true);
    expect(isSafeProjectInspection({ ...project(), source_path: "F:\\private\\sample.prj" })).toBe(false);
    expect(isDraftSummaryValid(draft)).toBe(true);
    expect(isDraftSummaryValid({ ...draft, can_undo: true })).toBe(false);
  });

  it("accepts only a path-free verified draft export summary", () => {
    const summary = { file_name: "sample-copy.prj", sha256: "b".repeat(64), size_bytes: 1000, zone_count: 2, revision_number: 1, matches_active_revision: true };
    expect(isDraftExportSummaryValid(summary)).toBe(true);
    expect(isDraftExportSummaryValid({ ...summary, file_name: "F:\\private\\sample-copy.prj" })).toBe(false);
    expect(isDraftExportSummaryValid({ ...summary, matches_active_revision: false })).toBe(false);
  });
});
