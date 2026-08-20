import { ArrowLeftRight, Cloud, Link2, ShieldCheck, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GeometryFlowPathAnchor, GeometryOpening, GeometryWall } from "../../../app/geometry/geometry-model";
import type {
  WallAirflowBoundary,
  WallFlowPathAudit,
  WallFlowPathOption,
} from "../../../app/geometry/geometry-wall-airflow";

interface WallFlowPathEditorProps {
  opening: GeometryOpening;
  wall: GeometryWall | null;
  boundary: WallAirflowBoundary | null;
  anchor: GeometryFlowPathAnchor | null;
  audit: WallFlowPathAudit | null;
  options: readonly WallFlowPathOption[];
  selectedFlowPathId: string | null;
  zoneLabels: ReadonlyMap<string, string>;
  flowPathLabels: ReadonlyMap<string, string>;
  onSelectFlowPath: (id: string | null) => void;
  onBind: () => void;
  onUnbind: () => void;
}

function endpointLabel(id: string | null, zoneLabels: ReadonlyMap<string, string>, outdoor: string): string {
  return id === null ? outdoor : zoneLabels.get(id) ?? id;
}

export function WallFlowPathEditor({
  opening,
  wall,
  boundary,
  anchor,
  audit,
  options,
  selectedFlowPathId,
  zoneLabels,
  flowPathLabels,
  onSelectFlowPath,
  onBind,
  onUnbind,
}: WallFlowPathEditorProps) {
  const { t } = useTranslation();
  const selected = options.find((option) => option.id === selectedFlowPathId) ?? null;
  const outdoor = t("geometry.editor.wallAirflow.outdoor");
  const boundaryLabel = boundary
    ? t(`geometry.editor.wallAirflow.boundary.${boundary.kind}`)
    : t("geometry.editor.wallAirflow.boundary.unresolved");
  const endpointSummary = boundary
    ? boundary.kind === "interior"
      ? boundary.zoneIds.map((id) => endpointLabel(id, zoneLabels, outdoor)).join(" ↔ ")
      : `${endpointLabel(boundary.zoneIds[0], zoneLabels, outdoor)} ↔ ${outdoor}`
    : t("geometry.editor.wallAirflow.unresolvedHint");

  return (
    <section className={`geometry-wall-flow-editor ${boundary ? `is-${boundary.kind}` : "is-unresolved"}`} aria-label={t("geometry.editor.wallAirflow.title")}>
      <header>
        <span>{boundary?.kind === "exterior" ? <Cloud size={15} /> : <ArrowLeftRight size={15} />}</span>
        <div><strong>{boundaryLabel}</strong><small>{opening.id} · {wall?.kind ?? "unknown"}</small></div>
      </header>
      <p className="geometry-wall-flow-endpoints">{endpointSummary}</p>
      {anchor ? (
        <div className={`geometry-wall-flow-binding is-${audit?.status ?? "unavailable"}`}>
          <div>
            <span><ShieldCheck size={14} />{t(`geometry.editor.wallAirflow.status.${audit?.status ?? "unavailable"}`)}</span>
            <strong>{flowPathLabels.get(anchor.semantic_flow_path_id) ?? anchor.semantic_flow_path_id}</strong>
            <small>
              {endpointLabel(anchor.from_zone_id, zoneLabels, outdoor)} → {endpointLabel(anchor.to_zone_id, zoneLabels, outdoor)}
            </small>
          </div>
          <button type="button" onClick={onUnbind}><Unlink size={13} />{t("geometry.editor.wallAirflow.unbind")}</button>
        </div>
      ) : boundary ? (
        <div className="geometry-wall-flow-picker">
          <label>
            <span>{t("geometry.editor.wallAirflow.matchingFlowPath")}</span>
            <select value={selected?.id ?? ""} onChange={(event) => onSelectFlowPath(event.target.value || null)}>
              <option value="">{t("geometry.editor.wallAirflow.selectMatching")}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} · {endpointLabel(option.fromZoneId, zoneLabels, outdoor)} → {endpointLabel(option.toZoneId, zoneLabels, outdoor)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!selected} onClick={onBind}><Link2 size={14} />{t("geometry.editor.wallAirflow.bind")}</button>
          {!options.length ? <p role="status">{t("geometry.editor.wallAirflow.noMatch")}</p> : null}
        </div>
      ) : (
        <p className="geometry-wall-flow-blocked" role="status">{t("geometry.editor.wallAirflow.unresolvedHint")}</p>
      )}
    </section>
  );
}
