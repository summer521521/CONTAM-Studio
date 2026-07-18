fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "select_and_read_prj_zones",
        "plan_zone_volume_patch",
        "apply_zone_volume_patch_to_copy",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to build CONTAM Studio application manifest");
}
