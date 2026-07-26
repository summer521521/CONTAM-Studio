import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttachmentCenterPanel } from "../components/workbench/AttachmentCenterPanel";
import { attachmentReducer, INITIAL_ATTACHMENT_STATE, isSafeAttachmentView, isSafeEvidenceBundle, type AttachmentView } from "./attachment-state";

const attachment: AttachmentView = { attachment_id: "11111111-1111-4111-8111-111111111111", display_name: "table.csv", category: "spreadsheet", size_bytes: 12, sha256_prefix: "a".repeat(12), status: "ready", risk_summary: "table_text_bounded", metadata: { preview_rows: 1 }, evidence_kind: "table_text", selected_by_user: false };

describe("attachment disclosure boundary", () => {
  it("accepts only a closed public attachment shape and invalidates previews on change", () => {
    expect(isSafeAttachmentView(attachment)).toBe(true);
    expect(isSafeAttachmentView({ ...attachment, path: "C:\\secret" })).toBe(false);
    const received = attachmentReducer(INITIAL_ATTACHMENT_STATE, { type: "attachments_received", attachments: [attachment] });
    expect(attachmentReducer({ ...received, bundle: {} as never }, { type: "context_changed" }).bundle).toBeNull();
  });
  it("never accepts pixels or local paths in evidence", () => {
    const bundle = { bundle_id: "22222222-2222-4222-8222-222222222222", project_session_id: "session", revision_id: "33333333-3333-4333-8333-333333333333", language: "en", model_id: "model", created_at_unix_ms: 1, expires_at_unix_ms: 2, bundle_sha256: "b".repeat(64), images_saved_not_sent: true, attachments: [{ attachment_id: attachment.attachment_id, display_name: "image.png", category: "image", sha256: "c".repeat(64), size_bytes: 10, evidence_kind: "image_metadata", content: "Image exists: 1x1; pixels withheld from AI.", disclosure: "image_metadata_only", image_pixels_sent: false }] };
    expect(isSafeEvidenceBundle(bundle)).toBe(true);
    expect(isSafeEvidenceBundle({ ...bundle, attachments: [{ ...bundle.attachments[0], image_pixels_sent: true }] })).toBe(false);
    expect(isSafeEvidenceBundle({ ...bundle, attachments: [{ ...bundle.attachments[0], content: "C:\\secret" }] })).toBe(false);
  });
  it("renders compact keyboard buttons with disabled conflict state", () => {
    const markup = renderToStaticMarkup(<AttachmentCenterPanel state={{ ...INITIAL_ATTACHMENT_STATE, attachments: [attachment], busy: true }} contextAvailable onImport={() => undefined} onSelect={() => undefined} onPreview={() => undefined} onRemove={() => undefined} />);
    expect(markup).toContain("attachment-center");
    expect(markup).toContain("disabled");
  });
});
