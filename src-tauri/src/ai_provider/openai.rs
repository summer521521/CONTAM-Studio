use std::sync::atomic::AtomicBool;

use serde_json::{json, Value};

use crate::codex_app_server::{validate_answer, AiTokenUsageView, StructuredAiAnswer};

use super::{
    auth_for_profile, endpoint_url, profile_base_url, AiProviderCompletion, AiProviderError,
    AiProviderHistoryItem, AiProviderProfile, AiProviderProtocol, AiProviderStore,
    AiProviderTurnInput,
};

pub(crate) async fn complete(
    store: &AiProviderStore,
    profile: &AiProviderProfile,
    input: AiProviderTurnInput,
    cancel: &AtomicBool,
) -> Result<AiProviderCompletion, AiProviderError> {
    let url = endpoint_url(&profile_base_url(profile)?, "responses")?;
    let body = json!({
        "model": input.model_id,
        "stream": true,
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_instruction(&input.language)}]
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": prompt_for(&input)?}]
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "contam_studio_structured_answer",
                "strict": true,
                "schema": answer_schema()
            }
        }
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
        "You are the strictly read-only CONTAM Studio explanation assistant. Use only the structured context in the user message. Do not use tools, browse, access files, run commands, modify a project, run ContamX, or claim access to undisclosed data. Return only the requested JSON Schema object. Answer in {language_name}; distinguish facts, interpretation, limitations, and suggested questions."
    )
}

fn prompt_for(input: &AiProviderTurnInput) -> Result<String, AiProviderError> {
    serde_json::to_string(&json!({
        "instruction": "Answer only from this disclosed CONTAM Studio context. Do not use tools or access files.",
        "trusted_context": input.trusted_context,
        "language": input.language,
        "history": input.history.iter().map(history_json).collect::<Vec<_>>(),
        "question": input.question,
    }))
    .map_err(|_| AiProviderError::new("ai_provider_response_invalid"))
}

fn history_json(entry: &AiProviderHistoryItem) -> Value {
    json!({
        "question": entry.question,
        "answer": entry.answer,
    })
}

fn answer_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "deterministic_facts": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
            "interpretation": {"type": "string", "maxLength": 4000},
            "limitations": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
            "suggested_questions": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
            "semantic_patch": {"type": ["object", "null"]}
        },
        "required": ["deterministic_facts", "interpretation", "limitations", "suggested_questions", "semantic_patch"]
    })
}

fn parse_events(
    events: Vec<super::http::SseEvent>,
) -> Result<AiProviderCompletion, AiProviderError> {
    let mut text = String::new();
    let mut completed = false;
    let mut usage = None;
    for event in events {
        let value: Value = serde_json::from_str(&event.data)
            .map_err(|_| AiProviderError::new("ai_provider_stream_invalid"))?;
        let event_type = value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if event_type == "response.failed" || value.get("error").is_some() {
            return Err(AiProviderError::new("ai_provider_response_invalid"));
        }
        if event_type.contains("tool")
            || event_type.contains("function")
            || value
                .pointer("/item/type")
                .and_then(Value::as_str)
                .is_some_and(is_tool_type)
            || value
                .pointer("/output/type")
                .and_then(Value::as_str)
                .is_some_and(is_tool_type)
        {
            return Err(AiProviderError::new("ai_tool_use_blocked"));
        }
        if event_type == "response.output_text.delta" {
            if let Some(delta) = value.get("delta").and_then(Value::as_str) {
                text.push_str(delta);
            }
        }
        if event_type == "response.output_text.done" && text.is_empty() {
            if let Some(value) = value.get("text").and_then(Value::as_str) {
                text.push_str(value);
            }
        }
        if event_type == "response.completed" {
            completed = true;
            usage = usage.or_else(|| usage_from(&value));
            if text.is_empty() {
                append_output_text(&value, &mut text);
            }
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
        token_usage: usage,
    })
}

fn is_tool_type(value: &str) -> bool {
    matches!(
        value,
        "function_call" | "computer_call" | "file_search_call" | "web_search_call" | "tool_use"
    )
}

fn append_output_text(value: &Value, output: &mut String) {
    let Some(items) = value.pointer("/response/output").and_then(Value::as_array) else {
        return;
    };
    for item in items {
        if item
            .get("type")
            .and_then(Value::as_str)
            .is_some_and(is_tool_type)
        {
            return;
        }
        if let Some(content) = item.get("content").and_then(Value::as_array) {
            for part in content {
                if part.get("type").and_then(Value::as_str) == Some("output_text") {
                    if let Some(text) = part.get("text").and_then(Value::as_str) {
                        output.push_str(text);
                    }
                }
            }
        }
    }
}

fn usage_from(value: &Value) -> Option<AiTokenUsageView> {
    let usage = value
        .pointer("/response/usage")
        .or_else(|| value.get("usage"))?;
    Some(AiTokenUsageView {
        input_tokens: usage.get("input_tokens").and_then(Value::as_u64),
        cached_input_tokens: usage
            .pointer("/input_token_details/cached_tokens")
            .and_then(Value::as_u64),
        output_tokens: usage.get("output_tokens").and_then(Value::as_u64),
        total_tokens: usage.get("total_tokens").and_then(Value::as_u64),
    })
}

#[allow(dead_code)]
fn _protocol_is_responses(profile: &AiProviderProfile) -> bool {
    profile.protocol == AiProviderProtocol::OpenAiResponses
}
