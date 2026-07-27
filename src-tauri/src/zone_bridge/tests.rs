use super::*;
use std::fs;

fn fixture_path(relative: &str) -> PathBuf {
    std::fs::canonicalize(project_root().join(relative)).unwrap()
}

fn primary_fixture() -> PathBuf {
    fixture_path("fixtures/contam/official-contamxpy/test_GetPrjInfo.prj")
}

fn test_draft_root(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!("contam-studio-{label}-{}", std::process::id()))
}

fn fnd06_root(label: &str) -> PathBuf {
    PathBuf::from(r"F:\Codex_File\temp\contam-studio")
        .join(format!("fnd-06-{label}-{}", std::process::id()))
}

fn test_run_summary(run_id: &str) -> ContamXRunSummaryView {
    ContamXRunSummaryView {
        status: "succeeded".into(),
        run_id: run_id.into(),
        solver_name: "contamx3.exe".into(),
        solver_version: "3.4.0.3".into(),
        started_at_utc: "2026-07-19T00:00:00Z".into(),
        duration_ms: 72,
        exit_code: 0,
        timed_out: false,
        sim_artifact_count: 1,
        source_unchanged: true,
    }
}

fn active_context(
    label: &str,
    source: PathBuf,
    project: &ProjectInspection,
) -> ActiveProjectContext {
    let store = DesktopProjectSessionStore::default();
    store.activate_project(
        format!("session-{label}"),
        source,
        test_draft_root(label),
        project,
    );
    let active = store.state.lock().unwrap().active_project.clone().unwrap();
    active
}

fn synthetic_active(
    label: &str,
    source: PathBuf,
    sha256: String,
    size: u64,
) -> ActiveProjectContext {
    let project = ProjectInspection {
        schema_version: "1.0".into(),
        reader_mode: READER_MODE.into(),
        source_path: safe_project_file_name(&source),
        source_sha256: sha256,
        source_size_bytes: size,
        source_unchanged: true,
        header_version: "3.4.0.4".into(),
        header_variant: 0,
        declared_zone_count: 0,
        zones: Vec::new(),
        first_zone: None,
        diagnostics: Vec::new(),
    };
    active_context(label, source, &project)
}

fn append_test_revision(
    active: &mut ActiveProjectContext,
    revision_id: &str,
    new_volume_token: &str,
) -> PathBuf {
    let plan_id = format!("plan-{revision_id}");
    let zone_id = active.zones[0].zone_id.clone();
    let contam_number = active.zones[0].contam_number;
    let request = json!({
        "protocol_version": PROTOCOL_VERSION,
        "request_id": plan_id,
        "operation": PLAN_OPERATION,
        "source_path": active.source_path,
        "contam_number": contam_number,
        "new_volume_token": new_volume_token,
    });
    let envelope = execute_bridge_request(&request, &plan_id, READ_AND_PLAN_TIMEOUT).unwrap();
    let raw: RawPatchPlanResult = serde_json::from_value(envelope.result.unwrap()).unwrap();
    let (planned, _) = validate_plan_result(
        raw,
        active,
        &plan_id,
        &zone_id,
        contam_number,
        new_volume_token,
    )
    .unwrap();
    let revision_number = active.active_revision().revision_number + 1;
    let snapshots = active.draft_root.join("snapshots");
    fs::create_dir_all(&snapshots).unwrap();
    let output = fs::canonicalize(snapshots)
        .unwrap()
        .join(format!("revision-{revision_number}-{revision_id}.prj"));
    let request = json!({
        "protocol_version": PROTOCOL_VERSION,
        "request_id": revision_id,
        "operation": APPLY_OPERATION,
        "source_path": active.source_path,
        "output_path": output,
        "patch": planned.patch,
    });
    let envelope = execute_bridge_request(&request, revision_id, APPLY_TIMEOUT).unwrap();
    let raw: RawPatchApplicationResult = serde_json::from_value(envelope.result.unwrap()).unwrap();
    let mut project = validate_application_result(raw, active, &planned, &output).unwrap();
    project.source_path = safe_project_file_name(&active.baseline_source_path);
    let revision = DraftRevision {
        revision_id: revision_id.into(),
        revision_number,
        parent_revision_id: Some(active.active_revision().revision_id.clone()),
        source_path: output.clone(),
        source_sha256: project.source_sha256.clone(),
        source_size_bytes: project.source_size_bytes,
        project: project.clone(),
        patch: Some(DraftPatchSummary {
            zone_id,
            contam_number,
            old_token: planned.patch.preconditions.old_token,
            new_token: planned.patch.replacement.new_token,
        }),
        semantic_patch: None,
        created_at_unix_ms: unix_time_ms(),
        application_owned: true,
    };
    let truncated = active.revisions.split_off(active.revision_cursor + 1);
    for old in truncated {
        if old.application_owned {
            let _ = fs::remove_file(old.source_path);
        }
    }
    active.revisions.push(revision);
    active.sync_to_revision(active.revisions.len() - 1);
    output
}

fn outcome(stdout: Vec<u8>) -> ProcessOutcome {
    ProcessOutcome {
        success: true,
        exit_code: Some(0),
        timed_out: false,
        stdout: Capture {
            bytes: stdout,
            exceeded: false,
        },
        stderr: Capture {
            bytes: Vec::new(),
            exceeded: false,
        },
    }
}

#[test]
fn python_discovery_and_timeout_limits_are_explicit() {
    let python = project_root().join("python/.venv/Scripts/python.exe");
    assert_eq!(
        discover_python(Some(python.clone().into_os_string()), Path::new("ignored")),
        Ok(python)
    );
    assert_eq!(READ_AND_PLAN_TIMEOUT, Duration::from_secs(10));
    assert_eq!(APPLY_TIMEOUT, Duration::from_secs(15));
    assert_eq!(EXTRACT_TIMEOUT, Duration::from_secs(45));
    assert_eq!(RUN_TIMEOUT, Duration::from_secs(75));
    assert_eq!(MAX_REQUEST_BYTES, 128 * 1024);
}

#[test]
fn python_rust_bridge_goldens_use_closed_raw_models() {
    let read: RawBridgeEnvelope = serde_json::from_str(include_str!(
        "../../../contracts/python-rust-bridge/v1.2/read/success.json"
    ))
    .unwrap();
    let read_result: RawReadZonesResult = serde_json::from_value(read.result.unwrap()).unwrap();
    assert!(read_result
        .project
        .zones
        .iter()
        .all(|zone| { serde_json::to_value(zone).unwrap().get("zone_id").is_none() }));

    let plan: RawBridgeEnvelope = serde_json::from_str(include_str!(
        "../../../contracts/python-rust-bridge/v1.2/plan/success.json"
    ))
    .unwrap();
    let _: RawPatchPlanResult = serde_json::from_value(plan.result.unwrap()).unwrap();

    let apply: RawBridgeEnvelope = serde_json::from_str(include_str!(
        "../../../contracts/python-rust-bridge/v1.2/apply/success.json"
    ))
    .unwrap();
    let _: RawPatchApplicationResult = serde_json::from_value(apply.result.unwrap()).unwrap();

    let extract: RawBridgeEnvelope = serde_json::from_str(include_str!(
        "../../../contracts/python-rust-bridge/v1.2/extract/success.json"
    ))
    .unwrap();
    let _: RawZoneAirStateExtraction = serde_json::from_value(extract.result.unwrap()).unwrap();

    let run: RawBridgeEnvelope = serde_json::from_str(include_str!(
        "../../../contracts/python-rust-bridge/v1.2/run/success.json"
    ))
    .unwrap();
    let _: RawContamXRunResult = serde_json::from_value(run.result.unwrap()).unwrap();
}

