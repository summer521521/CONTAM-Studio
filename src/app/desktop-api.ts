import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { BridgeEnvelope } from "./project-state";

export async function selectPrjFile(): Promise<string | null> {
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [{ name: "CONTAM PRJ", extensions: ["prj"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function readPrjZones(
  sourcePath: string,
  requestId: string,
): Promise<BridgeEnvelope> {
  return invoke<BridgeEnvelope>("read_prj_zones", { sourcePath, requestId });
}
