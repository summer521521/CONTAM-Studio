mod anthropic;
mod catalog;
mod credentials;
mod http;
mod openai;
mod openai_compatible;

#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use url::Url;
use uuid::Uuid;

use crate::codex_app_server::{
    AiArchiveSaveView, AiContextDisclosureView, AiDiagnostic, AiDisclosureBoundary,
    AiTokenUsageView, DesktopAiContextPreviewResponse, DesktopAiTurnResponse, StructuredAiAnswer,
};
use crate::zone_bridge::{AiAnalysisSelection, AiTrustedContext};

use self::catalog::{CatalogCacheFile, CatalogSnapshot};
use self::credentials::{AiCredentialStore, CredentialError, SecretInput, SystemCredentialStore};
use self::http::{endpoint_url, AuthHeader, ControlledHttpClient, TURN_TIMEOUT};

const PROFILE_SCHEMA_VERSION: &str = "1.0";
const PROFILE_FILE_LIMIT: u64 = 256 * 1024;
const MAX_PROFILES: usize = 32;
const MAX_MODEL_ID_CHARS: usize = 160;
const MAX_DISPLAY_NAME_CHARS: usize = 80;
const MAX_URL_CHARS: usize = 2048;
const MAX_SECRET_CHARS: usize = 8 * 1024;
const MAX_HISTORY_ENTRIES: usize = 6;
const MAX_HISTORY_BYTES: usize = 48 * 1024;
const MAX_QUESTION_CHARS: usize = 2_000;
const MAX_REASONING_EFFORT_CHARS: usize = 80;
const PROFILE_NAMESPACE: Uuid = Uuid::from_u128(0x7d30c7ea_9f20_5e73_8cd6_8b3e46a5c17f);

type ProviderCatalogs = Arc<Mutex<HashMap<Uuid, CatalogSnapshot>>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct AiProviderError {
    pub(crate) code: &'static str,
}

impl AiProviderError {
    pub(crate) const fn new(code: &'static str) -> Self {
        Self { code }
    }

    pub(crate) fn diagnostic(self) -> AiDiagnostic {
        AiDiagnostic::new(self.code, provider_error_message(self.code))
    }
}

