import { describe, expect, it } from "vitest";
import {
  INITIAL_RESULT_STATE,
  resultReducer,
  type ZoneAirStateResult,
} from "./result-state";

export const RESULT_FIXTURE: ZoneAirStateResult = {
  schema_version: "1.0",
  result_type: "zone_air_state",
  run_id: "run-1",
  extraction_id: "extract-1",
  zone_number: 1,
  zone_name: "One",
  source_line_number: 243,
  unit_system: "SI",
  sample_count: 1,
  samples: [{
    index: 0,
    day_of_year: 1,
    day_type: null,
    sim_time_seconds: 0,
    temperature_k: 293.15,
    reference_pressure_pa: -1.4222,
    air_density_kg_m3: 1.2041,
  }],
  day_type_source: "not_available_in_simread_nfr_v1",
  time_contract: "elapsed_seconds_from_first_sample",
};

function start(sequence = 1, requestId = "r1") {
  return resultReducer(INITIAL_RESULT_STATE, {
    type: "selection_started",
    sequence,
    requestId,
    projectSessionId: "s1",
    zoneNumber: 1,
  });
}

describe("Zone result state", () => {
  it("enters selecting before the host advances the current request to loading", () => {
    const selecting = start();
    expect(selecting.status).toBe("selecting");
    const loading = resultReducer(selecting, { type: "host_loading_started", requestId: "r1" });
    expect(loading.status).toBe("loading");
  });

  it("ignores a host stage notification from an old request", () => {
    const selecting = start(2, "current");
    expect(resultReducer(selecting, { type: "host_loading_started", requestId: "old" })).toEqual(selecting);
  });

  it("accepts only the latest successful response", () => {
    const loading = resultReducer(start(), { type: "host_loading_started", requestId: "r1" });
    const stale = resultReducer(loading, {
      type: "load_failed",
      sequence: 0,
      requestId: "old",
      issue: { code: "x", message: "x", source_line_number: null, context: {} },
    });
    expect(stale.status).toBe("loading");
    const loaded = resultReducer(loading, {
      type: "load_succeeded",
      sequence: 1,
      requestId: "r1",
      projectSessionId: "s1",
      result: RESULT_FIXTURE,
    });
    expect(loaded.status).toBe("loaded");
    expect(loaded.result?.samples[0].day_type).toBeNull();
  });

  it("shows first-load cancellation without inventing results", () => {
    const cancelled = resultReducer(start(), { type: "load_cancelled", sequence: 1, requestId: "r1" });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.result).toBeNull();
  });

  it("retains a successful result when a later load is cancelled or fails", () => {
    const loaded = resultReducer(start(), {
      type: "load_succeeded",
      sequence: 1,
      requestId: "r1",
      projectSessionId: "s1",
      result: RESULT_FIXTURE,
    });
    const selecting = resultReducer(loaded, {
      type: "selection_started",
      sequence: 2,
      requestId: "r2",
      projectSessionId: "s1",
      zoneNumber: 1,
    });
    const cancelled = resultReducer(selecting, { type: "load_cancelled", sequence: 2, requestId: "r2" });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.result).toEqual(RESULT_FIXTURE);

    const retry = resultReducer(cancelled, {
      type: "selection_started",
      sequence: 3,
      requestId: "r3",
      projectSessionId: "s1",
      zoneNumber: 1,
    });
    const failed = resultReducer(retry, {
      type: "load_failed",
      sequence: 3,
      requestId: "r3",
      issue: { code: "simread_not_configured", message: "hidden path", source_line_number: null, context: {} },
    });
    expect(failed.status).toBe("error");
    expect(failed.result).toEqual(RESULT_FIXTURE);
  });

  it("clears results and notices when the project or Zone changes", () => {
    const cancelled = resultReducer(start(), { type: "load_cancelled", sequence: 1, requestId: "r1" });
    expect(resultReducer(cancelled, { type: "project_or_zone_changed" })).toEqual(INITIAL_RESULT_STATE);
  });
});
