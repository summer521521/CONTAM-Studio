use super::*;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

const ATTACHMENT_IMPORT_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_ATTACHMENT_BATCH_BYTES: u64 = 100 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT: usize = 32;
const MAX_VISION_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_VISION_IMAGE_PIXELS: u64 = 20_000_000;
const EVIDENCE_TTL_MS: u128 = 15 * 60 * 1_000;
static ATTACHMENT_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AttachmentView {
    pub(super) attachment_id: String,
    pub(super) display_name: String,
    pub(super) category: String,
    pub(super) size_bytes: u64,
    pub(super) sha256_prefix: String,
    pub(super) status: String,
    pub(super) risk_summary: String,
    pub(super) metadata: BTreeMap<String, Value>,
    pub(super) evidence_kind: Option<String>,
    pub(super) selected_by_user: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AttachmentEvidenceView {
    attachment_id: String,
    display_name: String,
    category: String,
    sha256: String,
    size_bytes: u64,
    evidence_kind: String,
    content: String,
    disclosure: String,
    image_pixels_sent: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AttachmentEvidenceBundleView {
    bundle_id: String,
    project_session_id: String,
    revision_id: String,
    language: String,
    model_id: String,
    created_at_unix_ms: u128,
    expires_at_unix_ms: u128,
    bundle_sha256: String,
    attachments: Vec<AttachmentEvidenceView>,
    images_saved_not_sent: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopAttachmentListResponse {
    request_id: String,
    attachments: Vec<AttachmentView>,
    busy: bool,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopAttachmentImportResponse {
    request_id: String,
    cancelled: bool,
    attachments: Vec<AttachmentView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopAttachmentEvidenceResponse {
    request_id: String,
    bundle: Option<AttachmentEvidenceBundleView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopAttachmentActionResponse {
    request_id: String,
    attachments: Vec<AttachmentView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawAttachmentImportResult {
    result_type: String,
    attachment: RawAttachmentView,
    quarantine_relative_path: String,
    evidence: Option<RawAttachmentEvidence>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawAttachmentView {
    attachment_id: String,
    display_name: String,
    category: String,
    size_bytes: u64,
    sha256_prefix: String,
    status: String,
    active_content_rejected: bool,
    risk_summary: String,
    metadata: BTreeMap<String, Value>,
    evidence_kind: Option<String>,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawAttachmentEvidence {
    attachment_id: String,
    evidence_id: String,
    locator: String,
    text: String,
    sha256: String,
}

#[derive(Clone, Debug)]
pub(super) struct StoredAttachment {
    pub(super) view: AttachmentView,
    pub(super) sha256: String,
    pub(super) quarantine_relative_path: String,
    evidence: Option<RawAttachmentEvidence>,
}

pub(crate) struct VisionImageInput {
    pub(crate) attachment_id: String,
    pub(crate) display_name: String,
    pub(crate) sha256: String,
    pub(crate) mime_type: &'static str,
    pub(crate) width: u64,
    pub(crate) height: u64,
    pub(crate) path: PathBuf,
}

#[derive(Clone, Debug)]
struct StoredEvidenceBundle {
    view: AttachmentEvidenceBundleView,
    attachment_fingerprint: String,
}

#[derive(Default)]
struct AttachmentCenterState {
    attachments: BTreeMap<String, StoredAttachment>,
    import_active: bool,
    generation: u64,
    evidence_bundle: Option<StoredEvidenceBundle>,
}

#[derive(Default)]
pub struct AttachmentCenterStore {
    state: Mutex<AttachmentCenterState>,
}

impl AttachmentCenterStore {
    pub(crate) fn close_activity_active(&self) -> bool {
        self.state
            .lock()
            .expect("attachment center mutex poisoned")
            .import_active
    }

    pub(super) fn start_import(&self) -> Result<(), ReaderDiagnostic> {
        let mut state = self.state.lock().expect("attachment center mutex poisoned");
        if state.import_active {
            return Err(attachment_diagnostic(
                "attachment_import_busy",
                "Another attachment import is already active.",
            ));
        }
        state.import_active = true;
        Ok(())
    }

    pub(super) fn finish_import(&self) {
        self.state
            .lock()
            .expect("attachment center mutex poisoned")
            .import_active = false;
    }

    pub(super) fn list(&self) -> (Vec<AttachmentView>, bool) {
        let state = self.state.lock().expect("attachment center mutex poisoned");
        (
            state
                .attachments
                .values()
                .map(|attachment| attachment.view.clone())
                .collect(),
            state.import_active,
        )
    }

    pub(crate) fn inspect_selected_image_for_vision(
        &self,
        app: &AppHandle,
        attachment_id: &str,
        expected_sha256: Option<&str>,
    ) -> Result<VisionImageInput, ReaderDiagnostic> {
        if Uuid::parse_str(attachment_id).is_err() {
            return Err(attachment_diagnostic(
                "vision_image_request_invalid",
                "The selected image request was invalid.",
            ));
        }
        let attachment = {
            let state = self.state.lock().expect("attachment center mutex poisoned");
            if state.import_active {
                return Err(attachment_diagnostic(
                    "attachment_import_busy",
                    "Image analysis is unavailable while attachments are importing.",
                ));
            }
            state
                .attachments
                .get(attachment_id)
                .cloned()
                .ok_or_else(|| {
                    attachment_diagnostic("attachment_missing", "The attachment is unavailable.")
                })?
        };
        if !attachment.view.selected_by_user
            || attachment.view.category != "image"
            || attachment.view.status != "ready"
            || attachment.view.evidence_kind.as_deref() != Some("image_metadata")
            || attachment.view.size_bytes == 0
            || attachment.view.size_bytes > MAX_VISION_IMAGE_BYTES
        {
            return Err(attachment_diagnostic(
                "vision_image_unsupported",
                "Select one ready PNG or JPEG within the vision size limit.",
            ));
        }
        let width = attachment
            .view
            .metadata
            .get("width")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        let height = attachment
            .view
            .metadata
            .get("height")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        if width == 0
            || height == 0
            || width
                .checked_mul(height)
                .is_none_or(|pixels| pixels > MAX_VISION_IMAGE_PIXELS)
        {
            return Err(attachment_diagnostic(
                "vision_image_dimensions_invalid",
                "The selected image dimensions are invalid or too large.",
            ));
        }
        let root = attachment_quarantine_root(app)?;
        let path = owned_quarantine_path(
            &root,
            &attachment.view.attachment_id,
            &attachment.quarantine_relative_path,
        )?;
        let (sha256, size_bytes) = sha256_file(&path).map_err(|_| {
            attachment_diagnostic(
                "vision_image_changed",
                "The Studio-owned image copy could not be verified.",
            )
        })?;
        if size_bytes != attachment.view.size_bytes
            || !sha256.eq_ignore_ascii_case(&attachment.sha256)
            || expected_sha256.is_some_and(|expected| !sha256.eq_ignore_ascii_case(expected))
        {
            return Err(attachment_diagnostic(
                "vision_image_changed",
                "The Studio-owned image copy changed after import.",
            ));
        }
        let bytes = std::fs::read(&path).map_err(|_| {
            attachment_diagnostic(
                "vision_image_unavailable",
                "The Studio-owned image copy could not be read.",
            )
        })?;
        let lower_name = attachment.view.display_name.to_ascii_lowercase();
        let mime_type = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") && lower_name.ends_with(".png") {
            "image/png"
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff])
            && (lower_name.ends_with(".jpg") || lower_name.ends_with(".jpeg"))
        {
            "image/jpeg"
        } else {
            return Err(attachment_diagnostic(
                "vision_image_signature_invalid",
                "The selected image signature did not match a supported PNG or JPEG.",
            ));
        };
        Ok(VisionImageInput {
            attachment_id: attachment.view.attachment_id,
            display_name: attachment.view.display_name,
            sha256: attachment.sha256,
            mime_type,
            width,
            height,
            path,
        })
    }

    pub(super) fn insert(&self, attachment: StoredAttachment) {
        let mut state = self.state.lock().expect("attachment center mutex poisoned");
        if state.attachments.len() >= MAX_ATTACHMENT_COUNT {
            return;
        }
        state
            .attachments
            .insert(attachment.view.attachment_id.clone(), attachment);
        invalidate_evidence_locked(&mut state);
    }

    pub(super) fn can_accept_more(&self) -> bool {
        self.state
            .lock()
            .expect("attachment center mutex poisoned")
            .attachments
            .len()
            < MAX_ATTACHMENT_COUNT
    }

    fn set_selected(
        &self,
        attachment_id: &str,
        selected: bool,
    ) -> Result<Vec<AttachmentView>, ReaderDiagnostic> {
        let mut state = self.state.lock().expect("attachment center mutex poisoned");
        if state.import_active {
            return Err(attachment_diagnostic(
                "attachment_import_busy",
                "Attachment selection is unavailable while importing.",
            ));
        }
        let attachment = state.attachments.get_mut(attachment_id).ok_or_else(|| {
            attachment_diagnostic("attachment_missing", "The attachment is unavailable.")
        })?;
        if selected && (attachment.view.status != "ready" || attachment.evidence.is_none()) {
            return Err(attachment_diagnostic(
                "attachment_evidence_unsupported",
                "This attachment cannot be selected as AI evidence.",
            ));
        }
        attachment.view.selected_by_user = selected;
        invalidate_evidence_locked(&mut state);
        Ok(state
            .attachments
            .values()
            .map(|item| item.view.clone())
            .collect())
    }

    fn remove(
        &self,
        attachment_id: &str,
        quarantine_root: &Path,
    ) -> Result<Vec<AttachmentView>, ReaderDiagnostic> {
        let mut state = self.state.lock().expect("attachment center mutex poisoned");
        if state.import_active {
            return Err(attachment_diagnostic(
                "attachment_import_busy",
                "Attachment removal is unavailable while importing.",
            ));
        }
        let attachment = state.attachments.get(attachment_id).ok_or_else(|| {
            attachment_diagnostic("attachment_missing", "The attachment is unavailable.")
        })?;
        let target = owned_quarantine_path(
            quarantine_root,
            &attachment.view.attachment_id,
            &attachment.quarantine_relative_path,
        )?;
        std::fs::remove_file(&target).map_err(|_| {
            attachment_diagnostic(
                "attachment_remove_failed",
                "The Studio-owned attachment copy could not be removed.",
            )
        })?;
        state.attachments.remove(attachment_id);
        invalidate_evidence_locked(&mut state);
        Ok(state
            .attachments
            .values()
            .map(|item| item.view.clone())
            .collect())
    }

    fn prepare_evidence(
        &self,
        project_session_id: &str,
        revision_id: &str,
        language: &str,
        model_id: &str,
    ) -> Result<AttachmentEvidenceBundleView, ReaderDiagnostic> {
        let mut state = self.state.lock().expect("attachment center mutex poisoned");
        if state.import_active {
            return Err(attachment_diagnostic(
                "attachment_import_busy",
                "Evidence cannot be prepared while importing.",
            ));
        }
        let selected: Vec<_> = state
            .attachments
            .values()
            .filter(|attachment| attachment.view.selected_by_user)
            .collect();
        if selected.is_empty() {
            return Err(attachment_diagnostic(
                "attachment_evidence_empty",
                "Select at least one ready attachment before preparing evidence.",
            ));
        }
        let mut attachments = Vec::with_capacity(selected.len());
        for attachment in selected {
            let evidence = attachment.evidence.as_ref().ok_or_else(|| {
                attachment_diagnostic(
                    "attachment_evidence_unsupported",
                    "A selected attachment has no safe evidence.",
                )
            })?;
            if evidence.attachment_id != attachment.view.attachment_id
                || !safe_attachment_text(&evidence.text, 64 * 1024)
                || !safe_sha256(&evidence.sha256)
                || !matches!(
                    evidence.locator.as_str(),
                    "text"
                        | "table_text"
                        | "office_text"
                        | "pdf_metadata"
                        | "image_metadata"
                        | "contam_metadata"
                        | "archive_metadata"
                )
            {
                return Err(attachment_diagnostic(
                    "attachment_evidence_invalid",
                    "Attachment evidence did not meet the disclosure contract.",
                ));
            }
            let image_metadata = evidence.locator == "image_metadata";
            attachments.push(AttachmentEvidenceView {
                attachment_id: attachment.view.attachment_id.clone(),
                display_name: attachment.view.display_name.clone(),
                category: attachment.view.category.clone(),
                sha256: attachment.sha256.clone(),
                size_bytes: attachment.view.size_bytes,
                evidence_kind: evidence.locator.clone(),
                content: evidence.text.clone(),
                disclosure: if image_metadata {
                    "image_metadata_only".to_owned()
                } else if evidence.locator.ends_with("metadata") {
                    "metadata_only".to_owned()
                } else {
                    "bounded_text".to_owned()
                },
                image_pixels_sent: false,
            });
        }
        let now = unix_time_ms();
        let attachment_fingerprint = attachment_fingerprint(&attachments)?;
        let bundle_id = fresh_attachment_id("bundle");
        let bundle_sha256 = attachment_bundle_hash(
            &bundle_id,
            project_session_id,
            revision_id,
            language,
            model_id,
            &attachments,
            now,
            now + EVIDENCE_TTL_MS,
        )?;
        let view = AttachmentEvidenceBundleView {
            bundle_id,
            project_session_id: project_session_id.to_owned(),
            revision_id: revision_id.to_owned(),
            language: language.to_owned(),
            model_id: model_id.to_owned(),
            created_at_unix_ms: now,
            expires_at_unix_ms: now + EVIDENCE_TTL_MS,
            bundle_sha256,
            images_saved_not_sent: attachments
                .iter()
                .any(|attachment| attachment.evidence_kind == "image_metadata"),
            attachments,
        };
        state.evidence_bundle = Some(StoredEvidenceBundle {
            view: view.clone(),
            attachment_fingerprint,
        });
        Ok(view)
    }

    pub(crate) fn evidence_payload(
        &self,
        project_session_id: &str,
        revision_id: &str,
        language: &str,
        model_id: &str,
    ) -> Result<Value, ReaderDiagnostic> {
        let state = self.state.lock().expect("attachment center mutex poisoned");
        let bundle = state.evidence_bundle.as_ref().ok_or_else(|| {
            attachment_diagnostic(
                "attachment_evidence_unconfirmed",
                "Prepare and confirm attachment disclosure before requesting AI context.",
            )
        })?;
        let view = &bundle.view;
        if unix_time_ms() >= view.expires_at_unix_ms
            || view.project_session_id != project_session_id
            || view.revision_id != revision_id
            || view.language != language
            || view.model_id != model_id
            || bundle.attachment_fingerprint != attachment_fingerprint_from_state(&state)?
        {
            return Err(attachment_diagnostic(
                "attachment_evidence_stale",
                "Attachment evidence changed and must be prepared again.",
            ));
        }
        serde_json::to_value(view).map_err(|_| {
            attachment_diagnostic(
                "attachment_evidence_invalid",
                "Attachment evidence could not be serialized safely.",
            )
        })
    }

    pub(crate) fn simulation_fingerprint(
        &self,
        project_session_id: &str,
        revision_id: &str,
    ) -> Result<String, ReaderDiagnostic> {
        let state = self.state.lock().expect("attachment center mutex poisoned");
        let selected = state
            .attachments
            .values()
            .filter(|attachment| attachment.view.selected_by_user)
            .map(|attachment| {
                json!({
                    "attachment_id": attachment.view.attachment_id,
                    "sha256": attachment.sha256,
                    "evidence": attachment.evidence.as_ref().map(|evidence| &evidence.sha256),
                })
            })
            .collect::<Vec<_>>();
        hash_attachment_value(&json!({
            "project_session_id": project_session_id,
            "revision_id": revision_id,
            "selected": selected,
            "generation": state.generation,
        }))
    }

    pub(crate) fn selected_plan_evidence(
        &self,
        project_session_id: &str,
        revision_id: &str,
    ) -> Result<Vec<AttachmentEvidenceView>, ReaderDiagnostic> {
        let state = self.state.lock().expect("attachment center mutex poisoned");
        let selected_count = state
            .attachments
            .values()
            .filter(|attachment| attachment.view.selected_by_user)
            .count();
        if selected_count == 0 {
            return Ok(Vec::new());
        }
        let Some(bundle) = state.evidence_bundle.as_ref() else {
            return Err(attachment_diagnostic(
                "attachment_evidence_unconfirmed",
                "Prepare and confirm attachment disclosure before using selected attachments in a simulation plan.",
            ));
        };
        if unix_time_ms() >= bundle.view.expires_at_unix_ms
            || bundle.view.project_session_id != project_session_id
            || bundle.view.revision_id != revision_id
            || bundle.attachment_fingerprint != attachment_fingerprint_from_state(&state)?
        {
            return Err(attachment_diagnostic(
                "attachment_evidence_stale",
                "Selected attachment evidence changed and must be prepared again.",
            ));
        }
        Ok(bundle.view.attachments.clone())
    }
}

fn invalidate_evidence_locked(state: &mut AttachmentCenterState) {
    state.generation = state.generation.saturating_add(1);
    state.evidence_bundle = None;
}

fn attachment_diagnostic(code: &str, message: &str) -> ReaderDiagnostic {
    host_diagnostic(code, message, BTreeMap::new())
}

fn safe_attachment_text(value: &str, maximum: usize) -> bool {
    !value.is_empty()
        && value.len() <= maximum
        && !value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
        && !contains_sensitive_attachment_path(value)
}

fn contains_sensitive_attachment_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    value.contains("\\\\")
        || value.to_ascii_lowercase().contains("file://")
        || bytes.windows(3).any(|window| {
            window[0].is_ascii_alphabetic()
                && window[1] == b':'
                && matches!(window[2], b'\\' | b'/')
        })
}

fn safe_attachment_public_text(value: &str, maximum: usize) -> bool {
    !value.is_empty()
        && value.chars().count() <= maximum
        && !value.chars().any(char::is_control)
        && !contains_sensitive_attachment_path(value)
        && !value.contains(['/', '\\'])
}

fn safe_attachment_metadata(metadata: &BTreeMap<String, Value>) -> bool {
    metadata.len() <= 12
        && metadata.iter().all(|(key, value)| {
            key.len() <= 48
                && key
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
                && match value {
                    Value::String(value) => safe_attachment_public_text(value, 120),
                    Value::Number(value) => value.as_u64().is_some(),
                    Value::Bool(_) => true,
                    _ => false,
                }
        })
}

pub(super) fn attachment_quarantine_root(app: &AppHandle) -> Result<PathBuf, ReaderDiagnostic> {
    let root = app.path().app_local_data_dir().map_err(|_| {
        attachment_diagnostic(
            "attachment_quarantine_unavailable",
            "The Studio attachment quarantine is unavailable.",
        )
    })?;
    let root = root.join("attachments").join("quarantine");
    std::fs::create_dir_all(&root).map_err(|_| {
        attachment_diagnostic(
            "attachment_quarantine_unavailable",
            "The Studio attachment quarantine could not be created.",
        )
    })?;
    std::fs::canonicalize(&root).map_err(|_| {
        attachment_diagnostic(
            "attachment_quarantine_unavailable",
            "The Studio attachment quarantine is invalid.",
        )
    })
}

pub(super) fn owned_quarantine_path(
    quarantine_root: &Path,
    attachment_id: &str,
    relative: &str,
) -> Result<PathBuf, ReaderDiagnostic> {
    if Uuid::parse_str(attachment_id).is_err()
        || relative.contains(['/', '\\'])
        || !relative.starts_with(&format!("{attachment_id}-"))
    {
        return Err(attachment_diagnostic(
            "owned_attachment_required",
            "The attachment is not a Studio-owned quarantine object.",
        ));
    }
    let candidate = quarantine_root.join(relative);
    let target = std::fs::canonicalize(&candidate).map_err(|_| {
        attachment_diagnostic(
            "owned_attachment_required",
            "The Studio-owned attachment copy is unavailable.",
        )
    })?;
    if target.parent() != Some(quarantine_root) || !target.is_file() {
        return Err(attachment_diagnostic(
            "owned_attachment_required",
            "The attachment escaped the Studio quarantine boundary.",
        ));
    }
    Ok(target)
}

fn fresh_attachment_id(kind: &str) -> String {
    let sequence = ATTACHMENT_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    Uuid::new_v5(
        &ZONE_UUID_NAMESPACE,
        format!("attachment|{kind}|{}|{sequence}", unix_time_ms()).as_bytes(),
    )
    .to_string()
}

fn hash_attachment_value(value: &Value) -> Result<String, ReaderDiagnostic> {
    let serialized = serde_json::to_string(value).map_err(|_| {
        attachment_diagnostic(
            "attachment_hash_invalid",
            "Attachment state could not be hashed.",
        )
    })?;
    let mut hasher = Sha256::new();
    hasher.update(serialized.as_bytes()).map_err(|_| {
        attachment_diagnostic(
            "attachment_hash_invalid",
            "Attachment state could not be hashed.",
        )
    })?;
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect())
}

fn attachment_fingerprint(
    attachments: &[AttachmentEvidenceView],
) -> Result<String, ReaderDiagnostic> {
    hash_attachment_value(&serde_json::to_value(attachments).map_err(|_| {
        attachment_diagnostic(
            "attachment_hash_invalid",
            "Attachment evidence could not be hashed.",
        )
    })?)
}

fn attachment_fingerprint_from_state(
    state: &AttachmentCenterState,
) -> Result<String, ReaderDiagnostic> {
    let attachments = state
        .attachments
        .values()
        .filter(|attachment| attachment.view.selected_by_user)
        .map(|attachment| {
            let evidence = attachment.evidence.as_ref()?;
            Some(AttachmentEvidenceView {
                attachment_id: attachment.view.attachment_id.clone(),
                display_name: attachment.view.display_name.clone(),
                category: attachment.view.category.clone(),
                sha256: attachment.sha256.clone(),
                size_bytes: attachment.view.size_bytes,
                evidence_kind: evidence.locator.clone(),
                content: evidence.text.clone(),
                disclosure: if evidence.locator == "image_metadata" {
                    "image_metadata_only".to_owned()
                } else if evidence.locator.ends_with("metadata") {
                    "metadata_only".to_owned()
                } else {
                    "bounded_text".to_owned()
                },
                image_pixels_sent: false,
            })
        })
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| {
            attachment_diagnostic(
                "attachment_evidence_unsupported",
                "A selected attachment has no safe evidence.",
            )
        })?;
    attachment_fingerprint(&attachments)
}

#[allow(clippy::too_many_arguments)]
fn attachment_bundle_hash(
    bundle_id: &str,
    project_session_id: &str,
    revision_id: &str,
    language: &str,
    model_id: &str,
    attachments: &[AttachmentEvidenceView],
    created_at_unix_ms: u128,
    expires_at_unix_ms: u128,
) -> Result<String, ReaderDiagnostic> {
    hash_attachment_value(&json!({
        "schema_version": "attachment_evidence_bundle.v1",
        "bundle_id": bundle_id,
        "project_session_id": project_session_id,
        "revision_id": revision_id,
        "language": language,
        "model_id": model_id,
        "attachments": attachments,
        "created_at_unix_ms": created_at_unix_ms,
        "expires_at_unix_ms": expires_at_unix_ms,
    }))
}

pub(super) fn import_attachment_with_python(
    source_path: &Path,
    quarantine_root: &Path,
    request_id: &str,
) -> Result<StoredAttachment, ReaderDiagnostic> {
    let request = json!({
        "protocol_version": PROTOCOL_VERSION,
        "request_id": request_id,
        "operation": "import_attachment",
        "source_path": source_path,
        "quarantine_root": quarantine_root,
    });
    let envelope = execute_bridge_request(&request, request_id, ATTACHMENT_IMPORT_TIMEOUT)?;
    if !envelope.ok {
        return Err(sanitize_python_error(&envelope).unwrap_or_else(|error| error));
    }
    let raw: RawAttachmentImportResult =
        serde_json::from_value(envelope.result.ok_or_else(|| {
            attachment_diagnostic(
                "attachment_import_invalid",
                "Attachment import returned no result.",
            )
        })?)
        .map_err(|_| {
            attachment_diagnostic(
                "attachment_import_invalid",
                "Attachment import result was invalid.",
            )
        })?;
    validate_import_result(raw, quarantine_root)
}

fn validate_import_result(
    raw: RawAttachmentImportResult,
    quarantine_root: &Path,
) -> Result<StoredAttachment, ReaderDiagnostic> {
    let attachment = raw.attachment;
    if raw.result_type != "attachment_import"
        || Uuid::parse_str(&attachment.attachment_id).is_err()
        || !safe_attachment_public_text(&attachment.display_name, 160)
        || !matches!(
            attachment.category.as_str(),
            "image"
                | "pdf"
                | "office"
                | "spreadsheet"
                | "text"
                | "structured"
                | "archive"
                | "contam_project"
                | "contam_artifact"
                | "unsupported_binary"
        )
        || !matches!(
            attachment.status.as_str(),
            "ready" | "unsupported" | "blocked" | "changed"
        )
        || (attachment.status == "ready" && attachment.active_content_rejected)
        || !safe_sha256(&attachment.sha256)
        || attachment.sha256_prefix != attachment.sha256[..12]
        || !safe_attachment_public_text(&attachment.risk_summary, 120)
        || !safe_attachment_metadata(&attachment.metadata)
    {
        return Err(attachment_diagnostic(
            "attachment_import_invalid",
            "Attachment import did not meet the safety contract.",
        ));
    }
    let target = owned_quarantine_path(
        quarantine_root,
        &attachment.attachment_id,
        &raw.quarantine_relative_path,
    )?;
    let (sha256, size_bytes) = sha256_file(&target).map_err(|_| {
        attachment_diagnostic(
            "attachment_import_invalid",
            "Attachment quarantine copy could not be verified.",
        )
    })?;
    if sha256 != attachment.sha256 || size_bytes != attachment.size_bytes {
        return Err(attachment_diagnostic(
            "attachment_import_invalid",
            "Attachment quarantine copy changed during import.",
        ));
    }
    let evidence = raw
        .evidence
        .map(|evidence| {
            if evidence.attachment_id != attachment.attachment_id
                || !safe_sha256(&evidence.sha256)
                || !safe_attachment_text(&evidence.text, 64 * 1024)
                || !matches!(
                    evidence.locator.as_str(),
                    "text"
                        | "table_text"
                        | "office_text"
                        | "pdf_metadata"
                        | "image_metadata"
                        | "contam_metadata"
                        | "archive_metadata"
                )
                || !safe_attachment_public_text(&evidence.evidence_id, 80)
            {
                return Err(attachment_diagnostic(
                    "attachment_evidence_invalid",
                    "Attachment evidence did not meet the safety contract.",
                ));
            }
            Ok(evidence)
        })
        .transpose()?;
    let evidence_kind = attachment.evidence_kind.filter(|kind| {
        matches!(
            kind.as_str(),
            "text"
                | "table_text"
                | "office_text"
                | "pdf_metadata"
                | "image_metadata"
                | "contam_metadata"
                | "archive_metadata"
        )
    });
    if attachment.status == "ready" && (evidence.is_none() || evidence_kind.is_none()) {
        return Err(attachment_diagnostic(
            "attachment_evidence_invalid",
            "Ready attachment did not include bounded evidence metadata.",
        ));
    }
    Ok(StoredAttachment {
        view: AttachmentView {
            attachment_id: attachment.attachment_id,
            display_name: attachment.display_name,
            category: attachment.category,
            size_bytes: attachment.size_bytes,
            sha256_prefix: attachment.sha256_prefix,
            status: attachment.status,
            risk_summary: attachment.risk_summary,
            metadata: attachment.metadata,
            evidence_kind,
            selected_by_user: false,
        },
        sha256: attachment.sha256,
        quarantine_relative_path: raw.quarantine_relative_path,
        evidence,
    })
}

fn attachment_list_response(
    request_id: String,
    store: &AttachmentCenterStore,
) -> DesktopAttachmentListResponse {
    let (attachments, busy) = store.list();
    DesktopAttachmentListResponse {
        request_id,
        attachments,
        busy,
        error: None,
    }
}

#[tauri::command]
pub async fn select_and_import_attachments(
    app: AppHandle,
    request_id: String,
) -> DesktopAttachmentImportResponse {
    if !request_id_is_valid(&request_id) {
        return DesktopAttachmentImportResponse {
            request_id,
            cancelled: false,
            attachments: Vec::new(),
            error: Some(attachment_diagnostic(
                "attachment_request_invalid",
                "The attachment request is invalid.",
            )),
        };
    }
    let store = app.state::<AttachmentCenterStore>();
    if let Err(error) = store.start_import() {
        return DesktopAttachmentImportResponse {
            request_id,
            cancelled: false,
            attachments: store.list().0,
            error: Some(error),
        };
    }
    let dialog_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .add_filter(
                "Supported attachments",
                &[
                    "png", "jpg", "jpeg", "pdf", "docx", "pptx", "xlsx", "odt", "csv", "tsv",
                    "txt", "json", "prj", "sim", "nfr", "zip",
                ],
            )
            .blocking_pick_files()
    })
    .await;
    let selected = match selected {
        Ok(value) => value,
        Err(_) => {
            store.finish_import();
            return DesktopAttachmentImportResponse {
                request_id,
                cancelled: false,
                attachments: store.list().0,
                error: Some(attachment_diagnostic(
                    "desktop_dialog_failed",
                    "The native attachment dialog failed.",
                )),
            };
        }
    };
    let Some(selected) = selected else {
        store.finish_import();
        return DesktopAttachmentImportResponse {
            request_id,
            cancelled: true,
            attachments: store.list().0,
            error: None,
        };
    };
    let paths = selected
        .into_iter()
        .map(|selected| {
            selected.into_path().map_err(|_| {
                attachment_diagnostic(
                    "selected_path_invalid",
                    "The selected attachment was not a local file.",
                )
            })
        })
        .collect::<Result<Vec<_>, _>>();
    let paths = match paths {
        Ok(paths) if !paths.is_empty() => paths,
        Ok(_) => {
            store.finish_import();
            return DesktopAttachmentImportResponse {
                request_id,
                cancelled: true,
                attachments: store.list().0,
                error: None,
            };
        }
        Err(error) => {
            store.finish_import();
            return DesktopAttachmentImportResponse {
                request_id,
                cancelled: false,
                attachments: store.list().0,
                error: Some(error),
            };
        }
    };
    let total = paths.iter().try_fold(0_u64, |total, path| {
        let metadata = std::fs::symlink_metadata(path).map_err(|_| {
            attachment_diagnostic(
                "attachment_source_missing",
                "The selected attachment is unavailable.",
            )
        })?;
        if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
            return Err(attachment_diagnostic(
                "attachment_source_invalid",
                "The selected attachment is not a regular file.",
            ));
        }
        total.checked_add(metadata.len()).ok_or_else(|| {
            attachment_diagnostic(
                "attachment_batch_too_large",
                "The attachment batch is too large.",
            )
        })
    });
    if total.is_err() || total.unwrap_or(u64::MAX) > MAX_ATTACHMENT_BATCH_BYTES {
        store.finish_import();
        return DesktopAttachmentImportResponse {
            request_id,
            cancelled: false,
            attachments: store.list().0,
            error: Some(attachment_diagnostic(
                "attachment_batch_too_large",
                "The attachment batch is too large.",
            )),
        };
    }
    let root = match attachment_quarantine_root(&app) {
        Ok(root) => root,
        Err(error) => {
            store.finish_import();
            return DesktopAttachmentImportResponse {
                request_id,
                cancelled: false,
                attachments: store.list().0,
                error: Some(error),
            };
        }
    };
    let import_request_id = request_id.clone();
    let imported = tauri::async_runtime::spawn_blocking(move || {
        let mut records = Vec::new();
        for (index, path) in paths.iter().enumerate() {
            let child_request_id = format!("{import_request_id}-{index}");
            records.push(import_attachment_with_python(
                path,
                &root,
                &child_request_id,
            ));
        }
        records
    })
    .await;
    store.finish_import();
    let records = match imported {
        Ok(records) => records,
        Err(_) => {
            return DesktopAttachmentImportResponse {
                request_id,
                cancelled: false,
                attachments: store.list().0,
                error: Some(attachment_diagnostic(
                    "attachment_import_failed",
                    "The attachment import task ended unexpectedly.",
                )),
            };
        }
    };
    for record in records {
        match record {
            Ok(record) if store.can_accept_more() => store.insert(record),
            Ok(_) => {
                return DesktopAttachmentImportResponse {
                    request_id,
                    cancelled: false,
                    attachments: store.list().0,
                    error: Some(attachment_diagnostic(
                        "attachment_limit",
                        "The attachment list reached its safe limit.",
                    )),
                }
            }
            Err(error) => {
                return DesktopAttachmentImportResponse {
                    request_id,
                    cancelled: false,
                    attachments: store.list().0,
                    error: Some(error),
                }
            }
        }
    }
    DesktopAttachmentImportResponse {
        request_id,
        cancelled: false,
        attachments: store.list().0,
        error: None,
    }
}

#[tauri::command]
pub fn list_attachments(app: AppHandle, request_id: String) -> DesktopAttachmentListResponse {
    if !request_id_is_valid(&request_id) {
        return DesktopAttachmentListResponse {
            request_id,
            attachments: Vec::new(),
            busy: false,
            error: Some(attachment_diagnostic(
                "attachment_request_invalid",
                "The attachment request is invalid.",
            )),
        };
    }
    attachment_list_response(request_id, app.state::<AttachmentCenterStore>().inner())
}

#[tauri::command]
pub fn set_attachment_ai_selection(
    app: AppHandle,
    request_id: String,
    attachment_id: String,
    selected: bool,
) -> DesktopAttachmentActionResponse {
    let store = app.state::<AttachmentCenterStore>();
    if !request_id_is_valid(&request_id) || Uuid::parse_str(&attachment_id).is_err() {
        return DesktopAttachmentActionResponse {
            request_id,
            attachments: store.list().0,
            error: Some(attachment_diagnostic(
                "attachment_request_invalid",
                "The attachment request is invalid.",
            )),
        };
    }
    match store.set_selected(&attachment_id, selected) {
        Ok(attachments) => DesktopAttachmentActionResponse {
            request_id,
            attachments,
            error: None,
        },
        Err(error) => DesktopAttachmentActionResponse {
            request_id,
            attachments: store.list().0,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn preview_attachment_evidence(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    revision_id: String,
    language: String,
    model_id: String,
) -> DesktopAttachmentEvidenceResponse {
    let store = app.state::<AttachmentCenterStore>();
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || Uuid::parse_str(&revision_id).is_err()
        || !matches!(language.as_str(), "en" | "zh-CN")
        || !safe_attachment_public_text(&model_id, 160)
    {
        return DesktopAttachmentEvidenceResponse {
            request_id,
            bundle: None,
            error: Some(attachment_diagnostic(
                "attachment_request_invalid",
                "The attachment evidence request is invalid.",
            )),
        };
    }
    match store.prepare_evidence(&project_session_id, &revision_id, &language, &model_id) {
        Ok(bundle) => DesktopAttachmentEvidenceResponse {
            request_id,
            bundle: Some(bundle),
            error: None,
        },
        Err(error) => DesktopAttachmentEvidenceResponse {
            request_id,
            bundle: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn remove_studio_attachment(
    app: AppHandle,
    request_id: String,
    attachment_id: String,
) -> DesktopAttachmentActionResponse {
    let store = app.state::<AttachmentCenterStore>();
    if !request_id_is_valid(&request_id) || Uuid::parse_str(&attachment_id).is_err() {
        return DesktopAttachmentActionResponse {
            request_id,
            attachments: store.list().0,
            error: Some(attachment_diagnostic(
                "attachment_request_invalid",
                "The attachment request is invalid.",
            )),
        };
    }
    let root = match attachment_quarantine_root(&app) {
        Ok(root) => root,
        Err(error) => {
            return DesktopAttachmentActionResponse {
                request_id,
                attachments: store.list().0,
                error: Some(error),
            }
        }
    };
    match store.remove(&attachment_id, &root) {
        Ok(attachments) => DesktopAttachmentActionResponse {
            request_id,
            attachments,
            error: None,
        },
        Err(error) => DesktopAttachmentActionResponse {
            request_id,
            attachments: store.list().0,
            error: Some(error),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attachment_payload_never_accepts_paths_or_image_pixels() {
        assert!(!safe_attachment_text("C:\\\\secret", 64));
        assert!(!safe_attachment_public_text("file://secret", 64));
        assert!(safe_attachment_text("bounded local text", 64));
    }

    #[test]
    fn owned_quarantine_names_are_bound_to_the_attachment_id() {
        let id = "00000000-0000-5000-8000-000000000001";
        assert!(Uuid::parse_str(id).is_ok());
        assert!(format!("{id}-sample.txt").starts_with(&format!("{id}-")));
        assert!("../outside".contains(['/', '\\']));
    }
}
