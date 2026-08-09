import { describe, expect, it } from "vitest";
import { RESULT_FIXTURE } from "./result-state.test";
import {
  INITIAL_RESULT_DATASET_STATE,
  ZONE_RESULT_DATASET_SCHEMA,
  datasetMetricStatistics,
  datasetAvailableTimes,
  isTrustedResultDataset,
  nearestAvailableResultTime,
  datasetValueAtTime,
  resultColorScale,
  resultColorForValue,
  resultDatasetReducer,
  type ZoneResultDataset,
} from "./result-dataset-state";

function dataset(overrides: Partial<ZoneResultDataset> = {}): ZoneResultDataset {
  const second = { ...RESULT_FIXTURE, zone_id: "00000000-0000-5000-8000-000000000002", zone_number: 2, zone_name: "Two", extraction_id: "extract-2", samples: [{ ...RESULT_FIXTURE.samples[0], reference_pressure_pa: 2 }] };
  return {
    schema: ZONE_RESULT_DATASET_SCHEMA,
    status: "ready",
    project_session_id: "session-1",
    project_source_hash: "a".repeat(64),
    revision_id: "00000000-0000-5000-8000-000000000003",
    run_id: "run-1",
    run_manifest_identity: "b".repeat(64),
    extraction_batch_id: "batch-1",
    metric_definitions: [
      { key: "temperature_k", display_name: "Temperature", unit: "K" },
      { key: "reference_pressure_pa", display_name: "Reference pressure", unit: "Pa" },
      { key: "air_density_kg_m3", display_name: "Air density", unit: "kg/m3" },
    ],
    requested_zones: [
      { zone_id: RESULT_FIXTURE.zone_id, zone_number: 1, zone_name: "One" },
      { zone_id: second.zone_id, zone_number: 2, zone_name: "Two" },
    ],
    successful_zone_series: [RESULT_FIXTURE, second],
    per_zone_failures: [],
    time_identity: { kind: "exact_shared", shared_time_seconds: [0] },
    evidence_summary: { solver_name: "ContamX", solver_version: "3.4", run_manifest_sha256: "b".repeat(64), source_unchanged: true, successful_zone_count: 2, failed_zone_count: 0 },
    created_at_unix_ms: 1,
    bounds: { zone_limit: 64, sample_limit: 250000, payload_limit_bytes: 33554432, total_samples: 2, truncated: false },
    dataset_fingerprint: "c".repeat(64),
    ...overrides,
  };
}

