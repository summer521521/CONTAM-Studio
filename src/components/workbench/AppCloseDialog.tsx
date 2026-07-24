import { AlertTriangle, Download, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { CloseRequestView } from "../../app/close-state";

interface AppCloseDialogProps {
  request: CloseRequestView;
  busy: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onExport: () => void;
}

export function AppCloseDialog({ request, busy, onCancel, onDiscard, onExport }: AppCloseDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasActiveWork = request.active_work.length > 0;

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])");
    (first ?? dialogRef.current)?.focus();
    return () => {
      const previous = previousFocusRef.current;
      if (previous?.isConnected) window.setTimeout(() => previous.focus(), 0);
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onCancel]);

  return (
    <div className="patch-dialog-backdrop close-dialog-backdrop" data-app-close-lock="true">
      <div
        ref={dialogRef}
        className="patch-dialog close-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-close-title"
        aria-describedby="app-close-description"
        tabIndex={-1}
      >
        <header className="patch-dialog-header">
          <div>
            <span>{t("close.eyebrow")}</span>
            <h2 id="app-close-title">{t("close.title")}</h2>
          </div>
          <button className="panel-icon-button" type="button" disabled={busy} onClick={onCancel} aria-label={t("close.cancel")} title={t("close.cancel")}>
            <X size={17} />
          </button>
        </header>
        <div className="patch-dialog-body">
          <div className="patch-safety-note" id="app-close-description">
            {busy ? <LoaderCircle className="loading-indicator" size={19} aria-hidden="true" /> : <AlertTriangle size={19} aria-hidden="true" />}
            <div>
              <strong>{hasActiveWork ? t("close.activeTitle") : t("close.draftTitle")}</strong>
              <p>{hasActiveWork ? t("close.activeBody") : t("close.draftBody")}</p>
            </div>
          </div>
          {hasActiveWork ? (
            <ul className="close-work-list">
              {request.active_work.map((work) => <li key={work}>{t(`close.work.${work}`)}</li>)}
            </ul>
          ) : null}
        </div>
        <footer className="patch-dialog-actions">
          <button className="secondary-action" type="button" disabled={busy} onClick={onCancel}><X size={16} />{t("close.cancel")}</button>
          {!hasActiveWork && request.draft_decision_required ? (
            <>
              <button className="secondary-action" type="button" disabled={busy} onClick={onDiscard}><Trash2 size={16} />{t("close.discard")}</button>
              <button className="primary-action" type="button" disabled={busy} onClick={onExport}>{busy ? <LoaderCircle className="loading-indicator" size={16} aria-hidden="true" /> : <Download size={16} />}{t(busy ? "close.exporting" : "close.export")}</button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
