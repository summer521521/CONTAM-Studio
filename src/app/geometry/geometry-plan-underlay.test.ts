import { describe, expect, it } from "vitest";
import {
  createPlanUnderlay,
  geometryPointToUnderlayPixel,
  isSafeGeometryUnderlayResource,
  planUnderlayCalibration,
  underlayGeometryCorners,
  underlayPixelToGeometryPoint,
} from "./geometry-plan-underlay";

const resource = {
  schema_version: "geometry_underlay_resource.v1" as const,
  resource_id: "00000000-0000-5000-8000-000000000001",
  attachment_id: "00000000-0000-5000-8000-000000000002",
  display_name: "floor-plan.png",
      sha256: "a".repeat(64),
      mime_type: "image/png" as const,
      size_bytes: 1024,
      page_count: null,
  pixel_width: 1000,
  pixel_height: 800,
};

describe("calibrated plan underlay", () => {
  it("accepts path-free bounded resource metadata and creates a locked initial underlay", () => {
    expect(isSafeGeometryUnderlayResource(resource)).toBe(true);
    expect(isSafeGeometryUnderlayResource({ ...resource, display_name: "C:\\secret.png" })).toBe(false);
    const underlay = createPlanUnderlay(resource, 1000, 800)!;
    expect(underlay.locked).toBe(true);
    expect(underlay.page_number).toBeNull();
    expect(underlayGeometryCorners(underlay)).toEqual([
      { x: 0, y: 8000 }, { x: 10000, y: 8000 }, { x: 10000, y: 0 }, { x: 0, y: 0 },
    ]);
  });

  it("round trips image and geometry coordinates with rotation", () => {
    const base = createPlanUnderlay(resource, 1000, 800)!;
    const underlay = { ...base, locked: false, origin_x_mm: 1200, origin_y_mm: -300, rotation_millidegrees: 30_000 };
    const geometry = underlayPixelToGeometryPoint(underlay, { x: 160, y: 240 });
    const pixel = geometryPointToUnderlayPixel(underlay, geometry);
    expect(pixel.x).toBeCloseTo(160, 8);
    expect(pixel.y).toBeCloseTo(240, 8);
  });

  it("calibrates from two points while keeping the first point fixed", () => {
    const base = { ...createPlanUnderlay(resource, 1000, 800)!, locked: false };
    const first = underlayPixelToGeometryPoint(base, { x: 100, y: 200 });
    const second = underlayPixelToGeometryPoint(base, { x: 500, y: 200 });
    const calibrated = planUnderlayCalibration(base, first, second, 6000)!;
    expect(calibrated.micrometres_per_pixel).toBe(15000);
    expect(underlayPixelToGeometryPoint(calibrated, { x: 100, y: 200 })).toEqual(first);
  });

  it("fails closed for locked, outside, coincident, fractional and extreme calibration", () => {
    const locked = createPlanUnderlay(resource, 1000, 800)!;
    expect(planUnderlayCalibration(locked, { x: 0, y: 0 }, { x: 1000, y: 0 }, 1000)).toBeNull();
    const open = { ...locked, locked: false };
    expect(planUnderlayCalibration(open, { x: -100, y: -100 }, { x: 1000, y: 0 }, 1000)).toBeNull();
    expect(planUnderlayCalibration(open, { x: 0, y: 0 }, { x: 0, y: 0 }, 1000)).toBeNull();
    expect(planUnderlayCalibration(open, { x: 0, y: 0 }, { x: 1000, y: 0 }, 10.5)).toBeNull();
  });
});
