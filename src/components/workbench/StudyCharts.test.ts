import { describe, expect, it } from "vitest";
import { buildStudyRelationOption, buildStudyRelationPoints, buildStudySeriesPoints, buildStudyTimeSeriesOption } from "./StudyCharts";
import type { StudySampleResult } from "../../app/study-state";

const hash = "a".repeat(64);
const result = (sampleId: string, volume: number, value: number): StudySampleResult => ({
  schema_version: "study_sample_result.v1",
  study_id: "11111111-1111-5111-8111-111111111111",
  study_hash: hash,
  sample_id: sampleId,
  status: "succeeded",
  parameters: { volume },
  project_sha256: hash,
  solver_manifest: {},
  statistics: {
    value,
    zone_id: "zone-1",
    series: [
      { time_seconds: 0, zone_id: "zone-1", temperature_k: 293 },
      { time_seconds: 60, zone_id: "zone-1", temperature_k: null },
    ],
  },
  result_hash: hash,
  error: null,
  generated_at: "now",
  provenance: "official tool result",
  evidence: [],
});

describe("study evidence charts", () => {
  it("uses only trusted numeric relation points", () => {
    const points = buildStudyRelationPoints([result("s1", 10, 2)], "volume", "value");
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ sample_id: "s1", x: 10, y: 2, zone_id: "zone-1" });
    expect(buildStudyRelationOption(points, { description: "relation", x: "x", y: "y", sample: "sample" }).series).toBeTruthy();
  });

  it("keeps missing time-series values as null", () => {
    const points = buildStudySeriesPoints([result("s1", 10, 2)], ["s1"], "temperature_k", []);
    expect(points).toHaveLength(2);
    expect(points[1].value).toBeNull();
    expect(buildStudyTimeSeriesOption(points, { description: "series", time: "time", value: "value", sample: "sample" }).series).toBeTruthy();
  });

  it("projects a selected SimRead metric and time point into relation evidence", () => {
    const points = buildStudyRelationPoints([result("s1", 10, 2)], "volume", "temperature_k", "zone-1", 0);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ x: 10, y: 293, timestamp: 0, zone_id: "zone-1" });
    expect(buildStudyRelationPoints([result("s1", 10, 2)], "volume", "temperature_k", "zone-1", 60)).toHaveLength(0);
  });
});
