export const FLOATING_WORKBENCH_LAYOUT_SCHEMA_VERSION = "floating_workbench_layout.v1" as const;
export const FLOATING_WORKBENCH_STORAGE_KEY = "contam-studio:geometry-workbench:v1";
export const LEGACY_WORKBENCH_STORAGE_KEY = "contam-studio:workbench:v4";

export const GEOMETRY_THEMES = [
  "engineering-blueprint",
  "architectural-paper",
  "night-laboratory",
] as const;
export type GeometryTheme = typeof GEOMETRY_THEMES[number];

export const FLOATING_PANEL_IDS = [
  "level-zones",
  "modeling-tools",
  "layers",
  "inspector",
  "command-status",
  "evidence",
  "theme-picker",
] as const;
export type FloatingPanelId = typeof FLOATING_PANEL_IDS[number];
export type FloatingPanelPlacement = "floating" | "docked";
export type FloatingPanelDock = "none" | "left" | "right" | "top" | "bottom";

export interface WorkbenchViewportSize {
  width: number;
  height: number;
}

export interface FloatingPanelLayout {
  id: FloatingPanelId;
  visible: boolean;
  collapsed: boolean;
  placement: FloatingPanelPlacement;
  dock: FloatingPanelDock;
  x: number;
  y: number;
  width: number;
  height: number;
  z_order: number;
}

export interface FloatingWorkbenchLayout {
  schema_version: typeof FLOATING_WORKBENCH_LAYOUT_SCHEMA_VERSION;
  theme: GeometryTheme;
  viewport: WorkbenchViewportSize;
  last_focused_panel: FloatingPanelId | null;
  panels: FloatingPanelLayout[];
}

type WorkbenchStorage = Pick<Storage, "getItem" | "setItem">;

