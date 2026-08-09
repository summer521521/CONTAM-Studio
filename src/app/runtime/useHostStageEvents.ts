import { useEffect, useRef, type Dispatch } from "react";
import { listen } from "@tauri-apps/api/event";
import { RESULT_EXPORT_STAGE_EVENT, type ResultExportAction, type ResultExportStageEvent } from "../result-export-state";
import { ZONE_RESULT_STAGE_EVENT, type ResultAction, type ZoneResultStageEvent } from "../result-state";

export function useHostStageEvents(dispatchResult: Dispatch<ResultAction>, dispatchResultExport: Dispatch<ResultExportAction>) {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<ResultExportStageEvent>(RESULT_EXPORT_STAGE_EVENT, ({ payload }) => {
      if (payload?.stage === "exporting" && typeof payload.request_id === "string") {
        dispatchResultExport({ type: "host_exporting_started", requestId: payload.request_id });
      }
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, [dispatchResultExport]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<ZoneResultStageEvent>(ZONE_RESULT_STAGE_EVENT, ({ payload }) => {
      if (payload?.stage === "loading" && typeof payload.request_id === "string") {
        dispatchResult({ type: "host_loading_started", requestId: payload.request_id });
      }
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, [dispatchResult]);

  return mounted;
}
