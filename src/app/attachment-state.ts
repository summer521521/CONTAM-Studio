import { sanitizeDiagnostic, type ReaderDiagnostic } from "./project-state";

export type AttachmentStatus = "importing" | "ready" | "unsupported" | "blocked" | "changed" | "removed" | "error";

export interface AttachmentView {
  attachment_id: string;
  display_name: string;
  category: string;
  size_bytes: number;
  sha256_prefix: string;
  status: Exclude<AttachmentStatus, "importing" | "removed" | "error">;
  risk_summary: string;
  metadata: Record<string, string | number | boolean>;
  evidence_kind: string | null;
  selected_by_user: boolean;
}

export interface AttachmentEvidenceView {
  attachment_id: string;
  display_name: string;
  category: string;
  sha256: string;
  size_bytes: number;
  evidence_kind: string;
  content: string;
  disclosure: "bounded_text" | "metadata_only" | "image_metadata_only";
  image_pixels_sent: false;
}

export interface AttachmentEvidenceBundleView {
  bundle_id: string;
  project_session_id: string;
  revision_id: string;
  language: string;
  model_id: string;
  created_at_unix_ms: number;
  expires_at_unix_ms: number;
  bundle_sha256: string;
  attachments: AttachmentEvidenceView[];
  images_saved_not_sent: boolean;
}

export interface AttachmentState {
  attachments: AttachmentView[];
  busy: boolean;
  bundle: AttachmentEvidenceBundleView | null;
  issue: ReaderDiagnostic | null;
}

export const INITIAL_ATTACHMENT_STATE: AttachmentState = { attachments: [], busy: false, bundle: null, issue: null };

export type AttachmentAction =
  | { type: "operation_started" }
  | { type: "attachments_received"; attachments: AttachmentView[] }
  | { type: "operation_failed"; issue: ReaderDiagnostic }
  | { type: "bundle_received"; bundle: AttachmentEvidenceBundleView }
  | { type: "context_changed" };

export function attachmentReducer(state: AttachmentState, action: AttachmentAction): AttachmentState {
  switch (action.type) {
    case "operation_started": return { ...state, busy: true, issue: null };
    case "attachments_received": return { attachments: action.attachments, busy: false, bundle: null, issue: null };
    case "operation_failed": return { ...state, busy: false, issue: sanitizeDiagnostic(action.issue) };
    case "bundle_received": return { ...state, busy: false, bundle: action.bundle, issue: null };
    case "context_changed": return { ...state, bundle: null };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const PREFIX = /^[0-9a-f]{12}$/i;
function safeText(value: unknown, max: number, multiline = false): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value) && !/(?:[A-Za-z]:[\\/]|\\\\|file:\/\/)/i.test(value);
}
function safeMetadata(value: unknown): value is Record<string, string | number | boolean> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length <= 12 && Object.entries(value as Record<string, unknown>).every(([key, item]) => /^[a-z_]{1,48}$/.test(key) && (typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)) || safeText(item, 120)));
}
export function isSafeAttachmentView(value: unknown): value is AttachmentView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = ["attachment_id", "display_name", "category", "size_bytes", "sha256_prefix", "status", "risk_summary", "metadata", "evidence_kind", "selected_by_user"];
  if (Object.keys(item).length !== keys.length || !keys.every((key) => key in item)) return false;
  return UUID.test(String(item.attachment_id)) && typeof item.display_name === "string" && item.display_name.length > 0 && item.display_name.length <= 160 && !/[\\/]/.test(item.display_name) && typeof item.category === "string" && item.category.length > 0 && typeof item.size_bytes === "number" && Number.isSafeInteger(item.size_bytes) && item.size_bytes >= 0 && PREFIX.test(String(item.sha256_prefix)) && ["ready", "unsupported", "blocked", "changed"].includes(String(item.status)) && typeof item.risk_summary === "string" && item.risk_summary.length > 0 && safeMetadata(item.metadata) && (item.evidence_kind === null || typeof item.evidence_kind === "string") && typeof item.selected_by_user === "boolean" && !/(?:[A-Za-z]:[\\/]|\\\\|file:\/\/)/i.test(JSON.stringify(item));
}
export function isSafeEvidenceBundle(value: unknown): value is AttachmentEvidenceBundleView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const bundle = value as Record<string, unknown>;
  const keys = ["bundle_id", "project_session_id", "revision_id", "language", "model_id", "created_at_unix_ms", "expires_at_unix_ms", "bundle_sha256", "attachments", "images_saved_not_sent"];
  if (Object.keys(bundle).length !== keys.length || !keys.every((key) => key in bundle) || !UUID.test(String(bundle.bundle_id)) || !safeText(bundle.project_session_id, 128) || !UUID.test(String(bundle.revision_id)) || !safeText(bundle.language, 24) || !safeText(bundle.model_id, 160) || !Number.isSafeInteger(bundle.created_at_unix_ms) || !Number.isSafeInteger(bundle.expires_at_unix_ms) || Number(bundle.expires_at_unix_ms) <= Number(bundle.created_at_unix_ms) || !HASH.test(String(bundle.bundle_sha256)) || typeof bundle.images_saved_not_sent !== "boolean" || !Array.isArray(bundle.attachments) || bundle.attachments.length === 0 || bundle.attachments.length > 32) return false;
  return bundle.attachments.every(isSafeAttachmentEvidence);
}
export function isSafeAttachmentEvidence(value: unknown): value is AttachmentEvidenceView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const itemKeys = ["attachment_id", "display_name", "category", "sha256", "size_bytes", "evidence_kind", "content", "disclosure", "image_pixels_sent"];
  if (Object.keys(item).length !== itemKeys.length || !itemKeys.every((key) => key in item)) return false;
  return UUID.test(String(item.attachment_id)) && typeof item.display_name === "string" && item.display_name.length > 0 && typeof item.category === "string" && item.category.length > 0 && HASH.test(String(item.sha256)) && typeof item.size_bytes === "number" && Number.isSafeInteger(item.size_bytes) && item.size_bytes >= 0 && typeof item.evidence_kind === "string" && typeof item.content === "string" && item.content.length > 0 && item.content.length <= 65536 && ["bounded_text", "metadata_only", "image_metadata_only"].includes(String(item.disclosure)) && item.image_pixels_sent === false && !/(?:[A-Za-z]:[\\/]|\\\\|file:\/\/)/i.test(JSON.stringify(item));
}
