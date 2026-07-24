import { AlertTriangle, Download, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface DraftSwitchDialogProps {
  busy: boolean;
  onCancel: () => void;
  onExport: () => void;
  onDiscard: () => void;
}

export function DraftSwitchDialog({ busy, onCancel, onExport, onDiscard }: DraftSwitchDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onCancel]);

  return (
    <div className="patch-dialog-backdrop" data-draft-switch-lock="true">
      <div ref={dialogRef} className="patch-dialog draft-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="draft-switch-title" tabIndex={-1}>
        <header className="patch-dialog-header">
          <div><span>{t("draft.switchEyebrow")}</span><h2 id="draft-switch-title">{t("draft.switchTitle")}</h2></div>
          <button className="panel-icon-button" type="button" aria-label={t("draft.cancelSwitch")} title={t("draft.cancelSwitch")} disabled={busy} onClick={onCancel}><X size={17} /></button>
        </header>
        <div className="patch-dialog-body">
          <div className="patch-safety-note"><AlertTriangle size={19} aria-hidden="true" /><div><strong>{t("draft.switchWarning")}</strong><p>{t("draft.switchBody")}</p></div></div>
        </div>
        <footer className="patch-dialog-actions">
          <button className="secondary-action" type="button" disabled={busy} onClick={onCancel}><X size={16} />{t("draft.cancelSwitch")}</button>
          <button className="secondary-action" type="button" disabled={busy} onClick={onDiscard}><Trash2 size={16} />{t("draft.discardAndOpen")}</button>
          <button className="primary-action" type="button" disabled={busy} onClick={onExport}>{busy ? <span className="loading-indicator" /> : <Download size={16} />}{t(busy ? "draft.exportingAndOpening" : "draft.exportAndOpen")}</button>
        </footer>
      </div>
    </div>
  );
}
