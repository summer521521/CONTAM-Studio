mod zone_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            zone_bridge::select_and_read_prj_zones
        ])
        .run(tauri::generate_context!())
        .expect("error while running CONTAM Studio");
}
