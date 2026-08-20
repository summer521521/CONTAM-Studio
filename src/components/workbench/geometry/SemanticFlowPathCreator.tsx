import { ArrowLeftRight, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  parseMetresToMillimetres,
  parseMultiplierMillionths,
  type DraftFlowPathDefinition,
} from "../../../app/geometry/contam-semantic-authoring";
import type { WallAirflowBoundary } from "../../../app/geometry/geometry-wall-airflow";

interface SemanticFlowElementOption {
  id: string;
  label: string;
}

interface SemanticFlowPathCreatorProps {
  boundary: WallAirflowBoundary;
  elements: readonly SemanticFlowElementOption[];
  zoneLabels: ReadonlyMap<string, string>;
  onCreate: (definition: Omit<DraftFlowPathDefinition, "id">) => boolean;
}

function endpointLabel(zoneId: string | null, zoneLabels: ReadonlyMap<string, string>, outdoor: string): string {
  return zoneId ? zoneLabels.get(zoneId) ?? zoneId : outdoor;
}

export function SemanticFlowPathCreator({
  boundary,
  elements,
  zoneLabels,
  onCreate,
}: SemanticFlowPathCreatorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [flowElementId, setFlowElementId] = useState(elements[0]?.id ?? "");
  const [multiplier, setMultiplier] = useState("1");
  const [relativeHeight, setRelativeHeight] = useState("1");
  const [reverse, setReverse] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!elements.some((element) => element.id === flowElementId)) setFlowElementId(elements[0]?.id ?? "");
  }, [elements, flowElementId]);

  const zoneIds = reverse ? [...boundary.zoneIds].reverse() : [...boundary.zoneIds];
  const fromZoneId = boundary.kind === "exterior" && reverse ? null : zoneIds[0] ?? null;
  const toZoneId = boundary.kind === "exterior" && !reverse ? null : zoneIds[boundary.kind === "interior" ? 1 : 0] ?? null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const multiplierMillionths = parseMultiplierMillionths(multiplier);
    const relativeHeightMm = parseMetresToMillimetres(relativeHeight);
    if (!flowElementId || multiplierMillionths === null || relativeHeightMm === null) {
      setInvalid(true);
      return;
    }
    if (onCreate({ flowElementId, multiplierMillionths, relativeHeightMm, reverse })) {
      setOpen(false);
      setInvalid(false);
    }
  };

  return (
    <section className="geometry-semantic-flow-creator" aria-label={t("geometry.editor.semanticAuthoring.newFlowPath")}>
      <button type="button" disabled={!elements.length} aria-expanded={open} onClick={() => { setOpen((value) => !value); setInvalid(false); }}>
        <Plus size={14} aria-hidden="true" />{t("geometry.editor.semanticAuthoring.newFlowPath")}
      </button>
      {open ? (
        <form onSubmit={submit}>
          <div className="geometry-semantic-flow-direction">
            <span>{endpointLabel(fromZoneId, zoneLabels, t("geometry.editor.semanticAuthoring.outdoor"))}</span>
            <button type="button" aria-label={t("geometry.editor.semanticAuthoring.reverseDirection")} onClick={() => setReverse((value) => !value)}><ArrowLeftRight size={14} /></button>
            <span>{endpointLabel(toZoneId, zoneLabels, t("geometry.editor.semanticAuthoring.outdoor"))}</span>
          </div>
          <label><span>{t("geometry.editor.semanticAuthoring.flowElement")}</span><select value={flowElementId} onChange={(event) => setFlowElementId(event.target.value)}>{elements.map((element) => <option key={element.id} value={element.id}>{element.label}</option>)}</select></label>
          <div className="geometry-semantic-flow-values">
            <label><span>{t("geometry.editor.semanticAuthoring.multiplier")}</span><input inputMode="decimal" value={multiplier} onChange={(event) => setMultiplier(event.target.value)} /></label>
            <label><span>{t("geometry.editor.semanticAuthoring.relativeHeight")}</span><input inputMode="decimal" value={relativeHeight} onChange={(event) => setRelativeHeight(event.target.value)} /><small>m</small></label>
          </div>
          {invalid ? <p role="alert">{t("geometry.editor.semanticAuthoring.flowValuesInvalid")}</p> : null}
          <small>{t("geometry.editor.semanticAuthoring.flowBoundary")}</small>
          <div><button type="button" onClick={() => setOpen(false)}>{t("common.cancel")}</button><button type="submit">{t("geometry.editor.semanticAuthoring.createFlowPath")}</button></div>
        </form>
      ) : elements.length ? null : <small>{t("geometry.editor.semanticAuthoring.noSupportedFlowElements")}</small>}
    </section>
  );
}
