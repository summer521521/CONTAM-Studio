import { canonicalJson, sha256Text, type BuildingGeometry } from "./geometry-model";

export const CONTAM_SEMANTIC_DRAFT_SCHEMA_VERSION = "contam_semantic_draft.v1" as const;
export const MAX_SEMANTIC_DRAFT_ZONES = 256;
export const MAX_SEMANTIC_DRAFT_FLOW_PATHS = 512;

export interface ContamDraftEndpoint {
  kind: "zone" | "outdoor";
  zone_id: string | null;
}

export interface ContamDraftZone {
  id: string;
  level_number: number;
  name: string;
  display_name: string;
  volume_litres: number;
  volume_basis: "explicit" | "geometry_estimate_confirmed";
  geometry_region_id: string;
  initial_temperature_millikelvin: number;
  initial_pressure_millipascal: number;
}

export interface ContamDraftFlowPath {
  id: string;
  level_number: number;
  opening_id: string;
  from_endpoint: ContamDraftEndpoint;
  to_endpoint: ContamDraftEndpoint;
  flow_element_id: string;
  multiplier_millionths: number;
  x_mm: number;
  y_mm: number;
  relative_height_mm: number;
  direction_degrees: number;
}

export interface ContamSemanticDraft {
  schema_version: typeof CONTAM_SEMANTIC_DRAFT_SCHEMA_VERSION;
  status: "available";
  draft_id: string;
  project_session_id: string;
  identity_sha256: string;
  source_sha256: string;
  revision_id: string;
  draft_revision: number;
  provenance: { source_kind: "studio_semantic_draft"; application_owned: true };
  zones: ContamDraftZone[];
  flow_paths: ContamDraftFlowPath[];
}

export interface ContamSemanticDraftContext {
  projectSessionId: string;
  identitySha256: string;
  sourceSha256: string;
  revisionId: string;
  levelNumbers: ReadonlySet<number>;
  existingZoneIds: ReadonlySet<string>;
  supportedFlowElementIds: ReadonlySet<string>;
  geometry?: BuildingGeometry;
}

export interface ContamSemanticDraftValidation {
  status: "valid" | "invalid";
  draft_sha256: string;
  diagnostics: string[];
}

const ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const SHA256 = /^[A-Fa-f0-9]{64}$/;
const CONTAM_NAME = /^[A-Za-z0-9_.-]{1,15}$/;

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function integerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function safeDisplayName(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 80
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && value.trim() === value;
}

function validEndpoint(value: unknown): value is ContamDraftEndpoint {
  if (!exactKeys(value, ["kind", "zone_id"])) return false;
  return value.kind === "outdoor"
    ? value.zone_id === null
    : value.kind === "zone" && typeof value.zone_id === "string" && ID.test(value.zone_id);
}

function validZone(value: unknown): value is ContamDraftZone {
  if (!exactKeys(value, [
    "display_name", "geometry_region_id", "id", "initial_pressure_millipascal",
    "initial_temperature_millikelvin", "level_number", "name", "volume_basis", "volume_litres",
  ])) return false;
  return typeof value.id === "string" && ID.test(value.id)
    && integerBetween(value.level_number, 1, 10_000)
    && typeof value.name === "string" && CONTAM_NAME.test(value.name)
    && safeDisplayName(value.display_name)
    && integerBetween(value.volume_litres, 1, 1_000_000_000)
    && (value.volume_basis === "explicit" || value.volume_basis === "geometry_estimate_confirmed")
    && typeof value.geometry_region_id === "string" && ID.test(value.geometry_region_id)
    && integerBetween(value.initial_temperature_millikelvin, 173_150, 373_150)
    && integerBetween(value.initial_pressure_millipascal, -1_000_000_000, 1_000_000_000);
}

