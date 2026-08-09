import { describe, expect, it } from "vitest";
import { assistantReceiptMatchesPreview, buildAssistantContextReceipt } from "./assistant-context";

const selection = {
  intent: "diagnose_run_result" as const,
  result_dataset_fingerprint: "a".repeat(64),
  metric: "temperature_k" as const,
  selected_time_seconds: 3600,
};

describe("assistant context receipt", () => {
  it("is deterministic, human-sized, and excludes paths and large evidence", () => {
    const input = {
      intent: selection.intent,
      projectDisplayName: "C:\\private\\demo.prj",
      revisionNumber: 4,
      selectedObjectDisplayName: "Zone One",
      runId: "run-1",
      analysisSelection: selection,
      selectedAttachmentCount: 3,
      provider: { display_name: "OpenAI" } as never,
      modelId: "model-1",
      scopes: ["result_summary", "selected_zone"] as const,
    };
    const first = buildAssistantContextReceipt({ ...input, scopes: [...input.scopes] });
    const second = buildAssistantContextReceipt({ ...input, scopes: [...input.scopes].reverse() });
    expect(first.identity).toBe(second.identity);
    expect(first.project).toBe("demo.prj");
    expect(first.identity).not.toContain("C:\\private");
    expect(first.excluded).toEqual(["credentials", "absolute_paths", "original_prj_text", "complete_result_series"]);
    expect(assistantReceiptMatchesPreview(first, selection)).toBe(true);
  });

  it("changes identity for every preview-binding input", () => {
    const base = buildAssistantContextReceipt({ intent: selection.intent, projectDisplayName: "demo.prj", revisionNumber: 1, selectedObjectDisplayName: "Zone", runId: "run", analysisSelection: selection, selectedAttachmentCount: 0, provider: { display_name: "OpenAI" } as never, modelId: "model", scopes: ["selected_zone"] });
    const changedSelection = { ...selection, intent: "propose_change" as const };
    const changed = buildAssistantContextReceipt({ intent: "propose_change", projectDisplayName: "demo.prj", revisionNumber: 1, selectedObjectDisplayName: "Zone", runId: "run", analysisSelection: changedSelection, selectedAttachmentCount: 0, provider: { display_name: "OpenAI" } as never, modelId: "model", scopes: ["selected_zone"] });
    expect(changed.identity).not.toBe(base.identity);
    expect(assistantReceiptMatchesPreview(base, changedSelection)).toBe(false);
  });
});
