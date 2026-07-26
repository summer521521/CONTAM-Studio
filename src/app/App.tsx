import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Group, Panel, Separator, usePanelRef, type Layout } from "react-resizable-panels";
import { ActivityBar } from "../components/workbench/ActivityBar";
import { BottomPanel } from "../components/workbench/BottomPanel";
import { ContextSidebar } from "../components/workbench/ContextSidebar";
import { ProjectSidebar } from "../components/workbench/ProjectSidebar";
import { StatusBar } from "../components/workbench/StatusBar";
import { TopBar } from "../components/workbench/TopBar";
import { WelcomePage } from "../components/workbench/WelcomePage";
import { ZoneVolumePatchDialog } from "../components/workbench/ZoneVolumePatchDialog";
import { DraftSwitchDialog } from "../components/workbench/DraftSwitchDialog";
import { AppCloseDialog } from "../components/workbench/AppCloseDialog";
import i18n from "../i18n";
import {
  applyZoneVolumePatchToDraft,
  approveAndRunSimulationPlan,
  planZoneVolumePatch,
  prepareSimulationPlan,
  clearReadonlyAiSession,
  finishAppCloseDraftExport,
  resolveAppClose,
} from "./desktop-api";
import { APP_CLOSE_REQUESTED_EVENT, isSafeCloseRequest, isSafeCloseResolution, type CloseRequestView } from "./close-state";
import {
  aiReducer,
  INITIAL_AI_STATE,
} from "./ai-state";
import {
  INITIAL_SIMULATION_STATE,
  isSafeSimulationExecutionResponse,
  isSafeSimulationPlan,
  simulationReducer,
} from "./simulation-state";
import {
  applyResponseIssue,
  INITIAL_PATCH_STATE,
  patchReducer,
  patchResponseIssue,
} from "./patch-state";
import { deriveCommandAvailability } from "./command-availability";
import {
  INITIAL_PROJECT_STATE,
  projectReducer,
  selectedZone,
  zoneSelectionKey,
} from "./project-state";
import { useProjectController } from "./controllers/project-controller";
import { useResultController } from "./controllers/result-controller";
import { useRunController } from "./controllers/run-controller";
import { useAiController } from "./controllers/ai-controller";
import {
  INITIAL_RESULT_STATE,
  resultReducer,
  ZONE_RESULT_STAGE_EVENT,
  type ZoneResultStageEvent,
} from "./result-state";
import {
  INITIAL_RESULT_EXPORT_STATE,
  RESULT_EXPORT_STAGE_EVENT,
  resultExportReducer,
  type ResultExportStageEvent,
} from "./result-export-state";
import { INITIAL_RUN_STATE, runReducer } from "./run-state";
import { draftShortcutAction } from "./draft-shortcuts";
import {
  getCenterLayout,
  getMainLayout,
  loadWorkbenchState,
  saveWorkbenchState,
  DEFAULT_WORKBENCH_STATE,
  type AppLanguage,
  type WorkbenchDestination,
  type WorkbenchState,
} from "./workbench-state";

