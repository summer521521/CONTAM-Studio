import { describe, expect, it } from "vitest";
import { isSafeCloseRequest, isSafeCloseResolution } from "./close-state";

describe("close protocol views", () => {
  it("accepts only bounded request activity", () => {
    expect(isSafeCloseRequest({
      request_id: "close-1",
      draft_decision_required: true,
      active_work: [],
      repeated: false,
    })).toBe(true);
    expect(isSafeCloseRequest({
      request_id: "close-1",
      draft_decision_required: false,
      active_work: ["simulation_execution"],
      repeated: false,
    })).toBe(true);
    expect(isSafeCloseRequest({
      request_id: "close-1",
      draft_decision_required: false,
      active_work: ["run", "run"],
      repeated: false,
    })).toBe(false);
    expect(isSafeCloseRequest({
      request_id: "close-1",
      draft_decision_required: false,
      active_work: ["/secret"],
      repeated: false,
    })).toBe(false);
  });

  it("requires closing responses to be final and error free", () => {
    expect(isSafeCloseResolution({
      request_id: "close-1",
      status: "closing",
      needs_export: false,
      close_started: true,
      error_code: null,
    }, "close-1")).toBe(true);
    expect(isSafeCloseResolution({
      request_id: "close-1",
      status: "closing",
      needs_export: true,
      close_started: true,
      error_code: null,
    }, "close-1")).toBe(false);
    expect(isSafeCloseResolution({
      request_id: "close-2",
      status: "cancelled",
      needs_export: false,
      close_started: false,
      error_code: null,
    }, "close-1")).toBe(false);
  });
});
