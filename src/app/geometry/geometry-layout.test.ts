import { describe, expect, it } from "vitest";
import {
  FLOATING_WORKBENCH_LAYOUT_SCHEMA_VERSION,
  FLOATING_WORKBENCH_STORAGE_KEY,
  createDefaultFloatingLayout,
  loadFloatingWorkbenchLayout,
  reflowFloatingWorkbenchLayout,
  resetFloatingWorkbenchLayout,
  saveFloatingWorkbenchLayout,
} from "./geometry-layout";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("floating geometry workbench layout", () => {
  it("defaults to the selected paper layout with all whitelisted modules", () => {
    const layout = createDefaultFloatingLayout({ width: 1440, height: 900 });
    expect(layout.schema_version).toBe(FLOATING_WORKBENCH_LAYOUT_SCHEMA_VERSION);
    expect(layout.theme).toBe("architectural-paper");
    expect(layout.panels).toHaveLength(7);
    expect(layout.panels.every((panel) => panel.x + panel.width <= 1440 && panel.y + panel.height <= 900)).toBe(true);
  });

  it("clamps off-screen panels to the current viewport", () => {
    const storage = new MemoryStorage();
    const layout = createDefaultFloatingLayout({ width: 1440, height: 900 });
    layout.panels[0] = { ...layout.panels[0], x: 9_000, y: 9_000, width: 3_000, height: 2_000 };
    storage.setItem(FLOATING_WORKBENCH_STORAGE_KEY, JSON.stringify(layout));
    const loaded = loadFloatingWorkbenchLayout({ width: 800, height: 600 }, storage);
    const panel = loaded.panels[0];
    expect(panel.width).toBe(800);
    expect(panel.height).toBe(600);
    expect(panel.x).toBe(0);
    expect(panel.y).toBe(0);
  });

  it("rejects unknown persisted fields instead of accepting model data", () => {
    const storage = new MemoryStorage();
    const layout = createDefaultFloatingLayout({ width: 1280, height: 720 }) as unknown as Record<string, unknown>;
    layout.geometry = { secret: "must-not-persist" };
    storage.setItem(FLOATING_WORKBENCH_STORAGE_KEY, JSON.stringify(layout));
    const loaded = loadFloatingWorkbenchLayout({ width: 1280, height: 720 }, storage);
    expect(loaded.theme).toBe("architectural-paper");
    expect(JSON.stringify(loaded)).not.toContain("must-not-persist");
  });

  it("migrates the legacy dark preference to Night Laboratory", () => {
    const storage = new MemoryStorage();
    storage.setItem("contam-studio:workbench:v4", JSON.stringify({ version: 4, theme: "dark" }));
    expect(loadFloatingWorkbenchLayout({ width: 1280, height: 720 }, storage).theme).toBe("night-laboratory");
  });

  it("persists only the bounded layout contract", () => {
    const storage = new MemoryStorage();
    const layout = createDefaultFloatingLayout({ width: 1440, height: 900 });
    saveFloatingWorkbenchLayout(layout, storage);
    const saved = JSON.parse(storage.getItem(FLOATING_WORKBENCH_STORAGE_KEY) ?? "null") as Record<string, unknown>;
    expect(Object.keys(saved).sort()).toEqual(["last_focused_panel", "panels", "schema_version", "theme", "viewport"]);
    expect(JSON.stringify(saved)).not.toContain("geometry_id");
  });

  it("resets panel geometry while retaining the chosen palette", () => {
    const layout = createDefaultFloatingLayout({ width: 1440, height: 900 });
    layout.theme = "engineering-blueprint";
    layout.panels[0].x = 800;
    const reset = resetFloatingWorkbenchLayout(layout, { width: 1280, height: 720 });
    expect(reset.theme).toBe("engineering-blueprint");
    expect(reset.panels[0].x).toBe(18);
  });

  it("reflows anchored panels without covering the footer or toolbar", () => {
    const large = createDefaultFloatingLayout({ width: 1488, height: 998 });
    const compact = reflowFloatingWorkbenchLayout(large, { width: 1280, height: 662 });
    const tools = compact.panels.find((panel) => panel.id === "modeling-tools")!;
    const theme = compact.panels.find((panel) => panel.id === "theme-picker")!;
    const command = compact.panels.find((panel) => panel.id === "command-status")!;
    expect(tools.x + tools.width).toBeLessThanOrEqual(theme.x);
    expect(command.y + command.height).toBeLessThanOrEqual(662 - 34);
  });

  it("repairs a persisted toolbar and theme collision at the same viewport", () => {
    const layout = createDefaultFloatingLayout({ width: 1280, height: 662 });
    const tools = layout.panels.find((panel) => panel.id === "modeling-tools")!;
    tools.x = 458;
    const repaired = reflowFloatingWorkbenchLayout(layout, layout.viewport);
    const repairedTools = repaired.panels.find((panel) => panel.id === "modeling-tools")!;
    const theme = repaired.panels.find((panel) => panel.id === "theme-picker")!;
    expect(repairedTools.x + repairedTools.width + 12).toBeLessThanOrEqual(theme.x);
  });
});
