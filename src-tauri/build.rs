fn main() {
    let commit_sha = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".to_owned());
    let dirty = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .output()
        .ok()
        .map(|output| !output.stdout.is_empty())
        .unwrap_or(true);
    println!("cargo:rustc-env=CONTAM_STUDIO_BUILD_SHA={commit_sha}");
    println!(
        "cargo:rustc-env=CONTAM_STUDIO_BUILD_DIRTY={}",
        if dirty { "1" } else { "0" }
    );
    println!("cargo:rerun-if-changed=../package.json");
    println!("cargo:rerun-if-changed=../.git/HEAD");
    let manifest = tauri_build::AppManifest::new().commands(&[
        "select_and_read_prj_zones",
        "plan_zone_volume_patch",
        "apply_zone_volume_patch_to_draft",
        "read_semantic_project",
        "get_semantic_object",
        "plan_semantic_patch",
        "apply_semantic_patch_to_draft",
        "discard_semantic_patch",
        "undo_project_draft",
        "redo_project_draft",
        "export_active_project_draft_copy",
        "select_and_extract_zone_air_state",
        "extract_active_run_zone_air_state",
        "export_active_zone_air_state_csv",
        "run_active_contam_project",
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
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to build CONTAM Studio application manifest");
}
