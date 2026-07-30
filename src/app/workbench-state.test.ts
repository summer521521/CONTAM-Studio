import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKBENCH_STATE,
  projectActivityAction,
  resetWorkbenchLayout,
} from "./workbench-state";

describe("workbench navigation and layout contracts", () => {
  it("returns to the project workspace before toggling the project tree", () => {
    expect(projectActivityAction("settings")).toBe("navigate");
    expect(projectActivityAction("run")).toBe("navigate");
    expect(projectActivityAction("project")).toBe("toggle");
  });

  it("resets panel layout while preserving language and theme", () => {
    const next = resetWorkbenchLayout({
      ...DEFAULT_WORKBENCH_STATE,
      language: "en",
      theme: "dark",
      projectSize: 31,
      contextSize: 33,
      bottomSize: 44,
      projectCollapsed: true,
      contextCollapsed: true,
      bottomCollapsed: false,
      bottomTab: "logs",
    });

    expect(next).toEqual({
      ...DEFAULT_WORKBENCH_STATE,
      language: "en",
      theme: "dark",
    });
    expect(next.bottomCollapsed).toBe(true);
    expect(next.bottomTab).toBe("problems");
  });
});
