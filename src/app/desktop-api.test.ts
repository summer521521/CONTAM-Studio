import { describe, expect, it } from "vitest";
import {
  applyZoneVolumePatchToCopy,
  planZoneVolumePatch,
  selectAndReadPrjZones,
} from "./desktop-api";

describe("desktop API boundary", () => {
  it("accepts only requestId and cannot receive a source path", () => {
    expect(selectAndReadPrjZones).toHaveLength(1);
  });

  it("accepts only identifiers and volume input for Patch operations", () => {
    expect(planZoneVolumePatch).toHaveLength(4);
    expect(applyZoneVolumePatchToCopy).toHaveLength(3);
    expect(planZoneVolumePatch.toString()).not.toContain("sourcePath");
    expect(applyZoneVolumePatchToCopy.toString()).not.toContain("outputPath");
  });
});
