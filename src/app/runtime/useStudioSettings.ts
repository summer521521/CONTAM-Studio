import { useCallback, useEffect, useState } from "react";
import type { TFunction } from "i18next";
import {
  clearStudioCache,
  exportSanitizedDiagnostics,
  getDiagnosticsSummary,
  getStorageUsage,
  getStudioSetup,
  openStudioDirectory,
  saveStudioPreferences,
  selectAndProbeOfficialTool,
  selectDataDirectory,
} from "../desktop-api";
import {
  isSafeStudioSetup,
  sanitizeDiagnosticsForDisplay,
  type StorageUsageView,
  type StudioSetup,
  type ToolKind,
  type ToolState,
} from "../release-state";
import type { WorkbenchDestination, WorkbenchState } from "../workbench-state";

interface UseStudioSettingsOptions {
  activeDestination: WorkbenchDestination;
  language: WorkbenchState["language"];
  theme: WorkbenchState["theme"];
  updateWorkbench: (patch: Partial<WorkbenchState>) => void;
  onNotice: (message: string) => void;
  t: TFunction;
}

export function useStudioSettings({ activeDestination, language, theme, updateWorkbench, onNotice, t }: UseStudioSettingsOptions) {
  const [studioSetup, setStudioSetup] = useState<StudioSetup | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageUsageView | null>(null);
  const [studioSetupBusy, setStudioSetupBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    void getStudioSetup(crypto.randomUUID()).then((response) => {
      if (disposed || response.error || !isSafeStudioSetup(response.setup)) return;
      setStudioSetup(response.setup);
      updateWorkbench({
        language: response.setup.language === "en" ? "en" : "zh-CN",
        theme: response.setup.theme === "dark" ? "dark" : "light",
      });
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [updateWorkbench]);

  useEffect(() => {
    if (activeDestination !== "settings") return undefined;
    let disposed = false;
    void getStorageUsage(crypto.randomUUID()).then((response) => {
      if (!disposed && !response.error) setStorageUsage(response.usage);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [activeDestination]);

  const chooseStudioDataDirectory = useCallback(async (): Promise<string | null> => {
    setStudioSetupBusy(true);
    try {
      const response = await selectDataDirectory(crypto.randomUUID());
      if (response.error) onNotice(response.error.message);
      return response.selected_directory;
    } catch {
      onNotice(t("settings.storageBody"));
      return null;
    } finally {
      setStudioSetupBusy(false);
    }
  }, [onNotice, t]);

  const probeStudioTool = useCallback(async (kind: ToolKind): Promise<ToolState | null> => {
    setStudioSetupBusy(true);
    try {
      const response = await selectAndProbeOfficialTool(crypto.randomUUID(), kind);
      if (response.error) onNotice(response.error.message);
      return response.tool;
    } catch {
      onNotice(t("settings.toolBody"));
      return null;
    } finally {
      setStudioSetupBusy(false);
    }
  }, [onNotice, t]);

  const saveStudioDataDirectory = useCallback(async (dataDirectory: string) => {
    setStudioSetupBusy(true);
    try {
      const response = await saveStudioPreferences(crypto.randomUUID(), language, theme, dataDirectory);
      if (response.error) onNotice(response.error.message);
      if (isSafeStudioSetup(response.setup)) {
        setStudioSetup(response.setup);
        onNotice(t("settings.storageBody"));
      }
    } catch {
      onNotice(t("settings.storageBody"));
    } finally {
      setStudioSetupBusy(false);
    }
  }, [language, onNotice, t, theme]);

  const openStudioDirectoryAction = useCallback(async (kind: "data" | "app-data" | "logs" | "cache") => {
    setStudioSetupBusy(true);
    try {
      const response = await openStudioDirectory(crypto.randomUUID(), kind);
      if (response.error) onNotice(response.error.message);
    } catch {
      onNotice(t("settings.storageBody"));
    } finally {
      setStudioSetupBusy(false);
    }
  }, [onNotice, t]);

  const clearStudioCacheAction = useCallback(async () => {
    setStudioSetupBusy(true);
    try {
      const response = await clearStudioCache(crypto.randomUUID());
      onNotice(response.error?.message ?? t("settings.storageBody"));
    } catch {
      onNotice(t("settings.storageBody"));
    } finally {
      setStudioSetupBusy(false);
    }
  }, [onNotice, t]);

  const copyDiagnostics = useCallback(async () => {
    try {
      const response = await getDiagnosticsSummary(crypto.randomUUID());
      const summary = sanitizeDiagnosticsForDisplay(response.summary);
      if (summary) {
        await navigator.clipboard?.writeText(JSON.stringify(summary, null, 2));
        onNotice(t("settings.toolBody"));
      } else if (response.error) onNotice(response.error.message);
    } catch {
      onNotice(t("settings.toolBody"));
    }
  }, [onNotice, t]);

  const exportDiagnostics = useCallback(async () => {
    try {
      const response = await exportSanitizedDiagnostics(crypto.randomUUID());
      if (response.error) onNotice(response.error.message);
      else if (response.summary) onNotice(t("settings.storageBody"));
    } catch {
      onNotice(t("settings.storageBody"));
    }
  }, [onNotice, t]);

  return {
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
  };
}
