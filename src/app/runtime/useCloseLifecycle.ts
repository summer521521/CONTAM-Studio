import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import type { TFunction } from "i18next";
import { finishAppCloseDraftExport, resolveAppClose } from "../desktop-api";
import { APP_CLOSE_REQUESTED_EVENT, isSafeCloseRequest, isSafeCloseResolution, type CloseRequestView } from "../close-state";

interface UseCloseLifecycleOptions {
  mounted: MutableRefObject<boolean>;
  exportDraft: () => Promise<boolean>;
  onNotice: (message: string) => void;
  t: TFunction;
}

export function useCloseLifecycle({ mounted, exportDraft, onNotice, t }: UseCloseLifecycleOptions) {
  const [closeRequest, setCloseRequest] = useState<CloseRequestView | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<CloseRequestView>(APP_CLOSE_REQUESTED_EVENT, ({ payload }) => {
      if (!disposed && isSafeCloseRequest(payload)) setCloseRequest(payload);
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const cancelAppClose = useCallback(async () => {
    if (!closeRequest || closeBusy) return;
    setCloseBusy(true);
    try {
      const response = await resolveAppClose(closeRequest.request_id, "cancel");
      if (isSafeCloseResolution(response, closeRequest.request_id) && response.status === "cancelled") setCloseRequest(null);
    } catch {
      onNotice(t("close.protocolUnavailable"));
    } finally {
      if (mounted.current) setCloseBusy(false);
    }
  }, [closeBusy, closeRequest, mounted, onNotice, t]);

  const discardAndCloseApp = useCallback(async () => {
    if (!closeRequest || closeBusy) return;
    setCloseBusy(true);
    try {
      const response = await resolveAppClose(closeRequest.request_id, "discard_draft");
      if (isSafeCloseResolution(response, closeRequest.request_id) && response.close_started) setCloseRequest(null);
      else if (response.error_code) onNotice(t("close.blocked"));
    } catch {
      onNotice(t("close.protocolUnavailable"));
    } finally {
      if (mounted.current) setCloseBusy(false);
    }
  }, [closeBusy, closeRequest, mounted, onNotice, t]);

  const exportAndCloseApp = useCallback(async () => {
    if (!closeRequest || closeBusy) return;
    setCloseBusy(true);
    try {
      const prepared = await resolveAppClose(closeRequest.request_id, "export_draft");
      if (!isSafeCloseResolution(prepared, closeRequest.request_id) || prepared.status !== "awaiting_draft_export") {
        onNotice(t("close.blocked"));
        return;
      }
      const exported = await exportDraft();
      const finished = await finishAppCloseDraftExport(closeRequest.request_id, exported);
      if (isSafeCloseResolution(finished, closeRequest.request_id) && finished.close_started) setCloseRequest(null);
      else if (finished.error_code) onNotice(t("close.exportFailed"));
    } catch {
      onNotice(t("close.protocolUnavailable"));
    } finally {
      if (mounted.current) setCloseBusy(false);
    }
  }, [closeBusy, closeRequest, exportDraft, mounted, onNotice, t]);

  return { closeRequest, closeBusy, cancelAppClose, discardAndCloseApp, exportAndCloseApp };
}
