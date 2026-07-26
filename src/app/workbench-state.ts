export type AppLanguage = "zh-CN" | "en";
export type AppTheme = "light" | "dark";
export type ContextTab = "inspector" | "assistant";
export type BottomTab = "problems" | "logs" | "results";
export type WorkbenchDestination = "project" | "search" | "run" | "results" | "studies" | "settings";

export interface WorkbenchState {
  version: 1;
  language: AppLanguage;
  theme: AppTheme;
  projectSize: number;
  contextSize: number;
  bottomSize: number;
  projectCollapsed: boolean;
  contextCollapsed: boolean;
  bottomCollapsed: boolean;
  contextTab: ContextTab;
  bottomTab: BottomTab;
}

export const WORKBENCH_STORAGE_KEY = "contam-studio:workbench:v1";

export const DEFAULT_WORKBENCH_STATE: WorkbenchState = {
  version: 1,
  language: "zh-CN",
  theme: "light",
  projectSize: 20,
  contextSize: 23,
  bottomSize: 31,
  projectCollapsed: false,
  contextCollapsed: false,
  bottomCollapsed: false,
  contextTab: "inspector",
  bottomTab: "problems",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

function safeSize(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function loadWorkbenchState(): WorkbenchState {
  try {
    const raw = localStorage.getItem(WORKBENCH_STORAGE_KEY);
    if (!raw) return DEFAULT_WORKBENCH_STATE;

    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1) return DEFAULT_WORKBENCH_STATE;

    return {
      version: 1,
      language: isOneOf(value.language, ["zh-CN", "en"])
        ? value.language
        : DEFAULT_WORKBENCH_STATE.language,
      theme: isOneOf(value.theme, ["light", "dark"])
        ? value.theme
        : DEFAULT_WORKBENCH_STATE.theme,
      projectSize: safeSize(value.projectSize, DEFAULT_WORKBENCH_STATE.projectSize, 14, 32),
      contextSize: safeSize(value.contextSize, DEFAULT_WORKBENCH_STATE.contextSize, 18, 34),
      bottomSize: safeSize(value.bottomSize, DEFAULT_WORKBENCH_STATE.bottomSize, 18, 45),
      projectCollapsed:
        typeof value.projectCollapsed === "boolean"
          ? value.projectCollapsed
          : DEFAULT_WORKBENCH_STATE.projectCollapsed,
      contextCollapsed:
        typeof value.contextCollapsed === "boolean"
          ? value.contextCollapsed
          : DEFAULT_WORKBENCH_STATE.contextCollapsed,
      bottomCollapsed:
        typeof value.bottomCollapsed === "boolean"
          ? value.bottomCollapsed
          : DEFAULT_WORKBENCH_STATE.bottomCollapsed,
      contextTab: isOneOf(value.contextTab, ["inspector", "assistant"])
        ? value.contextTab
        : DEFAULT_WORKBENCH_STATE.contextTab,
      bottomTab: isOneOf(value.bottomTab, ["problems", "logs", "results"])
        ? value.bottomTab
        : DEFAULT_WORKBENCH_STATE.bottomTab,
    };
  } catch {
    return DEFAULT_WORKBENCH_STATE;
  }
}

export function saveWorkbenchState(state: WorkbenchState): void {
  try {
    localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The shell remains usable when local storage is unavailable.
  }
}

export function getMainLayout(state: WorkbenchState): Record<string, number> {
  const project = state.projectCollapsed ? 0 : state.projectSize;
  const context = state.contextCollapsed ? 0 : state.contextSize;
  return { project, workspace: 100 - project - context, context };
}

export function getCenterLayout(state: WorkbenchState): Record<string, number> {
  const bottom = state.bottomCollapsed ? 0 : state.bottomSize;
  return { editor: 100 - bottom, bottom };
}
