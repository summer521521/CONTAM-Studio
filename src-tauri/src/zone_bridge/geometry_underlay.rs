use super::attachment_center::{
    attachment_quarantine_root, import_attachment_with_python, owned_quarantine_path,
    AttachmentCenterStore, AttachmentView, StoredAttachment,
};
use super::geometry_document::{geometry_context_is_current, geometry_document_context};
use super::{
    host_diagnostic, request_id_is_valid, semantic_string_is_valid, sha256_file,
    DesktopProjectSessionStore, ReaderDiagnostic,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

const GEOMETRY_UNDERLAY_RESOURCE_SCHEMA_VERSION: &str = "geometry_underlay_resource.v1";
const MAX_GEOMETRY_UNDERLAY_BYTES: u64 = 32 * 1024 * 1024;
static GEOMETRY_UNDERLAY_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct GeometryUnderlayResourceView {
    schema_version: String,
    resource_id: String,
    attachment_id: String,
    display_name: String,
    sha256: String,
    mime_type: String,
    size_bytes: u64,
    page_count: Option<u64>,
    pixel_width: Option<u64>,
    pixel_height: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopGeometryUnderlayImportResponse {
    request_id: String,
    cancelled: bool,
    project_session_id: Option<String>,
    revision_id: Option<String>,
    resource: Option<GeometryUnderlayResourceView>,
    attachments: Vec<AttachmentView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeometryUnderlayReadRequest {
    pub request_id: String,
    pub project_session_id: String,
    pub revision_id: String,
    pub resource_id: String,
    pub sha256: String,
    pub mime_type: String,
}

fn underlay_diagnostic(code: &'static str, message: &'static str) -> ReaderDiagnostic {
    host_diagnostic(code, message, BTreeMap::new())
}

fn failure(
    request_id: String,
    store: &AttachmentCenterStore,
    error: ReaderDiagnostic,
) -> DesktopGeometryUnderlayImportResponse {
    DesktopGeometryUnderlayImportResponse {
        request_id,
        cancelled: false,
        project_session_id: None,
        revision_id: None,
        resource: None,
        attachments: store.list().0,
        error: Some(error),
    }
}

fn resource_root(
    app: &AppHandle,
    identity_sha256: &str,
    create: bool,
) -> Result<PathBuf, ReaderDiagnostic> {
    if identity_sha256.len() != 64 || !identity_sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(underlay_diagnostic(
            "geometry_underlay_identity_invalid",
            "The plan underlay project identity is invalid.",
        ));
    }
    let app_data = app.path().app_local_data_dir().map_err(|_| {
        underlay_diagnostic(
            "geometry_underlay_storage_unavailable",
            "The plan underlay storage directory is unavailable.",
        )
    })?;
    let root = app_data
        .join("geometry-underlays")
        .join(identity_sha256.to_ascii_lowercase());
    if create {
        fs::create_dir_all(&root).map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_storage_unavailable",
                "The plan underlay storage directory could not be created.",
            )
        })?;
    }
    if !root.exists() {
        return Ok(root);
    }
    let resolved_root = fs::canonicalize(&root).map_err(|_| {
        underlay_diagnostic(
            "geometry_underlay_storage_unavailable",
            "The plan underlay storage directory is unavailable.",
        )
    })?;
    let resolved_app_data = fs::canonicalize(&app_data).map_err(|_| {
        underlay_diagnostic(
            "geometry_underlay_storage_unavailable",
            "The application data directory is unavailable.",
        )
    })?;
    if !resolved_root.starts_with(&resolved_app_data) {
        return Err(underlay_diagnostic(
            "geometry_underlay_storage_unavailable",
            "The plan underlay storage boundary check failed.",
        ));
    }
    Ok(resolved_root)
}

fn supported_resource(
    record: &StoredAttachment,
) -> Result<(&'static str, &'static str), ReaderDiagnostic> {
    if record.view.status != "ready"
        || record.view.size_bytes == 0
        || record.view.size_bytes > MAX_GEOMETRY_UNDERLAY_BYTES
    {
        return Err(underlay_diagnostic(
            "geometry_underlay_unsupported",
            "Choose one ready PNG, JPEG, or PDF within the plan underlay size limit.",
        ));
    }
    match record.view.category.as_str() {
        "image" => {
            let lower = record.view.display_name.to_ascii_lowercase();
            if lower.ends_with(".png") {
                Ok(("image/png", "png"))
            } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
                Ok(("image/jpeg", "jpg"))
            } else {
                Err(underlay_diagnostic(
                    "geometry_underlay_unsupported",
                    "The selected image type is not supported as a plan underlay.",
                ))
            }
        }
        "pdf"
            if record
                .view
                .display_name
                .to_ascii_lowercase()
                .ends_with(".pdf") =>
        {
            Ok(("application/pdf", "pdf"))
        }
        _ => Err(underlay_diagnostic(
            "geometry_underlay_unsupported",
            "Choose one PNG, JPEG, or PDF as the plan underlay.",
        )),
    }
}

