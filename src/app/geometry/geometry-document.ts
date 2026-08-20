import type { ReaderDiagnostic } from "../project-state";
import { sanitizeDiagnostic } from "../project-state";
import type { BuildingGeometry } from "./geometry-model";
import { GEOMETRY_HASH_PATTERN, geometrySha256 } from "./geometry-model";
import { validateBuildingGeometry } from "./geometry-validation";
import {
  isContamSemanticDraft,
  semanticDraftSha256,
  type ContamSemanticDraft,
} from "./contam-semantic-draft";

export const GEOMETRY_DOCUMENT_SUMMARY_SCHEMA_VERSION = "geometry_document_summary.v1" as const;

export type GeometryDocumentResponseStatus = "restored" | "not_found" | "saved" | "error";
export type GeometryPersistenceStatus =
  | "idle"
  | "loading"
  | "not_found"
  | "restored"
  | "saving"
  | "saved"
  | "error";

export interface GeometryDocumentSummary {
  schema_version: typeof GEOMETRY_DOCUMENT_SUMMARY_SCHEMA_VERSION;
  project_identity_sha256: string;
  geometry_sha256: string;
  semantic_draft_sha256: string | null;
  document_revision: number;
  saved_at_unix_ms: number;
  recovered_from_backup: boolean;
}

export interface DesktopGeometryDocumentResponse {
  request_id: string;
  status: GeometryDocumentResponseStatus;
  project_session_id: string | null;
  revision_id: string | null;
  geometry: BuildingGeometry | null;
  semantic_draft: ContamSemanticDraft | null;
  summary: GeometryDocumentSummary | null;
  error: ReaderDiagnostic | null;
}

export interface GeometryPersistenceState {
  status: GeometryPersistenceStatus;
  documentRevision: number | null;
  geometryHash: string | null;
  semanticDraftHash: string | null;
  savedAtUnixMs: number | null;
  recoveredFromBackup: boolean;
  issue: ReaderDiagnostic | null;
}

export const INITIAL_GEOMETRY_PERSISTENCE_STATE: GeometryPersistenceState = {
  status: "idle",
  documentRevision: null,
  geometryHash: null,
  semanticDraftHash: null,
  savedAtUnixMs: null,
  recoveredFromBackup: false,
  issue: null,
};

function validSummary(summary: GeometryDocumentSummary): boolean {
  return summary.schema_version === GEOMETRY_DOCUMENT_SUMMARY_SCHEMA_VERSION
    && GEOMETRY_HASH_PATTERN.test(summary.project_identity_sha256)
    && GEOMETRY_HASH_PATTERN.test(summary.geometry_sha256)
    && (summary.semantic_draft_sha256 === null || GEOMETRY_HASH_PATTERN.test(summary.semantic_draft_sha256))
    && Number.isSafeInteger(summary.document_revision)
    && summary.document_revision > 0
    && summary.document_revision <= 4_294_967_295
    && Number.isSafeInteger(summary.saved_at_unix_ms)
    && summary.saved_at_unix_ms > 0
    && typeof summary.recovered_from_backup === "boolean";
}

function responseIssue(code: string, message: string): ReaderDiagnostic {
  return { code, message, source_line_number: null, context: {} };
}

export function geometryDocumentResponseIssue(
  response: DesktopGeometryDocumentResponse,
  requestId: string,
  projectSessionId: string,
  revisionId: string,
): ReaderDiagnostic | null {
  if (response.request_id !== requestId) {
    return responseIssue("geometry_document_response_request_mismatch", "Geometry document response request mismatch");
  }
  if (response.status === "error") {
    return response.error
      ? sanitizeDiagnostic(response.error)
      : responseIssue("geometry_document_response_invalid", "Geometry document error response was incomplete");
  }
  if (response.error
    || response.project_session_id !== projectSessionId
    || response.revision_id !== revisionId) {
    return responseIssue("geometry_document_response_stale", "Geometry document response context mismatch");
  }
  if (response.status === "not_found") {
    return response.geometry === null && response.semantic_draft === null && response.summary === null
      ? null
      : responseIssue("geometry_document_response_invalid", "Geometry document not-found response was invalid");
  }
  if (!response.summary || !validSummary(response.summary)) {
    return responseIssue("geometry_document_response_invalid", "Geometry document summary was invalid");
  }
  if (response.status === "saved") {
    return response.geometry === null && response.semantic_draft === null
      ? null
      : responseIssue("geometry_document_response_invalid", "Geometry document save response leaked a model payload");
  }
  if (!response.geometry) {
    return responseIssue("geometry_document_response_invalid", "Geometry document restore response had no model");
  }
  const validation = validateBuildingGeometry(response.geometry, {
    expectedProjectSessionId: projectSessionId,
    expectedRevisionId: revisionId,
  });
  if (validation.status !== "valid"
    || validation.geometry_hash.toLowerCase() !== response.summary.geometry_sha256.toLowerCase()
    || geometrySha256(response.geometry).toLowerCase() !== response.summary.geometry_sha256.toLowerCase()
    || response.geometry.identity_sha256.toLowerCase() !== response.summary.project_identity_sha256.toLowerCase()) {
    return responseIssue("geometry_document_response_invalid", "Geometry document restore payload failed validation");
  }
  if ((response.semantic_draft === null) !== (response.summary.semantic_draft_sha256 === null)) {
    return responseIssue("geometry_document_response_invalid", "Geometry document semantic draft summary was incomplete");
  }
  if (response.semantic_draft) {
    if (!isContamSemanticDraft(response.semantic_draft)
      || response.semantic_draft.project_session_id !== projectSessionId
      || response.semantic_draft.revision_id !== revisionId
      || response.semantic_draft.identity_sha256.toLowerCase() !== response.geometry.identity_sha256.toLowerCase()
      || response.semantic_draft.source_sha256.toLowerCase() !== response.geometry.source_sha256.toLowerCase()
      || semanticDraftSha256(response.semantic_draft).toLowerCase() !== response.summary.semantic_draft_sha256?.toLowerCase()) {
      return responseIssue("geometry_document_response_invalid", "Geometry document semantic draft failed validation");
    }
  }
  return null;
}

export function persistenceStateFromSummary(
  status: "restored" | "saved",
  summary: GeometryDocumentSummary,
): GeometryPersistenceState {
  return {
    status,
    documentRevision: summary.document_revision,
    geometryHash: summary.geometry_sha256.toLowerCase(),
    semanticDraftHash: summary.semantic_draft_sha256?.toLowerCase() ?? null,
    savedAtUnixMs: summary.saved_at_unix_ms,
    recoveredFromBackup: summary.recovered_from_backup,
    issue: null,
  };
}
