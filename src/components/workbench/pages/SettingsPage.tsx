import { Bot, Database, MonitorCog, Palette, RotateCcw, Settings2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiProviderProfile, AiState } from "../../../app/ai-state";
import type { StorageUsageView, StudioSetup, ToolKind, ToolState } from "../../../app/release-state";
import type { AppLanguage, AppTheme } from "../../../app/workbench-state";
import { Button } from "../../ui/Button";
import { InlineNotice } from "../../ui/InlineNotice";
import { PageHeader } from "../../ui/PageHeader";
import { StatusTag } from "../../ui/StatusTag";
import { ReleaseSettings } from "../ReleaseSettings";
import { AiProviderSettings } from "../assistant/AiProviderSettings";

type SettingsCategory = "appearance" | "ai" | "tools" | "privacy" | "diagnostics";

export interface SettingsPageProps {
  language: AppLanguage;
  theme: AppTheme;
  aiState: AiState;
  setup: StudioSetup | null;
  setupBusy: boolean;
  storageUsage: StorageUsageView | null;
  onOpenAssistant: () => void;
  onAiConnect?: () => void;
  onAiRefresh?: () => void;
  onAiProviderSelect?: (profileId: string) => void;
  onAiProviderTest?: () => void;
  onAiProviderRefreshModels?: () => void;
  onAiProviderSave?: (profile: AiProviderProfile) => void;
  onAiProviderDelete?: () => void;
  onAiCodexDeviceLogin?: () => void;
  onAiCodexApiKeyLogin?: (apiKey: string) => void;
  onAiCodexCancelLogin?: () => void;
  onAiCodexLogout?: () => void;
  onAiProviderSecret?: (secret: string) => void;
  onAiProviderClearSecret?: () => void;
  onAiModelChange?: (modelId: string) => void;
  onSettingsReset: () => void;
  onChooseDataDirectory: () => Promise<string | null>;
  onProbeTool: (kind: ToolKind) => Promise<ToolState | null>;
  onSaveDataDirectory: (dataDirectory: string) => Promise<void>;
  onOpenStudioDirectory: (kind: "data" | "app-data" | "logs" | "cache") => Promise<void>;
  onClearStudioCache: () => Promise<void>;
  onCopyDiagnostics: () => Promise<void>;
  onExportDiagnostics: () => Promise<void>;
}

const categories: Array<{ id: SettingsCategory; icon: typeof Palette }> = [
  { id: "appearance", icon: Palette },
  { id: "ai", icon: Bot },
  { id: "tools", icon: MonitorCog },
  { id: "privacy", icon: Database },
  { id: "diagnostics", icon: Settings2 },
];

export function SettingsPage(props: SettingsPageProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<SettingsCategory>("appearance");
  const noop = () => undefined;
  const providerStatus = props.aiState.status === "available"
    ? { label: t("journeys.settings.providerConnected"), tone: "success" as const }
    : props.aiState.status === "error"
      ? { label: t("journeys.settings.providerConnectionFailed"), tone: "error" as const }
      : { label: t("journeys.settings.providerNotConfigured"), tone: "neutral" as const };
  const releaseProps = {
    setup: props.setup,
    language: props.language,
    theme: props.theme,
    busy: props.setupBusy,
    onChooseDataDirectory: props.onChooseDataDirectory,
    onProbeTool: props.onProbeTool,
    onSaveDataDirectory: props.onSaveDataDirectory,
    onOpenDirectory: props.onOpenStudioDirectory,
    onClearCache: props.onClearStudioCache,
    onCopyDiagnostics: props.onCopyDiagnostics,
    onExportDiagnostics: props.onExportDiagnostics,
    storageUsage: props.storageUsage,
  };

  return (
    <section className="journey-page settings-journey" aria-labelledby="settings-page-title">
      <PageHeader eyebrow={t("journeys.settings.eyebrow")} title={t("journeys.settings.title")} description={t("journeys.settings.description")} />
      <div className="settings-workspace">
        <nav className="settings-category-nav" aria-label={t("journeys.settings.title")}>
          {categories.map(({ id, icon: Icon }) => <button key={id} type="button" aria-current={active === id ? "page" : undefined} className={active === id ? "is-active" : ""} onClick={() => setActive(id)}><Icon size={17} aria-hidden="true" /><span>{t(`journeys.settings.${id}`)}</span></button>)}
        </nav>
        <div className="settings-category-content">
          {active === "appearance" ? <section><h2>{t("journeys.settings.appearance")}</h2><p>{t("journeys.settings.appearanceBody")}</p><dl className="settings-summary-list"><div><dt>{t("journeys.settings.currentLanguage")}</dt><dd>{props.language}</dd></div><div><dt>{t("journeys.settings.currentTheme")}</dt><dd>{t(`toolbar.${props.theme}`)}</dd></div></dl></section> : null}
          {active === "ai" ? <section><h2>{t("journeys.settings.ai")}</h2><StatusTag tone={providerStatus.tone}>{providerStatus.label}</StatusTag>{providerStatus.tone === "error" ? <InlineNotice tone="error">{providerStatus.label}</InlineNotice> : null}<AiProviderSettings state={props.aiState} onConnect={props.onAiConnect ?? noop} onRefresh={props.onAiRefresh ?? noop} onProviderSelect={props.onAiProviderSelect ?? noop} onProviderTest={props.onAiProviderTest ?? noop} onProviderRefreshModels={props.onAiProviderRefreshModels ?? noop} onProviderSave={props.onAiProviderSave ?? noop} onProviderDelete={props.onAiProviderDelete ?? noop} onCodexDeviceLogin={props.onAiCodexDeviceLogin ?? noop} onCodexApiKeyLogin={props.onAiCodexApiKeyLogin ?? noop} onCodexCancelLogin={props.onAiCodexCancelLogin ?? noop} onCodexLogout={props.onAiCodexLogout ?? noop} onProviderSecret={props.onAiProviderSecret ?? noop} onProviderClearSecret={props.onAiProviderClearSecret ?? noop} onModelChange={props.onAiModelChange ?? noop} /><Button icon={<Bot size={16} aria-hidden="true" />} onClick={props.onOpenAssistant}>{t("journeys.settings.openAssistant")}</Button></section> : null}
          {active === "tools" ? <ReleaseSettings {...releaseProps} section="tools" /> : null}
          {active === "privacy" ? <ReleaseSettings {...releaseProps} section="storage" /> : null}
          {active === "diagnostics" ? <section><ReleaseSettings {...releaseProps} section="diagnostics" /><div className="settings-reset"><h2>{t("journeys.settings.resetLayout")}</h2><p>{t("journeys.settings.resetBody")}</p><Button icon={<RotateCcw size={16} aria-hidden="true" />} onClick={props.onSettingsReset}>{t("journeys.settings.resetLayout")}</Button></div></section> : null}
        </div>
      </div>
    </section>
  );
}
