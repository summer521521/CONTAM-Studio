use std::sync::atomic::AtomicBool;

use serde_json::{json, Value};

use crate::codex_app_server::{validate_answer, AiTokenUsageView, StructuredAiAnswer};

use super::{
    auth_for_profile, endpoint_url, profile_base_url, AiProviderCompletion, AiProviderError,
    AiProviderProfile, AiProviderStore, AiProviderTurnInput,
};

pub(crate) async fn complete(
    store: &AiProviderStore,
    profile: &AiProviderProfile,
    input: AiProviderTurnInput,
    cancel: &AtomicBool,
) -> Result<AiProviderCompletion, AiProviderError> {
    let url = endpoint_url(&profile_base_url(profile)?, "messages")?;
    let mut messages = Vec::new();
    for entry in &input.history {
        messages.push(json!({
            "role": "user",
            "content": [{"type": "text", "text": entry.question}],
        }));
        messages.push(json!({
            "role": "assistant",
            "content": [{"type": "text", "text": serde_json::to_string(&entry.answer)
                .map_err(|_| AiProviderError::new("ai_provider_response_invalid"))?}],
        }));
    }
    messages.push(json!({
        "role": "user",
        "content": [{"type": "text", "text": prompt_for(&input)?}],
    }));
    let body = json!({
        "model": input.model_id,
        "max_tokens": 4096,
        "system": system_instruction(&input.language),
        "messages": messages,
        "stream": true,
    });
    let events = store
        .client
        .post_sse(
            &url,
            auth_for_profile(profile, store.credentials.as_ref())?,
            body,
            cancel,
        )
        .await?;
    parse_events(events)
}

fn system_instruction(language: &str) -> String {
    let language_name = if language == "zh-CN" {
        "Simplified Chinese"
    } else {
        "English"
    };
    format!(
        "You are a strictly read-only CONTAM Studio explanation assistant. Use only the structured context supplied by the user. Never call tools, browse, access files, run commands, modify a project, run ContamX, or claim undisclosed access. Return only one JSON object with deterministic_facts, interpretation, limitations, suggested_questions, and optional semantic_patch. Answer in {language_name}."
    )
}

fn prompt_for(input: &AiProviderTurnInput) -> Result<String, AiProviderError> {
    serde_json::to_string(&json!({
        "instruction": "Answer only from this disclosed CONTAM Studio context. Do not use tools or access files.",
        "trusted_context": input.trusted_context,
        "language": input.language,
        "question": input.question,
    }))
    .map_err(|_| AiProviderError::new("ai_provider_response_invalid"))
}

fn parse_events(
    events: Vec<super::http::SseEvent>,
) -> Result<AiProviderCompletion, AiProviderError> {
    let mut text = String::new();
    let mut completed = false;
    let mut input_tokens = None;
    let mut output_tokens = None;
    for event in events {
        let value: Value = serde_json::from_str(&event.data)
            .map_err(|_| AiProviderError::new("ai_provider_stream_invalid"))?;
        let event_type = value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if event_type == "error" || value.get("error").is_some() {
            return Err(AiProviderError::new("ai_provider_response_invalid"));
        }
        if event_type == "message_start" {
            input_tokens = value
                .pointer("/message/usage/input_tokens")
                .and_then(Value::as_u64);
        }
        if event_type == "content_block_start"
            && value.pointer("/content_block/type").and_then(Value::as_str) == Some("tool_use")
        {
            return Err(AiProviderError::new("ai_tool_use_blocked"));
        }
        if event_type == "content_block_delta" {
            let delta_type = value
                .pointer("/delta/type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if delta_type == "text_delta" {
                if let Some(delta) = value.pointer("/delta/text").and_then(Value::as_str) {
                    text.push_str(delta);
                }
            } else if delta_type.contains("tool") {
                return Err(AiProviderError::new("ai_tool_use_blocked"));
            }
        }
        if event_type == "message_delta" {
            output_tokens = value
                .pointer("/usage/output_tokens")
                .and_then(Value::as_u64);
        }
        if event_type == "message_stop" {
            completed = true;
        }
    }
    if !completed || text.is_empty() {
        return Err(AiProviderError::new("ai_provider_stream_invalid"));
    }
    let answer: StructuredAiAnswer = serde_json::from_str(&text)
        .map_err(|_| AiProviderError::new("ai_provider_response_invalid"))?;
    let answer = validate_answer(answer)
        .map_err(|_| AiProviderError::new("ai_provider_response_invalid"))?;
    Ok(AiProviderCompletion {
        answer,
        token_usage: Some(AiTokenUsageView {
            input_tokens,
            cached_input_tokens: None,
            output_tokens,
            total_tokens: input_tokens
                .zip(output_tokens)
                .map(|(left, right)| left + right),
        }),
    })
}
