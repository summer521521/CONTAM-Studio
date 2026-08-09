import { useTranslation } from "react-i18next";
import type { CommandAvailability } from "../../../app/command-availability";
import type { ProjectState } from "../../../app/project-state";
import { INITIAL_RESULT_DATASET_STATE, type ResultDatasetState, type ResultMetricKey } from "../../../app/result-dataset-state";
import type { ResultExportState } from "../../../app/result-export-state";
import type { ResultState } from "../../../app/result-state";
import type { RunState } from "../../../app/run-state";
import type { SemanticSnapshot } from "../../../app/semantic-state";
import { DEFAULT_VISUAL_PREFERENCES, type VisualWorkspacePreferences } from "../../../app/spatial-model";
import type { AppTheme, WorkbenchDestination } from "../../../app/workbench-state";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { ResultsWorkspace } from "../results/ResultsWorkspace";

export interface ResultsPageProps {
  projectState: ProjectState;
  runState: RunState;
  resultState: ResultState;
  resultDatasetState?: ResultDatasetState;
  resultExportState: ResultExportState;
  activeRunId: string | null;
  theme: AppTheme;
  availability: Pick<CommandAvailability, "openProject" | "loadActiveResult" | "selectManifest" | "exportResult">;
  onOpenProject: () => void;
  onLoadLatestResults: () => void;
  onSelectManifestResults: () => void;
  onExportResults: () => void;
  onLoadResultDataset?: () => void;
  onCancelResultDataset?: () => void;
  onResultMetricChange?: (metric: ResultMetricKey) => void;
  onResultTimeChange?: (timeSeconds: number | null) => void;
  onResultZonesChange?: (zoneIds: string[]) => void;
  onNavigate: (destination: WorkbenchDestination) => void;
  semanticSnapshot?: SemanticSnapshot | null;
  selectedSemanticObjectId?: string | null;
  visualPreferences?: VisualWorkspacePreferences;
  onVisualPreferencesChange?: (preferences: VisualWorkspacePreferences) => void;
  onSelectSemantic?: (semanticId: string) => void;
}

export function ResultsPage({ projectState, runState, resultState, resultDatasetState = INITIAL_RESULT_DATASET_STATE, resultExportState, theme, onOpenProject, onLoadLatestResults, onSelectManifestResults, onExportResults, onLoadResultDataset = () => undefined, onCancelResultDataset = () => undefined, onResultMetricChange = () => undefined, onResultTimeChange = () => undefined, onResultZonesChange = () => undefined, onNavigate, semanticSnapshot = null, selectedSemanticObjectId = null, visualPreferences = DEFAULT_VISUAL_PREFERENCES, onVisualPreferencesChange = () => undefined, onSelectSemantic = () => undefined }: ResultsPageProps) {
  const { t } = useTranslation();
  if (!projectState.project) {
    return <EmptyState title={t("journeys.results.noProject")} action={<Button variant="primary" onClick={onOpenProject}>{t("journeys.openProject")}</Button>} />;
  }
  return (
    <section className="journey-page results-journey" aria-label={t("journeys.results.title")}>
      <ResultsWorkspace
        projectState={projectState}
        runState={runState}
        state={resultDatasetState}
        resultState={resultState}
        resultExportState={resultExportState}
        theme={theme}
        semanticSnapshot={semanticSnapshot}
        selectedSemanticObjectId={selectedSemanticObjectId}
        visualPreferences={visualPreferences}
        onVisualPreferencesChange={onVisualPreferencesChange}
        onSelectSemantic={onSelectSemantic}
        onRead={onLoadResultDataset}
        onReadSingle={onLoadLatestResults}
        onCancel={onCancelResultDataset}
        onMetricChange={onResultMetricChange}
        onTimeChange={onResultTimeChange}
        onZonesChange={onResultZonesChange}
        onSelectManifest={onSelectManifestResults}
        onExportSingle={onExportResults}
        onGoRun={() => onNavigate("run")}
      />
    </section>
  );
}
