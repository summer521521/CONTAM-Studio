import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject } from "react";
import {
  clearAiConversationArchiveForZone,
  clearAllAiConversationArchive,
  clearReadonlyAiSession,
  connectCodexAppServer,
  cancelAiProviderLogin,
  deleteAiConversationArchiveEntry,
  disconnectCodexAppServer,
  installOfficialCodexCli,
  interruptReadonlyAiTurn,
  loadAiConversationArchive,
  previewAiContext,
  probeCodexAppServer,
  refreshCodexAccount,
  listAiProviderProfiles,
  logoutAiProvider,
  refreshAiProviderModels as refreshAiProviderModelsCommand,
  saveAiProviderProfile as saveAiProviderProfileCommand,
  deleteAiProviderProfile as deleteAiProviderProfileCommand,
  setAiProviderSecret,
  deleteAiProviderSecret,
  setAiConversationArchiveEnabled,
  startAiProviderLogin,
  startReadonlyAiTurn,
  testAiProviderConnection,
} from "../desktop-api";
import {
  isSafeAiArchive,
  isSafeAiArchiveSave,
  isSafeAiPreview,
  isStructuredAiAnswer,
  type AiAction,
  type AiContextScope,
  type AiProviderProfile,
  type AiState,
} from "../ai-state";
import type { ProjectState, ZoneRecord } from "../project-state";

interface AiControllerOptions {
  aiState: AiState;
  projectState: ProjectState;
  currentZone: ZoneRecord | null;
  language: string;
  patchLocked: boolean;
  mounted: MutableRefObject<boolean>;
  dispatchAi: Dispatch<AiAction>;
}

