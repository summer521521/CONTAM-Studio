mod close_protocol;
mod codex_app_server;
mod zone_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(zone_bridge::DesktopProjectSessionStore::default())
        .manage(codex_app_server::CodexAssistantStore::default())
        .manage(codex_app_server::AiConversationArchiveStore::default())
        .manage(close_protocol::CloseProtocolStore::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            zone_bridge::select_and_read_prj_zones,
            zone_bridge::plan_zone_volume_patch,
            zone_bridge::apply_zone_volume_patch_to_draft,
            zone_bridge::undo_project_draft,
            zone_bridge::redo_project_draft,
            zone_bridge::export_active_project_draft_copy,
            zone_bridge::select_and_extract_zone_air_state,
            zone_bridge::extract_active_run_zone_air_state,
            zone_bridge::export_active_zone_air_state_csv,
            zone_bridge::run_active_contam_project,
            codex_app_server::probe_codex_app_server,
            codex_app_server::install_official_codex_cli,
            codex_app_server::connect_codex_app_server,
            codex_app_server::refresh_codex_account,
            codex_app_server::preview_ai_context,
            codex_app_server::start_readonly_ai_turn,
            codex_app_server::load_ai_conversation_archive,
            codex_app_server::set_ai_conversation_archive_enabled,
            codex_app_server::delete_ai_conversation_archive_entry,
            codex_app_server::clear_ai_conversation_archive_for_zone,
            codex_app_server::clear_all_ai_conversation_archive,
            codex_app_server::interrupt_readonly_ai_turn,
            codex_app_server::clear_readonly_ai_session,
            codex_app_server::disconnect_codex_app_server,
            close_protocol::set_close_activity,
            close_protocol::resolve_app_close,
            close_protocol::finish_app_close_draft_export
        ])
        .on_window_event(close_protocol::handle_window_event)
        .run(tauri::generate_context!())
        .expect("error while running CONTAM Studio");
}
