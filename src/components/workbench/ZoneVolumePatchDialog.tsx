import { useEffect, useRef } from "react";
import { ArrowLeft, CopyPlus, ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PatchReviewView } from "../../app/patch-state";

interface ZoneVolumePatchDialogProps {
  projectFileName: string;
  review: PatchReviewView;
  applying: boolean;
  issueCode: string | null;
  onBack: () => void;
  onCancel: () => void;
  onApply: () => void;
}

export function ZoneVolumePatchDialog({
  projectFileName,
  review,
  applying,
  issueCode,
  onBack,
  onCancel,
  onApply,
}: ZoneVolumePatchDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !applying) onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [applying, onCancel]);

  return (
    <div className="patch-dialog-backdrop">
      <div
        ref={dialogRef}
        className="patch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="patch-review-title"
        tabIndex={-1}
      >
        <header className="patch-dialog-header">
          <div>
            <span>{t("patch.reviewEyebrow")}</span>
            <h2 id="patch-review-title">{t("patch.reviewTitle")}</h2>
          </div>
          <button type="button" className="panel-icon-button" onClick={onCancel} disabled={applying} aria-label={t("patch.cancel")}>
            <X size={17} />
          </button>
        </header>

        <div className="patch-dialog-body">
          <div className="patch-review-summary">
            <div><span>{t("patch.project")}</span><strong>{projectFileName}</strong></div>
            <div><span>{t("patch.zone")}</span><strong>{review.zone_name} · #{review.zone_number}</strong></div>
            <div><span>{t("patch.field")}</span><strong>{t("patch.volumeField")}</strong></div>
            <div><span>{t("patch.sourceLine")}</span><strong>{review.source_line_number}</strong></div>
            <div><span>{t("patch.oldValue")}</span><code>{review.old_token}</code></div>
            <div><span>{t("patch.newValue")}</span><code>{review.new_token}</code></div>
          </div>

          <div className="patch-diff" aria-label={t("patch.diffLabel")}>
            <div className="patch-diff-meta">{review.diff_text.split("\n").slice(0, 3).join("\n")}</div>
            <div className="patch-diff-old">-{review.old_line}</div>
            <div className="patch-diff-new">+{review.new_line}</div>
          </div>

          <div className="patch-safety-note">
            <ShieldCheck size={19} aria-hidden="true" />
            <div>
              <strong>{t("patch.originalUnchanged")}</strong>
              <p>{t("patch.copyOnlyBoundary")}</p>
              <p>{t("patch.bytePreservation")}</p>
            </div>
          </div>

          {issueCode ? (
            <p className="patch-inline-error" role="alert">
              {t(`errors.codes.${issueCode}`, { defaultValue: t("errors.codes.unknown") })}
            </p>
          ) : null}
        </div>

        <footer className="patch-dialog-actions">
          <button type="button" className="secondary-action" onClick={onBack} disabled={applying}>
            <ArrowLeft size={16} />{t("patch.backToEdit")}
          </button>
          <button type="button" className="secondary-action" onClick={onCancel} disabled={applying}>{t("patch.cancel")}</button>
          <button type="button" className="primary-action" onClick={onApply} disabled={applying}>
            {applying ? <span className="loading-indicator" /> : <CopyPlus size={16} />}
            {t(applying ? "patch.creatingCopy" : "patch.saveAsCopy")}
          </button>
        </footer>
      </div>
    </div>
  );
}