fn validate_signature(path: &Path, mime_type: &str) -> Result<(), ReaderDiagnostic> {
    let mut prefix = [0_u8; 8];
    let mut file = File::open(path).map_err(|_| {
        underlay_diagnostic(
            "geometry_underlay_unavailable",
            "The Studio-owned plan underlay could not be read.",
        )
    })?;
    let count = file.read(&mut prefix).map_err(|_| {
        underlay_diagnostic(
            "geometry_underlay_unavailable",
            "The Studio-owned plan underlay could not be read.",
        )
    })?;
    let valid = match mime_type {
        "image/png" => count >= 8 && prefix == *b"\x89PNG\r\n\x1a\n",
        "image/jpeg" => count >= 3 && prefix[..3] == [0xff, 0xd8, 0xff],
        "application/pdf" => count >= 5 && &prefix[..5] == b"%PDF-",
        _ => false,
    };
    if !valid {
        return Err(underlay_diagnostic(
            "geometry_underlay_signature_invalid",
            "The plan underlay signature did not match its declared type.",
        ));
    }
    Ok(())
}

fn persist_resource(
    source: &Path,
    root: &Path,
    resource_id: &str,
    extension: &str,
    expected_sha256: &str,
    expected_size: u64,
) -> Result<PathBuf, ReaderDiagnostic> {
    let target = root.join(format!("{resource_id}.{extension}"));
    if target.exists() {
        return Err(underlay_diagnostic(
            "geometry_underlay_collision",
            "A plan underlay with the same identity already exists.",
        ));
    }
    let sequence = GEOMETRY_UNDERLAY_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temporary = root.join(format!(".{resource_id}.{sequence}.tmp"));
    let result = (|| {
        let mut input = File::open(source).map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_unavailable",
                "The verified plan underlay copy could not be opened.",
            )
        })?;
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|_| {
                underlay_diagnostic(
                    "geometry_underlay_write_failed",
                    "The Studio-owned plan underlay could not be created.",
                )
            })?;
        std::io::copy(&mut input, &mut output).map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_write_failed",
                "The Studio-owned plan underlay could not be written.",
            )
        })?;
        output.flush().map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_write_failed",
                "The Studio-owned plan underlay could not be finalized.",
            )
        })?;
        output.sync_all().map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_write_failed",
                "The Studio-owned plan underlay could not be finalized.",
            )
        })?;
        drop(output);
        let (sha256, size) = sha256_file(&temporary).map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_write_failed",
                "The Studio-owned plan underlay could not be verified.",
            )
        })?;
        if size != expected_size || !sha256.eq_ignore_ascii_case(expected_sha256) {
            return Err(underlay_diagnostic(
                "geometry_underlay_changed",
                "The plan underlay changed while it was being imported.",
            ));
        }
        fs::rename(&temporary, &target).map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_write_failed",
                "The Studio-owned plan underlay could not be committed.",
            )
        })?;
        Ok(target.clone())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn resource_view(record: &StoredAttachment, mime_type: &str) -> GeometryUnderlayResourceView {
    GeometryUnderlayResourceView {
        schema_version: GEOMETRY_UNDERLAY_RESOURCE_SCHEMA_VERSION.into(),
        resource_id: record.view.attachment_id.clone(),
        attachment_id: record.view.attachment_id.clone(),
        display_name: record.view.display_name.clone(),
        sha256: record.sha256.clone(),
        mime_type: mime_type.into(),
        size_bytes: record.view.size_bytes,
        page_count: record
            .view
            .metadata
            .get("page_count")
            .and_then(serde_json::Value::as_u64),
        pixel_width: record
            .view
            .metadata
            .get("width")
            .and_then(serde_json::Value::as_u64),
        pixel_height: record
            .view
            .metadata
            .get("height")
            .and_then(serde_json::Value::as_u64),
    }
}

