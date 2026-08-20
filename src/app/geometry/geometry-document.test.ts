import { describe, expect, it } from "vitest";
import metricFixture from "../../../contracts/geometry/examples/studio-metric-valid.json";
import type { BuildingGeometry } from "./geometry-model";
import { cloneBuildingGeometry, geometrySha256 } from "./geometry-model";
import {
  geometryDocumentResponseIssue,
  persistenceStateFromSummary,
  type DesktopGeometryDocumentResponse,
} from "./geometry-document";

function geometry(): BuildingGeometry {
  return cloneBuildingGeometry(metricFixture as BuildingGeometry);
}

function response(): DesktopGeometryDocumentResponse {
  const model = geometry();
  return {
    request_id: "request-1",
    status: "restored",
    project_session_id: model.project_session_id,
    revision_id: model.revision_id,
    geometry: model,
    semantic_draft: null,
    summary: {
      schema_version: "geometry_document_summary.v1",
      project_identity_sha256: model.identity_sha256,
      geometry_sha256: geometrySha256(model),
      semantic_draft_sha256: null,
      document_revision: 2,
      saved_at_unix_ms: 1_700_000_000_000,
      recovered_from_backup: true,
    },
    error: null,
  };
}

describe("project geometry document boundary", () => {
  it("accepts an identity-bound restored geometry and exposes backup recovery", () => {
    const value = response();
    expect(geometryDocumentResponseIssue(value, "request-1", "project-1", "revision-1")).toBeNull();
    expect(persistenceStateFromSummary("restored", value.summary!)).toMatchObject({
      status: "restored",
      documentRevision: 2,
      recoveredFromBackup: true,
    });
  });

  it("rejects stale, tampered, and save responses that echo model data", () => {
    const stale = response();
    stale.project_session_id = "project-2";
    expect(geometryDocumentResponseIssue(stale, "request-1", "project-1", "revision-1")?.code).toBe("geometry_document_response_stale");

    const tampered = response();
    tampered.geometry!.geometry_revision += 1;
    expect(geometryDocumentResponseIssue(tampered, "request-1", "project-1", "revision-1")?.code).toBe("geometry_document_response_invalid");

    const leaked = response();
    leaked.status = "saved";
    expect(geometryDocumentResponseIssue(leaked, "request-1", "project-1", "revision-1")?.code).toBe("geometry_document_response_invalid");
  });

  it("accepts an exact not-found response without treating it as an error", () => {
    const value: DesktopGeometryDocumentResponse = {
      request_id: "request-2",
      status: "not_found",
      project_session_id: "project-1",
      revision_id: "revision-1",
      geometry: null,
      semantic_draft: null,
      summary: null,
      error: null,
    };
    expect(geometryDocumentResponseIssue(value, "request-2", "project-1", "revision-1")).toBeNull();
  });
});
