export type DraftShortcutAction = "undo" | "redo" | "export";

export interface DraftShortcutInput {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  editableTarget: boolean;
  patchWorkflowActive: boolean;
}

export function draftShortcutAction(input: DraftShortcutInput): DraftShortcutAction | null {
  if (input.editableTarget || input.patchWorkflowActive || !input.ctrlKey || input.altKey) return null;
  const key = input.key.toLowerCase();
  if (key === "s" && input.shiftKey) return "export";
  if (key === "y" || (key === "z" && input.shiftKey)) return "redo";
  return key === "z" ? "undo" : null;
}
