use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{is_safe_model_id, AiProviderError, AiProviderModelView, AiProviderProfile};

pub(crate) const CATALOG_CACHE_SCHEMA_VERSION: u32 = 1;
pub(crate) const CATALOG_TTL_SECONDS: u64 = 24 * 60 * 60;
const MAX_MODELS_PER_RESPONSE: usize = 200;

/// Versioned, default-deny policy for the OpenAI Responses adapter.
///
/// `/v1/models` is an account-availability endpoint, not a capability
/// endpoint.  Keep this exact-ID intersection deliberately small and update
/// it only after checking the official model pages for Responses, streaming,
/// and Structured Outputs support.  A new model must not become selectable
/// merely because its name resembles an older GPT or o-series model.
pub(crate) const OPENAI_MODEL_CAPABILITY_POLICY_VERSION: &str =
    "openai.responses.structured_outputs.v1";
const OPENAI_DOCUMENTED_RESPONSES_STRUCTURED_STREAMING_MODELS: &[&str] = &[
    "gpt-5.6",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.2",
    "gpt-5.2-2025-12-11",
    "gpt-4.1",
    "gpt-4.1-2025-04-14",
    "gpt-4o",
    "gpt-4o-2024-08-06",
    "gpt-4o-2024-11-20",
    "gpt-4o-mini",
    "gpt-4o-mini-2024-07-18",
];

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub(crate) struct CatalogSnapshot {
    pub(crate) source: String,
    pub(crate) fetched_at: String,
    pub(crate) stale: bool,
    pub(crate) verified: bool,
    pub(crate) models: Vec<AiProviderModelView>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
pub(crate) struct CatalogCacheFile {
    pub(crate) schema_version: u32,
    pub(crate) entries: std::collections::HashMap<String, CatalogSnapshot>,
}

pub(crate) fn timestamp_now() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(value) => value.as_millis().to_string(),
        Err(_) => "0".to_string(),
    }
}

