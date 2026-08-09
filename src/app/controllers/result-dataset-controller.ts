import { useCallback, useRef, type Dispatch, type MutableRefObject } from "react";
import { cancelZoneResultDataset, extractActiveRunZoneAirStateDataset } from "../desktop-api";
import {
  MAX_DATASET_ZONES,
  ZONE_RESULT_DATASET_SCHEMA,
  datasetResponseIssue,
  type ResultDatasetAction,
  type ResultDatasetState,
} from "../result-dataset-state";
import type { AiAction } from "../ai-state";
import type { ProjectState } from "../project-state";
import type { RunState } from "../run-state";

interface ResultDatasetControllerOptions {
  projectState: ProjectState;
  runState: RunState;
  resultDatasetState: ResultDatasetState;
  mounted: MutableRefObject<boolean>;
  dispatchResultDataset: Dispatch<ResultDatasetAction>;
  dispatchAi: Dispatch<AiAction>;
}

export function useResultDatasetController({
  projectState,
  runState,
  resultDatasetState,
  mounted,
  dispatchResultDataset,
  dispatchAi,
}: ResultDatasetControllerOptions) {
  const sequenceRef = useRef(0);

  const loadResultDataset = useCallback(async () => {
    const projectSessionId = projectState.projectSessionId;
    const revisionId = projectState.draft?.revision_id;
    const runId = runState.projectSessionId === projectSessionId ? runState.summary?.run_id : null;
    const zoneIds = projectState.project?.zones.slice(0, MAX_DATASET_ZONES).map((zone) => zone.zone_id) ?? [];
    if (!projectSessionId || !revisionId || !runId || zoneIds.length === 0 || runState.status !== "succeeded") return;
    const sequence = ++sequenceRef.current;
    const requestId = crypto.randomUUID();
    dispatchResultDataset({ type: "load_started", sequence, requestId, projectSessionId, revisionId, runId });
    try {
      const response = await extractActiveRunZoneAirStateDataset(requestId, projectSessionId, zoneIds);
      if (!mounted.current || sequence !== sequenceRef.current) return;
      if (response.cancelled) {
        dispatchResultDataset({ type: "load_cancelled", sequence, requestId, dataset: response.dataset });
        return;
      }
      const issue = datasetResponseIssue(response, requestId);
      const dataset = response.dataset;
      const identityMatches = dataset
        && dataset.schema === ZONE_RESULT_DATASET_SCHEMA
        && dataset.project_session_id === projectSessionId
        && dataset.project_source_hash === projectState.project?.source_sha256
        && dataset.revision_id === revisionId
        && dataset.run_id === runId
        && response.project_session_id === projectSessionId;
      if (issue || !dataset || !identityMatches) {
        dispatchResultDataset({
          type: "load_failed",
          sequence,
          requestId,
          issue: issue ?? {
            code: "result_dataset_identity_mismatch",
            message: "The result dataset did not match the active project and run.",
            source_line_number: null,
            context: {},
          },
        });
        return;
      }
      dispatchResultDataset({ type: "load_succeeded", sequence, requestId, dataset });
      dispatchAi({ type: "context_changed" });
    } catch {
      if (!mounted.current || sequence !== sequenceRef.current) return;
      dispatchResultDataset({
        type: "load_failed",
        sequence,
        requestId,
        issue: {
          code: "desktop_bridge_invoke_failed",
          message: "Desktop multi-Zone result invocation failed.",
          source_line_number: null,
          context: {},
        },
      });
    }
  }, [dispatchAi, dispatchResultDataset, mounted, projectState.draft?.revision_id, projectState.project, projectState.projectSessionId, runState.projectSessionId, runState.status, runState.summary?.run_id]);

  const cancelResultDataset = useCallback(async () => {
    const projectSessionId = projectState.projectSessionId;
    const batchId = resultDatasetState.activeRequestId;
    if (!projectSessionId || !batchId || resultDatasetState.status !== "loading") return;
    await cancelZoneResultDataset(crypto.randomUUID(), projectSessionId, batchId).catch(() => undefined);
  }, [projectState.projectSessionId, resultDatasetState.activeRequestId, resultDatasetState.status]);

  return { loadResultDataset, cancelResultDataset, resultDatasetSequence: sequenceRef };
}