#[test]
fn contract_mutations_reject_unknown_fields_at_every_depth_and_stream_limits() {
    let read_json = || {
        serde_json::from_str::<Value>(include_str!(
            "../../../contracts/python-rust-bridge/v1.2/read/success.json"
        ))
        .unwrap()
    };
    let mut envelope = read_json();
    envelope["unexpected"] = json!(true);
    assert!(serde_json::from_value::<RawBridgeEnvelope>(envelope).is_err());

    let mut result = read_json();
    result["result"]["unexpected"] = json!(true);
    let result_envelope: RawBridgeEnvelope = serde_json::from_value(result).unwrap();
    assert!(serde_json::from_value::<RawReadZonesResult>(result_envelope.result.unwrap()).is_err());

    let mut plan = serde_json::from_str::<Value>(include_str!(
        "../../../contracts/python-rust-bridge/v1.2/plan/success.json"
    ))
    .unwrap();
    plan["result"]["patch"]["target"]["unexpected"] = json!(true);
    let plan_envelope: RawBridgeEnvelope = serde_json::from_value(plan).unwrap();
    assert!(serde_json::from_value::<RawPatchPlanResult>(plan_envelope.result.unwrap()).is_err());

    let mut extract = serde_json::from_str::<Value>(include_str!(
        "../../../contracts/python-rust-bridge/v1.2/extract/success.json"
    ))
    .unwrap();
    extract["result"]["parsed_result"]["source_evidence"]["unexpected"] = json!(true);
    let extract_envelope: RawBridgeEnvelope = serde_json::from_value(extract).unwrap();
    assert!(
        serde_json::from_value::<RawZoneAirStateExtraction>(extract_envelope.result.unwrap())
            .is_err()
    );

    let mut schema = serde_json::from_str::<Value>(include_str!(
        "../../../contracts/python-rust-bridge/v1.2/plan/success.json"
    ))
    .unwrap();
    schema["result"]["patch"]["schema_version"] = json!("9.9");
    let schema_envelope: RawBridgeEnvelope = serde_json::from_value(schema).unwrap();
    let schema_result: RawPatchPlanResult =
        serde_json::from_value(schema_envelope.result.unwrap()).unwrap();
    assert_ne!(schema_result.patch.schema_version, RESULT_SCHEMA_VERSION);

    let exact_stdout = read_limited(
        std::io::Cursor::new(vec![0_u8; MAX_STDOUT_BYTES]),
        MAX_STDOUT_BYTES,
    );
    assert_eq!(exact_stdout.bytes.len(), MAX_STDOUT_BYTES);
    assert!(!exact_stdout.exceeded);
    let oversized_stdout = read_limited(
        std::io::Cursor::new(vec![0_u8; MAX_STDOUT_BYTES + 1]),
        MAX_STDOUT_BYTES,
    );
    assert_eq!(oversized_stdout.bytes.len(), MAX_STDOUT_BYTES);
    assert!(oversized_stdout.exceeded);

    let exact_stderr = read_limited(
        std::io::Cursor::new(vec![0_u8; MAX_STDERR_BYTES]),
        MAX_STDERR_BYTES,
    );
    assert_eq!(exact_stderr.bytes.len(), MAX_STDERR_BYTES);
    assert!(!exact_stderr.exceeded);
    let oversized_stderr = read_limited(
        std::io::Cursor::new(vec![0_u8; MAX_STDERR_BYTES + 1]),
        MAX_STDERR_BYTES,
    );
    assert_eq!(oversized_stderr.bytes.len(), MAX_STDERR_BYTES);
    assert!(oversized_stderr.exceeded);

    let raw = RawReaderDiagnostic {
        code: "bridge_request_invalid".into(),
        message: "C:/secret/model.prj token=secret".into(),
        source_line_number: Some(1),
        context: Some(BTreeMap::from([
            ("source_path".into(), json!("C:/secret/model.prj")),
            ("credential".into(), json!("secret")),
            ("token".into(), json!("safe-token")),
            ("field".into(), json!("volume_m3")),
        ])),
    };
    let safe = sanitize_raw_diagnostic(raw).unwrap();
    let serialized = serde_json::to_string(&safe).unwrap();
    assert!(!serialized.contains("model.prj"));
    assert!(!serialized.contains("credential"));
    assert!(serialized.contains("safe-token"));
}

#[test]
fn nonempty_stderr_and_transport_failures_are_rejected() {
    let mut value = outcome(b"{}".to_vec());
    value.stderr.bytes = b"unexpected".to_vec();
    assert_eq!(
        validate_transport(value, "request-1").unwrap_err().0,
        "python_stderr_not_empty"
    );
    let mut value = outcome(Vec::new());
    value.timed_out = true;
    assert_eq!(
        validate_transport(value, "request-1").unwrap_err().0,
        "python_process_timeout"
    );
}

#[test]
fn diagnostics_are_sanitized_before_webview_serialization() {
    let raw = RawReaderDiagnostic {
        code: "patch_precondition_failed".into(),
        message: "Traceback C:/secret/model.prj".repeat(30),
        source_line_number: Some(9),
        context: Some(BTreeMap::from([
            ("token".into(), json!("x".repeat(300))),
            ("source_path".into(), json!("C:/secret/model.prj")),
            ("field".into(), json!({"nested": true})),
            ("old_token".into(), json!("600")),
        ])),
    };
    let safe = sanitize_raw_diagnostic(raw).unwrap();
    let serialized = serde_json::to_string(&safe).unwrap();
    assert!(!serialized.contains("Traceback"));
    assert!(!serialized.contains("secret"));
    assert_eq!(safe.context.len(), 2);
    assert_eq!(safe.context["token"].as_str().unwrap().len(), 120);
}

#[test]
fn draft_export_rules_refuse_existing_source_and_internal_snapshots() {
    let root = std::env::temp_dir().join(format!("contam-studio-rust-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let source = root.join("source.prj");
    fs::write(&source, b"source").unwrap();
    let source = fs::canonicalize(source).unwrap();
    let (sha256, size) = sha256_file(&source).unwrap();
    let mut active = synthetic_active("export-rules", source.clone(), sha256, size);
    active.draft_root = root.join("draft-root");
    fs::create_dir_all(active.draft_root.join("snapshots")).unwrap();
    let no_extension = root.join("copy");
    assert!(validate_draft_export_destination(&active, &no_extension)
        .unwrap()
        .ends_with("copy.prj"));
    assert_eq!(
        validate_draft_export_destination(&active, &source),
        Err("draft_export_conflicts_with_source")
    );
    let existing = root.join("existing.prj");
    fs::write(&existing, b"keep").unwrap();
    assert_eq!(
        validate_draft_export_destination(&active, &existing),
        Err("draft_export_destination_exists")
    );
    assert_eq!(
        validate_draft_export_destination(&active, &root.join("copy.txt")),
        Err("draft_export_destination_invalid")
    );
    let internal = active.draft_root.join("snapshots").join("internal.prj");
    fs::write(&internal, b"draft").unwrap();
    assert_eq!(
        validate_draft_export_destination(&active, &internal),
        Err("draft_export_conflicts_with_source")
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn operation_latch_prevents_concurrent_project_operations() {
    let store = DesktopProjectSessionStore::default();
    let first = store.try_operation().unwrap();
    assert!(store.try_operation().is_none());
    drop(first);
    assert!(store.try_operation().is_some());
}

#[test]
fn zone_uuid_is_deterministic_project_bound_and_well_formed() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "uuid-baseline").result.unwrap();
    let first = &project.zones[0];
    let repeated = stable_zone_uuid(
        &project.source_sha256,
        "zone",
        first.contam_number,
        first.source_line_number,
    );
    assert_eq!(first.zone_id, repeated);
    assert!(Uuid::parse_str(&first.zone_id).is_ok());
    assert_eq!(first.zone_id.as_bytes()[14], b'5');
    assert_ne!(first.zone_id, project.zones[1].zone_id);
    assert_ne!(
        first.zone_id,
        zone_uuid(
            &"0".repeat(64),
            "zone",
            first.contam_number,
            first.source_line_number,
            &first.name,
        )
    );
}

#[test]
fn immutable_draft_history_preserves_zone_ids_and_truncates_redo() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "draft-history").result.unwrap();
    let mut active = active_context("draft-history", fixture.clone(), &project);
    let _ = fs::remove_dir_all(&active.draft_root);
    let baseline_hash = active.source_sha256.clone();
    let zone_id = active.zones[0].zone_id.clone();
    let revision1_path =
        append_test_revision(&mut active, "11111111-1111-5111-8111-111111111111", "650.0");
    let revision1_bytes = fs::read(&revision1_path).unwrap();
    assert_eq!(active.draft_summary().revision_number, 1);
    assert_eq!(active.zones[0].zone_id, zone_id);
    assert_eq!(active.zones[0].volume_m3, 650.0);
    assert_ne!(active.source_sha256, baseline_hash);

    let old_revision2_path =
        append_test_revision(&mut active, "22222222-2222-5222-8222-222222222222", "700.0");
    assert_eq!(active.draft_summary().revision_number, 2);
    assert_eq!(active.zones[0].zone_id, zone_id);
    assert_eq!(active.zones[0].volume_m3, 700.0);
    assert_eq!(fs::read(&revision1_path).unwrap(), revision1_bytes);

    let revision1 =
        validate_draft_revision(&active, &active.revisions[1], "undo-r1", false).unwrap();
    active.revisions[1].project = revision1;
    active.sync_to_revision(1);
    assert!(active.draft_summary().can_redo);
    let baseline =
        validate_draft_revision(&active, &active.revisions[0], "undo-r0", false).unwrap();
    active.revisions[0].project = baseline;
    active.sync_to_revision(0);
    assert_eq!(active.zones[0].volume_m3, 600.0);
    assert_eq!(active.zones[0].zone_id, zone_id);
    let redone = validate_draft_revision(&active, &active.revisions[1], "redo-r1", false).unwrap();
    active.revisions[1].project = redone;
    active.sync_to_revision(1);

    let new_revision2_path =
        append_test_revision(&mut active, "33333333-3333-5333-8333-333333333333", "675.0");
    assert_eq!(active.revisions.len(), 3);
    assert!(!active.draft_summary().can_redo);
    assert_eq!(active.zones[0].volume_m3, 675.0);
    assert_eq!(active.zones[0].zone_id, zone_id);
    assert!(!old_revision2_path.exists());
    assert!(new_revision2_path.exists());
    assert!(sha256_file(&fixture)
        .unwrap()
        .0
        .eq_ignore_ascii_case(&baseline_hash));
    fs::remove_dir_all(&active.draft_root).unwrap();
}

