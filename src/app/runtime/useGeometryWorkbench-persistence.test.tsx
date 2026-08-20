// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectInspection, ProjectState } from "../project-state";
import { INITIAL_PROJECT_STATE } from "../project-state";
import type { SemanticSnapshot } from "../semantic-state";
import type { DesktopGeometryDocumentResponse } from "../geometry/geometry-document";
import { geometrySha256, type BuildingGeometry } from "../geometry/geometry-model";
import { semanticDraftSha256, type ContamSemanticDraft } from "../geometry/contam-semantic-draft";
import { createBlankBuildingGeometry } from "../geometry/geometry-factories";
import { createEmptyContamSemanticDraft } from "../geometry/contam-semantic-draft";
import { useGeometryWorkbench, type GeometryWorkbenchController } from "./useGeometryWorkbench";

const desktop = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../desktop-api", () => ({
  loadProjectGeometryDocument: desktop.load,
  saveProjectGeometryDocument: desktop.save,
}));

function projectContext(suffix: string): { projectState: ProjectState; snapshot: SemanticSnapshot } {
  const sourceSha = suffix.repeat(64);
  const identitySha = suffix.toUpperCase().repeat(64).toLowerCase();
  const project: ProjectInspection = {
    schema_version: "1.0",
    reader_mode: "strict",
    source_path: `${suffix}.prj`,
    source_sha256: sourceSha,
    source_size_bytes: 100,
    source_unchanged: true,
    header_version: "3.4",
    header_variant: 0,
    declared_zone_count: 1,
    zones: [],
    first_zone: null,
    diagnostics: [],
  };
  return {
    projectState: {
      ...INITIAL_PROJECT_STATE,
      status: "loaded",
      project,
      projectSessionId: `session-${suffix}`,
      draft: { revision_id: `revision-${suffix}`, revision_number: 1, history_tip: 1, dirty: false, exported: false, can_undo: false, can_redo: false },
    },
    snapshot: {
      result_type: "semantic_project_snapshot",
      source_sha256: sourceSha,
      identity_sha256: identitySha,
      revision_state: "draft",
      project: { object_id: `project-${suffix}` },
      levels: [{ object_id: `level-${suffix}`, level_number: 1, name: "Ground" }],
      zones: [{ object_id: `zone-${suffix}`, contam_number: 1, name: "Zone" }],
      flow_paths: [],
      schedules: [],
      species: [],
      sources: [],
      sections: [],
      spatial_projection: null as unknown as SemanticSnapshot["spatial_projection"],
      read_only_reason: null,
    },
  };
}

