import { useEffect, useState } from "react";
import { Link2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiProviderProfile, AiProviderView, AiState } from "../../../app/ai-state";
import { Button } from "../../ui/Button";
import { Disclosure } from "../../ui/Disclosure";
import { InlineNotice } from "../../ui/InlineNotice";
import { StatusTag } from "../../ui/StatusTag";

export interface AiProviderSettingsProps {
  state: AiState;
  onConnect: () => void;
  onRefresh: () => void;
  onProviderSelect: (profileId: string) => void;
  onProviderTest: () => void;
  onProviderRefreshModels: () => void;
  onProviderSave: (profile: AiProviderProfile) => void;
  onProviderDelete: () => void;
  onCodexDeviceLogin: () => void;
  onCodexApiKeyLogin: (apiKey: string) => void;
  onCodexCancelLogin: () => void;
  onCodexLogout: () => void;
  onProviderSecret: (secret: string) => void;
  onProviderClearSecret: () => void;
  onModelChange: (modelId: string) => void;
}

function editableProfile(profile: AiProviderView, overrides: Partial<AiProviderProfile>): AiProviderProfile {
  return {
    profile_id: profile.profile_id,
    preset_id: profile.preset_id,
    display_name: profile.display_name,
    protocol: profile.protocol,
    base_url: profile.base_url,
    auth_kind: profile.auth_kind,
    built_in: profile.built_in,
    manual_model_ids: profile.manual_model_ids,
    selected_model_id: profile.selected_model_id,
    capabilities: profile.capabilities,
    config_revision: profile.config_revision,
    ...overrides,
  };
}

