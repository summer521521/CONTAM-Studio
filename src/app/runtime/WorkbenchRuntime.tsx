import { useCallback, useEffect, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkbenchShell } from "../../components/workbench/WorkbenchShell";
import { clearReadonlyAiSession } from "../desktop-api";
import { aiReducer, INITIAL_AI_STATE } from "../ai-state";
import { INITIAL_SIMULATION_STATE, simulationReducer } from "../simulation-state";
import { attachmentReducer, INITIAL_ATTACHMENT_STATE } from "../attachment-state";
import { INITIAL_PATCH_STATE, patchReducer } from "../patch-state";
import { deriveCommandAvailability } from "../command-availability";
import { INITIAL_PROJECT_STATE, projectReducer, selectedZone } from "../project-state";
import { useProjectController } from "../controllers/project-controller";
import { useResultController } from "../controllers/result-controller";
import { useResultDatasetController } from "../controllers/result-dataset-controller";
import { useRunController } from "../controllers/run-controller";
import { useAiController } from "../controllers/ai-controller";
import { INITIAL_RESULT_STATE, resultReducer } from "../result-state";
import { INITIAL_RESULT_DATASET_STATE, resultDatasetReducer } from "../result-dataset-state";
import { INITIAL_RESULT_EXPORT_STATE, resultExportReducer } from "../result-export-state";
import { INITIAL_RUN_STATE, runReducer } from "../run-state";
import { draftShortcutAction } from "../draft-shortcuts";
import { INITIAL_SEMANTIC_STATE, semanticReducer } from "../semantic-state";
import { type AppLanguage, type WorkbenchDestination } from "../workbench-state";
import { useWorkbenchLayout } from "./useWorkbenchLayout";
import { useStudioSettings } from "./useStudioSettings";
import { useProjectPatchJourney } from "./useProjectPatchJourney";
import { useAssistantEvidenceJourney } from "./useAssistantEvidenceJourney";
import { useHostStageEvents } from "./useHostStageEvents";
import { useCloseLifecycle } from "./useCloseLifecycle";
import { useResultAssistantContext } from "./useResultAssistantContext";

