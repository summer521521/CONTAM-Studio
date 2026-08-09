import { DEFAULT_VISUAL_PREFERENCES, type VisualWorkspacePreferences } from "./spatial-model";

export type AppLanguage = "zh-CN" | "en";
export type AppTheme = "light" | "dark";
export type ContextTab = "inspector" | "assistant";
export type BottomTab = "problems" | "logs" | "results";
export type WorkbenchDestination = "project" | "run" | "results" | "studies" | "settings";

export interface WorkbenchState {
  version: 4;
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
  visualWorkspace: VisualWorkspacePreferences;
}

export const WORKBENCH_STORAGE_KEY = "contam-studio:workbench:v4";
export const PREVIOUS_WORKBENCH_STORAGE_KEY = "contam-studio:workbench:v3";
export const LEGACY_WORKBENCH_STORAGE_KEY = "contam-studio:workbench:v2";

export const DEFAULT_WORKBENCH_STATE: WorkbenchState = {
  version: 4,
  language: "zh-CN",
  theme: "light",
  projectSize: 21,
  contextSize: 24,
  bottomSize: 30,
  projectCollapsed: false,
  contextCollapsed: false,
  bottomCollapsed: true,
  contextTab: "inspector",
  bottomTab: "problems",
  visualWorkspace: DEFAULT_VISUAL_PREFERENCES,
};

export type ProjectActivityAction = "navigate" | "toggle";

/**
 * The project activity icon doubles as the project-tree toggle only while the
 * project workspace is already active. From another destination it must
 * navigate back to the project workspace first.
 */
export function projectActivityAction(
  activeDestination: WorkbenchDestination,
): ProjectActivityAction {
  return activeDestination === "project" ? "toggle" : "navigate";
}

/**
 * Reset only layout preferences. Language and theme are user preferences and
 * must survive a layout reset.
 */
export function resetWorkbenchLayout(state: WorkbenchState): WorkbenchState {
  return {
    ...DEFAULT_WORKBENCH_STATE,
    language: state.language,
    theme: state.theme,
  };
}

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

function loadVisualPreferences(value: unknown): VisualWorkspacePreferences {
  if (!isRecord(value) || !isRecord(value.layers)) return DEFAULT_VISUAL_PREFERENCES;
  const layers = value.layers;
  const booleanLayer = (key: keyof VisualWorkspacePreferences["layers"]) => (
    typeof layers[key] === "boolean" ? layers[key] : DEFAULT_VISUAL_PREFERENCES.layers[key]
  );
  return {
    mode: isOneOf(value.mode, ["sketchpad", "topology"])
      ? value.mode
      : DEFAULT_VISUAL_PREFERENCES.mode,
    layers: {
      walls: booleanLayer("walls"),
      zones: booleanLayer("zones"),
      flowPaths: booleanLayer("flowPaths"),
      labels: booleanLayer("labels"),
      grid: booleanLayer("grid"),
      otherIcons: booleanLayer("otherIcons"),
      lowerLevelReference: booleanLayer("lowerLevelReference"),
    },
  };
}

type WorkbenchStorage = Pick<Storage, "getItem" | "setItem">;

export function loadWorkbenchState(storageOverride?: WorkbenchStorage): WorkbenchState {
  try {
    const storage = storageOverride ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!storage) return DEFAULT_WORKBENCH_STATE;
    const raw = storage.getItem(WORKBENCH_STORAGE_KEY);
    const previousRaw = raw ? null : storage.getItem(PREVIOUS_WORKBENCH_STORAGE_KEY);
    const legacyRaw = raw || previousRaw ? null : storage.getItem(LEGACY_WORKBENCH_STORAGE_KEY);
    const serialized = raw ?? previousRaw ?? legacyRaw;
    if (!serialized) return DEFAULT_WORKBENCH_STATE;

    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || ![2, 3, 4].includes(value.version as number)) {
      return DEFAULT_WORKBENCH_STATE;
    }
    const migratedPanelGeometry = value.version === 2;

    return {
      version: 4,
      language: isOneOf(value.language, ["zh-CN", "en"])
        ? value.language
        : DEFAULT_WORKBENCH_STATE.language,
      theme: isOneOf(value.theme, ["light", "dark"])
        ? value.theme
        : DEFAULT_WORKBENCH_STATE.theme,
      // R1-02 changes the shell geometry. Old panel percentages are deliberately
      // reset while durable preferences and valid collapsed/tab choices migrate.
      projectSize: migratedPanelGeometry
        ? DEFAULT_WORKBENCH_STATE.projectSize
        : safeSize(value.projectSize, DEFAULT_WORKBENCH_STATE.projectSize, 16, 32),
      contextSize: migratedPanelGeometry
        ? DEFAULT_WORKBENCH_STATE.contextSize
        : safeSize(value.contextSize, DEFAULT_WORKBENCH_STATE.contextSize, 19, 34),
      bottomSize: migratedPanelGeometry
        ? DEFAULT_WORKBENCH_STATE.bottomSize
        : safeSize(value.bottomSize, DEFAULT_WORKBENCH_STATE.bottomSize, 18, 44),
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
      visualWorkspace: value.version === 4
        ? loadVisualPreferences(value.visualWorkspace)
        : DEFAULT_VISUAL_PREFERENCES,
    };
  } catch {
    return DEFAULT_WORKBENCH_STATE;
  }
}

export function saveWorkbenchState(state: WorkbenchState, storageOverride?: WorkbenchStorage): void {
  try {
    const storage = storageOverride ?? (typeof localStorage === "undefined" ? null : localStorage);
    storage?.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(state));
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
