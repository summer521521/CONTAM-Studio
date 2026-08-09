import type { ProjectState } from "./project-state";
import type { ResultDatasetState } from "./result-dataset-state";
import type { RunState } from "./run-state";

export type EvidenceStatus = "verified" | "partial" | "failed" | "stale" | "unavailable";

export interface EvidenceLineageNode {
  id: string;
  kind: "project" | "revision" | "snapshot" | "run" | "manifest" | "extraction" | "dataset" | "consumer";
  status: EvidenceStatus;
  titleKey: string;
  time: string | null;
  tool: string | null;
  version: string | null;
  identity: string | null;
  hashPrefix: string | null;
}

function prefix(value: string | null | undefined): string | null {
  return value ? value.slice(0, 12) : null;
}

export function buildEvidenceLineage(
  projectState: ProjectState,
  runState: RunState,
  resultState: ResultDatasetState,
): EvidenceLineageNode[] {
  if (!projectState.project || !projectState.projectSessionId) return [];
  const run = runState.projectSessionId === projectState.projectSessionId ? runState.summary : null;
  const dataset = resultState.dataset;
  const datasetBound = dataset
    && dataset.project_session_id === projectState.projectSessionId
    && dataset.project_source_hash === projectState.project.source_sha256
    && dataset.revision_id === projectState.draft?.revision_id
    && dataset.run_id === run?.run_id
      ? dataset
      : null;
  const solveStatus: EvidenceStatus = run?.status === "succeeded"
    ? "verified"
    : runState.status === "error" ? "failed" : "unavailable";
  const extractionStatus: EvidenceStatus = datasetBound
    ? datasetBound.status === "ready" ? "verified"
      : datasetBound.status === "partial" ? "partial"
        : datasetBound.status === "stale" ? "stale"
          : datasetBound.status === "failed" ? "failed" : "unavailable"
    : "unavailable";
  return [
    {
      id: "project",
      kind: "project",
      status: "verified",
      titleKey: "resultsWorkspace.evidence.project",
      time: null,
      tool: null,
      version: projectState.project.header_version,
      identity: projectState.projectSessionId,
      hashPrefix: prefix(projectState.project.source_sha256),
    },
    {
      id: "revision",
      kind: "revision",
      status: projectState.draft ? "verified" : "unavailable",
      titleKey: "resultsWorkspace.evidence.revision",
      time: null,
      tool: null,
      version: null,
      identity: projectState.draft?.revision_id ?? null,
      hashPrefix: null,
    },
    {
      id: "snapshot",
      kind: "snapshot",
      status: run?.source_unchanged ? "verified" : run ? "failed" : "unavailable",
      titleKey: "resultsWorkspace.evidence.snapshot",
      time: run?.started_at_utc ?? null,
      tool: "CONTAM Studio",
      version: null,
      identity: projectState.draft?.revision_id ?? projectState.projectSessionId,
      hashPrefix: prefix(projectState.project.source_sha256),
    },
    {
      id: "solver",
      kind: "run",
      status: solveStatus,
      titleKey: "resultsWorkspace.evidence.solver",
      time: run?.started_at_utc ?? null,
      tool: run?.solver_name ?? "ContamX",
      version: run?.solver_version ?? null,
      identity: run?.run_id ?? null,
      hashPrefix: null,
    },
    {
      id: "manifest",
      kind: "manifest",
      status: datasetBound ? "verified" : solveStatus,
      titleKey: "resultsWorkspace.evidence.manifest",
      time: null,
      tool: "CONTAM Studio",
      version: null,
      identity: run?.run_id ?? null,
      hashPrefix: prefix(datasetBound?.run_manifest_identity),
    },
    {
      id: "extraction",
      kind: "extraction",
      status: extractionStatus,
      titleKey: "resultsWorkspace.evidence.extraction",
      time: datasetBound ? new Date(datasetBound.created_at_unix_ms).toISOString() : null,
      tool: "SimRead",
      version: null,
      identity: datasetBound?.extraction_batch_id ?? null,
      hashPrefix: null,
    },
    {
      id: "dataset",
      kind: "dataset",
      status: extractionStatus,
      titleKey: "resultsWorkspace.evidence.dataset",
      time: datasetBound ? new Date(datasetBound.created_at_unix_ms).toISOString() : null,
      tool: null,
      version: datasetBound?.schema ?? null,
      identity: datasetBound?.dataset_fingerprint ?? null,
      hashPrefix: prefix(datasetBound?.dataset_fingerprint),
    },
  ];
}

export function evidenceChainStatus(nodes: readonly EvidenceLineageNode[]): EvidenceStatus {
  if (!nodes.length || nodes.some((node) => node.status === "unavailable")) return "unavailable";
  if (nodes.some((node) => node.status === "failed")) return "failed";
  if (nodes.some((node) => node.status === "stale")) return "stale";
  if (nodes.some((node) => node.status === "partial")) return "partial";
  return "verified";
}