function validFlowPath(value: unknown): value is ContamDraftFlowPath {
  if (!exactKeys(value, [
    "direction_degrees", "flow_element_id", "from_endpoint", "id", "level_number",
    "multiplier_millionths", "opening_id", "relative_height_mm", "to_endpoint", "x_mm", "y_mm",
  ])) return false;
  return typeof value.id === "string" && ID.test(value.id)
    && integerBetween(value.level_number, 1, 10_000)
    && typeof value.opening_id === "string" && ID.test(value.opening_id)
    && validEndpoint(value.from_endpoint)
    && validEndpoint(value.to_endpoint)
    && typeof value.flow_element_id === "string" && ID.test(value.flow_element_id)
    && integerBetween(value.multiplier_millionths, 1, 1_000_000_000_000)
    && integerBetween(value.x_mm, -1_000_000_000, 1_000_000_000)
    && integerBetween(value.y_mm, -1_000_000_000, 1_000_000_000)
    && integerBetween(value.relative_height_mm, 0, 100_000_000)
    && integerBetween(value.direction_degrees, -1, 359);
}

export function isContamSemanticDraft(value: unknown): value is ContamSemanticDraft {
  if (!exactKeys(value, [
    "draft_id", "draft_revision", "flow_paths", "identity_sha256", "project_session_id",
    "provenance", "revision_id", "schema_version", "source_sha256", "status", "zones",
  ])) return false;
  return value.schema_version === CONTAM_SEMANTIC_DRAFT_SCHEMA_VERSION
    && value.status === "available"
    && typeof value.draft_id === "string" && ID.test(value.draft_id)
    && typeof value.project_session_id === "string" && ID.test(value.project_session_id)
    && typeof value.identity_sha256 === "string" && SHA256.test(value.identity_sha256)
    && typeof value.source_sha256 === "string" && SHA256.test(value.source_sha256)
    && typeof value.revision_id === "string" && ID.test(value.revision_id)
    && integerBetween(value.draft_revision, 0, 4_294_967_295)
    && exactKeys(value.provenance, ["application_owned", "source_kind"])
    && value.provenance.source_kind === "studio_semantic_draft"
    && value.provenance.application_owned === true
    && Array.isArray(value.zones) && value.zones.length <= MAX_SEMANTIC_DRAFT_ZONES && value.zones.every(validZone)
    && Array.isArray(value.flow_paths) && value.flow_paths.length <= MAX_SEMANTIC_DRAFT_FLOW_PATHS && value.flow_paths.every(validFlowPath);
}

export function semanticDraftSha256(draft: ContamSemanticDraft): string {
  return sha256Text(canonicalJson(draft));
}

