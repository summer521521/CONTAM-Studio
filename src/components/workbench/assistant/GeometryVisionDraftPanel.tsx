import { AlertTriangle, CheckCircle2, CircleStop, Image as ImageIcon, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AttachmentState, AttachmentView } from "../../../app/attachment-state";
import type { GeometryVisionDraftController } from "../../../app/runtime/useGeometryVisionDraft";
import type { GeometryOperationInput } from "../../../app/runtime/useGeometryWorkbench";
import { Button } from "../../ui/Button";

interface GeometryVisionDraftPanelProps {
  controller: GeometryVisionDraftController;
  geometryAvailable: boolean;
  codexVisionReady: boolean;
  attachmentState: AttachmentState;
  onAttachmentImport: () => void;
  onAttachmentSelect: (attachment: AttachmentView, selected: boolean) => void;
}

function selectedImage(state: AttachmentState): AttachmentView | null {
  return state.attachments.find((attachment) => attachment.category === "image" && attachment.selected_by_user)
    ?? state.attachments.find((attachment) => attachment.category === "image")
    ?? null;
}

function shortEvidence(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

function stringValue(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : fallback;
}

interface GeometryOperationDisplay {
  operation: GeometryOperationInput["operation"];
  target: string;
  detail: string;
}

function operationDisplay(operation: GeometryOperationInput): GeometryOperationDisplay {
  const parameters = operation.parameters;
  const levelId = stringValue(parameters.level_id);
  if (operation.operation === "add_vertex") {
    const vertex = typeof parameters.vertex === "object" && parameters.vertex !== null
      ? parameters.vertex as Record<string, unknown>
      : {};
    return {
      operation: operation.operation,
      target: stringValue(vertex.id),
      detail: `${numberValue(vertex.x)}, ${numberValue(vertex.y)} mm · ${levelId}`,
    };
  }
  if (operation.operation === "add_wall") {
    const wall = typeof parameters.wall === "object" && parameters.wall !== null
      ? parameters.wall as Record<string, unknown>
      : {};
    return {
      operation: operation.operation,
      target: stringValue(wall.id),
      detail: `${stringValue(wall.start_vertex_id)} → ${stringValue(wall.end_vertex_id)} · ${levelId}`,
    };
  }
  if (operation.operation === "create_zone_region") {
    const zone = typeof parameters.zone_region === "object" && parameters.zone_region !== null
      ? parameters.zone_region as Record<string, unknown>
      : {};
    const vertices = Array.isArray(zone.outer_vertex_ids) ? zone.outer_vertex_ids.length : 0;
    return {
      operation: operation.operation,
      target: stringValue(zone.id),
      detail: `${vertices} vertices · ${stringValue(zone.semantic_zone_id)} · ${levelId}`,
    };
  }
  if (operation.operation === "place_opening") {
    const opening = typeof parameters.opening === "object" && parameters.opening !== null
      ? parameters.opening as Record<string, unknown>
      : {};
    const offset = typeof opening.offset === "number" ? opening.offset : null;
    const width = typeof opening.width === "number" ? opening.width : null;
    const span = offset !== null && width !== null ? `${offset}–${offset + width} mm` : "—";
    return {
      operation: operation.operation,
      target: stringValue(opening.id),
      detail: `${stringValue(opening.kind)} · ${span} · ${stringValue(opening.wall_id)} · ${levelId}`,
    };
  }
  return {
    operation: operation.operation,
    target: levelId,
    detail: "—",
  };
}

const MAX_OPERATION_DETAILS = 256;

export function GeometryVisionDraftPanel({
  controller,
  geometryAvailable,
  codexVisionReady,
  attachmentState,
  onAttachmentImport,
  onAttachmentSelect,
}: GeometryVisionDraftPanelProps) {
  const { t, i18n } = useTranslation();
  const [prompt, setPrompt] = useState(() => t("geometry.deck.ai.defaultPrompt"));
  const [promptEdited, setPromptEdited] = useState(false);
  const image = selectedImage(attachmentState);
  const generating = controller.status === "generating";
  const ready = controller.status === "ready";
  const canGenerate = geometryAvailable && codexVisionReady && image?.selected_by_user === true && !generating;
  const selectedOperationSet = new Set(controller.selectedOperationIndices);
  const autoIncludedOperationSet = new Set(controller.autoIncludedOperationIndices);
  const selectedOperationCount = controller.selectedOperationIndices.length;
  const allOperationsSelected = Boolean(controller.draft?.operations.length)
    && selectedOperationCount === controller.draft?.operations.length;
  const canConfirm = ready && selectedOperationCount > 0 && !controller.issue;

  useEffect(() => {
    if (!promptEdited) setPrompt(t("geometry.deck.ai.defaultPrompt"));
  }, [i18n.resolvedLanguage, promptEdited, t]);

  const imageAction = image
    ? image.selected_by_user ? t("geometry.deck.ai.selected") : t("geometry.deck.ai.useImage")
    : t("geometry.deck.ai.importImage");

  return (
    <section className="assistant-geometry-draft" aria-labelledby="assistant-geometry-draft-title">
      <header className="assistant-geometry-draft-heading">
        <div>
          <h3 id="assistant-geometry-draft-title"><Sparkles size={16} aria-hidden="true" />{t("geometry.deck.ai.assistantTitle")}</h3>
          <p>{t("geometry.deck.ai.assistantHint")}</p>
        </div>
        {ready && controller.canvasPreview ? (
          <span className="assistant-geometry-draft-count" role="status">
            {t("geometry.deck.ai.draftBadge", { count: controller.canvasPreview.operationCount })}
          </span>
        ) : null}
      </header>

      <div className="assistant-geometry-source">
        <ImageIcon size={16} aria-hidden="true" />
        <span title={image?.display_name}>{image?.display_name ?? t("geometry.deck.ai.noImage")}</span>
        <button
          type="button"
          className="secondary-action"
          onClick={() => image ? onAttachmentSelect(image, !image.selected_by_user) : onAttachmentImport()}
          disabled={generating}
        >
          {imageAction}
        </button>
      </div>

      <label className="assistant-field assistant-geometry-prompt">
        <span>{t("geometry.deck.ai.intent")}</span>
        <textarea
          rows={3}
          maxLength={600}
          value={prompt}
          disabled={generating}
          onChange={(event) => {
            setPromptEdited(true);
            setPrompt(event.target.value);
          }}
        />
      </label>

      <div className="assistant-geometry-receipt" role="status" aria-live="polite">
        <span className={codexVisionReady ? "is-ready" : ""}>
          <ImageIcon size={13} aria-hidden="true" />
          {codexVisionReady ? t("geometry.deck.ai.lunaReady") : t("geometry.deck.ai.codexLoginRequired")}
        </span>
        {!geometryAvailable ? <span>{t("geometry.deck.ai.geometryRequired")}</span> : null}
      </div>

      {controller.status === "generating" ? <p className="assistant-progress">{t("geometry.deck.ai.generating")}</p> : null}
      {controller.status === "applied" ? <p className="assistant-geometry-success" role="status"><CheckCircle2 size={14} />{t("geometry.deck.ai.applied")}</p> : null}
      {controller.issue ? (
        <p className="patch-inline-error" role="alert">
          <AlertTriangle size={14} />
          {t(`geometry.deck.ai.errors.${controller.issue.code}`, { defaultValue: controller.issue.message })}
        </p>
      ) : null}

      {controller.draft ? (
        <div className="assistant-geometry-summary">
          <strong>{controller.draft.summary}</strong>
          <dl>
            <div><dt>{t("geometry.deck.ai.confidence", { confidence: controller.draft.confidence_percent })}</dt><dd>{controller.draft.confidence_percent}%</dd></div>
            <div><dt>{t("geometry.deck.ai.operationCount")}</dt><dd>{controller.draft.operations.length}</dd></div>
            <div><dt>{t("geometry.deck.ai.selectedOperationCount")}</dt><dd>{selectedOperationCount}</dd></div>
            <div><dt>{t("geometry.deck.ai.measurementBasis")}</dt><dd>{t(`geometry.deck.ai.measurement.${controller.draft.measurement_basis}`)}</dd></div>
          </dl>
          {controller.draft.warnings.length ? <ul>{controller.draft.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
          <details className="assistant-geometry-details">
            <summary>{t("geometry.deck.ai.details")}</summary>
            <div className="assistant-geometry-details-body">
              <section aria-labelledby="assistant-geometry-evidence-title">
                <h4 id="assistant-geometry-evidence-title">{t("geometry.deck.ai.evidence")}</h4>
                <dl className="assistant-geometry-evidence">
                  <div><dt>{t("geometry.deck.ai.projectSession")}</dt><dd title={controller.draft.project_session_id}>{shortEvidence(controller.draft.project_session_id)}</dd></div>
                  <div><dt>{t("geometry.deck.ai.revision")}</dt><dd title={controller.draft.revision_id}>{shortEvidence(controller.draft.revision_id)}</dd></div>
                  <div><dt>{t("geometry.deck.ai.baseline")}</dt><dd title={controller.draft.baseline_geometry_hash}>{shortEvidence(controller.draft.baseline_geometry_hash)}</dd></div>
                  <div><dt>{t("geometry.deck.ai.attachment")}</dt><dd title={controller.draft.attachment_sha256}>{shortEvidence(controller.draft.attachment_sha256)}</dd></div>
                  <div><dt>{t("geometry.deck.ai.model")}</dt><dd>{controller.modelId ?? t("geometry.deck.ai.notAvailable")}</dd></div>
                  <div><dt>{t("geometry.deck.ai.request")}</dt><dd title={controller.requestId ?? undefined}>{controller.requestId ? shortEvidence(controller.requestId) : t("geometry.deck.ai.notAvailable")}</dd></div>
                </dl>
              </section>
              <section>
                <h4>{t("geometry.deck.ai.observations")}</h4>
                {controller.draft.observations.length ? <ul>{controller.draft.observations.slice(0, 6).map((observation) => <li key={observation}>{observation}</li>)}</ul> : <p>{t("geometry.deck.ai.noItems")}</p>}
              </section>
              <section>
                <h4>{t("geometry.deck.ai.assumptions")}</h4>
                {controller.draft.assumptions.length ? <ul>{controller.draft.assumptions.slice(0, 6).map((assumption) => <li key={assumption}>{assumption}</li>)}</ul> : <p>{t("geometry.deck.ai.noItems")}</p>}
              </section>
              <section>
                <h4>{t("geometry.deck.ai.warnings")}</h4>
                {controller.draft.warnings.length ? <ul>{controller.draft.warnings.slice(0, 6).map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>{t("geometry.deck.ai.noItems")}</p>}
              </section>
              <section>
                <h4>{t("geometry.deck.ai.operationDetails")}</h4>
                <div className="assistant-geometry-selection-toolbar">
                  <span>{t("geometry.deck.ai.selectionSummary", { selected: selectedOperationCount, total: controller.draft.operations.length })}</span>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={controller.status !== "ready" || !controller.draft.operations.length}
                    onClick={() => controller.setAllOperationsSelected(!allOperationsSelected)}
                  >
                    {allOperationsSelected ? t("geometry.deck.ai.deselectAll") : t("geometry.deck.ai.selectAll")}
                  </button>
                </div>
                {controller.autoIncludedOperationIndices.length ? (
                  <p className="assistant-geometry-selection-note" role="status">
                    {t("geometry.deck.ai.selectionDependencies", { count: controller.autoIncludedOperationIndices.length })}
                  </p>
                ) : null}
                {controller.draft.operations.length ? (
                  <ol className="assistant-geometry-operations">
                    {controller.draft.operations.slice(0, MAX_OPERATION_DETAILS).map((operation, index) => {
                      const display = operationDisplay(operation);
                      const selected = selectedOperationSet.has(index);
                      return (
                        <li key={`${display.operation}-${display.target}-${index}`} className={selected ? "is-selected" : "is-unselected"}>
                          <label>
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={controller.status !== "ready"}
                              onChange={() => controller.toggleOperation(index)}
                            />
                            <strong>{t(`geometry.deck.ai.operationType.${display.operation}`, { defaultValue: display.operation })}</strong>
                            {autoIncludedOperationSet.has(index) ? <em>{t("geometry.deck.ai.dependency")}</em> : null}
                          </label>
                          <span>{t("geometry.deck.ai.target")}: {display.target}</span>
                          <span>{t("geometry.deck.ai.detail")}: {display.detail}</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : <p>{t("geometry.deck.ai.noItems")}</p>}
                {controller.draft.operations.length > MAX_OPERATION_DETAILS ? <p>{t("geometry.deck.ai.moreItems", { count: controller.draft.operations.length - MAX_OPERATION_DETAILS })}</p> : null}
              </section>
            </div>
          </details>
        </div>
      ) : null}

      <div className="assistant-actions assistant-geometry-actions">
        <Button
          variant="primary"
          icon={<Sparkles size={15} />}
          loading={generating}
          disabled={!canGenerate}
          onClick={() => void controller.generate(image!.attachment_id, prompt, i18n.resolvedLanguage === "en" ? "en" : "zh-CN")}
        >
          {ready ? t("geometry.deck.ai.regenerate") : t("geometry.deck.ai.generate")}
        </Button>
        {generating ? (
          <button type="button" className="secondary-action" onClick={controller.cancel}>
            <CircleStop size={15} />{t("geometry.deck.ai.stop")}
          </button>
        ) : null}
        {ready ? (
          <>
            <button type="button" className="primary-action" onClick={() => { controller.confirm(); }} disabled={!canConfirm}>
              <CheckCircle2 size={15} />{t("geometry.deck.ai.confirm")}
            </button>
            <button type="button" className="secondary-action" onClick={controller.dismiss}>
              <X size={15} />{t("geometry.deck.ai.cancel")}
            </button>
          </>
        ) : null}
      </div>
      <p className="assistant-safe-note">{t("geometry.deck.ai.assistantBoundary")}</p>
    </section>
  );
}
