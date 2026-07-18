import { describe, expect, it } from "vitest";
import {
  applyZoneVolumePatchToCopy,
  extractActiveRunZoneAirState,
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

  it("loads the Rust-held active run without accepting paths or run objects", () => {
    expect(extractActiveRunZoneAirState).toHaveLength(3);
    const source = extractActiveRunZoneAirState.toString();
    for (const forbidden of ["manifestPath", "sourcePath", "resultRoot", "runId", "simreadPath"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("extract_active_run_zone_air_state");
  });

  it("sends only request and project session identity for ContamX runs", () => {
    expect(runActiveContamProject).toHaveLength(2);
    const source = runActiveContamProject.toString();
    for (const forbidden of ["sourcePath", "solverPath", "runRoot", "manifestPath", "environment"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
