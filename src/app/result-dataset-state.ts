import type { ReaderDiagnostic } from "./project-state";
import {
  isSimReadNodeAirStateUnavailable,
  type ZoneAirStateResult,
  type ZoneAirStateSample,
} from "./result-state";

export const ZONE_RESULT_DATASET_SCHEMA = "zone_result_dataset.v1" as const;
export const MAX_DATASET_ZONES = 64;
export const MAX_VISIBLE_RESULT_SERIES = 8;
export const RESULT_TABLE_PAGE_SIZE = 100;

export type ZoneResultDatasetStatus = "ready" | "partial" | "failed" | "cancelled" | "stale";
export type ResultMetricKey = "temperature_k" | "reference_pressure_pa" | "air_density_kg_m3";

export interface ResultMetricDefinition {
  key: ResultMetricKey;
  display_name: string;
  unit: "K" | "Pa" | "kg/m3";
}

export interface RequestedZoneIdentity {
  zone_id: string;
  zone_number: number;
  zone_name: string;
}

export interface ZoneResultFailure {
  zone_id: string;
  zone_number: number;
  zone_name: string;
  code: string;
}

export interface ResultTimeIdentity {
  kind: "exact_shared" | "exact_common" | "per_zone" | "none";
  shared_time_seconds: number[];
}

export interface ResultEvidenceSummary {
  solver_name: string;
  solver_version: string;
  run_manifest_sha256: string;
  source_unchanged: boolean;
  successful_zone_count: number;
  failed_zone_count: number;
}

export interface ResultDatasetBounds {
  zone_limit: number;
  sample_limit: number;
  payload_limit_bytes: number;
  total_samples: number;
  truncated: false;
}

export interface ZoneResultDataset {
  schema: typeof ZONE_RESULT_DATASET_SCHEMA;
  status: ZoneResultDatasetStatus;
  project_session_id: string;
  project_source_hash: string;
  revision_id: string;
  run_id: string;
  run_manifest_identity: string;
  extraction_batch_id: string;
  metric_definitions: ResultMetricDefinition[];
  requested_zones: RequestedZoneIdentity[];
  successful_zone_series: ZoneAirStateResult[];
  per_zone_failures: ZoneResultFailure[];
  time_identity: ResultTimeIdentity;
  evidence_summary: ResultEvidenceSummary;
  created_at_unix_ms: number;
  bounds: ResultDatasetBounds;
  dataset_fingerprint: string;
}

export interface DesktopZoneResultDatasetResponse {
  request_id: string;
  cancelled: boolean;
  project_session_id: string | null;
  dataset: ZoneResultDataset | null;
  error: ReaderDiagnostic | null;
}

export interface ResultDatasetState {
  status: "idle" | "loading" | ZoneResultDatasetStatus;
  activeSequence: number | null;
  activeRequestId: string | null;
  projectSessionId: string | null;
  revisionId: string | null;
  runId: string | null;
  dataset: ZoneResultDataset | null;
  lastTrustedDataset: ZoneResultDataset | null;
  issue: ReaderDiagnostic | null;
  refreshIssue: ReaderDiagnostic | null;
  metric: ResultMetricKey;
  selectedTimeSeconds: number | null;
  selectedZoneIds: string[];
}

export const INITIAL_RESULT_DATASET_STATE: ResultDatasetState = {
  status: "idle",
  activeSequence: null,
  activeRequestId: null,
  projectSessionId: null,
  revisionId: null,
  runId: null,
  dataset: null,
  lastTrustedDataset: null,
  issue: null,
  refreshIssue: null,
  metric: "temperature_k",
  selectedTimeSeconds: null,
  selectedZoneIds: [],
};

export type ResultDatasetAction =
  | { type: "load_started"; sequence: number; requestId: string; projectSessionId: string; revisionId: string; runId: string }
  | { type: "load_succeeded"; sequence: number; requestId: string; dataset: ZoneResultDataset }
  | { type: "load_failed"; sequence: number; requestId: string; issue: ReaderDiagnostic }
  | { type: "load_cancelled"; sequence: number; requestId: string; dataset: ZoneResultDataset | null }
  | { type: "metric_changed"; metric: ResultMetricKey }
  | { type: "time_changed"; timeSeconds: number | null }
  | { type: "zones_changed"; zoneIds: string[] }
  | { type: "identity_changed" }
  | { type: "marked_stale" };

function current(state: ResultDatasetState, sequence: number, requestId: string): boolean {
  return state.activeSequence === sequence && state.activeRequestId === requestId;
}

