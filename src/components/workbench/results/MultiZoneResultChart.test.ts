import { describe, expect, it } from "vitest";
import { buildMultiZoneChartOption, calculateYAxisRange } from "./MultiZoneResultChart";
import { ZONE_RESULT_DATASET_SCHEMA, type ZoneResultDataset } from "../../../app/result-dataset-state";
import { RESULT_FIXTURE } from "../../../app/result-state.test";

const dataset: ZoneResultDataset = {
  schema: ZONE_RESULT_DATASET_SCHEMA,
  status: "ready",
  project_session_id: "session",
  project_source_hash: "a".repeat(64),
  revision_id: "revision",
  run_id: "run",
  run_manifest_identity: "b".repeat(64),
  extraction_batch_id: "batch",
  metric_definitions: [{ key: "temperature_k", display_name: "Temperature", unit: "K" }],
  requested_zones: [{ zone_id: RESULT_FIXTURE.zone_id, zone_number: 1, zone_name: "One" }],
  successful_zone_series: [RESULT_FIXTURE],
  per_zone_failures: [],
  time_identity: { kind: "exact_shared", shared_time_seconds: [0] },
  evidence_summary: { solver_name: "ContamX", solver_version: "3.4", run_manifest_sha256: "b".repeat(64), source_unchanged: true, successful_zone_count: 1, failed_zone_count: 0 },
  created_at_unix_ms: 1,
  bounds: { zone_limit: 64, sample_limit: 250000, payload_limit_bytes: 33554432, total_samples: 1, truncated: false },
  dataset_fingerprint: "c".repeat(64),
};

describe("multi-Zone result chart", () => {
  it("uses only selected real series and does not connect missing values", () => {
    const option = buildMultiZoneChartOption(dataset, "temperature_k", [RESULT_FIXTURE.zone_id], { time: "Time", value: "Value", description: "Chart", resultIdentity: "Result" });
    const series = option.series as Array<{ id: string; connectNulls: boolean; data: unknown[] }>;
    expect(series).toHaveLength(1);
    expect(series[0].connectNulls).toBe(false);
    expect(series[0].id).toBe(RESULT_FIXTURE.zone_id);
    expect(series[0].data).toEqual([[0, 293.15]]);
  });

  it("uses a deterministic finite range without forcing zero", () => {
    const variedTemperature = calculateYAxisRange([293.15, 293.25], "temperature_k");
    expect(variedTemperature?.min).toBeCloseTo(293.14, 10);
    expect(variedTemperature?.max).toBeCloseTo(293.26, 10);
    const constantTemperature = calculateYAxisRange([293.15, 293.15], "temperature_k");
    expect(constantTemperature?.min).toBeCloseTo(292.85685, 10);
    expect(constantTemperature?.max).toBeCloseTo(293.44315, 10);
    const pressure = calculateYAxisRange([-1.2, 0.8], "reference_pressure_pa");
    expect(pressure?.min).toBeCloseTo(-1.36, 10);
    expect(pressure?.max).toBeCloseTo(0.96, 10);
    const density = calculateYAxisRange([1.2041, 1.2041], "air_density_kg_m3");
    expect(density?.min).toBeCloseTo(1.2028959, 10);
    expect(density?.max).toBeCloseTo(1.2053041, 10);
    expect(calculateYAxisRange([null, Number.NaN, undefined], "temperature_k")).toBeUndefined();
  });

  it("applies the range across selected Zones and preserves missing samples", () => {
    const secondZone = {
      ...RESULT_FIXTURE,
      zone_id: "00000000-0000-5000-8000-000000000002",
      zone_number: 2,
      zone_name: "Two",
      samples: [{ ...RESULT_FIXTURE.samples[0], temperature_k: null }],
    } as unknown as typeof RESULT_FIXTURE;
    const option = buildMultiZoneChartOption({ ...dataset, successful_zone_series: [RESULT_FIXTURE, secondZone] }, "temperature_k", [RESULT_FIXTURE.zone_id, secondZone.zone_id], { time: "Time", value: "Value", description: "Chart", resultIdentity: "Result" });
    expect(option.yAxis).toMatchObject({ scale: true, min: 292.85684999999995, max: 293.44315 });
    expect((option.series as Array<{ data: unknown[] }>)[1].data).toEqual([[0, null]]);
  });

  it("handles at least 250,000 samples without spread or copied range input", () => {
    function* values() {
      for (let index = 0; index < 250_000; index += 1) {
        yield index === 249_999 ? null : 293 + index / 100_000;
      }
    }
    const range = calculateYAxisRange(values(), "temperature_k");
    expect(range).toBeDefined();
    expect(Number.isFinite(range?.min)).toBe(true);
    expect(Number.isFinite(range?.max)).toBe(true);

    const largeZone = {
      ...RESULT_FIXTURE,
      samples: Array.from({ length: 250_000 }, (_, index) => ({
        ...RESULT_FIXTURE.samples[0],
        index,
        sim_time_seconds: index,
        temperature_k: index === 249_999 ? null : 293 + index / 100_000,
      })),
    } as unknown as typeof RESULT_FIXTURE;
    const option = buildMultiZoneChartOption(
      { ...dataset, successful_zone_series: [largeZone] },
      "temperature_k",
      [largeZone.zone_id],
      { time: "Time", value: "Value", description: "Chart", resultIdentity: "Result" },
    );
    const chartSeries = option.series as Array<{ data: Array<[number, number | null]> }>;
    expect(chartSeries[0].data).toHaveLength(250_000);
    expect(chartSeries[0].data[chartSeries[0].data.length - 1]?.[1]).toBeNull();
    expect(Number.isFinite((option.yAxis as { min?: number }).min)).toBe(true);
    expect(Number.isFinite((option.yAxis as { max?: number }).max)).toBe(true);
  });
});
