import { describe, expect, it } from "vitest";
import {
  applyResponseIssue,
  INITIAL_PATCH_STATE,
  patchReducer,
  patchResponseIssue,
  type PatchReviewView,
} from "./patch-state";

const review: PatchReviewView = {
  project_session_id: "session-1",
  patch_id: "patch-1",
  zone_id: "00000000-0000-5000-8000-000000000001",
  zone_number: 1,
  zone_name: "One",
  field: "volume_m3",
  old_token: "600",
  new_token: "650.0",
  old_value: 600,
  new_value: 650,
  source_line_number: 243,
  old_line: "1 3 0 0 0 1 0 600 293 0 One -1 0 2 0 0 0 0 0",
  new_line: "1 3 0 0 0 1 0 650.0 293 0 One -1 0 2 0 0 0 0 0",
  diff_text: "--- source.prj\n+++ proposed-copy.prj\n@@ Zone 1 @@\n-old\n+new",
};

describe("Patch workflow reducer", () => {
  it("moves from editing through planning to review", () => {
    const editing = patchReducer(INITIAL_PATCH_STATE, {
      type: "start_editing",
      projectSessionId: "session-1",
      zoneId: review.zone_id,
      token: "600",
    });
    const changed = patchReducer(editing, { type: "input_changed", token: "650.0" });
    const planning = patchReducer(changed, { type: "plan_started", requestId: "patch-1" });
    const reviewed = patchReducer(planning, { type: "plan_succeeded", requestId: "patch-1", review });
    expect(reviewed.status).toBe("review");
    expect(reviewed.review?.new_token).toBe("650.0");
    expect(reviewed.patchId).toBe("patch-1");
  });

  it("preserves the exact input string and invalidates an old review", () => {
    const state = { ...INITIAL_PATCH_STATE, status: "review" as const, review, patchId: "patch-1" };
    const changed = patchReducer(state, { type: "input_changed", token: "6.5e2" });
    expect(changed.newVolumeToken).toBe("6.5e2");
    expect(changed.review).toBeNull();
    expect(changed.patchId).toBeNull();
  });

  it("ignores an old plan response after input changed", () => {
    const state = {
      ...INITIAL_PATCH_STATE,
      status: "planning" as const,
      newVolumeToken: "700",
      planRequestId: "patch-2",
    };
    expect(patchReducer(state, { type: "plan_succeeded", requestId: "patch-1", review })).toBe(state);
  });

  it("keeps review if a legacy cancellation action is received", () => {
    const applying = {
      ...INITIAL_PATCH_STATE,
      status: "applying" as const,
      review,
      patchId: "patch-1",
      applyRequestId: "apply-1",
    };
    const cancelled = patchReducer(applying, { type: "apply_cancelled", requestId: "apply-1" });
    expect(cancelled.status).toBe("review");
    expect(cancelled.review).toBe(review);
  });

  it("keeps review after an output-path error", () => {
    const applying = { ...INITIAL_PATCH_STATE, status: "applying" as const, review, applyRequestId: "apply-1" };
    const failed = patchReducer(applying, {
      type: "apply_failed",
      requestId: "apply-1",
      invalidate: false,
      issue: { code: "patch_output_exists", message: "exists", source_line_number: null, context: {} },
    });
    expect(failed.status).toBe("review");
    expect(failed.review).toBe(review);
  });

  it("clears an invalid Patch plan after precondition failure", () => {
    const applying = { ...INITIAL_PATCH_STATE, status: "applying" as const, review, patchId: "patch-1", applyRequestId: "apply-1" };
    const failed = patchReducer(applying, {
      type: "apply_failed",
      requestId: "apply-1",
      invalidate: true,
      issue: { code: "patch_precondition_failed", message: "changed", source_line_number: null, context: {} },
    });
    expect(failed.review).toBeNull();
    expect(failed.patchId).toBeNull();
  });

  it("clears non-persistent Patch state when project or Zone changes", () => {
    const reviewed = { ...INITIAL_PATCH_STATE, status: "review" as const, review, patchId: "patch-1" };
    expect(patchReducer(reviewed, { type: "project_or_zone_changed" })).toEqual(INITIAL_PATCH_STATE);
  });
});

describe("desktop Patch response contracts", () => {
  it("accepts a plan review without a full Patch", () => {
    expect(patchResponseIssue({ request_id: "patch-1", review, error: null }, "patch-1")).toBeNull();
    expect(JSON.stringify(review)).not.toContain("byte_start");
    expect(JSON.stringify(review)).not.toContain("source_path");
  });

  it("rejects cancellation because draft application has no save dialog", () => {
    expect(applyResponseIssue({ request_id: "apply-1", cancelled: true, project_session_id: null, project: null, target_zone_number: null, target_zone_id: null, draft: null, error: null }, "apply-1")?.code).toBe("patch_apply_response_invalid");
  });

  it("rejects a stale or contradictory apply response", () => {
    const issue = applyResponseIssue({ request_id: "old", cancelled: true, project_session_id: null, project: null, target_zone_number: null, target_zone_id: null, draft: null, error: null }, "apply-1");
    expect(issue?.code).toBe("patch_apply_response_invalid");
  });
});
