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
import i18n from "../i18n";
import {
  applyZoneVolumePatchToDraft,
  exportActiveProjectDraftCopy,
  exportActiveZoneAirStateCsv,
  extractActiveRunZoneAirState,
  planZoneVolumePatch,
  redoProjectDraft,
  selectAndReadPrjZones,
  selectAndExtractZoneAirState,
  runActiveContamProject,
  connectCodexAppServer,
  probeCodexAppServer,
  refreshCodexAccount,
  previewAiContext,
  startReadonlyAiTurn,
  interruptReadonlyAiTurn,
  installOfficialCodexCli,
  clearReadonlyAiSession,
  clearAiConversationArchiveForZone,
  clearAllAiConversationArchive,
  deleteAiConversationArchiveEntry,
  disconnectCodexAppServer,
  loadAiConversationArchive,
  setAiConversationArchiveEnabled,
  undoProjectDraft,
} from "./desktop-api";
import {
  aiReducer,
  INITIAL_AI_STATE,
  isSafeAiArchive,
  isSafeAiArchiveSave,
  isSafeAiPreview,
  isStructuredAiAnswer,
  type AiContextScope,
} from "./ai-state";
import {
  applyResponseIssue,
  INITIAL_PATCH_STATE,
  patchReducer,
  patchResponseIssue,
} from "./patch-state";
import { deriveCommandAvailability } from "./command-availability";
import {
  desktopOpenIssue,
  isDraftExportSummaryValid,
  isDraftSummaryValid,
  isSafeProjectInspection,
  envelopeIssue,
  INITIAL_PROJECT_STATE,
  projectReducer,
  selectedZone,
  zoneSelectionKey,
} from "./project-state";
import {
  INITIAL_RESULT_STATE,
  resultReducer,
  resultResponseIssue,
  ZONE_RESULT_STAGE_EVENT,
  type ZoneResultStageEvent,
  type ResultLoadSource,
} from "./result-state";
import {
  INITIAL_RESULT_EXPORT_STATE,
  RESULT_EXPORT_STAGE_EVENT,
  resultExportReducer,
  resultExportResponseIssue,
  type ResultExportStageEvent,
} from "./result-export-state";
import { INITIAL_RUN_STATE, runReducer, runResponseIssue } from "./run-state";
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
  const [placeholderNotice, setPlaceholderNotice] = useState<string | null>(null);
  const [draftGuardOpen, setDraftGuardOpen] = useState(false);
  const [draftGuardBusy, setDraftGuardBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const requestSequence = useRef(0);
  const resultSequence = useRef(0);
  const resultExportSequence = useRef(0);
  const runSequence = useRef(0);
  const aiSequence = useRef(0);
  const aiArchiveSequence = useRef(0);
  const cliProbeStarted = useRef(false);
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
      requestSequence.current += 1;
      resultSequence.current += 1;
      resultExportSequence.current += 1;
      runSequence.current += 1;
      aiSequence.current += 1;
      aiArchiveSequence.current += 1;
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
    draftBusy,
  });
  const patchLocked = patchState.status === "review" || patchState.status === "applying";

  const openProjectNow = useCallback(async () => {
    if (!commandAvailability.openProject) return;
    const sequence = ++requestSequence.current;
    dispatchProject({ type: "selection_started", sequence });
    const requestId = crypto.randomUUID();
    dispatchProject({ type: "loading_started", sequence, requestId });
    try {
      const response = await selectAndReadPrjZones(requestId);
      if (!mounted.current || sequence !== requestSequence.current) return;
      const desktopIssue = desktopOpenIssue(response, requestId);
      if (desktopIssue) {
        dispatchProject({
          type: "loading_failed",
          sequence,
          requestId,
          issue: desktopIssue,
        });
        return;
      }
      if (response.cancelled) {
        dispatchProject({ type: "selection_cancelled", sequence });
        return;
      }
      const envelope = response.envelope;
      if (!envelope) return;
      const issue = envelopeIssue(envelope, requestId);
      if (issue || !envelope.result) {
        dispatchProject({
          type: "loading_failed",
          sequence,
          requestId,
          issue: issue ?? {
            code: "python_response_contract_invalid",
            message: "Bridge response contract invalid",
            source_line_number: null,
            context: {},
          },
        });
        return;
      }
      dispatchProject({
        type: "loading_succeeded",
        sequence,
        requestId,
        project: envelope.result,
        projectSessionId: response.project_session_id as string,
        draft: response.draft!,
      });
      dispatchPatch({ type: "project_or_zone_changed" });
      dispatchResult({ type: "project_or_zone_changed" });
      dispatchResultExport({ type: "result_changed" });
      dispatchRun({ type: "project_changed" });
      dispatchAi({ type: "context_changed" });
      setActiveDestination("project");
    } catch {
      if (!mounted.current || sequence !== requestSequence.current) return;
      dispatchProject({
        type: "loading_failed",
        sequence,
        requestId,
        issue: {
          code: "desktop_bridge_invoke_failed",
          message: "Desktop bridge invocation failed",
          source_line_number: null,
          context: {},
        },
      });
    }
  }, [commandAvailability.openProject]);

  const openProject = useCallback(async () => {
    if (!commandAvailability.openProject) return;
    if (projectState.draft?.dirty && !projectState.draft.exported) {
      setDraftGuardOpen(true);
      return;
    }
    await openProjectNow();
  }, [commandAvailability.openProject, openProjectNow, projectState.draft]);

  const refreshAiArchive = useCallback(async () => {
    if (!projectState.projectSessionId || !projectState.draft || !currentZone) return;
    const sequence = ++aiArchiveSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "archive_loading", requestId });
    try {
      const response = await loadAiConversationArchive(
        requestId,
        projectState.projectSessionId,
        projectState.draft.revision_id,
        currentZone.zone_id,
      );
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      if (
        response.request_id !== requestId
        || response.error
        || !response.archive
        || !isSafeAiArchive(response.archive)
        || response.archive.entries.some((entry) => entry.zone_id !== currentZone.zone_id)
      ) {
        dispatchAi({
          type: "archive_failed",
          requestId,
          issue: response.error ?? { code: "ai_conversation_archive_invalid", message: "AI archive response invalid." },
        });
        return;
      }
      dispatchAi({ type: "archive_loaded", requestId, archive: response.archive });
    } catch {
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      dispatchAi({
        type: "archive_failed",
        requestId,
        issue: { code: "ai_conversation_archive_unavailable", message: "AI archive could not be loaded." },
      });
    }
  }, [currentZone, projectState.draft, projectState.projectSessionId]);

  useEffect(() => {
    void refreshAiArchive();
  }, [refreshAiArchive]);

  const loadZoneResults = useCallback(async (source: ResultLoadSource) => {
    const available = source === "active_run"
      ? commandAvailability.loadActiveResult
      : commandAvailability.selectManifest;
    if (!available || !projectState.projectSessionId || !currentZone) return;
    const sequence = ++resultSequence.current;
    const requestId = crypto.randomUUID();
    dispatchResult({
      type: source === "active_run" ? "active_run_started" : "selection_started",
      sequence,
      requestId,
      projectSessionId: projectState.projectSessionId,
      zoneId: currentZone.zone_id,
      zoneNumber: currentZone.contam_number,
    });
    try {
      const response = await (source === "active_run"
        ? extractActiveRunZoneAirState
        : selectAndExtractZoneAirState)(
          requestId,
          projectState.projectSessionId,
          currentZone.zone_id,
        );
      if (!mounted.current || sequence !== resultSequence.current) return;
      if (response.cancelled) {
        dispatchResult({ type: "load_cancelled", sequence, requestId });
        return;
      }
      const issue = resultResponseIssue(response, requestId);
      const expectedActiveRunId =
        source === "active_run" && runState.projectSessionId === projectState.projectSessionId
          ? runState.summary?.run_id ?? null
          : null;
      if (
        issue ||
        !response.result ||
        response.project_session_id !== projectState.projectSessionId ||
        response.result.zone_id !== currentZone.zone_id ||
        (source === "active_run" && response.result.run_id !== expectedActiveRunId)
      ) {
        dispatchResult({
          type: "load_failed",
          sequence,
          requestId,
          issue: issue ?? {
            code: "python_response_result_invalid",
            message: "Result did not match the active project.",
            source_line_number: null,
            context: {},
          },
        });
        return;
      }
      dispatchResult({
        type: "load_succeeded",
        sequence,
        requestId,
        projectSessionId: projectState.projectSessionId,
        result: response.result,
      });
      dispatchResultExport({ type: "result_changed" });
      dispatchAi({ type: "context_changed" });
    } catch {
      if (!mounted.current || sequence !== resultSequence.current) return;
      dispatchResult({
        type: "load_failed",
        sequence,
        requestId,
        issue: {
          code: "desktop_bridge_invoke_failed",
          message: "Desktop result bridge invocation failed",
          source_line_number: null,
          context: {},
        },
      });
    }
  }, [commandAvailability.loadActiveResult, commandAvailability.selectManifest, currentZone, projectState.projectSessionId, runState.projectSessionId, runState.summary]);

  const loadLatestRunResults = useCallback(
    () => loadZoneResults("active_run"),
    [loadZoneResults],
  );
  const selectRunManifestResults = useCallback(
    () => loadZoneResults("selected_manifest"),
    [loadZoneResults],
  );

  const exportZoneResults = useCallback(async () => {
    const result = resultState.result;
    if (!commandAvailability.exportResult || !projectState.projectSessionId || !currentZone || !result) return;
    const sequence = ++resultExportSequence.current;
    const requestId = crypto.randomUUID();
    dispatchResultExport({
      type: "selection_started",
      sequence,
      requestId,
      projectSessionId: projectState.projectSessionId,
      zoneId: currentZone.zone_id,
      zoneNumber: currentZone.contam_number,
      runId: result.run_id,
      extractionId: result.extraction_id,
    });
    try {
      const response = await exportActiveZoneAirStateCsv(
        requestId,
        projectState.projectSessionId,
        currentZone.zone_id,
        result.run_id,
        result.extraction_id,
      );
      if (!mounted.current || sequence !== resultExportSequence.current) return;
      if (response.cancelled) {
        dispatchResultExport({ type: "export_cancelled", sequence, requestId });
        return;
      }
      const issue = resultExportResponseIssue(response, requestId);
      const summary = response.export;
      if (
        issue
        || !summary
        || response.project_session_id !== projectState.projectSessionId
        || summary.zone_id !== currentZone.zone_id
        || summary.zone_number !== currentZone.contam_number
        || summary.run_id !== result.run_id
        || summary.extraction_id !== result.extraction_id
        || summary.row_count !== result.sample_count
        || summary.byte_count <= 0
        || summary.file_name.includes("/")
        || summary.file_name.includes("\\")
      ) {
        dispatchResultExport({
          type: "export_failed",
          sequence,
          requestId,
          issue: issue ?? {
            code: "export_response_contract_invalid",
            message: "CSV export response did not match the active result.",
            source_line_number: null,
            context: {},
          },
        });
        return;
      }
      dispatchResultExport({
        type: "export_succeeded",
        sequence,
        requestId,
        projectSessionId: projectState.projectSessionId,
        summary,
      });
    } catch {
      if (!mounted.current || sequence !== resultExportSequence.current) return;
      dispatchResultExport({
        type: "export_failed",
        sequence,
        requestId,
        issue: {
          code: "desktop_bridge_invoke_failed",
          message: "Desktop CSV export invocation failed",
          source_line_number: null,
          context: {},
        },
      });
    }
  }, [commandAvailability.exportResult, currentZone, projectState.projectSessionId, resultState.result]);

  const startVolumeEdit = useCallback(() => {
    if (!commandAvailability.startEditing || !currentZone || !projectState.projectSessionId) return;
    dispatchPatch({
      type: "start_editing",
      projectSessionId: projectState.projectSessionId,
      zoneId: currentZone.zone_id,
      token: String(currentZone.volume_m3),
    });
  }, [commandAvailability.startEditing, currentZone, projectState.projectSessionId]);

  const runProject = useCallback(async () => {
    if (!commandAvailability.runProject || !projectState.projectSessionId || !projectState.project) return;
    const sequence = ++runSequence.current;
    const requestId = crypto.randomUUID();
    dispatchRun({
      type: "run_started",
      sequence,
      requestId,
      projectSessionId: projectState.projectSessionId,
    });
    bottomPanelRef.current?.expand();
    updateWorkbench({ bottomCollapsed: false, bottomTab: "logs" });
    try {
      const response = await runActiveContamProject(requestId, projectState.projectSessionId);
      if (!mounted.current || sequence !== runSequence.current) return;
      const issue = runResponseIssue(response, requestId);
      if (
        issue ||
        !response.summary ||
        response.project_session_id !== projectState.projectSessionId
      ) {
        dispatchRun({
          type: "run_failed",
          sequence,
          requestId,
          issue: issue ?? {
            code: "run_response_contract_invalid",
            message: "Run response did not match the active project.",
            source_line_number: null,
            context: {},
          },
        });
        return;
      }
      dispatchRun({
        type: "run_succeeded",
        sequence,
        requestId,
        projectSessionId: projectState.projectSessionId,
        summary: response.summary,
      });
      dispatchAi({ type: "context_changed" });
    } catch {
      if (!mounted.current || sequence !== runSequence.current) return;
      dispatchRun({
        type: "run_failed",
        sequence,
        requestId,
        issue: {
          code: "desktop_bridge_invoke_failed",
          message: "Desktop run bridge invocation failed",
          source_line_number: null,
          context: {},
        },
      });
    }
  }, [commandAvailability.runProject, projectState.project, projectState.projectSessionId, updateWorkbench]);

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

  const switchDraft = useCallback(async (direction: "undo" | "redo") => {
    const available = direction === "undo" ? commandAvailability.undoDraft : commandAvailability.redoDraft;
    if (!available || !projectState.projectSessionId || draftBusy) return;
    const requestId = crypto.randomUUID();
    setDraftBusy(true);
    dispatchProject({ type: "issue_cleared" });
    try {
      const response = await (direction === "undo" ? undoProjectDraft : redoProjectDraft)(
        requestId,
        projectState.projectSessionId,
      );
      if (!mounted.current) return;
      if (response.request_id !== requestId || response.error || !response.project || !isSafeProjectInspection(response.project) || !response.draft || !isDraftSummaryValid(response.draft) || response.project_session_id !== projectState.projectSessionId) {
        dispatchProject({
          type: "issue_reported",
          issue: response.error ?? { code: "draft_identity_mismatch", message: "Draft transition response invalid", source_line_number: null, context: {} },
        });
        return;
      }
      const targetZoneId = currentZone && response.project.zones.some((zone) => zone.zone_id === currentZone.zone_id)
        ? currentZone.zone_id
        : response.project.zones[0]?.zone_id ?? "";
      dispatchProject({ type: "draft_replaced", project: response.project, projectSessionId: response.project_session_id, targetZoneId, draft: response.draft });
      dispatchPatch({ type: "project_or_zone_changed" });
      dispatchRun({ type: "project_changed" });
      dispatchResult({ type: "project_or_zone_changed" });
      dispatchResultExport({ type: "result_changed" });
      dispatchAi({ type: "context_changed" });
      setPlaceholderNotice(t(direction === "undo" ? "draft.undoSuccess" : "draft.redoSuccess", { revision: response.draft.revision_number }));
    } catch {
      if (mounted.current) dispatchProject({ type: "issue_reported", issue: { code: "desktop_bridge_invoke_failed", message: "Draft transition failed", source_line_number: null, context: {} } });
    } finally {
      if (mounted.current) setDraftBusy(false);
    }
  }, [commandAvailability.redoDraft, commandAvailability.undoDraft, currentZone, draftBusy, projectState.projectSessionId, t]);

  const exportDraft = useCallback(async (): Promise<boolean> => {
    if (!commandAvailability.exportDraft || !projectState.projectSessionId || !projectState.draft || draftBusy) return false;
    const requestId = crypto.randomUUID();
    setDraftBusy(true);
    dispatchProject({ type: "issue_cleared" });
    try {
      const response = await exportActiveProjectDraftCopy(requestId, projectState.projectSessionId, projectState.draft.revision_id);
      if (!mounted.current) return false;
      if (response.cancelled) {
        setPlaceholderNotice(t("draft.exportCancelled"));
        return false;
      } else if (response.error || !response.export || !isDraftExportSummaryValid(response.export) || response.project_session_id !== projectState.projectSessionId) {
        dispatchProject({ type: "issue_reported", issue: response.error ?? { code: "draft_export_verification_failed", message: "Draft export response invalid", source_line_number: null, context: {} } });
        return false;
      } else {
        dispatchProject({ type: "draft_exported", revisionId: projectState.draft.revision_id });
        setPlaceholderNotice(t("draft.exportSuccess", { file: response.export.file_name }));
        return true;
      }
    } catch {
      if (mounted.current) dispatchProject({ type: "issue_reported", issue: { code: "desktop_bridge_invoke_failed", message: "Draft export failed", source_line_number: null, context: {} } });
      return false;
    } finally {
      if (mounted.current) setDraftBusy(false);
    }
  }, [commandAvailability.exportDraft, draftBusy, projectState.draft, projectState.projectSessionId, t]);

  const exportDraftAndOpen = useCallback(async () => {
    if (draftGuardBusy) return;
    setDraftGuardBusy(true);
    try {
      if (await exportDraft()) {
        setDraftGuardOpen(false);
        await openProjectNow();
      }
    } finally {
      if (mounted.current) setDraftGuardBusy(false);
    }
  }, [draftGuardBusy, exportDraft, openProjectNow]);

  const discardDraftAndOpen = useCallback(async () => {
    if (draftGuardBusy) return;
    setDraftGuardOpen(false);
    await openProjectNow();
  }, [draftGuardBusy, openProjectNow]);

  const clearAiSession = useCallback(async () => {
    aiSequence.current += 1;
    dispatchAi({ type: "session_cleared" });
    try {
      await clearReadonlyAiSession(crypto.randomUUID());
    } catch {
      // The trusted Rust context still invalidates on project and revision changes.
    }
  }, []);

  const changeAiArchivePersistence = useCallback(async (enabled: boolean) => {
    if (patchLocked) return;
    const sequence = ++aiArchiveSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "archive_loading", requestId });
    try {
      const response = await setAiConversationArchiveEnabled(requestId, enabled);
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      if (response.request_id !== requestId || response.error || response.status !== (enabled ? "enabled" : "disabled")) {
        dispatchAi({
          type: "archive_failed",
          requestId,
          issue: response.error ?? { code: "ai_archive_write_failed", message: "AI archive preference response invalid." },
        });
        return;
      }
      dispatchAi({ type: "archive_persistence_changed", enabled });
      void refreshAiArchive();
    } catch {
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      dispatchAi({
        type: "archive_failed",
        requestId,
        issue: { code: "ai_archive_write_failed", message: "AI archive preference could not be saved." },
      });
    }
  }, [patchLocked, refreshAiArchive]);

  const mutateAiArchive = useCallback(async (
    action: "delete" | "clear_zone" | "clear_all",
    archiveEntryId?: string,
  ) => {
    if (patchLocked) return;
    if (!projectState.projectSessionId || !projectState.draft || !currentZone) return;
    const sequence = ++aiArchiveSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "archive_loading", requestId });
    try {
      const response = action === "delete"
        ? await deleteAiConversationArchiveEntry(
          requestId,
          projectState.projectSessionId,
          projectState.draft.revision_id,
          currentZone.zone_id,
          archiveEntryId ?? "",
        )
        : action === "clear_zone"
          ? await clearAiConversationArchiveForZone(
            requestId,
            projectState.projectSessionId,
            projectState.draft.revision_id,
            currentZone.zone_id,
          )
          : await clearAllAiConversationArchive(requestId);
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      const expectedStatus = action === "delete" ? "deleted" : action === "clear_zone" ? "cleared_zone" : "cleared_all";
      if (response.request_id !== requestId || response.error || response.status !== expectedStatus) {
        dispatchAi({
          type: "archive_failed",
          requestId,
          issue: response.error ?? { code: "ai_archive_write_failed", message: "AI archive update response invalid." },
        });
        return;
      }
      void refreshAiArchive();
    } catch {
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      dispatchAi({
        type: "archive_failed",
        requestId,
        issue: { code: "ai_archive_write_failed", message: "AI archive could not be updated." },
      });
    }
  }, [currentZone, patchLocked, projectState.draft, projectState.projectSessionId, refreshAiArchive]);

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      if (cliProbeStarted.current) return;
      cliProbeStarted.current = true;
      const sequence = ++aiSequence.current;
      const requestId = crypto.randomUUID();
      dispatchAi({ type: "probe_started", requestId });
      void probeCodexAppServer(requestId)
        .then((response) => {
          if (disposed || !mounted.current || sequence !== aiSequence.current) return;
          if (response.request_id !== requestId) {
            dispatchAi({
              type: "operation_failed",
              requestId,
              issue: { code: "codex_cli_probe_failed", message: "Codex CLI probe response invalid." },
            });
          } else if (response.probe?.found && response.probe.version) {
            dispatchAi({ type: "probe_succeeded", requestId, probe: response.probe });
          } else if (response.error?.code === "codex_cli_not_found") {
            dispatchAi({ type: "probe_unavailable", requestId });
          } else {
            dispatchAi({
              type: "operation_failed",
              requestId,
              issue: response.error ?? { code: "codex_cli_probe_failed", message: "Codex CLI probe response invalid." },
            });
          }
        })
        .catch(() => {
          if (disposed || !mounted.current || sequence !== aiSequence.current) return;
          dispatchAi({
            type: "operation_failed",
            requestId,
            issue: { code: "codex_cli_probe_failed", message: "Codex CLI probe failed." },
          });
        });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, []);

  const updateAiConnection = useCallback(async (refresh = false) => {
    if (patchLocked) return;
    const sequence = ++aiSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "connect_started", requestId });
    try {
      const response = await (refresh ? refreshCodexAccount : connectCodexAppServer)(requestId);
      if (!mounted.current || sequence !== aiSequence.current) return;
      if (response.request_id !== requestId || response.error || !response.connection) {
        dispatchAi({
          type: "operation_failed",
          requestId,
          issue: response.error ?? { code: "codex_app_server_initialization_failed", message: "Codex connection response invalid." },
        });
        return;
      }
      dispatchAi({ type: "connect_succeeded", requestId, connection: response.connection });
    } catch {
      if (!mounted.current || sequence !== aiSequence.current) return;
      dispatchAi({ type: "operation_failed", requestId, issue: { code: "codex_app_server_start_failed", message: "Codex connection failed." } });
    }
  }, [patchLocked]);

  const installCodexCli = useCallback(async () => {
    if (patchLocked) return;
    const sequence = ++aiSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "install_started", requestId });
    try {
      const response = await installOfficialCodexCli(requestId);
      if (!mounted.current || sequence !== aiSequence.current) return;
      if (
        response.request_id !== requestId
        || response.error
        || !["installed", "already_available"].includes(response.status)
        || !response.probe?.found
        || !response.probe.version
      ) {
        dispatchAi({
          type: "operation_failed",
          requestId,
          issue: response.error ?? { code: "codex_cli_install_verification_failed", message: "Codex CLI installation response invalid." },
        });
        return;
      }
      dispatchAi({ type: "install_succeeded", requestId, probe: response.probe });
    } catch {
      if (!mounted.current || sequence !== aiSequence.current) return;
      dispatchAi({ type: "operation_failed", requestId, issue: { code: "codex_cli_install_failed", message: "Codex CLI installation failed." } });
    }
  }, [patchLocked]);

  const disconnectAi = useCallback(async () => {
    if (patchLocked) return;
    aiSequence.current += 1;
    try {
      await disconnectCodexAppServer(crypto.randomUUID());
    } finally {
      if (mounted.current) dispatchAi({ type: "disconnected" });
    }
  }, [patchLocked]);

  const toggleAiScope = useCallback((scope: AiContextScope) => {
    if (patchLocked) return;
    dispatchAi({ type: "scope_toggled", scope });
    void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
  }, [patchLocked]);

  const changeAiModel = useCallback((modelId: string) => {
    if (patchLocked) return;
    const model = aiState.connection?.models.find((item) => item.id === modelId && item.available);
    if (!model) return;
    dispatchAi({ type: "model_changed", modelId, effort: model.default_reasoning_effort });
    void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
  }, [aiState.connection?.models, patchLocked]);

  const changeAiEffort = useCallback((effort: string) => {
    if (patchLocked) return;
    const model = aiState.connection?.models.find((item) => item.id === aiState.modelId);
    if (!model?.reasoning_efforts.some((item) => item.id === effort)) return;
    dispatchAi({ type: "effort_changed", effort });
    void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
  }, [aiState.connection?.models, aiState.modelId, patchLocked]);

  const previewContext = useCallback(async () => {
    if (patchLocked) return;
    if (!projectState.projectSessionId || !projectState.draft || !currentZone || !aiState.modelId || !aiState.reasoningEffort) return;
    const sequence = ++aiSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "preview_started", requestId });
    try {
      const response = await previewAiContext(
        requestId,
        projectState.projectSessionId,
        projectState.draft.revision_id,
        currentZone.zone_id,
        aiState.scopes,
        workbench.language,
        aiState.modelId,
        aiState.reasoningEffort,
      );
      if (!mounted.current || sequence !== aiSequence.current) return;
      if (
        response.request_id !== requestId
        || response.error
        || !response.preview
        || response.preview.project_session_id !== projectState.projectSessionId
        || response.preview.revision_id !== projectState.draft.revision_id
        || response.preview.zone_id !== currentZone.zone_id
        || !isSafeAiPreview(response.preview)
      ) {
        dispatchAi({ type: "operation_failed", requestId, issue: response.error ?? { code: "ai_context_unavailable", message: "AI context preview invalid." } });
        return;
      }
      dispatchAi({ type: "preview_succeeded", requestId, preview: response.preview });
    } catch {
      if (!mounted.current || sequence !== aiSequence.current) return;
      dispatchAi({ type: "operation_failed", requestId, issue: { code: "ai_context_unavailable", message: "AI context preview failed." } });
    }
  }, [aiState.modelId, aiState.reasoningEffort, aiState.scopes, currentZone, patchLocked, projectState.draft, projectState.projectSessionId, workbench.language]);

  const sendAiQuestion = useCallback(async () => {
    if (patchLocked) return;
    if (!projectState.projectSessionId || !projectState.draft || !currentZone || !aiState.preview || !aiState.question.trim()) return;
    const sequence = ++aiSequence.current;
    const requestId = crypto.randomUUID();
    const question = aiState.question.trim();
    dispatchAi({ type: "turn_started", requestId, question });
    try {
      const response = await startReadonlyAiTurn(
        requestId,
        projectState.projectSessionId,
        projectState.draft.revision_id,
        currentZone.zone_id,
        aiState.preview.preview_id,
        question,
        aiState.scopes,
        workbench.language,
        aiState.modelId,
        aiState.reasoningEffort,
      );
      if (!mounted.current || sequence !== aiSequence.current) return;
      if (response.request_id === requestId && response.error?.code === "ai_turn_interrupted") {
        dispatchAi({ type: "turn_interrupted" });
        return;
      }
      if (
        response.request_id !== requestId
        || response.error
        || response.status !== "completed"
        || !response.answer
        || !isStructuredAiAnswer(response.answer)
        || !isSafeAiArchiveSave(response.archive)
      ) {
        dispatchAi({ type: "operation_failed", requestId, issue: response.error ?? { code: "ai_response_contract_invalid", message: "AI answer contract invalid." } });
        return;
      }
      dispatchAi({ type: "turn_succeeded", requestId, answer: response.answer, archive: response.archive });
      if (response.archive.saved) void refreshAiArchive();
    } catch {
      if (!mounted.current || sequence !== aiSequence.current) return;
      dispatchAi({ type: "operation_failed", requestId, issue: { code: "codex_app_server_disconnected", message: "AI turn failed." } });
    }
  }, [aiState.modelId, aiState.preview, aiState.question, aiState.reasoningEffort, aiState.scopes, currentZone, patchLocked, projectState.draft, projectState.projectSessionId, refreshAiArchive, workbench.language]);

  const stopAiTurn = useCallback(async () => {
    if (patchLocked) return;
    aiSequence.current += 1;
    dispatchAi({ type: "interrupt_started" });
    try {
      const response = await interruptReadonlyAiTurn(crypto.randomUUID());
      if (!mounted.current) return;
      if (response.error) {
        dispatchAi({ type: "operation_failed", requestId: null, issue: response.error });
      } else {
        dispatchAi({ type: "turn_interrupted" });
      }
    } catch {
      if (mounted.current) dispatchAi({ type: "operation_failed", requestId: null, issue: { code: "codex_app_server_disconnected", message: "AI interrupt failed." } });
    }
  }, [patchLocked]);

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
    </div>
  );
}

export default App;
