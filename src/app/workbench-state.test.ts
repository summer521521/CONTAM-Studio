import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKBENCH_STATE,
  LEGACY_WORKBENCH_STORAGE_KEY,
  PREVIOUS_WORKBENCH_STORAGE_KEY,
  loadWorkbenchState,
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

  it("migrates v2 preferences without retaining obsolete panel sizes", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    storage.setItem(LEGACY_WORKBENCH_STORAGE_KEY, JSON.stringify({
      version: 2,
      language: "en",
      theme: "dark",
      projectSize: 31,
      contextSize: 33,
      bottomSize: 44,
      projectCollapsed: true,
      contextCollapsed: false,
      bottomCollapsed: false,
      contextTab: "assistant",
      bottomTab: "results",
    }));

    expect(loadWorkbenchState(storage)).toEqual({
      ...DEFAULT_WORKBENCH_STATE,
      language: "en",
      theme: "dark",
      projectCollapsed: true,
      contextCollapsed: false,
      bottomCollapsed: false,
      contextTab: "assistant",
      bottomTab: "results",
    });
  });

  it("migrates v3 layout and starts with bounded visual workspace preferences", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    storage.setItem(PREVIOUS_WORKBENCH_STORAGE_KEY, JSON.stringify({
      version: 3,
      language: "zh-CN",
      theme: "light",
      projectSize: 25,
      contextSize: 27,
      bottomSize: 32,
      projectCollapsed: false,
      contextCollapsed: true,
      bottomCollapsed: true,
      contextTab: "inspector",
      bottomTab: "logs",
    }));

    const state = loadWorkbenchState(storage);
    expect(state.version).toBe(4);
    expect(state.projectSize).toBe(25);
    expect(state.contextSize).toBe(27);
    expect(state.visualWorkspace.mode).toBe("sketchpad");
    expect(state.visualWorkspace.layers.grid).toBe(true);
  });

  it("falls back safely when persisted layout JSON is damaged", () => {
    const storage = {
      getItem: () => "{not-json",
      setItem: () => undefined,
    };
    expect(loadWorkbenchState(storage)).toEqual(DEFAULT_WORKBENCH_STATE);
  });
});