const MIN_VIEWPORT = { width: 320, height: 240 };
const MIN_PANEL_WIDTH = 160;
const MIN_PANEL_HEIGHT = 40;
const DEFAULT_PANEL_WIDTH = 248;
const DEFAULT_PANEL_HEIGHT = 240;
const FLOATING_FOOTER_RESERVE = 34;

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function safeViewport(viewport: WorkbenchViewportSize): WorkbenchViewportSize {
  return {
    width: clampInteger(viewport.width, MIN_VIEWPORT.width, 16_384, 1280),
    height: clampInteger(viewport.height, MIN_VIEWPORT.height, 16_384, 720),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPanelId(value: unknown): value is FloatingPanelId {
  return typeof value === "string" && FLOATING_PANEL_IDS.includes(value as FloatingPanelId);
}

function isTheme(value: unknown): value is GeometryTheme {
  return typeof value === "string" && GEOMETRY_THEMES.includes(value as GeometryTheme);
}

function defaultPanel(
  id: FloatingPanelId,
  x: number,
  y: number,
  width = DEFAULT_PANEL_WIDTH,
  height = DEFAULT_PANEL_HEIGHT,
  zOrder = 1,
): FloatingPanelLayout {
  return { id, visible: true, collapsed: false, placement: "floating", dock: "none", x, y, width, height, z_order: zOrder };
}

export function createDefaultFloatingLayout(viewportInput: WorkbenchViewportSize): FloatingWorkbenchLayout {
  const viewport = safeViewport(viewportInput);
  const rightX = Math.max(12, viewport.width - 300);
  const lowerY = Math.max(372, viewport.height - 270);
  return {
    schema_version: FLOATING_WORKBENCH_LAYOUT_SCHEMA_VERSION,
    theme: "architectural-paper",
    viewport,
    last_focused_panel: "modeling-tools",
    panels: [
      defaultPanel("level-zones", 18, 76, 242, 304, 3),
      defaultPanel("modeling-tools", Math.max(278, Math.floor(viewport.width / 2) - 286), 14, 572, 72, 8),
      defaultPanel("layers", 18, lowerY, 242, 224, 2),
      defaultPanel("inspector", rightX, 132, 280, 414, 5),
      defaultPanel("command-status", 278, Math.max(390, viewport.height - 118), 420, 84, 4),
      { ...defaultPanel("evidence", Math.max(278, viewport.width - 720), Math.max(390, viewport.height - 208), 390, 168, 1), visible: false },
      defaultPanel("theme-picker", rightX, 14, 280, 106, 7),
    ].map((panel) => clampFloatingPanel(panel, viewport)),
  };
}

export function clampFloatingPanel(panel: FloatingPanelLayout, viewportInput: WorkbenchViewportSize): FloatingPanelLayout {
  const viewport = safeViewport(viewportInput);
  const width = clampInteger(panel.width, MIN_PANEL_WIDTH, Math.min(4096, viewport.width), DEFAULT_PANEL_WIDTH);
  const height = clampInteger(panel.height, MIN_PANEL_HEIGHT, Math.min(4096, viewport.height), DEFAULT_PANEL_HEIGHT);
  const x = clampInteger(panel.x, 0, Math.max(0, viewport.width - width), 0);
  const footerReserve = viewport.height - height >= FLOATING_FOOTER_RESERVE ? FLOATING_FOOTER_RESERVE : 0;
  const y = clampInteger(panel.y, 0, Math.max(0, viewport.height - height - footerReserve), 0);
  const placement = panel.placement === "docked" ? "docked" : "floating";
  const dock = placement === "docked" && ["left", "right", "top", "bottom"].includes(panel.dock)
    ? panel.dock
    : "none";
  return {
    id: panel.id,
    visible: panel.visible,
    collapsed: panel.collapsed,
    placement,
    dock,
    x,
    y,
    width,
    height,
    z_order: clampInteger(panel.z_order, 0, 100, 0),
  };
}

export function reflowFloatingWorkbenchLayout(
  layout: FloatingWorkbenchLayout,
  viewportInput: WorkbenchViewportSize,
): FloatingWorkbenchLayout {
  const viewport = safeViewport(viewportInput);
  const deltaWidth = viewport.width - layout.viewport.width;
  const deltaHeight = viewport.height - layout.viewport.height;
  const rightAnchored = new Set<FloatingPanelId>(["inspector", "evidence", "theme-picker"]);
  const bottomAnchored = new Set<FloatingPanelId>(["layers", "command-status", "evidence"]);
  const panels = layout.panels.map((panel) => clampFloatingPanel({
      ...panel,
      x: panel.x + (rightAnchored.has(panel.id) ? deltaWidth : panel.id === "modeling-tools" ? Math.round(deltaWidth / 2) : 0),
      y: panel.y + (bottomAnchored.has(panel.id) ? deltaHeight : 0),
    }, viewport));
  const tools = panels.find((panel) => panel.id === "modeling-tools");
  const theme = panels.find((panel) => panel.id === "theme-picker");
  if (tools?.visible && theme?.visible && tools.x + tools.width + 12 > theme.x) {
    tools.x = Math.max(0, theme.x - tools.width - 12);
  }
  return { ...layout, viewport, panels };
}

function parsePanel(value: unknown, viewport: WorkbenchViewportSize): FloatingPanelLayout | null {
  if (!isRecord(value) || !isPanelId(value.id)
    || typeof value.visible !== "boolean" || typeof value.collapsed !== "boolean"
    || !["floating", "docked"].includes(String(value.placement))
    || !["none", "left", "right", "top", "bottom"].includes(String(value.dock))) return null;
  const exact = ["id", "visible", "collapsed", "placement", "dock", "x", "y", "width", "height", "z_order"];
  if (Object.keys(value).length !== exact.length || !exact.every((key) => key in value)) return null;
  return clampFloatingPanel({
    id: value.id,
    visible: value.visible,
    collapsed: value.collapsed,
    placement: value.placement as FloatingPanelPlacement,
    dock: value.dock as FloatingPanelDock,
    x: clampInteger(value.x, 0, 16_384, 0),
    y: clampInteger(value.y, 0, 16_384, 0),
    width: clampInteger(value.width, MIN_PANEL_WIDTH, 4096, DEFAULT_PANEL_WIDTH),
    height: clampInteger(value.height, MIN_PANEL_HEIGHT, 4096, DEFAULT_PANEL_HEIGHT),
    z_order: clampInteger(value.z_order, 0, 100, 0),
  }, viewport);
}

function parseViewport(value: unknown): WorkbenchViewportSize | null {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !("width" in value) || !("height" in value)
    || typeof value.width !== "number" || !Number.isSafeInteger(value.width)
    || typeof value.height !== "number" || !Number.isSafeInteger(value.height)) return null;
  return safeViewport({ width: value.width, height: value.height });
}

export function migrateLegacyWorkbenchTheme(value: unknown): GeometryTheme {
  if (!isRecord(value)) return "architectural-paper";
  return value.theme === "dark" ? "night-laboratory" : "architectural-paper";
}

export function loadFloatingWorkbenchLayout(
  viewportInput: WorkbenchViewportSize,
  storageOverride?: WorkbenchStorage,
): FloatingWorkbenchLayout {
  const viewport = safeViewport(viewportInput);
  const fallback = createDefaultFloatingLayout(viewport);
  try {
    const storage = storageOverride ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!storage) return fallback;
    const raw = storage.getItem(FLOATING_WORKBENCH_STORAGE_KEY);
    if (!raw) {
      const legacy = storage.getItem(LEGACY_WORKBENCH_STORAGE_KEY);
      if (!legacy) return fallback;
      return { ...fallback, theme: migrateLegacyWorkbenchTheme(JSON.parse(legacy)) };
    }
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.schema_version !== FLOATING_WORKBENCH_LAYOUT_SCHEMA_VERSION
      || !isTheme(value.theme) || !Array.isArray(value.panels) || value.panels.length > FLOATING_PANEL_IDS.length) return fallback;
    const exact = ["schema_version", "theme", "viewport", "last_focused_panel", "panels"];
    if (Object.keys(value).length !== exact.length || !exact.every((key) => key in value)) return fallback;
    const storedViewport = parseViewport(value.viewport);
    if (!storedViewport) return fallback;
    const storedDefaults = createDefaultFloatingLayout(storedViewport);
    const seen = new Set<FloatingPanelId>();
    const panels: FloatingPanelLayout[] = [];
    for (const item of value.panels) {
      const panel = parsePanel(item, storedViewport);
      if (!panel || seen.has(panel.id)) return fallback;
      seen.add(panel.id);
      panels.push(panel);
    }
    for (const defaultItem of storedDefaults.panels) {
      if (!seen.has(defaultItem.id)) panels.push(defaultItem);
    }
    const focused = value.last_focused_panel === null || isPanelId(value.last_focused_panel)
      ? value.last_focused_panel
      : null;
    return reflowFloatingWorkbenchLayout({ schema_version: FLOATING_WORKBENCH_LAYOUT_SCHEMA_VERSION, theme: value.theme, viewport: storedViewport, last_focused_panel: focused, panels }, viewport);
  } catch {
    return fallback;
  }
}

