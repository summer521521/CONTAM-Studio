import { describe, expect, it } from "vitest";
import { INITIAL_STUDY_STATE, studyReducer, studyResultFilter, studyStatusFromResults, type StudyPlan, type StudySampleResult } from "./study-state";

const plan: StudyPlan = {
  schema_version: "study_plan.v1",
  study_id: "11111111-1111-5111-8111-111111111111",
  baseline_project_sha256: "a".repeat(64),
  revision_id: "22222222-2222-5222-8222-222222222222",
  patch_sha256: null,
  parameters: [],
  mode: "single_scan",
  max_combinations: 32,
  samples: [{ sample_id: "33333333-3333-5333-8333-333333333333", ordinal: 0, values: {}, status: "queued" }],
  study_hash: "b".repeat(64),
  created_at: "now",
};

function result(status: StudySampleResult["status"]): StudySampleResult {
  return {
    schema_version: "study_sample_result.v1",
    study_id: plan.study_id,
    study_hash: plan.study_hash,
    sample_id: plan.samples[0].sample_id,
    status,
    parameters: {},
    project_sha256: plan.baseline_project_sha256,
    solver_manifest: {},
    statistics: {},
    result_hash: null,
    error: null,
    generated_at: "now",
    provenance: "synthetic fixture",
    evidence: [],
  };
}

describe("study state", () => {
  it("does not send an empty value filter that would hide every result", () => {
    expect(studyResultFilter("")).toEqual({ parameter: null, value: null });
    expect(studyResultFilter("  ")).toEqual({ parameter: null, value: null });
    expect(studyResultFilter("500")).toEqual({ parameter: "zone-volume", value: 500 });
    expect(studyResultFilter("not-a-number")).toEqual({ parameter: null, value: null });
  });
  it("keeps plan, run and partial status transitions explicit", () => {
    const planned = studyReducer(INITIAL_STUDY_STATE, { type: "plan_ready", requestId: "r", plan });
    const running = studyReducer(planned, { type: "run_started", requestId: "r" });
    const partial = studyReducer(running, { type: "run_succeeded", requestId: "r", results: [result("failed")], status: "partial" });
    expect(partial.status).toBe("partial");
    expect(studyStatusFromResults([result("failed")], 1)).toBe("failed");
  });

  it("does not let a stale cancel response change a newer run", () => {
    const state = studyReducer(INITIAL_STUDY_STATE, { type: "run_started", requestId: "new" });
    expect(studyReducer(state, { type: "cancelled", requestId: "old" })).toBe(state);
  });

  it("ignores a late run result after cancellation", () => {
    const running = studyReducer(INITIAL_STUDY_STATE, { type: "run_started", requestId: "run" });
    const cancelled = studyReducer(running, { type: "cancelled", requestId: "run" });
    expect(studyReducer(cancelled, { type: "run_succeeded", requestId: "run", results: [result("succeeded")], status: "succeeded" })).toBe(cancelled);
  });
});
