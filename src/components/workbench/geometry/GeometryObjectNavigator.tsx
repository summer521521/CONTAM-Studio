import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  GeometryLevel,
  GeometryVerticalFlowPathAnchor,
  GeometryVerticalOpening,
} from "../../../app/geometry/geometry-model";
import type { GeometrySelection } from "../../../app/runtime/useGeometryWorkbench";

const PAGE_SIZE = 50;
const EMPTY_LEVEL_NAMES: ReadonlyMap<string, string> = new Map();

export interface GeometryNavigatorItem {
  key: string;
  label: string;
  detail: string;
  selection: GeometrySelection;
  semanticZoneId: string | null;
  semanticFlowPathId: string | null;
}

export function geometryNavigatorItems(
  level: GeometryLevel | null,
  zoneLabels: ReadonlyMap<string, string>,
  flowPathLabels: ReadonlyMap<string, string>,
  verticalOpenings: readonly GeometryVerticalOpening[] = [],
  verticalAnchors: readonly GeometryVerticalFlowPathAnchor[] = [],
  levelNames: ReadonlyMap<string, string> = EMPTY_LEVEL_NAMES,
): GeometryNavigatorItem[] {
  if (!level) return [];
  const activeOpenings = verticalOpenings.filter((opening) => (
    opening.lower_level_id === level.id || opening.upper_level_id === level.id
  ));
  const activeOpeningIds = new Set(activeOpenings.map((opening) => opening.id));
  return [
    ...level.zone_regions.map((region) => ({
      key: `zone:${region.id}`,
      label: zoneLabels.get(region.semantic_zone_id) ?? region.semantic_zone_id,
      detail: region.id,
      selection: { kind: "zone" as const, id: region.id },
      semanticZoneId: region.semantic_zone_id,
      semanticFlowPathId: null,
    })),
    ...level.walls.map((wall) => ({
      key: `wall:${wall.id}`,
      label: wall.id,
      detail: wall.kind,
      selection: { kind: "wall" as const, id: wall.id },
      semanticZoneId: null,
      semanticFlowPathId: null,
    })),
    ...level.openings.map((opening) => ({
      key: `opening:${opening.id}`,
      label: opening.id,
      detail: opening.kind,
      selection: { kind: "opening" as const, id: opening.id },
      semanticZoneId: null,
      semanticFlowPathId: null,
    })),
    ...level.flow_path_anchors.map((anchor) => ({
      key: `flow_path:${anchor.id}`,
      label: flowPathLabels.get(anchor.semantic_flow_path_id) ?? anchor.semantic_flow_path_id,
      detail: anchor.id,
      selection: { kind: "flow_path" as const, id: anchor.id },
      semanticZoneId: null,
      semanticFlowPathId: anchor.semantic_flow_path_id,
    })),
    ...activeOpenings.map((opening) => ({
      key: `vertical_opening:${opening.id}`,
      label: opening.id,
      detail: `${opening.kind} · ${levelNames.get(opening.lower_level_id) ?? opening.lower_level_id} ↕ ${levelNames.get(opening.upper_level_id) ?? opening.upper_level_id}`,
      selection: { kind: "vertical_opening" as const, id: opening.id },
      semanticZoneId: null,
      semanticFlowPathId: null,
    })),
    ...verticalAnchors.filter((anchor) => activeOpeningIds.has(anchor.vertical_opening_id)).map((anchor) => ({
      key: `vertical_flow_path:${anchor.id}`,
      label: flowPathLabels.get(anchor.semantic_flow_path_id) ?? anchor.semantic_flow_path_id,
      detail: anchor.vertical_opening_id,
      selection: { kind: "vertical_flow_path" as const, id: anchor.id },
      semanticZoneId: null,
      semanticFlowPathId: anchor.semantic_flow_path_id,
    })),
    ...level.vertices.map((vertex) => ({
      key: `vertex:${vertex.id}`,
      label: vertex.id,
      detail: `${vertex.x}, ${vertex.y}`,
      selection: { kind: "vertex" as const, id: vertex.id },
      semanticZoneId: null,
      semanticFlowPathId: null,
    })),
  ];
}

interface GeometryObjectNavigatorProps {
  level: GeometryLevel | null;
  zoneLabels: ReadonlyMap<string, string>;
  flowPathLabels: ReadonlyMap<string, string>;
  verticalOpenings?: readonly GeometryVerticalOpening[];
  verticalAnchors?: readonly GeometryVerticalFlowPathAnchor[];
  levelNames?: ReadonlyMap<string, string>;
  selection: GeometrySelection | null;
  onSelect: (item: GeometryNavigatorItem) => void;
}

export function GeometryObjectNavigator({
  level,
  zoneLabels,
  flowPathLabels,
  verticalOpenings = [],
  verticalAnchors = [],
  levelNames = EMPTY_LEVEL_NAMES,
  selection,
  onSelect,
}: GeometryObjectNavigatorProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const items = useMemo(
    () => geometryNavigatorItems(level, zoneLabels, flowPathLabels, verticalOpenings, verticalAnchors, levelNames),
    [flowPathLabels, level, levelNames, verticalAnchors, verticalOpenings, zoneLabels],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return items;
    return items.filter((item) => `${item.label} ${item.detail} ${item.selection.kind} ${item.selection.id}`
      .toLocaleLowerCase().includes(normalized));
  }, [items, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => setPage(0), [level?.id, query]);
  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  return (
    <div className="geometry-object-navigator">
      <label className="geometry-object-search">
        <Search size={14} aria-hidden="true" />
        <span className="sr-only">{t("geometry.deck.objectSearch")}</span>
        <input
          type="search"
          value={query}
          placeholder={t("geometry.deck.objectSearch")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p className="geometry-object-count" aria-live="polite">
        {t("geometry.deck.objectCount", { count: filtered.length })}
      </p>
      <div className="geometry-object-list">
        {visible.map((item) => {
          const selected = selection?.kind === item.selection.kind && selection.id === item.selection.id;
          return (
            <button key={item.key} type="button" aria-pressed={selected} onClick={() => onSelect(item)}>
              <span className="geometry-object-kind">{t(`geometry.editor.property.${item.selection.kind}`)}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </button>
          );
        })}
        {!visible.length ? <p className="geometry-object-empty">{t("geometry.deck.objectEmpty")}</p> : null}
      </div>
      {pageCount > 1 ? (
        <nav className="geometry-object-pagination" aria-label={t("geometry.deck.objectPages")}>
          <button type="button" aria-label={t("geometry.deck.previousPage")} disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} /></button>
          <span>{t("geometry.deck.page", { page: page + 1, pages: pageCount })}</span>
          <button type="button" aria-label={t("geometry.deck.nextPage")} disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}><ChevronRight size={14} /></button>
        </nav>
      ) : null}
    </div>
  );
}