#[test]
fn changed_baseline_is_rejected_without_moving_the_history_cursor() {
    let root = std::env::temp_dir().join(format!(
        "contam-studio-baseline-source-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let source = root.join("baseline.prj");
    fs::copy(primary_fixture(), &source).unwrap();
    let source = fs::canonicalize(source).unwrap();
    let project = execute_read(&source, "baseline-copy").result.unwrap();
    let mut active = active_context("baseline-change", source.clone(), &project);
    append_test_revision(&mut active, "44444444-4444-5444-8444-444444444444", "650.0");
    assert_eq!(active.revision_cursor, 1);
    let mut bytes = fs::read(&source).unwrap();
    bytes.push(b'\n');
    fs::write(&source, bytes).unwrap();
    let error =
        validate_draft_revision(&active, &active.revisions[0], "undo-changed", false).unwrap_err();
    assert_eq!(error.code, "draft_baseline_changed");
    assert_eq!(active.revision_cursor, 1);
    let _ = fs::remove_dir_all(&active.draft_root);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn draft_copy_is_byte_exact_non_overwriting_and_has_a_path_free_summary() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "draft-copy").result.unwrap();
    let mut active = active_context("draft-copy", fixture, &project);
    let _ = fs::remove_dir_all(&active.draft_root);
    append_test_revision(&mut active, "55555555-5555-5555-8555-555555555555", "650.0");
    let root = std::env::temp_dir().join(format!("contam-studio-copy-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let output = root.join("draft-copy.prj");
    copy_draft_atomically(&active.source_path, &output).unwrap();
    assert_eq!(
        fs::read(&output).unwrap(),
        fs::read(&active.source_path).unwrap()
    );
    assert_eq!(
        copy_draft_atomically(&active.source_path, &output),
        Err("draft_export_destination_exists")
    );
    let (verified_sha256, verified_size, verified_project) =
        verify_draft_export_copy(&active, &output, "draft-copy-verify").unwrap();
    assert_eq!(verified_sha256, active.source_sha256.to_ascii_uppercase());
    assert!(verified_sha256.eq_ignore_ascii_case(&active.source_sha256));
    assert_eq!(verified_size, active.source_size_bytes);
    assert_eq!(verified_project.zones, active.zones);
    assert_eq!(verified_project.zones[0].volume_m3, 650.0);
    assert_eq!(
        verified_project.zones[0].zone_id,
        active.revisions[0].project.zones[0].zone_id
    );
    let summary = DraftExportSummary {
        file_name: "draft-copy.prj".into(),
        sha256: active.source_sha256.clone(),
        size_bytes: active.source_size_bytes,
        zone_count: active.zones.len() as u64,
        revision_number: active.active_revision().revision_number,
        matches_active_revision: true,
    };
    let serialized = serde_json::to_string(&summary).unwrap();
    for forbidden in ["source_path", "output_path", "draft_root", "snapshots"] {
        assert!(!serialized.contains(forbidden));
    }
    fs::remove_dir_all(root).unwrap();
    fs::remove_dir_all(&active.draft_root).unwrap();
}

#[test]
fn draft_copy_commit_race_preserves_competing_target_and_cleans_temporary_file() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "draft-copy-race").result.unwrap();
    let active = active_context("draft-copy-race", fixture, &project);
    let _ = fs::remove_dir_all(&active.draft_root);
    let root = std::env::temp_dir().join(format!("contam-studio-copy-race-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let output = root.join("draft-copy-race.prj");
    let sentinel_path = root.join("sentinel.bin");
    let sentinel = b"concurrent target must survive";
    fs::write(&sentinel_path, sentinel).unwrap();
    let expected = sha256_file(&sentinel_path).unwrap();

    let result = copy_draft_atomically_with_commit(&active.source_path, &output, |_, output| {
        fs::write(output, sentinel)?;
        Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "target was created concurrently",
        ))
    });

    assert_eq!(result, Err("draft_export_destination_exists"));
    assert_eq!(sha256_file(&output).unwrap(), expected);
    assert_eq!(fs::read(&output).unwrap(), sentinel);
    assert!(!fs::read_dir(&root).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".draft.tmp")
    }));

    fs::remove_dir_all(root).unwrap();
    let _ = fs::remove_dir_all(&active.draft_root);
}

#[test]
fn draft_export_command_path_accepts_lowercase_source_hash() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "draft-command-lowercase")
        .result
        .unwrap();
    let active = active_context("draft-command-lowercase", fixture, &project);
    let _ = fs::remove_dir_all(&active.draft_root);
    let root = fnd06_root("lowercase");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let output = root.join("draft-command-lowercase.prj");

    let (sha256, size, verified_project) =
        export_draft_copy(&active, &output, "draft-command-lowercase-request").unwrap();
    assert!(sha256.eq_ignore_ascii_case(&active.source_sha256));
    assert_eq!(size, active.source_size_bytes);
    assert_eq!(verified_project.zones, active.zones);
    assert_eq!(sha256, sha256.to_ascii_uppercase());

    fs::remove_dir_all(root).unwrap();
    let _ = fs::remove_dir_all(&active.draft_root);
}

#[test]
fn draft_export_command_path_preserves_competing_target_on_verification_failure() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "draft-command-verify-race")
        .result
        .unwrap();
    let active = active_context("draft-command-verify-race", fixture, &project);
    let _ = fs::remove_dir_all(&active.draft_root);
    let root = fnd06_root("verify-race");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let output = root.join("draft-command-verify-race.prj");
    let sentinel = b"competing target must survive verification cleanup";

    let result = export_draft_copy_with_commit(
        &active,
        &output,
        "draft-command-verify-race-request",
        |_, output| {
            fs::write(output, sentinel)?;
            Ok(())
        },
    );

    assert_eq!(result.unwrap_err().code, "draft_export_verification_failed");
    assert_eq!(fs::read(&output).unwrap(), sentinel);
    fs::remove_dir_all(root).unwrap();
    let _ = fs::remove_dir_all(&active.draft_root);
}

#[test]
fn draft_export_command_path_preserves_competing_target_on_commit_failure() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "draft-command-commit-race")
        .result
        .unwrap();
    let active = active_context("draft-command-commit-race", fixture, &project);
    let _ = fs::remove_dir_all(&active.draft_root);
    let root = fnd06_root("commit-race");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let output = root.join("draft-command-commit-race.prj");
    let sentinel = b"competing target must survive commit failure";

    let result = export_draft_copy_with_commit(
        &active,
        &output,
        "draft-command-commit-race-request",
        |_, output| {
            fs::write(output, sentinel)?;
            Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "target was created concurrently",
            ))
        },
    );

    assert_eq!(result.unwrap_err().code, "draft_export_destination_exists");
    assert_eq!(fs::read(&output).unwrap(), sentinel);
    assert!(!fs::read_dir(&root).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".draft.tmp")
    }));
    fs::remove_dir_all(root).unwrap();
    let _ = fs::remove_dir_all(&active.draft_root);
}

#[test]
fn review_view_does_not_serialize_source_or_byte_ranges() {
    let review = PatchReviewView {
        project_session_id: "session-1".into(),
        patch_id: "patch-1".into(),
        zone_id: "00000000-0000-5000-8000-000000000001".into(),
        zone_number: 1,
        zone_name: "One".into(),
        field: PATCH_FIELD.into(),
        old_token: "600".into(),
        new_token: "650".into(),
        old_value: 600.0,
        new_value: 650.0,
        source_line_number: 243,
        old_line: "old".into(),
        new_line: "new".into(),
        diff_text: "diff".into(),
    };
    let encoded = serde_json::to_string(&review).unwrap();
    assert!(!encoded.contains("source_path"));
    assert!(!encoded.contains("byte_start"));
    assert!(!encoded.contains("byte_end"));
    assert!(!encoded.contains("preconditions"));
}

#[test]
fn session_store_replaces_project_and_clears_patch() {
    let store = DesktopProjectSessionStore::default();
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-session").result.unwrap();
    store.activate_project(
        "session-1".into(),
        fixture,
        test_draft_root("session-1"),
        &project,
    );
    assert_eq!(
        store
            .state
            .lock()
            .unwrap()
            .active_project
            .as_ref()
            .unwrap()
            .project_session_id,
        "session-1"
    );
    store.state.lock().unwrap().planned_patch = None;
    assert!(store.state.lock().unwrap().planned_patch.is_none());
}

