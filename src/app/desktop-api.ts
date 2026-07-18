import { invoke } from "@tauri-apps/api/core";
import type {
  DesktopApplyResponse,
  DesktopPlanResponse,
} from "./patch-state";
import type { DesktopOpenResponse } from "./project-state";

export async function selectAndReadPrjZones(
  requestId: string,
): Promise<DesktopOpenResponse> {
  return invoke<DesktopOpenResponse>("select_and_read_prj_zones", { requestId });
}

export async function planZoneVolumePatch(
  requestId: string,
  projectSessionId: string,
  contamNumber: number,
  newVolumeToken: string,
): Promise<DesktopPlanResponse> {
  return invoke<DesktopPlanResponse>("plan_zone_volume_patch", {
    requestId,
    projectSessionId,
    contamNumber,
    newVolumeToken,
  });
}

export async function applyZoneVolumePatchToCopy(
  requestId: string,
  projectSessionId: string,
  patchId: string,
): Promise<DesktopApplyResponse> {
  return invoke<DesktopApplyResponse>("apply_zone_volume_patch_to_copy", {
    requestId,
    projectSessionId,
    patchId,
  });
}
