import { Bot, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiProviderView, AiState } from "../../../app/ai-state";
import { IconButton } from "../../ui/IconButton";
import { StatusTag } from "../../ui/StatusTag";

export function AssistantHeader({ state, provider, onOpenSettings }: { state: AiState; provider: AiProviderView | null; onOpenSettings: () => void }) {
  const { t } = useTranslation();
  const configured = provider?.protocol === "codex_app_server" ? state.status === "available" : Boolean(provider && (provider.auth_kind === "none" || provider.secret_state === "present"));
  const failed = state.status === "error" || Boolean(state.providerIssue);
  const providerLine = `${provider?.display_name ?? t("journeys.settings.providerNotConfigured")} · ${state.modelId || t("assistant.selectModel")}`;
  return <header className="assistant-compact-header">
    <Bot className="assistant-header-icon" size={19} aria-hidden="true" />
    <div className="assistant-header-copy">
      <h2 title={t("assistant.title")}>{t("assistant.title")}</h2>
      <p title={providerLine}>{providerLine}</p>
    </div>
    <StatusTag className="assistant-header-status" title={t(failed ? "journeys.settings.providerConnectionFailed" : configured ? "journeys.settings.providerConnected" : "journeys.settings.providerNotConfigured")} tone={failed ? "error" : configured ? "success" : "neutral"}>{t(failed ? "journeys.settings.providerConnectionFailed" : configured ? "journeys.settings.providerConnected" : "journeys.settings.providerNotConfigured")}</StatusTag>
    <IconButton className="assistant-header-settings" label={t("assistant.openProviderSettings")} title={t("assistant.openProviderSettings")} onClick={onOpenSettings}><Settings2 size={16} /></IconButton>
  </header>;
}