fn timestamp_is_stale(value: &str) -> bool {
    let Ok(fetched_at) = value.parse::<u64>() else {
        return true;
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default();
    now.saturating_sub(fetched_at) > CATALOG_TTL_SECONDS.saturating_mul(1000)
}

pub(crate) fn mark_stale(snapshot: &CatalogSnapshot) -> CatalogSnapshot {
    let mut next = snapshot.clone();
    next.stale = timestamp_is_stale(&next.fetched_at);
    next.models = next
        .models
        .into_iter()
        .map(|mut model| {
            model.stale = next.stale;
            model
        })
        .collect();
    next
}

fn provider_name(profile: &AiProviderProfile) -> String {
    profile
        .preset_id
        .clone()
        .unwrap_or_else(|| "custom".to_string())
}

#[allow(clippy::too_many_arguments)]
fn make_model(
    profile: &AiProviderProfile,
    id: String,
    display_name: String,
    source: &str,
    capabilities: Vec<&str>,
    availability: &str,
    verified: bool,
    fetched_at: &str,
) -> AiProviderModelView {
    AiProviderModelView {
        id,
        display_name,
        provider: provider_name(profile),
        source: source.to_string(),
        capabilities: capabilities.into_iter().map(str::to_string).collect(),
        availability: availability.to_string(),
        available: verified,
        fetched_at: Some(fetched_at.to_string()),
        stale: false,
        verified_for_current_adapter: verified,
    }
}

fn dedupe_push(
    models: &mut Vec<AiProviderModelView>,
    ids: &mut HashSet<String>,
    model: AiProviderModelView,
) -> Result<(), AiProviderError> {
    if models.len() >= MAX_MODELS_PER_RESPONSE {
        return Err(AiProviderError::new("ai_provider_model_catalog_failed"));
    }
    if ids.insert(model.id.clone()) {
        models.push(model);
    }
    Ok(())
}

fn openai_model_verification(id: &str) -> Option<bool> {
    let lower = id.to_ascii_lowercase();
    if [
        "embedding",
        "dall-e",
        "whisper",
        "tts",
        "audio",
        "image",
        "moderation",
        "transcribe",
        "realtime",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
    {
        return None;
    }
    Some(
        OPENAI_DOCUMENTED_RESPONSES_STRUCTURED_STREAMING_MODELS
            .iter()
            .any(|candidate| *candidate == lower),
    )
}

pub(crate) fn parse_openai_models(
    profile: &AiProviderProfile,
    value: &Value,
    fetched_at: &str,
) -> Result<CatalogSnapshot, AiProviderError> {
    let data = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| AiProviderError::new("ai_provider_model_catalog_failed"))?;
    let mut models = Vec::new();
    let mut ids = HashSet::new();
    for item in data {
        let Some(id) = item.get("id").and_then(Value::as_str) else {
            continue;
        };
        if !is_safe_model_id(id) {
            continue;
        }
        let Some(verified) = openai_model_verification(id) else {
            continue;
        };
        let model = make_model(
            profile,
            id.to_string(),
            id.to_string(),
            &format!("official_api+{OPENAI_MODEL_CAPABILITY_POLICY_VERSION}"),
            if verified {
                vec![
                    "text_generation",
                    "responses",
                    "streaming",
                    "structured_outputs",
                ]
            } else {
                vec!["unknown"]
            },
            if verified {
                "available"
            } else {
                "advanced_unverified"
            },
            verified,
            fetched_at,
        );
        dedupe_push(&mut models, &mut ids, model)?;
    }
    Ok(CatalogSnapshot {
        source: format!("official_api+{OPENAI_MODEL_CAPABILITY_POLICY_VERSION}"),
        fetched_at: fetched_at.to_string(),
        stale: false,
        verified: models
            .iter()
            .any(|model| model.verified_for_current_adapter),
        models,
    })
}

pub(crate) fn parse_openai_compatible_models(
    profile: &AiProviderProfile,
    value: &Value,
    fetched_at: &str,
) -> Result<CatalogSnapshot, AiProviderError> {
    let data = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| AiProviderError::new("ai_provider_model_catalog_failed"))?;
    let mut models = Vec::new();
    let mut ids = HashSet::new();
    for item in data {
        let Some(id) = item
            .get("id")
            .or_else(|| item.get("model"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        if !is_safe_model_id(id) {
            continue;
        }
        dedupe_push(
            &mut models,
            &mut ids,
            make_model(
                profile,
                id.to_string(),
                item.get("display_name")
                    .or_else(|| item.get("displayName"))
                    .and_then(Value::as_str)
                    .unwrap_or(id)
                    .to_string(),
                "official_api",
                vec!["text_generation", "chat"],
                "available",
                true,
                fetched_at,
            ),
        )?;
    }
    Ok(CatalogSnapshot {
        source: "official_api".to_string(),
        fetched_at: fetched_at.to_string(),
        stale: false,
        verified: true,
        models,
    })
}

pub(crate) fn parse_anthropic_models(
    profile: &AiProviderProfile,
    value: &Value,
    fetched_at: &str,
) -> Result<(CatalogSnapshot, Option<String>), AiProviderError> {
    let data = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| AiProviderError::new("ai_provider_model_catalog_failed"))?;
    let mut models = Vec::new();
    let mut ids = HashSet::new();
    for item in data {
        let Some(id) = item.get("id").and_then(Value::as_str) else {
            continue;
        };
        if !is_safe_model_id(id) || !id.to_ascii_lowercase().starts_with("claude-") {
            continue;
        }
        dedupe_push(
            &mut models,
            &mut ids,
            make_model(
                profile,
                id.to_string(),
                item.get("display_name")
                    .or_else(|| item.get("displayName"))
                    .and_then(Value::as_str)
                    .unwrap_or(id)
                    .to_string(),
                "official_api",
                vec!["text_generation", "messages"],
                "available",
                true,
                fetched_at,
            ),
        )?;
    }
    let next = if value.get("has_more").and_then(Value::as_bool) == Some(true) {
        value
            .get("last_id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|value| is_safe_model_id(value))
            .ok_or_else(|| AiProviderError::new("ai_provider_model_catalog_failed"))
            .map(Some)?
    } else {
        None
    };
    Ok((
        CatalogSnapshot {
            source: "official_api".to_string(),
            fetched_at: fetched_at.to_string(),
            stale: false,
            verified: true,
            models,
        },
        next,
    ))
}

pub(crate) fn parse_gemini_models(
    profile: &AiProviderProfile,
    value: &Value,
    fetched_at: &str,
) -> Result<CatalogSnapshot, AiProviderError> {
    let data = value
        .get("models")
        .and_then(Value::as_array)
        .ok_or_else(|| AiProviderError::new("ai_provider_model_catalog_failed"))?;
    let mut models = Vec::new();
    let mut ids = HashSet::new();
    for item in data {
        let Some(raw_name) = item.get("name").and_then(Value::as_str) else {
            continue;
        };
        let id = raw_name.strip_prefix("models/").unwrap_or(raw_name);
        let supported = item
            .get("supportedGenerationMethods")
            .or_else(|| item.get("supported_generation_methods"))
            .and_then(Value::as_array)
            .is_some_and(|methods| {
                methods
                    .iter()
                    .any(|method| method.as_str() == Some("generateContent"))
            });
        if !supported || !is_safe_model_id(id) {
            continue;
        }
        dedupe_push(
            &mut models,
            &mut ids,
            make_model(
                profile,
                id.to_string(),
                item.get("displayName")
                    .or_else(|| item.get("display_name"))
                    .and_then(Value::as_str)
                    .unwrap_or(id)
                    .to_string(),
                "official_api",
                vec!["text_generation", "generate_content"],
                "available",
                true,
                fetched_at,
            ),
        )?;
    }
    Ok(CatalogSnapshot {
        source: "official_api".to_string(),
        fetched_at: fetched_at.to_string(),
        stale: false,
        verified: true,
        models,
    })
}

pub(crate) fn manual_snapshot(profile: &AiProviderProfile, fetched_at: &str) -> CatalogSnapshot {
    let models = profile
        .manual_model_ids
        .iter()
        .filter(|id| is_safe_model_id(id))
        .map(|id| {
            make_model(
                profile,
                id.clone(),
                id.clone(),
                "manual_advanced",
                vec!["unknown"],
                "manual_custom",
                false,
                fetched_at,
            )
        })
        .collect();
    CatalogSnapshot {
        source: "manual_advanced".to_string(),
        fetched_at: fetched_at.to_string(),
        stale: false,
        verified: false,
        models,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_provider::{AiProviderAuthKind, AiProviderCapabilities, AiProviderProtocol};
    use uuid::Uuid;

    fn profile(preset_id: Option<&str>, protocol: AiProviderProtocol) -> AiProviderProfile {
        AiProviderProfile {
            profile_id: Uuid::new_v4(),
            preset_id: preset_id.map(str::to_string),
            display_name: "Test Provider".to_string(),
            protocol,
            base_url: Some("https://provider.example/v1/".to_string()),
            auth_kind: AiProviderAuthKind::None,
            built_in: preset_id.is_some(),
            manual_model_ids: vec!["manual/model".to_string()],
            selected_model_id: None,
            capabilities: AiProviderCapabilities::default(),
            config_revision: 1,
        }
    }

    #[test]
    fn openai_catalog_intersects_account_models_with_documented_capabilities() {
        let value = serde_json::json!({
            "data": [
                {"id": "gpt-5.2"},
                {"id": "gpt-5.2-pro"},
                {"id": "gpt-5.2-pro-2025-12-11"},
                {"id": "gpt-9-future"},
                {"id": "text-embedding-3-large"},
                {"id": "dall-e-3"},
                {"id": "gpt-realtime"},
                {"id": "gpt-4o-mini"}
            ]
        });
        let snapshot = parse_openai_models(
            &profile(Some("openai"), AiProviderProtocol::OpenAiResponses),
            &value,
            "100",
        )
        .unwrap();
        assert_eq!(snapshot.models.len(), 5);
        assert_eq!(snapshot.models[0].id, "gpt-5.2");
        assert!(snapshot.models[0].verified_for_current_adapter);
        assert_eq!(snapshot.models[1].id, "gpt-5.2-pro");
        assert_eq!(snapshot.models[1].availability, "advanced_unverified");
        assert!(!snapshot.models[1].available);
        assert_eq!(snapshot.models[2].id, "gpt-5.2-pro-2025-12-11");
        assert!(!snapshot.models[2].verified_for_current_adapter);
        assert_eq!(snapshot.models[3].id, "gpt-9-future");
        assert!(!snapshot.models[3].available);
        assert_eq!(snapshot.models[4].id, "gpt-4o-mini");
        assert!(snapshot.models[4].available);
        assert_eq!(
            snapshot.source,
            format!("official_api+{OPENAI_MODEL_CAPABILITY_POLICY_VERSION}")
        );
    }

    #[test]
    fn openai_documented_policy_is_exact_and_does_not_invent_missing_models() {
        assert_eq!(openai_model_verification("gpt-5.2"), Some(true));
        assert_eq!(openai_model_verification("gpt-5.2-pro"), Some(false));
        assert_eq!(
            openai_model_verification("gpt-5.2-pro-2025-12-11"),
            Some(false)
        );
        assert_eq!(openai_model_verification("gpt-7-new"), Some(false));
        assert_eq!(openai_model_verification("gpt-4o-2024-05-13"), Some(false));
        assert_eq!(openai_model_verification("gpt-4o-2024-08-06"), Some(true));
        assert_eq!(openai_model_verification("gpt-4o-2024-11-20"), Some(true));
        assert_eq!(
            openai_model_verification("gpt-4o-mini-2024-07-18"),
            Some(true)
        );
        assert_eq!(openai_model_verification("text-embedding-3-large"), None);
        assert_eq!(openai_model_verification("gpt-image-1"), None);
        assert_eq!(openai_model_verification("gpt-audio-1"), None);
        assert_eq!(openai_model_verification("gpt-realtime"), None);

        let value = serde_json::json!({"data": [{"id": "gpt-5.6-sol"}]});
        let snapshot = parse_openai_models(
            &profile(Some("openai"), AiProviderProtocol::OpenAiResponses),
            &value,
            "101",
        )
        .unwrap();
        assert_eq!(
            snapshot
                .models
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            ["gpt-5.6-sol"]
        );
    }

    #[test]
    fn gemini_catalog_requires_generate_content_and_strips_prefix() {
        let value = serde_json::json!({
            "models": [
                {"name": "models/gemini-2.5-flash", "displayName": "Gemini 2.5 Flash", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/text-embedding-004", "displayName": "Embedding", "supportedGenerationMethods": ["embedContent"]}
            ]
        });
        let snapshot = parse_gemini_models(
            &profile(Some("gemini"), AiProviderProtocol::OpenAiChatCompletions),
            &value,
            "200",
        )
        .unwrap();
        assert_eq!(snapshot.models.len(), 1);
        assert_eq!(snapshot.models[0].id, "gemini-2.5-flash");
        assert_eq!(snapshot.models[0].display_name, "Gemini 2.5 Flash");
    }

    #[test]
    fn anthropic_catalog_exposes_display_name_and_next_page() {
        let value = serde_json::json!({
            "data": [{"id": "claude-sonnet-4", "display_name": "Claude Sonnet 4"}],
            "has_more": true,
            "last_id": "claude-sonnet-4"
        });
        let (snapshot, next) = parse_anthropic_models(
            &profile(Some("anthropic"), AiProviderProtocol::AnthropicMessages),
            &value,
            "300",
        )
        .unwrap();
        assert_eq!(snapshot.models[0].display_name, "Claude Sonnet 4");
        assert_eq!(next.as_deref(), Some("claude-sonnet-4"));
    }

    #[test]
    fn empty_and_invalid_catalogs_are_distinguished() {
        let empty = parse_openai_compatible_models(
            &profile(None, AiProviderProtocol::OpenAiChatCompletions),
            &serde_json::json!({"data": []}),
            "400",
        )
        .unwrap();
        assert!(empty.models.is_empty());
        assert!(parse_openai_compatible_models(
            &profile(None, AiProviderProtocol::OpenAiChatCompletions),
            &serde_json::json!({"models": []}),
            "400",
        )
        .is_err());
    }

    #[test]
    fn stale_cache_marks_models_without_erasing_selection_data() {
        let mut snapshot = manual_snapshot(
            &profile(None, AiProviderProtocol::OpenAiChatCompletions),
            "1",
        );
        snapshot.models[0].stale = false;
        let stale = mark_stale(&snapshot);
        assert!(stale.stale);
        assert!(stale.models[0].stale);
        assert_eq!(stale.models[0].id, "manual/model");
    }
}
