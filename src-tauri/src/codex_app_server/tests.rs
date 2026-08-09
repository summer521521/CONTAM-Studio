use super::*;

fn test_root(label: &str) -> PathBuf {
    static TEST_ROOT_SEQUENCE: AtomicU64 = AtomicU64::new(1);
    let sequence = TEST_ROOT_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("codex-app-server-tests")
        .join(format!("{label}-{}-{sequence}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    root
}

fn archive_test_answer() -> StructuredAiAnswer {
    StructuredAiAnswer {
        deterministic_facts: vec!["The selected Zone is One.".to_string()],
        interpretation: "The disclosed Zone volume is stable in the current snapshot.".to_string(),
        limitations: vec!["No complete result series was disclosed.".to_string()],
        suggested_questions: vec!["What does the Zone volume represent?".to_string()],
        semantic_patch: None,
    }
}

fn archive_test_context(
    baseline_source_sha256: &str,
    revision_id: &str,
    revision_number: u64,
    zone_id: &str,
    zone_name: &str,
) -> AiTrustedContext {
    AiTrustedContext {
        project_session_id: "session-1".to_string(),
        baseline_source_sha256: baseline_source_sha256.to_string(),
        revision_id: revision_id.to_string(),
        revision_number,
        zone_id: zone_id.to_string(),
        zone_name: zone_name.to_string(),
        payload: json!({
            "selected_zone": {
                "name": zone_name,
                "volume_m3": 600.0,
            },
            "draft_summary": {
                "revision_number": revision_number,
            },
        }),
    }
}

fn archive_test_preview(context: &AiTrustedContext) -> AiContextDisclosureView {
    AiContextDisclosureView {
        preview_id: "00000000-0000-5000-8000-000000000004".to_string(),
        project_session_id: context.project_session_id.clone(),
        revision_id: context.revision_id.clone(),
        revision_number: context.revision_number,
        zone_id: context.zone_id.clone(),
        zone_name: context.zone_name.clone(),
        included_scopes: vec!["selected_zone".to_string(), "draft_summary".to_string()],
        excluded_scopes: vec![
            "project_summary".to_string(),
            "run_summary".to_string(),
            "result_summary".to_string(),
            "diagnostics".to_string(),
        ],
        context_fingerprint: "00000000-0000-5000-8000-000000000005".to_string(),
        payload: context.payload.clone(),
        disclosure: AiDisclosureBoundary {
            contains_local_paths: false,
            contains_prj_text: false,
            contains_complete_result_series: false,
            model_request_uses_network: true,
        },
        provider_profile_id: crate::ai_provider::codex_profile_id().to_string(),
        provider_display_name: "Codex".to_string(),
        provider_protocol: "codex_app_server".to_string(),
        destination_origin: None,
        network_scope: "codex_managed".to_string(),
        model_id: "test-model".to_string(),
        analysis_selection: AiAnalysisSelection {
            intent: "explain_object".to_string(),
            result_dataset_fingerprint: None,
            metric: None,
            selected_time_seconds: None,
        },
    }
}

fn archive_test_file(path: &Path, persistence_enabled: bool) {
    write_archive_file(
        path,
        &AiConversationArchiveFile {
            persistence_enabled,
            ..AiConversationArchiveFile::default()
        },
    )
    .unwrap();
}

struct FakeAppServer {
    notifications: Vec<Value>,
}

impl FakeAppServer {
    fn collect(self, thread_id: &str, turn_id: &str) -> (Result<String, &'static str>, usize) {
        let mut state = TurnCollectionState::default();
        let mut interrupts = 0;
        for notification in self.notifications {
            match process_turn_notification(&notification, thread_id, turn_id, &mut state) {
                TurnNotificationAction::Continue => {}
                TurnNotificationAction::InterruptForTool => interrupts += 1,
                TurnNotificationAction::Completed(answer, _) => return (Ok(answer), interrupts),
                TurnNotificationAction::Failed { error, .. } => {
                    return (Err(error.code), interrupts)
                }
            }
        }
        (Err("incomplete"), interrupts)
    }
}

#[test]
fn context_scope_order_is_canonical_and_duplicates_are_rejected() {
    assert_eq!(
        canonical_scopes(vec!["draft_summary".into(), "selected_zone".into()]).unwrap(),
        vec!["selected_zone", "draft_summary"]
    );
    assert_eq!(
        canonical_scopes(vec!["selected_zone".into(), "selected_zone".into()])
            .unwrap_err()
            .code,
        "ai_context_scope_invalid"
    );
}

#[test]
fn answer_contract_rejects_extra_fields_and_oversized_items() {
    let extra = r#"{"deterministic_facts":[],"interpretation":"ok","limitations":[],"suggested_questions":[],"path":"x"}"#;
    assert!(serde_json::from_str::<StructuredAiAnswer>(extra).is_err());
    let invalid = StructuredAiAnswer {
        deterministic_facts: vec!["x".repeat(MAX_RESPONSE_ITEM_CHARS + 1)],
        interpretation: "ok".into(),
        limitations: vec![],
        suggested_questions: vec![],
        semantic_patch: None,
    };
    assert_eq!(
        validate_answer(invalid).unwrap_err().code,
        "ai_response_contract_invalid"
    );
}

#[test]
fn semantic_patch_suggestion_is_closed_bounded_and_baseline_bound() {
    let zone_id = "00000000-0000-5000-8000-000000000101".to_string();
    let patch = AiSemanticPatchSuggestion {
        schema_version: "semantic_patch_suggestion.v1".into(),
        baseline_source_sha256: "a".repeat(64),
        operations: vec![AiSemanticPatchOperation {
            operation: "set_zone_volume".into(),
            object_id: zone_id.clone(),
            field: "volume_m3".into(),
            new_value: "650".into(),
            unit: Some("m3".into()),
            evidence: "semantic_project".into(),
        }],
        affected_object_ids: vec![zone_id],
    };
    let mut answer = archive_test_answer();
    answer.semantic_patch = Some(patch);
    assert!(validate_answer(answer).is_ok());

    let invalid = r#"{"deterministic_facts":[],"interpretation":"ok","limitations":[],"suggested_questions":[],"semantic_patch":{"schema_version":"semantic_patch_suggestion.v1","baseline_source_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","operations":[{"operation":"set_zone_volume","object_id":"00000000-0000-5000-8000-000000000101","field":"volume_m3","new_value":"650","unit":"m3","evidence":"semantic_project","path":"C:\\private"}],"affected_object_ids":["00000000-0000-5000-8000-000000000101"]}}"#;
    assert!(serde_json::from_str::<StructuredAiAnswer>(invalid).is_err());
}

#[test]
fn local_conversation_archive_is_opt_in_and_exposes_only_safe_history() {
    let root = test_root("archive-opt-in");
    let path = root.join("archive.json");
    let store = AiConversationArchiveStore::default();
    let baseline = "a".repeat(64);
    let context = archive_test_context(
        &baseline,
        "00000000-0000-5000-8000-000000000001",
        1,
        "00000000-0000-5000-8000-000000000003",
        "One",
    );
    let preview = archive_test_preview(&context);
    let answer = archive_test_answer();

    let disabled = archive_save_completed_turn(ArchiveSaveCompletedTurnInput {
        store: &store,
        path: &path,
        trusted: &context,
        preview: &preview,
        language: "en",
        model_id: "model-a",
        reasoning_effort: "low",
        question: "What does this Zone mean?",
        answer: &answer,
    });
    assert!(!disabled.saved);
    assert!(disabled.entry_id.is_none());
    assert!(!path.exists());

    archive_test_file(&path, true);
    let saved = archive_save_completed_turn(ArchiveSaveCompletedTurnInput {
        store: &store,
        path: &path,
        trusted: &context,
        preview: &preview,
        language: "en",
        model_id: "model-a",
        reasoning_effort: "low",
        question: "What does this Zone mean?",
        answer: &answer,
    });
    assert!(saved.saved);
    assert!(saved.entry_id.is_some());

    let archive = read_archive_file(&path).unwrap();
    assert!(archive.persistence_enabled);
    assert_eq!(archive.entries.len(), 1);
    let view = archive_view_for_context(&archive, &context);
    assert_eq!(view.entries.len(), 1);
    assert!(view.entries[0].is_current_revision);
    let serialized = serde_json::to_string(&view).unwrap();
    for forbidden in [
        baseline.as_str(),
        "context_fingerprint",
        "archive.json",
        "C:\\\\",
    ] {
        assert!(!serialized.contains(forbidden));
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn local_conversation_archive_filters_by_baseline_and_zone_across_revisions() {
    let root = test_root("archive-filtering");
    let path = root.join("archive.json");
    let store = AiConversationArchiveStore::default();
    let baseline = "b".repeat(64);
    let zone_one = "00000000-0000-5000-8000-000000000003";
    let revision_one = archive_test_context(
        &baseline,
        "00000000-0000-5000-8000-000000000001",
        1,
        zone_one,
        "One",
    );
    let revision_two = archive_test_context(
        &baseline,
        "00000000-0000-5000-8000-000000000002",
        2,
        zone_one,
        "One",
    );
    let other_baseline = archive_test_context(
        &"c".repeat(64),
        "00000000-0000-5000-8000-000000000006",
        1,
        zone_one,
        "One",
    );
    let other_zone = archive_test_context(
        &baseline,
        "00000000-0000-5000-8000-000000000007",
        2,
        "00000000-0000-5000-8000-000000000008",
        "Two",
    );
    archive_test_file(&path, true);
    for context in [&revision_one, &revision_two, &other_baseline, &other_zone] {
        let preview = archive_test_preview(context);
        let saved = archive_save_completed_turn(ArchiveSaveCompletedTurnInput {
            store: &store,
            path: &path,
            trusted: context,
            preview: &preview,
            language: "en",
            model_id: "model-a",
            reasoning_effort: "medium",
            question: "Explain the selected Zone.",
            answer: &archive_test_answer(),
        });
        assert!(saved.saved);
    }

    let archive = read_archive_file(&path).unwrap();
    assert_eq!(archive.entries.len(), 4);
    let view = archive_view_for_context(&archive, &revision_two);
    assert_eq!(view.entries.len(), 2);
    assert!(view
        .entries
        .iter()
        .any(|entry| entry.revision_id == revision_two.revision_id && entry.is_current_revision));
    assert!(view
        .entries
        .iter()
        .any(|entry| entry.revision_id == revision_one.revision_id && !entry.is_current_revision));
    assert!(view.entries.iter().all(|entry| entry.zone_id == zone_one));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn local_conversation_archive_keeps_only_the_newest_safe_entries() {
    let root = test_root("archive-retention");
    let path = root.join("archive.json");
    let store = AiConversationArchiveStore::default();
    let context = archive_test_context(
        &"d".repeat(64),
        "00000000-0000-5000-8000-000000000001",
        1,
        "00000000-0000-5000-8000-000000000003",
        "One",
    );
    let preview = archive_test_preview(&context);
    archive_test_file(&path, true);
    for index in 0..=MAX_ARCHIVE_ENTRIES {
        let question = format!("Question {index}");
        let answer = archive_test_answer();
        let saved = archive_save_completed_turn(ArchiveSaveCompletedTurnInput {
            store: &store,
            path: &path,
            trusted: &context,
            preview: &preview,
            language: "en",
            model_id: "model-a",
            reasoning_effort: "low",
            question: &question,
            answer: &answer,
        });
        assert!(saved.saved);
    }
    let archive = read_archive_file(&path).unwrap();
    assert_eq!(archive.entries.len(), MAX_ARCHIVE_ENTRIES);
    assert!(!archive
        .entries
        .iter()
        .any(|entry| entry.question == "Question 0"));
    assert!(archive
        .entries
        .iter()
        .any(|entry| entry.question == format!("Question {MAX_ARCHIVE_ENTRIES}")));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn local_conversation_archive_rejects_corrupt_or_sensitive_storage() {
    let root = test_root("archive-corrupt");
    let path = root.join("archive.json");
    let store = AiConversationArchiveStore::default();
    let context = archive_test_context(
        &"e".repeat(64),
        "00000000-0000-5000-8000-000000000001",
        1,
        "00000000-0000-5000-8000-000000000003",
        "One",
    );
    let preview = archive_test_preview(&context);
    archive_test_file(&path, true);
    assert!(
        archive_save_completed_turn(ArchiveSaveCompletedTurnInput {
            store: &store,
            path: &path,
            trusted: &context,
            preview: &preview,
            language: "en",
            model_id: "model-a",
            reasoning_effort: "low",
            question: "Explain this Zone.",
            answer: &archive_test_answer(),
        })
        .saved
    );

    let mut archive = read_archive_file(&path).unwrap();
    archive.entries[0].question = "C:\\\\private\\\\project.prj".to_string();
    assert_eq!(
        validate_archive_file(&archive).unwrap_err().code,
        "ai_archive_unavailable"
    );

    fs::write(&path, b"not-json").unwrap();
    assert_eq!(
        read_archive_file(&path).unwrap_err().code,
        "ai_archive_unavailable"
    );
    fs::write(&path, vec![b'x'; (MAX_ARCHIVE_FILE_BYTES + 1) as usize]).unwrap();
    assert_eq!(
        read_archive_file(&path).unwrap_err().code,
        "ai_archive_unavailable"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn local_conversation_archive_migrates_v1_to_provider_bound_v2_atomically() {
    let root = test_root("archive-migration");
    let path = root.join("archive.json");
    let baseline = "f".repeat(64);
    let revision_id = "00000000-0000-5000-8000-000000000001";
    let zone_id = "00000000-0000-5000-8000-000000000003";
    let legacy = AiConversationArchiveFileV1 {
        schema_version: "1.0".to_string(),
        persistence_enabled: true,
        entries: vec![StoredAiConversationArchiveEntryV1 {
            entry_id: "00000000-0000-5000-8000-000000000010".to_string(),
            baseline_source_sha256: baseline,
            revision_id: revision_id.to_string(),
            revision_number: 1,
            zone_id: zone_id.to_string(),
            zone_name: "One".to_string(),
            context_fingerprint: "00000000-0000-5000-8000-000000000011".to_string(),
            language: "en".to_string(),
            model_id: "model-a".to_string(),
            reasoning_effort: "low".to_string(),
            included_scopes: vec!["selected_zone".to_string()],
            completed_at_unix_ms: 1,
            question: "Explain this Zone.".to_string(),
            answer: archive_test_answer(),
        }],
    };
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();

    let migrated = read_archive_file(&path).unwrap();
    assert_eq!(migrated.schema_version, "2.0");
    assert_eq!(migrated.entries.len(), 1);
    assert_eq!(migrated.entries[0].provider_protocol, "codex_app_server");
    assert_eq!(
        migrated.entries[0].provider_profile_id,
        crate::ai_provider::codex_profile_id().to_string()
    );
    assert!(path.with_extension("json.bak").exists());
    let round_trip = read_archive_file(&path).unwrap();
    assert_eq!(round_trip.entries[0].provider_display_name, "Codex");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn tool_events_are_blocked_without_retaining_payloads() {
    for item_type in TOOL_ITEM_TYPES {
        let value = json!({
            "method": "item/started",
            "params": {"item": {"type": item_type, "command": "secret"}}
        });
        assert_eq!(tool_event_category(&value), Some("tool_item"));
    }
    assert_eq!(
        tool_event_category(&json!({"method": "item/commandExecution/requestApproval", "id": 7})),
        Some("approval_or_permission_request")
    );
}

#[test]
fn connection_and_disclosure_views_never_contain_paths_or_credentials() {
    let probe = DesktopCodexProbeResponse {
        request_id: "request-1".into(),
        probe: Some(CodexCliProbeView {
            found: true,
            version: Some("1.2.3".into()),
            source: Some("path".into()),
        }),
        error: None,
    };
    let text = serde_json::to_string(&probe).unwrap();
    assert!(!text.contains("C:\\"));
    assert!(!text.contains("auth.json"));
    assert!(!text.contains("token"));
}

#[test]
fn readonly_instructions_forbid_tools_and_undisclosed_data() {
    let text = thread_system_instructions("en");
    assert!(text.contains("Do not read files"));
    assert!(text.contains("run commands"));
    assert!(text.contains("undisclosed data"));
    let zh = thread_system_instructions("zh-CN");
    assert!(zh.contains("Simplified Chinese"));
}

#[test]
fn response_schema_is_closed_and_bounded() {
    let schema = answer_schema();
    assert_eq!(
        schema.get("additionalProperties"),
        Some(&Value::Bool(false))
    );
    assert_eq!(
        schema.pointer("/properties/deterministic_facts/maxItems"),
        Some(&json!(8))
    );
    assert_eq!(
        schema.pointer("/properties/suggested_questions/maxItems"),
        Some(&json!(6))
    );
    assert_eq!(
        schema.pointer("/properties/semantic_patch/additionalProperties"),
        Some(&json!(false))
    );
}

#[test]
fn openai_strict_schema_derives_from_runtime_contract_without_relaxing_patch_rules() {
    let runtime = structured_ai_answer_schema();
    let strict = openai_strict_structured_ai_answer_schema();
    let core_fields = [
        "deterministic_facts",
        "interpretation",
        "limitations",
        "suggested_questions",
    ];
    for field in core_fields {
        assert_eq!(runtime["properties"][field], strict["properties"][field]);
    }
    assert_eq!(runtime["required"].as_array().unwrap().len(), 4);
    assert_eq!(strict["required"].as_array().unwrap().len(), 5);
    assert!(strict["required"]
        .as_array()
        .unwrap()
        .iter()
        .any(|value| value == "semantic_patch"));
    assert_eq!(
        strict["properties"]["semantic_patch"]["type"],
        json!(["object", "null"])
    );
    assert_eq!(
        strict["properties"]["semantic_patch"]["additionalProperties"],
        json!(false)
    );
    assert_eq!(
        strict["properties"]["semantic_patch"]["required"],
        runtime["properties"]["semantic_patch"]["required"]
    );

    let without_patch = json!({
        "deterministic_facts": [],
        "interpretation": "ok",
        "limitations": [],
        "suggested_questions": []
    });
    assert!(serde_json::from_value::<StructuredAiAnswer>(without_patch).is_ok());
    let with_null_patch = json!({
        "deterministic_facts": [],
        "interpretation": "ok",
        "limitations": [],
        "suggested_questions": [],
        "semantic_patch": null
    });
    assert!(serde_json::from_value::<StructuredAiAnswer>(with_null_patch).is_ok());
}

#[test]
fn protocol_constants_are_bounded() {
    const {
        assert!(MAX_RPC_LINE_BYTES <= 256 * 1024);
        assert!(MAX_RPC_TOTAL_BYTES <= 8 * 1024 * 1024);
    }
    assert!(RPC_TIMEOUT <= Duration::from_secs(10));
    assert!(TURN_TIMEOUT <= Duration::from_secs(90));
    assert!(TURN_INTERRUPT_REQUEST_TIMEOUT <= Duration::from_secs(3));
    assert!(TURN_INTERRUPT_CONFIRM_TIMEOUT <= Duration::from_secs(5));
    assert!(PROBE_TIMEOUT <= Duration::from_secs(5));
    assert!(PROCESS_STOP_TIMEOUT <= Duration::from_secs(3));
}

#[test]
fn codex_version_output_is_strict_and_bounded() {
    assert_eq!(
        parse_codex_version(b"codex-cli 0.144.6\r\n").unwrap(),
        "0.144.6"
    );
    for invalid in [
        b"".as_slice(),
        b"codex-cli".as_slice(),
        b"codex-cli 0.144.6 extra".as_slice(),
        b"other 0.144.6".as_slice(),
        b"codex-cli 0.144.6 --danger".as_slice(),
        &[0xff],
    ] {
        assert_eq!(
            parse_codex_version(invalid).unwrap_err().code,
            "codex_cli_probe_failed"
        );
    }
    assert_eq!(
        parse_codex_version(format!("codex-cli {}", "1".repeat(97)).as_bytes())
            .unwrap_err()
            .code,
        "codex_cli_probe_failed"
    );
}

#[test]
fn probe_stream_pair_uses_one_shared_join_deadline() {
    let first = thread::spawn(|| (b"version".to_vec(), false));
    let second = thread::spawn(|| (Vec::new(), false));
    assert_eq!(
        join_capture_pair_bounded(first, second, Duration::from_secs(1)),
        Some(((b"version".to_vec(), false), (Vec::new(), false)))
    );

    let (release_sender, release_receiver) = mpsc::channel();
    let (finished_sender, finished_receiver) = mpsc::channel();
    let blocked = thread::spawn(move || {
        let _ = release_receiver.recv();
        let _ = finished_sender.send(());
        (Vec::new(), false)
    });
    let ready = thread::spawn(|| (Vec::new(), false));
    assert!(join_capture_pair_bounded(blocked, ready, Duration::from_millis(10)).is_none());
    release_sender.send(()).unwrap();
    finished_receiver
        .recv_timeout(Duration::from_secs(1))
        .unwrap();
}

#[test]
fn safe_request_and_language_validation_reject_injection() {
    assert!(safe_request_id("c74f8588-60e6-4b1f-bcd1-8ec31c52c213"));
    assert!(!safe_request_id("id --danger"));
    assert!(safe_language("zh-CN"));
    assert!(safe_language("en"));
    assert!(!safe_language("../../en"));
}

#[test]
fn account_response_exposes_only_safe_subscription_state() {
    let view = parse_account_response(&json!({
        "account": {
            "type": "chatgpt",
            "planType": "plus",
            "email": "private@example.test",
            "id": "private-user"
        }
    }))
    .unwrap();
    assert!(view.authenticated);
    assert_eq!(view.auth_mode.as_deref(), Some("chatgpt"));
    assert_eq!(view.plan_type.as_deref(), Some("plus"));
    let serialized = serde_json::to_string(&view).unwrap();
    assert!(!serialized.contains("private@example"));
    assert!(!serialized.contains("private-user"));

    let logged_out = parse_account_response(&json!({"account": null})).unwrap();
    assert!(!logged_out.authenticated);
    assert!(logged_out.requires_login);
    assert_eq!(
        parse_account_response(&json!({"account": {"type": "chatgpt/path"}}))
            .unwrap_err()
            .code,
        "codex_account_read_failed"
    );
}

#[test]
fn account_response_accepts_api_key_auth_mode_without_exposing_credentials() {
    let view = parse_account_response(&json!({
        "account": {
            "type": "apiKey",
            "planType": "api"
        }
    }))
    .unwrap();
    assert!(view.authenticated);
    assert_eq!(view.auth_mode.as_deref(), Some("apikey"));
    assert_eq!(view.plan_type.as_deref(), Some("api"));
    assert!(!serde_json::to_string(&view).unwrap().contains("apiKey"));
}

#[test]
fn device_login_response_is_restricted_to_safe_fields() {
    let login = parse_device_login(&json!({
        "type": "chatgptDeviceCode",
        "loginId": "00000000-0000-4000-8000-000000000001",
        "verificationUrl": "https://auth.openai.com/codex/device",
        "userCode": "ABCD-EFGH"
    }))
    .unwrap();
    assert_eq!(login.login_id, "00000000-0000-4000-8000-000000000001");
    assert_eq!(
        login.verification_url.as_deref(),
        Some("https://auth.openai.com/codex/device")
    );
    assert_eq!(login.user_code.as_deref(), Some("ABCD-EFGH"));
    assert_eq!(login.status, "pending");
    assert_eq!(
        parse_device_login(&json!({
            "type": "chatgptDeviceCode",
            "loginId": "00000000-0000-4000-8000-000000000001",
            "verificationUrl": "http://auth.openai.com/codex/device",
            "userCode": "ABCD-EFGH"
        }))
        .unwrap_err()
        .code,
        "ai_provider_auth_failed"
    );
}

#[test]
fn model_catalog_preserves_server_order_and_skips_hidden_models() {
    let mut models = Vec::new();
    let cursor = append_model_page(
        &json!({
            "data": [
                {
                    "model": "visible-model",
                    "displayName": "Visible Model",
                    "hidden": false,
                    "isDefault": true,
                    "defaultReasoningEffort": "low",
                    "supportedReasoningEfforts": [
                        {"reasoningEffort": "low", "description": "Low"},
                        {"reasoningEffort": "high", "description": "High"}
                    ]
                },
                {
                    "model": "hidden-model",
                    "displayName": "Hidden Model",
                    "hidden": true,
                    "defaultReasoningEffort": "medium",
                    "supportedReasoningEfforts": [
                        {"reasoningEffort": "medium", "description": "Medium"}
                    ]
                }
            ],
            "nextCursor": "page-2"
        }),
        &mut models,
    )
    .unwrap();
    assert_eq!(cursor.as_deref(), Some("page-2"));
    assert_eq!(models.len(), 1);
    assert_eq!(models[0].id, "visible-model");
    assert_eq!(
        models[0]
            .reasoning_efforts
            .iter()
            .map(|effort| effort.id.as_str())
            .collect::<Vec<_>>(),
        vec!["low", "high"]
    );
}

#[test]
fn model_catalog_rejects_unknown_default_effort_and_unsafe_ids() {
    for raw in [
        json!({
            "data": [{
                "model": "unsafe/model",
                "displayName": "Unsafe",
                "defaultReasoningEffort": "low",
                "supportedReasoningEfforts": [{"reasoningEffort": "low"}]
            }]
        }),
        json!({
            "data": [{
                "model": "safe-model",
                "displayName": "Safe",
                "defaultReasoningEffort": "ultra",
                "supportedReasoningEfforts": [{"reasoningEffort": "low"}]
            }]
        }),
    ] {
        assert_eq!(
            append_model_page(&raw, &mut Vec::new()).unwrap_err().code,
            "codex_model_catalog_failed"
        );
    }
}

#[test]
fn protocol_parser_rejects_invalid_utf8_non_objects_and_limits() {
    let mut total = 0;
    assert_eq!(
        parse_protocol_message(&mut vec![0xff, b'\n'], &mut total)
            .unwrap_err()
            .code,
        "ai_protocol_message_invalid"
    );
    total = 0;
    assert_eq!(
        parse_protocol_message(&mut b"[]\n".to_vec(), &mut total)
            .unwrap_err()
            .code,
        "ai_protocol_message_invalid"
    );
    total = MAX_RPC_TOTAL_BYTES;
    assert_eq!(
        parse_protocol_message(&mut b"{}\n".to_vec(), &mut total)
            .unwrap_err()
            .code,
        "ai_protocol_message_too_large"
    );
    total = 0;
    assert_eq!(
        parse_protocol_message(&mut b"{\"method\":\"ok\"}\r\n".to_vec(), &mut total).unwrap()
            ["method"],
        "ok"
    );
}

#[test]
fn notification_poll_timeout_is_not_treated_as_disconnect() {
    let (_sender, receiver) = mpsc::channel();
    let connection = AppServerConnection {
        child: Mutex::new(None),
        stdin: Mutex::new(None),
        pending: Mutex::new(HashMap::new()),
        notifications: Mutex::new(receiver),
        deferred_notifications: Mutex::new(VecDeque::new()),
        next_id: AtomicU64::new(1),
        disconnected: AtomicBool::new(false),
        stdout_thread: Mutex::new(None),
        stderr_thread: Mutex::new(None),
        stderr_capture: Arc::new(Mutex::new(Vec::new())),
        stderr_truncated: Arc::new(AtomicBool::new(false)),
        runtime_dir: test_root("notification-timeout"),
    };
    assert_eq!(
        connection
            .next_notification(Duration::from_millis(1))
            .unwrap(),
        None
    );
    connection.close();
}

#[test]
fn close_keeps_runtime_until_blocked_stream_threads_are_joined() {
    let root = test_root("bounded-close");
    let (release_sender, release_receiver) = mpsc::channel();
    let blocked_stdout = thread::spawn(move || {
        let _ = release_receiver.recv();
    });
    let (_sender, receiver) = mpsc::channel();
    let connection = AppServerConnection {
        child: Mutex::new(None),
        stdin: Mutex::new(None),
        pending: Mutex::new(HashMap::new()),
        notifications: Mutex::new(receiver),
        deferred_notifications: Mutex::new(VecDeque::new()),
        next_id: AtomicU64::new(1),
        disconnected: AtomicBool::new(false),
        stdout_thread: Mutex::new(Some(blocked_stdout)),
        stderr_thread: Mutex::new(None),
        stderr_capture: Arc::new(Mutex::new(Vec::new())),
        stderr_truncated: Arc::new(AtomicBool::new(false)),
        runtime_dir: root.clone(),
    };

    let started = Instant::now();
    let first = connection.close();
    assert!(started.elapsed() < Duration::from_secs(1));
    assert!(first.exit_confirmed);
    assert!(!first.stdout_joined);
    assert!(first.stderr_joined);
    assert!(!first.runtime_removed);
    assert!(root.exists());

    release_sender.send(()).unwrap();
    let second = connection.close();
    assert!(second.stdout_joined);
    assert!(second.stderr_joined);
    assert!(second.runtime_removed);
    assert!(!root.exists());
}

#[test]
fn close_outcome_requires_runtime_cleanup_before_it_is_final() {
    let fully_closed = ConnectionCloseOutcome {
        exit_confirmed: true,
        stdin_closed: true,
        kill_requested: false,
        stdout_joined: true,
        stderr_joined: true,
        runtime_removed: true,
    };
    assert!(!fully_closed.needs_retry());

    let runtime_left_behind = ConnectionCloseOutcome {
        runtime_removed: false,
        ..fully_closed
    };
    assert!(runtime_left_behind.needs_retry());
}

#[test]
fn incomplete_close_is_retained_until_a_later_retry_finishes() {
    let root = test_root("retired-close");
    let (release_sender, release_receiver) = mpsc::channel();
    let blocked_stdout = thread::spawn(move || {
        let _ = release_receiver.recv();
    });
    let (_sender, receiver) = mpsc::channel();
    let connection = Arc::new(AppServerConnection {
        child: Mutex::new(None),
        stdin: Mutex::new(None),
        pending: Mutex::new(HashMap::new()),
        notifications: Mutex::new(receiver),
        deferred_notifications: Mutex::new(VecDeque::new()),
        next_id: AtomicU64::new(1),
        disconnected: AtomicBool::new(false),
        stdout_thread: Mutex::new(Some(blocked_stdout)),
        stderr_thread: Mutex::new(None),
        stderr_capture: Arc::new(Mutex::new(Vec::new())),
        stderr_truncated: Arc::new(AtomicBool::new(false)),
        runtime_dir: root.clone(),
    });
    let store = CodexAssistantStore::default();

    let first = store.close_or_retain(Arc::clone(&connection));
    assert!(first.needs_retry());
    assert_eq!(store.retired_connections.lock().unwrap().len(), 1);
    assert!(root.exists());

    release_sender.send(()).unwrap();
    store.retry_retired_connections();
    assert!(store.retired_connections.lock().unwrap().is_empty());
    assert!(!root.exists());
}

#[test]
fn stale_connection_is_cleared_before_a_catalog_can_be_reused() {
    let root = test_root("stale-connection");
    let (_sender, receiver) = mpsc::channel();
    let connection = Arc::new(AppServerConnection {
        child: Mutex::new(None),
        stdin: Mutex::new(None),
        pending: Mutex::new(HashMap::new()),
        notifications: Mutex::new(receiver),
        deferred_notifications: Mutex::new(VecDeque::new()),
        next_id: AtomicU64::new(1),
        disconnected: AtomicBool::new(false),
        stdout_thread: Mutex::new(None),
        stderr_thread: Mutex::new(None),
        stderr_capture: Arc::new(Mutex::new(Vec::new())),
        stderr_truncated: Arc::new(AtomicBool::new(false)),
        runtime_dir: root,
    });
    let mut state = AssistantState {
        connection: Some(Arc::clone(&connection)),
        cli: Some(CodexCliProbeView {
            found: true,
            version: Some("0.144.6".into()),
            source: Some("official_install".into()),
        }),
        account: Some(CodexAccountView {
            authenticated: true,
            auth_mode: Some("chatgpt".into()),
            plan_type: Some("plus".into()),
            requires_login: false,
        }),
        models: vec![CodexModelView {
            id: "model-a".into(),
            display_name: "Model A".into(),
            is_default: true,
            available: true,
            reasoning_efforts: Vec::new(),
            default_reasoning_effort: "".into(),
        }],
        ..AssistantState::default()
    };
    assert!(connection_view(&state).is_none());
    let stale = state.take_unusable_connection().expect("stale connection");
    assert!(Arc::ptr_eq(&stale, &connection));
    assert!(state.connection.is_none());
    assert!(state.cli.is_none());
    assert!(state.account.is_none());
    assert!(state.models.is_empty());
    stale.close();
}

#[test]
fn connection_leases_block_parallel_connects_and_reject_stale_publishers() {
    let mut state = AssistantState::default();
    let first = state.reserve_connection("request-first").unwrap();
    assert!(state.connection_lease_is_current(&first));
    assert_eq!(
        state.reserve_connection("request-second").unwrap_err().code,
        "codex_app_server_start_failed"
    );

    state.invalidate_connection_attempt();
    assert!(!state.connection_lease_is_current(&first));

    let second = state.reserve_connection("request-second").unwrap();
    assert_ne!(first.generation, second.generation);
    assert!(state.connection_lease_is_current(&second));
    state.release_connection_lease(&first);
    assert!(state.connection_lease_is_current(&second));
    state.release_connection_lease(&second);
    assert!(state.connecting.is_none());
}

#[test]
fn replaced_connection_cannot_be_used_to_start_a_turn() {
    let first_root = test_root("turn-connection-first");
    let second_root = test_root("turn-connection-second");
    let (_first_sender, first_receiver) = mpsc::channel();
    let (_second_sender, second_receiver) = mpsc::channel();
    let first = Arc::new(AppServerConnection {
        child: Mutex::new(None),
        stdin: Mutex::new(None),
        pending: Mutex::new(HashMap::new()),
        notifications: Mutex::new(first_receiver),
        deferred_notifications: Mutex::new(VecDeque::new()),
        next_id: AtomicU64::new(1),
        disconnected: AtomicBool::new(false),
        stdout_thread: Mutex::new(None),
        stderr_thread: Mutex::new(None),
        stderr_capture: Arc::new(Mutex::new(Vec::new())),
        stderr_truncated: Arc::new(AtomicBool::new(false)),
        runtime_dir: first_root,
    });
    let second = Arc::new(AppServerConnection {
        child: Mutex::new(None),
        stdin: Mutex::new(None),
        pending: Mutex::new(HashMap::new()),
        notifications: Mutex::new(second_receiver),
        deferred_notifications: Mutex::new(VecDeque::new()),
        next_id: AtomicU64::new(1),
        disconnected: AtomicBool::new(false),
        stdout_thread: Mutex::new(None),
        stderr_thread: Mutex::new(None),
        stderr_capture: Arc::new(Mutex::new(Vec::new())),
        stderr_truncated: Arc::new(AtomicBool::new(false)),
        runtime_dir: second_root,
    });
    let mut state = AssistantState {
        connection: Some(Arc::clone(&first)),
        ..AssistantState::default()
    };
    assert!(state.has_connection(&first));
    state.connection = Some(Arc::clone(&second));
    assert!(!state.has_connection(&first));
    assert!(state.has_connection(&second));
    first.close();
    second.close();
}

#[test]
fn fake_app_server_collects_agent_deltas_and_ignores_old_turns() {
    let server = FakeAppServer {
        notifications: vec![
            json!({"method":"item/agentMessage/delta","params":{"threadId":"old","turnId":"old","delta":"secret"}}),
            json!({"method":"item/started","params":{"threadId":"old","turnId":"old","item":{"type":"commandExecution","command":"stale"}}}),
            json!({"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","delta":"{\"deterministic_facts\":[],"}}),
            json!({"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","delta":"\"interpretation\":\"ok\",\"limitations\":[],\"suggested_questions\":[]}"}}),
            json!({"method":"turn/completed","params":{"threadId":"thread-1","turnId":"turn-1","turn":{"status":"completed"}}}),
        ],
    };
    let (answer, interrupts) = server.collect("thread-1", "turn-1");
    assert_eq!(interrupts, 0);
    assert!(answer.unwrap().contains("\"interpretation\":\"ok\""));
}

#[test]
fn fake_app_server_blocks_tool_and_approval_events_and_discards_answer() {
    for event in [
        json!({"method":"item/started","params":{"threadId":"thread-1","turnId":"turn-1","item":{"type":"commandExecution","command":"private"}}}),
        json!({"id":42,"method":"item/fileChange/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1"}}),
    ] {
        let server = FakeAppServer {
            notifications: vec![
                json!({"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","delta":"must discard"}}),
                event,
                json!({"method":"turn/completed","params":{"threadId":"thread-1","turnId":"turn-1","turn":{"status":"interrupted"}}}),
            ],
        };
        let (answer, interrupts) = server.collect("thread-1", "turn-1");
        assert_eq!(answer.unwrap_err(), "ai_tool_use_blocked");
        assert_eq!(interrupts, 1);
    }
}

#[test]
fn tool_blocked_turn_requires_matching_terminal_confirmation() {
    let mut state = TurnCollectionState::default();
    let tool = json!({
        "method": "item/started",
        "params": {
            "threadId": "thread-1",
            "turnId": "turn-1",
            "item": {"type": "commandExecution"}
        }
    });
    assert!(matches!(
        process_turn_notification(&tool, "thread-1", "turn-1", &mut state),
        TurnNotificationAction::InterruptForTool
    ));
    let completed = json!({
        "method": "turn/completed",
        "params": {
            "threadId": "thread-1",
            "turnId": "turn-1",
            "turn": {"status": "interrupted"}
        }
    });
    match process_turn_notification(&completed, "thread-1", "turn-1", &mut state) {
        TurnNotificationAction::Failed {
            error,
            completion_confirmed,
            ..
        } => {
            assert_eq!(error.code, "ai_tool_use_blocked");
            assert!(completion_confirmed);
        }
        _ => panic!("expected a confirmed blocked-turn completion"),
    }
}

#[test]
fn unconfirmed_turn_outcome_requires_connection_reset() {
    let unconfirmed = TurnWaitOutcome::Failed {
        error: RpcFailure::new("codex_app_server_disconnected"),
        token_usage: None,
        completion_confirmed: false,
    };
    assert!(turn_outcome_requires_connection_reset(&unconfirmed));

    let confirmed = TurnWaitOutcome::Failed {
        error: RpcFailure::new("ai_turn_interrupted"),
        token_usage: None,
        completion_confirmed: true,
    };
    assert!(!turn_outcome_requires_connection_reset(&confirmed));
    let completed = TurnWaitOutcome::Completed {
        answer: "{}".to_string(),
        token_usage: None,
    };
    assert!(!turn_outcome_requires_connection_reset(&completed));
}

#[test]
fn active_turn_interrupt_is_claimed_once_across_callers() {
    let requested = AtomicBool::new(false);
    assert!(claim_turn_interrupt(&requested));
    assert!(requested.load(Ordering::Acquire));
    assert!(!claim_turn_interrupt(&requested));
}

#[test]
fn turn_start_failure_marks_ambiguous_submission_for_connection_reset() {
    assert!(
        !TurnStartFailure::before_turn(RpcFailure::new("ai_turn_start_failed"))
            .turn_may_have_started
    );
    assert!(
        TurnStartFailure::after_turn_attempt(RpcFailure::new("ai_turn_start_failed"))
            .turn_may_have_started
    );
}

#[test]
fn cli_discovery_is_explicit_and_does_not_accept_argument_strings() {
    let root = test_root("discovery");
    let executable = root.join("codex.exe");
    fs::write(&executable, b"fake").unwrap();
    let (configured, source) =
        discover_codex_from(Some(executable.clone().into_os_string()), None, None).unwrap();
    assert_eq!(configured, fs::canonicalize(&executable).unwrap());
    assert_eq!(source, "environment");
    assert_eq!(
        discover_codex_from(Some(OsString::from("codex.exe --danger")), None, None)
            .unwrap_err()
            .code,
        "codex_cli_invalid"
    );
    let path = env::join_paths([root.as_path()]).unwrap();
    let (_, source) = discover_codex_from(None, Some(path), None).unwrap();
    assert_eq!(source, "path");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn official_user_install_is_preferred_over_path_without_scanning() {
    let root = test_root("official-install-discovery");
    let local = root.join("local");
    let path_dir = root.join("path");
    let official = official_codex_install_path(&local);
    fs::create_dir_all(official.parent().unwrap()).unwrap();
    fs::create_dir_all(&path_dir).unwrap();
    fs::write(&official, b"official").unwrap();
    fs::write(path_dir.join("codex.exe"), b"path").unwrap();
    let path = env::join_paths([path_dir.as_path()]).unwrap();
    let (selected, source) =
        discover_codex_from(None, Some(path), Some(local.clone().into_os_string())).unwrap();
    assert_eq!(selected, fs::canonicalize(official).unwrap());
    assert_eq!(source, "official_install");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn explicit_environment_path_still_precedes_official_user_install() {
    let root = test_root("configured-before-official");
    let configured = root.join("configured").join("codex.exe");
    let local = root.join("local");
    let official = official_codex_install_path(&local);
    fs::create_dir_all(configured.parent().unwrap()).unwrap();
    fs::create_dir_all(official.parent().unwrap()).unwrap();
    fs::write(&configured, b"configured").unwrap();
    fs::write(&official, b"official").unwrap();
    let (selected, source) = discover_codex_from(
        Some(configured.clone().into_os_string()),
        None,
        Some(local.into_os_string()),
    )
    .unwrap();
    assert_eq!(selected, fs::canonicalize(configured).unwrap());
    assert_eq!(source, "environment");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn official_installer_wrapper_is_fixed_pinned_and_noninteractive() {
    let script = installer_wrapper_script();
    assert!(script.contains(OFFICIAL_CODEX_INSTALLER_URL));
    assert!(script.contains(OFFICIAL_CODEX_INSTALLER_SHA256));
    assert!(script.contains("CODEX_NON_INTERACTIVE"));
    assert!(script.contains("Get-FileHash"));
    assert!(!script.contains("request_id"));
    assert!(!script.contains("Invoke-Expression"));
    assert!(INSTALL_TIMEOUT.as_secs() <= 180);
    const {
        assert!(MAX_INSTALLER_SCRIPT_BYTES <= 128 * 1024);
    }
}

#[test]
fn installer_failures_map_to_stable_codes_without_output() {
    assert_eq!(
        installer_exit_diagnostic(Some(22), false).code,
        "codex_cli_installer_unsupported"
    );
    assert_eq!(
        installer_exit_diagnostic(None, true).code,
        "codex_cli_install_timeout"
    );
    assert_eq!(
        installer_exit_diagnostic(Some(1), false).code,
        "codex_cli_install_failed"
    );
}

#[test]
fn installer_response_contains_no_command_url_or_path() {
    let response = DesktopCodexInstallResponse {
        request_id: "request-1".into(),
        status: "installed".into(),
        probe: Some(CodexCliProbeView {
            found: true,
            version: Some("0.144.6".into()),
            source: Some("official_install".into()),
        }),
        error: None,
    };
    let serialized = serde_json::to_string(&response).unwrap();
    for forbidden in ["C:\\", "https://", "powershell", "install.ps1"] {
        assert!(!serialized.contains(forbidden));
    }
}

#[test]
fn executable_identity_recheck_detects_replacement() {
    let root = test_root("identity");
    let path = root.join("codex.exe");
    fs::write(&path, b"first").unwrap();
    let metadata = fs::metadata(&path).unwrap();
    let (sha256, size_bytes) = sha256_file(&path).unwrap();
    let executable = CodexExecutable {
        path: path.clone(),
        version: "test".into(),
        source: "environment".into(),
        sha256,
        size_bytes,
        modified: metadata.modified().ok(),
    };
    verify_codex_identity(&executable).unwrap();
    fs::write(&path, b"second").unwrap();
    assert_eq!(
        verify_codex_identity(&executable).unwrap_err().code,
        "codex_cli_invalid"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn controlled_environment_excludes_project_and_python_variables() {
    let mut command = Command::new("codex.exe");
    apply_codex_environment(&mut command);
    let names = command
        .get_envs()
        .filter_map(|(name, value)| value.map(|_| name.to_string_lossy().to_string()))
        .collect::<Vec<_>>();
    assert!(!names.iter().any(|name| name.starts_with("CONTAM_STUDIO_")));
    assert!(!names
        .iter()
        .any(|name| matches!(name.as_str(), "PYTHONPATH" | "PYTHONHOME" | "VIRTUAL_ENV")));
}

#[test]
fn thread_and_turn_requests_enforce_readonly_tool_free_contract() {
    let runtime = Path::new("C:\\controlled-ai-runtime");
    let thread = thread_start_params("model-a", runtime, "en");
    assert_eq!(thread["cwd"], runtime.to_string_lossy().as_ref());
    assert_eq!(thread["approvalPolicy"], "never");
    assert_eq!(thread["sandbox"], "read-only");
    assert_eq!(thread["ephemeral"], true);
    assert_eq!(thread["config"]["mcp_servers"], json!({}));
    assert_eq!(thread["dynamicTools"], json!([]));
    assert_eq!(thread["selectedCapabilityRoots"], json!([]));
    assert_eq!(thread["environments"], json!([]));
    assert_eq!(thread["experimentalRawEvents"], false);

    let turn = turn_start_params("thread-1", "request-1", "safe context", "model-a", "low");
    assert_eq!(turn["approvalPolicy"], "never");
    assert_eq!(turn["sandboxPolicy"]["type"], "readOnly");
    assert_eq!(turn["sandboxPolicy"]["networkAccess"], false);
    assert_eq!(turn["environments"], json!([]));
    assert_eq!(turn["summary"], "none");
    assert_eq!(turn["outputSchema"]["additionalProperties"], false);
}

#[test]
fn readonly_thread_response_accepts_inherited_instruction_sources_without_workspace_access() {
    let root = test_root("readonly-thread-response");
    let runtime = root.join("runtime");
    fs::create_dir_all(&runtime).unwrap();
    let response = json!({
        "thread": {"id": "thread-1"},
        "cwd": runtime.to_string_lossy(),
        "sandbox": {"type": "readOnly", "networkAccess": false},
        "approvalPolicy": "never",
        "instructionSources": ["C:\\Users\\test-user\\.codex\\AGENTS.md"],
        "runtimeWorkspaceRoots": []
    });
    assert_eq!(
        validate_readonly_thread_response(&response, &runtime).unwrap(),
        "thread-1"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn readonly_thread_response_accepts_only_the_controlled_runtime_workspace_root() {
    let root = test_root("readonly-thread-response-reject");
    let runtime = root.join("runtime");
    let other_runtime = root.join("other-runtime");
    fs::create_dir_all(&runtime).unwrap();
    fs::create_dir_all(&other_runtime).unwrap();
    let base = json!({
        "thread": {"id": "thread-1"},
        "cwd": runtime.to_string_lossy(),
        "sandbox": {"type": "readOnly", "networkAccess": false},
        "approvalPolicy": "never",
        "instructionSources": [],
        "runtimeWorkspaceRoots": []
    });
    assert!(validate_readonly_thread_response(&base, &runtime).is_ok());

    let mut with_controlled_runtime_root = base.clone();
    with_controlled_runtime_root["runtimeWorkspaceRoots"] = json!([runtime.to_string_lossy()]);
    assert!(validate_readonly_thread_response(&with_controlled_runtime_root, &runtime).is_ok());

    let mut with_workspace_root = base.clone();
    with_workspace_root["runtimeWorkspaceRoots"] = json!([other_runtime.to_string_lossy()]);
    assert_eq!(
        validate_readonly_thread_response(&with_workspace_root, &runtime)
            .unwrap_err()
            .code,
        "codex_readonly_mode_unavailable"
    );

    let mut mismatched_runtime = base.clone();
    mismatched_runtime["cwd"] = json!(other_runtime.to_string_lossy());
    assert_eq!(
        validate_readonly_thread_response(&mismatched_runtime, &runtime)
            .unwrap_err()
            .code,
        "codex_readonly_mode_unavailable"
    );

    let mut invalid_instruction_source = base;
    invalid_instruction_source["instructionSources"] = json!([42]);
    assert_eq!(
        validate_readonly_thread_response(&invalid_instruction_source, &runtime)
            .unwrap_err()
            .code,
        "codex_readonly_mode_unavailable"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn context_invalidation_cancels_active_turn_and_keeps_connection_catalog() {
    let store = CodexAssistantStore::default();
    let cancellation = Arc::new(AtomicBool::new(false));
    let interrupt_requested = Arc::new(AtomicBool::new(false));
    {
        let mut state = store.state.lock().unwrap();
        state.cli = Some(CodexCliProbeView {
            found: true,
            version: Some("1.0.0".into()),
            source: Some("path".into()),
        });
        state.account = Some(CodexAccountView {
            authenticated: true,
            auth_mode: Some("chatgpt".into()),
            plan_type: Some("plus".into()),
            requires_login: false,
        });
        state.models.push(CodexModelView {
            id: "model-a".into(),
            display_name: "Model A".into(),
            is_default: true,
            available: true,
            reasoning_efforts: vec![CodexReasoningEffortView {
                id: "low".into(),
                description: "Low".into(),
            }],
            default_reasoning_effort: "low".into(),
        });
        state.thread_id = Some("thread-private".into());
        state.active_turn_thread_id = Some("thread-private".into());
        state.active_turn_id = Some("turn-private".into());
        state.active_turn_request_id = Some("request-private".into());
        state.active_turn_epoch = Some(0);
        state.active_turn_cancel = Some(Arc::clone(&cancellation));
        state.active_turn_interrupt_requested = Some(Arc::clone(&interrupt_requested));
        state.cancel_requested = false;
    }
    store.invalidate_context();
    let state = store.state.lock().unwrap();
    assert!(state.thread_id.is_none());
    assert_eq!(state.active_turn_id.as_deref(), Some("turn-private"));
    assert_eq!(
        state.active_turn_request_id.as_deref(),
        Some("request-private")
    );
    assert!(state.cancel_requested);
    assert!(cancellation.load(Ordering::Acquire));
    assert!(!interrupt_requested.load(Ordering::Acquire));
    assert_eq!(state.context_epoch, 1);
    assert_eq!(state.models.len(), 1);
    assert!(state
        .account
        .as_ref()
        .is_some_and(|account| account.authenticated));
}

#[test]
fn thread_binding_changes_for_every_trusted_dimension() {
    let binding = AiThreadBinding {
        project_session_id: "session-a".into(),
        revision_id: "revision-a".into(),
        zone_id: "zone-a".into(),
        context_fingerprint: "fingerprint-a".into(),
        language: "en".into(),
        model_id: "model-a".into(),
        reasoning_effort: "low".into(),
    };
    for changed in [
        AiThreadBinding {
            project_session_id: "session-b".into(),
            ..binding.clone()
        },
        AiThreadBinding {
            revision_id: "revision-b".into(),
            ..binding.clone()
        },
        AiThreadBinding {
            zone_id: "zone-b".into(),
            ..binding.clone()
        },
        AiThreadBinding {
            context_fingerprint: "fingerprint-b".into(),
            ..binding.clone()
        },
        AiThreadBinding {
            language: "zh-CN".into(),
            ..binding.clone()
        },
        AiThreadBinding {
            model_id: "model-b".into(),
            ..binding.clone()
        },
        AiThreadBinding {
            reasoning_effort: "high".into(),
            ..binding.clone()
        },
    ] {
        assert_ne!(binding, changed);
    }
}

#[test]
fn preview_is_bound_to_language_model_and_reasoning_effort() {
    let trusted = AiTrustedContext {
        project_session_id: "session-a".into(),
        baseline_source_sha256: "a".repeat(64),
        revision_id: "revision-a".into(),
        revision_number: 1,
        zone_id: "zone-a".into(),
        zone_name: "One".into(),
        payload: json!({"selected_zone": {"name": "One"}}),
    };
    let preview = AiPreviewRecord {
        view: AiContextDisclosureView {
            preview_id: "preview-a".into(),
            project_session_id: trusted.project_session_id.clone(),
            revision_id: trusted.revision_id.clone(),
            revision_number: trusted.revision_number,
            zone_id: trusted.zone_id.clone(),
            zone_name: trusted.zone_name.clone(),
            included_scopes: vec!["selected_zone".into()],
            excluded_scopes: Vec::new(),
            context_fingerprint: "fingerprint-a".into(),
            payload: trusted.payload.clone(),
            disclosure: AiDisclosureBoundary {
                contains_local_paths: false,
                contains_prj_text: false,
                contains_complete_result_series: false,
                model_request_uses_network: true,
            },
            provider_profile_id: crate::ai_provider::codex_profile_id().to_string(),
            provider_display_name: "Codex".to_string(),
            provider_protocol: "codex_app_server".to_string(),
            destination_origin: None,
            network_scope: "codex_managed".to_string(),
            model_id: "test-model".to_string(),
            analysis_selection: AiAnalysisSelection {
                intent: "explain_object".to_string(),
                result_dataset_fingerprint: None,
                metric: None,
                selected_time_seconds: None,
            },
        },
        trusted,
        language: "en".into(),
        model_id: "model-a".into(),
        reasoning_effort: "low".into(),
    };
    let matches = |language: &str, model: &str, effort: &str| {
        preview_matches_turn(
            &preview,
            "preview-a",
            "session-a",
            "revision-a",
            "zone-a",
            &["selected_zone".into()],
            language,
            model,
            effort,
            &AiAnalysisSelection {
                intent: "explain_object".to_string(),
                result_dataset_fingerprint: None,
                metric: None,
                selected_time_seconds: None,
            },
        )
    };
    assert!(matches("en", "model-a", "low"));
    assert!(!matches("zh-CN", "model-a", "low"));
    assert!(!matches("en", "model-b", "low"));
    assert!(!matches("en", "model-a", "high"));
}

#[test]
fn token_usage_notification_is_whitelisted() {
    let usage = token_usage_from_notification(&json!({
        "method": "thread/tokenUsage/updated",
        "params": {
            "threadId": "private-thread",
            "tokenUsage": {"total": {
                "inputTokens": 10,
                "cachedInputTokens": 4,
                "outputTokens": 5,
                "totalTokens": 15,
                "secretMetadata": "not exposed"
            }}
        }
    }))
    .unwrap();
    assert_eq!(usage.input_tokens, Some(10));
    assert_eq!(usage.cached_input_tokens, Some(4));
    assert_eq!(usage.output_tokens, Some(5));
    assert_eq!(usage.total_tokens, Some(15));
    assert!(!serde_json::to_string(&usage)
        .unwrap()
        .contains("secretMetadata"));
}