function notFound(requestId: string, projectSessionId: string, revisionId: string): DesktopGeometryDocumentResponse {
  return {
    request_id: requestId,
    status: "not_found",
    project_session_id: projectSessionId,
    revision_id: revisionId,
    geometry: null,
    semantic_draft: null,
    summary: null,
    error: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useGeometryWorkbench project persistence", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: GeometryWorkbenchController | null;

  function Harness({ state, snapshot }: { state: ProjectState; snapshot: SemanticSnapshot }) {
    latest = useGeometryWorkbench(state, snapshot);
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    desktop.load.mockReset();
    desktop.save.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    latest = null;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("loads first, then debounces and revision-binds the first confirmed draft save", async () => {
    const context = projectContext("a");
    desktop.load.mockImplementation(async (requestId: string, sessionId: string, revisionId: string) => notFound(requestId, sessionId, revisionId));
    desktop.save.mockImplementation(async (
      requestId: string,
      sessionId: string,
      revisionId: string,
      geometry: BuildingGeometry,
      semanticDraft: ContamSemanticDraft | null,
      expectedRevision: number | null,
    ): Promise<DesktopGeometryDocumentResponse> => {
      expect(semanticDraft).not.toBeNull();
      expect(expectedRevision).toBeNull();
      return {
        request_id: requestId,
        status: "saved",
        project_session_id: sessionId,
        revision_id: revisionId,
        geometry: null,
        semantic_draft: null,
        summary: {
          schema_version: "geometry_document_summary.v1",
          project_identity_sha256: geometry.identity_sha256,
          geometry_sha256: geometrySha256(geometry),
          semantic_draft_sha256: semanticDraft ? semanticDraftSha256(semanticDraft) : null,
          document_revision: 1,
          saved_at_unix_ms: 1,
          recovered_from_backup: false,
        },
        error: null,
      };
    });

    await act(async () => root.render(<Harness state={context.projectState} snapshot={context.snapshot} />));
    await act(async () => { await Promise.resolve(); });
    expect(latest?.persistence.status).toBe("not_found");
    act(() => latest?.createBlankDraft());
    expect(latest?.history).not.toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(349));
    expect(desktop.save).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(desktop.save).toHaveBeenCalledTimes(1);
    expect(desktop.save.mock.calls[0][5]).toBeNull();
    expect(latest?.persistence.status).toBe("saved");
    expect(latest?.persistence.documentRevision).toBe(1);
  });

  it("restores geometry and semantic authoring together, then saves against the restored document revision", async () => {
    const context = projectContext("d");
    const geometryContext = {
      projectSessionId: context.projectState.projectSessionId!,
      revisionId: context.projectState.draft!.revision_id,
      project: context.projectState.project!,
      snapshot: context.snapshot,
    };
    const geometry = createBlankBuildingGeometry(geometryContext);
    const semanticDraft = createEmptyContamSemanticDraft({
      projectSessionId: geometryContext.projectSessionId,
      identitySha256: geometry.identity_sha256,
      sourceSha256: geometry.source_sha256,
      revisionId: geometryContext.revisionId,
    }, "restored-semantic-draft");
    desktop.load.mockImplementation(async (requestId: string, sessionId: string, revisionId: string): Promise<DesktopGeometryDocumentResponse> => ({
      request_id: requestId,
      status: "restored",
      project_session_id: sessionId,
      revision_id: revisionId,
      geometry,
      semantic_draft: semanticDraft,
      summary: {
        schema_version: "geometry_document_summary.v1",
        project_identity_sha256: geometry.identity_sha256,
        geometry_sha256: geometrySha256(geometry),
        semantic_draft_sha256: semanticDraftSha256(semanticDraft),
        document_revision: 7,
        saved_at_unix_ms: 7_000,
        recovered_from_backup: false,
      },
      error: null,
    }));
    desktop.save.mockImplementation(async (
      requestId: string,
      sessionId: string,
      revisionId: string,
      nextGeometry: BuildingGeometry,
      nextSemanticDraft: ContamSemanticDraft | null,
      expectedRevision: number | null,
    ): Promise<DesktopGeometryDocumentResponse> => {
      expect(expectedRevision).toBe(7);
      expect(nextSemanticDraft).not.toBeNull();
      return {
        request_id: requestId,
        status: "saved",
        project_session_id: sessionId,
        revision_id: revisionId,
        geometry: null,
        semantic_draft: null,
        summary: {
          schema_version: "geometry_document_summary.v1",
          project_identity_sha256: nextGeometry.identity_sha256,
          geometry_sha256: geometrySha256(nextGeometry),
          semantic_draft_sha256: nextSemanticDraft ? semanticDraftSha256(nextSemanticDraft) : null,
          document_revision: 8,
          saved_at_unix_ms: 8_000,
          recovered_from_backup: false,
        },
        error: null,
      };
    });

    await act(async () => root.render(<Harness state={context.projectState} snapshot={context.snapshot} />));
    await act(async () => { await Promise.resolve(); });
    expect(latest?.persistence.status).toBe("restored");
    expect(latest?.persistence.documentRevision).toBe(7);
    expect(latest?.semanticDraft?.draft_id).toBe("restored-semantic-draft");

    act(() => latest?.commitOperations([{
      operation: "add_vertex",
      parameters: { level_id: geometry.levels[0].id, vertex: { id: "restored-v1", x: 1_000, y: 2_000 } },
    }], { kind: "vertex", id: "restored-v1" }));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(desktop.save).toHaveBeenCalledTimes(1);
    expect(latest?.persistence.status).toBe("saved");
    expect(latest?.persistence.documentRevision).toBe(8);
  });

  it("ignores a late restore after the active project context changes", async () => {
    const first = projectContext("a");
    const second = projectContext("b");
    const firstLoad = deferred<DesktopGeometryDocumentResponse>();
    const secondLoad = deferred<DesktopGeometryDocumentResponse>();
    desktop.load
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(() => secondLoad.promise);

    await act(async () => root.render(<Harness state={first.projectState} snapshot={first.snapshot} />));
    await act(async () => root.render(<Harness state={second.projectState} snapshot={second.snapshot} />));
    firstLoad.resolve(notFound("late-request", "session-a", "revision-a"));
    await act(async () => { await Promise.resolve(); });
    expect(latest?.persistence.status).toBe("loading");

    const secondRequestId = desktop.load.mock.calls[1][0] as string;
    secondLoad.resolve(notFound(secondRequestId, "session-b", "revision-b"));
    await act(async () => { await Promise.resolve(); });
    expect(latest?.persistence.status).toBe("not_found");
    expect(latest?.history).toBeNull();
  });

  it("undoes and redoes geometry plus semantic authoring as one user transaction", async () => {
    const context = projectContext("c");
    desktop.load.mockImplementation(async (requestId: string, sessionId: string, revisionId: string) => notFound(requestId, sessionId, revisionId));
    await act(async () => root.render(<Harness state={context.projectState} snapshot={context.snapshot} />));
    await act(async () => { await Promise.resolve(); });
    act(() => latest?.createBlankDraft());
    const baselineDraft = latest?.semanticDraft;
    expect(baselineDraft?.draft_revision).toBe(0);

    act(() => {
      latest?.commitSemanticAuthoring([{
        operation: "add_vertex",
        parameters: { level_id: "studio-level-1", vertex: { id: "semantic-authoring-v1", x: 1_000, y: 2_000 } },
      }], { ...baselineDraft!, draft_revision: 1 });
    });
    expect(latest?.history?.geometry.levels[0].vertices).toHaveLength(1);
    expect(latest?.semanticDraft?.draft_revision).toBe(1);
    expect(latest?.canUndo).toBe(true);

    act(() => latest?.undo());
    expect(latest?.history?.geometry.levels[0].vertices).toHaveLength(0);
    expect(latest?.semanticDraft?.draft_revision).toBe(0);
    expect(latest?.canRedo).toBe(true);

    act(() => latest?.redo());
    expect(latest?.history?.geometry.levels[0].vertices).toHaveLength(1);
    expect(latest?.semanticDraft?.draft_revision).toBe(1);
  });
});
