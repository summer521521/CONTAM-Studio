import { invoke } from "@tauri-apps/api/core";
import type { DesktopOpenResponse } from "./project-state";

export async function selectAndReadPrjZones(
  requestId: string,
): Promise<DesktopOpenResponse> {
  return invoke<DesktopOpenResponse>("select_and_read_prj_zones", { requestId });
}
