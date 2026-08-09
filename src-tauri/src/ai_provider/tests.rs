use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use serde_json::json;
use url::Url;
use uuid::Uuid;

use super::credentials::{AiCredentialStore, MemoryCredentialStore, SecretInput};
use super::http::SseEvent;
use super::*;

fn http_profile(
    protocol: AiProviderProtocol,
    base_url: String,
    auth_kind: AiProviderAuthKind,
) -> AiProviderProfile {
    AiProviderProfile {
        profile_id: Uuid::new_v4(),
        preset_id: None,
        display_name: "Test provider".to_string(),
        protocol,
        base_url: Some(base_url),
        auth_kind,
        built_in: false,
        manual_model_ids: vec!["test-model".to_string()],
        selected_model_id: Some("test-model".to_string()),
        capabilities: AiProviderCapabilities::default(),
        config_revision: 1,
    }
}

fn test_input() -> AiProviderTurnInput {
    AiProviderTurnInput {
        trusted_context: json!({"zone_id": "zone-1", "values": {"volume_m3": 100}}),
        language: "en".to_string(),
        question: "Explain the disclosed zone.".to_string(),
        model_id: "test-model".to_string(),
        history: Vec::new(),
    }
}

fn answer_json() -> String {
    serde_json::to_string(&json!({
        "deterministic_facts": ["The zone volume is 100 m3."],
        "interpretation": "The disclosed value is available for interpretation.",
        "limitations": [],
        "suggested_questions": []
    }))
    .unwrap()
}

fn sse(data: &[&str]) -> String {
    data.iter()
        .map(|item| format!("data: {item}\r\n\r\n"))
        .collect()
}

fn spawn_mock_server(body: String) -> (Url, Arc<Mutex<String>>, JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let request_capture = Arc::new(Mutex::new(String::new()));
    let request_capture_for_thread = Arc::clone(&request_capture);
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let request = read_request(&mut stream);
        *request_capture_for_thread.lock().unwrap() = request;
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(), body
        );
        stream.write_all(response.as_bytes()).unwrap();
        stream.flush().unwrap();
    });
    (
        Url::parse(&format!("http://{address}/v1/")).unwrap(),
        request_capture,
        handle,
    )
}

