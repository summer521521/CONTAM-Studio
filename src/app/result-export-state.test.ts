import { describe, expect, it } from "vitest";
import {
  INITIAL_RESULT_EXPORT_STATE,
  resultExportReducer,
  resultExportResponseIssue,
} from "./result-export-state";

const start = () => resultExportReducer(INITIAL_RESULT_EXPORT_STATE, {
  type: "selection_started",
  sequence: 1,
  requestId: "export-1",
  projectSessionId: "session-1",
  zoneId: "00000000-0000-5000-8000-000000000001",
  zoneNumber: 1,
  runId: "run-1",
  extractionId: "extract-1",
});

describe("Zone result CSV export state", () => {
  it("tracks native destination selection and host write phases", () => {
    const selecting = start();
    expect(selecting.status).toBe("selecting_destination");
    const exporting = resultExportReducer(selecting, { type: "host_exporting_started", requestId: "export-1" });
    expect(exporting.status).toBe("exporting");
    expect(resultExportReducer(exporting, { type: "host_exporting_started", requestId: "old" })).toEqual(exporting);
  });

  it("keeps cancellation and errors separate from the loaded result state", () => {
    const cancelled = resultExportReducer(start(), { type: "export_cancelled", sequence: 1, requestId: "export-1" });
    expect(cancelled.status).toBe("cancelled");
    const failed = resultExportReducer(start(), {
      type: "export_failed",
      sequence: 1,
      requestId: "export-1",
      issue: { code: "export_destination_exists", message: "hidden", source_line_number: null, context: {} },
    });
    expect(failed.status).toBe("error");
    expect(failed.issue?.code).toBe("export_destination_exists");
  });

  it("accepts only the current safe success response and resets with the result", () => {
    const selecting = start();
    const stale = resultExportReducer(selecting, {
      type: "export_succeeded",
      sequence: 0,
      requestId: "old",
      projectSessionId: "session-1",
      summary: { file_name: "old.csv", row_count: 1, byte_count: 2, run_id: "run-1", extraction_id: "extract-1", zone_id: "00000000-0000-5000-8000-000000000001", zone_number: 1 },
    });
    expect(stale).toEqual(selecting);
    expect(resultExportReducer(selecting, { type: "result_changed" })).toEqual(INITIAL_RESULT_EXPORT_STATE);
  });

  it("rejects a malformed desktop response", () => {
    expect(resultExportResponseIssue({ request_id: "other", cancelled: false, project_session_id: null, export: null, error: null }, "export-1")?.code)
      .toBe("export_response_contract_invalid");
    expect(resultExportResponseIssue({
      request_id: "export-1",
      cancelled: true,
      project_session_id: "session-1",
      export: null,
      error: null,
    }, "export-1")?.code).toBe("export_response_contract_invalid");
  });
});