fn provider_error_message(code: &str) -> &'static str {
    match code {
        "ai_provider_profile_invalid" => "The AI provider profile is invalid.",
        "ai_provider_profile_not_found" => "The selected AI provider profile is unavailable.",
        "ai_provider_profile_store_unavailable" => "The AI provider profile store is unavailable.",
        "ai_provider_profile_write_failed" => "The AI provider profile could not be saved.",
        "ai_provider_secret_missing" => "The selected provider has no configured API key.",
        "ai_provider_secret_store_unavailable" => {
            "The secure provider credential store is unavailable."
        }
        "ai_provider_secret_write_failed" => "The provider API key could not be saved.",
        "ai_provider_secret_delete_failed" => "The provider API key could not be cleared.",
        "ai_provider_auth_failed" => "The provider rejected authentication.",
        "ai_provider_login_pending" => "A provider login is already pending.",
        "ai_provider_login_expired" => "The provider login has expired.",
        "ai_provider_endpoint_rejected" => {
            "The provider endpoint was rejected by the safety policy."
        }
        "ai_provider_connection_failed" => "The provider connection could not be established.",
        "ai_provider_model_catalog_failed" => "The provider model catalog could not be read.",
        "ai_provider_model_unavailable" => "The selected provider model is unavailable.",
        "ai_provider_rate_limited" => "The provider rate limit was reached.",
        "ai_provider_unavailable" => "The provider is temporarily unavailable.",
        "ai_provider_stream_invalid" => "The provider stream was invalid or exceeded its bounds.",
        "ai_provider_stream_incomplete" => "The provider response stream ended before completion. Retry the request.",
        "ai_provider_response_empty" => "The provider returned an empty answer. Retry or choose another model.",
        "ai_provider_response_truncated" => "The provider stopped at its output limit. Retry or choose a model with a larger output limit.",
        "ai_provider_response_not_json" => "The provider answer was not a single valid JSON object. Retry or choose another model.",
        "ai_provider_response_contract_invalid" => "The provider JSON did not match the safe answer contract. Retry or choose another model.",
        "ai_provider_remote_error" => "The provider returned an error. Check the Provider status and retry.",
        "ai_provider_response_invalid" => "The provider response did not match the safe contract.",
        "ai_provider_timeout" => "The provider request timed out.",
        "ai_provider_cancelled" => "The provider request was cancelled.",
        "ai_tool_use_blocked" => "Tool activity was detected and the answer was discarded.",
        "ai_context_unavailable" => "The current project context is unavailable to AI.",
        "ai_context_stale" => "The AI context preview is stale.",
        "ai_turn_already_active" => "Another AI turn is already active.",
        "ai_turn_start_failed" => "The AI turn could not be started.",
        _ => "The AI provider operation failed.",
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AiProviderProtocol {
    CodexAppServer,
    OpenAiResponses,
    OpenAiChatCompletions,
    AnthropicMessages,
}

impl AiProviderProtocol {
    fn is_http(self) -> bool {
        !matches!(self, Self::CodexAppServer)
    }
}

fn protocol_name(protocol: AiProviderProtocol) -> &'static str {
    match protocol {
        AiProviderProtocol::CodexAppServer => "codex_app_server",
        AiProviderProtocol::OpenAiResponses => "openai_responses",
        AiProviderProtocol::OpenAiChatCompletions => "openai_chat_completions",
        AiProviderProtocol::AnthropicMessages => "anthropic_messages",
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AiProviderAuthKind {
    CodexManaged,
    ApiKey,
    None,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AiProviderCapabilities {
    pub(crate) model_catalog: bool,
    pub(crate) streaming: bool,
    pub(crate) token_usage: bool,
    pub(crate) structured_json_schema: bool,
}

impl Default for AiProviderCapabilities {
    fn default() -> Self {
        Self {
            model_catalog: true,
            streaming: true,
            token_usage: false,
            structured_json_schema: false,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AiProviderProfile {
    pub(crate) profile_id: Uuid,
    pub(crate) preset_id: Option<String>,
    pub(crate) display_name: String,
    pub(crate) protocol: AiProviderProtocol,
    pub(crate) base_url: Option<String>,
    pub(crate) auth_kind: AiProviderAuthKind,
    pub(crate) built_in: bool,
    pub(crate) manual_model_ids: Vec<String>,
    pub(crate) selected_model_id: Option<String>,
    pub(crate) capabilities: AiProviderCapabilities,
    pub(crate) config_revision: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct ProfileFile {
    schema_version: String,
    profiles: Vec<AiProviderProfile>,
}

impl Default for ProfileFile {
    fn default() -> Self {
        Self {
            schema_version: PROFILE_SCHEMA_VERSION.to_string(),
            profiles: builtin_profiles(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct AiProviderModelView {
    pub(crate) id: String,
    pub(crate) display_name: String,
    pub(crate) provider: String,
    pub(crate) source: String,
    pub(crate) capabilities: Vec<String>,
    pub(crate) availability: String,
    pub(crate) available: bool,
    pub(crate) fetched_at: Option<String>,
    pub(crate) stale: bool,
    pub(crate) verified_for_current_adapter: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AiProviderView {
    pub(crate) profile_id: Uuid,
    pub(crate) preset_id: Option<String>,
    pub(crate) display_name: String,
    pub(crate) protocol: AiProviderProtocol,
    pub(crate) base_url: Option<String>,
    pub(crate) auth_kind: AiProviderAuthKind,
    pub(crate) built_in: bool,
    pub(crate) network_scope: String,
    pub(crate) secret_state: String,
    pub(crate) connection_status: String,
    pub(crate) catalog_verified: bool,
    pub(crate) models: Vec<AiProviderModelView>,
    pub(crate) manual_model_ids: Vec<String>,
    pub(crate) selected_model_id: Option<String>,
    pub(crate) config_revision: u64,
    pub(crate) capabilities: AiProviderCapabilities,
}

#[derive(Clone, Debug)]
struct HttpPreviewRecord {
    preview_id: String,
    profile: AiProviderProfile,
    context: AiTrustedContext,
    view: AiContextDisclosureView,
    fingerprint: String,
    scopes: Vec<String>,
    language: String,
    model_id: String,
    reasoning_effort: String,
}

#[derive(Clone, Debug)]
struct HttpHistoryEntry {
    question: String,
    answer: StructuredAiAnswer,
}

#[derive(Default)]
struct HttpHistoryState {
    fingerprint: Option<String>,
    entries: Vec<HttpHistoryEntry>,
}

pub(crate) struct AiProviderStore {
    pub(crate) credentials: Arc<dyn AiCredentialStore>,
    client: ControlledHttpClient,
    preview: Mutex<Option<HttpPreviewRecord>>,
    history: Mutex<HttpHistoryState>,
    active_cancel: Mutex<Option<Arc<AtomicBool>>>,
    catalogs: ProviderCatalogs,
}

impl Default for AiProviderStore {
    fn default() -> Self {
        Self::with_credentials(Arc::new(SystemCredentialStore::default()))
    }
}

impl AiProviderStore {
    pub(crate) fn with_credentials(credentials: Arc<dyn AiCredentialStore>) -> Self {
        Self {
            credentials,
            client: ControlledHttpClient::new().expect("controlled provider HTTP client"),
            preview: Mutex::new(None),
            history: Mutex::new(HttpHistoryState::default()),
            active_cancel: Mutex::new(None),
            catalogs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub(crate) fn close_activity_active(&self) -> bool {
        self.active_cancel
            .lock()
            .expect("AI provider cancellation mutex poisoned")
            .is_some()
    }

    fn invalidate_profile(&self, profile_id: Uuid) {
        let should_clear = self
            .preview
            .lock()
            .expect("AI provider preview mutex poisoned")
            .as_ref()
            .is_some_and(|preview| preview.profile.profile_id == profile_id);
        if should_clear {
            self.clear_session();
        }
        self.catalogs
            .lock()
            .expect("AI provider catalog mutex poisoned")
            .remove(&profile_id);
    }

    pub(crate) fn clear_session(&self) {
        if let Some(cancel) = self
            .active_cancel
            .lock()
            .expect("AI provider cancellation mutex poisoned")
            .as_ref()
        {
            cancel.store(true, Ordering::Release);
        }
        *self
            .preview
            .lock()
            .expect("AI provider preview mutex poisoned") = None;
        let mut history = self
            .history
            .lock()
            .expect("AI provider history mutex poisoned");
        history.fingerprint = None;
        history.entries.clear();
    }

    pub(crate) fn interrupt(&self) -> bool {
        let guard = self
            .active_cancel
            .lock()
            .expect("AI provider cancellation mutex poisoned");
        if let Some(cancel) = guard.as_ref() {
            cancel.store(true, Ordering::Release);
            true
        } else {
            false
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct AiProviderTurnInput {
    pub(crate) trusted_context: Value,
    pub(crate) language: String,
    pub(crate) question: String,
    pub(crate) model_id: String,
    pub(crate) history: Vec<AiProviderHistoryItem>,
}

#[derive(Clone, Debug)]
pub(crate) struct AiProviderHistoryItem {
    pub(crate) question: String,
    pub(crate) answer: StructuredAiAnswer,
}

#[derive(Clone, Debug)]
pub(crate) struct AiProviderCompletion {
    pub(crate) answer: StructuredAiAnswer,
    pub(crate) token_usage: Option<AiTokenUsageView>,
}

fn is_safe_request_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn is_safe_text(value: &str, maximum: usize) -> bool {
    !value.is_empty() && value.chars().count() <= maximum && !value.chars().any(char::is_control)
}

fn is_safe_model_id(value: &str) -> bool {
    is_safe_text(value, MAX_MODEL_ID_CHARS)
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'/' | b':' | b'@')
        })
        && !value.contains("..")
}

fn safe_language(value: &str) -> bool {
    matches!(value, "zh-CN" | "en")
}

fn normalize_base_url(value: &str) -> Result<String, AiProviderError> {
    if value.chars().count() > MAX_URL_CHARS || value.chars().any(char::is_control) {
        return Err(AiProviderError::new("ai_provider_endpoint_rejected"));
    }
    let raw = value.trim();
    let raw_lower = raw.to_ascii_lowercase();
    if raw_lower.contains("%2e")
        || raw_lower.contains("%2f")
        || raw_lower.contains("%5c")
        || raw_lower.contains("%00")
    {
        return Err(AiProviderError::new("ai_provider_endpoint_rejected"));
    }
    let mut url =
        Url::parse(raw).map_err(|_| AiProviderError::new("ai_provider_endpoint_rejected"))?;
    if url.username() != ""
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
        || url.host_str().is_none()
    {
        return Err(AiProviderError::new("ai_provider_endpoint_rejected"));
    }
    match url.scheme() {
        "https" => {}
        "http" if is_loopback_host(url.host_str().unwrap_or_default()) => {}
        _ => return Err(AiProviderError::new("ai_provider_endpoint_rejected")),
    }
    let path = url.path().replace('\\', "/");
    let encoded_path = path.to_ascii_lowercase();
    if path.contains("..")
        || path.contains('\0')
        || encoded_path.contains("%2e")
        || encoded_path.contains("%2f")
        || encoded_path.contains("%5c")
        || encoded_path.contains("%00")
    {
        return Err(AiProviderError::new("ai_provider_endpoint_rejected"));
    }
    if !url.path().ends_with('/') {
        url.set_path(&format!("{}/", url.path()));
    }
    Ok(url.to_string())
}

fn is_loopback_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "::1")
}

fn network_scope(profile: &AiProviderProfile) -> String {
    if profile.protocol == AiProviderProtocol::CodexAppServer {
        return "codex_managed".to_string();
    }
    profile
        .base_url
        .as_deref()
        .and_then(|value| Url::parse(value).ok())
        .filter(|url| url.scheme() == "http")
        .map(|_| "loopback_http".to_string())
        .unwrap_or_else(|| "remote_https".to_string())
}

fn normalized_origin(profile: &AiProviderProfile) -> Option<String> {
    let url = Url::parse(profile.base_url.as_deref()?).ok()?;
    let host = url.host_str()?;
    let host = if host.contains(':') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    let port = url
        .port()
        .map(|port| format!(":{port}"))
        .unwrap_or_default();
    Some(format!("{}://{}{}", url.scheme(), host, port))
}

fn validate_profile(profile: &AiProviderProfile) -> Result<(), AiProviderError> {
    if profile.profile_id.is_nil()
        || !is_safe_text(&profile.display_name, MAX_DISPLAY_NAME_CHARS)
        || profile.config_revision == 0
        || profile.manual_model_ids.len() > 64
        || profile
            .manual_model_ids
            .iter()
            .any(|model| !is_safe_model_id(model))
        || profile
            .manual_model_ids
            .windows(2)
            .any(|window| window[0] == window[1])
        || profile
            .selected_model_id
            .as_deref()
            .is_some_and(|model| !is_safe_model_id(model))
    {
        return Err(AiProviderError::new("ai_provider_profile_invalid"));
    }
    match profile.protocol {
        AiProviderProtocol::CodexAppServer => {
            if profile.base_url.is_some() || profile.auth_kind != AiProviderAuthKind::CodexManaged {
                return Err(AiProviderError::new("ai_provider_profile_invalid"));
            }
        }
        _ => {
            if profile.auth_kind == AiProviderAuthKind::CodexManaged {
                return Err(AiProviderError::new("ai_provider_profile_invalid"));
            }
            normalize_base_url(
                profile
                    .base_url
                    .as_deref()
                    .ok_or_else(|| AiProviderError::new("ai_provider_profile_invalid"))?,
            )?;
        }
    }
    if !profile.built_in && profile.protocol != AiProviderProtocol::OpenAiChatCompletions {
        return Err(AiProviderError::new("ai_provider_profile_invalid"));
    }
    if profile.built_in {
        let preset = profile
            .preset_id
            .as_deref()
            .and_then(preset_definition)
            .ok_or_else(|| AiProviderError::new("ai_provider_profile_invalid"))?;
        if profile.display_name != preset.name
            || profile.protocol != preset.protocol
            || profile.base_url.as_deref() != preset.base_url
            || profile.auth_kind != preset.auth_kind
        {
            return Err(AiProviderError::new("ai_provider_profile_invalid"));
        }
    }
    Ok(())
}

fn validate_profile_file(file: &ProfileFile) -> Result<(), AiProviderError> {
    if file.schema_version != PROFILE_SCHEMA_VERSION
        || file.profiles.is_empty()
        || file.profiles.len() > MAX_PROFILES
    {
        return Err(AiProviderError::new("ai_provider_profile_invalid"));
    }
    let mut ids = Vec::new();
    for profile in &file.profiles {
        validate_profile(profile)?;
        if ids.contains(&profile.profile_id) {
            return Err(AiProviderError::new("ai_provider_profile_invalid"));
        }
        ids.push(profile.profile_id);
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct PresetDefinition {
    id: &'static str,
    name: &'static str,
    protocol: AiProviderProtocol,
    base_url: Option<&'static str>,
    auth_kind: AiProviderAuthKind,
}

fn preset_definitions() -> &'static [PresetDefinition] {
    &[
        PresetDefinition {
            id: "codex",
            name: "Codex",
            protocol: AiProviderProtocol::CodexAppServer,
            base_url: None,
            auth_kind: AiProviderAuthKind::CodexManaged,
        },
        PresetDefinition {
            id: "openai",
            name: "OpenAI",
            protocol: AiProviderProtocol::OpenAiResponses,
            base_url: Some("https://api.openai.com/v1/"),
            auth_kind: AiProviderAuthKind::ApiKey,
        },
        PresetDefinition {
            id: "anthropic",
            name: "Anthropic",
            protocol: AiProviderProtocol::AnthropicMessages,
            base_url: Some("https://api.anthropic.com/v1/"),
            auth_kind: AiProviderAuthKind::ApiKey,
        },
        PresetDefinition {
            id: "gemini",
            name: "Google Gemini",
            protocol: AiProviderProtocol::OpenAiChatCompletions,
            base_url: Some("https://generativelanguage.googleapis.com/v1beta/openai/"),
            auth_kind: AiProviderAuthKind::ApiKey,
        },
        PresetDefinition {
            id: "openrouter",
            name: "OpenRouter",
            protocol: AiProviderProtocol::OpenAiChatCompletions,
            base_url: Some("https://openrouter.ai/api/v1/"),
            auth_kind: AiProviderAuthKind::ApiKey,
        },
        PresetDefinition {
            id: "deepseek",
            name: "DeepSeek",
            protocol: AiProviderProtocol::OpenAiChatCompletions,
            base_url: Some("https://api.deepseek.com/"),
            auth_kind: AiProviderAuthKind::ApiKey,
        },
        PresetDefinition {
            id: "ollama",
            name: "Ollama",
            protocol: AiProviderProtocol::OpenAiChatCompletions,
            base_url: Some("http://127.0.0.1:11434/v1/"),
            auth_kind: AiProviderAuthKind::None,
        },
        PresetDefinition {
            id: "lm_studio",
            name: "LM Studio",
            protocol: AiProviderProtocol::OpenAiChatCompletions,
            base_url: Some("http://127.0.0.1:1234/v1/"),
            auth_kind: AiProviderAuthKind::None,
        },
        PresetDefinition {
            id: "vllm",
            name: "vLLM",
            protocol: AiProviderProtocol::OpenAiChatCompletions,
            base_url: Some("http://127.0.0.1:8000/v1/"),
            auth_kind: AiProviderAuthKind::None,
        },
    ]
}

fn builtin_profiles() -> Vec<AiProviderProfile> {
    preset_definitions()
        .iter()
        .map(|definition| AiProviderProfile {
            profile_id: Uuid::new_v5(&PROFILE_NAMESPACE, definition.id.as_bytes()),
            preset_id: Some(definition.id.to_string()),
            display_name: definition.name.to_string(),
            protocol: definition.protocol,
            base_url: definition.base_url.map(str::to_string),
            auth_kind: definition.auth_kind,
            built_in: true,
            manual_model_ids: Vec::new(),
            selected_model_id: None,
            capabilities: AiProviderCapabilities {
                model_catalog: true,
                streaming: true,
                token_usage: matches!(
                    definition.protocol,
                    AiProviderProtocol::OpenAiResponses | AiProviderProtocol::AnthropicMessages
                ),
                structured_json_schema: definition.protocol == AiProviderProtocol::OpenAiResponses,
            },
            config_revision: 1,
        })
        .collect()
}

pub(crate) fn codex_profile_id() -> Uuid {
    Uuid::new_v5(&PROFILE_NAMESPACE, b"codex")
}

fn preset_definition(preset_id: &str) -> Option<PresetDefinition> {
    preset_definitions()
        .iter()
        .copied()
        .find(|definition| definition.id == preset_id)
}

fn merge_builtin_profiles(file: &mut ProfileFile) -> Result<bool, AiProviderError> {
    let mut changed = false;
    for builtin in builtin_profiles() {
        match file
            .profiles
            .iter()
            .position(|profile| profile.preset_id == builtin.preset_id)
        {
            Some(index) => {
                let existing = &file.profiles[index];
                if !existing.built_in
                    || existing.protocol != builtin.protocol
                    || existing.base_url != builtin.base_url
                    || existing.auth_kind != builtin.auth_kind
                {
                    return Err(AiProviderError::new("ai_provider_profile_invalid"));
                }
            }
            None => {
                if file.profiles.len() >= MAX_PROFILES {
                    return Err(AiProviderError::new("ai_provider_profile_invalid"));
                }
                file.profiles.push(builtin);
                changed = true;
            }
        }
    }
    Ok(changed)
}

fn profiles_path(app: &AppHandle) -> Result<PathBuf, AiProviderError> {
    app.path()
        .app_local_data_dir()
        .map(|root| root.join("ai").join("providers").join("profiles.json"))
        .map_err(|_| AiProviderError::new("ai_provider_profile_store_unavailable"))
}

fn catalog_cache_path(app: &AppHandle) -> Result<PathBuf, AiProviderError> {
    app.path()
        .app_local_data_dir()
        .map(|root| root.join("ai").join("providers").join("model-catalog.json"))
        .map_err(|_| AiProviderError::new("ai_provider_profile_store_unavailable"))
}

fn read_catalog_cache(path: &Path) -> Result<CatalogCacheFile, AiProviderError> {
    if !path.exists() {
        return Ok(CatalogCacheFile {
            schema_version: catalog::CATALOG_CACHE_SCHEMA_VERSION,
            entries: HashMap::new(),
        });
    }
    let metadata = fs::metadata(path)
        .map_err(|_| AiProviderError::new("ai_provider_profile_store_unavailable"))?;
    if metadata.len() > PROFILE_FILE_LIMIT {
        return Err(AiProviderError::new("ai_provider_model_catalog_failed"));
    }
    let bytes = fs::read(path)
        .map_err(|_| AiProviderError::new("ai_provider_profile_store_unavailable"))?;
    let file: CatalogCacheFile = serde_json::from_slice(&bytes)
        .map_err(|_| AiProviderError::new("ai_provider_model_catalog_failed"))?;
    if file.schema_version != catalog::CATALOG_CACHE_SCHEMA_VERSION {
        return Err(AiProviderError::new("ai_provider_model_catalog_failed"));
    }
    Ok(CatalogCacheFile {
        schema_version: file.schema_version,
        entries: file
            .entries
            .into_iter()
            .filter_map(|(id, snapshot)| {
                let profile_id = Uuid::parse_str(&id).ok()?;
                let _ = profile_id;
                Some((id, catalog::mark_stale(&snapshot)))
            })
            .collect(),
    })
}

fn write_catalog_cache(
    path: &Path,
    entries: &HashMap<Uuid, CatalogSnapshot>,
) -> Result<(), AiProviderError> {
    let cache = CatalogCacheFile {
        schema_version: catalog::CATALOG_CACHE_SCHEMA_VERSION,
        entries: entries
            .iter()
            .map(|(id, snapshot)| (id.to_string(), snapshot.clone()))
            .collect(),
    };
    let bytes = serde_json::to_vec_pretty(&cache)
        .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
    let parent = path
        .parent()
        .ok_or_else(|| AiProviderError::new("ai_provider_profile_write_failed"))?;
    fs::create_dir_all(parent)
        .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
    let temp = parent.join(format!(".model-catalog-{}.tmp", Uuid::new_v4()));
    if fs::write(&temp, &bytes).is_err() {
        let _ = fs::remove_file(&temp);
        return Err(AiProviderError::new("ai_provider_profile_write_failed"));
    }
    if path.exists() && fs::remove_file(path).is_err() {
        let _ = fs::remove_file(&temp);
        return Err(AiProviderError::new("ai_provider_profile_write_failed"));
    }
    if fs::rename(&temp, path).is_err() {
        let _ = fs::remove_file(&temp);
        return Err(AiProviderError::new("ai_provider_profile_write_failed"));
    }
    Ok(())
}

fn read_profiles(path: &Path) -> Result<ProfileFile, AiProviderError> {
    if !path.exists() {
        let file = ProfileFile::default();
        write_profiles(path, &file)?;
        return Ok(file);
    }
    let metadata = fs::metadata(path)
        .map_err(|_| AiProviderError::new("ai_provider_profile_store_unavailable"))?;
    if metadata.len() > PROFILE_FILE_LIMIT {
        return Err(AiProviderError::new("ai_provider_profile_invalid"));
    }
    let bytes = fs::read(path)
        .map_err(|_| AiProviderError::new("ai_provider_profile_store_unavailable"))?;
    let mut file: ProfileFile = serde_json::from_slice(&bytes)
        .map_err(|_| AiProviderError::new("ai_provider_profile_invalid"))?;
    validate_profile_file(&file)?;
    if merge_builtin_profiles(&mut file)? {
        write_profiles(path, &file)?;
    }
    Ok(file)
}

fn write_profiles(path: &Path, file: &ProfileFile) -> Result<(), AiProviderError> {
    validate_profile_file(file)?;
    let bytes = serde_json::to_vec_pretty(file)
        .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
    if bytes.len() > PROFILE_FILE_LIMIT as usize {
        return Err(AiProviderError::new("ai_provider_profile_write_failed"));
    }
    let parent = path
        .parent()
        .ok_or_else(|| AiProviderError::new("ai_provider_profile_write_failed"))?;
    fs::create_dir_all(parent)
        .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
    let temp_path = parent.join(format!(".profiles-{}.tmp", Uuid::new_v4()));
    let backup_path = path.with_extension("json.bak");
    let write_result = (|| {
        let mut file_handle = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
        file_handle
            .write_all(&bytes)
            .and_then(|_| file_handle.sync_all())
            .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
        if path.exists() {
            fs::copy(path, &backup_path)
                .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
            let backup_file = OpenOptions::new()
                .read(true)
                .write(true)
                .open(&backup_path)
                .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
            backup_file
                .sync_all()
                .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
        }
        fs::rename(&temp_path, path)
            .map_err(|_| AiProviderError::new("ai_provider_profile_write_failed"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    write_result
}

pub(crate) fn load_profile(
    app: &AppHandle,
    profile_id: &str,
) -> Result<AiProviderProfile, AiProviderError> {
    let profile_id = Uuid::parse_str(profile_id)
        .map_err(|_| AiProviderError::new("ai_provider_profile_not_found"))?;
    let path = profiles_path(app)?;
    let file = read_profiles(&path)?;
    file.profiles
        .into_iter()
        .find(|profile| profile.profile_id == profile_id)
        .ok_or_else(|| AiProviderError::new("ai_provider_profile_not_found"))
}

fn find_profile_mut(
    profiles: &mut [AiProviderProfile],
    profile_id: Uuid,
) -> Result<&mut AiProviderProfile, AiProviderError> {
    profiles
        .iter_mut()
        .find(|profile| profile.profile_id == profile_id)
        .ok_or_else(|| AiProviderError::new("ai_provider_profile_not_found"))
}

fn model_is_allowed(store: &AiProviderStore, profile: &AiProviderProfile, model_id: &str) -> bool {
    is_safe_model_id(model_id)
        && (profile.selected_model_id.as_deref() == Some(model_id)
            || profile.manual_model_ids.iter().any(|item| item == model_id)
            || store
                .catalogs
                .lock()
                .ok()
                .and_then(|catalogs| catalogs.get(&profile.profile_id).cloned())
                .is_some_and(|catalog| {
                    catalog.models.iter().any(|model| {
                        model.id == model_id
                            && model.available
                            && model.verified_for_current_adapter
                    })
                }))
}

fn credential_error(error: CredentialError, write: bool) -> AiProviderError {
    match error {
        CredentialError::Unavailable => {
            AiProviderError::new("ai_provider_secret_store_unavailable")
        }
        CredentialError::WriteFailed if write => {
            AiProviderError::new("ai_provider_secret_write_failed")
        }
        CredentialError::DeleteFailed if !write => {
            AiProviderError::new("ai_provider_secret_delete_failed")
        }
        _ => AiProviderError::new(if write {
            "ai_provider_secret_write_failed"
        } else {
            "ai_provider_secret_delete_failed"
        }),
    }
}

fn secret_state(profile: &AiProviderProfile, credentials: &dyn AiCredentialStore) -> String {
    match profile.auth_kind {
        AiProviderAuthKind::CodexManaged => "codex_managed".to_string(),
        AiProviderAuthKind::None => "not_required".to_string(),
        AiProviderAuthKind::ApiKey => match credentials.get(profile.profile_id) {
            Ok(Some(_)) => "present".to_string(),
            Ok(None) => "missing".to_string(),
            Err(_) => "unavailable".to_string(),
        },
    }
}

fn profile_view(
    profile: &AiProviderProfile,
    credentials: &dyn AiCredentialStore,
    catalog: Option<&CatalogSnapshot>,
) -> AiProviderView {
    let (catalog_verified, models) = catalog
        .map(|snapshot| (snapshot.verified, snapshot.models.clone()))
        .unwrap_or((false, Vec::new()));
    AiProviderView {
        profile_id: profile.profile_id,
        preset_id: profile.preset_id.clone(),
        display_name: profile.display_name.clone(),
        protocol: profile.protocol,
        base_url: profile.base_url.clone(),
        auth_kind: profile.auth_kind,
        built_in: profile.built_in,
        network_scope: network_scope(profile),
        secret_state: secret_state(profile, credentials),
        connection_status: "idle".to_string(),
        catalog_verified,
        models,
        manual_model_ids: if profile.built_in {
            Vec::new()
        } else {
            profile.manual_model_ids.clone()
        },
        selected_model_id: profile.selected_model_id.clone(),
        config_revision: profile.config_revision,
        capabilities: profile.capabilities.clone(),
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct DesktopAiProviderProfilesResponse {
    pub(crate) request_id: String,
    pub(crate) profiles: Vec<AiProviderView>,
    pub(crate) error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug, Serialize)]
pub struct DesktopAiProviderActionResponse {
    pub(crate) request_id: String,
    pub(crate) status: String,
    pub(crate) profiles: Option<Vec<AiProviderView>>,
    pub(crate) error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug, Serialize)]
pub struct DesktopAiProviderModelsResponse {
    pub(crate) request_id: String,
    pub(crate) profile_id: String,
    pub(crate) models: Vec<AiProviderModelView>,
    pub(crate) verified: bool,
    pub(crate) stale: bool,
    pub(crate) source: Option<String>,
    pub(crate) fetched_at: Option<String>,
    pub(crate) error: Option<AiDiagnostic>,
}

fn profiles_failure(
    request_id: String,
    error: AiProviderError,
) -> DesktopAiProviderProfilesResponse {
    DesktopAiProviderProfilesResponse {
        request_id,
        profiles: Vec::new(),
        error: Some(error.diagnostic()),
    }
}

fn action_failure(request_id: String, error: AiProviderError) -> DesktopAiProviderActionResponse {
    DesktopAiProviderActionResponse {
        request_id,
        status: "error".to_string(),
        profiles: None,
        error: Some(error.diagnostic()),
    }
}

fn models_failure(
    request_id: String,
    profile_id: String,
    error: AiProviderError,
) -> DesktopAiProviderModelsResponse {
    DesktopAiProviderModelsResponse {
        request_id,
        profile_id,
        models: Vec::new(),
        verified: false,
        stale: false,
        source: None,
        fetched_at: None,
        error: Some(error.diagnostic()),
    }
}

fn models_with_snapshot(
    request_id: String,
    profile_id: String,
    snapshot: CatalogSnapshot,
    error: Option<AiProviderError>,
) -> DesktopAiProviderModelsResponse {
    DesktopAiProviderModelsResponse {
        request_id,
        profile_id,
        models: snapshot.models,
        verified: snapshot.verified,
        stale: snapshot.stale,
        source: Some(snapshot.source),
        fetched_at: Some(snapshot.fetched_at),
        error: error.map(|value| value.diagnostic()),
    }
}

fn store_catalog_snapshot(
    app: &AppHandle,
    store: &AiProviderStore,
    profile_id: Uuid,
    snapshot: CatalogSnapshot,
) -> Result<CatalogSnapshot, AiProviderError> {
    let mut catalogs = store
        .catalogs
        .lock()
        .map_err(|_| AiProviderError::new("ai_provider_profile_store_unavailable"))?;
    catalogs.insert(profile_id, snapshot.clone());
    let entries = catalogs.clone();
    drop(catalogs);
    let cache_path = catalog_cache_path(app)?;
    write_catalog_cache(&cache_path, &entries)?;
    Ok(snapshot)
}

fn cached_catalog(store: &AiProviderStore, profile_id: Uuid) -> Option<CatalogSnapshot> {
    store
        .catalogs
        .lock()
        .ok()
        .and_then(|catalogs| catalogs.get(&profile_id).map(catalog::mark_stale))
}

fn models_failure_with_fallback(
    store: &AiProviderStore,
    request_id: String,
    profile_id: String,
    error: AiProviderError,
) -> DesktopAiProviderModelsResponse {
    let Ok(uuid) = Uuid::parse_str(&profile_id) else {
        return models_failure(request_id, profile_id, error);
    };
    if let Some(mut snapshot) = cached_catalog(store, uuid) {
        snapshot.stale = true;
        for model in &mut snapshot.models {
            model.stale = true;
        }
        return models_with_snapshot(request_id, profile_id, snapshot, Some(error));
    }
    models_failure(request_id, profile_id, error)
}

fn read_views(
    path: &Path,
    catalog_path: &Path,
    credentials: &dyn AiCredentialStore,
    catalogs: ProviderCatalogs,
) -> Result<Vec<AiProviderView>, AiProviderError> {
    let file = read_profiles(path)?;
    let cached = read_catalog_cache(catalog_path)?;
    let mut catalogs_guard = catalogs
        .lock()
        .map_err(|_| AiProviderError::new("ai_provider_profile_store_unavailable"))?;
    for profile in &file.profiles {
        if let Some(snapshot) = cached.entries.get(&profile.profile_id.to_string()) {
            catalogs_guard.insert(profile.profile_id, snapshot.clone());
        }
    }
    Ok(file
        .profiles
        .iter()
        .map(|profile| {
            profile_view(
                profile,
                credentials,
                catalogs_guard.get(&profile.profile_id),
            )
        })
        .collect())
}

#[tauri::command]
pub async fn list_ai_provider_profiles(
    app: AppHandle,
    request_id: String,
) -> DesktopAiProviderProfilesResponse {
    if !is_safe_request_id(&request_id) {
        return profiles_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_invalid"),
        );
    }
    let store = app.state::<AiProviderStore>();
    let path = match profiles_path(&app) {
        Ok(path) => path,
        Err(error) => return profiles_failure(request_id, error),
    };
    let catalog_path = match catalog_cache_path(&app) {
        Ok(path) => path,
        Err(error) => return profiles_failure(request_id, error),
    };
    let credentials = Arc::clone(&store.credentials);
    let catalogs = Arc::clone(&store.catalogs);
    match tauri::async_runtime::spawn_blocking(move || {
        read_views(&path, &catalog_path, credentials.as_ref(), catalogs)
    })
    .await
    {
        Ok(Ok(profiles)) => DesktopAiProviderProfilesResponse {
            request_id,
            profiles,
            error: None,
        },
        Ok(Err(error)) => profiles_failure(request_id, error),
        Err(_) => profiles_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_store_unavailable"),
        ),
    }
}

#[tauri::command]
pub async fn save_ai_provider_profile(
    app: AppHandle,
    request_id: String,
    mut profile: AiProviderProfile,
) -> DesktopAiProviderActionResponse {
    if !is_safe_request_id(&request_id) {
        return action_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_invalid"),
        );
    }
    if let Some(base_url) = profile.base_url.as_deref() {
        profile.base_url = Some(match normalize_base_url(base_url) {
            Ok(value) => value,
            Err(error) => return action_failure(request_id, error),
        });
    }
    if let Err(error) = validate_profile(&profile) {
        return action_failure(request_id, error);
    }
    let profile_id = profile.profile_id;
    let path = match profiles_path(&app) {
        Ok(path) => path,
        Err(error) => return action_failure(request_id, error),
    };
    let store = app.state::<AiProviderStore>();
    let credentials = Arc::clone(&store.credentials);
    let credentials_for_write = Arc::clone(&credentials);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut file = read_profiles(&path)?;
        let existing = file
            .profiles
            .iter()
            .find(|existing| existing.profile_id == profile_id)
            .cloned();
        let clear_existing_secret = existing.as_ref().is_some_and(|existing| {
            existing.auth_kind == AiProviderAuthKind::ApiKey
                && profile.auth_kind != AiProviderAuthKind::ApiKey
        });
        if let Some(existing) = existing {
            if existing.built_in
                && (profile.preset_id != existing.preset_id
                    || profile.protocol != existing.protocol
                    || profile.base_url != existing.base_url
                    || profile.auth_kind != existing.auth_kind)
            {
                return Err(AiProviderError::new("ai_provider_profile_invalid"));
            }
            profile.built_in = existing.built_in;
            profile.config_revision = existing.config_revision.saturating_add(1);
        } else {
            if profile.built_in || file.profiles.len() >= MAX_PROFILES {
                return Err(AiProviderError::new("ai_provider_profile_invalid"));
            }
            profile.config_revision = 1;
        }
        if clear_existing_secret {
            credentials_for_write
                .delete(profile_id)
                .map_err(|error| credential_error(error, false))?;
        }
        let slot = file
            .profiles
            .iter()
            .position(|existing| existing.profile_id == profile_id);
        if let Some(index) = slot {
            file.profiles[index] = profile;
        } else {
            file.profiles.push(profile);
        }
        validate_profile_file(&file)?;
        write_profiles(&path, &file)?;
        Ok::<_, AiProviderError>(file)
    })
    .await;
    match result {
        Ok(Ok(file)) => {
            store.invalidate_profile(profile_id);
            let catalogs = store.catalogs.lock().ok();
            let profiles = file
                .profiles
                .iter()
                .map(|item| {
                    profile_view(
                        item,
                        credentials.as_ref(),
                        catalogs
                            .as_ref()
                            .and_then(|value| value.get(&item.profile_id)),
                    )
                })
                .collect();
            DesktopAiProviderActionResponse {
                request_id,
                status: "saved".to_string(),
                profiles: Some(profiles),
                error: None,
            }
        }
        Ok(Err(error)) => action_failure(request_id, error),
        Err(_) => action_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_write_failed"),
        ),
    }
}

#[tauri::command]
pub async fn delete_ai_provider_profile(
    app: AppHandle,
    request_id: String,
    profile_id: String,
) -> DesktopAiProviderActionResponse {
    if !is_safe_request_id(&request_id) {
        return action_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_invalid"),
        );
    }
    let id = match Uuid::parse_str(&profile_id) {
        Ok(value) => value,
        Err(_) => {
            return action_failure(
                request_id,
                AiProviderError::new("ai_provider_profile_not_found"),
            )
        }
    };
    let path = match profiles_path(&app) {
        Ok(path) => path,
        Err(error) => return action_failure(request_id, error),
    };
    let store = app.state::<AiProviderStore>();
    let credentials = Arc::clone(&store.credentials);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut file = read_profiles(&path)?;
        let profile = file
            .profiles
            .iter()
            .find(|profile| profile.profile_id == id)
            .cloned()
            .ok_or_else(|| AiProviderError::new("ai_provider_profile_not_found"))?;
        if profile.built_in {
            return Err(AiProviderError::new("ai_provider_profile_invalid"));
        }
        if profile.auth_kind == AiProviderAuthKind::ApiKey {
            credentials
                .delete(id)
                .map_err(|error| credential_error(error, false))?;
        }
        file.profiles.retain(|item| item.profile_id != id);
        write_profiles(&path, &file)?;
        Ok::<_, AiProviderError>(file)
    })
    .await;
    match result {
        Ok(Ok(file)) => {
            store.invalidate_profile(id);
            let catalogs = store.catalogs.lock().ok();
            let profiles = file
                .profiles
                .iter()
                .map(|item| {
                    profile_view(
                        item,
                        store.credentials.as_ref(),
                        catalogs
                            .as_ref()
                            .and_then(|value| value.get(&item.profile_id)),
                    )
                })
                .collect();
            DesktopAiProviderActionResponse {
                request_id,
                status: "deleted".to_string(),
                profiles: Some(profiles),
                error: None,
            }
        }
        Ok(Err(error)) => action_failure(request_id, error),
        Err(_) => action_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_write_failed"),
        ),
    }
}

#[tauri::command]
pub async fn set_ai_provider_secret(
    app: AppHandle,
    request_id: String,
    profile_id: String,
    secret: String,
) -> DesktopAiProviderActionResponse {
    if !is_safe_request_id(&request_id)
        || secret.is_empty()
        || secret.chars().count() > MAX_SECRET_CHARS
        || secret.chars().any(char::is_control)
    {
        return action_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_invalid"),
        );
    }
    let id = match Uuid::parse_str(&profile_id) {
        Ok(value) => value,
        Err(_) => {
            return action_failure(
                request_id,
                AiProviderError::new("ai_provider_profile_not_found"),
            )
        }
    };
    let path = match profiles_path(&app) {
        Ok(path) => path,
        Err(error) => return action_failure(request_id, error),
    };
    let store = app.state::<AiProviderStore>();
    let credentials = Arc::clone(&store.credentials);
    let secret = SecretInput::new(secret);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut file = read_profiles(&path)?;
        let profile = find_profile_mut(&mut file.profiles, id)?;
        if profile.built_in && profile.protocol == AiProviderProtocol::CodexAppServer {
            return Err(AiProviderError::new("ai_provider_profile_invalid"));
        }
        if profile.auth_kind != AiProviderAuthKind::ApiKey {
            return Err(AiProviderError::new("ai_provider_profile_invalid"));
        }
        credentials
            .set(id, secret)
            .map_err(|error| credential_error(error, true))?;
        profile.config_revision = profile.config_revision.saturating_add(1);
        write_profiles(&path, &file)?;
        Ok::<_, AiProviderError>(file)
    })
    .await;
    match result {
        Ok(Ok(file)) => {
            store.invalidate_profile(id);
            let catalogs = store.catalogs.lock().ok();
            DesktopAiProviderActionResponse {
                request_id,
                status: "secret_saved".to_string(),
                profiles: Some(
                    file.profiles
                        .iter()
                        .map(|item| {
                            profile_view(
                                item,
                                store.credentials.as_ref(),
                                catalogs
                                    .as_ref()
                                    .and_then(|value| value.get(&item.profile_id)),
                            )
                        })
                        .collect(),
                ),
                error: None,
            }
        }
        Ok(Err(error)) => action_failure(request_id, error),
        Err(_) => action_failure(
            request_id,
            AiProviderError::new("ai_provider_secret_write_failed"),
        ),
    }
}

#[tauri::command]
pub async fn delete_ai_provider_secret(
    app: AppHandle,
    request_id: String,
    profile_id: String,
) -> DesktopAiProviderActionResponse {
    if !is_safe_request_id(&request_id) {
        return action_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_invalid"),
        );
    }
    let id = match Uuid::parse_str(&profile_id) {
        Ok(value) => value,
        Err(_) => {
            return action_failure(
                request_id,
                AiProviderError::new("ai_provider_profile_not_found"),
            )
        }
    };
    let path = match profiles_path(&app) {
        Ok(path) => path,
        Err(error) => return action_failure(request_id, error),
    };
    let store = app.state::<AiProviderStore>();
    let credentials = Arc::clone(&store.credentials);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut file = read_profiles(&path)?;
        let profile = find_profile_mut(&mut file.profiles, id)?;
        if profile.auth_kind != AiProviderAuthKind::ApiKey {
            return Err(AiProviderError::new("ai_provider_profile_invalid"));
        }
        credentials
            .delete(id)
            .map_err(|error| credential_error(error, false))?;
        profile.config_revision = profile.config_revision.saturating_add(1);
        write_profiles(&path, &file)?;
        Ok::<_, AiProviderError>(file)
    })
    .await;
    match result {
        Ok(Ok(file)) => {
            store.invalidate_profile(id);
            let catalogs = store.catalogs.lock().ok();
            DesktopAiProviderActionResponse {
                request_id,
                status: "secret_deleted".to_string(),
                profiles: Some(
                    file.profiles
                        .iter()
                        .map(|item| {
                            profile_view(
                                item,
                                store.credentials.as_ref(),
                                catalogs
                                    .as_ref()
                                    .and_then(|value| value.get(&item.profile_id)),
                            )
                        })
                        .collect(),
                ),
                error: None,
            }
        }
        Ok(Err(error)) => action_failure(request_id, error),
        Err(_) => action_failure(
            request_id,
            AiProviderError::new("ai_provider_secret_delete_failed"),
        ),
    }
}

fn auth_for_profile(
    profile: &AiProviderProfile,
    credentials: &dyn AiCredentialStore,
) -> Result<AuthHeader, AiProviderError> {
    auth_for_profile_mode(profile, credentials, false)
}

fn auth_for_profile_mode(
    profile: &AiProviderProfile,
    credentials: &dyn AiCredentialStore,
    gemini_models_catalog: bool,
) -> Result<AuthHeader, AiProviderError> {
    match profile.auth_kind {
        AiProviderAuthKind::None => Ok(AuthHeader::None),
        AiProviderAuthKind::CodexManaged => {
            Err(AiProviderError::new("ai_provider_profile_invalid"))
        }
        AiProviderAuthKind::ApiKey => credentials
            .get(profile.profile_id)
            .map_err(|error| credential_error(error, true))?
            .map(|secret| {
                if profile.protocol == AiProviderProtocol::AnthropicMessages {
                    AuthHeader::Anthropic(secret.into_zeroizing())
                } else if profile.preset_id.as_deref() == Some("gemini") {
                    if gemini_models_catalog {
                        AuthHeader::GeminiModels(secret.into_zeroizing())
                    } else {
                        AuthHeader::GeminiOpenAi(secret.into_zeroizing())
                    }
                } else {
                    AuthHeader::Bearer(secret.into_zeroizing())
                }
            })
            .ok_or_else(|| AiProviderError::new("ai_provider_secret_missing")),
    }
}

fn profile_base_url(profile: &AiProviderProfile) -> Result<Url, AiProviderError> {
    Url::parse(
        profile
            .base_url
            .as_deref()
            .ok_or_else(|| AiProviderError::new("ai_provider_endpoint_rejected"))?,
    )
    .map_err(|_| AiProviderError::new("ai_provider_endpoint_rejected"))
}

async fn list_models_for_profile(
    store: &AiProviderStore,
    profile: &AiProviderProfile,
) -> Result<CatalogSnapshot, AiProviderError> {
    let fetched_at = catalog::timestamp_now();
    if profile.preset_id.as_deref() == Some("gemini") {
        let url = Url::parse("https://generativelanguage.googleapis.com/v1beta/models")
            .map_err(|_| AiProviderError::new("ai_provider_endpoint_rejected"))?;
        let value = store
            .client
            .get_json(
                &url,
                auth_for_profile_mode(profile, store.credentials.as_ref(), true)?,
            )
            .await?;
        return catalog::parse_gemini_models(profile, &value, &fetched_at);
    }

    let auth = auth_for_profile(profile, store.credentials.as_ref())?;
    let base = profile_base_url(profile)?;
    let mut url = endpoint_url(&base, "models")?;
    if profile.protocol == AiProviderProtocol::AnthropicMessages {
        let mut all_models = Vec::new();
        let mut after_id = None;
        for _page in 0..20 {
            if let Some(after_id) = after_id.as_deref() {
                url.query_pairs_mut().append_pair("after_id", after_id);
            }
            let value = store
                .client
                .get_json(&url, auth_for_profile(profile, store.credentials.as_ref())?)
                .await?;
            let (page, next) = catalog::parse_anthropic_models(profile, &value, &fetched_at)?;
            all_models.extend(page.models);
            after_id = next;
            if after_id.is_none() {
                return Ok(CatalogSnapshot {
                    source: "official_api".to_string(),
                    fetched_at,
                    stale: false,
                    verified: true,
                    models: all_models,
                });
            }
            url = endpoint_url(&base, "models")?;
        }
        return Err(AiProviderError::new("ai_provider_model_catalog_failed"));
    }

    let value = store.client.get_json(&url, auth).await?;
    if profile.preset_id.as_deref() == Some("openai") {
        catalog::parse_openai_models(profile, &value, &fetched_at)
    } else {
        catalog::parse_openai_compatible_models(profile, &value, &fetched_at)
    }
}

#[tauri::command]
pub async fn test_ai_provider_connection(
    app: AppHandle,
    request_id: String,
    profile_id: String,
) -> DesktopAiProviderActionResponse {
    if !is_safe_request_id(&request_id) {
        return action_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_invalid"),
        );
    }
    let profile = match load_profile(&app, &profile_id) {
        Ok(profile) if profile.protocol.is_http() => profile,
        Ok(_) => {
            return action_failure(
                request_id,
                AiProviderError::new("ai_provider_profile_invalid"),
            )
        }
        Err(error) => return action_failure(request_id, error),
    };
    let store = app.state::<AiProviderStore>();
    match list_models_for_profile(&store, &profile).await {
        Ok(_) => DesktopAiProviderActionResponse {
            request_id,
            status: "connected".to_string(),
            profiles: None,
            error: None,
        },
        Err(error) if !profile.built_in && error.code == "ai_provider_model_catalog_failed" => {
            DesktopAiProviderActionResponse {
                request_id,
                status: "connected_manual_catalog".to_string(),
                profiles: None,
                error: None,
            }
        }
        Err(error) => action_failure(request_id, error),
    }
}