pub(super) fn validate_geometry_underlay_references(
    app: &AppHandle,
    context: &super::geometry_document::GeometryDocumentContext,
    geometry: &Value,
) -> Result<(), ReaderDiagnostic> {
    let levels = geometry
        .get("levels")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            underlay_diagnostic(
                "geometry_underlay_reference_invalid",
                "The geometry underlay reference set is invalid.",
            )
        })?;
    let root = resource_root(app, &context.identity_sha256, false)?;
    for underlay in levels.iter().flat_map(|level| {
        level
            .get("underlays")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
    }) {
        let resource_id = underlay
            .get("resource_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let expected_sha256 = underlay
            .get("sha256")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let mime_type = underlay
            .get("mime_type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if Uuid::parse_str(resource_id).is_err()
            || expected_sha256.len() != 64
            || !expected_sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(underlay_diagnostic(
                "geometry_underlay_reference_invalid",
                "The geometry underlay reference set is invalid.",
            ));
        }
        let extension = match mime_type {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "application/pdf" => "pdf",
            _ => {
                return Err(underlay_diagnostic(
                    "geometry_underlay_reference_invalid",
                    "The geometry underlay reference type is invalid.",
                ))
            }
        };
        let candidate = root.join(format!("{resource_id}.{extension}"));
        let candidate_metadata = fs::symlink_metadata(&candidate).map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_reference_missing",
                "A referenced Studio-owned plan underlay is unavailable.",
            )
        })?;
        if candidate_metadata.file_type().is_symlink() {
            return Err(underlay_diagnostic(
                "geometry_underlay_reference_invalid",
                "A referenced Studio-owned plan underlay cannot be a symbolic link.",
            ));
        }
        let path = fs::canonicalize(&candidate).map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_reference_missing",
                "A referenced Studio-owned plan underlay is unavailable.",
            )
        })?;
        if path.parent() != Some(root.as_path()) {
            return Err(underlay_diagnostic(
                "geometry_underlay_reference_invalid",
                "The geometry underlay reference escaped the Studio storage boundary.",
            ));
        }
        let metadata = fs::symlink_metadata(&path).map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_reference_missing",
                "A referenced Studio-owned plan underlay is unavailable.",
            )
        })?;
        if !metadata.file_type().is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() == 0
            || metadata.len() > MAX_GEOMETRY_UNDERLAY_BYTES
        {
            return Err(underlay_diagnostic(
                "geometry_underlay_reference_invalid",
                "A referenced Studio-owned plan underlay has an invalid file shape.",
            ));
        }
        validate_signature(&path, mime_type)?;
        let (sha256, size) = sha256_file(&path).map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_reference_missing",
                "A referenced Studio-owned plan underlay could not be verified.",
            )
        })?;
        if size != metadata.len() || !sha256.eq_ignore_ascii_case(expected_sha256) {
            return Err(underlay_diagnostic(
                "geometry_underlay_reference_changed",
                "A referenced Studio-owned plan underlay changed after import.",
            ));
        }
    }
    Ok(())
}

