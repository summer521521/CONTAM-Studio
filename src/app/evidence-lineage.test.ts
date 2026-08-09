import { describe, expect, it } from "vitest";
import { INITIAL_PROJECT_STATE } from "./project-state";
import { INITIAL_RESULT_DATASET_STATE } from "./result-dataset-state";
import { INITIAL_RUN_STATE } from "./run-state";
import { buildEvidenceLineage, evidenceChainStatus } from "./evidence-lineage";

describe("evidence lineage", () => {
  it("does not claim a verified chain when evidence is missing", () => {
    expect(buildEvidenceLineage(INITIAL_PROJECT_STATE, INITIAL_RUN_STATE, INITIAL_RESULT_DATASET_STATE)).toEqual([]);
    expect(evidenceChainStatus([])).toBe("unavailable");
  });

  it("requires every node to be verified", () => {
    expect(evidenceChainStatus([
      { id: "a", kind: "project", status: "verified", titleKey: "a", time: null, tool: null, version: null, identity: null, hashPrefix: null },
      { id: "b", kind: "dataset", status: "partial", titleKey: "b", time: null, tool: null, version: null, identity: null, hashPrefix: null },
    ])).toBe("partial");
  });

  it("keeps the input snapshot unavailable until a bound run verifies it", () => {
    const projectState = {
      ...INITIAL_PROJECT_STATE,
      projectSessionId: "session-1",
      project: {
        source_sha256: "a".repeat(64),
        header_version: "ContamW 3.4",
      },
    } as never;
    const nodes = buildEvidenceLineage(projectState, INITIAL_RUN_STATE, INITIAL_RESULT_DATASET_STATE);
    expect(nodes.map((node) => node.kind)).toContain("snapshot");
    expect(nodes.find((node) => node.kind === "snapshot")?.status).toBe("unavailable");
    expect(evidenceChainStatus(nodes)).toBe("unavailable");
  });
});