#[tauri::command]
pub async fn refresh_ai_provider_models(
    app: AppHandle,
    request_id: String,
    profile_id: String,
) -> DesktopAiProviderModelsResponse {
    if !is_safe_request_id(&request_id) {
        return models_failure(
            request_id,
            profile_id,
            AiProviderError::new("ai_provider_profile_invalid"),
        );
    }
    let profile = match load_profile(&app, &profile_id) {
        Ok(profile) if profile.protocol.is_http() => profile,
        Ok(_) => {
            return models_failure(
                request_id,
                profile_id,
                AiProviderError::new("ai_provider_profile_invalid"),
            )
        }
        Err(error) => return models_failure(request_id, profile_id, error),
    };
    let store = app.state::<AiProviderStore>();
    match list_models_for_profile(&store, &profile).await {
        Ok(snapshot) => match store_catalog_snapshot(&app, &store, profile.profile_id, snapshot) {
            Ok(snapshot) => models_with_snapshot(request_id, profile_id, snapshot, None),
            Err(error) => models_failure_with_fallback(&store, request_id, profile_id, error),
        },
        Err(error) if !profile.built_in && error.code == "ai_provider_model_catalog_failed" => {
            let snapshot = catalog::manual_snapshot(&profile, &catalog::timestamp_now());
            match store_catalog_snapshot(&app, &store, profile.profile_id, snapshot) {
                Ok(snapshot) => models_with_snapshot(request_id, profile_id, snapshot, None),
                Err(write_error) => {
                    models_failure_with_fallback(&store, request_id, profile_id, write_error)
                }
            }
        }
        Err(error) => models_failure_with_fallback(&store, request_id, profile_id, error),
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn preview_http_ai_context(
    app: &AppHandle,
    request_id: String,
    provider_profile_id: String,
    project_session_id: String,
    revision_id: String,
    zone_id: String,
    scopes: Vec<String>,
    language: String,
    model_id: String,
    reasoning_effort: String,
    analysis_selection: AiAnalysisSelection,
) -> DesktopAiContextPreviewResponse {
    if !is_safe_request_id(&request_id)
        || !is_safe_request_id(&project_session_id)
        || Uuid::parse_str(&revision_id).is_err()
        || Uuid::parse_str(&zone_id).is_err()
        || !safe_language(&language)
        || !is_safe_model_id(&model_id)
        || !is_safe_text(&reasoning_effort, MAX_REASONING_EFFORT_CHARS)
    {
        return crate::codex_app_server::preview_failure(
            request_id,
            AiProviderError::new("ai_provider_profile_invalid").diagnostic(),
        );
    }
    let scopes = match crate::codex_app_server::canonical_scopes(scopes) {
        Ok(scopes) => scopes,
        Err(error) => return crate::codex_app_server::preview_failure(request_id, error),
    };
    let profile = match load_profile(app, &provider_profile_id) {
        Ok(profile) if profile.protocol.is_http() => profile,
        Ok(_) => {
            return crate::codex_app_server::preview_failure(
                request_id,
                AiProviderError::new("ai_provider_profile_invalid").diagnostic(),
            )
        }
        Err(error) => {
            return crate::codex_app_server::preview_failure(request_id, error.diagnostic())
        }
    };
    let store = app.state::<AiProviderStore>();
    if !model_is_allowed(&store, &profile, &model_id) {
        return crate::codex_app_server::preview_failure(
            request_id,
            AiProviderError::new("ai_provider_model_unavailable").diagnostic(),
        );
    }
    let context = match crate::codex_app_server::build_trusted_context_with_attachments(
        app,
        crate::codex_app_server::TrustedContextRequest {
            project_session_id: &project_session_id,
            revision_id: &revision_id,
            zone_id: &zone_id,
            scopes: &scopes,
            language: &language,
            model_id: &model_id,
            analysis_selection: &analysis_selection,
        },
    ) {
        Ok(context) => context,
        Err(error) => return crate::codex_app_server::preview_failure(request_id, error),
    };
    let fingerprint = match crate::codex_app_server::context_fingerprint_for_provider(
        &context,
        &scopes,
        &profile,
        &model_id,
        &reasoning_effort,
    ) {
        Ok(value) => value,
        Err(error) => return crate::codex_app_server::preview_failure(request_id, error),
    };
    let excluded_scopes = crate::codex_app_server::all_context_scopes()
        .iter()
        .filter(|scope| !scopes.iter().any(|selected| selected == *scope))
        .map(|scope| (*scope).to_string())
        .collect();
    let view = AiContextDisclosureView {
        preview_id: request_id.clone(),
        project_session_id: context.project_session_id.clone(),
        revision_id: context.revision_id.clone(),
        revision_number: context.revision_number,
        zone_id: context.zone_id.clone(),
        zone_name: context.zone_name.clone(),
        included_scopes: scopes.clone(),
        excluded_scopes,
        context_fingerprint: fingerprint.clone(),
        payload: context.payload.clone(),
        disclosure: AiDisclosureBoundary {
            contains_local_paths: false,
            contains_prj_text: false,
            contains_complete_result_series: false,
            model_request_uses_network: true,
        },
        provider_profile_id: profile.profile_id.to_string(),
        provider_display_name: profile.display_name.clone(),
        provider_protocol: protocol_name(profile.protocol).to_string(),
        destination_origin: normalized_origin(&profile),
        network_scope: network_scope(&profile),
        model_id: model_id.clone(),
        analysis_selection,
    };
    *store
        .preview
        .lock()
        .expect("AI provider preview mutex poisoned") = Some(HttpPreviewRecord {
        preview_id: request_id.clone(),
        profile,
        context,
        view: view.clone(),
        fingerprint,
        scopes,
        language,
        model_id,
        reasoning_effort,
    });
    let mut history = store
        .history
        .lock()
        .expect("AI provider history mutex poisoned");
    history.fingerprint = Some(view.context_fingerprint.clone());
    history.entries.clear();
    DesktopAiContextPreviewResponse {
        request_id,
        preview: Some(view),
        error: None,
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn start_http_ai_turn(
    app: &AppHandle,
    request_id: String,
    provider_profile_id: String,
    project_session_id: String,
    revision_id: String,
    zone_id: String,
    preview_id: String,
    question: String,
    scopes: Vec<String>,
    language: String,
    model_id: String,
    reasoning_effort: String,
    analysis_selection: AiAnalysisSelection,
) -> DesktopAiTurnResponse {
    let failure = |error: AiProviderError| DesktopAiTurnResponse {
        request_id: request_id.clone(),
        status: "error".to_string(),
        answer: None,
        token_usage: None,
        archive: AiArchiveSaveView::default(),
        error: Some(error.diagnostic()),
    };
    if !is_safe_request_id(&request_id)
        || !is_safe_request_id(&project_session_id)
        || !is_safe_request_id(&preview_id)
        || Uuid::parse_str(&revision_id).is_err()
        || Uuid::parse_str(&zone_id).is_err()
        || !safe_language(&language)
        || question.trim().is_empty()
        || question.chars().count() > MAX_QUESTION_CHARS
    {
        return failure(AiProviderError::new("ai_turn_start_failed"));
    }
    let scopes = match crate::codex_app_server::canonical_scopes(scopes) {
        Ok(scopes) => scopes,
        Err(error) => {
            return DesktopAiTurnResponse {
                request_id,
                status: "error".to_string(),
                answer: None,
                token_usage: None,
                archive: AiArchiveSaveView::default(),
                error: Some(error),
            }
        }
    };
    let profile = match load_profile(app, &provider_profile_id) {
        Ok(profile) if profile.protocol.is_http() => profile,
        Ok(_) => return failure(AiProviderError::new("ai_provider_profile_invalid")),
        Err(error) => return failure(error),
    };
    let store = app.state::<AiProviderStore>();
    if !model_is_allowed(&store, &profile, &model_id) {
        return failure(AiProviderError::new("ai_provider_model_unavailable"));
    }
    if app
        .state::<crate::codex_app_server::CodexAssistantStore>()
        .close_activity_active()
        || store.close_activity_active()
    {
        return failure(AiProviderError::new("ai_turn_already_active"));
    }
    let preview = store
        .preview
        .lock()
        .expect("AI provider preview mutex poisoned")
        .clone();
    let Some(preview) = preview else {
        return failure(AiProviderError::new("ai_context_unavailable"));
    };
    if preview.preview_id != preview_id
        || preview.profile.profile_id != profile.profile_id
        || preview.profile.config_revision != profile.config_revision
        || preview.context.project_session_id != project_session_id
        || preview.context.revision_id != revision_id
        || preview.context.zone_id != zone_id
        || preview.scopes != scopes
        || preview.language != language
        || preview.model_id != model_id
        || preview.reasoning_effort != reasoning_effort
        || preview.view.analysis_selection != analysis_selection
    {
        return failure(AiProviderError::new("ai_context_stale"));
    }
    let current = match crate::codex_app_server::build_trusted_context_with_attachments(
        app,
        crate::codex_app_server::TrustedContextRequest {
            project_session_id: &project_session_id,
            revision_id: &revision_id,
            zone_id: &zone_id,
            scopes: &scopes,
            language: &language,
            model_id: &model_id,
            analysis_selection: &analysis_selection,
        },
    ) {
        Ok(context) => context,
        Err(error) => {
            return DesktopAiTurnResponse {
                request_id,
                status: "error".to_string(),
                answer: None,
                token_usage: None,
                archive: AiArchiveSaveView::default(),
                error: Some(error),
            }
        }
    };
    let current_fingerprint = match crate::codex_app_server::context_fingerprint_for_provider(
        &current,
        &scopes,
        &profile,
        &model_id,
        &reasoning_effort,
    ) {
        Ok(value) => value,
        Err(error) => {
            return DesktopAiTurnResponse {
                request_id,
                status: "error".to_string(),
                answer: None,
                token_usage: None,
                archive: AiArchiveSaveView::default(),
                error: Some(error),
            }
        }
    };
    if current_fingerprint != preview.fingerprint || current != preview.context {
        return failure(AiProviderError::new("ai_context_stale"));
    }
    let history = {
        let history = store
            .history
            .lock()
            .expect("AI provider history mutex poisoned");
        history
            .entries
            .iter()
            .map(|entry| AiProviderHistoryItem {
                question: entry.question.clone(),
                answer: entry.answer.clone(),
            })
            .collect()
    };
    let cancellation = Arc::new(AtomicBool::new(false));
    *store
        .active_cancel
        .lock()
        .expect("AI provider cancellation mutex poisoned") = Some(Arc::clone(&cancellation));
    let input = AiProviderTurnInput {
        trusted_context: preview.context.payload.clone(),
        language,
        question: question.clone(),
        model_id,
        history,
    };
    let result = tokio::time::timeout(
        TURN_TIMEOUT,
        dispatch_completion(&store, &profile, input, &cancellation),
    )
    .await
    .map_err(|_| AiProviderError::new("ai_provider_timeout"))
    .and_then(|result| result);
    *store
        .active_cancel
        .lock()
        .expect("AI provider cancellation mutex poisoned") = None;
    match result {
        Ok(completion) => {
            if cancellation.load(Ordering::Acquire) {
                return failure(AiProviderError::new("ai_provider_cancelled"));
            }
            let archive = crate::codex_app_server::persist_completed_ai_answer(
                app,
                crate::codex_app_server::PersistCompletedAiAnswerInput {
                    trusted: preview.context.clone(),
                    preview: preview.view.clone(),
                    language: preview.language.clone(),
                    model_id: preview.model_id.clone(),
                    reasoning_effort: preview.reasoning_effort.clone(),
                    question: question.clone(),
                    answer: completion.answer.clone(),
                },
            )
            .await;
            let mut history = store
                .history
                .lock()
                .expect("AI provider history mutex poisoned");
            history.entries.push(HttpHistoryEntry {
                question,
                answer: completion.answer.clone(),
            });
            while history.entries.len() > MAX_HISTORY_ENTRIES
                || serde_json::to_vec(
                    &history
                        .entries
                        .iter()
                        .map(|entry| {
                            json!({
                                "question": entry.question,
                                "answer": entry.answer,
                            })
                        })
                        .collect::<Vec<_>>(),
                )
                .map(|bytes| bytes.len() > MAX_HISTORY_BYTES)
                .unwrap_or(true)
            {
                if history.entries.is_empty() {
                    break;
                }
                history.entries.remove(0);
            }
            DesktopAiTurnResponse {
                request_id,
                status: "completed".to_string(),
                answer: Some(completion.answer),
                token_usage: completion.token_usage,
                archive,
                error: None,
            }
        }
        Err(error) => failure(error),
    }
}

async fn dispatch_completion(
    store: &AiProviderStore,
    profile: &AiProviderProfile,
    input: AiProviderTurnInput,
    cancel: &AtomicBool,
) -> Result<AiProviderCompletion, AiProviderError> {
    match profile.protocol {
        AiProviderProtocol::OpenAiResponses => {
            openai::complete(store, profile, input, cancel).await
        }
        AiProviderProtocol::OpenAiChatCompletions => {
            openai_compatible::complete(store, profile, input, cancel).await
        }
        AiProviderProtocol::AnthropicMessages => {
            anthropic::complete(store, profile, input, cancel).await
        }
        AiProviderProtocol::CodexAppServer => {
            Err(AiProviderError::new("ai_provider_profile_invalid"))
        }
    }
}

pub(crate) fn interrupt_http_turn(app: &AppHandle) -> bool {
    app.state::<AiProviderStore>().interrupt()
}

pub(crate) fn clear_http_session(app: &AppHandle) -> bool {
    let store = app.state::<AiProviderStore>();
    if store.close_activity_active() {
        return false;
    }
    store.clear_session();
    true
}