export function AiProviderSettings(props: AiProviderSettingsProps) {
  const { t } = useTranslation();
  const [secret, setSecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [manualModels, setManualModels] = useState("");
  const selected = props.state.providerProfiles.find((profile) => profile.profile_id === props.state.providerProfileId) ?? null;
  const codex = selected?.protocol === "codex_app_server";
  const busy = ["probing", "installing", "connecting", "generating", "interrupting"].includes(props.state.status);
  const configured = codex
    ? props.state.status === "available"
    : Boolean(selected && (selected.auth_kind === "none" || selected.secret_state === "present"));
  const failed = props.state.status === "error" || Boolean(props.state.providerIssue);
  const models = codex
    ? props.state.connection?.models.filter((model) => model.available).map((model) => ({ id: model.id, label: model.display_name })) ?? []
    : selected?.models.filter((model) => model.available).map((model) => ({ id: model.id, label: model.display_name })) ?? [];

  useEffect(() => {
    if (!selected || selected.built_in) return;
    setName(selected.display_name);
    setEndpoint(selected.base_url ?? "");
    setManualModels(selected.manual_model_ids.join("\n"));
  }, [selected?.profile_id]);

  const saveCustom = () => {
    const ids = Array.from(new Set(manualModels.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)));
    if (selected && !selected.built_in) {
      props.onProviderSave(editableProfile(selected, { display_name: name.trim(), base_url: endpoint.trim() || null, manual_model_ids: ids, selected_model_id: ids.includes(props.state.modelId) ? props.state.modelId : ids[0] ?? null }));
      return;
    }
    props.onProviderSave({ profile_id: crypto.randomUUID(), preset_id: null, display_name: name.trim() || t("assistant.customProfile"), protocol: "openai_chat_completions", base_url: endpoint.trim() || null, auth_kind: "api_key", built_in: false, manual_model_ids: ids, selected_model_id: ids[0] ?? null, capabilities: { model_catalog: true, streaming: true, token_usage: false, structured_json_schema: false }, config_revision: 1 });
    setCustomOpen(false);
  };

  return (
    <div className="provider-settings" aria-label={t("journeys.settings.ai")}>
      <div className="provider-settings-main">
        <label><span>{t("assistant.provider")}</span><select value={props.state.providerProfileId} onChange={(event) => props.onProviderSelect(event.target.value)} disabled={busy}>{props.state.providerProfiles.map((profile) => <option key={profile.profile_id} value={profile.profile_id}>{profile.preset_id === "codex" ? t("assistant.codexProviderLabel") : profile.preset_id === "openai" ? t("assistant.openaiProviderLabel") : profile.display_name}</option>)}</select></label>
        <StatusTag tone={failed ? "error" : configured ? "success" : "neutral"}>{t(failed ? "journeys.settings.providerConnectionFailed" : configured ? "journeys.settings.providerConnected" : "journeys.settings.providerNotConfigured")}</StatusTag>
        <label><span>{t("assistant.model")}</span><select value={props.state.modelId} onChange={(event) => props.onModelChange(event.target.value)} disabled={busy || !configured}><option value="">{t("assistant.selectModel")}</option>{models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
        <div className="compact-actions">
          {codex ? <Button onClick={props.onConnect} disabled={busy}><Link2 size={14} />{t("assistant.connect")}</Button> : <Button onClick={props.onProviderTest} disabled={busy}><Link2 size={14} />{t("assistant.testProvider")}</Button>}
          <Button onClick={codex ? props.onRefresh : props.onProviderRefreshModels} disabled={busy}><RefreshCw size={14} />{t("assistant.refreshModels")}</Button>
          <Button onClick={() => { setName(""); setEndpoint(""); setManualModels(""); setCustomOpen(true); }} disabled={busy}><Plus size={14} />{t("assistant.newCustomProvider")}</Button>
        </div>
      </div>
      {props.state.providerIssue ? <InlineNotice tone="error">{t(`errors.codes.${props.state.providerIssue.code}`, { defaultValue: t("errors.codes.unknown") })}</InlineNotice> : null}
      <Disclosure label={t("assistant.advancedSettings")}>
        {codex ? <div className="provider-settings-advanced">
          <div className="compact-actions"><Button onClick={props.onCodexDeviceLogin} disabled={busy || Boolean(props.state.providerLogin)}>{t("assistant.deviceLogin")}</Button><Button onClick={props.onCodexLogout} disabled={busy}>{t("assistant.logout")}</Button></div>
          <label><span>{t("assistant.codexApiKey")}</span><input type="password" value={apiKey} autoComplete="off" placeholder={t("assistant.writeOnlyKey")} onChange={(event) => setApiKey(event.target.value)} /></label>
          <Button onClick={() => { props.onCodexApiKeyLogin(apiKey); setApiKey(""); }} disabled={busy || !apiKey}>{t("assistant.apiKeyLogin")}</Button>
          {props.state.providerLogin ? <div role="status"><strong>{props.state.providerLogin.user_code}</strong><Button onClick={props.onCodexCancelLogin}>{t("assistant.cancelLogin")}</Button></div> : null}
        </div> : selected ? <div className="provider-settings-advanced">
          {selected.auth_kind === "api_key" ? <><label><span>{t("assistant.providerApiKey")}</span><input type="password" value={secret} autoComplete="off" placeholder={selected.secret_state === "present" ? t("assistant.keyAlreadyConfigured") : t("assistant.writeOnlyKey")} onChange={(event) => setSecret(event.target.value)} /></label><div className="compact-actions"><Button onClick={() => { props.onProviderSecret(secret); setSecret(""); }} disabled={!secret}>{t("assistant.saveProviderKey")}</Button><Button onClick={props.onProviderClearSecret} disabled={selected.secret_state !== "present"}>{t("assistant.clearProviderKey")}</Button></div></> : null}
          {!selected.built_in ? <><label><span>{t("assistant.providerDisplayName")}</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>{t("assistant.providerEndpoint")}</span><input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label><label><span>{t("assistant.manualModels")}</span><textarea rows={3} value={manualModels} onChange={(event) => setManualModels(event.target.value)} /></label><div className="compact-actions"><Button variant="primary" onClick={saveCustom}>{t("assistant.saveProvider")}</Button><Button onClick={props.onProviderDelete}><Trash2 size={14} />{t("assistant.deleteProvider")}</Button></div></> : null}
        </div> : null}
        {customOpen ? <div className="provider-settings-advanced"><h3>{t("assistant.customProfile")}</h3><label><span>{t("assistant.providerDisplayName")}</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>{t("assistant.providerEndpoint")}</span><input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label><label><span>{t("assistant.manualModels")}</span><textarea rows={3} value={manualModels} onChange={(event) => setManualModels(event.target.value)} /></label><div className="compact-actions"><Button variant="primary" onClick={saveCustom} disabled={!endpoint.trim()}>{t("assistant.saveProvider")}</Button><Button onClick={() => setCustomOpen(false)}>{t("assistant.cancelEdit")}</Button></div></div> : null}
      </Disclosure>
    </div>
  );
}
