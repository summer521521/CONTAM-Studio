import { Check, RotateCcw, RotateCw, Save, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SemanticNode, SemanticOperationRequest, SemanticState } from "../../app/semantic-state";
import { semanticNodeId } from "../../app/semantic-state";

interface Props { node: SemanticNode | null; selectedNodes?: SemanticNode[]; state: SemanticState; onEdit: (operations: SemanticOperationRequest[]) => void; onUndo: () => void; onRedo: () => void; onPlan: () => void; onApply: () => void; onDiscard: () => void; }
function currentValue(node: SemanticNode, field: string): string { const fields = node.fields ?? {}; const value = fields[field] ?? node[field]; return value === undefined || value === null ? "" : String(value); }
export function SemanticPropertyPanel({ node, selectedNodes = [], state, onEdit, onUndo, onRedo, onPlan, onApply, onDiscard }: Props) {
  const { t } = useTranslation();
  if (!node) return null;
  const id = semanticNodeId(node);
  if (!id) return null;
  const targets = selectedNodes.length ? selectedNodes : [node];
  const reviewLocked = state.status === "planning" || state.status === "review" || state.status === "applying";
  const editable = (field: string) => targets.every((target) => target.capabilities?.[field]?.state === "editable_via_patch" && target.editable !== false);
  const setField = (operation: SemanticOperationRequest, value: string) => {
    if (reviewLocked) return;
    const targetIds = new Set(targets.map((target) => semanticNodeId(target)).filter((targetId): targetId is string => Boolean(targetId)));
    const remaining = state.operations.filter((item) => !(targetIds.has(item.object_id) && item.operation === operation.operation));
    onEdit([...remaining, ...targets.map((target) => ({ ...operation, object_id: semanticNodeId(target) ?? id, new_value: value }))]);
  };
  const nameOperation: SemanticOperationRequest = { operation: "set_zone_name", object_id: id, new_value: currentValue(node, "name"), unit: null };
  const volumeOperation: SemanticOperationRequest = { operation: "set_zone_volume", object_id: id, new_value: currentValue(node, "volume_m3"), unit: "m3" };
  const multiplierOperation: SemanticOperationRequest = { operation: "set_flow_path_multiplier", object_id: id, new_value: currentValue(node, "multiplier"), unit: "1" };
  const name = node.name ?? node.label ?? node.object_kind ?? t("semantic.object");
  return <section className="semantic-property-panel" aria-label={t("semantic.properties")}>
    <div className="context-title"><Save size={17} aria-hidden="true" /><div><span>{t("semantic.properties")}</span><strong>{String(name)}</strong></div></div>
    <dl className="property-list">
      <div><dt>{t("semantic.objectType")}</dt><dd>{String(node.object_kind ?? "Object")}</dd></div>
      <div><dt>{t("semantic.objectId")}</dt><dd>{id}</dd></div>
      {targets.length > 1 ? <div><dt>{t("semantic.selectionCount")}</dt><dd>{targets.length}</dd></div> : null}
      {node.source_line_number !== undefined ? <div><dt>{t("semantic.sourceLine")}</dt><dd>{String(node.source_line_number)}</dd></div> : null}
      {node.source_sha256 ? <div><dt>{t("semantic.sourceHash")}</dt><dd className="semantic-hash" title={String(node.source_sha256)}>{String(node.source_sha256).slice(0, 16)}...</dd></div> : null}
      {node.source_span ? <div><dt>{t("semantic.sourceSpan")}</dt><dd>{JSON.stringify(node.source_span)}</dd></div> : null}
      {editable("name") ? <div><dt>{t("inspector.name")}</dt><dd><input className="semantic-field-input" disabled={reviewLocked} value={state.operations.find((item) => item.object_id === id && item.operation === "set_zone_name")?.new_value ?? currentValue(node, "name")} onChange={(event) => setField(nameOperation, event.target.value)} /></dd></div> : null}
      {editable("volume_m3") ? <div><dt>{t("inspector.volume")}</dt><dd><input className="semantic-field-input" disabled={reviewLocked} inputMode="decimal" value={state.operations.find((item) => item.object_id === id && item.operation === "set_zone_volume")?.new_value ?? currentValue(node, "volume_m3")} onChange={(event) => setField(volumeOperation, event.target.value)} /><span className="field-unit">m³</span></dd></div> : null}
      {editable("multiplier") ? <div><dt>{t("semantic.multiplier")}</dt><dd><input className="semantic-field-input" disabled={reviewLocked} inputMode="decimal" value={state.operations.find((item) => item.object_id === id && item.operation === "set_flow_path_multiplier")?.new_value ?? currentValue(node, "multiplier")} onChange={(event) => setField(multiplierOperation, event.target.value)} /></dd></div> : null}
      {!editable("name") && !editable("volume_m3") && !editable("multiplier") ? <div><dt>{t("semantic.status")}</dt><dd>{t("semantic.readOnly")}{node["rejection_code"] ? `: ${String(node["rejection_code"])}` : ""}</dd></div> : null}
    </dl>
    {state.operations.length ? <div className="semantic-diff" aria-live="polite"><strong>{t("semantic.pendingChanges", { count: state.operations.length })}</strong>{state.operations.map((item) => <div key={`${item.object_id}:${item.operation}`}><span>{item.operation}</span><span>{item.new_value}</span></div>)}</div> : null}
    {state.plan?.diff ? <div className="semantic-diff semantic-review" aria-live="polite"><strong>{t("semantic.reviewTitle", { count: state.plan.diff.length })}</strong>{state.plan.source_sha256 ? <p>{t("semantic.sourceHash")}: <code>{state.plan.source_sha256.slice(0, 16)}...</code></p> : null}{state.plan.patch_sha256 ? <p>{t("semantic.patchHash")}: <code>{state.plan.patch_sha256.slice(0, 16)}...</code></p> : null}{state.plan.diff.map((item) => <div key={`${item.object_id}:${item.operation}`}><span>{item.object_id.slice(0, 12)}... · {item.field}</span><span>{item.old_value} → {item.new_value}</span></div>)}</div> : null}
    <div className="semantic-actions">
      <button type="button" className="secondary-action" onClick={onUndo} disabled={reviewLocked || !state.undo.length}><RotateCcw size={14} />{t("semantic.undo")}</button>
      <button type="button" className="secondary-action" onClick={onRedo} disabled={reviewLocked || !state.redo.length}><RotateCw size={14} />{t("semantic.redo")}</button>
      <button type="button" className="secondary-action" onClick={onDiscard} disabled={!state.operations.length && !state.plan}><X size={14} />{t("semantic.discard")}</button>
      {state.status === "review" && state.plan ? <button type="button" className="primary-action" onClick={onApply}><Check size={14} />{t("semantic.apply")}</button> : <button type="button" className="primary-action" onClick={onPlan} disabled={!state.operations.length || state.status === "planning" || state.status === "applying"}>{t("semantic.reviewDiff")}</button>}
    </div>
    {state.issue ? <p className="patch-inline-error" role="alert">{t(`errors.codes.${state.issue.code}`, { defaultValue: state.issue.message })}</p> : null}
  </section>;
}