export function WorkbenchRuntime() {
  const { t } = useTranslation();
  const {
    workbench,
    layoutRevision,
    activeDestination,
    setActiveDestination,
    updateWorkbench,
    initialMainLayout,
    initialCenterLayout,
    projectPanelRef,
    contextPanelRef,
    bottomPanelRef,
    toggleProject,
    toggleContext,
    toggleBottom,
    openBottom,
    openContext,
    navigateToDestination,
    restoreWorkbenchLayout,
    handleMainLayout,
    handleCenterLayout,
  } = useWorkbenchLayout();
  const [projectState, dispatchProject] = useReducer(projectReducer, INITIAL_PROJECT_STATE);
  const [patchState, dispatchPatch] = useReducer(patchReducer, INITIAL_PATCH_STATE);
  const [resultState, dispatchResult] = useReducer(resultReducer, INITIAL_RESULT_STATE);
  const [resultDatasetState, dispatchResultDataset] = useReducer(resultDatasetReducer, INITIAL_RESULT_DATASET_STATE);
  const [resultExportState, dispatchResultExport] = useReducer(resultExportReducer, INITIAL_RESULT_EXPORT_STATE);
  const [runState, dispatchRun] = useReducer(runReducer, INITIAL_RUN_STATE);
  const [aiState, dispatchAi] = useReducer(aiReducer, INITIAL_AI_STATE);
  const [simulationState, dispatchSimulation] = useReducer(simulationReducer, INITIAL_SIMULATION_STATE);
  const [attachmentState, dispatchAttachment] = useReducer(attachmentReducer, INITIAL_ATTACHMENT_STATE);
  const [semanticState, dispatchSemantic] = useReducer(semanticReducer, INITIAL_SEMANTIC_STATE);
  const [placeholderNotice, setPlaceholderNotice] = useState<string | null>(null);
  const {
    studioSetup,
    storageUsage,
    studioSetupBusy,
    chooseStudioDataDirectory,
    probeStudioTool,
    saveStudioDataDirectory,
    openStudioDirectoryAction,
    clearStudioCacheAction,
    copyDiagnostics,
    exportDiagnostics,
  } = useStudioSettings({
    activeDestination,
    language: workbench.language,
    theme: workbench.theme,
    updateWorkbench,
    setActiveDestination,
    onNotice: setPlaceholderNotice,
    t,
  });
  const [draftGuardOpen, setDraftGuardOpen] = useState(false);
  const [draftGuardBusy, setDraftGuardBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const mounted = useHostStageEvents(dispatchResult, dispatchResultExport);

  useEffect(() => {
    if (!placeholderNotice) return;
    const timer = window.setTimeout(() => setPlaceholderNotice(null), 4800);
    return () => window.clearTimeout(timer);
  }, [placeholderNotice]);

  useEffect(() => {
    if (!projectState.issue && !patchState.issue) return;
    openBottom("problems");
  }, [openBottom, patchState.issue, projectState.issue]);

  const showPlaceholder = useCallback(
    (action: string) => setPlaceholderNotice(t("mock.placeholder", { action })),
    [t],
  );

  const currentZone = selectedZone(projectState);
  const { activeRunId, analysisSelection, assistantReceipt } = useResultAssistantContext({ projectState, runState, resultDatasetState, aiState, attachmentState, semanticState, dispatchResultDataset, dispatchAi });
  const commandAvailability = deriveCommandAvailability({
    projectStatus: projectState.status,
    hasProject: Boolean(projectState.project),
    hasProjectSession: Boolean(projectState.projectSessionId),
    hasDraft: Boolean(projectState.draft),
    canUndo: Boolean(projectState.draft?.can_undo),
    canRedo: Boolean(projectState.draft?.can_redo),
    hasZone: Boolean(currentZone),
    patchStatus: patchState.status,
    hasPatchToken: Boolean(patchState.newVolumeToken.trim()),
    hasPatchReview: Boolean(patchState.review),
    resultStatus: resultState.status,
    hasResult: Boolean(resultState.result),
    resultExportStatus: resultExportState.status,
    runStatus: runState.status,
    hasActiveRun: Boolean(activeRunId),
    aiStatus: aiState.status,
    draftBusy: draftBusy || simulationState.status === "executing",
  });
  const patchLocked = patchState.status === "review" || patchState.status === "applying";

  const projectController = useProjectController({
    projectState,
    availability: commandAvailability,
    currentZone,
    mounted,
    dispatchProject,
    dispatchPatch,
    dispatchResult,
    dispatchResultExport,
    dispatchRun,
    dispatchAi,
    dispatchSimulation,
    onProjectOpened: () => setActiveDestination("project"),
    onNotice: setPlaceholderNotice,
    translate: t,
    draftBusy: draftBusy || simulationState.status === "executing",
    setDraftBusy,
    draftGuardBusy,
    setDraftGuardBusy,
    setDraftGuardOpen,
  });
  const {
    openProject,
    switchDraft,
    exportDraft,
    exportDraftAndOpen,
    discardDraftAndOpen,
  } = projectController;
  const {
    closeRequest,
    closeBusy,
    cancelAppClose,
    discardAndCloseApp,
    exportAndCloseApp,
  } = useCloseLifecycle({ mounted, exportDraft, onNotice: setPlaceholderNotice, t });

  const runController = useRunController({
    availability: commandAvailability,
    project: projectState.project,
    projectSessionId: projectState.projectSessionId,
    runState,
    mounted,
    dispatchRun,
    dispatchAi,
    onRunStarted: () => openBottom("logs"),
  });
  const { runProject } = runController;

  const resultController = useResultController({
    availability: commandAvailability,
    projectSessionId: projectState.projectSessionId,
    currentZone,
    runState,
    resultState,
    mounted,
    dispatchResult,
    dispatchResultExport,
    dispatchAi,
    onExportStarted: () => undefined,
  });
  const {
    loadLatestRunResults,
    selectRunManifestResults,
    exportZoneResults,
  } = resultController;
  const { loadResultDataset, cancelResultDataset } = useResultDatasetController({
    projectState,
    runState,
    resultDatasetState,
    mounted,
    dispatchResultDataset,
    dispatchAi,
  });

  const aiController = useAiController({
    aiState,
    projectState,
    currentZone,
    language: workbench.language,
    patchLocked,
    mounted,
    dispatchAi,
    analysisSelection,
  });
  const {
    clearAiSession,
    changeAiArchivePersistence,
    mutateAiArchive,
    updateAiConnection,
    installCodexCli,
    disconnectAi,
    selectAiProvider,
    refreshAiProviderModels,
    saveProviderProfile,
    deleteProviderProfile,
    testSelectedAiProvider,
    saveSelectedProviderSecret,
    clearSelectedProviderSecret,
    startCodexLogin,
    cancelCodexLogin,
    logoutCodex,
    toggleAiScope,
    changeAiModel,
    changeAiEffort,
    previewContext,
    sendAiQuestion,
    stopAiTurn,
  } = aiController;

  const {
    startVolumeEdit,
    planVolumePatch,
    applyVolumePatch,
    selectZoneById,
    selectedSemanticNode,
    selectedSemanticNodes,
    selectSemanticObject,
    editSemanticOperations,
    useAiSemanticPatch,
    planSemanticOperations,
    applySemanticOperations,
    discardSemanticOperations,
  } = useProjectPatchJourney({
    commandAvailability,
    currentZone,
    projectState,
    patchState,
    semanticState,
    simulationBusy: simulationState.status === "executing",
    attachmentBusy: attachmentState.busy,
    mounted,
    dispatchProject,
    dispatchPatch,
    dispatchResult,
    dispatchResultExport,
    dispatchRun,
    dispatchAi,
    dispatchSimulation,
    dispatchSemantic,
    onNotice: setPlaceholderNotice,
    onProjectDestination: () => setActiveDestination("project"),
    onOpenInspector: () => openContext("inspector"),
    t,
  });

  const {
    importAttachments,
    selectAttachmentEvidence,
    previewAttachmentDisclosure,
    removeAttachment,
    createSimulationPlan,
    approveAndRunSimulation,
  } = useAssistantEvidenceJourney({
    attachmentState,
    simulationState,
    aiModelId: aiState.modelId,
    language: workbench.language,
    projectState,
    currentZone,
    mounted,
    dispatchAttachment,
    dispatchAi,
    dispatchSimulation,
    dispatchProject,
    dispatchPatch,
    dispatchResult,
    dispatchResultExport,
    dispatchRun,
  });
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const action = draftShortcutAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        editableTarget: Boolean(target && (target.matches("input, textarea, [contenteditable='true']") || target.isContentEditable)),
      });
      if (action === "export") {
        event.preventDefault();
        if (commandAvailability.exportDraft) void exportDraft();
      } else if (action === "redo") {
        event.preventDefault();
        if (commandAvailability.redoDraft) void switchDraft("redo");
      } else if (action === "undo") {
        event.preventDefault();
        if (commandAvailability.undoDraft) void switchDraft("undo");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [commandAvailability.exportDraft, commandAvailability.redoDraft, commandAvailability.undoDraft, exportDraft, switchDraft]);

  const navigateDestination = useCallback((destination: WorkbenchDestination) => {
    if (!commandAvailability.navigation) return;
    navigateToDestination(destination);
  }, [commandAvailability.navigation, navigateToDestination]);

  return (
    <WorkbenchShell
      workbench={workbench}
      layoutRevision={layoutRevision}
      initialMainLayout={initialMainLayout}
      initialCenterLayout={initialCenterLayout}
      projectPanelRef={projectPanelRef}
      contextPanelRef={contextPanelRef}
      bottomPanelRef={bottomPanelRef}
      onMainLayout={handleMainLayout}
      onCenterLayout={handleCenterLayout}
      workbenchPanels={{
        activityBar: {
          projectCollapsed: workbench.projectCollapsed,
          activeDestination,
          navigationAvailable: commandAvailability.navigation,
          onToggleProject: toggleProject,
          onNavigate: navigateDestination,
        },
        projectSidebar: {
          projectState,
          selectedZoneKey: projectState.selectedZoneKey,
          availability: commandAvailability,
          onSelectZone: (zone) => selectZoneById(zone.zone_id),
          semanticState,
          onSelectSemantic: selectSemanticObject,
          onCollapse: toggleProject,
        },
        destinationContent: {
          destination: activeDestination,
          projectState,
          runState,
          aiState,
          contextCollapsed: workbench.contextCollapsed,
          bottomCollapsed: workbench.bottomCollapsed,
          onToggleContext: toggleContext,
          onToggleBottom: toggleBottom,
          onNavigate: navigateDestination,
          onOpenProject: openProject,
          onRunProject: runProject,
          onSettingsReset: restoreWorkbenchLayout,
          availability: commandAvailability,
          resultState,
          resultDatasetState,
          resultExportState,
          activeRunId,
          theme: workbench.theme,
          language: workbench.language,
          onLoadLatestResults: loadLatestRunResults,
          onSelectManifestResults: selectRunManifestResults,
          onExportResults: exportZoneResults,
          onLoadResultDataset: () => void loadResultDataset(),
          onCancelResultDataset: () => void cancelResultDataset(),
          onResultMetricChange: (metric) => {
            dispatchResultDataset({ type: "metric_changed", metric });
            dispatchAi({ type: "context_changed" });
          },
          onResultTimeChange: (timeSeconds) => {
            dispatchResultDataset({ type: "time_changed", timeSeconds });
            dispatchAi({ type: "context_changed" });
          },
          onResultZonesChange: (zoneIds) => {
            dispatchResultDataset({ type: "zones_changed", zoneIds });
            dispatchAi({ type: "context_changed" });
          },
          projectSessionId: projectState.projectSessionId,
          revisionId: projectState.draft?.revision_id ?? null,
          semanticSnapshot: semanticState.snapshot,
          semanticStatus: semanticState.status,
          semanticIssue: semanticState.issue,
          selectedSemanticObjectId: semanticState.selectedObjectId,
          visualPreferences: workbench.visualWorkspace,
          onVisualPreferencesChange: (visualWorkspace) => updateWorkbench({ visualWorkspace }),
          onSelectSemantic: (semanticId) => selectSemanticObject(semanticId),
          onNotice: setPlaceholderNotice,
          onOpenAssistant: () => {
            contextPanelRef.current?.expand();
            updateWorkbench({ contextCollapsed: false, contextTab: "assistant" });
          },
          onAiConnect: () => void updateAiConnection(false),
          onAiRefresh: () => void updateAiConnection(true),
          onAiProviderSelect: selectAiProvider,
          onAiProviderTest: () => void testSelectedAiProvider(),
          onAiProviderRefreshModels: () => void refreshAiProviderModels(),
          onAiProviderSave: (profile) => void saveProviderProfile(profile),
          onAiProviderDelete: () => void deleteProviderProfile(),
          onAiCodexDeviceLogin: () => void startCodexLogin("chatgptDeviceCode"),
          onAiCodexApiKeyLogin: (apiKey) => void startCodexLogin("apiKey", apiKey),
          onAiCodexCancelLogin: () => void cancelCodexLogin(),
          onAiCodexLogout: () => void logoutCodex(),
          onAiProviderSecret: (secret) => void saveSelectedProviderSecret(secret),
          onAiProviderClearSecret: () => void clearSelectedProviderSecret(),
          onAiModelChange: changeAiModel,
          setup: studioSetup,
          setupBusy: studioSetupBusy,
          onChooseDataDirectory: chooseStudioDataDirectory,
          onProbeTool: probeStudioTool,
          onSaveDataDirectory: saveStudioDataDirectory,
          onOpenStudioDirectory: openStudioDirectoryAction,
          onClearStudioCache: clearStudioCacheAction,
          storageUsage,
          onCopyDiagnostics: copyDiagnostics,
          onExportDiagnostics: exportDiagnostics,
        },
        bottomPanel: {
          activeTab: workbench.bottomTab,
          projectState,
          runState,
          onViewCurrentZoneResults: loadLatestRunResults,
          viewRunResultsDisabled: !commandAvailability.loadActiveResult,
          onTabChange: (bottomTab) => updateWorkbench({ bottomTab }),
          onCollapse: toggleBottom,
        },
        contextSidebar: {
          activeTab: workbench.contextTab,
          project: projectState.project,
          selectedZone: currentZone,
          patchState,
          availability: commandAvailability,
          onStartVolumeEdit: startVolumeEdit,
          onVolumeTokenChange: (token) => {
            if (commandAvailability.patchInput) dispatchPatch({ type: "input_changed", token });
          },
          onPlanVolumePatch: planVolumePatch,
          onCancelVolumeEdit: () => {
            if (commandAvailability.patchCancel) dispatchPatch({ type: "cancel" });
          },
          onTabChange: (contextTab) => {
            if (commandAvailability.navigation) updateWorkbench({ contextTab });
          },
          onCollapse: toggleContext,
          aiState,
          aiContextAvailable: Boolean(projectState.projectSessionId && projectState.draft && currentZone),
          assistantReceipt,
          onAiIntentChange: (intent) => {
            dispatchAi({ type: "intent_changed", intent });
            void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
          },
          onOpenAiSettings: () => setActiveDestination("settings"),
          simulationState,
          onAiModeChange: (mode) => dispatchSimulation({ type: "mode_changed", mode }),
          onSimulationGoalChange: (goal) => dispatchSimulation({ type: "goal_changed", goal }),
          onSimulationPlan: () => void createSimulationPlan(),
          onSimulationBack: () => dispatchSimulation({ type: "goal_changed", goal: simulationState.goal }),
          onSimulationCancel: () => dispatchSimulation({ type: "plan_cancelled" }),
          onSimulationApproveAndRun: () => void approveAndRunSimulation(),
          attachmentState,
          onAttachmentImport: () => void importAttachments(),
          onAttachmentSelect: (attachment, selected) => void selectAttachmentEvidence(attachment, selected),
          onAttachmentPreview: () => void previewAttachmentDisclosure(),
          onAttachmentRemove: (attachment) => void removeAttachment(attachment),
          semanticState,
          selectedSemanticNode,
          selectedSemanticNodes,
          onSemanticEdit: editSemanticOperations,
          onSemanticUndo: () => dispatchSemantic({ type: "undo" }),
          onSemanticRedo: () => dispatchSemantic({ type: "redo" }),
          onSemanticPlan: () => void planSemanticOperations(),
          onSemanticApply: () => void applySemanticOperations(),
          onSemanticDiscard: () => void discardSemanticOperations(),
          onAiConnect: () => void updateAiConnection(false),
          onAiInstall: () => void installCodexCli(),
          onAiRefresh: () => void updateAiConnection(true),
          onAiDisconnect: () => void disconnectAi(),
          onAiProviderSelect: selectAiProvider,
          onAiProviderTest: () => void testSelectedAiProvider(),
          onAiProviderRefreshModels: () => void refreshAiProviderModels(),
          onAiProviderSave: (profile) => void saveProviderProfile(profile),
          onAiProviderDelete: () => void deleteProviderProfile(),
          onAiCodexDeviceLogin: () => void startCodexLogin("chatgptDeviceCode"),
          onAiCodexApiKeyLogin: (apiKey) => void startCodexLogin("apiKey", apiKey),
          onAiCodexCancelLogin: () => void cancelCodexLogin(),
          onAiCodexLogout: () => void logoutCodex(),
          onAiProviderSecret: (secret) => void saveSelectedProviderSecret(secret),
          onAiProviderClearSecret: () => void clearSelectedProviderSecret(),
          onAiScopeToggle: toggleAiScope,
          onAiModelChange: changeAiModel,
          onAiEffortChange: changeAiEffort,
          onAiPreview: () => void previewContext(),
          onAiPreviewVisibilityToggle: () => dispatchAi({ type: "preview_visibility_toggled" }),
          onAiQuestionChange: (question) => dispatchAi({ type: "question_changed", question }),
          onAiSend: () => void sendAiQuestion(),
          onAiStop: () => void stopAiTurn(),
          onAiClear: () => void clearAiSession(),
          onAiArchiveEnabled: (enabled) => void changeAiArchivePersistence(enabled),
          onAiArchiveDelete: (entryId) => void mutateAiArchive("delete", entryId),
          onAiArchiveClearZone: () => void mutateAiArchive("clear_zone"),
          onAiArchiveClearAll: () => void mutateAiArchive("clear_all"),
          onUseSemanticPatch: useAiSemanticPatch,
        },
      }}
      topBar={{
        language: workbench.language,
        theme: workbench.theme,
        onLanguageChange: (language: AppLanguage) => {
          if (!commandAvailability.language) return;
          updateWorkbench({ language });
          dispatchAi({ type: "context_changed" });
          dispatchSimulation({ type: "context_changed" });
          void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
        },
        availability: commandAvailability,
        onThemeToggle: () =>
          updateWorkbench({ theme: workbench.theme === "light" ? "dark" : "light" }),
        onNewProject: () => {
          if (commandAvailability.newProject) showPlaceholder(t("toolbar.newProject"));
        },
        onSettings: () => {
          if (commandAvailability.navigation) setActiveDestination("settings");
        },
        onOpenProject: openProject,
        onRunProject: runProject,
        onUndoDraft: () => void switchDraft("undo"),
        onRedoDraft: () => void switchDraft("redo"),
        onExportDraft: () => void exportDraft(),
        onPlaceholder: showPlaceholder,
      }}
      statusBar={{ projectState, runState, aiState }}
      placeholderNotice={placeholderNotice}
      dismissPlaceholder={() => setPlaceholderNotice(null)}
      placeholderDismissLabel={t("mock.dismiss")}
      patchDialog={
        patchState.review && ["review", "applying"].includes(patchState.status) && projectState.project
          ? {
              projectFileName: projectState.project.source_path.split(/[\\/]/).at(-1) ?? projectState.project.source_path,
              review: patchState.review,
              availability: commandAvailability,
              issueCode: patchState.issue?.code ?? null,
              onBack: () => {
                if (commandAvailability.patchBack) dispatchPatch({ type: "return_to_edit" });
              },
              onCancel: () => {
                if (commandAvailability.patchCancel) dispatchPatch({ type: "cancel" });
              },
              onApply: applyVolumePatch,
            }
          : null
      }
      draftSwitchDialog={
        draftGuardOpen && projectState.draft?.dirty && !projectState.draft.exported
          ? {
              busy: draftGuardBusy,
              onCancel: () => setDraftGuardOpen(false),
              onExport: exportDraftAndOpen,
              onDiscard: discardDraftAndOpen,
            }
          : null
      }
      closeDialog={
        closeRequest
          ? {
              request: closeRequest,
              busy: closeBusy,
              onCancel: () => void cancelAppClose(),
              onDiscard: () => void discardAndCloseApp(),
              onExport: () => void exportAndCloseApp(),
            }
          : null
      }
    />
  );
}
