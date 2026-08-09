import { describe, expect, it } from "vitest";
import { shouldConsumeViewportCommand, type HandledViewportCommand } from "./VisualCanvasKonva";
import type { VisualViewportCommand } from "./VisualModelWorkspace";

function lifecycleHarness(contextKey: string) {
  let handled: HandledViewportCommand | null = null;
  let executions = 0;
  return {
    consume(command: VisualViewportCommand, currentContextKey = contextKey) {
      if (shouldConsumeViewportCommand(handled, command, currentContextKey)) {
        handled = { contextKey: command.contextKey, sequence: command.sequence };
        executions += 1;
      }
      return executions;
    },
  };
}

describe("visual viewport command lifecycle", () => {
  it.each(["fit", "reset", "zoom_in", "zoom_out", "locate"] as const)("consumes %s once", (action) => {
    const mounted = lifecycleHarness("project-a:revision-1");
    const command = { sequence: 4, action, contextKey: "project-a:revision-1" };
    expect(mounted.consume(command)).toBe(1);
    expect(mounted.consume(command)).toBe(1);
  });

  it("does not replay a command after ordinary viewport updates", () => {
    const mounted = lifecycleHarness("project-a:revision-1");
    const command = { sequence: 2, action: "zoom_in", contextKey: "project-a:revision-1" } as const;
    expect(mounted.consume(command)).toBe(1);
    expect(mounted.consume({ ...command })).toBe(1);
  });

  it("rejects an old project command after identity or revision reset", () => {
    const mounted = lifecycleHarness("project-a:revision-1");
    expect(mounted.consume({ sequence: 8, action: "locate", contextKey: "project-a:revision-1" }, "project-b:revision-1")).toBe(0);
    expect(mounted.consume({ sequence: 9, action: "fit", contextKey: "project-b:revision-1" }, "project-b:revision-1")).toBe(1);
  });
});
