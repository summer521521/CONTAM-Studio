import { useTranslation } from "react-i18next";
import type { AiSemanticPatchSuggestion } from "../../../app/ai-state";
import { semanticNodeId, semanticNodes, type SemanticSnapshot } from "../../../app/semantic-state";
import { Button } from "../../ui/Button";

function currentValue(snapshot: SemanticSnapshot | null, objectId: string, field: string): string {
  const node = snapshot ? semanticNodes(snapshot).find((item) => semanticNodeId(item) === objectId) : null;
  const value = node?.fields?.[field] ?? node?.[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : "—";
}

export function AssistantPatchProposal({ patch, snapshot, onReview }: { patch: AiSemanticPatchSuggestion; snapshot: SemanticSnapshot | null; onReview: (patch: AiSemanticPatchSuggestion) => void }) {
  const { t } = useTranslation();
  return <section className="assistant-semantic-patch"><h5>{t("assistant.semanticPatchTitle")}</h5><div className="assistant-patch-operations">{patch.operations.map((operation) => <dl key={`${operation.object_id}:${operation.field}`}><div><dt>{t("assistant.patch.target")}</dt><dd><code>{operation.object_id.slice(0, 12)}</code></dd></div><div><dt>{t("assistant.patch.field")}</dt><dd>{operation.field}</dd></div><div><dt>{t("assistant.patch.current")}</dt><dd>{currentValue(snapshot, operation.object_id, operation.field)}</dd></div><div><dt>{t("assistant.patch.suggested")}</dt><dd>{operation.new_value}{operation.unit ? ` ${operation.unit}` : ""}</dd></div><div><dt>{t("assistant.patch.evidence")}</dt><dd>{t(`assistant.patch.evidenceKinds.${operation.evidence}`)}</dd></div></dl>)}</div><Button variant="primary" onClick={() => onReview(patch)}>{t("assistant.reviewSemanticPatch")}</Button><p className="assistant-safe-note">{t("assistant.patch.reviewBoundary")}</p></section>;
}