function firstTime(dataset: ZoneResultDataset): number | null {
  return dataset.time_identity.shared_time_seconds[0]
    ?? dataset.successful_zone_series[0]?.samples[0]?.sim_time_seconds
    ?? null;
}

function defaultZones(dataset: ZoneResultDataset): string[] {
  return dataset.successful_zone_series.slice(0, MAX_VISIBLE_RESULT_SERIES).map((series) => series.zone_id);
}

export function isTrustedResultDataset(dataset: ZoneResultDataset): boolean {
  return dataset.status === "ready"
    || (dataset.status === "partial" && dataset.successful_zone_series.length > 0);
}

export function datasetHasOnlyUnavailableNodeAirState(dataset: ZoneResultDataset | null): boolean {
  return Boolean(
    dataset
    && dataset.successful_zone_series.length === 0
    && dataset.per_zone_failures.length > 0
    && dataset.per_zone_failures.every((failure) => isSimReadNodeAirStateUnavailable(failure.code)),
  );
}

export function datasetAvailableTimes(
  dataset: ZoneResultDataset,
  zoneIds: readonly string[] = [],
): number[] {
  if (dataset.time_identity.shared_time_seconds.length) {
    return [...dataset.time_identity.shared_time_seconds].sort((left, right) => left - right);
  }
  const selected = new Set(zoneIds);
  return Array.from(new Set(dataset.successful_zone_series
    .filter((series) => !selected.size || selected.has(series.zone_id))
    .flatMap((series) => series.samples.map((sample) => sample.sim_time_seconds))))
    .sort((left, right) => left - right);
}

export function nearestAvailableResultTime(times: readonly number[], requested: number): number | null {
  if (!Number.isFinite(requested) || !times.length) return null;
  let nearest = times[0];
  let distance = Math.abs(nearest - requested);
  for (let index = 1; index < times.length; index += 1) {
    const candidateDistance = Math.abs(times[index] - requested);
    if (candidateDistance < distance) {
      nearest = times[index];
      distance = candidateDistance;
    }
  }
  return nearest;
}

export function resultDatasetReducer(state: ResultDatasetState, action: ResultDatasetAction): ResultDatasetState {
  switch (action.type) {
    case "load_started":
      return { ...state, status: "loading", activeSequence: action.sequence, activeRequestId: action.requestId, projectSessionId: action.projectSessionId, revisionId: action.revisionId, runId: action.runId, issue: null, refreshIssue: null };
    case "load_succeeded":
      if (!current(state, action.sequence, action.requestId)) return state;
      {
        const trusted = isTrustedResultDataset(action.dataset);
      return {
        ...state,
        status: action.dataset.status,
        activeSequence: null,
        activeRequestId: null,
        projectSessionId: action.dataset.project_session_id,
        revisionId: action.dataset.revision_id,
        runId: action.dataset.run_id,
        dataset: action.dataset,
        lastTrustedDataset: trusted ? action.dataset : state.lastTrustedDataset,
        issue: null,
        refreshIssue: null,
        selectedTimeSeconds: firstTime(action.dataset),
        selectedZoneIds: defaultZones(action.dataset),
      };
      }
    case "load_failed":
      if (!current(state, action.sequence, action.requestId)) return state;
      return state.lastTrustedDataset
        ? { ...state, status: "stale", activeSequence: null, activeRequestId: null, dataset: state.lastTrustedDataset, issue: null, refreshIssue: action.issue }
        : { ...state, status: "failed", activeSequence: null, activeRequestId: null, issue: action.issue, refreshIssue: null };
    case "load_cancelled":
      if (!current(state, action.sequence, action.requestId)) return state;
      if (state.lastTrustedDataset) return { ...state, status: "stale", activeSequence: null, activeRequestId: null, dataset: state.lastTrustedDataset, refreshIssue: null };
      return { ...state, status: "cancelled", activeSequence: null, activeRequestId: null, dataset: action.dataset, issue: null, refreshIssue: null };
    case "metric_changed":
      return { ...state, metric: action.metric };
    case "time_changed":
      if (action.timeSeconds === null || !state.dataset) return { ...state, selectedTimeSeconds: null };
      return {
        ...state,
        selectedTimeSeconds: nearestAvailableResultTime(
          datasetAvailableTimes(state.dataset, state.selectedZoneIds),
          action.timeSeconds,
        ),
      };
    case "zones_changed":
      return { ...state, selectedZoneIds: Array.from(new Set(action.zoneIds)).slice(0, MAX_VISIBLE_RESULT_SERIES) };
    case "marked_stale":
      return state.dataset ? { ...state, status: "stale" } : state;
    case "identity_changed":
      return { ...INITIAL_RESULT_DATASET_STATE };
  }
}

