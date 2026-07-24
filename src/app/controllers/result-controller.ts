import { useCallback, useRef, type Dispatch, type MutableRefObject } from "react";
import {
  exportActiveZoneAirStateCsv,
  extractActiveRunZoneAirState,
  selectAndExtractZoneAirState,
} from "../desktop-api";
import {
  resultResponseIssue,
  type DesktopZoneAirStateResponse,
  type ResultAction,
  type ResultLoadSource,
  type ResultState,
} from "../result-state";
import {
  resultExportResponseIssue,
  type DesktopZoneAirStateCsvExportResponse,
  type ResultExportAction,
} from "../result-export-state";
import type { CommandAvailability } from "../command-availability";
import type { ZoneRecord } from "../project-state";
import type { RunState } from "../run-state";
import type { AiAction } from "../ai-state";

interface ResultControllerOptions {
  availability: Pick<CommandAvailability, "loadActiveResult" | "selectManifest" | "exportResult">;
  projectSessionId: string | null;
  currentZone: ZoneRecord | null;
  runState: RunState;
  resultState: ResultState;
  mounted: MutableRefObject<boolean>;
  dispatchResult: Dispatch<ResultAction>;
  dispatchResultExport: Dispatch<ResultExportAction>;
  dispatchAi: Dispatch<AiAction>;
  onExportStarted: () => void;
}

export function useResultController({
  availability,
  projectSessionId,
  currentZone,
  runState,
  resultState,
  mounted,
  dispatchResult,
  dispatchResultExport,
  dispatchAi,
  onExportStarted,
}: ResultControllerOptions) {
  const resultSequence = useRef(0);
  const resultExportSequence = useRef(0);

  const loadZoneResults = useCallback(async (source: ResultLoadSource) => {
    const available = source === "active_run" ? availability.loadActiveResult : availability.selectManifest;
    if (!available || !projectSessionId || !currentZone) return;
    const sequence = ++resultSequence.current;
    const requestId = crypto.randomUUID();
    dispatchResult({
      type: source === "active_run" ? "active_run_started" : "selection_started",
      sequence,
      requestId,
      projectSessionId,
      zoneId: currentZone.zone_id,
      zoneNumber: currentZone.contam_number,
    });
    try {
      const response: DesktopZoneAirStateResponse = await (source === "active_run" ? extractActiveRunZoneAirState : selectAndExtractZoneAirState)(requestId, projectSessionId, currentZone.zone_id);
      if (!mounted.current || sequence !== resultSequence.current) return;
      if (response.cancelled) {
        dispatchResult({ type: "load_cancelled", sequence, requestId });
        return;
      }
      const issue = resultResponseIssue(response, requestId);
      const expectedActiveRunId = source === "active_run" && runState.projectSessionId === projectSessionId ? runState.summary?.run_id ?? null : null;
      if (issue || !response.result || response.project_session_id !== projectSessionId || response.result.zone_id !== currentZone.zone_id || (source === "active_run" && response.result.run_id !== expectedActiveRunId)) {
        dispatchResult({ type: "load_failed", sequence, requestId, issue: issue ?? { code: "python_response_result_invalid", message: "Result did not match the active project.", source_line_number: null, context: {} } });
        return;
      }
      dispatchResult({ type: "load_succeeded", sequence, requestId, projectSessionId, result: response.result });
      dispatchResultExport({ type: "result_changed" });
      dispatchAi({ type: "context_changed" });
    } catch {
      if (!mounted.current || sequence !== resultSequence.current) return;
      dispatchResult({ type: "load_failed", sequence, requestId, issue: { code: "desktop_bridge_invoke_failed", message: "Desktop result bridge invocation failed", source_line_number: null, context: {} } });
    }
  }, [availability.loadActiveResult, availability.selectManifest, currentZone, dispatchAi, dispatchResult, dispatchResultExport, mounted, projectSessionId, runState.projectSessionId, runState.summary?.run_id]);

  const loadLatestRunResults = useCallback(() => loadZoneResults("active_run"), [loadZoneResults]);
  const selectRunManifestResults = useCallback(() => loadZoneResults("selected_manifest"), [loadZoneResults]);

  const exportZoneResults = useCallback(async () => {
    const result = resultState.result;
    if (!availability.exportResult || !projectSessionId || !currentZone || !result) return;
    const sequence = ++resultExportSequence.current;
    const requestId = crypto.randomUUID();
    dispatchResultExport({ type: "selection_started", sequence, requestId, projectSessionId, zoneId: currentZone.zone_id, zoneNumber: currentZone.contam_number, runId: result.run_id, extractionId: result.extraction_id });
    onExportStarted();
    try {
      const response: DesktopZoneAirStateCsvExportResponse = await exportActiveZoneAirStateCsv(requestId, projectSessionId, currentZone.zone_id, result.run_id, result.extraction_id);
      if (!mounted.current || sequence !== resultExportSequence.current) return;
      if (response.cancelled) {
        dispatchResultExport({ type: "export_cancelled", sequence, requestId });
        return;
      }
      const issue = resultExportResponseIssue(response, requestId);
      const summary = response.export;
      if (issue || !summary || response.project_session_id !== projectSessionId || summary.zone_id !== currentZone.zone_id || summary.zone_number !== currentZone.contam_number || summary.run_id !== result.run_id || summary.extraction_id !== result.extraction_id || summary.row_count !== result.sample_count || summary.byte_count <= 0 || summary.file_name.includes("/") || summary.file_name.includes("\\")) {
        dispatchResultExport({ type: "export_failed", sequence, requestId, issue: issue ?? { code: "export_response_contract_invalid", message: "CSV export response did not match the active result.", source_line_number: null, context: {} } });
        return;
      }
      dispatchResultExport({ type: "export_succeeded", sequence, requestId, projectSessionId, summary });
    } catch {
      if (!mounted.current || sequence !== resultExportSequence.current) return;
      dispatchResultExport({ type: "export_failed", sequence, requestId, issue: { code: "desktop_bridge_invoke_failed", message: "Desktop CSV export invocation failed", source_line_number: null, context: {} } });
    }
  }, [availability.exportResult, currentZone, dispatchResultExport, mounted, onExportStarted, projectSessionId, resultState.result]);

  return { loadLatestRunResults, selectRunManifestResults, exportZoneResults, resultSequence, resultExportSequence };
}
