import type { BuildingGeometry, GeometryFlowPathAnchor, GeometryLevel, GeometryOpening, GeometryVertex, GeometryZoneRegion } from "./geometry-model";
import { planWallFlowPathLink, wallAirflowBoundary, type WallFlowPathOption } from "./geometry-wall-airflow";
import type { ContamDraftFlowPath, ContamDraftZone, ContamSemanticDraft } from "./contam-semantic-draft";
import type { GeometryOperationInput } from "../runtime/useGeometryWorkbench";

export interface DraftZoneDefinition {
  id: string;
  displayName: string;
  contamName: string;
  volume:
    | { basis: "explicit"; volumeLitres: number }
    | { basis: "geometry_estimate_confirmed" };
}

export type DraftZoneBuildResult =
  | { status: "ready"; zone: ContamDraftZone; draft: ContamSemanticDraft }
  | { status: "blocked"; diagnosticCode: string };

export interface DraftFlowPathDefinition {
  id: string;
  flowElementId: string;
  multiplierMillionths: number;
  relativeHeightMm: number;
  reverse: boolean;
}

export type DraftFlowPathBuildResult =
  | {
    status: "ready";
    flowPath: ContamDraftFlowPath;
    anchor: GeometryFlowPathAnchor;
    operation: GeometryOperationInput;
    draft: ContamSemanticDraft;
  }
  | { status: "blocked"; diagnosticCode: string };

const CONTAM_ZONE_NAME = /^[A-Za-z0-9_.-]{1,15}$/;

function roundedPositiveDivision(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function polygonTwiceAreaMm2(
  region: GeometryZoneRegion,
  verticesById: ReadonlyMap<string, GeometryVertex>,
): bigint | null {
  const polygon: GeometryVertex[] = [];
  for (const vertexId of region.outer_vertex_ids) {
    const vertex = verticesById.get(vertexId);
    if (!vertex) return null;
    polygon.push(vertex);
  }
  if (polygon.length < 3) return null;
  let twiceArea = 0n;
  for (let index = 0; index < polygon.length; index += 1) {
    const vertex = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    twiceArea += BigInt(vertex.x) * BigInt(next.y) - BigInt(next.x) * BigInt(vertex.y);
  }
  return twiceArea < 0n ? -twiceArea : twiceArea;
}

export function geometryEstimatedVolumeLitres(
  level: GeometryLevel,
  region: GeometryZoneRegion,
): number | null {
  if (!Number.isSafeInteger(level.height) || (level.height ?? 0) <= 0) return null;
  const twiceArea = polygonTwiceAreaMm2(region, new Map(level.vertices.map((vertex) => [vertex.id, vertex])));
  if (!twiceArea || twiceArea === 0n) return null;
  // 1 litre = 1,000,000 mm³; twiceArea is twice the polygon area.
  const litres = roundedPositiveDivision(twiceArea * BigInt(level.height as number), 2_000_000n);
  return litres >= 1n && litres <= 1_000_000_000n ? Number(litres) : null;
}

export function contamZoneNameSuggestion(displayName: string, fallbackSequence: number): string {
  const normalized = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "")
    .slice(0, 15);
  return normalized || `Zone_${Math.max(1, fallbackSequence)}`.slice(0, 15);
}

export function parseCubicMetresToLitres(value: string): number | null {
  const normalized = value.trim();
  const match = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec(normalized);
  if (!match) return null;
  const wholeLitres = Number(match[1]) * 1_000;
  const fractionalLitres = Number((match[2] ?? "").padEnd(3, "0"));
  const litres = wholeLitres + fractionalLitres;
  return Number.isSafeInteger(litres) && litres >= 1 && litres <= 1_000_000_000 ? litres : null;
}

export function parseMetresToMillimetres(value: string): number | null {
  const normalized = value.trim();
  const match = /^(\d{1,6})(?:\.(\d{1,3}))?$/.exec(normalized);
  if (!match) return null;
  const millimetres = Number(match[1]) * 1_000 + Number((match[2] ?? "").padEnd(3, "0"));
  return Number.isSafeInteger(millimetres) && millimetres <= 100_000_000 ? millimetres : null;
}

export function parseMultiplierMillionths(value: string): number | null {
  const normalized = value.trim();
  const match = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(normalized);
  if (!match) return null;
  const millionths = Number(match[1]) * 1_000_000 + Number((match[2] ?? "").padEnd(6, "0"));
  return Number.isSafeInteger(millionths) && millionths >= 1 && millionths <= 1_000_000_000_000
    ? millionths
    : null;
}

function openingCentre(level: GeometryLevel, opening: GeometryOpening): { x: number; y: number } | null {
  const wall = level.walls.find((item) => item.id === opening.wall_id);
  if (!wall) return null;
  const start = level.vertices.find((item) => item.id === wall.start_vertex_id);
  const end = level.vertices.find((item) => item.id === wall.end_vertex_id);
  if (!start || !end) return null;
  const distance = opening.offset + Math.floor(opening.width / 2);
  if (start.y === end.y) {
    return { x: start.x + Math.sign(end.x - start.x) * distance, y: start.y };
  }
  if (start.x === end.x) {
    return { x: start.x, y: start.y + Math.sign(end.y - start.y) * distance };
  }
  return null;
}

