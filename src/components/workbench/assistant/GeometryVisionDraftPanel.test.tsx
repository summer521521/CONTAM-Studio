import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import type { AttachmentState } from "../../../app/attachment-state";
import type { GeometryVisionDraftController } from "../../../app/runtime/useGeometryVisionDraft";
import { GEOMETRY_AI_DRAFT_SCHEMA_VERSION, type GeometryAiDraft } from "../../../app/geometry/geometry-ai-draft";
import { GeometryVisionDraftPanel } from "./GeometryVisionDraftPanel";

const attachmentState: AttachmentState = {
  attachments: [{
    attachment_id: "00000000-0000-4000-8000-000000000010",
    display_name: "floor-plan.png",
    category: "image",
    size_bytes: 1200,
    sha256_prefix: "a".repeat(12),
    status: "ready",
    risk_summary: "image metadata only",
    metadata: { mime_type: "image/png" },
    evidence_kind: null,
    selected_by_user: true,
  }],
  busy: false,
  bundle: null,
  issue: null,
};

const draft: GeometryAiDraft = {
  schema_version: GEOMETRY_AI_DRAFT_SCHEMA_VERSION,
  project_session_id: "project-session-1",
  revision_id: "revision-1",
  baseline_geometry_hash: "a".repeat(64),
  attachment_sha256: "b".repeat(64),
  summary: "A bounded room draft.",
  observations: ["Two visible walls."],
  measurement_basis: "scaled_reference",
  confidence_percent: 88,
  assumptions: ["The drawing uses a uniform scale."],
  warnings: ["The scale was inferred from the drawing."],
  operations: [
    {
      operation: "add_vertex",
      parameters: { level_id: "level-1", vertex: { id: "vertex-1", x: 100, y: 200 } },
    },
    {
      operation: "add_wall",
      parameters: {
        level_id: "level-1",
        wall: {
          id: "wall-1",
          start_vertex_id: "vertex-1",
          end_vertex_id: "vertex-2",
          kind: "interior",
          thickness: 100,
          source_icon_id: null,
        },
      },
    },
  ],
};

function controller(status: GeometryVisionDraftController["status"]): GeometryVisionDraftController {
  return {
    status,
    requestId: "geometry-ai-request-1",
    draft,
    previewGeometry: null,
    canvasPreview: { operationCount: 12, zones: [], walls: [], openings: [] },
    selectedOperationIndices: [0, 1],
    autoIncludedOperationIndices: [1],
    diagnostics: [],
    issue: null,
    modelId: "gpt-5.6-luna",
    reasoningEffort: "high",
    generate: async () => undefined,
    cancel: () => undefined,
    toggleOperation: () => undefined,
    setAllOperationsSelected: () => undefined,
    confirm: () => true,
    dismiss: () => undefined,
  };
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("integrated geometry vision assistant", () => {
  it("renders the draft inside the assistant surface instead of a second dialog", () => {
    const markup = renderToStaticMarkup(
      <GeometryVisionDraftPanel
        controller={controller("ready")}
        geometryAvailable
        codexVisionReady
        attachmentState={attachmentState}
        onAttachmentImport={() => undefined}
        onAttachmentSelect={() => undefined}
      />,
    );
    expect(markup).toContain("AI building draft");
    expect(markup).toContain("floor-plan.png");
    expect(markup).toContain("12 operations");
    expect(markup).toContain("2 of 2 selected");
    expect(markup).toContain("Confirm on canvas");
    expect(markup).toContain("Project session");
    expect(markup).toContain("project-sess…");
    expect(markup).toContain("Two visible walls.");
    expect(markup).toContain("The drawing uses a uniform scale.");
    expect(markup).toContain("Vertex");
    expect(markup).toContain("Wall");
    expect(markup).not.toContain('role="dialog"');
  });

  it("keeps the generate action unavailable until the Codex vision boundary is ready", () => {
    const markup = renderToStaticMarkup(
      <GeometryVisionDraftPanel
        controller={controller("idle")}
        geometryAvailable
        codexVisionReady={false}
        attachmentState={attachmentState}
        onAttachmentImport={() => undefined}
        onAttachmentSelect={() => undefined}
      />,
    );
    expect(markup).toContain("Sign in to Codex with ChatGPT and confirm Luna is available");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*Generate geometry draft/s);
  });
});
