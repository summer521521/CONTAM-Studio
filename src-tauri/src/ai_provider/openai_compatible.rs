use std::sync::atomic::AtomicBool;

use serde_json::{json, Value};

use crate::codex_app_server::{validate_answer, AiTokenUsageView, StructuredAiAnswer};

use super::{
    auth_for_profile, endpoint_url, profile_base_url, AiProviderCompletion, AiProviderError,
    AiProviderHistoryItem, AiProviderProfile, AiProviderStore, AiProviderTurnInput,
};

pub(crate) async fn complete(
    store: &AiProviderStore,
    profile: &AiProviderProfile,
    input: AiProviderTurnInput,
    cancel: &AtomicBool,
) -> Result<AiProviderCompletion, AiProviderError> {
    let url = endpoint_url(&profile_base_url(profile)?, "chat/completions")?;
    let request_model_id = if profile.preset_id.as_deref() == Some("gemini") {
        input
            .model_id
            .strip_prefix("models/")
            .unwrap_or(&input.model_id)
            .to_string()
    } else {
        input.model_id.clone()
    };
    let mut messages = vec![json!({
        "role": "system",
        "content": system_instruction(&input.language),
    })];
    for entry in &input.history {
        messages.push(json!({"role": "user", "content": entry.question}));
        messages.push(json!({
            "role": "assistant",
            "content": serde_json::to_string(&entry.answer)
                .map_err(|_| AiProviderError::new("ai_provider_response_invalid"))?,
        }));
    }
    messages.push(json!({
        "role": "user",
        "content": prompt_for(&input)?,
    }));
    let body = json!({
        "model": request_model_id,
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

pub(crate) fn parse_events(
    events: Vec<super::http::SseEvent>,
) -> Result<AiProviderCompletion, AiProviderError> {
    let mut text = String::new();
    let mut done = false;
    let mut usage = None;
    for event in events {
        if event.data.trim() == "[DONE]" {
            done = true;
            continue;
        }
        let value: Value = serde_json::from_str(&event.data)
            .map_err(|_| AiProviderError::new("ai_provider_stream_invalid"))?;
        if value.get("error").is_some() {
            return Err(AiProviderError::new("ai_provider_response_invalid"));
        }
        let choice = value
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first());
        if choice
            .and_then(|choice| choice.pointer("/delta/tool_calls"))
            .is_some()
            || choice
                .and_then(|choice| choice.pointer("/delta/function_call"))
                .is_some()
            || choice
                .and_then(|choice| choice.pointer("/message/tool_calls"))
                .is_some()
            || choice
                .and_then(|choice| choice.pointer("/message/function_call"))
                .is_some()
        {
            return Err(AiProviderError::new("ai_tool_use_blocked"));
        }
        if let Some(content) = choice
            .and_then(|choice| choice.pointer("/delta/content"))
            .and_then(Value::as_str)
        {
            text.push_str(content);
        }
        usage = usage.or_else(|| usage_from(&value));
    }
    if !done || text.is_empty() {
        return Err(AiProviderError::new("ai_provider_stream_invalid"));
    }
    let answer: StructuredAiAnswer = serde_json::from_str(&text)
        .map_err(|_| AiProviderError::new("ai_provider_response_invalid"))?;
    let answer = validate_answer(answer)
        .map_err(|_| AiProviderError::new("ai_provider_response_invalid"))?;
    Ok(AiProviderCompletion {
        answer,
        token_usage: usage,
    })
}

fn usage_from(value: &Value) -> Option<AiTokenUsageView> {
    let usage = value.get("usage")?;
    Some(AiTokenUsageView {
        input_tokens: usage.get("prompt_tokens").and_then(Value::as_u64),
        cached_input_tokens: usage
            .pointer("/prompt_tokens_details/cached_tokens")
            .and_then(Value::as_u64),
        output_tokens: usage.get("completion_tokens").and_then(Value::as_u64),
        total_tokens: usage.get("total_tokens").and_then(Value::as_u64),
    })
}

#[allow(dead_code)]
fn _history_shape(entry: &AiProviderHistoryItem) -> Value {
    json!({"question": entry.question, "answer": entry.answer})
}
