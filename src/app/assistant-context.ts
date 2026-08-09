import type { AiAnalysisSelection, AiContextScope, AiIntent, AiProviderView } from "./ai-state";

export interface AssistantContextReceipt {
  identity: string;
  intent: AiIntent;
  project: string | null;
  revision: number | null;
  object: string | null;
  run: string | null;
  resultDatasetFingerprint: string | null;
  metric: AiAnalysisSelection["metric"];
  selectedTimeSeconds: number | null;
  attachmentCount: number;
  provider: string | null;
  model: string | null;
  network: boolean;
  includedScopes: AiContextScope[];
  excluded: readonly ["credentials", "absolute_paths", "original_prj_text", "complete_result_series"];
}

export interface AssistantContextReceiptInput {
  intent: AiIntent;
  projectDisplayName: string | null;
  revisionNumber: number | null;
  selectedObjectDisplayName: string | null;
  runId: string | null;
  analysisSelection: AiAnalysisSelection;
  selectedAttachmentCount: number;
  provider: AiProviderView | null;
  modelId: string;
  scopes: AiContextScope[];
}

function safeLeafName(value: string | null): string | null {
  if (!value) return null;
  const leaf = value.split(/[\\/]/).at(-1)?.trim() ?? "";
  return leaf.slice(0, 160) || null;
}

export function buildAssistantContextReceipt(input: AssistantContextReceiptInput): AssistantContextReceipt {
  const provider = input.provider?.display_name?.slice(0, 80) || null;
  const receipt = {
    intent: input.intent,
    project: safeLeafName(input.projectDisplayName),
    revision: input.revisionNumber,
    object: safeLeafName(input.selectedObjectDisplayName),
    run: input.runId?.slice(0, 128) ?? null,
    resultDatasetFingerprint: input.analysisSelection.result_dataset_fingerprint,
    metric: input.analysisSelection.metric,
    selectedTimeSeconds: input.analysisSelection.selected_time_seconds,
    attachmentCount: Math.max(0, Math.min(32, input.selectedAttachmentCount)),
    provider,
    model: input.modelId.slice(0, 160) || null,
    network: Boolean(input.provider),
    includedScopes: [...input.scopes].sort(),
    excluded: ["credentials", "absolute_paths", "original_prj_text", "complete_result_series"] as const,
  };
  return { ...receipt, identity: JSON.stringify(receipt) };
}

export function assistantReceiptMatchesPreview(
  receipt: AssistantContextReceipt,
  analysisSelection: AiAnalysisSelection,
): boolean {
  return receipt.intent === analysisSelection.intent
    && receipt.resultDatasetFingerprint === analysisSelection.result_dataset_fingerprint
    && receipt.metric === analysisSelection.metric
    && receipt.selectedTimeSeconds === analysisSelection.selected_time_seconds;
}
