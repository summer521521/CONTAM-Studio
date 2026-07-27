import { describe, expect, it } from "vitest";
import { isSafeStudioSetup, sanitizeDiagnosticsForDisplay, toolStatusLabel } from "./release-state";

const setup = {
  schema_version: 1,
  first_run_complete: false,
  language: "zh-CN",
  theme: "dark",
  data_directory: "C:/Studio/data",
  contamx: { kind: "contamx", status: "not_configured", path: null, version: null, detail: null },
  simread: { kind: "simread", status: "available", path: "C:/Tools/simread.exe", version: "3.4.0", detail: "ok" },
  runtime: { app_version: "0.1.0", commit_sha: "abc", build_kind: "development", dirty: true, architecture: "x86_64", operating_system: "Windows_NT" },
  storage: { data_directory: "C:/Studio/data", config_directory: "C:/Studio/config", cache_directory: "C:/Studio/cache", log_directory: "C:/Studio/logs", temporary_directory: "C:/Studio/temp" },
};

describe("release state", () => {
  it("accepts bounded setup payloads", () => {
    expect(isSafeStudioSetup(setup)).toBe(true);
    expect(isSafeStudioSetup({ ...setup, runtime: null })).toBe(false);
  });
  it("labels unavailable tools without implying execution", () => {
    expect(toolStatusLabel("not_configured", "zh-CN")).toBe("未配置");
    expect(toolStatusLabel("probe_failed", "en")).toBe("Version probe failed");
  });
  it("keeps diagnostics free of arbitrary path keys", () => {
    const value = sanitizeDiagnosticsForDisplay({ schema_version: 1, app_version: "0.1.0", tools: { contamx: "not_configured" }, secret: "token", project_path: "C:/user/project.prj" });
    expect(value).not.toHaveProperty("secret");
    expect(value).not.toHaveProperty("project_path");
    expect(value).toHaveProperty("tools");
  });
});