describe("zone result dataset", () => {
  it("accepts only the current response and resets on project identity changes", () => {
    const loading = resultDatasetReducer(INITIAL_RESULT_DATASET_STATE, { type: "load_started", sequence: 2, requestId: "r2", projectSessionId: "session-1", revisionId: "revision-1", runId: "run-1" });
    expect(resultDatasetReducer(loading, { type: "load_succeeded", sequence: 1, requestId: "old", dataset: dataset() })).toEqual(loading);
    const ready = resultDatasetReducer(loading, { type: "load_succeeded", sequence: 2, requestId: "r2", dataset: dataset() });
    expect(ready.status).toBe("ready");
    expect(ready.lastTrustedDataset?.dataset_fingerprint).toBe("c".repeat(64));
    expect(ready.selectedZoneIds).toHaveLength(2);
    expect(resultDatasetReducer(ready, { type: "identity_changed" })).toEqual(INITIAL_RESULT_DATASET_STATE);
  });

  it("retains the last trusted dataset when refresh fails", () => {
    const loading = resultDatasetReducer(INITIAL_RESULT_DATASET_STATE, { type: "load_started", sequence: 1, requestId: "r1", projectSessionId: "session-1", revisionId: "revision-1", runId: "run-1" });
    const ready = resultDatasetReducer(loading, { type: "load_succeeded", sequence: 1, requestId: "r1", dataset: dataset() });
    const refresh = resultDatasetReducer(ready, { type: "load_started", sequence: 2, requestId: "r2", projectSessionId: "session-1", revisionId: ready.revisionId!, runId: "run-1" });
    const stale = resultDatasetReducer(refresh, { type: "load_failed", sequence: 2, requestId: "r2", issue: { code: "simread_failed", message: "failed", source_line_number: null, context: {} } });
    expect(stale.status).toBe("stale");
    expect(stale.dataset?.dataset_fingerprint).toBe("c".repeat(64));
    expect(stale.refreshIssue?.code).toBe("simread_failed");
  });

  it("preserves partial truth and exact common-time evidence", () => {
    const partial = dataset({
      status: "partial",
      requested_zones: [...dataset().requested_zones, { zone_id: "zone-3", zone_number: 3, zone_name: "Three" }],
      per_zone_failures: [{ zone_id: "zone-3", zone_number: 3, zone_name: "Three", code: "simread_failed" }],
      time_identity: { kind: "exact_common", shared_time_seconds: [0] },
    });
    const loading = resultDatasetReducer(INITIAL_RESULT_DATASET_STATE, { type: "load_started", sequence: 3, requestId: "partial", projectSessionId: "session-1", revisionId: "revision-1", runId: "run-1" });
    const state = resultDatasetReducer(loading, { type: "load_succeeded", sequence: 3, requestId: "partial", dataset: partial });
    expect(state.status).toBe("partial");
    expect(state.dataset?.successful_zone_series).toHaveLength(2);
    expect(state.dataset?.per_zone_failures).toEqual(partial.per_zone_failures);
    expect(state.selectedTimeSeconds).toBe(0);
    expect(state.lastTrustedDataset?.status).toBe("partial");
  });

  it("never promotes failed or zero-success partial data to last trusted", () => {
    const readyLoading = resultDatasetReducer(INITIAL_RESULT_DATASET_STATE, { type: "load_started", sequence: 1, requestId: "ready", projectSessionId: "session-1", revisionId: "revision-1", runId: "run-1" });
    const ready = resultDatasetReducer(readyLoading, { type: "load_succeeded", sequence: 1, requestId: "ready", dataset: dataset() });
    const failedLoading = resultDatasetReducer(ready, { type: "load_started", sequence: 2, requestId: "failed", projectSessionId: "session-1", revisionId: "revision-1", runId: "run-1" });
    const failedDataset = dataset({ status: "failed", successful_zone_series: [], evidence_summary: { ...dataset().evidence_summary, successful_zone_count: 0, failed_zone_count: 2 } });
    const failed = resultDatasetReducer(failedLoading, { type: "load_succeeded", sequence: 2, requestId: "failed", dataset: failedDataset });
    expect(failed.dataset?.status).toBe("failed");
    expect(failed.lastTrustedDataset?.status).toBe("ready");
    const retry = resultDatasetReducer(failed, { type: "load_started", sequence: 3, requestId: "retry", projectSessionId: "session-1", revisionId: "revision-1", runId: "run-1" });
    const retained = resultDatasetReducer(retry, { type: "load_failed", sequence: 3, requestId: "retry", issue: { code: "simread_failed", message: "failed", source_line_number: null, context: {} } });
    expect(retained.status).toBe("stale");
    expect(retained.dataset?.status).toBe("ready");
    expect(isTrustedResultDataset(failedDataset)).toBe(false);
    expect(isTrustedResultDataset(dataset({ status: "partial", successful_zone_series: [] }))).toBe(false);
  });

  it("does not let a cancelled or late request replace trusted state", () => {
    const firstLoading = resultDatasetReducer(INITIAL_RESULT_DATASET_STATE, { type: "load_started", sequence: 1, requestId: "first", projectSessionId: "session-1", revisionId: "revision-1", runId: "run-1" });
    const trusted = resultDatasetReducer(firstLoading, { type: "load_succeeded", sequence: 1, requestId: "first", dataset: dataset() });
    const refresh = resultDatasetReducer(trusted, { type: "load_started", sequence: 2, requestId: "refresh", projectSessionId: "session-1", revisionId: "revision-1", runId: "run-1" });
    const late = resultDatasetReducer(refresh, { type: "load_succeeded", sequence: 1, requestId: "first", dataset: dataset({ dataset_fingerprint: "d".repeat(64) }) });
    expect(late).toEqual(refresh);
    const cancelled = resultDatasetReducer(refresh, { type: "load_cancelled", sequence: 2, requestId: "refresh", dataset: null });
    expect(cancelled.status).toBe("stale");
    expect(cancelled.dataset?.dataset_fingerprint).toBe("c".repeat(64));
  });

  it("computes deterministic summaries without replacing missing values with zero", () => {
    const value = dataset();
    const statistics = datasetMetricStatistics(value, "reference_pressure_pa");
    expect(statistics).toMatchObject({ minimum: RESULT_FIXTURE.samples[0].reference_pressure_pa, maximum: 2, valueCount: 2 });
    expect(statistics?.mean).toBeCloseTo((RESULT_FIXTURE.samples[0].reference_pressure_pa + 2) / 2, 12);
    expect(datasetValueAtTime(value, RESULT_FIXTURE.zone_id, "temperature_k", 0)).toBe(293.15);
    expect(datasetValueAtTime(value, RESULT_FIXTURE.zone_id, "temperature_k", 60)).toBeNull();
  });

  it("uses a fixed all-times range and diverges pressure only when zero is crossed", () => {
    const diverging = resultColorScale(dataset(), "reference_pressure_pa");
    expect(diverging).toMatchObject({ kind: "diverging", center: 0, rangeStrategy: "dataset_all_times" });
    expect(diverging && resultColorForValue(diverging, 0)).toBe("rgb(247, 247, 247)");
    expect(diverging && resultColorForValue(diverging, null)).toBeNull();
    const positive = dataset({ successful_zone_series: [{ ...RESULT_FIXTURE, samples: [{ ...RESULT_FIXTURE.samples[0], reference_pressure_pa: 1 }] }] });
    expect(resultColorScale(positive, "reference_pressure_pa")).toMatchObject({ kind: "sequential", center: null });
    expect(resultColorScale(dataset(), "temperature_k")?.kind).toBe("sequential");
  });

  it("limits visible series selection to eight unique zones", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `zone-${index}`);
    const selected = resultDatasetReducer(INITIAL_RESULT_DATASET_STATE, { type: "zones_changed", zoneIds: [...ids, ids[0]] });
    expect(selected.selectedZoneIds).toEqual(ids.slice(0, 8));
  });

  it("selects only exact dataset times and deterministically snaps to the nearest one", () => {
    const value = dataset({ time_identity: { kind: "exact_shared", shared_time_seconds: [0, 60, 120] } });
    expect(datasetAvailableTimes(value)).toEqual([0, 60, 120]);
    expect(nearestAvailableResultTime([0, 60, 120], 89)).toBe(60);
    expect(nearestAvailableResultTime([0, 60, 120], 90)).toBe(60);
    const loading = resultDatasetReducer(INITIAL_RESULT_DATASET_STATE, { type: "load_started", sequence: 9, requestId: "times", projectSessionId: "session-1", revisionId: "revision-1", runId: "run-1" });
    const ready = resultDatasetReducer(loading, { type: "load_succeeded", sequence: 9, requestId: "times", dataset: value });
    expect(resultDatasetReducer(ready, { type: "time_changed", timeSeconds: 89 }).selectedTimeSeconds).toBe(60);
  });
});
