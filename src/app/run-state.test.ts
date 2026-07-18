import { describe, expect, it } from "vitest";
import { INITIAL_RUN_STATE, runReducer } from "./run-state";

const summary = {
  status: "succeeded" as const,
  run_id: "run-1",
  solver_name: "contamx3.exe",
  solver_version: "3.4.0.3",
  started_at_utc: "2026-07-18T12:00:00Z",
  duration_ms: 120,
  exit_code: 0,
  timed_out: false,
  sim_artifact_count: 1,
  source_unchanged: true,
};

describe("ContamX run state", () => {
  it("moves through running and success while ignoring stale responses", () => {
    const running = runReducer(INITIAL_RUN_STATE, { type: "run_started", sequence: 1, requestId: "r1", projectSessionId: "s1" });
    expect(running.status).toBe("running");
    expect(runReducer(running, { type: "run_failed", sequence: 2, requestId: "old", issue: { code: "x", message: "x", source_line_number: null, context: {} } })).toEqual(running);
    const succeeded = runReducer(running, { type: "run_succeeded", sequence: 1, requestId: "r1", projectSessionId: "s1", summary });
    expect(succeeded.summary).toEqual(summary);
  });

  it("retains the last success on failure and clears it for a project change", () => {
    const running = runReducer({ ...INITIAL_RUN_STATE, status: "succeeded", projectSessionId: "s1", summary }, { type: "run_started", sequence: 2, requestId: "r2", projectSessionId: "s1" });
    const failed = runReducer(running, { type: "run_failed", sequence: 2, requestId: "r2", issue: { code: "contamx_solver_not_configured", message: "hidden path", source_line_number: null, context: {} } });
    expect(failed.status).toBe("error");
    expect(failed.summary).toEqual(summary);
    expect(runReducer(failed, { type: "project_changed" })).toEqual(INITIAL_RUN_STATE);
  });
});