pub(super) async fn select_and_import_geometry_underlay_impl(
    app: AppHandle,
    project_store: tauri::State<'_, DesktopProjectSessionStore>,
    attachment_store: tauri::State<'_, AttachmentCenterStore>,
    request_id: String,
    project_session_id: String,
    revision_id: String,
) -> DesktopGeometryUnderlayImportResponse {
    if !request_id_is_valid(&request_id)
        || !semantic_string_is_valid(&project_session_id, 160)
        || !semantic_string_is_valid(&revision_id, 160)
    {
        return failure(
            request_id,
            attachment_store.inner(),
            underlay_diagnostic(
                "geometry_underlay_request_invalid",
                "The plan underlay import request is invalid.",
            ),
        );
    }
    let context =
        match geometry_document_context(project_store.inner(), &project_session_id, &revision_id) {
            Ok(context) => context,
            Err(error) => return failure(request_id, attachment_store.inner(), error),
        };
    if let Err(error) = attachment_store.start_import() {
        return failure(request_id, attachment_store.inner(), error);
    }
    if !attachment_store.can_accept_more() {
        attachment_store.finish_import();
        return failure(
            request_id,
            attachment_store.inner(),
            underlay_diagnostic(
                "attachment_limit",
                "The attachment list reached its safe limit.",
            ),
        );
    }
    let dialog_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .add_filter("Plan underlay", &["png", "jpg", "jpeg", "pdf"])
            .blocking_pick_file()
    })
    .await;
    let selected = match selected {
        Ok(value) => value,
        Err(_) => {
            attachment_store.finish_import();
            return failure(
                request_id,
                attachment_store.inner(),
                underlay_diagnostic(
                    "desktop_dialog_failed",
                    "The native plan underlay dialog failed.",
                ),
            );
        }
    };
    let Some(selected) = selected else {
        attachment_store.finish_import();
        return DesktopGeometryUnderlayImportResponse {
            request_id,
            cancelled: true,
            project_session_id: Some(project_session_id),
            revision_id: Some(revision_id),
            resource: None,
            attachments: attachment_store.list().0,
            error: None,
        };
    };
    let source = match selected.into_path() {
        Ok(path) => path,
        Err(_) => {
            attachment_store.finish_import();
            return failure(
                request_id,
                attachment_store.inner(),
                underlay_diagnostic(
                    "selected_path_invalid",
                    "The selected plan underlay was not a local file.",
                ),
            );
        }
    };
    let quarantine_root = match attachment_quarantine_root(&app) {
        Ok(root) => root,
        Err(error) => {
            attachment_store.finish_import();
            return failure(request_id, attachment_store.inner(), error);
        }
    };
    let import_request_id = request_id.clone();
    let imported = tauri::async_runtime::spawn_blocking(move || {
        import_attachment_with_python(&source, &quarantine_root, &import_request_id)
            .map(|record| (record, quarantine_root))
    })
    .await;
    let (mut record, quarantine_root) = match imported {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => {
            attachment_store.finish_import();
            return failure(request_id, attachment_store.inner(), error);
        }
        Err(_) => {
            attachment_store.finish_import();
            return failure(
                request_id,
                attachment_store.inner(),
                underlay_diagnostic(
                    "geometry_underlay_import_failed",
                    "The plan underlay import task ended unexpectedly.",
                ),
            );
        }
    };
    let (mime_type, extension) = match supported_resource(&record) {
        Ok(value) => value,
        Err(error) => {
            attachment_store.finish_import();
            return failure(request_id, attachment_store.inner(), error);
        }
    };
    let source_copy = match owned_quarantine_path(
        &quarantine_root,
        &record.view.attachment_id,
        &record.quarantine_relative_path,
    ) {
        Ok(path) => path,
        Err(error) => {
            attachment_store.finish_import();
            return failure(request_id, attachment_store.inner(), error);
        }
    };
    if let Err(error) = validate_signature(&source_copy, mime_type) {
        attachment_store.finish_import();
        return failure(request_id, attachment_store.inner(), error);
    }
    let root = match resource_root(&app, &context.identity_sha256, true) {
        Ok(root) => root,
        Err(error) => {
            attachment_store.finish_import();
            return failure(request_id, attachment_store.inner(), error);
        }
    };
    let target = match persist_resource(
        &source_copy,
        &root,
        &record.view.attachment_id,
        extension,
        &record.sha256,
        record.view.size_bytes,
    ) {
        Ok(path) => path,
        Err(error) => {
            attachment_store.finish_import();
            return failure(request_id, attachment_store.inner(), error);
        }
    };
    if !geometry_context_is_current(project_store.inner(), &context) {
        let _ = fs::remove_file(&target);
        attachment_store.finish_import();
        return failure(
            request_id,
            attachment_store.inner(),
            underlay_diagnostic(
                "geometry_underlay_stale",
                "The active project changed before the plan underlay import completed.",
            ),
        );
    }
    // Importing a local plan is not consent to send it to an AI provider.
    record.view.selected_by_user = false;
    let resource = resource_view(&record, mime_type);
    attachment_store.insert(record);
    attachment_store.finish_import();
    DesktopGeometryUnderlayImportResponse {
        request_id,
        cancelled: false,
        project_session_id: Some(project_session_id),
        revision_id: Some(revision_id),
        resource: Some(resource),
        attachments: attachment_store.list().0,
        error: None,
    }
}

