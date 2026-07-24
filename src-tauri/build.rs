fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "select_and_read_prj_zones",
        "plan_zone_volume_patch",
        "apply_zone_volume_patch_to_draft",
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
        "resolve_app_close",
        "finish_app_close_draft_export",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to build CONTAM Studio application manifest");
}
