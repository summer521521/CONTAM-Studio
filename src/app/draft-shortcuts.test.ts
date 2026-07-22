import { describe, expect, it } from "vitest";
import { draftShortcutAction } from "./draft-shortcuts";

const shortcut = (key: string, overrides = {}) => draftShortcutAction({
  key,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  editableTarget: false,
  ...overrides,
});

describe("draft shortcuts", () => {
  it("maps project-level undo, redo, and copy export shortcuts", () => {
    expect(shortcut("z")).toBe("undo");
    expect(shortcut("y")).toBe("redo");
    expect(shortcut("z", { shiftKey: true })).toBe("redo");
    expect(shortcut("s", { shiftKey: true })).toBe("export");
  });

  it("leaves text editing in control of its shortcuts", () => {
    expect(shortcut("z", { editableTarget: true })).toBeNull();
    expect(shortcut("z", { altKey: true })).toBeNull();
    expect(shortcut("z", { ctrlKey: false })).toBeNull();
  });
});
