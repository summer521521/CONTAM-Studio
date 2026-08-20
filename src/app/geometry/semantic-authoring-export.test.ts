import { describe, expect, it } from "vitest";
import {
  semanticAuthoringExportResponseIssue,
  type DesktopSemanticAuthoringExportResponse,
} from "./semantic-authoring-export";

const requestId = "semantic-authoring-export-request";
const projectSessionId = "project-session";
const revisionId = "6ea9d57d-691f-4ab2-8bc8-83507142092c";

function response(): DesktopSemanticAuthoringExportResponse {
  return {
    request_id: requestId,
    cancelled: false,
    project_session_id: projectSessionId,
    revision_id: revisionId,
    export: {
      file_name: "tutorial-studio-model-r0.prj",
      sha256: "a".repeat(64),
      size_bytes: 2048,
      added_zone_count: 1,
      added_flow_path_count: 1,
      zone_number_by_id: { "draft-zone-1": 8 },
      flow_path_number_by_id: { "draft-flow-1": 12 },
      sketchpad_geometry_written: false,
    },
    error: null,
  };
}

describe("semantic authoring export response", () => {
  it("accepts an exact context-bound copy result", () => {
    expect(semanticAuthoringExportResponseIssue(
      response(),
      requestId,
      projectSessionId,
      revisionId,
      ["draft-zone-1"],
      ["draft-flow-1"],
    )).toBeNull();
  });

  it("rejects stale, path-leaking, or SketchPad-claiming results", () => {
    expect(semanticAuthoringExportResponseIssue(
      { ...response(), revision_id: "7b04d94f-8f8b-41f7-b817-0470820338bc" },
      requestId,
      projectSessionId,
      revisionId,
      ["draft-zone-1"],
      ["draft-flow-1"],
    )?.code).toBe("semantic_authoring_export_context_stale");
    const leaking = response();
    leaking.export = { ...leaking.export!, file_name: "F:\\private\\model.prj" };
    expect(semanticAuthoringExportResponseIssue(
      leaking, requestId, projectSessionId, revisionId, ["draft-zone-1"], ["draft-flow-1"],
    )?.code).toBe("semantic_authoring_export_response_invalid");
    const falseClaim = response();
    falseClaim.export = { ...falseClaim.export!, sketchpad_geometry_written: true as false };
    expect(semanticAuthoringExportResponseIssue(
      falseClaim, requestId, projectSessionId, revisionId, ["draft-zone-1"], ["draft-flow-1"],
    )?.code).toBe("semantic_authoring_export_response_invalid");
  });
});
