import { describe, expect, it } from "vitest";
import {
  applyZoneVolumePatchToCopy,
  planZoneVolumePatch,
  selectAndExtractZoneAirState,
  selectAndReadPrjZones,
  runActiveContamProject,
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

  it("sends only session and Zone identity for result extraction", () => {
    expect(selectAndExtractZoneAirState).toHaveLength(3);
    expect(selectAndExtractZoneAirState.toString()).not.toContain("manifestPath");
    expect(selectAndExtractZoneAirState.toString()).not.toContain("resultRoot");
    expect(selectAndExtractZoneAirState.toString()).not.toContain("sourcePath");
    expect(selectAndExtractZoneAirState.toString()).not.toContain("simreadPath");
  });

  it("sends only request and project session identity for ContamX runs", () => {
    expect(runActiveContamProject).toHaveLength(2);
    const source = runActiveContamProject.toString();
    for (const forbidden of ["sourcePath", "solverPath", "runRoot", "manifestPath", "environment"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