pub(super) async fn read_geometry_underlay_resource_impl(
    app: AppHandle,
    project_store: tauri::State<'_, DesktopProjectSessionStore>,
    request: GeometryUnderlayReadRequest,
) -> Result<Response, ReaderDiagnostic> {
    let GeometryUnderlayReadRequest {
        request_id,
        project_session_id,
        revision_id,
        resource_id,
        sha256,
        mime_type,
    } = request;
    if !request_id_is_valid(&request_id)
        || !semantic_string_is_valid(&project_session_id, 160)
        || !semantic_string_is_valid(&revision_id, 160)
        || Uuid::parse_str(&resource_id).is_err()
        || sha256.len() != 64
        || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(underlay_diagnostic(
            "geometry_underlay_request_invalid",
            "The plan underlay read request is invalid.",
        ));
    }
    let extension = match mime_type.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "application/pdf" => "pdf",
        _ => {
            return Err(underlay_diagnostic(
                "geometry_underlay_request_invalid",
                "The plan underlay type is not supported.",
            ))
        }
    };
    let context =
        geometry_document_context(project_store.inner(), &project_session_id, &revision_id)?;
    let root = resource_root(&app, &context.identity_sha256, false)?;
    if !root.exists() {
        return Err(underlay_diagnostic(
            "geometry_underlay_unavailable",
            "The Studio-owned plan underlay is unavailable.",
        ));
    }
    let candidate = root.join(format!("{resource_id}.{extension}"));
    let candidate_metadata = fs::symlink_metadata(&candidate).map_err(|_| {
        underlay_diagnostic(
            "geometry_underlay_unavailable",
            "The Studio-owned plan underlay is unavailable.",
        )
    })?;
    if candidate_metadata.file_type().is_symlink() {
        return Err(underlay_diagnostic(
            "geometry_underlay_invalid",
            "The Studio-owned plan underlay cannot be a symbolic link.",
        ));
    }
    let path = fs::canonicalize(&candidate).map_err(|_| {
        underlay_diagnostic(
            "geometry_underlay_unavailable",
            "The Studio-owned plan underlay is unavailable.",
        )
    })?;
    if path.parent() != Some(root.as_path()) {
        return Err(underlay_diagnostic(
            "geometry_underlay_unavailable",
            "The plan underlay escaped the Studio storage boundary.",
        ));
    }
    let metadata = fs::symlink_metadata(&path).map_err(|_| {
        underlay_diagnostic(
            "geometry_underlay_unavailable",
            "The Studio-owned plan underlay is unavailable.",
        )
    })?;
    if !metadata.file_type().is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() == 0
        || metadata.len() > MAX_GEOMETRY_UNDERLAY_BYTES
    {
        return Err(underlay_diagnostic(
            "geometry_underlay_invalid",
            "The Studio-owned plan underlay has an invalid file shape.",
        ));
    }
    validate_signature(&path, &mime_type)?;
    let (actual_sha256, actual_size) = sha256_file(&path).map_err(|_| {
        underlay_diagnostic(
            "geometry_underlay_unavailable",
            "The Studio-owned plan underlay could not be verified.",
        )
    })?;
    if actual_size != metadata.len() || !actual_sha256.eq_ignore_ascii_case(&sha256) {
        return Err(underlay_diagnostic(
            "geometry_underlay_changed",
            "The Studio-owned plan underlay changed after import.",
        ));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(&path)
        .and_then(|file| {
            file.take(MAX_GEOMETRY_UNDERLAY_BYTES + 1)
                .read_to_end(&mut bytes)
        })
        .map_err(|_| {
            underlay_diagnostic(
                "geometry_underlay_unavailable",
                "The Studio-owned plan underlay could not be read.",
            )
        })?;
    if bytes.len() as u64 != metadata.len()
        || !geometry_context_is_current(project_store.inner(), &context)
    {
        return Err(underlay_diagnostic(
            "geometry_underlay_stale",
            "The active project changed before the plan underlay read completed.",
        ));
    }
    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signatures_are_exact() {
        let root = std::env::temp_dir().join(format!("contam-underlay-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("temporary underlay root");
        let png = root.join("plan.png");
        fs::write(&png, b"\x89PNG\r\n\x1a\nrest").expect("png fixture");
        assert!(validate_signature(&png, "image/png").is_ok());
        assert!(validate_signature(&png, "application/pdf").is_err());
        fs::remove_dir_all(&root).expect("remove temporary underlay root");
    }

    #[test]
    fn read_request_accepts_camel_case_and_rejects_unknown_fields() {
        let valid = serde_json::json!({
            "requestId": "geometry-underlay-read-1",
            "projectSessionId": "project-session-1",
            "revisionId": "revision-1",
            "resourceId": Uuid::new_v4().to_string(),
            "sha256": "a".repeat(64),
            "mimeType": "image/png"
        });
        assert!(serde_json::from_value::<GeometryUnderlayReadRequest>(valid.clone()).is_ok());
        let mut invalid = valid.as_object().expect("request object").clone();
        invalid.insert("path".into(), Value::String("C:\\private\\plan.png".into()));
        assert!(
            serde_json::from_value::<GeometryUnderlayReadRequest>(Value::Object(invalid)).is_err()
        );
    }
}
