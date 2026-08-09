import { useEffect, useMemo, useRef, type Dispatch } from "react";
import type { AiAction, AiState } from "../ai-state";
import { buildAssistantContextReceipt } from "../assistant-context";
import type { AttachmentState } from "../attachment-state";
import { projectFileName, selectedZone, type ProjectState } from "../project-state";
import type { ResultDatasetAction, ResultDatasetState } from "../result-dataset-state";
import type { RunState } from "../run-state";
import { findSemanticNode, type SemanticState } from "../semantic-state";

export function useResultAssistantContext({ projectState, runState, resultDatasetState, aiState, attachmentState, semanticState, dispatchResultDataset, dispatchAi }: {
  projectState: ProjectState;
  runState: RunState;
  resultDatasetState: ResultDatasetState;
  aiState: AiState;
  attachmentState: AttachmentState;
  semanticState: SemanticState;
  dispatchResultDataset: Dispatch<ResultDatasetAction>;
  dispatchAi: Dispatch<AiAction>;
}) {
  const activeRunId = runState.projectSessionId === projectState.projectSessionId ? runState.summary?.run_id ?? null : null;
  const analysisSelection = useMemo(() => ({
    intent: aiState.intent,
    result_dataset_fingerprint: resultDatasetState.dataset?.dataset_fingerprint ?? null,
    metric: resultDatasetState.dataset ? resultDatasetState.metric : null,
    selected_time_seconds: resultDatasetState.dataset ? resultDatasetState.selectedTimeSeconds : null,
  }), [aiState.intent, resultDatasetState.dataset, resultDatasetState.metric, resultDatasetState.selectedTimeSeconds]);
  const receiptNode = findSemanticNode(semanticState.snapshot, semanticState.selectedObjectId);
  const currentZone = selectedZone(projectState);
  const receiptProvider = aiState.providerProfiles.find((profile) => profile.profile_id === aiState.providerProfileId) ?? null;
  const assistantReceipt = useMemo(() => buildAssistantContextReceipt({
    intent: aiState.intent,
    projectDisplayName: projectState.project ? projectFileName(projectState.project.source_path) : null,
    revisionNumber: projectState.draft?.revision_number ?? null,
    selectedObjectDisplayName: receiptNode?.name ?? receiptNode?.label ?? currentZone?.name ?? null,
    runId: activeRunId,
    analysisSelection,
    selectedAttachmentCount: attachmentState.attachments.filter((attachment) => attachment.selected_by_user).length,
    provider: receiptProvider,
    modelId: aiState.modelId,
    scopes: aiState.scopes,
  }), [activeRunId, aiState.intent, aiState.modelId, aiState.scopes, analysisSelection, attachmentState.attachments, currentZone?.name, projectState.draft?.revision_number, projectState.project, receiptNode?.label, receiptNode?.name, receiptProvider]);
  const datasetIdentity = `${projectState.projectSessionId ?? ""}|${projectState.draft?.revision_id ?? ""}|${activeRunId ?? ""}`;
  const previousDatasetIdentity = useRef("");
  useEffect(() => {
    if (datasetIdentity === previousDatasetIdentity.current) return;
    previousDatasetIdentity.current = datasetIdentity;
    dispatchResultDataset({ type: "identity_changed" });
    dispatchAi({ type: "context_changed" });
  }, [datasetIdentity, dispatchAi, dispatchResultDataset]);
  return { activeRunId, analysisSelection, assistantReceipt };
}
