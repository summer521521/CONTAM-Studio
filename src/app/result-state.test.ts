import { describe, expect, it } from "vitest";
import {
  INITIAL_RESULT_STATE,
  resultReducer,
  type ZoneAirStateResult,
} from "./result-state";

const result: ZoneAirStateResult = {
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

describe("Zone result state", () => {
  it("accepts only the latest successful response", () => {
    const loading = resultReducer(INITIAL_RESULT_STATE, {
      type: "load_started", sequence: 1, requestId: "r1", projectSessionId: "s1", zoneNumber: 1,
    });
    const stale = resultReducer(loading, { type: "load_failed", sequence: 0, requestId: "old", issue: { code: "x", message: "x", source_line_number: null, context: {} } });
    expect(stale.status).toBe("loading");
    const loaded = resultReducer(loading, { type: "load_succeeded", sequence: 1, requestId: "r1", projectSessionId: "s1", result });
    expect(loaded.status).toBe("loaded");
    expect(loaded.result?.samples[0].day_type).toBeNull();
  });

  it("clears results when the project or Zone changes", () => {
    const loading = resultReducer(INITIAL_RESULT_STATE, {
      type: "load_started", sequence: 1, requestId: "r1", projectSessionId: "s1", zoneNumber: 1,
    });
    expect(resultReducer(loading, { type: "project_or_zone_changed" })).toEqual(INITIAL_RESULT_STATE);
  });
});