function App() {
  const { t } = useTranslation();
  const [workbench, setWorkbench] = useState(loadWorkbenchState);
  const [activeDestination, setActiveDestination] = useState<WorkbenchDestination>("project");
  const [selectedObject, setSelectedObject] = useState("navigation.classroom");
  const [projectState, dispatchProject] = useReducer(projectReducer, INITIAL_PROJECT_STATE);
  const [patchState, dispatchPatch] = useReducer(patchReducer, INITIAL_PATCH_STATE);
  const [resultState, dispatchResult] = useReducer(resultReducer, INITIAL_RESULT_STATE);
  const [resultExportState, dispatchResultExport] = useReducer(resultExportReducer, INITIAL_RESULT_EXPORT_STATE);
  const [runState, dispatchRun] = useReducer(runReducer, INITIAL_RUN_STATE);
  const [aiState, dispatchAi] = useReducer(aiReducer, INITIAL_AI_STATE);
  const [simulationState, dispatchSimulation] = useReducer(simulationReducer, INITIAL_SIMULATION_STATE);
  const [placeholderNotice, setPlaceholderNotice] = useState<string | null>(null);
  const [draftGuardOpen, setDraftGuardOpen] = useState(false);
  const [draftGuardBusy, setDraftGuardBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [closeRequest, setCloseRequest] = useState<CloseRequestView | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const mounted = useRef(true);
  const initialMainLayout = useRef(getMainLayout(workbench)).current;
  const initialCenterLayout = useRef(getCenterLayout(workbench)).current;
  const projectPanelRef = usePanelRef();
  const contextPanelRef = usePanelRef();
  const bottomPanelRef = usePanelRef();

  const updateWorkbench = useCallback((patch: Partial<WorkbenchState>) => {
    setWorkbench((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<CloseRequestView>(APP_CLOSE_REQUESTED_EVENT, ({ payload }) => {
      if (!disposed && isSafeCloseRequest(payload)) setCloseRequest(payload);
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<ResultExportStageEvent>(RESULT_EXPORT_STAGE_EVENT, ({ payload }) => {
      if (payload?.stage !== "exporting" || typeof payload.request_id !== "string") return;
      dispatchResultExport({ type: "host_exporting_started", requestId: payload.request_id });
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<ZoneResultStageEvent>(ZONE_RESULT_STAGE_EVENT, ({ payload }) => {
      if (payload?.stage !== "loading" || typeof payload.request_id !== "string") return;
      dispatchResult({ type: "host_loading_started", requestId: payload.request_id });
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = workbench.language;
    void i18n.changeLanguage(workbench.language);
  }, [workbench.language]);

  useEffect(() => {
    document.documentElement.dataset.theme = workbench.theme;
  }, [workbench.theme]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveWorkbenchState(workbench), 200);
    return () => window.clearTimeout(timer);
  }, [workbench]);

  useEffect(() => {
    if (!placeholderNotice) return;
    const timer = window.setTimeout(() => setPlaceholderNotice(null), 4800);
    return () => window.clearTimeout(timer);
  }, [placeholderNotice]);

  useEffect(() => {
    if (!projectState.issue && !patchState.issue) return;
    bottomPanelRef.current?.expand();
    updateWorkbench({ bottomCollapsed: false, bottomTab: "problems" });
  }, [patchState.issue, projectState.issue, updateWorkbench]);

  const showPlaceholder = useCallback(
    (action: string) => setPlaceholderNotice(t("mock.placeholder", { action })),
    [t],
  );

  const currentZone = selectedZone(projectState);
  const activeRunId =
    runState.projectSessionId === projectState.projectSessionId
      ? runState.summary?.run_id ?? null
      : null;
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

  const runController = useRunController({
    availability: commandAvailability,
    project: projectState.project,
    projectSessionId: projectState.projectSessionId,
    runState,
    mounted,
    dispatchRun,
    dispatchAi,
    onRunStarted: () => {
      bottomPanelRef.current?.expand();
      updateWorkbench({ bottomCollapsed: false, bottomTab: "logs" });
    },
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

  const aiController = useAiController({
    aiState,
    projectState,
    currentZone,
    language: workbench.language,
    patchLocked,
    mounted,
    dispatchAi,
  });
  const {
    clearAiSession,
    changeAiArchivePersistence,
    mutateAiArchive,
    updateAiConnection,
    installCodexCli,
    disconnectAi,
    toggleAiScope,
    changeAiModel,
    changeAiEffort,
    previewContext,
    sendAiQuestion,
    stopAiTurn,
  } = aiController;

  const startVolumeEdit = useCallback(() => {
    if (!commandAvailability.startEditing || !currentZone || !projectState.projectSessionId) return;
    dispatchPatch({
      type: "start_editing",
      projectSessionId: projectState.projectSessionId,
      zoneId: currentZone.zone_id,
      token: String(currentZone.volume_m3),
    });
  }, [commandAvailability.startEditing, currentZone, projectState.projectSessionId]);

  const planVolumePatch = useCallback(async () => {
    if (!commandAvailability.planPatch || !patchState.projectSessionId || patchState.zoneId === null) return;
    const requestId = crypto.randomUUID();
    dispatchProject({ type: "issue_cleared" });
    dispatchPatch({ type: "plan_started", requestId });
    try {
      const response = await planZoneVolumePatch(
        requestId,
        patchState.projectSessionId,
        patchState.zoneId,
        patchState.newVolumeToken,
      );
      if (!mounted.current) return;
      const issue = patchResponseIssue(response, requestId);
      if (issue || !response.review) {
        const safeIssue = issue ?? {
          code: "patch_response_contract_invalid",
          message: "Patch response contract invalid",
          source_line_number: null,
          context: {},
        };
        dispatchPatch({ type: "plan_failed", requestId, issue: safeIssue });
        dispatchProject({ type: "issue_reported", issue: safeIssue });
        return;
      }
      if (
        response.review.project_session_id !== patchState.projectSessionId ||
        response.review.zone_id !== patchState.zoneId ||
        response.review.new_token !== patchState.newVolumeToken
      ) {
        const issue = {
          code: "patch_response_contract_invalid",
          message: "Patch review did not match current input",
          source_line_number: null,
          context: {},
        };
        dispatchPatch({ type: "plan_failed", requestId, issue });
        dispatchProject({ type: "issue_reported", issue });
        return;
      }
      dispatchPatch({ type: "plan_succeeded", requestId, review: response.review });
    } catch {
      if (!mounted.current) return;
      const issue = {
        code: "desktop_bridge_invoke_failed",
        message: "Desktop bridge invocation failed",
        source_line_number: null,
        context: {},
      };
      dispatchPatch({ type: "plan_failed", requestId, issue });
      dispatchProject({ type: "issue_reported", issue });
    }
  }, [commandAvailability.planPatch, patchState.newVolumeToken, patchState.projectSessionId, patchState.zoneId]);

  const applyVolumePatch = useCallback(async () => {
    if (!commandAvailability.patchApply || !patchState.projectSessionId || !patchState.patchId) return;
    const requestId = crypto.randomUUID();
    dispatchProject({ type: "issue_cleared" });
    dispatchPatch({ type: "apply_started", requestId });
    try {
      const response = await applyZoneVolumePatchToDraft(
        requestId,
        patchState.projectSessionId,
        patchState.patchId,
      );
      if (!mounted.current) return;
      const issue = applyResponseIssue(response, requestId);
      if (issue || !response.project || !response.project_session_id || !response.target_zone_id || !response.draft) {
        const safeIssue = issue ?? {
          code: "patch_apply_response_invalid",
          message: "Patch apply response invalid",
          source_line_number: null,
          context: {},
        };
        const invalidate = [
          "patch_precondition_failed",
          "patch_verification_failed",
          "patch_session_mismatch",
          "project_session_mismatch",
        ].includes(safeIssue.code);
        dispatchPatch({ type: "apply_failed", requestId, issue: safeIssue, invalidate });
        dispatchProject({ type: "issue_reported", issue: safeIssue });
        return;
      }
      dispatchProject({
        type: "draft_replaced",
        project: response.project,
        projectSessionId: response.project_session_id,
        targetZoneId: response.target_zone_id,
        draft: response.draft,
      });
      dispatchResult({ type: "project_or_zone_changed" });
      dispatchResultExport({ type: "result_changed" });
      dispatchRun({ type: "project_changed" });
      dispatchPatch({ type: "apply_succeeded", requestId });
      dispatchAi({ type: "context_changed" });
      dispatchSimulation({ type: "context_changed" });
      setPlaceholderNotice(t("patch.draftAppliedSuccess", { revision: response.draft.revision_number }));
    } catch {
      if (!mounted.current) return;
      const issue = {
        code: "desktop_bridge_invoke_failed",
        message: "Desktop bridge invocation failed",
        source_line_number: null,
        context: {},
      };
      dispatchPatch({ type: "apply_failed", requestId, issue, invalidate: false });
      dispatchProject({ type: "issue_reported", issue });
    }
  }, [commandAvailability.patchApply, patchState.patchId, patchState.projectSessionId, t]);

  const createSimulationPlan = useCallback(async () => {
    if (
      simulationState.status === "executing" ||
      !projectState.projectSessionId ||
      !projectState.draft ||
      !currentZone ||
      !simulationState.goal.trim()
    ) return;
    const requestId = crypto.randomUUID();
    dispatchSimulation({ type: "plan_started", requestId });
    try {
      const response = await prepareSimulationPlan(
        requestId,
        projectState.projectSessionId,
        projectState.draft.revision_id,
        currentZone.zone_id,
        simulationState.goal,
      );
      if (!mounted.current) return;
      if (!isSafeSimulationPlan(response.plan) || response.request_id !== requestId || response.error) {
        dispatchSimulation({
          type: "plan_failed",
          requestId,
          issue: response.error ?? {
            code: "simulation_plan_invalid",
            message: "Simulation plan response invalid",
            source_line_number: null,
            context: {},
          },
        });
        return;
      }
      const plan = response.plan;
      if (
        plan.project_session_id !== projectState.projectSessionId ||
        plan.revision_id !== projectState.draft.revision_id ||
        (plan.status === "ready" && plan.zone_id !== currentZone.zone_id)
      ) {
        dispatchSimulation({
          type: "plan_failed",
          requestId,
          issue: {
            code: "simulation_context_stale",
            message: "Simulation plan context changed",
            source_line_number: null,
            context: {},
          },
        });
        return;
      }
      dispatchSimulation({ type: "plan_received", requestId, plan });
    } catch {
      if (!mounted.current) return;
      dispatchSimulation({
        type: "plan_failed",
        requestId,
        issue: {
          code: "desktop_bridge_invoke_failed",
          message: "Simulation plan invocation failed",
          source_line_number: null,
          context: {},
        },
      });
    }
  }, [currentZone, projectState.draft, projectState.projectSessionId, simulationState.goal, simulationState.status]);

  const approveAndRunSimulation = useCallback(async () => {
    const plan = simulationState.plan;
    if (
      simulationState.status !== "ready" ||
      plan?.status !== "ready" ||
      !projectState.projectSessionId ||
      !currentZone ||
      plan.project_session_id !== projectState.projectSessionId ||
      plan.revision_id !== projectState.draft?.revision_id ||
      plan.zone_id !== currentZone.zone_id
    ) return;
    const requestId = crypto.randomUUID();
    dispatchSimulation({ type: "execution_started", requestId });
    try {
      const response = await approveAndRunSimulationPlan(
        requestId,
        projectState.projectSessionId,
        plan.plan_id,
        currentZone.zone_id,
      );
      if (!mounted.current) return;
      if (!isSafeSimulationExecutionResponse(response, requestId)) {
        dispatchSimulation({
          type: "execution_finished",
          requestId,
          response: {
            request_id: requestId,
            status: "failed",
            timeline: simulationState.timeline.map((step, index) => index === 0 ? { ...step, status: "failed" } : step),
            execution: null,
            project_session_id: null,
            project: null,
            target_zone_id: null,
            draft: null,
            run: null,
            result: null,
            error: { code: "simulation_execution_invalid", message: "Simulation execution response invalid", source_line_number: null, context: {} },
          },
        });
        return;
      }
      if (
        response.project && response.draft && response.project_session_id === projectState.projectSessionId &&
        response.target_zone_id && response.project.zones.some((zone) => zone.zone_id === response.target_zone_id)
      ) {
        dispatchProject({
          type: "draft_replaced",
          project: response.project,
          projectSessionId: response.project_session_id,
          targetZoneId: response.target_zone_id,
          draft: response.draft,
        });
        dispatchPatch({ type: "project_or_zone_changed" });
        dispatchResult({ type: "project_or_zone_changed" });
        dispatchResultExport({ type: "result_changed" });
        dispatchRun({ type: "project_changed" });
        dispatchAi({ type: "context_changed" });
      }
      dispatchSimulation({ type: "execution_finished", requestId, response });
    } catch {
      if (!mounted.current) return;
      dispatchSimulation({
        type: "execution_finished",
        requestId,
        response: {
          request_id: requestId,
          status: "failed",
          timeline: simulationState.timeline.map((step, index) => index === 0 ? { ...step, status: "failed" } : step),
          execution: null,
          project_session_id: null,
          project: null,
          target_zone_id: null,
          draft: null,
          run: null,
          result: null,
          error: { code: "desktop_bridge_invoke_failed", message: "Simulation execution invocation failed", source_line_number: null, context: {} },
        },
      });
    }
  }, [currentZone, projectState.draft?.revision_id, projectState.projectSessionId, simulationState.plan, simulationState.status, simulationState.timeline]);

  const cancelAppClose = useCallback(async () => {
    if (!closeRequest || closeBusy) return;
    setCloseBusy(true);
    try {
      const response = await resolveAppClose(closeRequest.request_id, "cancel");
      if (isSafeCloseResolution(response, closeRequest.request_id) && response.status === "cancelled") {
        setCloseRequest(null);
      }
    } catch {
      setPlaceholderNotice(t("close.protocolUnavailable"));
    } finally {
      if (mounted.current) setCloseBusy(false);
    }
  }, [closeBusy, closeRequest, t]);

  const discardAndCloseApp = useCallback(async () => {
    if (!closeRequest || closeBusy) return;
    setCloseBusy(true);
    try {
      const response = await resolveAppClose(closeRequest.request_id, "discard_draft");
      if (isSafeCloseResolution(response, closeRequest.request_id) && response.close_started) {
        setCloseRequest(null);
      } else if (response.error_code) {
        setPlaceholderNotice(t("close.blocked"));
      }
    } catch {
      setPlaceholderNotice(t("close.protocolUnavailable"));
    } finally {
      if (mounted.current) setCloseBusy(false);
    }
  }, [closeBusy, closeRequest, t]);

  const exportAndCloseApp = useCallback(async () => {
    if (!closeRequest || closeBusy) return;
    setCloseBusy(true);
    try {
      const prepared = await resolveAppClose(closeRequest.request_id, "export_draft");
      if (!isSafeCloseResolution(prepared, closeRequest.request_id) || prepared.status !== "awaiting_draft_export") {
        setPlaceholderNotice(t("close.blocked"));
        return;
      }
      const exported = await exportDraft();
      const finished = await finishAppCloseDraftExport(closeRequest.request_id, exported);
      if (isSafeCloseResolution(finished, closeRequest.request_id) && finished.close_started) {
        setCloseRequest(null);
      } else if (finished.error_code) {
        setPlaceholderNotice(t("close.exportFailed"));
      }
    } catch {
      setPlaceholderNotice(t("close.protocolUnavailable"));
    } finally {
      if (mounted.current) setCloseBusy(false);
    }
  }, [closeBusy, closeRequest, exportDraft, t]);

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

  const toggleProject = () => {
    if (workbench.projectCollapsed) projectPanelRef.current?.expand();
    else projectPanelRef.current?.collapse();
    updateWorkbench({ projectCollapsed: !workbench.projectCollapsed });
  };

  const navigateDestination = useCallback((destination: Exclude<WorkbenchDestination, "settings">) => {
    if (!commandAvailability.navigation) return;
    setActiveDestination(destination);
    if (destination === "project" && workbench.projectCollapsed) projectPanelRef.current?.expand();
    if (destination === "project") updateWorkbench({ projectCollapsed: false });
    if (destination === "run") updateWorkbench({ bottomCollapsed: false, bottomTab: "logs" });
    if (destination === "results") updateWorkbench({ bottomCollapsed: false, bottomTab: "results" });
  }, [commandAvailability.navigation, projectPanelRef, updateWorkbench, workbench.projectCollapsed]);

  const selectZoneById = useCallback((zoneId: string) => {
    if (!commandAvailability.zoneSelect || !projectState.project) return;
    const zone = projectState.project.zones.find((candidate) => candidate.zone_id === zoneId);
    if (!zone) return;
    dispatchProject({ type: "zone_selected", zoneKey: zoneSelectionKey(projectState.project, zone) });
    dispatchPatch({ type: "project_or_zone_changed" });
    dispatchResult({ type: "project_or_zone_changed" });
    dispatchResultExport({ type: "result_changed" });
    dispatchAi({ type: "context_changed" });
    dispatchSimulation({ type: "context_changed" });
    setActiveDestination("project");
    void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
  }, [commandAvailability.zoneSelect, projectState.project]);

  const toggleContext = () => {
    if (workbench.contextCollapsed) contextPanelRef.current?.expand();
    else contextPanelRef.current?.collapse();
    updateWorkbench({ contextCollapsed: !workbench.contextCollapsed });
  };

  const toggleBottom = () => {
    if (workbench.bottomCollapsed) bottomPanelRef.current?.expand();
    else bottomPanelRef.current?.collapse();
    updateWorkbench({ bottomCollapsed: !workbench.bottomCollapsed });
  };

  const handleMainLayout = (layout: Layout) => {
    setWorkbench((current) => {
      const project = layout.project ?? 0;
      const context = layout.context ?? 0;
      const next: WorkbenchState = {
        ...current,
        projectSize: project > 0.1 ? project : current.projectSize,
        contextSize: context > 0.1 ? context : current.contextSize,
        projectCollapsed: project <= 0.1,
        contextCollapsed: context <= 0.1,
      };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  };

  const handleCenterLayout = (layout: Layout) => {
    setWorkbench((current) => {
      const bottom = layout.bottom ?? 0;
      const next: WorkbenchState = {
        ...current,
        bottomSize: bottom > 0.1 ? bottom : current.bottomSize,
        bottomCollapsed: bottom <= 0.1,
      };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  };

  return (
    <div className="app-shell">
      <TopBar
        language={workbench.language}
        theme={workbench.theme}
        onLanguageChange={(language: AppLanguage) => {
          if (!commandAvailability.language) return;
          updateWorkbench({ language });
          dispatchAi({ type: "context_changed" });
          dispatchSimulation({ type: "context_changed" });
          void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
        }}
        availability={commandAvailability}
        onThemeToggle={() =>
          updateWorkbench({ theme: workbench.theme === "light" ? "dark" : "light" })
        }
        onNewProject={() => {
          if (commandAvailability.newProject) showPlaceholder(t("toolbar.newProject"));
        }}
        onSettings={() => {
          if (commandAvailability.navigation) setActiveDestination("settings");
        }}
        onOpenProject={openProject}
        onRunProject={runProject}
        onUndoDraft={() => void switchDraft("undo")}
        onRedoDraft={() => void switchDraft("redo")}
        onExportDraft={() => void exportDraft()}
        onPlaceholder={showPlaceholder}
      />

      <div className="workbench-body">
        <ActivityBar
          projectCollapsed={workbench.projectCollapsed}
          activeDestination={activeDestination}
          navigationAvailable={commandAvailability.navigation}
          onToggleProject={toggleProject}
          onNavigate={navigateDestination}
        />

        <Group
          className="main-panels"
          orientation="horizontal"
          defaultLayout={initialMainLayout}
          onLayoutChanged={handleMainLayout}
        >
          <Panel
            id="project"
            panelRef={projectPanelRef}
            defaultSize={`${workbench.projectSize}%`}
            minSize="220px"
            maxSize="420px"
            collapsible
            collapsedSize="0px"
          >
            <ProjectSidebar
              projectState={projectState}
              selectedObject={selectedObject}
              selectedZoneKey={projectState.selectedZoneKey}
              availability={commandAvailability}
              onSelectObject={setSelectedObject}
              onSelectZone={(zone) =>
                selectZoneById(zone.zone_id)
              }
              onCollapse={toggleProject}
            />
          </Panel>
          <Separator className="resize-handle resize-handle-horizontal" />
          <Panel id="workspace" minSize="520px">
            <Group
              className="center-panels"
              orientation="vertical"
              defaultLayout={initialCenterLayout}
              onLayoutChanged={handleCenterLayout}
            >
              <Panel id="editor" minSize="360px">
                <WelcomePage
                  destination={activeDestination}
                  projectState={projectState}
                  contextCollapsed={workbench.contextCollapsed}
                  bottomCollapsed={workbench.bottomCollapsed}
                  onToggleContext={toggleContext}
                  onToggleBottom={toggleBottom}
                  onOpenProject={openProject}
                  onSelectZone={selectZoneById}
                  onRunProject={runProject}
                  onSettingsReset={() => setWorkbench(DEFAULT_WORKBENCH_STATE)}
                  availability={commandAvailability}
                  resultState={resultState}
                  resultExportState={resultExportState}
                  activeRunId={activeRunId}
                  theme={workbench.theme}
                  onLoadLatestResults={loadLatestRunResults}
                  onSelectManifestResults={selectRunManifestResults}
                  onExportResults={exportZoneResults}
                />
              </Panel>
              <Separator className="resize-handle resize-handle-vertical" />
              <Panel
                id="bottom"
                panelRef={bottomPanelRef}
                defaultSize={`${workbench.bottomSize}%`}
                minSize="150px"
                maxSize="360px"
                collapsible
                collapsedSize="0px"
              >
                <BottomPanel
                  activeTab={workbench.bottomTab}
                  projectState={projectState}
                  runState={runState}
                  onViewCurrentZoneResults={loadLatestRunResults}
                  viewRunResultsDisabled={!commandAvailability.loadActiveResult}
                  onTabChange={(bottomTab) => updateWorkbench({ bottomTab })}
                  onCollapse={toggleBottom}
                />
              </Panel>
            </Group>
          </Panel>
          <Separator className="resize-handle resize-handle-horizontal" />
          <Panel
            id="context"
            panelRef={contextPanelRef}
            defaultSize={`${workbench.contextSize}%`}
            minSize="250px"
            maxSize="440px"
            collapsible
            collapsedSize="0px"
          >
            <ContextSidebar
              activeTab={workbench.contextTab}
              project={projectState.project}
              selectedZone={currentZone}
              selectedObject={selectedObject}
              patchState={patchState}
              availability={commandAvailability}
              onStartVolumeEdit={startVolumeEdit}
              onVolumeTokenChange={(token) => {
                if (commandAvailability.patchInput) dispatchPatch({ type: "input_changed", token });
              }}
              onPlanVolumePatch={planVolumePatch}
              onCancelVolumeEdit={() => {
                if (commandAvailability.patchCancel) dispatchPatch({ type: "cancel" });
              }}
              onTabChange={(contextTab) => {
                if (commandAvailability.navigation) updateWorkbench({ contextTab });
              }}
              onCollapse={toggleContext}
              aiState={aiState}
              aiContextAvailable={Boolean(projectState.projectSessionId && projectState.draft && currentZone)}
              simulationState={simulationState}
              onAiModeChange={(mode) => dispatchSimulation({ type: "mode_changed", mode })}
              onSimulationGoalChange={(goal) => dispatchSimulation({ type: "goal_changed", goal })}
              onSimulationPlan={() => void createSimulationPlan()}
              onSimulationBack={() => dispatchSimulation({ type: "goal_changed", goal: simulationState.goal })}
              onSimulationCancel={() => dispatchSimulation({ type: "plan_cancelled" })}
              onSimulationApproveAndRun={() => void approveAndRunSimulation()}
              onAiConnect={() => void updateAiConnection(false)}
              onAiInstall={() => void installCodexCli()}
              onAiRefresh={() => void updateAiConnection(true)}
              onAiDisconnect={() => void disconnectAi()}
              onAiScopeToggle={toggleAiScope}
              onAiModelChange={changeAiModel}
              onAiEffortChange={changeAiEffort}
              onAiPreview={() => void previewContext()}
              onAiPreviewVisibilityToggle={() => dispatchAi({ type: "preview_visibility_toggled" })}
              onAiQuestionChange={(question) => dispatchAi({ type: "question_changed", question })}
              onAiSend={() => void sendAiQuestion()}
              onAiStop={() => void stopAiTurn()}
              onAiClear={() => void clearAiSession()}
              onAiArchiveEnabled={(enabled) => void changeAiArchivePersistence(enabled)}
              onAiArchiveDelete={(entryId) => void mutateAiArchive("delete", entryId)}
              onAiArchiveClearZone={() => void mutateAiArchive("clear_zone")}
              onAiArchiveClearAll={() => void mutateAiArchive("clear_all")}
            />
          </Panel>
        </Group>
      </div>

      <StatusBar theme={workbench.theme} projectState={projectState} runState={runState} aiState={aiState} />

      {placeholderNotice ? (
        <div className="placeholder-toast" role="status" aria-live="polite">
          <span>{placeholderNotice}</span>
          <button
            className="panel-icon-button"
            type="button"
            title={t("mock.dismiss")}
            aria-label={t("mock.dismiss")}
            onClick={() => setPlaceholderNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}

      {patchState.review && ["review", "applying"].includes(patchState.status) && projectState.project ? (
        <ZoneVolumePatchDialog
          projectFileName={projectState.project.source_path.split(/[\\/]/).at(-1) ?? projectState.project.source_path}
          review={patchState.review}
          availability={commandAvailability}
          issueCode={patchState.issue?.code ?? null}
          onBack={() => {
            if (commandAvailability.patchBack) dispatchPatch({ type: "return_to_edit" });
          }}
          onCancel={() => {
            if (commandAvailability.patchCancel) dispatchPatch({ type: "cancel" });
          }}
          onApply={applyVolumePatch}
        />
      ) : null}

      {draftGuardOpen && projectState.draft?.dirty && !projectState.draft.exported ? (
        <DraftSwitchDialog
          busy={draftGuardBusy}
          onCancel={() => setDraftGuardOpen(false)}
          onExport={exportDraftAndOpen}
          onDiscard={discardDraftAndOpen}
        />
      ) : null}

      {closeRequest ? (
        <AppCloseDialog
          request={closeRequest}
          busy={closeBusy}
          onCancel={() => void cancelAppClose()}
          onDiscard={() => void discardAndCloseApp()}
          onExport={() => void exportAndCloseApp()}
        />
      ) : null}
    </div>
  );
}

export default App;
