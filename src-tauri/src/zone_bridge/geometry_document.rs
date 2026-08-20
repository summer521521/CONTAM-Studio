use super::{
    active_project_source_matches, host_diagnostic, semantic_string_is_valid,
    DesktopProjectSessionStore, ReaderDiagnostic,
};
use crate::contam_semantic_contract::{
    contam_semantic_draft_object_ids, validate_contam_semantic_draft_structure,
    validate_contam_semantic_draft_value, ContamSemanticDraftContext,
    MAX_SEMANTIC_DRAFT_PAYLOAD_BYTES,
};
use crate::geometry_contract::{
    geometry_has_flow_path_bindings, validate_building_geometry_value,
    validate_geometry_semantic_flow_bindings, MAX_GEOMETRY_PAYLOAD_BYTES,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const GEOMETRY_DOCUMENT_SCHEMA_VERSION: &str = "geometry_document.v1";
const GEOMETRY_DOCUMENT_SUMMARY_SCHEMA_VERSION: &str = "geometry_document_summary.v1";
const MAX_GEOMETRY_DOCUMENT_BYTES: usize =
    MAX_GEOMETRY_PAYLOAD_BYTES + MAX_SEMANTIC_DRAFT_PAYLOAD_BYTES + 64 * 1024;
const MAX_GEOMETRY_DOCUMENT_REVISION: u64 = u32::MAX as u64;
static GEOMETRY_DOCUMENT_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static GEOMETRY_DOCUMENT_IO: Mutex<()> = Mutex::new(());

fn geometry_without_draft_flow_bindings(
    geometry: &Value,
    draft_flow_path_ids: &BTreeSet<String>,
) -> Value {
    if draft_flow_path_ids.is_empty() {
        return geometry.clone();
    }
    let mut filtered = geometry.clone();
    if let Some(levels) = filtered.get_mut("levels").and_then(Value::as_array_mut) {
        for level in levels {
            if let Some(anchors) = level
                .get_mut("flow_path_anchors")
                .and_then(Value::as_array_mut)
            {
                anchors.retain(|anchor| {
                    anchor
                        .get("semantic_flow_path_id")
                        .and_then(Value::as_str)
                        .is_none_or(|id| !draft_flow_path_ids.contains(id))
                });
            }
        }
    }
    filtered
}

#[derive(Clone, Debug)]
pub(super) struct GeometryDocumentContext {
    pub(super) project_session_id: String,
    pub(super) revision_id: String,
    pub(super) identity_sha256: String,
    pub(super) source_sha256: String,
    pub(super) semantic_snapshot: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct StoredGeometryDocument {
    schema_version: String,
    project_identity_sha256: String,
    geometry_sha256: String,
    document_revision: u64,
    saved_at_unix_ms: u64,
    geometry: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    semantic_draft_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    semantic_draft: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct GeometryDocumentSummaryView {
    schema_version: String,
    project_identity_sha256: String,
    geometry_sha256: String,
    semantic_draft_sha256: Option<String>,
    document_revision: u64,
    saved_at_unix_ms: u64,
    recovered_from_backup: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopGeometryDocumentResponse {
    request_id: String,
    status: String,
    project_session_id: Option<String>,
    revision_id: Option<String>,
    geometry: Option<Value>,
    semantic_draft: Option<Value>,
    summary: Option<GeometryDocumentSummaryView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Debug)]
struct LoadedGeometryDocument {
    stored: StoredGeometryDocument,
    geometry: Value,
    geometry_sha256: String,
    semantic_draft: Option<Value>,
    semantic_draft_sha256: Option<String>,
    recovered_from_backup: bool,
}

fn document_error(code: &'static str, message: &'static str) -> ReaderDiagnostic {
    host_diagnostic(code, message, BTreeMap::new())
}

fn exact_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn canonicalize_json(value: &Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.iter().map(canonicalize_json).collect()),
        Value::Object(values) => {
            let mut keys = values.keys().collect::<Vec<_>>();
            keys.sort();
            let mut output = serde_json::Map::new();
            for key in keys {
                output.insert(key.clone(), canonicalize_json(&values[key]));
            }
            Value::Object(output)
        }
        _ => value.clone(),
    }
}

fn geometry_sha256(value: &Value) -> Result<String, ReaderDiagnostic> {
    let bytes = serde_json::to_vec(&canonicalize_json(value)).map_err(|_| {
        document_error(
            "geometry_document_invalid",
            "The Studio geometry document could not be hashed.",
        )
    })?;
    Ok(Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn unix_time_ms() -> Result<u64, ReaderDiagnostic> {
    let value = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            document_error(
                "geometry_document_write_failed",
                "The Studio geometry document timestamp is unavailable.",
            )
        })?
        .as_millis();
    u64::try_from(value).map_err(|_| {
        document_error(
            "geometry_document_write_failed",
            "The Studio geometry document timestamp is unavailable.",
        )
    })
}

fn geometry_contract_error() -> ReaderDiagnostic {
    document_error(
        "geometry_document_invalid",
        "The Studio geometry document failed deterministic validation.",
    )
}

fn migrate_geometry_collections(mut geometry: Value) -> Result<Value, ReaderDiagnostic> {
    let object = geometry
        .as_object_mut()
        .ok_or_else(geometry_contract_error)?;
    let has_openings = object.contains_key("vertical_openings");
    let has_anchors = object.contains_key("vertical_flow_path_anchors");
    match (has_openings, has_anchors) {
        (true, true) => {}
        (false, false) => {
            object.insert("vertical_openings".into(), Value::Array(Vec::new()));
            object.insert(
                "vertical_flow_path_anchors".into(),
                Value::Array(Vec::new()),
            );
        }
        _ => return Err(geometry_contract_error()),
    }
    let levels = object
        .get_mut("levels")
        .and_then(Value::as_array_mut)
        .ok_or_else(geometry_contract_error)?;
    for level in levels {
        let level = level.as_object_mut().ok_or_else(geometry_contract_error)?;
        if !level.contains_key("underlays") {
            level.insert("underlays".into(), Value::Array(Vec::new()));
        }
    }
    Ok(geometry)
}

fn validate_stored_document(
    mut stored: StoredGeometryDocument,
    expected_identity: &str,
) -> Result<StoredGeometryDocument, ReaderDiagnostic> {
    if stored.schema_version != GEOMETRY_DOCUMENT_SCHEMA_VERSION
        || !exact_sha256(&stored.project_identity_sha256)
        || !stored
            .project_identity_sha256
            .eq_ignore_ascii_case(expected_identity)
        || !exact_sha256(&stored.geometry_sha256)
        || stored.document_revision == 0
        || stored.document_revision > MAX_GEOMETRY_DOCUMENT_REVISION
        || stored.saved_at_unix_ms == 0
        || stored.geometry.get("status").and_then(Value::as_str) != Some("available")
        || stored
            .geometry
            .pointer("/provenance/source_kind")
            .and_then(Value::as_str)
            != Some("studio_metric_draft")
        || stored
            .geometry
            .pointer("/provenance/application_owned")
            .and_then(Value::as_bool)
            != Some(true)
        || stored
            .geometry
            .get("identity_sha256")
            .and_then(Value::as_str)
            != Some(stored.project_identity_sha256.as_str())
    {
        return Err(geometry_contract_error());
    }
    let actual_hash = geometry_sha256(&stored.geometry)?;
    if !actual_hash.eq_ignore_ascii_case(&stored.geometry_sha256) {
        return Err(document_error(
            "geometry_document_hash_mismatch",
            "The Studio geometry document hash did not match its payload.",
        ));
    }
    stored.geometry = migrate_geometry_collections(stored.geometry)?;
    validate_building_geometry_value(&stored.geometry, None, None)
        .map_err(|_| geometry_contract_error())?;
    stored.geometry_sha256 = geometry_sha256(&stored.geometry)?;
    match (&stored.semantic_draft_sha256, &stored.semantic_draft) {
        (None, None) => {}
        (Some(expected), Some(draft)) => {
            if !exact_sha256(expected)
                || draft.get("identity_sha256").and_then(Value::as_str)
                    != Some(stored.project_identity_sha256.as_str())
            {
                return Err(geometry_contract_error());
            }
            let actual = validate_contam_semantic_draft_structure(draft)
                .map_err(|_| geometry_contract_error())?;
            if !actual.eq_ignore_ascii_case(expected) {
                return Err(document_error(
                    "semantic_draft_hash_mismatch",
                    "The CONTAM semantic draft hash did not match its payload.",
                ));
            }
        }
        _ => return Err(geometry_contract_error()),
    }
    Ok(stored)
}

fn read_document_file(
    path: &Path,
    expected_identity: &str,
) -> Result<StoredGeometryDocument, ReaderDiagnostic> {
    let metadata = fs::symlink_metadata(path).map_err(|_| {
        document_error(
            "geometry_document_read_failed",
            "The Studio geometry document could not be read.",
        )
    })?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() > MAX_GEOMETRY_DOCUMENT_BYTES as u64
    {
        return Err(document_error(
            "geometry_document_invalid",
            "The Studio geometry document has an invalid file shape.",
        ));
    }
    let file = File::open(path).map_err(|_| {
        document_error(
            "geometry_document_read_failed",
            "The Studio geometry document could not be read.",
        )
    })?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take((MAX_GEOMETRY_DOCUMENT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| {
            document_error(
                "geometry_document_read_failed",
                "The Studio geometry document could not be read.",
            )
        })?;
    if bytes.len() > MAX_GEOMETRY_DOCUMENT_BYTES {
        return Err(document_error(
            "geometry_document_invalid",
            "The Studio geometry document exceeded its safe size limit.",
        ));
    }
    let stored = serde_json::from_slice::<StoredGeometryDocument>(&bytes).map_err(|_| {
        document_error(
            "geometry_document_invalid",
            "The Studio geometry document format is invalid.",
        )
    })?;
    validate_stored_document(stored, expected_identity)
}

type SemanticContextSets = (BTreeSet<i64>, BTreeSet<String>, BTreeSet<String>);

fn semantic_context_sets(
    context: &GeometryDocumentContext,
    geometry: &Value,
) -> Result<SemanticContextSets, ReaderDiagnostic> {
    let mut levels = BTreeSet::new();
    if let Some(values) = geometry.get("levels").and_then(Value::as_array) {
        for level in values {
            if let Some(number) = level.get("level_number").and_then(Value::as_i64) {
                levels.insert(number);
            }
        }
    }
    let snapshot = context.semantic_snapshot.as_ref().ok_or_else(|| {
        document_error(
            "geometry_document_semantic_context_unavailable",
            "The trusted semantic snapshot is unavailable for semantic draft validation.",
        )
    })?;
    if let Some(values) = snapshot.get("levels").and_then(Value::as_array) {
        for level in values {
            if let Some(number) = level.get("level_number").and_then(Value::as_i64) {
                levels.insert(number);
            }
        }
    }
    let zones = snapshot
        .get("zones")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|zone| {
            zone.get("object_id")
                .or_else(|| zone.get("zone_id"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect();
    let elements = snapshot
        .get("flow_elements")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|element| element.get("supported").and_then(Value::as_bool) == Some(true))
        .filter_map(|element| {
            element
                .get("element_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect();
    Ok((levels, zones, elements))
}

fn rebound_document_payloads(
    stored: &StoredGeometryDocument,
    context: &GeometryDocumentContext,
) -> Result<(Value, String, Option<Value>, Option<String>), ReaderDiagnostic> {
    let mut geometry = stored.geometry.clone();
    let object = geometry
        .as_object_mut()
        .ok_or_else(geometry_contract_error)?;
    object.insert(
        "project_session_id".into(),
        Value::String(context.project_session_id.clone()),
    );
    object.insert(
        "identity_sha256".into(),
        Value::String(context.identity_sha256.clone()),
    );
    object.insert(
        "source_sha256".into(),
        Value::String(context.source_sha256.clone()),
    );
    object.insert(
        "revision_id".into(),
        Value::String(context.revision_id.clone()),
    );
    validate_building_geometry_value(
        &geometry,
        Some(&context.project_session_id),
        Some(&context.revision_id),
    )
    .map_err(|_| geometry_contract_error())?;
    let hash = geometry_sha256(&geometry)?;
    let semantic_draft = if let Some(stored_draft) = &stored.semantic_draft {
        let mut draft = stored_draft.clone();
        let object = draft.as_object_mut().ok_or_else(geometry_contract_error)?;
        object.insert(
            "project_session_id".into(),
            Value::String(context.project_session_id.clone()),
        );
        object.insert(
            "identity_sha256".into(),
            Value::String(context.identity_sha256.clone()),
        );
        object.insert(
            "source_sha256".into(),
            Value::String(context.source_sha256.clone()),
        );
        object.insert(
            "revision_id".into(),
            Value::String(context.revision_id.clone()),
        );
        let (levels, zones, elements) = semantic_context_sets(context, &geometry)?;
        let validation = validate_contam_semantic_draft_value(
            &draft,
            &ContamSemanticDraftContext {
                project_session_id: &context.project_session_id,
                identity_sha256: &context.identity_sha256,
                source_sha256: &context.source_sha256,
                revision_id: &context.revision_id,
                level_numbers: &levels,
                existing_zone_ids: &zones,
                supported_flow_element_ids: &elements,
                geometry: Some(&geometry),
            },
        )
        .map_err(|_| geometry_contract_error())?;
        if !validation.diagnostics.is_empty() {
            return Err(document_error(
                "semantic_draft_invalid",
                "The CONTAM semantic draft no longer matches the active project.",
            ));
        }
        Some((draft, validation.draft_sha256))
    } else {
        None
    };
    Ok((
        geometry,
        hash,
        semantic_draft.as_ref().map(|(draft, _)| draft.clone()),
        semantic_draft.map(|(_, hash)| hash),
    ))
}

fn load_document_at(
    path: &Path,
    context: &GeometryDocumentContext,
) -> Result<Option<LoadedGeometryDocument>, ReaderDiagnostic> {
    let backup = path.with_extension("json.bak");
    let primary_exists = path.exists();
    let backup_exists = backup.exists();
    if !primary_exists && !backup_exists {
        return Ok(None);
    }
    if primary_exists {
        if let Ok(stored) = read_document_file(path, &context.identity_sha256) {
            let (geometry, geometry_sha256, semantic_draft, semantic_draft_sha256) =
                rebound_document_payloads(&stored, context)?;
            return Ok(Some(LoadedGeometryDocument {
                stored,
                geometry,
                geometry_sha256,
                semantic_draft,
                semantic_draft_sha256,
                recovered_from_backup: false,
            }));
        }
    }
    if backup_exists {
        if let Ok(stored) = read_document_file(&backup, &context.identity_sha256) {
            let (geometry, geometry_sha256, semantic_draft, semantic_draft_sha256) =
                rebound_document_payloads(&stored, context)?;
            return Ok(Some(LoadedGeometryDocument {
                stored,
                geometry,
                geometry_sha256,
                semantic_draft,
                semantic_draft_sha256,
                recovered_from_backup: true,
            }));
        }
    }
    Err(document_error(
        "geometry_document_corrupt",
        "The Studio geometry document and its backup are unavailable.",
    ))
}

fn create_document_temporary(parent: &Path) -> Result<(PathBuf, File), ReaderDiagnostic> {
    for _ in 0..16 {
        let sequence = GEOMETRY_DOCUMENT_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temporary = parent.join(format!(
            ".geometry-document-{}-{sequence}.tmp",
            std::process::id()
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => return Ok((temporary, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => break,
        }
    }
    Err(document_error(
        "geometry_document_write_failed",
        "The Studio geometry document temporary file could not be created.",
    ))
}

fn restore_previous_document(path: &Path, previous: &Path) {
    if !path.exists() && previous.is_file() {
        let _ = fs::copy(previous, path);
    }
}

fn write_document_file(
    path: &Path,
    stored: &StoredGeometryDocument,
    primary_was_valid: bool,
    backup_was_valid: bool,
) -> Result<(), ReaderDiagnostic> {
    let parent = path.parent().ok_or_else(|| {
        document_error(
            "geometry_document_write_failed",
            "The Studio geometry document destination is invalid.",
        )
    })?;
    fs::create_dir_all(parent).map_err(|_| {
        document_error(
            "geometry_document_write_failed",
            "The Studio geometry document directory could not be created.",
        )
    })?;
    let bytes = serde_json::to_vec_pretty(stored).map_err(|_| geometry_contract_error())?;
    if bytes.len() > MAX_GEOMETRY_DOCUMENT_BYTES {
        return Err(document_error(
            "geometry_document_write_failed",
            "The Studio geometry document exceeded its safe size limit.",
        ));
    }
    let (temporary, mut file) = create_document_temporary(parent)?;
    let write_result = (|| -> Result<(), ReaderDiagnostic> {
        file.write_all(&bytes).map_err(|_| {
            document_error(
                "geometry_document_write_failed",
                "The Studio geometry document could not be written.",
            )
        })?;
        file.sync_all().map_err(|_| {
            document_error(
                "geometry_document_write_failed",
                "The Studio geometry document could not be synchronized.",
            )
        })?;
        drop(file);

        let backup = path.with_extension("json.bak");
        let corrupt = path.with_extension("json.corrupt");
        let mut previous = None;
        if path.exists() {
            if primary_was_valid {
                if backup.exists() {
                    fs::remove_file(&backup).map_err(|_| {
                        document_error(
                            "geometry_document_write_failed",
                            "The previous Studio geometry backup could not be rotated.",
                        )
                    })?;
                }
                fs::rename(path, &backup).map_err(|_| {
                    document_error(
                        "geometry_document_write_failed",
                        "The previous Studio geometry document could not be protected.",
                    )
                })?;
                previous = Some(backup.clone());
            } else {
                if corrupt.exists() {
                    fs::remove_file(&corrupt).map_err(|_| {
                        document_error(
                            "geometry_document_write_failed",
                            "The invalid Studio geometry quarantine could not be rotated.",
                        )
                    })?;
                }
                fs::rename(path, &corrupt).map_err(|_| {
                    document_error(
                        "geometry_document_write_failed",
                        "The invalid Studio geometry document could not be quarantined.",
                    )
                })?;
                previous = Some(corrupt.clone());
            }
        }
        if !primary_was_valid && !backup_was_valid && backup.exists() {
            fs::remove_file(&backup).map_err(|_| {
                document_error(
                    "geometry_document_write_failed",
                    "The invalid Studio geometry backup could not be removed.",
                )
            })?;
        }
        if fs::rename(&temporary, path).is_err() {
            if let Some(previous) = previous.as_deref() {
                restore_previous_document(path, previous);
            }
            return Err(document_error(
                "geometry_document_write_failed",
                "The Studio geometry document could not be finalized.",
            ));
        }
        match read_document_file(path, &stored.project_identity_sha256) {
            Ok(verified) if verified.geometry_sha256 == stored.geometry_sha256 => Ok(()),
            _ => {
                let _ = fs::remove_file(path);
                if let Some(previous) = previous.as_deref() {
                    restore_previous_document(path, previous);
                }
                Err(document_error(
                    "geometry_document_write_failed",
                    "The saved Studio geometry document could not be verified.",
                ))
            }
        }
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}

fn save_document_at(
    path: &Path,
    context: &GeometryDocumentContext,
    geometry: Value,
    semantic_draft: Option<Value>,
    expected_document_revision: Option<u64>,
) -> Result<LoadedGeometryDocument, ReaderDiagnostic> {
    let _io_guard = GEOMETRY_DOCUMENT_IO.lock().map_err(|_| {
        document_error(
            "geometry_document_write_failed",
            "The Studio geometry document writer is unavailable.",
        )
    })?;
    validate_building_geometry_value(
        &geometry,
        Some(&context.project_session_id),
        Some(&context.revision_id),
    )
    .map_err(|_| geometry_contract_error())?;
    let draft_flow_path_ids = if let Some(draft) = &semantic_draft {
        contam_semantic_draft_object_ids(draft)
            .map_err(|_| geometry_contract_error())?
            .1
    } else {
        BTreeSet::new()
    };
    let semantic_draft_sha256 = if let Some(draft) = &semantic_draft {
        let (levels, zones, elements) = semantic_context_sets(context, &geometry)?;
        let validation = validate_contam_semantic_draft_value(
            draft,
            &ContamSemanticDraftContext {
                project_session_id: &context.project_session_id,
                identity_sha256: &context.identity_sha256,
                source_sha256: &context.source_sha256,
                revision_id: &context.revision_id,
                level_numbers: &levels,
                existing_zone_ids: &zones,
                supported_flow_element_ids: &elements,
                geometry: Some(&geometry),
            },
        )
        .map_err(|_| geometry_contract_error())?;
        if !validation.diagnostics.is_empty() {
            return Err(document_error(
                "semantic_draft_invalid",
                "The CONTAM semantic draft failed deterministic project binding validation.",
            ));
        }
        Some(validation.draft_sha256)
    } else {
        None
    };
    let existing_semantic_geometry =
        geometry_without_draft_flow_bindings(&geometry, &draft_flow_path_ids);
    if geometry_has_flow_path_bindings(&existing_semantic_geometry) {
        let snapshot = context.semantic_snapshot.as_ref().ok_or_else(|| {
            document_error(
                "geometry_document_semantic_context_unavailable",
                "The trusted semantic snapshot is unavailable for FlowPath validation.",
            )
        })?;
        validate_geometry_semantic_flow_bindings(&existing_semantic_geometry, snapshot)
            .map_err(|_| geometry_contract_error())?;
    }
    if geometry.get("identity_sha256").and_then(Value::as_str)
        != Some(context.identity_sha256.as_str())
        || geometry.get("source_sha256").and_then(Value::as_str)
            != Some(context.source_sha256.as_str())
        || geometry.get("status").and_then(Value::as_str) != Some("available")
        || geometry
            .pointer("/provenance/source_kind")
            .and_then(Value::as_str)
            != Some("studio_metric_draft")
        || geometry
            .pointer("/provenance/application_owned")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err(geometry_contract_error());
    }

    let backup = path.with_extension("json.bak");
    let primary_valid = path.exists() && read_document_file(path, &context.identity_sha256).is_ok();
    let backup_valid =
        backup.exists() && read_document_file(&backup, &context.identity_sha256).is_ok();
    let existing = load_document_at(path, context);
    let previous_revision = match existing {
        Ok(Some(value)) => Some(value.stored.document_revision),
        Ok(None) => None,
        Err(_) if expected_document_revision.is_none() => None,
        Err(error) => return Err(error),
    };
    if previous_revision != expected_document_revision {
        return Err(document_error(
            "geometry_document_conflict",
            "The Studio geometry document changed before this save completed.",
        ));
    }
    let geometry_sha256 = geometry_sha256(&geometry)?;
    let document_revision = previous_revision
        .unwrap_or(0)
        .checked_add(1)
        .filter(|value| *value <= MAX_GEOMETRY_DOCUMENT_REVISION)
        .ok_or_else(|| {
            document_error(
                "geometry_document_revision_exhausted",
                "The Studio geometry document revision limit was reached.",
            )
        })?;
    let stored = StoredGeometryDocument {
        schema_version: GEOMETRY_DOCUMENT_SCHEMA_VERSION.into(),
        project_identity_sha256: context.identity_sha256.clone(),
        geometry_sha256: geometry_sha256.clone(),
        document_revision,
        saved_at_unix_ms: unix_time_ms()?,
        geometry: geometry.clone(),
        semantic_draft_sha256: semantic_draft_sha256.clone(),
        semantic_draft: semantic_draft.clone(),
    };
    validate_stored_document(stored.clone(), &context.identity_sha256)?;
    write_document_file(path, &stored, primary_valid, backup_valid)?;
    Ok(LoadedGeometryDocument {
        stored,
        geometry,
        geometry_sha256,
        semantic_draft,
        semantic_draft_sha256,
        recovered_from_backup: false,
    })
}

fn summary(value: &LoadedGeometryDocument) -> GeometryDocumentSummaryView {
    GeometryDocumentSummaryView {
        schema_version: GEOMETRY_DOCUMENT_SUMMARY_SCHEMA_VERSION.into(),
        project_identity_sha256: value.stored.project_identity_sha256.clone(),
        geometry_sha256: value.geometry_sha256.clone(),
        semantic_draft_sha256: value.semantic_draft_sha256.clone(),
        document_revision: value.stored.document_revision,
        saved_at_unix_ms: value.stored.saved_at_unix_ms,
        recovered_from_backup: value.recovered_from_backup,
    }
}

fn failure(request_id: String, error: ReaderDiagnostic) -> DesktopGeometryDocumentResponse {
    DesktopGeometryDocumentResponse {
        request_id,
        status: "error".into(),
        project_session_id: None,
        revision_id: None,
        geometry: None,
        semantic_draft: None,
        summary: None,
        error: Some(error),
    }
}

pub(super) fn geometry_document_context(
    store: &DesktopProjectSessionStore,
    project_session_id: &str,
    revision_id: &str,
) -> Result<GeometryDocumentContext, ReaderDiagnostic> {
    if !semantic_string_is_valid(project_session_id, 160)
        || !semantic_string_is_valid(revision_id, 160)
    {
        return Err(document_error(
            "geometry_document_request_invalid",
            "The Studio geometry document request was invalid.",
        ));
    }
    let state = store.state.lock().expect("desktop session mutex poisoned");
    let active = state.active_project.as_ref().ok_or_else(|| {
        document_error(
            "geometry_document_unavailable",
            "No active project is available for Studio geometry storage.",
        )
    })?;
    if active.project_session_id != project_session_id
        || active.active_revision().revision_id != revision_id
        || !active_project_source_matches(active)
    {
        return Err(document_error(
            "geometry_document_stale",
            "The active project changed before Studio geometry storage completed.",
        ));
    }
    let semantic_snapshot = state
        .trusted_semantic_snapshot
        .as_ref()
        .filter(|snapshot| {
            snapshot.project_session_id == active.project_session_id
                && snapshot.revision_id == active.active_revision().revision_id
                && snapshot
                    .identity_sha256
                    .eq_ignore_ascii_case(&active.baseline_source_sha256)
                && snapshot
                    .source_sha256
                    .eq_ignore_ascii_case(&active.source_sha256)
        })
        .map(|snapshot| snapshot.snapshot.clone());
    Ok(GeometryDocumentContext {
        project_session_id: active.project_session_id.clone(),
        revision_id: active.active_revision().revision_id.clone(),
        identity_sha256: active.baseline_source_sha256.clone(),
        source_sha256: active.source_sha256.clone(),
        semantic_snapshot,
    })
}

pub(super) fn geometry_context_is_current(
    store: &DesktopProjectSessionStore,
    expected: &GeometryDocumentContext,
) -> bool {
    let state = store.state.lock().expect("desktop session mutex poisoned");
    state.active_project.as_ref().is_some_and(|active| {
        active.project_session_id == expected.project_session_id
            && active.active_revision().revision_id == expected.revision_id
            && active
                .baseline_source_sha256
                .eq_ignore_ascii_case(&expected.identity_sha256)
            && active
                .source_sha256
                .eq_ignore_ascii_case(&expected.source_sha256)
            && active_project_source_matches(active)
    })
}

fn document_path(
    app: &AppHandle,
    identity_sha256: &str,
    create_root: bool,
) -> Result<PathBuf, ReaderDiagnostic> {
    if !exact_sha256(identity_sha256) {
        return Err(geometry_contract_error());
    }
    let app_data = app.path().app_local_data_dir().map_err(|_| {
        document_error(
            "geometry_document_unavailable",
            "The application data directory is unavailable.",
        )
    })?;
    let root = app_data.join("geometry-documents");
    if create_root {
        fs::create_dir_all(&root).map_err(|_| {
            document_error(
                "geometry_document_write_failed",
                "The Studio geometry document directory could not be created.",
            )
        })?;
    }
    if root.exists() {
        let resolved_root = fs::canonicalize(&root).map_err(|_| {
            document_error(
                "geometry_document_unavailable",
                "The Studio geometry document directory is unavailable.",
            )
        })?;
        let resolved_app_data = fs::canonicalize(&app_data).map_err(|_| {
            document_error(
                "geometry_document_unavailable",
                "The application data directory is unavailable.",
            )
        })?;
        if !resolved_root.starts_with(&resolved_app_data) {
            return Err(document_error(
                "geometry_document_unavailable",
                "The Studio geometry document directory failed its boundary check.",
            ));
        }
        return Ok(resolved_root.join(format!("{}.json", identity_sha256.to_ascii_lowercase())));
    }
    Ok(root.join(format!("{}.json", identity_sha256.to_ascii_lowercase())))
}

pub(super) async fn load_project_geometry_document_impl(
    app: AppHandle,
    store: &DesktopProjectSessionStore,
    request_id: String,
    project_session_id: String,
    revision_id: String,
) -> DesktopGeometryDocumentResponse {
    if !semantic_string_is_valid(&request_id, 160) {
        return failure(
            request_id,
            document_error(
                "geometry_document_request_invalid",
                "The Studio geometry document request was invalid.",
            ),
        );
    }
    let context = match geometry_document_context(store, &project_session_id, &revision_id) {
        Ok(value) => value,
        Err(error) => return failure(request_id, error),
    };
    let path = match document_path(&app, &context.identity_sha256, false) {
        Ok(value) => value,
        Err(error) => return failure(request_id, error),
    };
    let worker_context = context.clone();
    let loaded = tauri::async_runtime::spawn_blocking(move || {
        let _io_guard = GEOMETRY_DOCUMENT_IO.lock().map_err(|_| {
            document_error(
                "geometry_document_read_failed",
                "The Studio geometry document reader is unavailable.",
            )
        })?;
        load_document_at(&path, &worker_context)
    })
    .await;
    if !geometry_context_is_current(store, &context) {
        return failure(
            request_id,
            document_error(
                "geometry_document_stale",
                "The active project changed before Studio geometry storage completed.",
            ),
        );
    }
    match loaded {
        Ok(Ok(Some(value))) => DesktopGeometryDocumentResponse {
            request_id,
            status: "restored".into(),
            project_session_id: Some(context.project_session_id),
            revision_id: Some(context.revision_id),
            geometry: Some(value.geometry.clone()),
            semantic_draft: value.semantic_draft.clone(),
            summary: Some(summary(&value)),
            error: None,
        },
        Ok(Ok(None)) => DesktopGeometryDocumentResponse {
            request_id,
            status: "not_found".into(),
            project_session_id: Some(context.project_session_id),
            revision_id: Some(context.revision_id),
            geometry: None,
            semantic_draft: None,
            summary: None,
            error: None,
        },
        Ok(Err(error)) => failure(request_id, error),
        Err(_) => failure(
            request_id,
            document_error(
                "geometry_document_read_failed",
                "The Studio geometry document task failed.",
            ),
        ),
    }
}

pub(super) async fn load_semantic_draft_for_export(
    app: AppHandle,
    store: &DesktopProjectSessionStore,
    project_session_id: &str,
    revision_id: &str,
) -> Result<Value, ReaderDiagnostic> {
    let context = geometry_document_context(store, project_session_id, revision_id)?;
    let path = document_path(&app, &context.identity_sha256, false)?;
    let worker_context = context.clone();
    let loaded = tauri::async_runtime::spawn_blocking(move || {
        let _io_guard = GEOMETRY_DOCUMENT_IO.lock().map_err(|_| {
            document_error(
                "geometry_document_read_failed",
                "The Studio semantic authoring draft reader is unavailable.",
            )
        })?;
        load_document_at(&path, &worker_context)
    })
    .await
    .map_err(|_| {
        document_error(
            "geometry_document_unavailable",
            "The Studio semantic authoring draft task failed.",
        )
    })??
    .ok_or_else(|| {
        document_error(
            "semantic_draft_unavailable",
            "No Studio semantic authoring draft is available for export.",
        )
    })?;
    if !geometry_context_is_current(store, &context) {
        return Err(document_error(
            "semantic_draft_context_stale",
            "The Studio semantic authoring draft changed before export.",
        ));
    }
    loaded.semantic_draft.ok_or_else(|| {
        document_error(
            "semantic_draft_unavailable",
            "No Studio semantic authoring draft is available for export.",
        )
    })
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn save_project_geometry_document_impl(
    app: AppHandle,
    store: &DesktopProjectSessionStore,
    request_id: String,
    project_session_id: String,
    revision_id: String,
    geometry: Value,
    semantic_draft: Option<Value>,
    expected_document_revision: Option<u64>,
) -> DesktopGeometryDocumentResponse {
    if !semantic_string_is_valid(&request_id, 160) {
        return failure(
            request_id,
            document_error(
                "geometry_document_request_invalid",
                "The Studio geometry document request was invalid.",
            ),
        );
    }
    let context = match geometry_document_context(store, &project_session_id, &revision_id) {
        Ok(value) => value,
        Err(error) => return failure(request_id, error),
    };
    if let Err(error) =
        super::geometry_underlay::validate_geometry_underlay_references(&app, &context, &geometry)
    {
        return failure(request_id, error);
    }
    let path = match document_path(&app, &context.identity_sha256, true) {
        Ok(value) => value,
        Err(error) => return failure(request_id, error),
    };
    let worker_context = context.clone();
    let saved = tauri::async_runtime::spawn_blocking(move || {
        save_document_at(
            &path,
            &worker_context,
            geometry,
            semantic_draft,
            expected_document_revision,
        )
    })
    .await;
    if !geometry_context_is_current(store, &context) {
        return failure(
            request_id,
            document_error(
                "geometry_document_stale",
                "The active project changed before Studio geometry storage completed.",
            ),
        );
    }
    match saved {
        Ok(Ok(value)) => DesktopGeometryDocumentResponse {
            request_id,
            status: "saved".into(),
            project_session_id: Some(context.project_session_id),
            revision_id: Some(context.revision_id),
            geometry: None,
            semantic_draft: None,
            summary: Some(summary(&value)),
            error: None,
        },
        Ok(Err(error)) => failure(request_id, error),
        Err(_) => failure(
            request_id,
            document_error(
                "geometry_document_write_failed",
                "The Studio geometry document task failed.",
            ),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn context() -> GeometryDocumentContext {
        GeometryDocumentContext {
            project_session_id: "project-1".into(),
            revision_id: "revision-1".into(),
            identity_sha256: "a".repeat(64),
            source_sha256: "b".repeat(64),
            semantic_snapshot: None,
        }
    }

    fn geometry() -> Value {
        let mut value: Value = serde_json::from_str(include_str!(
            "../../../contracts/geometry/examples/studio-metric-valid.json"
        ))
        .expect("shared geometry fixture");
        value["identity_sha256"] = json!("a".repeat(64));
        value["source_sha256"] = json!("b".repeat(64));
        value
    }

    fn temporary_path(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "contam-studio-geometry-document-{label}-{}-{}",
            std::process::id(),
            GEOMETRY_DOCUMENT_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root.join(format!("document-{label}.json"))
    }

    #[test]
    fn flow_path_geometry_save_requires_current_trusted_semantic_evidence() {
        let path = temporary_path("semantic-flow");
        let mut geometry = geometry();
        geometry["levels"][0]["flow_path_anchors"] = json!([{
            "id": "anchor-1", "opening_id": "door-1", "semantic_flow_path_id": "flow-1",
            "from_zone_id": "zone-1", "to_zone_id": null, "exterior_side": "to"
        }]);
        let unavailable = save_document_at(&path, &context(), geometry.clone(), None, None)
            .expect_err("semantic evidence is mandatory");
        assert_eq!(
            unavailable.code,
            "geometry_document_semantic_context_unavailable"
        );

        let mut trusted = context();
        trusted.semantic_snapshot = Some(json!({
            "result_type": "semantic_project_snapshot",
            "zones": [{"object_id": "zone-1", "contam_number": 1}],
            "flow_paths": [{
                "object_id": "flow-1",
                "from_endpoint": {"category": "zone", "contam_number": 1},
                "to_endpoint": {"category": "outdoor", "contam_number": null}
            }]
        }));
        assert!(save_document_at(&path, &trusted, geometry, None, None).is_ok());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn project_geometry_document_round_trips_and_rotates_one_verified_backup() {
        let path = temporary_path("round-trip");
        let context = context();
        let first = save_document_at(&path, &context, geometry(), None, None).unwrap();
        assert_eq!(first.stored.document_revision, 1);
        let loaded = load_document_at(&path, &context).unwrap().unwrap();
        assert_eq!(loaded.geometry, geometry());
        assert!(!loaded.recovered_from_backup);

        let mut changed = geometry();
        changed["geometry_revision"] = json!(1);
        let second = save_document_at(&path, &context, changed.clone(), None, Some(1)).unwrap();
        assert_eq!(second.stored.document_revision, 2);
        assert!(path.with_extension("json.bak").is_file());
        assert_eq!(
            load_document_at(&path, &context).unwrap().unwrap().geometry,
            changed
        );
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn project_document_round_trips_and_rebinds_semantic_authoring_draft() {
        let path = temporary_path("semantic-draft");
        let mut context = context();
        context.semantic_snapshot = Some(json!({
            "result_type": "semantic_project_snapshot",
            "levels": [{"level_number": 1}],
            "zones": [{"object_id": "existing-zone-1", "contam_number": 1}],
            "flow_elements": [{"element_id": "flow-element-1", "supported": true}],
            "flow_paths": []
        }));
        let mut draft: Value = serde_json::from_str(include_str!(
            "../../../contracts/semantic-authoring/fixtures/valid-draft.json"
        ))
        .unwrap();
        draft["project_session_id"] = json!(context.project_session_id);
        draft["identity_sha256"] = json!(context.identity_sha256);
        draft["source_sha256"] = json!(context.source_sha256);
        draft["revision_id"] = json!(context.revision_id);
        draft["zones"][0]["id"] = json!("zone-1");
        draft["flow_paths"][0]["from_endpoint"]["zone_id"] = json!("zone-1");
        draft["flow_paths"][0]["to_endpoint"] = json!({"kind": "outdoor", "zone_id": null});
        draft["flow_paths"][0]["opening_id"] = json!("door-1");
        let mut geometry = geometry();
        geometry["levels"][0]["flow_path_anchors"] = json!([{
            "id": "draft-anchor-1",
            "opening_id": "door-1",
            "semantic_flow_path_id": "draft-flow-1",
            "from_zone_id": "zone-1",
            "to_zone_id": null,
            "exterior_side": "to"
        }]);

        let saved = save_document_at(&path, &context, geometry, Some(draft.clone()), None).unwrap();
        assert_eq!(
            saved.semantic_draft_sha256,
            Some(validate_contam_semantic_draft_structure(&draft).unwrap())
        );
        assert_eq!(
            load_document_at(&path, &context)
                .unwrap()
                .unwrap()
                .semantic_draft,
            Some(draft)
        );

        let mut rebound = context.clone();
        rebound.revision_id = "revision-2".into();
        rebound.source_sha256 = "c".repeat(64);
        let loaded = load_document_at(&path, &rebound).unwrap().unwrap();
        let rebound_draft = loaded.semantic_draft.unwrap();
        assert_eq!(rebound_draft["revision_id"], json!("revision-2"));
        assert_eq!(rebound_draft["source_sha256"], json!("c".repeat(64)));
        assert_ne!(loaded.semantic_draft_sha256, saved.semantic_draft_sha256);
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn corrupt_primary_recovers_backup_but_reports_the_rebound_hash() {
        let path = temporary_path("recovery");
        let context = context();
        save_document_at(&path, &context, geometry(), None, None).unwrap();
        let mut changed = geometry();
        changed["geometry_revision"] = json!(1);
        save_document_at(&path, &context, changed, None, Some(1)).unwrap();
        fs::write(&path, b"not-json").unwrap();

        let recovered = load_document_at(&path, &context).unwrap().unwrap();
        assert!(recovered.recovered_from_backup);
        assert_eq!(recovered.stored.document_revision, 1);
        assert_eq!(
            recovered.geometry_sha256,
            geometry_sha256(&geometry()).unwrap()
        );
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn legacy_document_without_vertical_collections_migrates_after_hash_verification() {
        let path = temporary_path("vertical-migration");
        let context = context();
        let mut legacy_geometry = geometry();
        legacy_geometry
            .as_object_mut()
            .expect("geometry object")
            .remove("vertical_openings");
        legacy_geometry
            .as_object_mut()
            .expect("geometry object")
            .remove("vertical_flow_path_anchors");
        let legacy_hash = geometry_sha256(&legacy_geometry).unwrap();
        let stored = StoredGeometryDocument {
            schema_version: GEOMETRY_DOCUMENT_SCHEMA_VERSION.into(),
            project_identity_sha256: context.identity_sha256.clone(),
            geometry_sha256: legacy_hash.clone(),
            document_revision: 1,
            saved_at_unix_ms: 1,
            geometry: legacy_geometry,
            semantic_draft_sha256: None,
            semantic_draft: None,
        };
        fs::write(&path, serde_json::to_vec_pretty(&stored).unwrap()).unwrap();

        let loaded = load_document_at(&path, &context).unwrap().unwrap();
        assert_eq!(loaded.geometry["vertical_openings"], json!([]));
        assert_eq!(loaded.geometry["vertical_flow_path_anchors"], json!([]));
        assert_ne!(loaded.geometry_sha256, legacy_hash);
        assert_eq!(loaded.stored.geometry_sha256, loaded.geometry_sha256);
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn save_rejects_revision_conflicts_and_untrusted_identity() {
        let path = temporary_path("conflict");
        let context = context();
        save_document_at(&path, &context, geometry(), None, None).unwrap();
        assert_eq!(
            save_document_at(&path, &context, geometry(), None, None)
                .unwrap_err()
                .code,
            "geometry_document_conflict"
        );
        let mut untrusted = geometry();
        untrusted["identity_sha256"] = json!("c".repeat(64));
        assert_eq!(
            save_document_at(&path, &context, untrusted, None, Some(1))
                .unwrap_err()
                .code,
            "geometry_document_invalid"
        );
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn concurrent_first_saves_are_serialized_and_one_conflicts() {
        let path = temporary_path("concurrent-save");
        let context = context();
        let first_path = path.clone();
        let first_context = context.clone();
        let second_path = path.clone();
        let second_context = context;
        let first = std::thread::spawn(move || {
            save_document_at(&first_path, &first_context, geometry(), None, None)
        });
        let second = std::thread::spawn(move || {
            save_document_at(&second_path, &second_context, geometry(), None, None)
        });
        let results = [first.join().unwrap(), second.join().unwrap()];
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter_map(|result| result.as_ref().err())
                .map(|error| error.code.as_str())
                .collect::<Vec<_>>(),
            vec!["geometry_document_conflict"]
        );
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
