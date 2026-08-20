import type { GeometryPlanUnderlay } from "./geometry-model";
import type { AttachmentView } from "../attachment-state";
import type { ReaderDiagnostic } from "../project-state";

export const GEOMETRY_UNDERLAY_RESOURCE_SCHEMA_VERSION = "geometry_underlay_resource.v1" as const;
export const MAX_UNDERLAY_PIXELS_PER_AXIS = 20_000;
export const DEFAULT_UNDERLAY_MICROMETRES_PER_PIXEL = 10_000;

export interface GeometryUnderlayResource {
  schema_version: typeof GEOMETRY_UNDERLAY_RESOURCE_SCHEMA_VERSION;
  resource_id: string;
  attachment_id: string;
  display_name: string;
  sha256: string;
  mime_type: GeometryPlanUnderlay["mime_type"];
  size_bytes: number;
  page_count: number | null;
  pixel_width: number | null;
  pixel_height: number | null;
}

export interface DesktopGeometryUnderlayImportResponse {
  request_id: string;
  cancelled: boolean;
  project_session_id: string | null;
  revision_id: string | null;
  resource: GeometryUnderlayResource | null;
  attachments: AttachmentView[];
  error: ReaderDiagnostic | null;
}

export interface UnderlayPoint { x: number; y: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;

function safeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

export function isSafeGeometryUnderlayResource(value: unknown): value is GeometryUnderlayResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = ["schema_version", "resource_id", "attachment_id", "display_name", "sha256", "mime_type", "size_bytes", "page_count", "pixel_width", "pixel_height"];
  if (Object.keys(item).length !== keys.length || !keys.every((key) => key in item)) return false;
  return item.schema_version === GEOMETRY_UNDERLAY_RESOURCE_SCHEMA_VERSION
    && UUID.test(String(item.resource_id))
    && UUID.test(String(item.attachment_id))
    && typeof item.display_name === "string" && item.display_name.length > 0 && item.display_name.length <= 160
    && !/[\\/\u0000-\u001f\u007f]/.test(item.display_name)
    && HASH.test(String(item.sha256))
    && ["image/png", "image/jpeg", "application/pdf"].includes(String(item.mime_type))
    && safeInteger(item.size_bytes, 1, 32 * 1024 * 1024)
    && (item.page_count === null || safeInteger(item.page_count, 1, 10_000))
    && (item.pixel_width === null || safeInteger(item.pixel_width, 1, MAX_UNDERLAY_PIXELS_PER_AXIS))
    && (item.pixel_height === null || safeInteger(item.pixel_height, 1, MAX_UNDERLAY_PIXELS_PER_AXIS));
}

export function isValidPlanUnderlay(value: unknown): value is GeometryPlanUnderlay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = [
    "id", "resource_id", "display_name", "sha256", "mime_type", "page_number", "pixel_width", "pixel_height",
    "pixel_origin_x_milli", "pixel_origin_y_milli", "origin_x_mm", "origin_y_mm", "micrometres_per_pixel",
    "rotation_millidegrees", "opacity_percent", "visible", "locked",
  ];
  if (Object.keys(item).length !== keys.length || !keys.every((key) => key in item)) return false;
  const mime = String(item.mime_type);
  return typeof item.id === "string" && item.id.length > 0 && item.id.length <= 128
    && UUID.test(String(item.resource_id))
    && typeof item.display_name === "string" && item.display_name.length > 0 && item.display_name.length <= 160
    && !/[\\/\u0000-\u001f\u007f]/.test(item.display_name)
    && HASH.test(String(item.sha256))
    && ["image/png", "image/jpeg", "application/pdf"].includes(mime)
    && (mime === "application/pdf" ? safeInteger(item.page_number, 1, 10_000) : item.page_number === null)
    && safeInteger(item.pixel_width, 1, MAX_UNDERLAY_PIXELS_PER_AXIS)
    && safeInteger(item.pixel_height, 1, MAX_UNDERLAY_PIXELS_PER_AXIS)
    && safeInteger(item.pixel_origin_x_milli, -20_000_000, 20_000_000)
    && safeInteger(item.pixel_origin_y_milli, -20_000_000, 20_000_000)
    && safeInteger(item.origin_x_mm, -1_000_000_000, 1_000_000_000)
    && safeInteger(item.origin_y_mm, -1_000_000_000, 1_000_000_000)
    && safeInteger(item.micrometres_per_pixel, 1, 1_000_000_000)
    && safeInteger(item.rotation_millidegrees, -359_999, 359_999)
    && safeInteger(item.opacity_percent, 5, 100)
    && typeof item.visible === "boolean" && typeof item.locked === "boolean";
}

