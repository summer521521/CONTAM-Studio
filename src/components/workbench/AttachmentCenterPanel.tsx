import { Eye, Paperclip, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AttachmentState, AttachmentView } from "../../app/attachment-state";

interface AttachmentCenterPanelProps {
  state: AttachmentState;
  contextAvailable: boolean;
  onImport: () => void;
  onSelect: (attachment: AttachmentView, selected: boolean) => void;
  onPreview: () => void;
  onRemove: (attachment: AttachmentView) => void;
}

export function AttachmentCenterPanel({ state, contextAvailable, onImport, onSelect, onPreview, onRemove }: AttachmentCenterPanelProps) {
  const { i18n } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const zh = (i18n.language ?? "en").toLowerCase().startsWith("zh");
  const text = zh ? {
    title: "附件", add: "添加附件", local: "已保存在本机，尚未发送给AI", confirm: "确认披露范围", preview: "预览", remove: "移除Studio副本", selected: "作为AI证据", noPixels: "图片已保存，但未发送像素给AI", noAttachments: "尚未添加附件",
  } : {
    title: "Attachments", add: "Add attachment", local: "Saved locally and not sent to AI", confirm: "Confirm disclosure scope", preview: "Preview", remove: "Remove Studio copy", selected: "Use as AI evidence", noPixels: "Image saved; pixels were not sent to AI", noAttachments: "No attachments added",
  };
  const selected = state.attachments.some((attachment) => attachment.selected_by_user);
  return <section className="attachment-center" aria-labelledby="attachment-center-title">
    <div className="assistant-archive-heading">
      <div><h3 id="attachment-center-title"><Paperclip size={17} aria-hidden="true" />{text.title}</h3><p>{text.local}</p></div>
      <button type="button" className="secondary-action" onClick={onImport} disabled={state.busy} title={text.add}><Paperclip size={15} />{text.add}</button>
    </div>
    {state.attachments.length === 0 ? <p className="assistant-safe-note">{text.noAttachments}</p> : <ul className="attachment-list">
      {state.attachments.map((attachment) => <li key={attachment.attachment_id} className={`attachment-row attachment-${attachment.status}`}>
        <label><input type="checkbox" checked={attachment.selected_by_user} disabled={state.busy || attachment.status !== "ready" || !attachment.evidence_kind} onChange={(event) => onSelect(attachment, event.target.checked)} /><span className="sr-only">{text.selected} {attachment.display_name}</span></label>
        <div className="attachment-summary"><strong>{attachment.display_name}</strong><span>{attachment.category} · {attachment.size_bytes} B · {attachment.sha256_prefix}</span><span>{attachment.status}: {attachment.risk_summary}</span></div>
        <button type="button" className="panel-icon-button" aria-label={`${text.preview} ${attachment.display_name}`} title={text.preview} onClick={() => setExpanded(expanded === attachment.attachment_id ? null : attachment.attachment_id)}><Eye size={15} /></button>
        <button type="button" className="panel-icon-button" aria-label={`${text.remove} ${attachment.display_name}`} title={text.remove} disabled={state.busy} onClick={() => onRemove(attachment)}><Trash2 size={15} /></button>
        {expanded === attachment.attachment_id ? <p className="attachment-details">{attachment.evidence_kind === "image_metadata" ? text.noPixels : `${attachment.evidence_kind ?? attachment.category} · ${attachment.sha256_prefix}`}</p> : null}
      </li>)}
    </ul>}
    {state.issue ? <p className="patch-inline-error" role="alert">{state.issue.message}</p> : null}
    {state.attachments.length ? <button type="button" className="secondary-action assistant-wide-action" onClick={onPreview} disabled={state.busy || !contextAvailable || !selected}>{text.confirm}</button> : null}
    {state.bundle ? <div className="attachment-evidence-preview"><p>{state.bundle.attachments.length} · {state.bundle.bundle_sha256.slice(0, 12)}</p>{state.bundle.images_saved_not_sent ? <p>{text.noPixels}</p> : null}</div> : null}
  </section>;
}
