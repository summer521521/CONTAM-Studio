export type ToolKind = "contamx" | "simread";
export type ToolStatus =
  | "not_configured"
  | "path_missing"
  | "access_denied"
  | "not_executable"
  | "unsupported_version"
  | "architecture_mismatch"
  | "probe_failed"
  | "available";

export interface ToolState {
  kind: ToolKind;
  status: ToolStatus;
  path: string | null;
  version: string | null;
  detail: string | null;
}

export interface RuntimeInfo {
  app_version: string;
  commit_sha: string;
  build_kind: "development" | "release" | string;
  dirty: boolean;
  architecture: string;
  operating_system: string;
}

export interface StorageLayout {
  data_directory: string;
  config_directory: string;
  cache_directory: string;
  log_directory: string;
  temporary_directory: string;
}

export interface StudioSetup {
  schema_version: number;
  first_run_complete: boolean;
  language: "zh-CN" | "en" | string;
  theme: "light" | "dark" | string;
  data_directory: string;
  contamx: ToolState;
  simread: ToolState;
  runtime: RuntimeInfo;
  storage: StorageLayout;
}

export interface SetupError {
  code: string;
  message: string;
}

export interface DesktopSetupResponse {
  request_id: string;
  setup: StudioSetup | null;
  error: SetupError | null;
}

export interface DesktopToolProbeResponse {
  request_id: string;
  tool: ToolState | null;
  setup: StudioSetup | null;
  error: SetupError | null;
}

export interface DesktopDirectoryResponse {
  request_id: string;
  selected_directory: string | null;
  setup: StudioSetup | null;
  error: SetupError | null;
}

export interface DesktopActionResponse {
  request_id: string;
  succeeded: boolean;
  error: SetupError | null;
}

export interface DesktopDiagnosticsResponse {
  request_id: string;
  summary: Record<string, unknown> | null;
  error: SetupError | null;
}

export function isSafeStudioSetup(value: unknown): value is StudioSetup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioSetup>;
  return typeof candidate.schema_version === "number"
    && typeof candidate.first_run_complete === "boolean"
    && typeof candidate.data_directory === "string"
    && typeof candidate.language === "string"
    && typeof candidate.theme === "string"
    && isSafeTool(candidate.contamx)
    && isSafeTool(candidate.simread)
    && isSafeRuntime(candidate.runtime)
    && isSafeStorage(candidate.storage);
}

function isSafeTool(value: unknown): value is ToolState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ToolState>;
  return typeof candidate.kind === "string"
    && typeof candidate.status === "string"
    && (candidate.path === null || typeof candidate.path === "string")
    && (candidate.version === null || typeof candidate.version === "string")
    && (candidate.detail === null || typeof candidate.detail === "string");
}

function isSafeRuntime(value: unknown): value is RuntimeInfo {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RuntimeInfo>;
  return typeof candidate.app_version === "string"
    && typeof candidate.commit_sha === "string"
    && typeof candidate.build_kind === "string"
    && typeof candidate.dirty === "boolean"
    && typeof candidate.architecture === "string"
    && typeof candidate.operating_system === "string";
}

function isSafeStorage(value: unknown): value is StorageLayout {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StorageLayout>;
  return [candidate.data_directory, candidate.config_directory, candidate.cache_directory, candidate.log_directory, candidate.temporary_directory].every((item) => typeof item === "string");
}

export function toolStatusLabel(status: ToolStatus, language: "zh-CN" | "en"): string {
  const labels = {
    zh: { not_configured: "未配置", path_missing: "路径不存在", access_denied: "无权限访问", not_executable: "不是合法可执行文件", unsupported_version: "版本不受支持", architecture_mismatch: "架构不匹配", probe_failed: "版本探测失败", available: "工具可用" },
    en: { not_configured: "Not configured", path_missing: "Path missing", access_denied: "Access denied", not_executable: "Not executable", unsupported_version: "Unsupported version", architecture_mismatch: "Architecture mismatch", probe_failed: "Version probe failed", available: "Available" },
  } as const;
  return labels[language === "en" ? "en" : "zh"][status];
}

export function sanitizeDiagnosticsForDisplay(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ["schema_version", "app_version", "commit_sha", "build_kind", "dirty", "architecture", "operating_system", "language", "theme", "tools", "recent_run_status", "recent_error_code", "storage"]) {
    if (key in raw) result[key] = raw[key];
  }
  return result;
}