export function useAiController({
  aiState,
  projectState,
  currentZone,
  language,
  patchLocked,
  mounted,
  dispatchAi,
}: AiControllerOptions) {
  const aiSequence = useRef(0);
  const aiArchiveSequence = useRef(0);
  const cliProbeStarted = useRef(false);
  const providerProfilesStarted = useRef(false);

  const selectedProvider = aiState.providerProfiles.find((profile) => profile.profile_id === aiState.providerProfileId) ?? null;
  const isCodexProvider = selectedProvider?.protocol === "codex_app_server";

  useEffect(() => {
    if (providerProfilesStarted.current) return;
    providerProfilesStarted.current = true;
    const requestId = crypto.randomUUID();
    void listAiProviderProfiles(requestId)
      .then((response) => {
        if (!mounted.current || response.request_id !== requestId || response.error) {
          dispatchAi({ type: "provider_operation_failed", issue: response.error ?? { code: "ai_provider_profile_store_unavailable", message: "Provider profiles could not be loaded." } });
          return;
        }
        dispatchAi({ type: "providers_loaded", profiles: response.profiles });
      })
      .catch(() => {
        if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_profile_store_unavailable", message: "Provider profiles could not be loaded." } });
      });
  }, [dispatchAi, mounted]);

  useEffect(() => {
    if (!aiState.providerLogin || !isCodexProvider) return undefined;
    const timer = window.setInterval(() => {
      void updateAiConnection(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [aiState.providerLogin, isCodexProvider]);

  const refreshAiArchive = useCallback(async () => {
    if (!projectState.projectSessionId || !projectState.draft || !currentZone) return;
    const sequence = ++aiArchiveSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "archive_loading", requestId });
    try {
      const response = await loadAiConversationArchive(requestId, projectState.projectSessionId, projectState.draft.revision_id, currentZone.zone_id);
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      if (response.request_id !== requestId || response.error || !response.archive || !isSafeAiArchive(response.archive) || response.archive.entries.some((entry) => entry.zone_id !== currentZone.zone_id)) {
        dispatchAi({ type: "archive_failed", requestId, issue: response.error ?? { code: "ai_conversation_archive_invalid", message: "AI archive response invalid." } });
        return;
      }
      dispatchAi({ type: "archive_loaded", requestId, archive: response.archive });
    } catch {
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      dispatchAi({ type: "archive_failed", requestId, issue: { code: "ai_conversation_archive_unavailable", message: "AI archive could not be loaded." } });
    }
  }, [currentZone, dispatchAi, mounted, projectState.draft, projectState.projectSessionId]);

  useEffect(() => {
    void refreshAiArchive();
  }, [refreshAiArchive]);

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
            dispatchAi({ type: "operation_failed", requestId, issue: { code: "codex_cli_probe_failed", message: "Codex CLI probe response invalid." } });
          } else if (response.probe?.found && response.probe.version) {
            dispatchAi({ type: "probe_succeeded", requestId, probe: response.probe });
          } else if (response.error?.code === "codex_cli_not_found") {
            dispatchAi({ type: "probe_unavailable", requestId });
          } else {
            dispatchAi({ type: "operation_failed", requestId, issue: response.error ?? { code: "codex_cli_probe_failed", message: "Codex CLI probe response invalid." } });
          }
        })
        .catch(() => {
          if (disposed || !mounted.current || sequence !== aiSequence.current) return;
          dispatchAi({ type: "operation_failed", requestId, issue: { code: "codex_cli_probe_failed", message: "Codex CLI probe failed." } });
        });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [dispatchAi, mounted]);

  const clearAiSession = useCallback(async () => {
    aiSequence.current += 1;
    dispatchAi({ type: "session_cleared" });
    try {
      await clearReadonlyAiSession(crypto.randomUUID());
    } catch {
      // Rust invalidates the trusted context on project and revision changes.
    }
  }, [dispatchAi]);

  const changeAiArchivePersistence = useCallback(async (enabled: boolean) => {
    if (patchLocked) return;
    const sequence = ++aiArchiveSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "archive_loading", requestId });
    try {
      const response = await setAiConversationArchiveEnabled(requestId, enabled);
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      if (response.request_id !== requestId || response.error || response.status !== (enabled ? "enabled" : "disabled")) {
        dispatchAi({ type: "archive_failed", requestId, issue: response.error ?? { code: "ai_archive_write_failed", message: "AI archive preference response invalid." } });
        return;
      }
      dispatchAi({ type: "archive_persistence_changed", enabled });
      void refreshAiArchive();
    } catch {
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      dispatchAi({ type: "archive_failed", requestId, issue: { code: "ai_archive_write_failed", message: "AI archive preference could not be saved." } });
    }
  }, [dispatchAi, mounted, patchLocked, refreshAiArchive]);

  const mutateAiArchive = useCallback(async (action: "delete" | "clear_zone" | "clear_all", archiveEntryId?: string) => {
    if (patchLocked || !projectState.projectSessionId || !projectState.draft || !currentZone) return;
    const sequence = ++aiArchiveSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "archive_loading", requestId });
    try {
      const response = action === "delete"
        ? await deleteAiConversationArchiveEntry(requestId, projectState.projectSessionId, projectState.draft.revision_id, currentZone.zone_id, archiveEntryId ?? "")
        : action === "clear_zone"
          ? await clearAiConversationArchiveForZone(requestId, projectState.projectSessionId, projectState.draft.revision_id, currentZone.zone_id)
          : await clearAllAiConversationArchive(requestId);
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      const expectedStatus = action === "delete" ? "deleted" : action === "clear_zone" ? "cleared_zone" : "cleared_all";
      if (response.request_id !== requestId || response.error || response.status !== expectedStatus) {
        dispatchAi({ type: "archive_failed", requestId, issue: response.error ?? { code: "ai_archive_write_failed", message: "AI archive update response invalid." } });
        return;
      }
      void refreshAiArchive();
    } catch {
      if (!mounted.current || sequence !== aiArchiveSequence.current) return;
      dispatchAi({ type: "archive_failed", requestId, issue: { code: "ai_archive_write_failed", message: "AI archive could not be updated." } });
    }
  }, [currentZone, dispatchAi, mounted, patchLocked, projectState.draft, projectState.projectSessionId, refreshAiArchive]);

  const updateAiConnection = useCallback(async (refresh = false) => {
    if (patchLocked || (selectedProvider && !isCodexProvider)) return;
    const sequence = ++aiSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "connect_started", requestId });
    try {
      const response = await (refresh ? refreshCodexAccount : connectCodexAppServer)(requestId);
      if (!mounted.current || sequence !== aiSequence.current) return;
      if (response.request_id !== requestId || response.error || !response.connection) {
        dispatchAi({ type: "operation_failed", requestId, issue: response.error ?? { code: "codex_app_server_initialization_failed", message: "Codex connection response invalid." } });
        return;
      }
      dispatchAi({ type: "connect_succeeded", requestId, connection: response.connection });
    } catch {
      if (!mounted.current || sequence !== aiSequence.current) return;
      dispatchAi({ type: "operation_failed", requestId, issue: { code: "codex_app_server_start_failed", message: "Codex connection failed." } });
    }
  }, [dispatchAi, isCodexProvider, mounted, patchLocked, selectedProvider]);

  const installCodexCli = useCallback(async () => {
    if (patchLocked) return;
    const sequence = ++aiSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "install_started", requestId });
    try {
      const response = await installOfficialCodexCli(requestId);
      if (!mounted.current || sequence !== aiSequence.current) return;
      if (response.request_id !== requestId || response.error || !["installed", "already_available"].includes(response.status) || !response.probe?.found || !response.probe.version) {
        dispatchAi({ type: "operation_failed", requestId, issue: response.error ?? { code: "codex_cli_install_verification_failed", message: "Codex CLI installation response invalid." } });
        return;
      }
      dispatchAi({ type: "install_succeeded", requestId, probe: response.probe });
    } catch {
      if (!mounted.current || sequence !== aiSequence.current) return;
      dispatchAi({ type: "operation_failed", requestId, issue: { code: "codex_cli_install_failed", message: "Codex CLI installation failed." } });
    }
  }, [dispatchAi, mounted, patchLocked]);

  const disconnectAi = useCallback(async () => {
    if (patchLocked) return;
    aiSequence.current += 1;
    try {
      await disconnectCodexAppServer(crypto.randomUUID());
    } finally {
      if (mounted.current) dispatchAi({ type: "disconnected" });
    }
  }, [dispatchAi, mounted, patchLocked]);

  const selectAiProvider = useCallback((profileId: string) => {
    if (patchLocked || !aiState.providerProfiles.some((profile) => profile.profile_id === profileId)) return;
    aiSequence.current += 1;
    dispatchAi({ type: "provider_selected", profileId });
    void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
  }, [aiState.providerProfiles, dispatchAi, patchLocked]);

  const refreshAiProviderModels = useCallback(async () => {
    if (patchLocked || !selectedProvider || isCodexProvider) return;
    const requestId = crypto.randomUUID();
    try {
      const response = await refreshAiProviderModelsCommand(requestId, selectedProvider.profile_id);
      if (!mounted.current || response.request_id !== requestId) return;
      if (response.error) {
        dispatchAi({ type: "provider_operation_failed", issue: response.error });
        return;
      }
      dispatchAi({ type: "provider_models_loaded", profileId: response.profile_id, models: response.models, verified: response.verified });
    } catch {
      if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_model_catalog_failed", message: "Provider models could not be loaded." } });
    }
  }, [dispatchAi, isCodexProvider, mounted, patchLocked, selectedProvider]);

  const saveProviderProfile = useCallback(async (profile: AiProviderProfile) => {
    if (patchLocked) return;
    const requestId = crypto.randomUUID();
    try {
      const response = await saveAiProviderProfileCommand(requestId, profile);
      if (!mounted.current || response.request_id !== requestId) return;
      if (response.error || !response.profiles) {
        dispatchAi({ type: "provider_operation_failed", issue: response.error ?? { code: "ai_provider_profile_write_failed", message: "Provider profile could not be saved." } });
        return;
      }
      const existed = aiState.providerProfiles.some((item) => item.profile_id === profile.profile_id);
      dispatchAi({ type: "provider_profiles_updated", profiles: response.profiles });
      if (!existed) dispatchAi({ type: "provider_selected", profileId: profile.profile_id });
      void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
    } catch {
      if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_profile_write_failed", message: "Provider profile could not be saved." } });
    }
  }, [aiState.providerProfiles, dispatchAi, mounted, patchLocked]);

  const deleteProviderProfile = useCallback(async () => {
    if (patchLocked || !selectedProvider || selectedProvider.built_in) return;
    const requestId = crypto.randomUUID();
    try {
      const response = await deleteAiProviderProfileCommand(requestId, selectedProvider.profile_id);
      if (!mounted.current || response.request_id !== requestId) return;
      if (response.error || !response.profiles) {
        dispatchAi({ type: "provider_operation_failed", issue: response.error ?? { code: "ai_provider_profile_write_failed", message: "Provider profile could not be deleted." } });
        return;
      }
      dispatchAi({ type: "provider_profiles_updated", profiles: response.profiles });
      void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
    } catch {
      if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_profile_write_failed", message: "Provider profile could not be deleted." } });
    }
  }, [dispatchAi, mounted, patchLocked, selectedProvider]);

  const testSelectedAiProvider = useCallback(async () => {
    if (patchLocked || !selectedProvider || isCodexProvider) return;
    const requestId = crypto.randomUUID();
    try {
      const response = await testAiProviderConnection(requestId, selectedProvider.profile_id);
      if (!mounted.current || response.request_id !== requestId) return;
      if (response.error) dispatchAi({ type: "provider_operation_failed", issue: response.error });
      else void refreshAiProviderModels();
    } catch {
      if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_connection_failed", message: "Provider connection failed." } });
    }
  }, [dispatchAi, isCodexProvider, mounted, patchLocked, refreshAiProviderModels, selectedProvider]);

  const saveSelectedProviderSecret = useCallback(async (secret: string) => {
    if (patchLocked || !selectedProvider || isCodexProvider || !secret) return;
    const requestId = crypto.randomUUID();
    try {
      const response = await setAiProviderSecret(requestId, selectedProvider.profile_id, secret);
      if (!mounted.current || response.request_id !== requestId) return;
      if (response.error) dispatchAi({ type: "provider_operation_failed", issue: response.error });
      else if (response.profiles) {
        dispatchAi({ type: "provider_profiles_updated", profiles: response.profiles });
        void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
      }
    } catch {
      if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_secret_write_failed", message: "Provider API key could not be saved." } });
    }
  }, [dispatchAi, isCodexProvider, mounted, patchLocked, selectedProvider]);

  const clearSelectedProviderSecret = useCallback(async () => {
    if (patchLocked || !selectedProvider || isCodexProvider) return;
    const requestId = crypto.randomUUID();
    try {
      const response = await deleteAiProviderSecret(requestId, selectedProvider.profile_id);
      if (!mounted.current || response.request_id !== requestId) return;
      if (response.error) dispatchAi({ type: "provider_operation_failed", issue: response.error });
      else if (response.profiles) {
        dispatchAi({ type: "provider_profiles_updated", profiles: response.profiles });
        void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
      }
    } catch {
      if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_secret_delete_failed", message: "Provider API key could not be cleared." } });
    }
  }, [dispatchAi, isCodexProvider, mounted, patchLocked, selectedProvider]);

  const startCodexLogin = useCallback(async (authMode: "chatgptDeviceCode" | "apiKey", apiKey?: string) => {
    if (patchLocked || !isCodexProvider) return;
    dispatchAi({ type: "provider_login_started" });
    try {
      const requestId = crypto.randomUUID();
      const response = await startAiProviderLogin(requestId, authMode, apiKey);
      if (!mounted.current || response.request_id !== requestId) return;
      if (response.error) {
        dispatchAi({ type: "provider_operation_failed", issue: response.error });
        return;
      }
      if (response.connection) dispatchAi({ type: "connect_succeeded", requestId, connection: response.connection });
      if (response.login) dispatchAi({ type: "provider_login_updated", login: response.login });
      else {
        dispatchAi({ type: "provider_login_cleared" });
        void updateAiConnection(true);
      }
    } catch {
      if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_auth_failed", message: "Codex login failed." } });
    }
  }, [dispatchAi, isCodexProvider, mounted, patchLocked, updateAiConnection]);

  const cancelCodexLogin = useCallback(async () => {
    if (patchLocked || !aiState.providerLogin) return;
    try {
      const requestId = crypto.randomUUID();
      const response = await cancelAiProviderLogin(requestId, aiState.providerLogin.login_id);
      if (!mounted.current || response.request_id !== requestId) return;
      if (response.error) dispatchAi({ type: "provider_operation_failed", issue: response.error });
      else dispatchAi({ type: "provider_login_cleared" });
    } catch {
      if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_auth_failed", message: "Codex login could not be cancelled." } });
    }
  }, [aiState.providerLogin, dispatchAi, mounted, patchLocked]);

  const logoutCodex = useCallback(async () => {
    if (patchLocked || !isCodexProvider) return;
    try {
      const requestId = crypto.randomUUID();
      const response = await logoutAiProvider(requestId);
      if (!mounted.current || response.request_id !== requestId) return;
      if (response.error) dispatchAi({ type: "provider_operation_failed", issue: response.error });
      else {
        dispatchAi({ type: "provider_login_cleared" });
        if (response.connection) dispatchAi({ type: "connect_succeeded", requestId, connection: response.connection });
      }
    } catch {
      if (mounted.current) dispatchAi({ type: "provider_operation_failed", issue: { code: "ai_provider_auth_failed", message: "Codex logout failed." } });
    }
  }, [dispatchAi, isCodexProvider, mounted, patchLocked]);

  const toggleAiScope = useCallback((scope: AiContextScope) => {
    if (patchLocked) return;
    dispatchAi({ type: "scope_toggled", scope });
    void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
  }, [dispatchAi, patchLocked]);

  const changeAiModel = useCallback((modelId: string) => {
    if (patchLocked) return;
    if (selectedProvider && !isCodexProvider) {
      const allowed = selectedProvider.models.some((item) => item.id === modelId && item.available)
        || selectedProvider.manual_model_ids.includes(modelId);
      if (!allowed) return;
      dispatchAi({ type: "model_changed", modelId, effort: "medium" });
      void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
      return;
    }
    const model = aiState.connection?.models.find((item) => item.id === modelId && item.available);
    if (!model) return;
    dispatchAi({ type: "model_changed", modelId, effort: model.default_reasoning_effort });
    void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
  }, [aiState.connection?.models, dispatchAi, isCodexProvider, patchLocked, selectedProvider]);

  const changeAiEffort = useCallback((effort: string) => {
    if (patchLocked) return;
    if (selectedProvider && !isCodexProvider) return;
    const model = aiState.connection?.models.find((item) => item.id === aiState.modelId);
    if (!model?.reasoning_efforts.some((item) => item.id === effort)) return;
    dispatchAi({ type: "effort_changed", effort });
    void clearReadonlyAiSession(crypto.randomUUID()).catch(() => undefined);
  }, [aiState.connection?.models, aiState.modelId, dispatchAi, isCodexProvider, patchLocked, selectedProvider]);

  const previewContext = useCallback(async () => {
    if (patchLocked || !selectedProvider || !projectState.projectSessionId || !projectState.draft || !currentZone || !aiState.modelId || (!isCodexProvider && !aiState.modelId)) return;
    const sequence = ++aiSequence.current;
    const requestId = crypto.randomUUID();
    dispatchAi({ type: "preview_started", requestId });
    try {
      const response = await previewAiContext(requestId, selectedProvider.profile_id, projectState.projectSessionId, projectState.draft.revision_id, currentZone.zone_id, aiState.scopes, language, aiState.modelId, isCodexProvider ? aiState.reasoningEffort : "medium");
      if (!mounted.current || sequence !== aiSequence.current) return;
      if (response.request_id !== requestId || response.error || !response.preview || response.preview.project_session_id !== projectState.projectSessionId || response.preview.revision_id !== projectState.draft.revision_id || response.preview.zone_id !== currentZone.zone_id || !isSafeAiPreview(response.preview)) {
        dispatchAi({ type: "operation_failed", requestId, issue: response.error ?? { code: "ai_context_unavailable", message: "AI context preview invalid." } });
        return;
      }
      dispatchAi({ type: "preview_succeeded", requestId, preview: response.preview });
    } catch {
      if (!mounted.current || sequence !== aiSequence.current) return;
      dispatchAi({ type: "operation_failed", requestId, issue: { code: "ai_context_unavailable", message: "AI context preview failed." } });
    }
  }, [aiState.modelId, aiState.reasoningEffort, aiState.scopes, currentZone, dispatchAi, isCodexProvider, language, mounted, patchLocked, projectState.draft, projectState.projectSessionId, selectedProvider]);

  const sendAiQuestion = useCallback(async () => {
    if (patchLocked || !selectedProvider || !projectState.projectSessionId || !projectState.draft || !currentZone || !aiState.preview || !aiState.question.trim()) return;
    const sequence = ++aiSequence.current;
    const requestId = crypto.randomUUID();
    const question = aiState.question.trim();
    dispatchAi({ type: "turn_started", requestId, question });
    try {
      const response = await startReadonlyAiTurn(requestId, selectedProvider?.profile_id ?? "", projectState.projectSessionId, projectState.draft.revision_id, currentZone.zone_id, aiState.preview.preview_id, question, aiState.scopes, language, aiState.modelId, isCodexProvider ? aiState.reasoningEffort : "medium");
      if (!mounted.current || sequence !== aiSequence.current) return;
      if (response.request_id === requestId && response.error?.code === "ai_turn_interrupted") {
        dispatchAi({ type: "turn_interrupted" });
        return;
      }
      if (response.request_id !== requestId || response.error || response.status !== "completed" || !response.answer || !isStructuredAiAnswer(response.answer) || !isSafeAiArchiveSave(response.archive)) {
        dispatchAi({ type: "operation_failed", requestId, issue: response.error ?? { code: "ai_response_contract_invalid", message: "AI answer contract invalid." } });
        return;
      }
      dispatchAi({ type: "turn_succeeded", requestId, answer: response.answer, archive: response.archive });
      if (response.archive.saved) void refreshAiArchive();
    } catch {
      if (!mounted.current || sequence !== aiSequence.current) return;
      dispatchAi({ type: "operation_failed", requestId, issue: { code: "codex_app_server_disconnected", message: "AI turn failed." } });
    }
  }, [aiState.modelId, aiState.preview, aiState.question, aiState.reasoningEffort, aiState.scopes, currentZone, dispatchAi, isCodexProvider, language, mounted, patchLocked, projectState.draft, projectState.projectSessionId, refreshAiArchive, selectedProvider]);

  const stopAiTurn = useCallback(async () => {
    if (patchLocked) return;
    aiSequence.current += 1;
    dispatchAi({ type: "interrupt_started" });
    try {
      const response = await interruptReadonlyAiTurn(crypto.randomUUID());
      if (!mounted.current) return;
      if (response.error) dispatchAi({ type: "operation_failed", requestId: null, issue: response.error });
      else dispatchAi({ type: "turn_interrupted" });
    } catch {
      if (mounted.current) dispatchAi({ type: "operation_failed", requestId: null, issue: { code: "codex_app_server_disconnected", message: "AI interrupt failed." } });
    }
  }, [dispatchAi, mounted, patchLocked]);

  return {
    refreshAiArchive,
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
  };
}
