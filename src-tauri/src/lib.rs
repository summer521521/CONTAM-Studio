mod zone_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(zone_bridge::DesktopProjectSessionStore::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            zone_bridge::select_and_read_prj_zones,
            zone_bridge::plan_zone_volume_patch,
            zone_bridge::apply_zone_volume_patch_to_copy,
            zone_bridge::select_and_extract_zone_air_state,
            zone_bridge::run_active_contam_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running CONTAM Studio");
}