#[test]
fn activating_a_new_project_replaces_session_and_clears_reviewed_patch() {
    let store = DesktopProjectSessionStore::default();
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-session").result.unwrap();
    store.activate_project(
        "session-1".into(),
        fixture.clone(),
        test_draft_root("session-1a"),
        &project,
    );
    let active = store.state.lock().unwrap().active_project.clone().unwrap();
    let request = json!({"protocol_version": PROTOCOL_VERSION, "request_id": "plan-store", "operation": PLAN_OPERATION, "source_path": active.source_path, "contam_number": 1, "new_volume_token": "650"});
    let envelope = execute_bridge_request(&request, "plan-store", READ_AND_PLAN_TIMEOUT).unwrap();
    let raw: RawPatchPlanResult = serde_json::from_value(envelope.result.unwrap()).unwrap();
    let zone_id = active.zones[0].zone_id.clone();
    let (planned, _) =
        validate_plan_result(raw, &active, "plan-store", &zone_id, 1, "650").unwrap();
    store.state.lock().unwrap().planned_patch = Some(planned);

    store.activate_project(
        "session-2".into(),
        fixture,
        test_draft_root("session-2a"),
        &project,
    );
    let state = store.state.lock().unwrap();
    assert_eq!(
        state.active_project.as_ref().unwrap().project_session_id,
        "session-2"
    );
    assert!(state.planned_patch.is_none());
}

#[test]
fn plan_contract_rejects_source_hash_and_target_mismatches() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-plan").result.unwrap();
    let active = active_context("plan", fixture.clone(), &project);
    let zone_id = active.zones[0].zone_id.clone();
    let request = json!({"protocol_version": PROTOCOL_VERSION, "request_id": "plan-contract", "operation": PLAN_OPERATION, "source_path": fixture, "contam_number": 1, "new_volume_token": "650"});
    let envelope =
        execute_bridge_request(&request, "plan-contract", READ_AND_PLAN_TIMEOUT).unwrap();
    let raw: RawPatchPlanResult = serde_json::from_value(envelope.result.unwrap()).unwrap();

    let mut hash_mismatch = raw.clone();
    hash_mismatch.patch.source_sha256 = "0".repeat(64);
    assert_eq!(
        validate_plan_result(hash_mismatch, &active, "plan-contract", &zone_id, 1, "650")
            .unwrap_err()
            .code,
        "patch_response_contract_invalid"
    );

    let mut target_mismatch = raw.clone();
    target_mismatch.patch.target.contam_number = 2;
    assert_eq!(
        validate_plan_result(
            target_mismatch,
            &active,
            "plan-contract",
            &zone_id,
            1,
            "650"
        )
        .unwrap_err()
        .code,
        "patch_response_contract_invalid"
    );

    let mut source_mismatch = raw;
    source_mismatch.patch.source_path =
        fixture_path("fixtures/contam/official-nist-tutorials/demo1c.prj")
            .to_string_lossy()
            .into_owned();
    assert_eq!(
        validate_plan_result(
            source_mismatch,
            &active,
            "plan-contract",
            &zone_id,
            1,
            "650"
        )
        .unwrap_err()
        .code,
        "patch_response_source_mismatch"
    );
}

fn raw_air_state_result() -> RawZoneAirStateExtraction {
    let sample = RawZoneAirStateSample {
        index: 0,
        day_of_year: 1,
        day_type: None,
        sim_time_seconds: 0.0,
        temperature_k: 293.15,
        reference_pressure_pa: -1.4222,
        air_density_kg_m3: 1.2041,
    };
    RawZoneAirStateExtraction {
        result_type: "zone_air_state_extraction".into(),
        extraction_id: "extract-1".into(),
        status: "succeeded".into(),
        run_id: "run-1".into(),
        zone_number: 1,
        zone_name: "One".into(),
        sample_count: 1,
        first_sample: sample.clone(),
        parsed_result: RawZoneAirStateSeries {
            schema_version: RESULT_SCHEMA_VERSION.into(),
            result_type: "zone_air_state".into(),
            run_id: "run-1".into(),
            extraction_id: "extract-1".into(),
            zone_number: 1,
            zone_name: "One".into(),
            source_line_number: 243,
            unit_system: "SI".into(),
            sample_count: 1,
            samples: vec![sample],
            source_evidence: RawZoneAirStateSourceEvidence {
                relative_path: "workspace/zone.nfr".into(),
                sha256: "a".repeat(64),
                size_bytes: 10,
            },
            day_type_source: "not_available_in_simread_nfr_v1".into(),
            time_contract: "elapsed_seconds_from_first_sample".into(),
            diagnostics: Vec::new(),
        },
        result_manifest_path: None,
        source_evidence: None,
        run_manifest: None,
    }
}

fn raw_contamx_run(root: &Path, active: &ActiveProjectContext) -> RawContamXRunResult {
    let run_id = "20260718T120000Z-abcdef12";
    let run_directory = root.join(run_id);
    let evidence = run_directory.join("evidence");
    fs::create_dir_all(&evidence).unwrap();
    let manifest_path = evidence.join("manifest.json");
    fs::write(&manifest_path, b"{}").unwrap();
    let artifact = RawRunArtifact {
        classification: "simulation_result".into(),
        relative_path: "workspace/test_GetPrjInfo.sim".into(),
        sha256: "b".repeat(64),
        size_bytes: 3,
        suffix: ".sim".into(),
    };
    let snapshot = RawRunInputSnapshot {
        classification: "input_snapshot".into(),
        relative_path: "workspace/test_GetPrjInfo.prj".into(),
        snapshot_sha256: active.source_sha256.clone(),
        snapshot_size_bytes: active.source_size_bytes,
        source_path: active.source_path.to_string_lossy().into_owned(),
        source_sha256: active.source_sha256.clone(),
        source_size_bytes: active.source_size_bytes,
        source_unchanged: true,
    };
    RawContamXRunResult {
        result_type: "contamx_run".into(),
        run: RawContamXRun {
            run_id: run_id.into(),
            status: "succeeded".into(),
            run_directory: run_directory.to_string_lossy().into_owned(),
            manifest_path: manifest_path.to_string_lossy().into_owned(),
            solver_version: "3.4.0.3".into(),
            exit_code: Some(0),
            timed_out: false,
            primary_artifacts: vec![artifact.clone()],
            manifest: RawRunManifest {
                schema_version: "1.0".into(),
                run_id: run_id.into(),
                status: "succeeded".into(),
                execution_mode: "isolated_contamx_process".into(),
                started_at_utc: "2026-07-18T12:00:00Z".into(),
                ended_at_utc: "2026-07-18T12:00:01Z".into(),
                duration_ms: 1000,
                source: RawRunSource {
                    directory_entries_after: Vec::new(),
                    directory_entries_before: Vec::new(),
                    path: active.source_path.to_string_lossy().into_owned(),
                    sha256: active.source_sha256.clone(),
                    size_bytes: active.source_size_bytes,
                    unchanged: true,
                },
                input_snapshots: vec![snapshot],
                solver: RawRunSolver {
                    architecture: "windows-x64".into(),
                    name: "contamx3.exe".into(),
                    path: "C:/tools/contamx3.exe".into(),
                    provenance: "NIST official package".into(),
                    sha256: "c".repeat(64),
                    size_bytes: 100,
                    version: "3.4.0.3".into(),
                },
                command: RawRunCommand {
                    arguments: vec!["test_GetPrjInfo.prj".into()],
                    executable: "contamx3.exe".into(),
                },
                working_directory: "workspace".into(),
                exit_code: Some(0),
                timed_out: false,
                stdout: RawRunStreamEvidence {
                    relative_path: "evidence/stdout.bin".into(),
                    sha256: "d".repeat(64),
                    size_bytes: 0,
                    truncated: false,
                },
                stderr: RawRunStreamEvidence {
                    relative_path: "evidence/stderr.bin".into(),
                    sha256: "e".repeat(64),
                    size_bytes: 0,
                    truncated: false,
                },
                artifacts: vec![artifact],
                diagnostics: vec![],
            },
        },
    }
}