fn read_request(stream: &mut TcpStream) -> String {
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(2)))
        .unwrap();
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 4096];
    let mut expected_total = None;
    loop {
        match stream.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(count) => {
                bytes.extend_from_slice(&buffer[..count]);
                if expected_total.is_none() {
                    if let Some(header_end) =
                        bytes.windows(4).position(|window| window == b"\r\n\r\n")
                    {
                        let header_length = header_end + 4;
                        let headers = String::from_utf8_lossy(&bytes[..header_end]);
                        let content_length = headers
                            .lines()
                            .find_map(|line| {
                                line.strip_prefix("Content-Length:")
                                    .or_else(|| line.strip_prefix("content-length:"))
                            })
                            .and_then(|value| value.trim().parse::<usize>().ok())
                            .unwrap_or(0);
                        expected_total = Some(header_length + content_length);
                    }
                }
                if expected_total.is_some_and(|total| bytes.len() >= total) {
                    break;
                }
            }
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn request_body(request: &str) -> Value {
    let body = request.split("\r\n\r\n").nth(1).unwrap_or_default();
    serde_json::from_str(body)
        .unwrap_or_else(|error| panic!("mock request body was not JSON: {error}"))
}

fn run_completion(
    profile: AiProviderProfile,
    store: &AiProviderStore,
) -> Result<AiProviderCompletion, AiProviderError> {
    tauri::async_runtime::block_on(async {
        match profile.protocol {
            AiProviderProtocol::OpenAiResponses => {
                openai::complete(
                    store,
                    &profile,
                    test_input(),
                    &std::sync::atomic::AtomicBool::new(false),
                )
                .await
            }
            AiProviderProtocol::OpenAiChatCompletions => {
                openai_compatible::complete(
                    store,
                    &profile,
                    test_input(),
                    &std::sync::atomic::AtomicBool::new(false),
                )
                .await
            }
            AiProviderProtocol::AnthropicMessages => {
                anthropic::complete(
                    store,
                    &profile,
                    test_input(),
                    &std::sync::atomic::AtomicBool::new(false),
                )
                .await
            }
            AiProviderProtocol::CodexAppServer => {
                Err(AiProviderError::new("ai_provider_profile_invalid"))
            }
        }
    })
}

#[test]
fn builtin_profiles_are_deterministic_and_route_expected_protocols() {
    let first = builtin_profiles();
    let second = builtin_profiles();
    assert_eq!(first, second);
    assert_eq!(first.len(), 9);
    assert_eq!(codex_profile_id(), first[0].profile_id);
    assert_eq!(first[0].protocol, AiProviderProtocol::CodexAppServer);
    assert_eq!(first[1].protocol, AiProviderProtocol::OpenAiResponses);
    assert_eq!(first[2].protocol, AiProviderProtocol::AnthropicMessages);
    assert!(first
        .iter()
        .filter(|profile| matches!(
            profile.preset_id.as_deref(),
            Some("gemini" | "openrouter" | "deepseek" | "ollama" | "lm_studio" | "vllm")
        ))
        .all(|profile| profile.protocol == AiProviderProtocol::OpenAiChatCompletions));
}

#[test]
fn endpoint_policy_accepts_https_and_loopback_only() {
    assert_eq!(
        normalize_base_url("https://provider.example/v1").unwrap(),
        "https://provider.example/v1/"
    );
    assert!(normalize_base_url("http://127.0.0.1:11434/v1").is_ok());
    for value in [
        "http://provider.example/v1",
        "file:///C:/secret",
        "https://user:password@provider.example/v1",
        "https://provider.example/v1?key=bad",
        "https://provider.example/v1#fragment",
        "https://provider.example/v1/%2e%2e/secret",
        "https://provider.example/v1/%2fsecret",
        "http://192.168.1.10:8000/v1",
    ] {
        assert!(
            normalize_base_url(value).is_err(),
            "accepted unsafe URL: {value}"
        );
    }
}

#[test]
fn profile_serialization_never_contains_secret_fields() {
    let profile = http_profile(
        AiProviderProtocol::OpenAiChatCompletions,
        "https://provider.example/v1/".to_string(),
        AiProviderAuthKind::ApiKey,
    );
    let serialized = serde_json::to_string(&profile).unwrap();
    assert!(!serialized.contains("\"apiKey\""));
    assert!(!serialized.contains("secret"));
    assert!(validate_profile(&profile).is_ok());
}

#[test]
fn profile_merge_preserves_manual_models_and_selected_model() {
    let mut file = ProfileFile {
        schema_version: PROFILE_SCHEMA_VERSION.to_string(),
        profiles: vec![builtin_profiles()
            .into_iter()
            .find(|profile| profile.preset_id.as_deref() == Some("openai"))
            .map(|mut profile| {
                profile.manual_model_ids = vec!["manual-model".to_string()];
                profile.selected_model_id = Some("manual-model".to_string());
                profile
            })
            .unwrap()],
    };
    assert!(merge_builtin_profiles(&mut file).unwrap());
    let openai = file
        .profiles
        .iter()
        .find(|profile| profile.preset_id.as_deref() == Some("openai"))
        .unwrap();
    assert_eq!(openai.manual_model_ids, ["manual-model"]);
    assert_eq!(openai.selected_model_id.as_deref(), Some("manual-model"));
}

#[test]
fn profile_write_keeps_previous_file_in_verified_backup() {
    let root = std::env::temp_dir().join(format!("contam-studio-ai-provider-{}", Uuid::new_v4()));
    let path = root.join("ai").join("providers").join("profiles.json");
    let custom = http_profile(
        AiProviderProtocol::OpenAiChatCompletions,
        "https://provider.example/v1/".to_string(),
        AiProviderAuthKind::None,
    );
    let mut first = ProfileFile {
        schema_version: PROFILE_SCHEMA_VERSION.to_string(),
        profiles: builtin_profiles(),
    };
    first.profiles.push(custom);
    write_profiles(&path, &first).unwrap();

    let mut second = first.clone();
    second.profiles.last_mut().unwrap().display_name = "Second provider".to_string();
    write_profiles(&path, &second).unwrap();

    let current: ProfileFile = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    let backup: ProfileFile =
        serde_json::from_slice(&fs::read(path.with_extension("json.bak")).unwrap()).unwrap();
    assert_eq!(
        current.profiles.last().unwrap().display_name,
        "Second provider"
    );
    assert_eq!(
        backup.profiles.last().unwrap().display_name,
        "Test provider"
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn http_stream_honors_cancellation_before_consuming_events() {
    let (base_url, _capture, handle) = spawn_mock_server(sse(&["data: {\"ok\":true}"]));
    let client = ControlledHttpClient::new().unwrap();
    let cancel = std::sync::atomic::AtomicBool::new(true);
    let result = tauri::async_runtime::block_on(async {
        client
            .post_sse(
                &endpoint_url(&base_url, "responses").unwrap(),
                AuthHeader::None,
                json!({}),
                &cancel,
            )
            .await
    });
    handle.join().unwrap();
    let error = match result {
        Ok(_) => panic!("cancelled HTTP stream unexpectedly completed"),
        Err(error) => error,
    };
    assert_eq!(error.code, "ai_provider_cancelled");
}

#[test]
fn credential_fake_round_trip_is_not_part_of_profile_view() {
    let store = MemoryCredentialStore::default();
    let profile = http_profile(
        AiProviderProtocol::OpenAiResponses,
        "https://provider.example/v1/".to_string(),
        AiProviderAuthKind::ApiKey,
    );
    store
        .set(
            profile.profile_id,
            SecretInput::new("unit-test-key-not-real".to_string()),
        )
        .unwrap();
    let view = profile_view(&profile, &store, None);
    let serialized = serde_json::to_string(&view).unwrap();
    assert_eq!(view.secret_state, "present");
    assert!(!serialized.contains("unit-test-key-not-real"));
    assert!(!serialized.contains("\"apiKey\""));
}

#[test]
fn openai_responses_completes_through_local_mock_server() {
    let answer = answer_json();
    let body = sse(&[
        &json!({"type":"response.output_text.delta","delta":answer}).to_string(),
        &json!({"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":4,"total_tokens":7}}}).to_string(),
    ]);
    let (base_url, capture, handle) = spawn_mock_server(body);
    let store = AiProviderStore::with_credentials(Arc::new(MemoryCredentialStore::default()));
    let profile = http_profile(
        AiProviderProtocol::OpenAiResponses,
        base_url.to_string(),
        AiProviderAuthKind::ApiKey,
    );
    store
        .credentials
        .set(
            profile.profile_id,
            SecretInput::new("unit-test-key-not-real".to_string()),
        )
        .unwrap();
    let result = run_completion(profile, &store).unwrap();
    handle.join().unwrap();
    assert_eq!(
        result.answer.interpretation,
        "The disclosed value is available for interpretation."
    );
    assert_eq!(result.token_usage.unwrap().total_tokens, Some(7));
    assert!(capture.lock().unwrap().contains("POST /v1/responses"));
    assert!(capture
        .lock()
        .unwrap()
        .to_ascii_lowercase()
        .contains("authorization: bearer"));
    let body = request_body(&capture.lock().unwrap());
    assert_eq!(body.pointer("/text/format/strict"), Some(&json!(true)));
    let required = body
        .pointer("/text/format/schema/required")
        .and_then(Value::as_array)
        .unwrap();
    assert!(required.iter().any(|value| value == "semantic_patch"));
    assert_eq!(
        body.pointer("/text/format/schema/properties/semantic_patch/type"),
        Some(&json!(["object", "null"]))
    );
}

#[test]
fn openai_compatible_and_anthropic_complete_through_local_mock_server() {
    let answer = answer_json();
    let (openai_url, openai_capture, openai_handle) = spawn_mock_server(sse(&[
        &json!({"choices":[{"delta":{"content":answer},"finish_reason":null}]}).to_string(),
        "[DONE]",
    ]));
    let openai_store =
        AiProviderStore::with_credentials(Arc::new(MemoryCredentialStore::default()));
    let openai_profile = http_profile(
        AiProviderProtocol::OpenAiChatCompletions,
        openai_url.to_string(),
        AiProviderAuthKind::None,
    );
    let openai_result = run_completion(openai_profile, &openai_store).unwrap();
    openai_handle.join().unwrap();
    assert_eq!(openai_result.answer.deterministic_facts.len(), 1);
    assert!(openai_capture
        .lock()
        .unwrap()
        .contains("POST /v1/chat/completions"));
    assert!(request_body(&openai_capture.lock().unwrap())
        .get("response_format")
        .is_none());
    assert!(!openai_capture
        .lock()
        .unwrap()
        .to_ascii_lowercase()
        .contains("authorization:"));

    let (anthropic_url, anthropic_capture, anthropic_handle) = spawn_mock_server(sse(&[
        &json!({"type":"message_start","message":{"usage":{"input_tokens":2}}}).to_string(),
        &json!({"type":"content_block_start","content_block":{"type":"text"}}).to_string(),
        &json!({"type":"content_block_delta","delta":{"type":"text_delta","text":answer}})
            .to_string(),
        &json!({"type":"message_delta","usage":{"output_tokens":5}}).to_string(),
        &json!({"type":"message_stop"}).to_string(),
    ]));
    let anthropic_store =
        AiProviderStore::with_credentials(Arc::new(MemoryCredentialStore::default()));
    let anthropic_profile = http_profile(
        AiProviderProtocol::AnthropicMessages,
        anthropic_url.to_string(),
        AiProviderAuthKind::ApiKey,
    );
    anthropic_store
        .credentials
        .set(
            anthropic_profile.profile_id,
            SecretInput::new("unit-test-key-not-real".to_string()),
        )
        .unwrap();
    let anthropic_result = run_completion(anthropic_profile, &anthropic_store).unwrap();
    anthropic_handle.join().unwrap();
    assert_eq!(anthropic_result.token_usage.unwrap().total_tokens, Some(7));
    let request = anthropic_capture.lock().unwrap().to_ascii_lowercase();
    assert!(request.contains("post /v1/messages"));
    assert!(request.contains("x-api-key: unit-test-key-not-real"));
    assert!(request.contains("anthropic-version: 2023-06-01"));
}

#[test]
fn adapter_parsers_block_tool_events() {
    let events = vec![SseEvent {
        data: json!({
            "choices": [{"delta": {"tool_calls": [{"function": {"name": "read_file"}}]}}]
        })
        .to_string(),
    }];
    let parsed = super::openai_compatible::parse_events(events);
    assert_eq!(parsed.unwrap_err().code, "ai_tool_use_blocked");
}

#[test]
fn openai_compatible_accepts_one_complete_json_fence_and_rejects_surrounding_prose() {
    let answer = answer_json();
    let fenced = format!("```json\n{answer}\n```");
    let parsed = super::openai_compatible::parse_events(vec![
        SseEvent {
            data: json!({"choices":[{"delta":{"content":fenced}}]}).to_string(),
        },
        SseEvent {
            data: "[DONE]".to_string(),
        },
    ])
    .unwrap();
    assert_eq!(parsed.answer.deterministic_facts.len(), 1);

    let with_prose = format!("Here is the answer:\n```json\n{answer}\n```");
    let rejected = super::openai_compatible::parse_events(vec![
        SseEvent {
            data: json!({"choices":[{"delta":{"content":with_prose}}]}).to_string(),
        },
        SseEvent {
            data: "[DONE]".to_string(),
        },
    ]);
    assert_eq!(rejected.unwrap_err().code, "ai_provider_response_not_json");
}

#[test]
fn deepseek_json_mode_is_narrow_and_explicit() {
    let deepseek = builtin_profiles()
        .into_iter()
        .find(|profile| profile.preset_id.as_deref() == Some("deepseek"))
        .unwrap();
    assert!(super::openai_compatible::is_deepseek_json_mode(&deepseek));
    for preset in ["gemini", "openrouter", "ollama", "lm_studio", "vllm"] {
        let profile = builtin_profiles()
            .into_iter()
            .find(|profile| profile.preset_id.as_deref() == Some(preset))
            .unwrap();
        assert!(!super::openai_compatible::is_deepseek_json_mode(&profile));
    }
    let custom = http_profile(
        AiProviderProtocol::OpenAiChatCompletions,
        "https://provider.example/v1/".to_string(),
        AiProviderAuthKind::ApiKey,
    );
    assert!(!super::openai_compatible::is_deepseek_json_mode(&custom));
}

#[test]
fn deepseek_request_uses_json_object_mode_and_bounded_output() {
    let answer = answer_json();
    let (base_url, capture, handle) = spawn_mock_server(sse(&[
        &json!({"choices":[{"delta":{"content":answer},"finish_reason":"stop"}]}).to_string(),
        "[DONE]",
    ]));
    let mut profile = builtin_profiles()
        .into_iter()
        .find(|profile| profile.preset_id.as_deref() == Some("deepseek"))
        .unwrap();
    profile.base_url = Some(base_url.to_string());
    let store = AiProviderStore::with_credentials(Arc::new(MemoryCredentialStore::default()));
    store
        .credentials
        .set(
            profile.profile_id,
            SecretInput::new("unit-test-key-not-real".to_string()),
        )
        .unwrap();
    run_completion(profile, &store).unwrap();
    handle.join().unwrap();
    let request = capture.lock().unwrap();
    let body = request_body(&request);
    assert_eq!(body["stream"], true);
    assert_eq!(body["response_format"], json!({"type": "json_object"}));
    assert_eq!(body["max_tokens"], 4_096);
    let system = body
        .pointer("/messages/0/content")
        .and_then(Value::as_str)
        .unwrap();
    assert!(system.contains("JSON"));
    assert!(system.contains("deterministic_facts"));
    assert!(system.contains("interpretation"));
    assert!(system.contains("suggested_questions"));
}

fn chat_events(content: &str) -> Vec<SseEvent> {
    vec![
        SseEvent {
            data: json!({"choices":[{"delta":{"content":content},"finish_reason":"stop"}]})
                .to_string(),
        },
        SseEvent {
            data: "[DONE]".to_string(),
        },
    ]
}

#[test]
fn openai_compatible_diagnostics_distinguish_stream_and_answer_failures() {
    let answer = answer_json();
    let missing_done = super::openai_compatible::parse_events(vec![SseEvent {
        data: json!({"choices":[{"delta":{"content":answer}}]}).to_string(),
    }]);
    assert_eq!(
        missing_done.unwrap_err().code,
        "ai_provider_stream_incomplete"
    );

    let truncated = super::openai_compatible::parse_events(vec![
        SseEvent {
            data: json!({"choices":[{"delta":{"content":answer},"finish_reason":"length"}]})
                .to_string(),
        },
        SseEvent {
            data: "[DONE]".to_string(),
        },
    ]);
    assert_eq!(
        truncated.unwrap_err().code,
        "ai_provider_response_truncated"
    );

    let empty = super::openai_compatible::parse_events(vec![
        SseEvent {
            data: json!({"choices":[],"usage":{"total_tokens":1}}).to_string(),
        },
        SseEvent {
            data: "[DONE]".to_string(),
        },
    ]);
    assert_eq!(empty.unwrap_err().code, "ai_provider_response_empty");

    let invalid_json = super::openai_compatible::parse_events(chat_events("not JSON"));
    assert_eq!(
        invalid_json.unwrap_err().code,
        "ai_provider_response_not_json"
    );

    let wrong_type = r#"{"deterministic_facts":"wrong","interpretation":"ok","limitations":[],"suggested_questions":[]}"#;
    let contract_invalid = super::openai_compatible::parse_events(chat_events(wrong_type));
    assert_eq!(
        contract_invalid.unwrap_err().code,
        "ai_provider_response_contract_invalid"
    );

    let extra_field = r#"{"deterministic_facts":[],"interpretation":"ok","limitations":[],"suggested_questions":[],"extra":true}"#;
    let extra_invalid = super::openai_compatible::parse_events(chat_events(extra_field));
    assert_eq!(
        extra_invalid.unwrap_err().code,
        "ai_provider_response_contract_invalid"
    );

    let long_answer = serde_json::to_string(&json!({
        "deterministic_facts": [],
        "interpretation": "x".repeat(4_001),
        "limitations": [],
        "suggested_questions": []
    }))
    .unwrap();
    let oversize = super::openai_compatible::parse_events(chat_events(&long_answer));
    assert_eq!(
        oversize.unwrap_err().code,
        "ai_provider_response_contract_invalid"
    );

    let multiple =
        super::openai_compatible::parse_events(chat_events(&format!("{answer}{answer}")));
    assert_eq!(multiple.unwrap_err().code, "ai_provider_response_not_json");

    let remote = super::openai_compatible::parse_events(vec![SseEvent {
        data: json!({"error":{"message":"redacted"}}).to_string(),
    }]);
    assert_eq!(remote.unwrap_err().code, "ai_provider_remote_error");
}

#[test]
fn openai_compatible_trims_empty_content_and_rejects_non_stop_finish_reasons() {
    let whitespace = super::openai_compatible::parse_events(chat_events(" \n\t "));
    assert_eq!(whitespace.unwrap_err().code, "ai_provider_response_empty");
    for reason in ["content_filter", "insufficient_system_resource", "other"] {
        let parsed = super::openai_compatible::parse_events(vec![
            SseEvent {
                data:
                    json!({"choices":[{"delta":{"content":answer_json()},"finish_reason":reason}]})
                        .to_string(),
            },
            SseEvent {
                data: "[DONE]".to_string(),
            },
        ]);
        assert_eq!(parsed.unwrap_err().code, "ai_provider_response_invalid");
    }
}

#[test]
fn openai_compatible_usage_null_does_not_hide_later_usage() {
    let answer = answer_json();
    let parsed = super::openai_compatible::parse_events(vec![
        SseEvent {
            data: json!({"choices":[{"delta":{"content":answer},"finish_reason":null}],"usage":null}).to_string(),
        },
        SseEvent {
            data: json!({"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}).to_string(),
        },
        SseEvent {
            data: "[DONE]".to_string(),
        },
    ])
    .expect("valid streamed answer");
    assert_eq!(parsed.token_usage.unwrap().total_tokens, Some(5));
}