export function createDraftFlowPathForOpening(
  geometry: BuildingGeometry,
  draft: ContamSemanticDraft,
  levelId: string,
  openingId: string,
  definition: DraftFlowPathDefinition,
  anchorIdFactory: () => string,
): DraftFlowPathBuildResult {
  const level = geometry.levels.find((item) => item.id === levelId);
  const opening = level?.openings.find((item) => item.id === openingId);
  if (!level || !opening) return { status: "blocked", diagnosticCode: "semantic_authoring_flow_opening_missing" };
  if (draft.flow_paths.some((path) => path.id === definition.id || path.opening_id === openingId)) {
    return { status: "blocked", diagnosticCode: "semantic_authoring_flow_duplicate" };
  }
  if (!Number.isSafeInteger(definition.multiplierMillionths)
    || definition.multiplierMillionths < 1
    || definition.multiplierMillionths > 1_000_000_000_000
    || !Number.isSafeInteger(definition.relativeHeightMm)
    || definition.relativeHeightMm < 0
    || definition.relativeHeightMm > 100_000_000) {
    return { status: "blocked", diagnosticCode: "semantic_authoring_flow_value_invalid" };
  }
  const boundary = wallAirflowBoundary(level, openingId);
  if (boundary.status !== "ready") return { status: "blocked", diagnosticCode: boundary.diagnosticCode };
  const orderedZones = definition.reverse ? [...boundary.zoneIds].reverse() : [...boundary.zoneIds];
  const option: WallFlowPathOption = boundary.kind === "interior"
    ? {
      id: definition.id,
      label: definition.id,
      boundaryKind: "interior",
      fromZoneId: orderedZones[0] ?? null,
      toZoneId: orderedZones[1] ?? null,
      exteriorSide: "none",
    }
    : definition.reverse
      ? {
        id: definition.id,
        label: definition.id,
        boundaryKind: "exterior",
        fromZoneId: null,
        toZoneId: orderedZones[0] ?? null,
        exteriorSide: "from",
      }
      : {
        id: definition.id,
        label: definition.id,
        boundaryKind: "exterior",
        fromZoneId: orderedZones[0] ?? null,
        toZoneId: null,
        exteriorSide: "to",
      };
  const plan = planWallFlowPathLink(geometry, levelId, openingId, option, anchorIdFactory);
  if (plan.status !== "ready") return { status: "blocked", diagnosticCode: plan.diagnosticCode };
  const centre = openingCentre(level, opening);
  if (!centre) return { status: "blocked", diagnosticCode: "semantic_authoring_flow_position_invalid" };
  const flowPath: ContamDraftFlowPath = {
    id: definition.id,
    level_number: level.level_number,
    opening_id: openingId,
    from_endpoint: plan.anchor.from_zone_id
      ? { kind: "zone", zone_id: plan.anchor.from_zone_id }
      : { kind: "outdoor", zone_id: null },
    to_endpoint: plan.anchor.to_zone_id
      ? { kind: "zone", zone_id: plan.anchor.to_zone_id }
      : { kind: "outdoor", zone_id: null },
    flow_element_id: definition.flowElementId,
    multiplier_millionths: definition.multiplierMillionths,
    x_mm: centre.x,
    y_mm: centre.y,
    relative_height_mm: definition.relativeHeightMm,
    direction_degrees: -1,
  };
  return {
    status: "ready",
    flowPath,
    anchor: plan.anchor,
    operation: plan.operation,
    draft: {
      ...draft,
      draft_revision: draft.draft_revision + 1,
      flow_paths: [...draft.flow_paths, flowPath],
    },
  };
}

export function createDraftZoneForRegion(
  draft: ContamSemanticDraft,
  level: GeometryLevel,
  region: GeometryZoneRegion,
  definition: DraftZoneDefinition,
): DraftZoneBuildResult {
  if (region.semantic_zone_id !== definition.id) {
    return { status: "blocked", diagnosticCode: "semantic_authoring_zone_region_identity_mismatch" };
  }
  if (!definition.displayName.trim() || definition.displayName.trim() !== definition.displayName || definition.displayName.length > 80) {
    return { status: "blocked", diagnosticCode: "semantic_authoring_zone_display_name_invalid" };
  }
  if (!CONTAM_ZONE_NAME.test(definition.contamName)) {
    return { status: "blocked", diagnosticCode: "semantic_authoring_zone_name_invalid" };
  }
  if (draft.zones.some((zone) => zone.id === definition.id || zone.geometry_region_id === region.id)) {
    return { status: "blocked", diagnosticCode: "semantic_authoring_zone_duplicate" };
  }
  if (draft.zones.some((zone) => zone.name.toLowerCase() === definition.contamName.toLowerCase())) {
    return { status: "blocked", diagnosticCode: "semantic_authoring_zone_name_duplicate" };
  }
  const volumeLitres = definition.volume.basis === "explicit"
    ? definition.volume.volumeLitres
    : geometryEstimatedVolumeLitres(level, region);
  if (!Number.isSafeInteger(volumeLitres) || (volumeLitres ?? 0) < 1 || (volumeLitres ?? 0) > 1_000_000_000) {
    return { status: "blocked", diagnosticCode: "semantic_authoring_zone_volume_invalid" };
  }
  const zone: ContamDraftZone = {
    id: definition.id,
    level_number: level.level_number,
    name: definition.contamName,
    display_name: definition.displayName,
    volume_litres: volumeLitres as number,
    volume_basis: definition.volume.basis,
    geometry_region_id: region.id,
    initial_temperature_millikelvin: 293_150,
    initial_pressure_millipascal: 0,
  };
  return {
    status: "ready",
    zone,
    draft: {
      ...draft,
      draft_revision: draft.draft_revision + 1,
      zones: [...draft.zones, zone],
    },
  };
}
