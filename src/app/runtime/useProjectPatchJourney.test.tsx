// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandAvailability } from "../command-availability";
import type { PatchState } from "../patch-state";
import { INITIAL_PROJECT_STATE, type ProjectState } from "../project-state";
import { INITIAL_SEMANTIC_STATE, type DesktopSemanticApplyResponse, type DesktopSemanticPatchPlanResponse, type SemanticSnapshot, type SemanticState } from "../semantic-state";
import type { SketchpadProjectionPreview } from "../geometry/sketchpad-projection-preview";
import { useProjectPatchJourney } from "./useProjectPatchJourney";

const desktop = vi.hoisted(() => ({
  read: vi.fn(),
  plan: vi.fn(),
  apply: vi.fn(),
}));

vi.mock("../desktop-api", () => ({
  readSemanticProject: desktop.read,
  planSemanticPatch: desktop.plan,
  applySemanticPatchToDraft: desktop.apply,
  applyZoneVolumePatchToDraft: vi.fn(),
  clearReadonlyAiSession: vi.fn(async () => undefined),
  discardSemanticPatch: vi.fn(async () => undefined),
  planZoneVolumePatch: vi.fn(),
}));

function context(suffix: string): { project: ProjectState; semantic: SemanticState; preview: SketchpadProjectionPreview } {
  const sourceSha256 = suffix.repeat(64);
  const identitySha256 = suffix === "a" ? "b".repeat(64) : "c".repeat(64);
  const revisionId = `revision-${suffix}`;
  const sessionId = `session-${suffix}`;
  const snapshot: SemanticSnapshot = {
    result_type: "semantic_project_snapshot",
    source_sha256: sourceSha256,
    identity_sha256: identitySha256,
    revision_state: "draft",
    project: { object_id: `project-${suffix}` },
    levels: [],
    zones: [{ object_id: `zone-${suffix}`, object_kind: "Zone", name: "Zone" }],
    flow_paths: [],
    schedules: [],
    species: [],
    sources: [],
    sections: [],
    spatial_projection: {
      schema_version: "spatial_projection.v1",
      status: "available",
      identity_sha256: identitySha256,
      source_sha256: sourceSha256,
      revision_id: revisionId,
      levels: [],
      warnings: [],
      unavailable_reason: null,
    },
    read_only_reason: null,
  };
  return {
    project: {
      ...INITIAL_PROJECT_STATE,
      status: "loaded",
      projectSessionId: sessionId,
      draft: { revision_id: revisionId, revision_number: 1, history_tip: 1, dirty: false, exported: false, can_undo: false, can_redo: false },
      project: {
        schema_version: "1",
        reader_mode: "strict",
        source_path: `${suffix}.prj`,
        source_sha256: sourceSha256,
        source_size_bytes: 100,
        source_unchanged: true,
        header_version: "3.4",
        header_variant: 0,
        declared_zone_count: 0,
        zones: [],
        first_zone: null,
        diagnostics: [],
      },
    },
    semantic: { ...INITIAL_SEMANTIC_STATE, snapshot },
    preview: {
      schema_version: "sketchpad_projection_preview.v1",
      status: "preview",
      method: "zone_centroid_normalized_to_existing_icon_bounds",
      lossy: true,
      can_apply: false,
      project_session_id: sessionId,
      geometry_id: `geometry-${suffix}`,
      geometry_sha256: "d".repeat(64),
      identity_sha256: identitySha256,
      source_sha256: sourceSha256,
      revision_id: revisionId,
      moves: [{
        icon_id: `icon-${suffix}`,
        semantic_zone_id: `zone-${suffix}`,
        level_number: 1,
        from_column: 1,
        from_row: 2,
        to_column: 3,
        to_row: 4,
        changed: true,
      }],
      diagnostics: ["sketchpad_projection_lossy"],
    },
  };
}