export function saveFloatingWorkbenchLayout(
  layout: FloatingWorkbenchLayout,
  storageOverride?: WorkbenchStorage,
): void {
  try {
    const storage = storageOverride ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!storage) return;
    const viewport = safeViewport(layout.viewport);
    const panels = layout.panels
      .filter((panel, index, array) => isPanelId(panel.id) && array.findIndex((item) => item.id === panel.id) === index)
      .slice(0, FLOATING_PANEL_IDS.length)
      .map((panel) => clampFloatingPanel(panel, viewport));
    storage.setItem(FLOATING_WORKBENCH_STORAGE_KEY, JSON.stringify({
      schema_version: FLOATING_WORKBENCH_LAYOUT_SCHEMA_VERSION,
      theme: isTheme(layout.theme) ? layout.theme : "architectural-paper",
      viewport,
      last_focused_panel: isPanelId(layout.last_focused_panel) ? layout.last_focused_panel : null,
      panels,
    } satisfies FloatingWorkbenchLayout));
  } catch {
    // The geometry domain remains usable when local preference storage fails.
  }
}

export function resetFloatingWorkbenchLayout(
  layout: FloatingWorkbenchLayout,
  viewport: WorkbenchViewportSize,
): FloatingWorkbenchLayout {
  return { ...createDefaultFloatingLayout(viewport), theme: layout.theme };
}