export function createPlanUnderlay(
  resource: GeometryUnderlayResource,
  pixelWidth: number,
  pixelHeight: number,
  pageNumber: number | null = resource.mime_type === "application/pdf" ? 1 : null,
): GeometryPlanUnderlay | null {
  if (!isSafeGeometryUnderlayResource(resource)
    || !safeInteger(pixelWidth, 1, MAX_UNDERLAY_PIXELS_PER_AXIS)
    || !safeInteger(pixelHeight, 1, MAX_UNDERLAY_PIXELS_PER_AXIS)) return null;
  const value: GeometryPlanUnderlay = {
    id: `underlay-${resource.resource_id}`,
    resource_id: resource.resource_id,
    display_name: resource.display_name,
    sha256: resource.sha256.toLowerCase(),
    mime_type: resource.mime_type,
    page_number: pageNumber,
    pixel_width: pixelWidth,
    pixel_height: pixelHeight,
    pixel_origin_x_milli: 0,
    pixel_origin_y_milli: pixelHeight * 1_000,
    origin_x_mm: 0,
    origin_y_mm: 0,
    micrometres_per_pixel: DEFAULT_UNDERLAY_MICROMETRES_PER_PIXEL,
    rotation_millidegrees: 0,
    opacity_percent: 42,
    visible: true,
    locked: true,
  };
  return isValidPlanUnderlay(value) ? value : null;
}

function angleRadians(underlay: GeometryPlanUnderlay): number {
  return underlay.rotation_millidegrees * Math.PI / 180_000;
}

export function underlayPixelToGeometryPoint(underlay: GeometryPlanUnderlay, pixel: UnderlayPoint): UnderlayPoint {
  const scale = underlay.micrometres_per_pixel / 1_000;
  const sourceX = pixel.x - underlay.pixel_origin_x_milli / 1_000;
  const sourceY = -(pixel.y - underlay.pixel_origin_y_milli / 1_000);
  const angle = angleRadians(underlay);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: underlay.origin_x_mm + scale * (sourceX * cosine - sourceY * sine),
    y: underlay.origin_y_mm + scale * (sourceX * sine + sourceY * cosine),
  };
}

export function geometryPointToUnderlayPixel(underlay: GeometryPlanUnderlay, point: UnderlayPoint): UnderlayPoint {
  const scale = underlay.micrometres_per_pixel / 1_000;
  const dx = point.x - underlay.origin_x_mm;
  const dy = point.y - underlay.origin_y_mm;
  const angle = angleRadians(underlay);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const sourceX = (dx * cosine + dy * sine) / scale;
  const sourceY = (-dx * sine + dy * cosine) / scale;
  return {
    x: underlay.pixel_origin_x_milli / 1_000 + sourceX,
    y: underlay.pixel_origin_y_milli / 1_000 - sourceY,
  };
}

export function underlayContainsPixel(underlay: GeometryPlanUnderlay, point: UnderlayPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= underlay.pixel_width && point.y <= underlay.pixel_height;
}

export function underlayGeometryCorners(underlay: GeometryPlanUnderlay): UnderlayPoint[] {
  return [
    { x: 0, y: 0 },
    { x: underlay.pixel_width, y: 0 },
    { x: underlay.pixel_width, y: underlay.pixel_height },
    { x: 0, y: underlay.pixel_height },
  ].map((point) => underlayPixelToGeometryPoint(underlay, point));
}

export function planUnderlayCalibration(
  underlay: GeometryPlanUnderlay,
  firstGeometry: UnderlayPoint,
  secondGeometry: UnderlayPoint,
  actualDistanceMm: number,
): GeometryPlanUnderlay | null {
  if (underlay.locked || !Number.isSafeInteger(actualDistanceMm) || actualDistanceMm < 1 || actualDistanceMm > 1_000_000_000) return null;
  const firstPixel = geometryPointToUnderlayPixel(underlay, firstGeometry);
  const secondPixel = geometryPointToUnderlayPixel(underlay, secondGeometry);
  if (!underlayContainsPixel(underlay, firstPixel) || !underlayContainsPixel(underlay, secondPixel)) return null;
  const pixelDistance = Math.hypot(secondPixel.x - firstPixel.x, secondPixel.y - firstPixel.y);
  if (!Number.isFinite(pixelDistance) || pixelDistance < 1) return null;
  const scale = Math.round(actualDistanceMm * 1_000 / pixelDistance);
  const next: GeometryPlanUnderlay = {
    ...underlay,
    pixel_origin_x_milli: Math.round(firstPixel.x * 1_000),
    pixel_origin_y_milli: Math.round(firstPixel.y * 1_000),
    origin_x_mm: Math.round(firstGeometry.x),
    origin_y_mm: Math.round(firstGeometry.y),
    micrometres_per_pixel: scale,
  };
  return isValidPlanUnderlay(next) ? next : null;
}

export function updatePlanUnderlay(
  underlay: GeometryPlanUnderlay,
  updates: Partial<Pick<GeometryPlanUnderlay, "origin_x_mm" | "origin_y_mm" | "rotation_millidegrees" | "opacity_percent" | "visible" | "locked">>,
): GeometryPlanUnderlay | null {
  const next = { ...underlay, ...updates };
  return isValidPlanUnderlay(next) ? next : null;
}