function planResponse(
  requestId: string,
  contextValue: ReturnType<typeof context>,
): DesktopSemanticPatchPlanResponse {
  return {
    request_id: requestId,
    project_session_id: contextValue.project.projectSessionId,
    revision_id: contextValue.project.draft?.revision_id ?? null,
    patch_id: "patch-1",
    source_sha256: contextValue.project.project?.source_sha256 ?? null,
    patch_sha256: "e".repeat(64),
    diff: [
      { operation: "set_spatial_icon_column", operation_id: "operation-column", object_id: contextValue.preview.moves[0].icon_id, field: "column", old_value: "1", new_value: "3", unit: "grid_cell", evidence_span: [1, 2], source_sha256: contextValue.preview.source_sha256 },
      { operation: "set_spatial_icon_row", operation_id: "operation-row", object_id: contextValue.preview.moves[0].icon_id, field: "row", old_value: "2", new_value: "4", unit: "grid_cell", evidence_span: [3, 4], source_sha256: contextValue.preview.source_sha256 },
    ],
    error: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useProjectPatchJourney SketchPad review", () => {
  let root: Root;
  let container: HTMLDivElement;
  let latest: ReturnType<typeof useProjectPatchJourney> | null;
  const dispatchSemantic = vi.fn();
  const dispatchProject = vi.fn();
  const openInspector = vi.fn();
  const openProject = vi.fn();
  const mounted = { current: true };

  function Harness({ value }: { value: ReturnType<typeof context> }) {
    latest = useProjectPatchJourney({
      commandAvailability: {} as CommandAvailability,
      currentZone: null,
      projectState: value.project,
      patchState: {} as PatchState,
      semanticState: value.semantic,
      simulationBusy: false,
      attachmentBusy: false,
      mounted,
      dispatchProject,
      dispatchPatch: vi.fn(),
      dispatchResult: vi.fn(),
      dispatchResultExport: vi.fn(),
      dispatchRun: vi.fn(),
      dispatchAi: vi.fn(),
      dispatchSimulation: vi.fn(),
      dispatchSemantic,
      onNotice: vi.fn(),
      onProjectDestination: openProject,
      onOpenInspector: openInspector,
      t: ((key: string) => key) as never,
    });
    return null;
  }

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    desktop.read.mockReset().mockImplementation(() => new Promise(() => undefined));
    desktop.plan.mockReset();
    desktop.apply.mockReset();
    dispatchSemantic.mockReset();
    dispatchProject.mockReset();
    openInspector.mockReset();
    openProject.mockReset();
    mounted.current = true;
    latest = null;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    mounted.current = false;
    await act(async () => root.unmount());
    container.remove();
  });

  it("prepares an exact Diff and never calls apply automatically", async () => {
    const value = context("a");
    desktop.plan.mockImplementation(async (requestId: string) => planResponse(requestId, value));
    await act(async () => root.render(<Harness value={value} />));
    let accepted = false;
    await act(async () => { accepted = await latest!.reviewSketchpadProjection(value.preview); });

    expect(accepted).toBe(true);
    expect(desktop.plan).toHaveBeenCalledWith(
      expect.any(String),
      value.project.projectSessionId,
      value.project.draft?.revision_id,
      [
        { operation: "set_spatial_icon_column", object_id: "icon-a", new_value: "3", unit: "grid_cell" },
        { operation: "set_spatial_icon_row", object_id: "icon-a", new_value: "4", unit: "grid_cell" },
      ],
    );
    expect(dispatchSemantic).toHaveBeenCalledWith({ type: "object_selected", objectId: "zone-a" });
    expect(dispatchSemantic).toHaveBeenCalledWith({ type: "plan_received", plan: expect.objectContaining({ patch_id: "patch-1" }) });
    expect(openProject).toHaveBeenCalledTimes(1);
    expect(openInspector).toHaveBeenCalledTimes(1);
    expect(desktop.apply).not.toHaveBeenCalled();
  });

  it("drops a late plan response after the project context changes", async () => {
    const first = context("a");
    const second = context("f");
    const pending = deferred<DesktopSemanticPatchPlanResponse>();
    desktop.plan.mockImplementation(() => pending.promise);
    await act(async () => root.render(<Harness value={first} />));
    let reviewPromise!: Promise<boolean>;
    act(() => { reviewPromise = latest!.reviewSketchpadProjection(first.preview); });
    await act(async () => root.render(<Harness value={second} />));
    dispatchSemantic.mockClear();
    pending.resolve(planResponse(desktop.plan.mock.calls[0][0] as string, first));
    await act(async () => { expect(await reviewPromise).toBe(false); });

    expect(dispatchSemantic).not.toHaveBeenCalledWith(expect.objectContaining({ type: "plan_received" }));
    expect(openInspector).not.toHaveBeenCalled();
  });

  it("drops a late apply response after the project context changes", async () => {
    const first = context("a");
    const second = context("f");
    const reviewedPlan = planResponse("plan-request", first);
    first.semantic = {
      ...first.semantic,
      status: "review",
      operations: [
        { operation: "set_spatial_icon_column", object_id: "icon-a", new_value: "3", unit: "grid_cell" },
        { operation: "set_spatial_icon_row", object_id: "icon-a", new_value: "4", unit: "grid_cell" },
      ],
      plan: reviewedPlan,
    };
    const pending = deferred<DesktopSemanticApplyResponse>();
    desktop.apply.mockImplementation(() => pending.promise);
    await act(async () => root.render(<Harness value={first} />));
    let applyPromise!: Promise<void>;
    act(() => { applyPromise = latest!.applySemanticOperations(); });
    await act(async () => root.render(<Harness value={second} />));
    dispatchSemantic.mockClear();
    dispatchProject.mockClear();
    pending.resolve({
      request_id: desktop.apply.mock.calls[0][0] as string,
      project_session_id: first.project.projectSessionId,
      project: first.project.project,
      draft: { ...first.project.draft!, revision_number: 2 },
      patch_id: reviewedPlan.patch_id,
      error: null,
    });
    await act(async () => { await applyPromise; });

    expect(dispatchSemantic).not.toHaveBeenCalledWith(expect.objectContaining({ type: "applied" }));
    expect(dispatchProject).not.toHaveBeenCalledWith(expect.objectContaining({ type: "draft_replaced" }));
  });
});