export function validateContamSemanticDraft(
  value: unknown,
  context: ContamSemanticDraftContext,
): ContamSemanticDraftValidation {
  if (!isContamSemanticDraft(value)) {
    return { status: "invalid", draft_sha256: "", diagnostics: ["semantic_draft_contract_invalid"] };
  }
  const draft = value;
  const diagnostics = new Set<string>();
  if (draft.project_session_id !== context.projectSessionId
    || draft.revision_id !== context.revisionId
    || draft.identity_sha256.toLowerCase() !== context.identitySha256.toLowerCase()
    || draft.source_sha256.toLowerCase() !== context.sourceSha256.toLowerCase()) {
    diagnostics.add("semantic_draft_context_stale");
  }
  const zoneIds = new Set<string>();
  const zoneNames = new Set<string>();
  const regionIds = new Set<string>();
  for (const zone of draft.zones) {
    if (zoneIds.has(zone.id)) diagnostics.add("semantic_draft_zone_id_duplicate");
    if (zoneNames.has(zone.name.toLowerCase())) diagnostics.add("semantic_draft_zone_name_duplicate");
    if (regionIds.has(zone.geometry_region_id)) diagnostics.add("semantic_draft_zone_region_duplicate");
    zoneIds.add(zone.id);
    zoneNames.add(zone.name.toLowerCase());
    regionIds.add(zone.geometry_region_id);
    if (!context.levelNumbers.has(zone.level_number)) diagnostics.add("semantic_draft_level_unknown");
  }
  const allZoneIds = new Set([...context.existingZoneIds, ...zoneIds]);
  const pathIds = new Set<string>();
  const openingIds = new Set<string>();
  for (const path of draft.flow_paths) {
    if (pathIds.has(path.id)) diagnostics.add("semantic_draft_flow_path_id_duplicate");
    if (openingIds.has(path.opening_id)) diagnostics.add("semantic_draft_opening_duplicate");
    pathIds.add(path.id);
    openingIds.add(path.opening_id);
    if (!context.levelNumbers.has(path.level_number)) diagnostics.add("semantic_draft_level_unknown");
    if (!context.supportedFlowElementIds.has(path.flow_element_id)) diagnostics.add("semantic_draft_flow_element_unsupported");
    const endpoints = [path.from_endpoint, path.to_endpoint];
    if (endpoints.every((endpoint) => endpoint.kind === "outdoor")) diagnostics.add("semantic_draft_flow_path_outdoor_to_outdoor");
    for (const endpoint of endpoints) {
      if (endpoint.kind === "zone" && (!endpoint.zone_id || !allZoneIds.has(endpoint.zone_id))) {
        diagnostics.add("semantic_draft_endpoint_unknown");
      }
    }
    if (path.from_endpoint.kind === "zone" && path.to_endpoint.kind === "zone"
      && path.from_endpoint.zone_id === path.to_endpoint.zone_id) {
      diagnostics.add("semantic_draft_flow_path_self_reference");
    }
  }
  if (context.geometry) {
    const geometryRegions = new Map(context.geometry.levels.flatMap((level) => level.zone_regions.map((region) => [region.id, region] as const)));
    const geometryOpenings = new Map(context.geometry.levels.flatMap((level) => level.openings.map((opening) => [opening.id, { opening, levelNumber: level.level_number }] as const)));
    const geometryFlowPaths = new Map(context.geometry.levels.flatMap((level) => level.flow_path_anchors.map((anchor) => [anchor.semantic_flow_path_id, { anchor, levelNumber: level.level_number }] as const)));
    for (const zone of draft.zones) {
      const region = geometryRegions.get(zone.geometry_region_id);
      if (!region || region.semantic_zone_id !== zone.id) diagnostics.add("semantic_draft_zone_geometry_mismatch");
    }
    for (const path of draft.flow_paths) {
      const opening = geometryOpenings.get(path.opening_id);
      const binding = geometryFlowPaths.get(path.id);
      const expectedFrom = path.from_endpoint.kind === "zone" ? path.from_endpoint.zone_id : null;
      const expectedTo = path.to_endpoint.kind === "zone" ? path.to_endpoint.zone_id : null;
      const expectedExterior = path.from_endpoint.kind === "outdoor"
        ? "from"
        : path.to_endpoint.kind === "outdoor" ? "to" : "none";
      if (!opening
        || opening.levelNumber !== path.level_number
        || !binding
        || binding.levelNumber !== path.level_number
        || binding.anchor.opening_id !== path.opening_id
        || binding.anchor.from_zone_id !== expectedFrom
        || binding.anchor.to_zone_id !== expectedTo
        || binding.anchor.exterior_side !== expectedExterior) {
        diagnostics.add("semantic_draft_flow_path_geometry_mismatch");
      }
    }
  }
  return {
    status: diagnostics.size ? "invalid" : "valid",
    draft_sha256: semanticDraftSha256(draft),
    diagnostics: [...diagnostics].sort(),
  };
}

export function createEmptyContamSemanticDraft(context: Omit<ContamSemanticDraftContext, "levelNumbers" | "existingZoneIds" | "supportedFlowElementIds" | "geometry">, draftId: string): ContamSemanticDraft {
  return {
    schema_version: CONTAM_SEMANTIC_DRAFT_SCHEMA_VERSION,
    status: "available",
    draft_id: draftId,
    project_session_id: context.projectSessionId,
    identity_sha256: context.identitySha256.toLowerCase(),
    source_sha256: context.sourceSha256.toLowerCase(),
    revision_id: context.revisionId,
    draft_revision: 0,
    provenance: { source_kind: "studio_semantic_draft", application_owned: true },
    zones: [],
    flow_paths: [],
  };
}
