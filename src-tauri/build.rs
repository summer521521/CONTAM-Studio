fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "select_and_read_prj_zones",
        "plan_zone_volume_patch",
        "apply_zone_volume_patch_to_copy",
        "select_and_extract_zone_air_state",
        "extract_active_run_zone_air_state",
        "export_active_zone_air_state_csv",
        "run_active_contam_project",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to build CONTAM Studio application manifest");
}
