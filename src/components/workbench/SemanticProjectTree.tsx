import { Box, ChevronDown, FileCog, GitBranch, Layers3, Network, Table2, Wind } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SemanticNode, SemanticSnapshot } from "../../app/semantic-state";
import { semanticNodeId } from "../../app/semantic-state";

interface Props { snapshot: SemanticSnapshot | null; selectedObjectId: string | null; selectedObjectIds?: string[]; onSelect: (node: SemanticNode, additive: boolean) => void; }
const groups: Array<[keyof SemanticSnapshot, string, typeof Box]> = [["levels", "semantic.levels", Layers3], ["zones", "semantic.zones", Box], ["flow_paths", "semantic.flowPaths", GitBranch], ["schedules", "semantic.schedules", Table2], ["species", "semantic.species", Network], ["sources", "semantic.sources", Wind]];

function label(node: SemanticNode): string { return String(node.name ?? node.label ?? (node.contam_number !== undefined ? `#${node.contam_number}` : node.object_kind ?? "Object")); }

export function SemanticProjectTree({ snapshot, selectedObjectId, selectedObjectIds = [], onSelect }: Props) {
  const { t } = useTranslation();
  if (!snapshot) return null;
  const isSelected = (id: string | null) => Boolean(id && (selectedObjectIds.includes(id) || selectedObjectId === id));
  return <section className="semantic-tree" aria-label={t("semantic.projectTree")}>
    <div className="semantic-tree-heading"><FileCog size={15} aria-hidden="true" /><strong>{t("semantic.projectTree")}</strong></div>
    <button className={`semantic-tree-project ${isSelected(semanticNodeId(snapshot.project)) ? "is-selected" : ""}`} type="button" onClick={(event) => onSelect(snapshot.project, event.ctrlKey || event.metaKey)}><ChevronDown size={13} aria-hidden="true" /><FileCog size={14} aria-hidden="true" /><span>{label(snapshot.project)}</span></button>
    {groups.map(([key, title, Icon]) => { const nodes = snapshot[key] as SemanticNode[]; return <div className="semantic-tree-group" key={String(key)}><div className="semantic-tree-group-title"><Icon size={14} aria-hidden="true" /><span>{t(title, { count: nodes.length })}</span></div><ul>{nodes.map((node) => { const id = semanticNodeId(node); return <li key={id ?? label(node)}><button className={isSelected(id) ? "is-selected" : ""} type="button" onClick={(event) => onSelect(node, event.ctrlKey || event.metaKey)}><span>{label(node)}</span>{node.editable === false ? <small>{t("semantic.readOnly")}</small> : null}</button></li>; })}</ul></div>; })}
    {snapshot.read_only_reason ? <p className="semantic-readonly-reason">{t("semantic.readOnlyReason", { reason: snapshot.read_only_reason })}</p> : null}
  </section>;
}