export interface DatasetMetricStatistics {
  minimum: number;
  maximum: number;
  mean: number;
  valueCount: number;
}

export function datasetMetricStatistics(
  dataset: ZoneResultDataset,
  metric: ResultMetricKey,
  zoneIds?: ReadonlySet<string>,
): DatasetMetricStatistics | null {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let mean = 0;
  let count = 0;
  for (const series of dataset.successful_zone_series) {
    if (zoneIds && !zoneIds.has(series.zone_id)) continue;
    for (const sample of series.samples) {
      const value = sample[metric];
      if (!Number.isFinite(value)) continue;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      count += 1;
      mean += (value - mean) / count;
    }
  }
  return count ? { minimum, maximum, mean, valueCount: count } : null;
}

export interface ResultColorScale {
  kind: "sequential" | "diverging";
  minimum: number;
  maximum: number;
  center: number | null;
  rangeStrategy: "dataset_all_times";
}

const SEQUENTIAL_START = [239, 243, 255] as const;
const SEQUENTIAL_END = [0, 92, 128] as const;
const DIVERGING_LOW = [33, 102, 172] as const;
const DIVERGING_MIDDLE = [247, 247, 247] as const;
const DIVERGING_HIGH = [178, 24, 43] as const;

function interpolateChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * Math.min(1, Math.max(0, ratio)));
}

function interpolateColor(start: readonly number[], end: readonly number[], ratio: number): string {
  return `rgb(${interpolateChannel(start[0], end[0], ratio)}, ${interpolateChannel(start[1], end[1], ratio)}, ${interpolateChannel(start[2], end[2], ratio)})`;
}

export function resultColorForValue(scale: ResultColorScale, value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (scale.maximum === scale.minimum) return interpolateColor(SEQUENTIAL_START, SEQUENTIAL_END, 0.55);
  if (scale.kind === "diverging" && scale.center === 0) {
    if (value <= 0) return interpolateColor(DIVERGING_LOW, DIVERGING_MIDDLE, (value - scale.minimum) / (0 - scale.minimum));
    return interpolateColor(DIVERGING_MIDDLE, DIVERGING_HIGH, value / scale.maximum);
  }
  return interpolateColor(SEQUENTIAL_START, SEQUENTIAL_END, (value - scale.minimum) / (scale.maximum - scale.minimum));
}

export function resultColorScale(dataset: ZoneResultDataset, metric: ResultMetricKey): ResultColorScale | null {
  const statistics = datasetMetricStatistics(dataset, metric);
  if (!statistics) return null;
  const crossesZero = metric === "reference_pressure_pa" && statistics.minimum < 0 && statistics.maximum > 0;
  if (crossesZero) {
    const extent = Math.max(Math.abs(statistics.minimum), Math.abs(statistics.maximum));
    return { kind: "diverging", minimum: -extent, maximum: extent, center: 0, rangeStrategy: "dataset_all_times" };
  }
  return { kind: "sequential", minimum: statistics.minimum, maximum: statistics.maximum, center: null, rangeStrategy: "dataset_all_times" };
}

export function exactSampleAtTime(series: ZoneAirStateResult, timeSeconds: number): ZoneAirStateSample | null {
  let low = 0;
  let high = series.samples.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const sample = series.samples[middle];
    if (sample.sim_time_seconds === timeSeconds) return sample;
    if (sample.sim_time_seconds < timeSeconds) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

export function datasetValueAtTime(
  dataset: ZoneResultDataset,
  zoneId: string,
  metric: ResultMetricKey,
  timeSeconds: number,
): number | null {
  const series = dataset.successful_zone_series.find((item) => item.zone_id === zoneId);
  const sample = series ? exactSampleAtTime(series, timeSeconds) : null;
  const value = sample?.[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function datasetResponseIssue(response: DesktopZoneResultDatasetResponse, requestId: string): ReaderDiagnostic | null {
  if (response.request_id !== requestId) return { code: "result_dataset_request_mismatch", message: "Result dataset request mismatch", source_line_number: null, context: {} };
  if (response.cancelled) return null;
  if (!response.dataset && !response.error) return { code: "result_dataset_response_invalid", message: "Result dataset response invalid", source_line_number: null, context: {} };
  return response.error;
}
