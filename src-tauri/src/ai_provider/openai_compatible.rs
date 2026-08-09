use std::sync::atomic::AtomicBool;

use serde_json::{json, Value};

use crate::codex_app_server::{
    structured_ai_answer_json_example, validate_answer, AiTokenUsageView, StructuredAiAnswer,
};

use super::{
    auth_for_profile, endpoint_url, profile_base_url, AiProviderCompletion, AiProviderError,
    AiProviderHistoryItem, AiProviderProfile, AiProviderStore, AiProviderTurnInput,
};

const DEEPSEEK_MAX_STRUCTURED_OUTPUT_TOKENS: u64 = 4_096;

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
        "content": system_instruction(profile, &input.language),
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
    let mut body = json!({
        "model": request_model_id,
        "messages": messages,
        "stream": true,
    });
    if is_deepseek_json_mode(profile) {
        body["response_format"] = json!({"type": "json_object"});
        body["max_tokens"] = json!(DEEPSEEK_MAX_STRUCTURED_OUTPUT_TOKENS);
    }
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

pub(crate) fn is_deepseek_json_mode(profile: &AiProviderProfile) -> bool {
    profile.built_in
        && profile.preset_id.as_deref() == Some("deepseek")
        && profile.protocol == super::AiProviderProtocol::OpenAiChatCompletions
}

fn system_instruction(profile: &AiProviderProfile, language: &str) -> String {
    let language_name = if language == "zh-CN" {
        "Simplified Chinese"
    } else {
        "English"
    };
    if is_deepseek_json_mode(profile) {
        let example = serde_json::to_string(&structured_ai_answer_json_example())
            .unwrap_or_else(|_| "{\"deterministic_facts\":[],\"interpretation\":\"...\",\"limitations\":[],\"suggested_questions\":[]}".to_string());
        return format!(
            "You are a strictly read-only CONTAM Studio explanation assistant. Use only the structured context supplied by the user. Never call tools, browse, access files, run commands, modify a project, run ContamX, or claim undisclosed access. Return exactly one valid JSON object (JSON) and no surrounding prose. The JSON must follow StructuredAiAnswer: deterministic_facts, limitations, and suggested_questions must each be arrays of strings; interpretation must be a non-empty string. Omit semantic_patch when no supported change is requested; if present, it must follow the existing strict semantic patch contract. Minimum valid JSON example: {example}. Answer in {language_name}."
        );
    }
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
    let mut finish_reason = None;
    for event in events {
        if event.data.trim() == "[DONE]" {
            done = true;
            continue;
        }
        let value: Value = serde_json::from_str(&event.data)
            .map_err(|_| AiProviderError::new("ai_provider_stream_invalid"))?;
        if value.get("error").is_some() {
            return Err(AiProviderError::new("ai_provider_remote_error"));
        }
        let choice = value
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first());
        if let Some(reason) = choice
            .and_then(|choice| choice.get("finish_reason"))
            .and_then(Value::as_str)
        {
            finish_reason = Some(reason.to_string());
            if reason == "length" {
                return Err(AiProviderError::new("ai_provider_response_truncated"));
            }
            if matches!(reason, "tool_calls" | "function_call") {
                return Err(AiProviderError::new("ai_tool_use_blocked"));
            }
            if reason != "stop" {
                return Err(AiProviderError::new("ai_provider_response_invalid"));
            }
        }
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
        if usage.is_none() {
            usage = usage_from(&value);
        }
    }
    if !done {
        return Err(AiProviderError::new("ai_provider_stream_incomplete"));
    }
    if finish_reason
        .as_deref()
        .is_some_and(|reason| reason != "stop")
    {
        return Err(AiProviderError::new("ai_provider_response_invalid"));
    }
    if text.trim().is_empty() {
        return Err(AiProviderError::new("ai_provider_response_empty"));
    }
    let structured_text = structured_json_text(&text)?;
    let value: Value = serde_json::from_str(structured_text)
        .map_err(|_| AiProviderError::new("ai_provider_response_not_json"))?;
    let answer: StructuredAiAnswer = serde_json::from_value(value)
        .map_err(|_| AiProviderError::new("ai_provider_response_contract_invalid"))?;
    let answer = validate_answer(answer)
        .map_err(|_| AiProviderError::new("ai_provider_response_contract_invalid"))?;
    Ok(AiProviderCompletion {
        answer,
        token_usage: usage,
    })
}

fn structured_json_text(text: &str) -> Result<&str, AiProviderError> {
    let trimmed = text.trim();
    if !trimmed.starts_with("```") {
        return Ok(trimmed);
    }

    let first_newline = trimmed
        .find('\n')
        .ok_or_else(|| AiProviderError::new("ai_provider_response_not_json"))?;
    let opening = trimmed[..first_newline].trim_end_matches('\r');
    if opening != "```json" && opening != "```JSON" && opening != "```" {
        return Err(AiProviderError::new("ai_provider_response_not_json"));
    }
    let fenced_body = &trimmed[first_newline + 1..];
    let closing = fenced_body
        .rfind("```")
        .ok_or_else(|| AiProviderError::new("ai_provider_response_not_json"))?;
    if !fenced_body[closing + 3..].trim().is_empty() {
        return Err(AiProviderError::new("ai_provider_response_not_json"));
    }
    let body = fenced_body[..closing].trim();
    if body.contains("```") || body.is_empty() {
        return Err(AiProviderError::new("ai_provider_response_not_json"));
    }
    Ok(body)
}

fn usage_from(value: &Value) -> Option<AiTokenUsageView> {
    let usage = value.get("usage").filter(|usage| usage.is_object())?;
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
