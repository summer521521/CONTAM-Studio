// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import metricFixture from "../../../contracts/geometry/examples/studio-metric-valid.json";
import { GEOMETRY_AI_DRAFT_SCHEMA_VERSION, selectGeometryAiOperations, type GeometryAiDraft } from "../geometry/geometry-ai-draft";
import { createGeometryHistory } from "../geometry/geometry-history";
import { cloneBuildingGeometry, type BuildingGeometry } from "../geometry/geometry-model";
import { INITIAL_PROJECT_STATE, type ProjectState } from "../project-state";
import type { GeometryWorkbenchController } from "./useGeometryWorkbench";
import { useGeometryVisionDraft, type GeometryVisionDraftController } from "./useGeometryVisionDraft";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const desktop = vi.hoisted(() => ({
  generate: vi.fn(),
  interrupt: vi.fn(),
}));

vi.mock("../desktop-api", () => ({
  generateGeometryDraftFromImage: desktop.generate,
  interruptReadonlyAiTurn: desktop.interrupt,
}));

function projectState(): ProjectState {
  return {
    ...INITIAL_PROJECT_STATE,
    projectSessionId: "project-1",
    draft: {
      revision_id: "revision-1",
      revision_number: 1,
      history_tip: 0,
      dirty: false,
      exported: false,
      can_undo: false,
      can_redo: false,
    },
  };
}

function visionDraft(baselineGeometryHash: string): GeometryAiDraft {
  return {
    schema_version: GEOMETRY_AI_DRAFT_SCHEMA_VERSION,
    project_session_id: "project-1",
    revision_id: "revision-1",
    baseline_geometry_hash: baselineGeometryHash,
    attachment_sha256: "c".repeat(64),
    summary: "A bounded room extension.",
    observations: ["Two visible orthogonal walls."],
    measurement_basis: "explicit_dimensions",
    confidence_percent: 88,
    assumptions: [],
    warnings: [],
    operations: [
      { operation: "add_vertex", parameters: { level_id: "level-1", vertex: { id: "ai-v5", x: 5_000, y: 3_000 } } },
      { operation: "add_wall", parameters: { level_id: "level-1", wall: { id: "ai-w5", start_vertex_id: "v3", end_vertex_id: "ai-v5", kind: "interior", thickness: 120, source_icon_id: null } } },
      { operation: "place_opening", parameters: { level_id: "level-1", opening: { id: "ai-window-1", wall_id: "ai-w5", kind: "window", offset: 100, width: 600, swing: "none", adjacent_zone_ids: ["zone-1"] } } },
    ],
  };
}

describe("useGeometryVisionDraft selection approval", () => {
  let root: Root;
  let container: HTMLDivElement;
  let latest: GeometryVisionDraftController | null;
  let history: ReturnType<typeof createGeometryHistory>;
  let geometryController: GeometryWorkbenchController;

  function Harness() {
    latest = useGeometryVisionDraft(projectState(), geometryController);
    return null;
  }

  beforeEach(() => {
    history = createGeometryHistory(cloneBuildingGeometry(metricFixture as BuildingGeometry));
    geometryController = {
      history,
      commitAiOperations: vi.fn(() => true),
    } as unknown as GeometryWorkbenchController;
    desktop.generate.mockReset();
    desktop.interrupt.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    latest = null;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderAndGenerate() {
    await act(async () => root.render(<Harness />));
    const draft = visionDraft(history.geometry_hash);
    desktop.generate.mockImplementation(async (requestId: string) => ({
      request_id: requestId,
      status: "completed",
      model_id: "gpt-5.6-luna",
      reasoning_effort: "high",
      draft,
      token_usage: null,
      error: null,
    }));
    await act(async () => { await latest!.generate("attachment-1", "trace the plan", "en"); });
  }

  it("previews and approves exactly the selected operation subset", async () => {
    await renderAndGenerate();
    expect(latest?.status).toBe("ready");
    expect(latest?.selectedOperationIndices).toEqual([0, 1, 2]);
    expect(latest?.autoIncludedOperationIndices).toEqual([]);
    expect(latest?.canvasPreview?.operationCount).toBe(3);

    act(() => latest?.toggleOperation(2));
    expect(latest?.selectedOperationIndices).toEqual([0, 1]);
    expect(latest?.canvasPreview?.operationCount).toBe(2);

    let confirmed = false;
    act(() => { confirmed = latest!.confirm(); });
    expect(confirmed).toBe(true);
    const commit = geometryController.commitAiOperations as ReturnType<typeof vi.fn>;
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0]).toEqual(selectGeometryAiOperations(visionDraft(history.geometry_hash), [0, 1]));
    expect(commit.mock.calls[0][1].operationsSha256).toHaveLength(64);
    expect(latest?.status).toBe("applied");
  });

  it("auto-includes prerequisites and removes dependent operations together", async () => {
    await renderAndGenerate();
    act(() => latest?.setAllOperationsSelected(false));
    act(() => latest?.toggleOperation(2));
    expect(latest?.selectedOperationIndices).toEqual([0, 1, 2]);
    expect(latest?.autoIncludedOperationIndices).toEqual([0, 1]);

    act(() => latest?.toggleOperation(0));
    expect(latest?.selectedOperationIndices).toEqual([]);
    expect(latest?.autoIncludedOperationIndices).toEqual([]);
  });

  it("refuses an empty selection and never calls the geometry commit path", async () => {
    await renderAndGenerate();
    act(() => latest?.setAllOperationsSelected(false));
    expect(latest?.selectedOperationIndices).toEqual([]);
    expect(latest?.canvasPreview).toBeNull();

    let confirmed = true;
    act(() => { confirmed = latest!.confirm(); });
    expect(confirmed).toBe(false);
    expect(latest?.status).toBe("error");
    expect(latest?.issue?.code).toBe("geometry_ai_operations_empty");
    expect(geometryController.commitAiOperations).not.toHaveBeenCalled();
  });
});
