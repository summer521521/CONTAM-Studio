import packageJson from "../../package.json";

export interface BuildInfo {
  version: string;
  commitSha: string;
  dirty: boolean;
  kind: "development" | "release";
}

export const buildInfo: BuildInfo = {
  version: packageJson.version,
  commitSha: import.meta.env.VITE_COMMIT_SHA ?? "unknown",
  dirty: import.meta.env.DEV,
  kind: import.meta.env.PROD ? "release" : "development",
};

export function displayVersion(info: BuildInfo = buildInfo): string {
  const marker = info.kind === "development" || info.dirty ? "-dev" : "";
  return `${info.version}${marker}`;
}
