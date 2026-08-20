export const BUILDING_GEOMETRY_SCHEMA_VERSION = "building_geometry.v1" as const;
export const GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION = "geometry_edit_command.v1" as const;
export const GEOMETRY_VALIDATION_SCHEMA_VERSION = "geometry_validation.v1" as const;

export type GeometryStatus = "available" | "unavailable";
export type GeometryEditingCapability = "read_only" | "studio_draft";
export type GeometryRoundTripCapability = "unsupported" | "read_only_projection" | "verified_subset";
export type GeometrySeverity = "warning" | "error";

export interface GeometryDiagnostic {
  code: string;
  severity: GeometrySeverity;
  object_id: string | null;
}

export interface GeometryCoordinateSpace {
  kind: "contam_sketchpad_grid" | "studio_metric";
  unit: "half_grid" | "mm";
  units_per_grid_cell: number | null;
  y_axis: "up";
}

export interface GeometryProvenance {
  source_kind: "contam_sketchpad_projection" | "studio_metric_draft";
  application_owned: boolean;
  source_schema_version: string | null;
}

export interface GeometryCapabilities {
  geometry_editing: GeometryEditingCapability;
  prj_round_trip: GeometryRoundTripCapability;
}

export interface GeometryVertex {
  id: string;
  x: number;
  y: number;
}

export interface GeometryWall {
  id: string;
  start_vertex_id: string;
  end_vertex_id: string;
  kind: "exterior" | "interior" | "unknown";
  thickness: number | null;
  source_icon_id: string | null;
}

export interface GeometryOpening {
  id: string;
  wall_id: string;
  kind: "door" | "window" | "exterior_opening" | "other";
  offset: number;
  width: number;
  swing: "none" | "left" | "right" | "double";
  adjacent_zone_ids: string[];
}

export interface GeometryZoneRegion {
  id: string;
  semantic_zone_id: string;
  outer_vertex_ids: string[];
}

export interface GeometryFlowPathAnchor {
  id: string;
  opening_id: string;
  semantic_flow_path_id: string;
  from_zone_id: string | null;
  to_zone_id: string | null;
  exterior_side: "none" | "from" | "to";
}

export interface GeometryPlanUnderlay {
  id: string;
  resource_id: string;
  display_name: string;
  sha256: string;
  mime_type: "image/png" | "image/jpeg" | "application/pdf";
  page_number: number | null;
  pixel_width: number;
  pixel_height: number;
  pixel_origin_x_milli: number;
  pixel_origin_y_milli: number;
  origin_x_mm: number;
  origin_y_mm: number;
  micrometres_per_pixel: number;
  rotation_millidegrees: number;
  opacity_percent: number;
  visible: boolean;
  locked: boolean;
}

export interface GeometryVerticalOpening {
  id: string;
  lower_level_id: string;
  upper_level_id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  kind: "floor_opening" | "stair" | "shaft";
}

export interface GeometryVerticalFlowPathAnchor {
  id: string;
  vertical_opening_id: string;
  semantic_flow_path_id: string;
  lower_zone_id: string;
  upper_zone_id: string;
}

export interface GeometryLevel {
  id: string;
  level_number: number;
  name: string;
  elevation: number | null;
  height: number | null;
  vertices: GeometryVertex[];
  walls: GeometryWall[];
  openings: GeometryOpening[];
  zone_regions: GeometryZoneRegion[];
  flow_path_anchors: GeometryFlowPathAnchor[];
  underlays: GeometryPlanUnderlay[];
}

export interface BuildingGeometry {
  schema_version: typeof BUILDING_GEOMETRY_SCHEMA_VERSION;
  status: GeometryStatus;
  geometry_id: string;
  project_session_id: string;
  identity_sha256: string;
  source_sha256: string;
  revision_id: string;
  geometry_revision: number;
  coordinate_space: GeometryCoordinateSpace;
  provenance: GeometryProvenance;
  capabilities: GeometryCapabilities;
  levels: GeometryLevel[];
  vertical_openings: GeometryVerticalOpening[];
  vertical_flow_path_anchors: GeometryVerticalFlowPathAnchor[];
  warnings: GeometryDiagnostic[];
  unavailable_reason: string | null;
}

export type GeometryCommandActor = "user" | "ai_suggestion" | "system";
export type GeometryCommandOperation =
  | "add_vertex"
  | "add_wall"
  | "split_wall"
  | "move_vertex"
  | "move_vertices"
  | "delete_wall"
  | "create_zone_region"
  | "partition_zone_region"
  | "merge_zone_regions"
  | "copy_level_construction"
  | "place_vertical_opening"
  | "remove_vertical_opening"
  | "link_vertical_flow_path"
  | "unlink_vertical_flow_path"
  | "place_opening"
  | "update_opening"
  | "remove_opening"
  | "link_flow_path"
  | "unlink_flow_path"
  | "set_plan_underlay"
  | "update_plan_underlay"
  | "remove_plan_underlay";

export interface GeometryEditCommand {
  schema_version: typeof GEOMETRY_EDIT_COMMAND_SCHEMA_VERSION;
  command_id: string;
  sequence: number;
  project_session_id: string;
  geometry_id: string;
  baseline_revision_id: string;
  baseline_geometry_hash: string;
  actor: GeometryCommandActor;
  operation: GeometryCommandOperation;
  parameters: Record<string, unknown>;
}

export interface GeometryValidationResult {
  schema_version: typeof GEOMETRY_VALIDATION_SCHEMA_VERSION;
  geometry_id: string;
  revision_id: string;
  geometry_hash: string;
  status: "valid" | "invalid" | "unavailable";
  diagnostics: GeometryDiagnostic[];
}

export const GEOMETRY_HASH_PATTERN = /^[0-9a-f]{64}$/i;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalGeometryJson(geometry: BuildingGeometry): string {
  return canonicalJson(geometry);
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Synchronous SHA-256 keeps command validation deterministic in reducers.
 * It intentionally accepts a UTF-8 string only; binary and file hashing remain
 * inside the Rust boundary.
 */
export function sha256Text(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);

  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function geometrySha256(geometry: BuildingGeometry): string {
  return sha256Text(canonicalGeometryJson(geometry));
}

export function cloneBuildingGeometry(geometry: BuildingGeometry): BuildingGeometry {
  return structuredClone(geometry);
}
