import type { ZoneAirStateResult, ZoneAirStateSample } from "./result-state";

export type ZoneAirStateMetricKey =
  | "temperature_k"
  | "reference_pressure_pa"
  | "air_density_kg_m3";

export type ZoneAirStateAnalysisErrorCode =
  | "empty_samples"
  | "sample_count_mismatch"
  | "sample_contract_invalid"
  | "sample_value_not_finite"
  | "sample_time_not_strict"
  | "sample_index_duplicate";

export class ZoneAirStateAnalysisError extends Error {
  readonly code: ZoneAirStateAnalysisErrorCode;

  constructor(code: ZoneAirStateAnalysisErrorCode) {
    super(code);
    this.name = "ZoneAirStateAnalysisError";
    this.code = code;
  }
}

export interface MetricExtreme {
  value: number;
  sampleIndex: number;
  simTimeSeconds: number;
}

export interface MetricStatistics {
  minimum: MetricExtreme;
  maximum: MetricExtreme;
  mean: number;
}

export interface ZoneAirStateAnalysis {
  sampleCount: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  firstSample: ZoneAirStateSample;
  lastSample: ZoneAirStateSample;
  timeStrictlyIncreasing: true;
  hasDuplicateSampleIndex: false;
  metrics: Record<ZoneAirStateMetricKey, MetricStatistics>;
}

interface MutableMetricStatistics {
  minimum: MetricExtreme;
  maximum: MetricExtreme;
  mean: number;
  count: number;
}

const METRICS: readonly ZoneAirStateMetricKey[] = [
  "temperature_k",
  "reference_pressure_pa",
  "air_density_kg_m3",
];

function isValidSampleShape(sample: ZoneAirStateSample): boolean {
  return Number.isSafeInteger(sample.index)
    && sample.index >= 0
    && Number.isSafeInteger(sample.day_of_year)
    && sample.day_of_year > 0
    && (sample.day_type === null || typeof sample.day_type === "string")
    && typeof sample.sim_time_seconds === "number"
    && typeof sample.temperature_k === "number"
    && typeof sample.reference_pressure_pa === "number"
    && typeof sample.air_density_kg_m3 === "number";
}

function createMetric(value: number, sample: ZoneAirStateSample): MutableMetricStatistics {
  const extreme = {
    value,
    sampleIndex: sample.index,
    simTimeSeconds: sample.sim_time_seconds,
  };
  return { minimum: extreme, maximum: extreme, mean: value, count: 1 };
}

function updateMetric(
  current: MutableMetricStatistics,
  value: number,
  sample: ZoneAirStateSample,
): void {
  current.count += 1;
  current.mean += (value - current.mean) / current.count;
  if (value < current.minimum.value) {
    current.minimum = { value, sampleIndex: sample.index, simTimeSeconds: sample.sim_time_seconds };
  }
  if (value > current.maximum.value) {
    current.maximum = { value, sampleIndex: sample.index, simTimeSeconds: sample.sim_time_seconds };
  }
}

export function analyzeZoneAirState(result: ZoneAirStateResult): ZoneAirStateAnalysis {
  if (!Array.isArray(result.samples) || result.samples.length === 0) {
    throw new ZoneAirStateAnalysisError("empty_samples");
  }
  if (!Number.isSafeInteger(result.sample_count) || result.sample_count !== result.samples.length) {
    throw new ZoneAirStateAnalysisError("sample_count_mismatch");
  }

  const seenIndices = new Set<number>();
  let previousTime: number | null = null;
  let metricState: Record<ZoneAirStateMetricKey, MutableMetricStatistics> | null = null;

  for (const sample of result.samples) {
    if (!isValidSampleShape(sample)) {
      throw new ZoneAirStateAnalysisError("sample_contract_invalid");
    }
    if (!Number.isFinite(sample.sim_time_seconds)
      || !Number.isFinite(sample.temperature_k)
      || !Number.isFinite(sample.reference_pressure_pa)
      || !Number.isFinite(sample.air_density_kg_m3)) {
      throw new ZoneAirStateAnalysisError("sample_value_not_finite");
    }
    if (previousTime !== null && sample.sim_time_seconds <= previousTime) {
      throw new ZoneAirStateAnalysisError("sample_time_not_strict");
    }
    if (seenIndices.has(sample.index)) {
      throw new ZoneAirStateAnalysisError("sample_index_duplicate");
    }
    seenIndices.add(sample.index);
    previousTime = sample.sim_time_seconds;

    if (!metricState) {
      metricState = {
        temperature_k: createMetric(sample.temperature_k, sample),
        reference_pressure_pa: createMetric(sample.reference_pressure_pa, sample),
        air_density_kg_m3: createMetric(sample.air_density_kg_m3, sample),
      };
    } else {
      for (const metric of METRICS) updateMetric(metricState[metric], sample[metric], sample);
    }
  }

  const firstSample = result.samples[0];
  const lastSample = result.samples[result.samples.length - 1];
  if (!metricState || !firstSample || !lastSample) {
    throw new ZoneAirStateAnalysisError("empty_samples");
  }
  const metric = (value: MutableMetricStatistics): MetricStatistics => ({
    minimum: value.minimum,
    maximum: value.maximum,
    mean: value.mean,
  });
  return {
    sampleCount: result.samples.length,
    startTimeSeconds: firstSample.sim_time_seconds,
    endTimeSeconds: lastSample.sim_time_seconds,
    durationSeconds: lastSample.sim_time_seconds - firstSample.sim_time_seconds,
    firstSample,
    lastSample,
    timeStrictlyIncreasing: true,
    hasDuplicateSampleIndex: false,
    metrics: {
      temperature_k: metric(metricState.temperature_k),
      reference_pressure_pa: metric(metricState.reference_pressure_pa),
      air_density_kg_m3: metric(metricState.air_density_kg_m3),
    },
  };
}

export function formatElapsedSeconds(totalSeconds: number, language: "zh-CN" | "en"): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new ZoneAirStateAnalysisError("sample_contract_invalid");
  }
  const wholeSeconds = Math.floor(totalSeconds);
  const days = Math.floor(wholeSeconds / 86_400);
  const hours = Math.floor((wholeSeconds % 86_400) / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const seconds = wholeSeconds % 60;
  const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  return language === "zh-CN" ? `${days}天 ${clock}` : `${days} days ${clock}`;
}

export function formatResultNumber(value: number, maximumFractionDigits: number): string {
  if (!Number.isFinite(value)) throw new ZoneAirStateAnalysisError("sample_value_not_finite");
  return value.toFixed(maximumFractionDigits).replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, "$1");
}