#[test]
fn contamx_run_contract_validates_paths_identity_and_safe_webview_view() {
    let root = std::env::temp_dir().join(format!("contam-run-contract-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let active = synthetic_active("run", primary_fixture(), "a".repeat(64), 1);
    let raw = raw_contamx_run(&root, &active);
    let (summary, context) = validate_contamx_run_result(raw.clone(), &active, &root).unwrap();
    assert_eq!(summary.sim_artifact_count, 1);
    assert!(context.is_bound_to(&active));
    let serialized = serde_json::to_string(&summary).unwrap();
    for forbidden in [
        "manifest",
        "run_directory",
        "source_path",
        root.to_string_lossy().as_ref(),
    ] {
        assert!(!serialized.contains(forbidden));
    }

    let mut mismatch = raw.clone();
    mismatch.run.manifest.source.sha256 = "b".repeat(64);
    assert_eq!(
        validate_contamx_run_result(mismatch, &active, &root)
            .unwrap_err()
            .code,
        "run_response_contract_invalid"
    );

    let mut solver = raw.clone();
    solver.run.manifest.solver.version = "3.4.0.2".into();
    assert_eq!(
        validate_contamx_run_result(solver, &active, &root)
            .unwrap_err()
            .code,
        "run_response_contract_invalid"
    );

    let mut wrong_architecture = raw.clone();
    wrong_architecture.run.manifest.solver.architecture = "x86".into();
    assert_eq!(
        validate_contamx_run_result(wrong_architecture, &active, &root)
            .unwrap_err()
            .code,
        "run_response_contract_invalid"
    );

    let mut no_sim = raw.clone();
    no_sim.run.primary_artifacts.clear();
    assert_eq!(
        validate_contamx_run_result(no_sim, &active, &root)
            .unwrap_err()
            .code,
        "run_response_contract_invalid"
    );

    let mut diagnostics = raw.clone();
    diagnostics
        .run
        .manifest
        .diagnostics
        .push(RawReaderDiagnostic {
            code: "run_process_failed".into(),
            message: "hidden".into(),
            source_line_number: None,
            context: None,
        });
    assert_eq!(
        validate_contamx_run_result(diagnostics, &active, &root)
            .unwrap_err()
            .code,
        "run_response_contract_invalid"
    );

    let mut escape = raw;
    escape.run.manifest_path = primary_fixture().to_string_lossy().into_owned();
    assert_eq!(
        validate_contamx_run_result(escape, &active, &root)
            .unwrap_err()
            .code,
        "run_response_path_invalid"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn active_run_is_cleared_by_project_activation_and_failure_does_not_mutate_it() {
    let store = DesktopProjectSessionStore::default();
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "run-store-read").result.unwrap();
    store.activate_project(
        "session-1".into(),
        fixture.clone(),
        test_draft_root("run-store-1"),
        &project,
    );
    let revision_id = store
        .state
        .lock()
        .unwrap()
        .active_project
        .as_ref()
        .unwrap()
        .active_revision()
        .revision_id
        .clone();
    let manifest = fixture.clone();
    let retained = ActiveRunContext {
        project_session_id: "session-1".into(),
        source_sha256: project.source_sha256.clone(),
        revision_id,
        run_id: "run-1".into(),
        manifest_path: manifest,
        succeeded: true,
        summary: test_run_summary("run-1"),
    };
    store.state.lock().unwrap().active_run = Some(retained.clone());
    let _failure = run_failure(
        "request",
        host_diagnostic("run_process_failed", "failed", BTreeMap::new()),
    );
    assert_eq!(
        store
            .state
            .lock()
            .unwrap()
            .active_run
            .as_ref()
            .unwrap()
            .run_id,
        "run-1"
    );
    store.activate_project(
        "session-2".into(),
        fixture,
        test_draft_root("run-store-2"),
        &project,
    );
    assert!(store.state.lock().unwrap().active_run.is_none());
}

#[test]
fn active_run_context_is_bound_to_the_app_local_run_manifest() {
    let root =
        std::env::temp_dir().join(format!("contam-active-run-context-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let manifest = root
        .join("20260718T120000Z-abcdef12")
        .join("evidence")
        .join("manifest.json");
    fs::create_dir_all(manifest.parent().unwrap()).unwrap();
    fs::write(&manifest, b"{}").unwrap();
    let root = fs::canonicalize(root).unwrap();
    let active = synthetic_active("active-run", primary_fixture(), "a".repeat(64), 1);
    let context = ActiveRunContext {
        project_session_id: active.project_session_id.clone(),
        source_sha256: active.source_sha256.clone(),
        revision_id: active.active_revision().revision_id.clone(),
        run_id: "20260718T120000Z-abcdef12".into(),
        manifest_path: manifest,
        succeeded: true,
        summary: test_run_summary("20260718T120000Z-abcdef12"),
    };
    assert_eq!(
        validate_active_run_context(&context, &active, &root).unwrap(),
        fs::canonicalize(&context.manifest_path).unwrap()
    );

    let mut project_mismatch = context.clone();
    project_mismatch.source_sha256 = "b".repeat(64);
    assert_eq!(
        validate_active_run_context(&project_mismatch, &active, &root)
            .unwrap_err()
            .code,
        "active_run_project_mismatch"
    );

    let mut invalid_id = context.clone();
    invalid_id.run_id = "../escape".into();
    assert_eq!(
        validate_active_run_context(&invalid_id, &active, &root)
            .unwrap_err()
            .code,
        "active_run_invalid"
    );

    let mut missing = context.clone();
    missing.manifest_path = root
        .join("20260718T120000Z-missing12")
        .join("evidence")
        .join("manifest.json");
    missing.run_id = "20260718T120000Z-missing12".into();
    assert_eq!(
        validate_active_run_context(&missing, &active, &root)
            .unwrap_err()
            .code,
        "active_run_invalid"
    );

    let outside = root
        .parent()
        .unwrap()
        .join(format!("outside-manifest-{}.json", std::process::id()));
    fs::write(&outside, b"{}").unwrap();
    let mut escaped = context.clone();
    escaped.manifest_path = outside.clone();
    assert_eq!(
        validate_active_run_context(&escaped, &active, &root)
            .unwrap_err()
            .code,
        "active_run_invalid"
    );

    fs::remove_file(outside).unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn active_run_result_must_match_the_expected_run() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-active-result").result.unwrap();
    let active = active_context("active-result", fixture, &project);
    assert_eq!(
        validate_zone_air_state_result(raw_air_state_result(), &active, 1, Some("different-run"))
            .unwrap_err()
            .code,
        "active_run_result_mismatch"
    );
}

#[test]
fn active_result_context_is_strictly_bound_and_follows_session_lifecycle() {
    let store = DesktopProjectSessionStore::default();
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-active-result-store")
        .result
        .unwrap();
    store.activate_project(
        "session-result".into(),
        fixture.clone(),
        test_draft_root("result-store"),
        &project,
    );
    let active = store.state.lock().unwrap().active_project.clone().unwrap();
    let view = validate_zone_air_state_result(raw_air_state_result(), &active, 1, None).unwrap();
    store
        .retain_result(&active, ActiveResultSource::SelectedManifest, &view)
        .unwrap();
    {
        let state = store.state.lock().unwrap();
        let retained = state.active_result.as_ref().unwrap();
        let zone_id = active.zones[0].zone_id.as_str();
        assert_eq!(retained.source, ActiveResultSource::SelectedManifest);
        retained
            .validate_export_identity(&active, zone_id, "run-1", "extract-1")
            .unwrap();
        assert_eq!(
            retained
                .validate_export_identity(
                    &active,
                    "00000000-0000-5000-8000-000000000002",
                    "run-1",
                    "extract-1"
                )
                .unwrap_err()
                .code,
            "active_result_zone_mismatch"
        );
        assert_eq!(
            retained
                .validate_export_identity(&active, zone_id, "other", "extract-1")
                .unwrap_err()
                .code,
            "active_result_identity_mismatch"
        );
        assert_eq!(
            retained
                .validate_export_identity(&active, zone_id, "run-1", "other-extraction")
                .unwrap_err()
                .code,
            "active_result_identity_mismatch"
        );
        let mut other_project = active.clone();
        other_project.source_sha256 = "b".repeat(64);
        assert_eq!(
            retained
                .validate_export_identity(&other_project, zone_id, "run-1", "extract-1")
                .unwrap_err()
                .code,
            "active_result_project_mismatch"
        );
    }
    store
        .retain_result(&active, ActiveResultSource::ActiveRun, &view)
        .unwrap();
    assert_eq!(
        store
            .state
            .lock()
            .unwrap()
            .active_result
            .as_ref()
            .unwrap()
            .source,
        ActiveResultSource::ActiveRun
    );

    let previous = store.state.lock().unwrap().active_result.clone();
    let mut invalid = view.clone();
    invalid.zone_name = "Wrong".into();
    assert!(store
        .retain_result(&active, ActiveResultSource::ActiveRun, &invalid)
        .is_err());
    assert_eq!(
        store
            .state
            .lock()
            .unwrap()
            .active_result
            .as_ref()
            .unwrap()
            .run_id,
        previous.unwrap().run_id
    );

    store.activate_project(
        "session-new".into(),
        fixture,
        test_draft_root("result-new"),
        &project,
    );
    assert!(store.state.lock().unwrap().active_result.is_none());
}

#[test]
fn a_new_successful_run_does_not_clear_the_retained_result() {
    let store = DesktopProjectSessionStore::default();
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-run-retains-result")
        .result
        .unwrap();
    store.activate_project(
        "session-retained".into(),
        fixture.clone(),
        test_draft_root("result-retained"),
        &project,
    );
    let active = store.state.lock().unwrap().active_project.clone().unwrap();
    let view = validate_zone_air_state_result(raw_air_state_result(), &active, 1, None).unwrap();
    store
        .retain_result(&active, ActiveResultSource::SelectedManifest, &view)
        .unwrap();
    store.state.lock().unwrap().active_run = Some(ActiveRunContext {
        project_session_id: active.project_session_id.clone(),
        source_sha256: active.source_sha256.clone(),
        revision_id: active.active_revision().revision_id.clone(),
        run_id: "new-run".into(),
        manifest_path: fixture,
        succeeded: true,
        summary: test_run_summary("new-run"),
    });
    assert_eq!(
        store
            .state
            .lock()
            .unwrap()
            .active_result
            .as_ref()
            .unwrap()
            .run_id,
        "run-1"
    );
}

#[test]
fn ai_context_is_built_from_bound_state_without_paths_or_full_series() {
    let store = DesktopProjectSessionStore::default();
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-ai-context").result.unwrap();
    store.activate_project(
        "session-ai".into(),
        fixture.clone(),
        test_draft_root("ai-context"),
        &project,
    );
    let active = store.state.lock().unwrap().active_project.clone().unwrap();
    let zone = active.zones[0].clone();
    let result = validate_zone_air_state_result(raw_air_state_result(), &active, 1, None).unwrap();
    store
        .retain_result(&active, ActiveResultSource::SelectedManifest, &result)
        .unwrap();
    store.state.lock().unwrap().active_run = Some(ActiveRunContext {
        project_session_id: active.project_session_id.clone(),
        source_sha256: active.source_sha256.clone(),
        revision_id: active.active_revision().revision_id.clone(),
        run_id: "run-1".into(),
        manifest_path: fixture,
        succeeded: true,
        summary: test_run_summary("run-1"),
    });
    let context = store
        .build_ai_context(
            &active.project_session_id,
            &active.active_revision().revision_id,
            &zone.zone_id,
            &[
                "project_summary".into(),
                "selected_zone".into(),
                "draft_summary".into(),
                "run_summary".into(),
                "result_summary".into(),
                "diagnostics".into(),
            ],
        )
        .unwrap();
    assert_eq!(
        context.payload.pointer("/run_summary/solver_name"),
        Some(&json!("contamx3.exe"))
    );
    assert_eq!(
        context
            .payload
            .pointer("/result_summary/full_series_disclosed"),
        Some(&Value::Bool(false))
    );
    assert!(context.payload.pointer("/result_summary/samples").is_none());
    let serialized = serde_json::to_string(&context).unwrap();
    assert!(!serialized.contains("source_path"));
    assert!(!serialized.contains("manifest_path"));
    assert!(!serialized.contains(active.source_path.to_string_lossy().as_ref()));
    assert!(!serialized.contains(&active.source_sha256));

    assert_eq!(
        store
            .build_ai_context(
                &active.project_session_id,
                &Uuid::from_u128(1).to_string(),
                &zone.zone_id,
                &["selected_zone".into()],
            )
            .unwrap_err()
            .code,
        "ai_context_stale"
    );
}

#[test]
fn deterministic_csv_preserves_rows_numbers_and_protects_text_fields() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-csv-result").result.unwrap();
    let active = active_context("csv", fixture, &project);
    let mut view =
        validate_zone_air_state_result(raw_air_state_result(), &active, 1, None).unwrap();
    let first = view.samples[0].clone();
    view.samples = (0..577)
        .map(|index| ZoneAirStateSampleView {
            index,
            sim_time_seconds: index as f64 * 300.0,
            reference_pressure_pa: -1.4222,
            air_density_kg_m3: 1.2041,
            ..first.clone()
        })
        .collect();
    view.sample_count = 577;
    let context = ActiveResultContext::new(&active, ActiveResultSource::ActiveRun, view).unwrap();
    let first_encoding = encode_zone_air_state_csv(&context);
    let second_encoding = encode_zone_air_state_csv(&context);
    assert_eq!(first_encoding, second_encoding);
    let text = String::from_utf8(first_encoding).unwrap();
    assert!(text.starts_with("run_id,extraction_id,zone_number,zone_name,source_line_number,unit_system,sample_index,day_of_year,day_type,sim_time_seconds,temperature_k,reference_pressure_pa,air_density_kg_m3\r\n"));
    assert_eq!(text.matches("\r\n").count(), 578);
    assert!(text
        .lines()
        .nth(1)
        .unwrap()
        .contains(",0,293.15,-1.4222,1.2041"));
    assert!(!text.contains(active.source_path.to_string_lossy().as_ref()));

    let mut protected = context.clone();
    protected.zone_name = "=SUM(1,2)\r\n\"Zone\"".into();
    protected.result.zone_name = protected.zone_name.clone();
    let protected_text = String::from_utf8(encode_zone_air_state_csv(&protected)).unwrap();
    assert!(protected_text.contains("\"'=SUM(1,2)\r\n\"\"Zone\"\"\""));
    assert_eq!(csv_text("+formula"), "'+formula");
    assert_eq!(csv_text("-formula"), "'-formula");
    assert_eq!(csv_text("@formula"), "'@formula");
    assert_eq!(csv_text("\tformula"), "'\tformula");
    assert_eq!(csv_text("\rformula"), "\"'\rformula\"");
    assert_eq!(csv_text("a,b"), "\"a,b\"");

    let first_row = text.lines().nth(1).unwrap().split(',').collect::<Vec<_>>();
    assert_eq!(first_row.len(), 13);
    assert_eq!(first_row[8], "");
    assert_eq!(first_row[9].parse::<f64>().unwrap(), 0.0);
    assert_eq!(first_row[10].parse::<f64>().unwrap(), 293.15);
    assert_eq!(first_row[11].parse::<f64>().unwrap(), -1.4222);
    assert_eq!(first_row[12].parse::<f64>().unwrap(), 1.2041);
}

#[test]
fn source_sha256_is_rechecked_for_csv_export() {
    let root =
        std::env::temp_dir().join(format!("contam-source-hash-check-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let empty = root.join("empty");
    fs::write(&empty, b"").unwrap();
    assert_eq!(
        sha256_file(&empty).unwrap(),
        (
            "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855".into(),
            0
        )
    );
    let abc = root.join("abc");
    fs::write(&abc, b"abc").unwrap();
    assert_eq!(
        sha256_file(&abc).unwrap().0,
        "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"
    );

    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-source-hash").result.unwrap();
    let copied = root.join("copied.prj");
    fs::copy(&fixture, &copied).unwrap();
    let active = active_context("source-hash", copied.clone(), &project);
    assert!(active_project_source_matches(&active));
    fs::OpenOptions::new()
        .append(true)
        .open(&copied)
        .unwrap()
        .write_all(b"changed")
        .unwrap();
    assert!(!active_project_source_matches(&active));
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "requires an explicitly supplied real Phase 5A result JSON"]
fn real_zone_result_encodes_through_the_production_csv_contract() {
    let result_path = PathBuf::from(
        std::env::var_os("CONTAM_STUDIO_PHASE5C_RESULT_JSON")
            .expect("CONTAM_STUDIO_PHASE5C_RESULT_JSON must be set"),
    );
    let output = PathBuf::from(
        std::env::var_os("CONTAM_STUDIO_PHASE5C_CSV_OUTPUT")
            .expect("CONTAM_STUDIO_PHASE5C_CSV_OUTPUT must be set"),
    );
    let result: ZoneAirStateResultView =
        serde_json::from_slice(&fs::read(result_path).unwrap()).unwrap();
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-real-csv-result")
        .result
        .unwrap();
    let active = active_context("real-csv", fixture, &project);
    let context =
        ActiveResultContext::new(&active, ActiveResultSource::SelectedManifest, result).unwrap();
    let encoded = encode_zone_air_state_csv(&context);
    assert_eq!(encoded, encode_zone_air_state_csv(&context));
    assert_eq!(context.sample_count, 577);
    assert_eq!(
        encoded.windows(2).filter(|pair| *pair == b"\r\n").count(),
        578
    );
    assert!(
        !String::from_utf8_lossy(&encoded).contains(active.source_path.to_string_lossy().as_ref())
    );
    assert_eq!(
        write_csv_atomically(&output, &encoded),
        Ok(encoded.len() as u64)
    );
}

#[test]
fn csv_destination_and_atomic_write_never_overwrite() {
    let root = std::env::temp_dir().join(format!("contam-csv-export-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let source = root.join("source.prj");
    fs::write(&source, b"source").unwrap();
    let source = fs::canonicalize(source).unwrap();
    let output = validate_csv_destination(&source, &root.join("result")).unwrap();
    assert!(output.ends_with("result.csv"));
    assert_eq!(write_csv_atomically(&output, b"a,b\r\n1,2\r\n"), Ok(10));
    assert_eq!(fs::read(&output).unwrap(), b"a,b\r\n1,2\r\n");
    assert_eq!(
        write_csv_atomically(&output, b"replacement"),
        Err("export_destination_exists")
    );
    assert_eq!(fs::read(&output).unwrap(), b"a,b\r\n1,2\r\n");
    assert_eq!(
        validate_csv_destination(&source, &root.join("wrong.txt")),
        Err("export_destination_invalid")
    );
    assert_eq!(
        validate_csv_destination(&source, &source),
        Err("export_destination_conflicts_with_source")
    );
    assert_eq!(
        validate_csv_destination(&source, &root.join("missing").join("result.csv")),
        Err("export_destination_invalid")
    );
    assert_eq!(
        validate_csv_destination(&source, &source.join("result.csv")),
        Err("export_destination_invalid")
    );
    assert!(!fs::read_dir(&root).unwrap().any(|entry| entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .ends_with(".tmp")));

    let write_failure = root.join("write-failure.csv");
    assert_eq!(
        write_csv_atomically_with_steps(
            &write_failure,
            b"partial",
            |file, _| {
                file.write_all(b"par")?;
                Err(std::io::Error::other("injected write failure"))
            },
            |temporary, output| std::fs::rename(temporary, output),
        ),
        Err("export_temporary_write_failed")
    );
    assert!(!write_failure.exists());

    let commit_failure = root.join("commit-failure.csv");
    assert_eq!(
        write_csv_atomically_with_steps(
            &commit_failure,
            b"complete",
            |file, bytes| {
                file.write_all(bytes)?;
                file.flush()?;
                file.sync_all()
            },
            |_, _| Err(std::io::Error::other("injected commit failure")),
        ),
        Err("export_atomic_commit_failed")
    );
    assert!(!commit_failure.exists());
    assert!(!fs::read_dir(&root).unwrap().any(|entry| entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .ends_with(".tmp")));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn active_run_extraction_has_no_dialog_and_reuses_the_trusted_bridge() {
    let source = include_str!("../zone_bridge.rs");
    let active_start = source
        .find("pub async fn extract_active_run_zone_air_state")
        .unwrap();
    let active_end = source[active_start..]
        .find("pub async fn export_active_zone_air_state_csv")
        .map(|offset| active_start + offset)
        .unwrap();
    let active_command = &source[active_start..active_end];
    assert!(!active_command.contains(".dialog()"));
    assert!(active_command.contains("validate_active_run_context"));
    assert!(active_command.contains("extract_zone_air_state_with_manifest"));
    assert!(active_command.contains("ActiveResultSource::ActiveRun"));

    let manual_start = source
        .find("pub async fn select_and_extract_zone_air_state")
        .unwrap();
    let manual_end = source[manual_start..]
        .find("pub async fn extract_active_run_zone_air_state")
        .map(|offset| manual_start + offset)
        .unwrap();
    let manual_command = &source[manual_start..manual_end];
    assert!(manual_command.contains(".dialog()"));
    assert!(manual_command.contains("extract_zone_air_state_with_manifest"));
    assert!(manual_command.contains("ActiveResultSource::SelectedManifest"));
    let helper_start = source
        .find("async fn extract_zone_air_state_with_manifest")
        .unwrap();
    let helper_end = source[helper_start..]
        .find("pub async fn select_and_read_prj_zones")
        .map(|offset| helper_start + offset)
        .unwrap();
    assert!(source[helper_start..helper_end].contains("validate_zone_air_state_result"));
}

#[test]
fn zone_air_state_contract_rejects_untrusted_samples_and_paths_are_not_serialized() {
    let fixture = primary_fixture();
    let project = execute_read(&fixture, "read-results").result.unwrap();
    let active = active_context("results", fixture, &project);
    let view = validate_zone_air_state_result(raw_air_state_result(), &active, 1, None).unwrap();
    let serialized = serde_json::to_string(&view).unwrap();
    assert_eq!(view.sample_count, 1);
    assert!(!serialized.contains("source_path"));
    assert!(!serialized.contains("result_root"));
    assert!(!serialized.contains("manifest"));

    for invalid in [
        {
            let mut value = raw_air_state_result();
            value.zone_number = 2;
            value
        },
        {
            let mut value = raw_air_state_result();
            value.zone_name = "Wrong".into();
            value
        },
        {
            let mut value = raw_air_state_result();
            value.parsed_result.source_line_number = 999;
            value
        },
        {
            let mut value = raw_air_state_result();
            value.parsed_result.schema_version = "2.0".into();
            value
        },
        {
            let mut value = raw_air_state_result();
            value.run_id = "outer-run".into();
            value
        },
        {
            let mut value = raw_air_state_result();
            value.extraction_id = "outer-extraction".into();
            value
        },
        {
            let mut value = raw_air_state_result();
            value.parsed_result.samples[0].day_type = Some("calendar".into());
            value
        },
    ] {
        assert_eq!(
            validate_zone_air_state_result(invalid, &active, 1, None)
                .unwrap_err()
                .code,
            "python_response_result_invalid"
        );
    }

    let mut decreasing_time = raw_air_state_result();
    let mut second = decreasing_time.parsed_result.samples[0].clone();
    second.index = 1;
    second.sim_time_seconds = -1.0;
    decreasing_time.sample_count = 2;
    decreasing_time.parsed_result.sample_count = 2;
    decreasing_time.parsed_result.samples.push(second);
    assert_eq!(
        validate_zone_air_state_result(decreasing_time, &active, 1, None)
            .unwrap_err()
            .code,
        "python_response_result_invalid"
    );

    let mut non_finite = raw_air_state_result();
    non_finite.parsed_result.samples[0].temperature_k = f64::INFINITY;
    assert_eq!(
        validate_zone_air_state_result(non_finite, &active, 1, None)
            .unwrap_err()
            .code,
        "python_response_result_invalid"
    );

    let mut count_mismatch = raw_air_state_result();
    count_mismatch.sample_count = 2;
    assert_eq!(
        validate_zone_air_state_result(count_mismatch, &active, 1, None)
            .unwrap_err()
            .code,
        "python_response_result_invalid"
    );

    let stage = serde_json::to_value(ZoneResultStageEvent {
        request_id: "stage-1".into(),
        stage: "loading",
    })
    .unwrap();
    assert_eq!(stage["request_id"], "stage-1");
    assert_eq!(stage["stage"], "loading");
    assert_eq!(stage.as_object().unwrap().len(), 2);

    let export_stage = serde_json::to_value(ResultExportStageEvent {
        request_id: "export-stage-1".into(),
        stage: "exporting",
    })
    .unwrap();
    assert_eq!(export_stage["request_id"], "export-stage-1");
    assert_eq!(export_stage["stage"], "exporting");
    assert_eq!(export_stage.as_object().unwrap().len(), 2);

    let safe_export = DesktopZoneAirStateCsvExportResponse {
        request_id: "export-safe".into(),
        cancelled: false,
        project_session_id: Some("session-results".into()),
        export: Some(ZoneAirStateCsvExportSummary {
            file_name: "zone-1-air-state-run-1.csv".into(),
            row_count: 1,
            byte_count: 200,
            run_id: "run-1".into(),
            extraction_id: "extract-1".into(),
            zone_id: active.zones[0].zone_id.clone(),
            zone_number: 1,
        }),
        error: None,
    };
    let serialized_export = serde_json::to_string(&safe_export).unwrap();
    for forbidden in [
        "source_path",
        "manifest",
        "result_root",
        "samples",
        "temporary",
    ] {
        assert!(!serialized_export.contains(forbidden));
    }
}

#[test]
fn custom_command_acl_and_frontend_path_boundary_are_explicit() {
    let build_script = include_str!("../../build.rs");
    let capability: Value =
        serde_json::from_str(include_str!("../../capabilities/default.json")).unwrap();
    let source = include_str!("../zone_bridge.rs");
    let desktop_api = include_str!("../../../src/app/desktop-api.ts");
    let package_json = include_str!("../../../package.json");
    for command in [
        "select_and_read_prj_zones",
        "plan_zone_volume_patch",
        "apply_zone_volume_patch_to_draft",
        "prepare_simulation_plan",
        "approve_and_run_simulation_plan",
        "prepare_study_plan",
        "run_study",
        "cancel_study",
        "page_study_results",
        "analyze_study_results",
        "export_study_report",
        "select_and_import_attachments",
        "list_attachments",
        "set_attachment_ai_selection",
        "preview_attachment_evidence",
        "remove_studio_attachment",
        "undo_project_draft",
        "redo_project_draft",
        "export_active_project_draft_copy",
        "select_and_extract_zone_air_state",
        "extract_active_run_zone_air_state",
        "export_active_zone_air_state_csv",
        "run_active_contam_project",
        "probe_codex_app_server",
        "install_official_codex_cli",
        "connect_codex_app_server",
        "refresh_codex_account",
        "preview_ai_context",
        "start_readonly_ai_turn",
        "load_ai_conversation_archive",
        "set_ai_conversation_archive_enabled",
        "delete_ai_conversation_archive_entry",
        "clear_ai_conversation_archive_for_zone",
        "clear_all_ai_conversation_archive",
        "interrupt_readonly_ai_turn",
        "clear_readonly_ai_session",
        "disconnect_codex_app_server",
        "get_studio_setup",
        "save_studio_setup",
        "select_data_directory",
        "select_and_probe_official_tool",
        "open_studio_directory",
        "clear_studio_cache",
        "get_diagnostics_summary",
        "export_sanitized_diagnostics",
        "resolve_app_close",
        "finish_app_close_draft_export",
    ] {
        assert!(build_script.contains(command));
    }
    assert_eq!(capability["permissions"].as_array().unwrap().len(), 53);
    let forbidden = [
        "sourcePath",
        "outputPath",
        "patch:",
        "@tauri-apps/plugin-dialog",
    ];
    for value in forbidden {
        assert!(!desktop_api.contains(value), "found {value}");
    }
    assert!(desktop_api.contains("runActiveContamProject"));
    assert!(desktop_api.contains("extractActiveRunZoneAirState"));
    assert!(desktop_api.contains("exportActiveZoneAirStateCsv"));
    assert!(desktop_api.contains("applyZoneVolumePatchToDraft"));
    assert!(desktop_api.contains("prepareSimulationPlan"));
    assert!(desktop_api.contains("approveAndRunSimulationPlan"));
    assert!(desktop_api.contains("prepareStudyPlan"));
    assert!(desktop_api.contains("runStudy"));
    assert!(desktop_api.contains("cancelStudy"));
    assert!(desktop_api.contains("pageStudyResults"));
    assert!(desktop_api.contains("analyzeStudyResults"));
    assert!(desktop_api.contains("exportStudyReport"));
    assert!(desktop_api.contains("selectAndImportAttachments"));
    assert!(desktop_api.contains("previewAttachmentEvidence"));
    assert!(desktop_api.contains("removeStudioAttachment"));
    assert!(desktop_api.contains("undoProjectDraft"));
    assert!(desktop_api.contains("redoProjectDraft"));
    assert!(desktop_api.contains("exportActiveProjectDraftCopy"));
    assert!(desktop_api.contains("connectCodexAppServer"));
    assert!(desktop_api.contains("installOfficialCodexCli"));
    assert!(desktop_api.contains("previewAiContext"));
    assert!(desktop_api.contains("startReadonlyAiTurn"));
    assert!(desktop_api.contains("getStudioSetup"));
    assert!(desktop_api.contains("saveStudioSetup"));
    assert!(desktop_api.contains("selectAndProbeOfficialTool"));
    assert!(desktop_api.contains("exportSanitizedDiagnostics"));
    assert!(desktop_api.contains("requestId"));
    assert!(desktop_api.contains("projectSessionId"));
    assert!(!package_json.contains("@tauri-apps/plugin-dialog"));
    let export_permission =
        include_str!("../../permissions/autogenerated/export_active_zone_air_state_csv.toml");
    assert!(export_permission.contains("commands.allow = [\"export_active_zone_air_state_csv\"]"));
    for (permission, command) in [
        (
            include_str!("../../permissions/autogenerated/probe_codex_app_server.toml"),
            "probe_codex_app_server",
        ),
        (
            include_str!("../../permissions/autogenerated/connect_codex_app_server.toml"),
            "connect_codex_app_server",
        ),
        (
            include_str!("../../permissions/autogenerated/install_official_codex_cli.toml"),
            "install_official_codex_cli",
        ),
        (
            include_str!("../../permissions/autogenerated/preview_ai_context.toml"),
            "preview_ai_context",
        ),
        (
            include_str!("../../permissions/autogenerated/start_readonly_ai_turn.toml"),
            "start_readonly_ai_turn",
        ),
        (
            include_str!("../../permissions/autogenerated/interrupt_readonly_ai_turn.toml"),
            "interrupt_readonly_ai_turn",
        ),
        (
            include_str!("../../permissions/autogenerated/preview_attachment_evidence.toml"),
            "preview_attachment_evidence",
        ),
        (
            include_str!("../../permissions/autogenerated/remove_studio_attachment.toml"),
            "remove_studio_attachment",
        ),
    ] {
        assert!(permission.contains(&format!("commands.allow = [\"{command}\"]")));
    }
    let export_start = source
        .find("pub async fn export_active_zone_air_state_csv")
        .unwrap();
    let export_end = source[export_start..]
        .find("pub async fn run_active_contam_project")
        .map(|offset| export_start + offset)
        .unwrap();
    let export_command = &source[export_start..export_end];
    for forbidden in ["source_path: String", "output_path", "samples:", "csv_body"] {
        assert!(!export_command.contains(forbidden), "found {forbidden}");
    }
    assert_eq!(
        export_command
            .matches("active_project_source_matches")
            .count(),
        3
    );
    let cancel_branch = export_command
        .find("let Some(selected) = selected else")
        .unwrap();
    let encode = export_command.find("encode_zone_air_state_csv").unwrap();
    let write = export_command.find("write_csv_atomically").unwrap();
    assert!(cancel_branch < encode && cancel_branch < write);
    let capability_text = include_str!("../../capabilities/default.json");
    for permission in ["dialog", "fs:", "shell", "http"] {
        assert!(!capability_text.contains(permission));
    }
}

#[test]
fn real_bridge_reads_all_official_fixtures() {
    for (relative, count, first) in [
        (
            "fixtures/contam/official-contamxpy/test_GetPrjInfo.prj",
            7,
            "One",
        ),
        (
            "fixtures/contam/official-contamxpy/valThreeZonesWthCtm-UseApi.prj",
            3,
            "one",
        ),
        (
            "fixtures/contam/official-nist-tutorials/demo1c.prj",
            7,
            "Attic",
        ),
    ] {
        let fixture = fixture_path(relative);
        let envelope = execute_read(&fixture, "request-real");
        assert!(envelope.ok, "{:?}", envelope.error);
        let result = envelope.result.unwrap();
        assert_eq!(result.declared_zone_count, count);
        assert_eq!(result.first_zone.unwrap().name, first);
    }
}

#[test]
fn real_plan_and_apply_contracts_round_trip() {
    let active = {
        let fixture = primary_fixture();
        let project = execute_read(&fixture, "read-real").result.unwrap();
        active_context("real", fixture, &project)
    };
    let request = json!({"protocol_version": PROTOCOL_VERSION, "request_id": "plan-real", "operation": PLAN_OPERATION, "source_path": active.source_path, "contam_number": 1, "new_volume_token": "650.0"});
    let envelope = execute_bridge_request(&request, "plan-real", READ_AND_PLAN_TIMEOUT).unwrap();
    let raw: RawPatchPlanResult = serde_json::from_value(envelope.result.unwrap()).unwrap();
    let (planned, review) = validate_plan_result(
        raw,
        &active,
        "plan-real",
        &active.zones[0].zone_id,
        1,
        "650.0",
    )
    .unwrap();
    assert_eq!(review.new_token, "650.0");

    let output_root =
        std::env::temp_dir().join(format!("contam-studio-apply-{}", std::process::id()));
    let _ = fs::remove_dir_all(&output_root);
    fs::create_dir_all(&output_root).unwrap();
    let output = fs::canonicalize(&output_root).unwrap().join("copy.prj");
    let request = json!({"protocol_version": PROTOCOL_VERSION, "request_id": "apply-real", "operation": APPLY_OPERATION, "source_path": active.source_path, "output_path": output, "patch": planned.patch});
    let envelope = execute_bridge_request(&request, "apply-real", APPLY_TIMEOUT).unwrap();
    let raw: RawPatchApplicationResult = serde_json::from_value(envelope.result.unwrap()).unwrap();
    let mut output_mismatch = raw.clone();
    output_mismatch.application.output_path = primary_fixture().to_string_lossy().into_owned();
    assert_eq!(
        validate_application_result(output_mismatch, &active, &planned, &output)
            .unwrap_err()
            .code,
        "patch_apply_response_invalid"
    );
    let mut hash_mismatch = raw.clone();
    hash_mismatch.application.output_sha256 = "0".repeat(64);
    assert_eq!(
        validate_application_result(hash_mismatch, &active, &planned, &output)
            .unwrap_err()
            .code,
        "patch_apply_response_invalid"
    );
    let project = validate_application_result(raw, &active, &planned, &output).unwrap();
    assert_eq!(project.first_zone.unwrap().volume_m3, 650.0);
    fs::remove_dir_all(output_root).unwrap();
}
