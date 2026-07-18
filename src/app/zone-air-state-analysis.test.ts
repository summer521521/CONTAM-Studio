import { describe, expect, it } from "vitest";
import { RESULT_FIXTURE } from "./result-state.test";
import {
  analyzeZoneAirState,
  formatElapsedSeconds,
  formatResultNumber,
  ZoneAirStateAnalysisError,
} from "./zone-air-state-analysis";
import type { ZoneAirStateResult, ZoneAirStateSample } from "./result-state";

function resultWith(samples: ZoneAirStateSample[]): ZoneAirStateResult {
  return { ...RESULT_FIXTURE, sample_count: samples.length, samples };
}

const samples: ZoneAirStateSample[] = [
  { index: 4, day_of_year: 1, day_type: null, sim_time_seconds: 0, temperature_k: 293.15, reference_pressure_pa: -2.5, air_density_kg_m3: 1.2041 },
  { index: 5, day_of_year: 1, day_type: null, sim_time_seconds: 300, temperature_k: 294.15, reference_pressure_pa: -1.5, air_density_kg_m3: 1.2039 },
  { index: 6, day_of_year: 1, day_type: null, sim_time_seconds: 600, temperature_k: 293.15, reference_pressure_pa: -3.5, air_density_kg_m3: 1.2045 },
];

describe("Zone air-state deterministic analysis", () => {
  it("computes extrema, first-tie positions and Welford means in one stable order", () => {
    const analysis = analyzeZoneAirState(resultWith(samples));
    expect(analysis.sampleCount).toBe(3);
    expect(analysis.durationSeconds).toBe(600);
    expect(analysis.metrics.temperature_k.minimum).toEqual({ value: 293.15, sampleIndex: 4, simTimeSeconds: 0 });
    expect(analysis.metrics.temperature_k.maximum).toEqual({ value: 294.15, sampleIndex: 5, simTimeSeconds: 300 });
    expect(analysis.metrics.temperature_k.mean).toBeCloseTo((293.15 + 294.15 + 293.15) / 3, 12);
    expect(analysis.metrics.reference_pressure_pa.minimum.value).toBe(-3.5);
    expect(analysis.metrics.air_density_kg_m3.maximum.value).toBe(1.2045);
  });

  it("handles a single sample and a 577-sample equivalent sequence", () => {
    expect(analyzeZoneAirState(RESULT_FIXTURE).durationSeconds).toBe(0);
    const long = Array.from({ length: 577 }, (_, index) => ({
      ...samples[0],
      index,
      sim_time_seconds: index * 300,
      temperature_k: 293.15 + index / 1000,
    }));
    const analysis = analyzeZoneAirState(resultWith(long));
    expect(analysis.sampleCount).toBe(577);
    expect(analysis.endTimeSeconds).toBe(172_800);
  });

  it("handles two samples, negative pressure and stable incremental means", () => {
    const extreme = resultWith([
      { ...samples[0], temperature_k: 1e12, reference_pressure_pa: -9.25 },
      { ...samples[1], temperature_k: 1e12 + 0.25, reference_pressure_pa: -1.5 },
    ]);
    const analysis = analyzeZoneAirState(extreme);
    expect(analysis.durationSeconds).toBe(300);
    expect(analysis.metrics.temperature_k.mean).toBe(1e12 + 0.125);
    expect(analysis.metrics.reference_pressure_pa.minimum.value).toBe(-9.25);
    expect(analysis.metrics.air_density_kg_m3.mean).toBeCloseTo(1.204, 12);
  });

  it("does not mutate or reorder input samples", () => {
    const input = samples.map((sample) => ({ ...sample }));
    const before = JSON.stringify(input);
    analyzeZoneAirState(resultWith(input));
    expect(JSON.stringify(input)).toBe(before);
    expect(input.map((sample) => sample.index)).toEqual([4, 5, 6]);
  });

  it.each([
    ["empty_samples", resultWith([])],
    ["sample_time_not_strict", resultWith([samples[0], { ...samples[1], sim_time_seconds: 0 }])],
    ["sample_index_duplicate", resultWith([samples[0], { ...samples[1], index: 4 }])],
    ["sample_value_not_finite", resultWith([{ ...samples[0], temperature_k: Number.NaN }])],
    ["sample_value_not_finite", resultWith([{ ...samples[0], air_density_kg_m3: Number.POSITIVE_INFINITY }])],
    ["sample_count_mismatch", { ...resultWith(samples), sample_count: 2 }],
    ["sample_contract_invalid", resultWith([{ ...samples[0], index: 1.5 }])],
  ] as const)("rejects %s", (code, value) => {
    expect(() => analyzeZoneAirState(value)).toThrowError(ZoneAirStateAnalysisError);
    try {
      analyzeZoneAirState(value);
    } catch (error) {
      expect((error as ZoneAirStateAnalysisError).code).toBe(code);
    }
  });

  it("formats elapsed time without treating it as a date or timezone", () => {
    expect(formatElapsedSeconds(172_800, "zh-CN")).toBe("2天 00:00:00");
    expect(formatElapsedSeconds(90_061.9, "en")).toBe("1 days 01:01:01");
    expect(formatElapsedSeconds(9_999_999, "en")).toBe("115 days 17:46:39");
  });

  it("formats display precision without changing stored values", () => {
    expect(formatResultNumber(293.150, 3)).toBe("293.15");
    expect(formatResultNumber(-1.4222, 4)).toBe("-1.4222");
    expect(formatResultNumber(1.20410, 5)).toBe("1.2041");
  });
});
