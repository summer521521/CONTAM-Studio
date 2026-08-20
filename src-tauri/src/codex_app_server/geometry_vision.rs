use super::*;
use crate::geometry_contract::{validate_building_geometry_value, MAX_GEOMETRY_COORDINATE};
use crate::zone_bridge::attachment_center::VisionImageInput;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const GEOMETRY_VISION_MODEL_ID: &str = "gpt-5.6-luna";
const GEOMETRY_AI_DRAFT_SCHEMA_VERSION: &str = "geometry_ai_draft.v1";
const MAX_GEOMETRY_AI_CONTEXT_BYTES: usize = 96 * 1024;
const MAX_GEOMETRY_TURN_PARAMS_BYTES: usize = 220 * 1024;
const MAX_GEOMETRY_AI_OPERATIONS: usize = 256;
const MAX_GEOMETRY_AI_TEXT_ITEMS: usize = 32;
const MAX_GEOMETRY_AI_TEXT_CHARS: usize = 600;
const MAX_GEOMETRY_AI_PROMPT_CHARS: usize = 600;
const VISION_DISCLOSURE_GRANT_TTL_MS: u128 = 60_000;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GeometryAiVertex {
    id: String,
    x: i64,
    y: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GeometryAiWall {
    id: String,
    start_vertex_id: String,
    end_vertex_id: String,
    kind: String,
    thickness: Option<i64>,
    source_icon_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GeometryAiZoneRegion {
    id: String,
    semantic_zone_id: String,
    outer_vertex_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GeometryAiOpening {
    id: String,
    wall_id: String,
    kind: String,
    offset: i64,
    width: i64,
    swing: String,
    adjacent_zone_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AddVertexParameters {
    level_id: String,
    vertex: GeometryAiVertex,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AddWallParameters {
    level_id: String,
    wall: GeometryAiWall,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CreateZoneRegionParameters {
    level_id: String,
    zone_region: GeometryAiZoneRegion,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PlaceOpeningParameters {
    level_id: String,
    opening: GeometryAiOpening,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "operation", content = "parameters", rename_all = "snake_case")]
pub enum GeometryAiOperation {
    AddVertex(AddVertexParameters),
    AddWall(AddWallParameters),
    CreateZoneRegion(CreateZoneRegionParameters),
    PlaceOpening(PlaceOpeningParameters),
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GeometryAiDraft {
    schema_version: String,
    project_session_id: String,
    revision_id: String,
    baseline_geometry_hash: String,
    attachment_sha256: String,
    summary: String,
    observations: Vec<String>,
    measurement_basis: String,
    confidence_percent: u8,
    assumptions: Vec<String>,
    warnings: Vec<String>,
    operations: Vec<GeometryAiOperation>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopGeometryAiDraftResponse {
    request_id: String,
    status: String,
    model_id: String,
    reasoning_effort: Option<String>,
    draft: Option<GeometryAiDraft>,
    token_usage: Option<AiTokenUsageView>,
    error: Option<AiDiagnostic>,
}

#[derive(Clone, Debug)]
struct NativeVisionDisclosureGrant {
    project_session_id: String,
    revision_id: String,
    attachment_id: String,
    attachment_sha256: String,
    expires_at_unix_ms: u128,
    consumed: bool,
}

impl NativeVisionDisclosureGrant {
    fn new(
        project_session_id: &str,
        revision_id: &str,
        image: &VisionImageInput,
        issued_at_unix_ms: u128,
    ) -> Self {
        Self {
            project_session_id: project_session_id.to_string(),
            revision_id: revision_id.to_string(),
            attachment_id: image.attachment_id.clone(),
            attachment_sha256: image.sha256.clone(),
            expires_at_unix_ms: issued_at_unix_ms.saturating_add(VISION_DISCLOSURE_GRANT_TTL_MS),
            consumed: false,
        }
    }

    fn consume(
        &mut self,
        project_session_id: &str,
        revision_id: &str,
        image: &VisionImageInput,
        now_unix_ms: u128,
    ) -> bool {
        if self.consumed
            || now_unix_ms > self.expires_at_unix_ms
            || self.project_session_id != project_session_id
            || self.revision_id != revision_id
            || self.attachment_id != image.attachment_id
            || !self.attachment_sha256.eq_ignore_ascii_case(&image.sha256)
        {
            return false;
        }
        self.consumed = true;
        true
    }
}

fn unix_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn geometry_failure(
    request_id: String,
    code: &str,
    message: &str,
) -> DesktopGeometryAiDraftResponse {
    DesktopGeometryAiDraftResponse {
        request_id,
        status: "error".to_string(),
        model_id: GEOMETRY_VISION_MODEL_ID.to_string(),
        reasoning_effort: None,
        draft: None,
        token_usage: None,
        error: Some(AiDiagnostic::new(code, message)),
    }
}

fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
}

fn safe_text(value: &str, maximum: usize) -> bool {
    !value.trim().is_empty()
        && value.chars().count() <= maximum
        && !value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
}

fn safe_text_list(values: &[String], maximum_items: usize) -> bool {
    values.len() <= maximum_items
        && values
            .iter()
            .all(|value| safe_text(value, MAX_GEOMETRY_AI_TEXT_CHARS))
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

fn geometry_hash(value: &Value) -> Result<String, AiDiagnostic> {
    let bytes = serde_json::to_vec(&canonicalize_json(value)).map_err(|_| {
        AiDiagnostic::new(
            "geometry_ai_baseline_invalid",
            "The geometry baseline could not be hashed.",
        )
    })?;
    Ok(Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn exact_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn geometry_ai_draft_schema() -> Value {
    let id = json!({"type": "string", "minLength": 1, "maxLength": 128, "pattern": "^[A-Za-z0-9_.:-]+$"});
    let nullable_id = json!({"type": ["string", "null"], "maxLength": 128});
    let coordinate = json!({"type": "integer", "minimum": -MAX_GEOMETRY_COORDINATE, "maximum": MAX_GEOMETRY_COORDINATE});
    let text = json!({"type": "string", "minLength": 1, "maxLength": MAX_GEOMETRY_AI_TEXT_CHARS});
    let text_list = json!({"type": "array", "items": text, "maxItems": MAX_GEOMETRY_AI_TEXT_ITEMS});
    let vertex = json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "x", "y"],
        "properties": {"id": id, "x": coordinate, "y": coordinate}
    });
    let add_vertex = json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["operation", "parameters"],
        "properties": {
            "operation": {"const": "add_vertex"},
            "parameters": {
                "type": "object", "additionalProperties": false,
                "required": ["level_id", "vertex"],
                "properties": {"level_id": id, "vertex": vertex}
            }
        }
    });
    let add_wall = json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["operation", "parameters"],
        "properties": {
            "operation": {"const": "add_wall"},
            "parameters": {
                "type": "object", "additionalProperties": false,
                "required": ["level_id", "wall"],
                "properties": {"level_id": id, "wall": {
                    "type": "object", "additionalProperties": false,
                    "required": ["id", "start_vertex_id", "end_vertex_id", "kind", "thickness", "source_icon_id"],
                    "properties": {
                        "id": id, "start_vertex_id": id, "end_vertex_id": id,
                        "kind": {"enum": ["exterior", "interior", "unknown"]},
                        "thickness": {"type": ["integer", "null"], "minimum": 1, "maximum": 10000},
                        "source_icon_id": nullable_id
                    }
                }}
            }
        }
    });
    let create_zone = json!({
        "type": "object", "additionalProperties": false,
        "required": ["operation", "parameters"],
        "properties": {
            "operation": {"const": "create_zone_region"},
            "parameters": {
                "type": "object", "additionalProperties": false,
                "required": ["level_id", "zone_region"],
                "properties": {"level_id": id, "zone_region": {
                    "type": "object", "additionalProperties": false,
                    "required": ["id", "semantic_zone_id", "outer_vertex_ids"],
                    "properties": {
                        "id": id, "semantic_zone_id": id,
                        "outer_vertex_ids": {"type": "array", "items": id, "minItems": 3, "maxItems": 256}
                    }
                }}
            }
        }
    });
    let place_opening = json!({
        "type": "object", "additionalProperties": false,
        "required": ["operation", "parameters"],
        "properties": {
            "operation": {"const": "place_opening"},
            "parameters": {
                "type": "object", "additionalProperties": false,
                "required": ["level_id", "opening"],
                "properties": {"level_id": id, "opening": {
                    "type": "object", "additionalProperties": false,
                    "required": ["id", "wall_id", "kind", "offset", "width", "swing", "adjacent_zone_ids"],
                    "properties": {
                        "id": id, "wall_id": id,
                        "kind": {"enum": ["door", "window", "exterior_opening", "other"]},
                        "offset": {"type": "integer", "minimum": 0, "maximum": MAX_GEOMETRY_COORDINATE},
                        "width": {"type": "integer", "minimum": 1, "maximum": MAX_GEOMETRY_COORDINATE},
                        "swing": {"enum": ["none", "left", "right", "double"]},
                        "adjacent_zone_ids": {"type": "array", "items": id, "maxItems": 2}
                    }
                }}
            }
        }
    });
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": [
            "schema_version", "project_session_id", "revision_id", "baseline_geometry_hash",
            "attachment_sha256", "summary", "observations", "measurement_basis",
            "confidence_percent", "assumptions", "warnings", "operations"
        ],
        "properties": {
            "schema_version": {"const": GEOMETRY_AI_DRAFT_SCHEMA_VERSION},
            "project_session_id": id,
            "revision_id": id,
            "baseline_geometry_hash": {"type": "string", "pattern": "^[A-Fa-f0-9]{64}$"},
            "attachment_sha256": {"type": "string", "pattern": "^[A-Fa-f0-9]{64}$"},
            "summary": {"type": "string", "minLength": 1, "maxLength": 1200},
            "observations": text_list,
            "measurement_basis": {"enum": ["explicit_dimensions", "scaled_reference", "visual_estimate", "unknown"]},
            "confidence_percent": {"type": "integer", "minimum": 0, "maximum": 100},
            "assumptions": text_list,
            "warnings": text_list,
            "operations": {
                "type": "array", "maxItems": MAX_GEOMETRY_AI_OPERATIONS,
                "items": {"oneOf": [add_vertex, add_wall, create_zone, place_opening]}
            }
        }
    })
}

fn geometry_thread_instructions(language: &str) -> String {
    let language_name = if language == "zh-CN" {
        "Simplified Chinese"
    } else {
        "English"
    };
    format!(
        "You are the bounded building-plan interpretation engine for CONTAM Studio. Inspect only the attached image and the structured geometry context in the user message. Never call tools, browse, read other files, run commands, modify a project, or claim hidden measurements. Return only the JSON object required by outputSchema. Use integer millimetres and orthogonal walls. Prefer visible dimensions. If scale is unknown, clearly mark visual_estimate or unknown and list assumptions. Bind a zone only when the image label and disclosed semantic zone make the mapping defensible. If a safe geometry draft cannot be formed, return zero operations with observations and warnings. Answer descriptive text in {language_name}."
    )
}

fn geometry_thread_start_params(model_id: &str, runtime_dir: &Path, language: &str) -> Value {
    let instructions = geometry_thread_instructions(language);
    json!({
        "model": model_id,
        "cwd": runtime_dir,
        "approvalPolicy": "never",
        "sandbox": "read-only",
        "config": {"mcp_servers": {}},
        "baseInstructions": instructions,
        "developerInstructions": instructions,
        "ephemeral": true,
        "environments": [],
        "dynamicTools": [],
        "selectedCapabilityRoots": [],
        "experimentalRawEvents": false
    })
}

fn geometry_turn_start_params(
    thread_id: &str,
    request_id: &str,
    prompt: &str,
    image: &VisionImageInput,
    reasoning_effort: &str,
) -> Value {
    json!({
        "threadId": thread_id,
        "clientUserMessageId": request_id,
        "input": [
            {"type": "text", "text": prompt},
            {"type": "localImage", "path": image.path, "detail": "original"}
        ],
        "approvalPolicy": "never",
        "sandboxPolicy": {"type": "readOnly", "networkAccess": false},
        "environments": [],
        "model": GEOMETRY_VISION_MODEL_ID,
        "effort": reasoning_effort,
        "summary": "none",
        "personality": "none",
        "outputSchema": geometry_ai_draft_schema()
    })
}

struct BaselineSets {
    level_ids: BTreeSet<String>,
    object_ids: BTreeSet<String>,
    vertex_levels: BTreeMap<String, String>,
    wall_levels: BTreeMap<String, String>,
    zone_levels: BTreeMap<String, String>,
}

fn baseline_sets(geometry: &Value) -> Result<BaselineSets, AiDiagnostic> {
    let levels = geometry
        .get("levels")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            AiDiagnostic::new(
                "geometry_ai_baseline_invalid",
                "The geometry levels were unavailable.",
            )
        })?;
    let mut level_ids = BTreeSet::new();
    let mut object_ids = BTreeSet::new();
    let mut vertex_levels = BTreeMap::new();
    let mut wall_levels = BTreeMap::new();
    let mut zone_levels = BTreeMap::new();
    for level in levels {
        let level_id = level.get("id").and_then(Value::as_str).ok_or_else(|| {
            AiDiagnostic::new(
                "geometry_ai_baseline_invalid",
                "A geometry level ID was invalid.",
            )
        })?;
        level_ids.insert(level_id.to_string());
        object_ids.insert(level_id.to_string());
        for key in [
            "vertices",
            "walls",
            "openings",
            "zone_regions",
            "flow_path_anchors",
        ] {
            for object in level
                .get(key)
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                let id = object.get("id").and_then(Value::as_str).ok_or_else(|| {
                    AiDiagnostic::new(
                        "geometry_ai_baseline_invalid",
                        "A geometry object ID was invalid.",
                    )
                })?;
                object_ids.insert(id.to_string());
                if key == "vertices" {
                    vertex_levels.insert(id.to_string(), level_id.to_string());
                } else if key == "walls" {
                    wall_levels.insert(id.to_string(), level_id.to_string());
                } else if key == "zone_regions" {
                    let semantic_zone_id = object
                        .get("semantic_zone_id")
                        .and_then(Value::as_str)
                        .ok_or_else(|| {
                        AiDiagnostic::new(
                            "geometry_ai_baseline_invalid",
                            "A geometry Zone binding was invalid.",
                        )
                    })?;
                    zone_levels.insert(semantic_zone_id.to_string(), level_id.to_string());
                }
            }
        }
    }
    Ok(BaselineSets {
        level_ids,
        object_ids,
        vertex_levels,
        wall_levels,
        zone_levels,
    })
}

fn validate_draft(
    draft: GeometryAiDraft,
    geometry: &Value,
    geometry_hash: &str,
    context: &crate::zone_bridge::GeometryAiContext,
    image: &VisionImageInput,
) -> Result<GeometryAiDraft, AiDiagnostic> {
    if draft.schema_version != GEOMETRY_AI_DRAFT_SCHEMA_VERSION
        || draft.project_session_id != context.project_session_id
        || draft.revision_id != context.revision_id
        || !draft
            .baseline_geometry_hash
            .eq_ignore_ascii_case(geometry_hash)
        || !draft.attachment_sha256.eq_ignore_ascii_case(&image.sha256)
        || !exact_hash(&draft.baseline_geometry_hash)
        || !exact_hash(&draft.attachment_sha256)
        || !safe_text(&draft.summary, 1200)
        || !safe_text_list(&draft.observations, MAX_GEOMETRY_AI_TEXT_ITEMS)
        || !safe_text_list(&draft.assumptions, MAX_GEOMETRY_AI_TEXT_ITEMS)
        || !safe_text_list(&draft.warnings, MAX_GEOMETRY_AI_TEXT_ITEMS)
        || !matches!(
            draft.measurement_basis.as_str(),
            "explicit_dimensions" | "scaled_reference" | "visual_estimate" | "unknown"
        )
        || draft.operations.len() > MAX_GEOMETRY_AI_OPERATIONS
    {
        return Err(AiDiagnostic::new(
            "geometry_ai_response_contract_invalid",
            "The Codex geometry draft did not match the bounded response contract.",
        ));
    }
    let BaselineSets {
        level_ids,
        mut object_ids,
        mut vertex_levels,
        mut wall_levels,
        mut zone_levels,
    } = baseline_sets(geometry)?;
    let semantic_zone_ids = context
        .zones
        .iter()
        .map(|zone| zone.zone_id.clone())
        .collect::<BTreeSet<_>>();
    for operation in &draft.operations {
        match operation {
            GeometryAiOperation::AddVertex(parameters) => {
                let vertex = &parameters.vertex;
                if !level_ids.contains(&parameters.level_id)
                    || !safe_id(&vertex.id)
                    || vertex.x.unsigned_abs() > MAX_GEOMETRY_COORDINATE as u64
                    || vertex.y.unsigned_abs() > MAX_GEOMETRY_COORDINATE as u64
                    || !object_ids.insert(vertex.id.clone())
                {
                    return Err(AiDiagnostic::new(
                        "geometry_ai_operation_invalid",
                        "A suggested vertex was invalid or stale.",
                    ));
                }
                vertex_levels.insert(vertex.id.clone(), parameters.level_id.clone());
            }
            GeometryAiOperation::AddWall(parameters) => {
                let wall = &parameters.wall;
                if !level_ids.contains(&parameters.level_id)
                    || !safe_id(&wall.id)
                    || vertex_levels.get(&wall.start_vertex_id).map(String::as_str)
                        != Some(parameters.level_id.as_str())
                    || vertex_levels.get(&wall.end_vertex_id).map(String::as_str)
                        != Some(parameters.level_id.as_str())
                    || wall.start_vertex_id == wall.end_vertex_id
                    || !matches!(wall.kind.as_str(), "exterior" | "interior" | "unknown")
                    || wall
                        .thickness
                        .is_some_and(|value| !(1..=10_000).contains(&value))
                    || wall.source_icon_id.is_some()
                    || !object_ids.insert(wall.id.clone())
                {
                    return Err(AiDiagnostic::new(
                        "geometry_ai_operation_invalid",
                        "A suggested wall was invalid or stale.",
                    ));
                }
                wall_levels.insert(wall.id.clone(), parameters.level_id.clone());
            }
            GeometryAiOperation::CreateZoneRegion(parameters) => {
                let region = &parameters.zone_region;
                let unique_vertices = region.outer_vertex_ids.iter().collect::<BTreeSet<_>>();
                if !level_ids.contains(&parameters.level_id)
                    || !safe_id(&region.id)
                    || !semantic_zone_ids.contains(&region.semantic_zone_id)
                    || zone_levels.contains_key(&region.semantic_zone_id)
                    || region.outer_vertex_ids.len() < 3
                    || unique_vertices.len() != region.outer_vertex_ids.len()
                    || region.outer_vertex_ids.iter().any(|id| {
                        vertex_levels.get(id).map(String::as_str)
                            != Some(parameters.level_id.as_str())
                    })
                    || !object_ids.insert(region.id.clone())
                {
                    return Err(AiDiagnostic::new(
                        "geometry_ai_operation_invalid",
                        "A suggested Zone region was invalid or stale.",
                    ));
                }
                zone_levels.insert(region.semantic_zone_id.clone(), parameters.level_id.clone());
            }
            GeometryAiOperation::PlaceOpening(parameters) => {
                let opening = &parameters.opening;
                if !level_ids.contains(&parameters.level_id)
                    || !safe_id(&opening.id)
                    || wall_levels.get(&opening.wall_id).map(String::as_str)
                        != Some(parameters.level_id.as_str())
                    || !matches!(
                        opening.kind.as_str(),
                        "door" | "window" | "exterior_opening" | "other"
                    )
                    || opening.offset < 0
                    || opening.width <= 0
                    || !matches!(opening.swing.as_str(), "none" | "left" | "right" | "double")
                    || opening.adjacent_zone_ids.len() > 2
                    || opening.adjacent_zone_ids.iter().any(|id| {
                        zone_levels.get(id).map(String::as_str)
                            != Some(parameters.level_id.as_str())
                    })
                    || !object_ids.insert(opening.id.clone())
                {
                    return Err(AiDiagnostic::new(
                        "geometry_ai_operation_invalid",
                        "A suggested opening was invalid or stale.",
                    ));
                }
            }
        }
    }
    Ok(draft)
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn generate_geometry_draft_from_image_impl(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    revision_id: String,
    attachment_id: String,
    geometry: Value,
    prompt: String,
    language: String,
) -> DesktopGeometryAiDraftResponse {
    if !safe_request_id(&request_id)
        || !safe_request_id(&project_session_id)
        || Uuid::parse_str(&revision_id).is_err()
        || Uuid::parse_str(&attachment_id).is_err()
        || !safe_language(&language)
        || !safe_text(&prompt, MAX_GEOMETRY_AI_PROMPT_CHARS)
        || contains_sensitive_path(&prompt)
    {
        return geometry_failure(
            request_id,
            "geometry_ai_request_invalid",
            "The geometry image request was invalid.",
        );
    }
    if let Err(diagnostics) =
        validate_building_geometry_value(&geometry, Some(&project_session_id), Some(&revision_id))
    {
        let code = diagnostics
            .first()
            .map_or("geometry_ai_baseline_invalid", |item| item.code);
        return geometry_failure(
            request_id,
            code,
            "The current geometry baseline was invalid or stale.",
        );
    }
    let context_bytes = match serde_json::to_vec(&geometry) {
        Ok(bytes) if bytes.len() <= MAX_GEOMETRY_AI_CONTEXT_BYTES => bytes,
        _ => {
            return geometry_failure(
                request_id,
                "geometry_ai_context_too_large",
                "The geometry baseline is too large for image-assisted drafting.",
            )
        }
    };
    let geometry_hash = match geometry_hash(&geometry) {
        Ok(value) => value,
        Err(error) => return geometry_failure(request_id, &error.code, &error.message),
    };
    let context = match app
        .state::<DesktopProjectSessionStore>()
        .build_geometry_ai_context(&project_session_id, &revision_id)
    {
        Ok(context) => context,
        Err(error) => return geometry_failure(request_id, &error.code, &error.message),
    };
    if geometry.get("source_sha256").and_then(Value::as_str) != Some(context.source_sha256.as_str())
        || geometry.get("identity_sha256").and_then(Value::as_str)
            != Some(context.identity_sha256.as_str())
    {
        return geometry_failure(
            request_id,
            "geometry_ai_baseline_stale",
            "The geometry baseline no longer matches the active project.",
        );
    }
    let preflight_image = match app
        .state::<AttachmentCenterStore>()
        .inspect_selected_image_for_vision(&app, &attachment_id, None)
    {
        Ok(image) => image,
        Err(error) => return geometry_failure(request_id, &error.code, &error.message),
    };
    let assistant = app.state::<CodexAssistantStore>();
    let stale_connection = {
        assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned")
            .take_unusable_connection()
    };
    if let Some(connection) = stale_connection {
        let _ = close_connection_for_app(&app, connection).await;
        return geometry_failure(
            request_id,
            "codex_app_server_disconnected",
            "Codex App Server disconnected before image analysis.",
        );
    }
    let (connection, context_epoch, reasoning_effort) = {
        let state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        if state.active_turn_request_id.is_some() {
            return geometry_failure(
                request_id,
                "ai_turn_already_active",
                "Another AI turn is already active.",
            );
        }
        if state
            .account
            .as_ref()
            .and_then(|account| account.auth_mode.as_deref())
            != Some("chatgpt")
        {
            return geometry_failure(
                request_id,
                "codex_subscription_required",
                "Sign in to Codex with a ChatGPT subscription before using image drafting.",
            );
        }
        let Some(model) = state
            .models
            .iter()
            .find(|model| model.id == GEOMETRY_VISION_MODEL_ID && model.available)
        else {
            return geometry_failure(
                request_id,
                "codex_geometry_model_unavailable",
                "gpt-5.6-luna is not available in the current Codex account.",
            );
        };
        if !model
            .input_modalities
            .iter()
            .any(|modality| modality == "image")
        {
            return geometry_failure(
                request_id,
                "codex_geometry_model_no_image",
                "gpt-5.6-luna does not advertise image input in the current Codex catalog.",
            );
        }
        (
            state.connection.clone(),
            state.context_epoch,
            model.default_reasoning_effort.clone(),
        )
    };
    let Some(connection) = connection else {
        return geometry_failure(
            request_id,
            "codex_app_server_disconnected",
            "Codex App Server is disconnected.",
        );
    };
    let dialog_app = app.clone();
    let disclosure_title = if language == "zh-CN" {
        "允许 Codex 读取这张图像？".to_string()
    } else {
        "Allow Codex to read this image?".to_string()
    };
    let disclosure_message = if language == "zh-CN" {
        format!(
            "CONTAM Studio 将把“{}”的图像像素发送给 Codex {}，仅用于生成当前项目修订的建筑几何草稿。是否继续？",
            preflight_image.display_name, GEOMETRY_VISION_MODEL_ID
        )
    } else {
        format!(
            "CONTAM Studio will send the image pixels from \"{}\" to Codex {} only to generate a building-geometry draft for the current project revision. Continue?",
            preflight_image.display_name, GEOMETRY_VISION_MODEL_ID
        )
    };
    let disclosure_confirmed = match tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .message(disclosure_message)
            .title(disclosure_title)
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::YesNo)
            .blocking_show()
    })
    .await
    {
        Ok(value) => value,
        Err(_) => {
            return geometry_failure(
                request_id,
                "vision_image_consent_dialog_failed",
                "The native image disclosure confirmation could not be shown.",
            )
        }
    };
    if !disclosure_confirmed {
        return geometry_failure(
            request_id,
            "vision_image_consent_declined",
            "Image pixels were not sent because the native confirmation was declined.",
        );
    }
    let mut disclosure_grant = NativeVisionDisclosureGrant::new(
        &project_session_id,
        &revision_id,
        &preflight_image,
        unix_time_ms(),
    );
    let image = match app
        .state::<AttachmentCenterStore>()
        .inspect_selected_image_for_vision(&app, &attachment_id, Some(&preflight_image.sha256))
    {
        Ok(image)
            if disclosure_grant.consume(
                &project_session_id,
                &revision_id,
                &image,
                unix_time_ms(),
            ) =>
        {
            image
        }
        Ok(_) => {
            return geometry_failure(
                request_id,
                "vision_image_consent_stale",
                "The image disclosure confirmation no longer matches the current request.",
            )
        }
        Err(error) => return geometry_failure(request_id, &error.code, &error.message),
    };
    let user_payload = json!({
        "instruction": "Inspect the attached plan image and propose only bounded geometry operations. Do not use tools or read any other file.",
        "user_intent": prompt,
        "image_metadata": {
            "attachment_id": image.attachment_id,
            "display_name": image.display_name,
            "sha256": image.sha256,
            "mime_type": image.mime_type,
            "width_px": image.width,
            "height_px": image.height
        },
        "semantic_context": context,
        "baseline_geometry": serde_json::from_slice::<Value>(&context_bytes).unwrap_or(Value::Null),
        "baseline_geometry_hash": geometry_hash
    });
    let user_text = match serde_json::to_string(&user_payload) {
        Ok(value) if value.len() <= MAX_GEOMETRY_AI_CONTEXT_BYTES.saturating_add(24 * 1024) => {
            value
        }
        _ => {
            return geometry_failure(
                request_id,
                "geometry_ai_context_too_large",
                "The geometry image request exceeded the Codex protocol limit.",
            )
        }
    };
    let estimated_turn = geometry_turn_start_params(
        "geometry-thread-estimate",
        &request_id,
        &user_text,
        &image,
        &reasoning_effort,
    );
    if serde_json::to_vec(&estimated_turn)
        .map_or(true, |bytes| bytes.len() > MAX_GEOMETRY_TURN_PARAMS_BYTES)
    {
        return geometry_failure(
            request_id,
            "geometry_ai_context_too_large",
            "The geometry image request exceeded the Codex protocol limit.",
        );
    }
    let cancellation = Arc::new(AtomicBool::new(false));
    let interrupt_requested = Arc::new(AtomicBool::new(false));
    let turn_epoch = {
        let mut state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        if state.active_turn_request_id.is_some()
            || !state.has_connection(&connection)
            || state.context_epoch != context_epoch
        {
            return geometry_failure(
                request_id,
                "ai_context_stale",
                "The Codex or project context changed before image analysis.",
            );
        }
        state.active_turn_request_id = Some(request_id.clone());
        state.active_turn_epoch = Some(state.context_epoch);
        state.active_turn_cancel = Some(Arc::clone(&cancellation));
        state.active_turn_interrupt_requested = Some(Arc::clone(&interrupt_requested));
        state.cancel_requested = false;
        state.context_epoch
    };
    let runtime_dir = connection.runtime_dir.clone();
    let request_for_task = request_id.clone();
    let effort_for_task = reasoning_effort.clone();
    let image_for_task = image;
    let connection_for_task = Arc::clone(&connection);
    let task = tauri::async_runtime::spawn_blocking(move || {
        connection_for_task
            .drain_idle_account_notifications()
            .map_err(TurnStartFailure::before_turn)?;
        let response = connection_for_task
            .request(
                "thread/start",
                geometry_thread_start_params(GEOMETRY_VISION_MODEL_ID, &runtime_dir, &language),
                RPC_TIMEOUT,
            )
            .map_err(TurnStartFailure::before_turn)?;
        let thread_id = validate_readonly_thread_response(&response, &runtime_dir)
            .map_err(TurnStartFailure::before_turn)?;
        let response = connection_for_task
            .request(
                "turn/start",
                geometry_turn_start_params(
                    &thread_id,
                    &request_for_task,
                    &user_text,
                    &image_for_task,
                    &effort_for_task,
                ),
                RPC_TIMEOUT,
            )
            .map_err(TurnStartFailure::after_turn_attempt)?;
        let turn_id = response
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty() && value.len() <= 128)
            .ok_or_else(|| {
                TurnStartFailure::after_turn_attempt(RpcFailure::new("ai_turn_start_failed"))
            })?
            .to_string();
        Ok::<_, TurnStartFailure>((thread_id, turn_id, image_for_task.sha256))
    })
    .await;
    let (thread_id, turn_id, attachment_sha256) = match task {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => {
            let cancelled = cancellation.load(Ordering::Acquire);
            if error.turn_may_have_started {
                if let Some(detached) =
                    detach_connection_after_unconfirmed_turn(&assistant, &connection, &request_id)
                {
                    let _ = close_connection_for_app(&app, detached).await;
                }
                return geometry_failure(
                    request_id,
                    "codex_app_server_disconnected",
                    "Codex could not confirm the geometry turn state.",
                );
            }
            clear_pending_turn(&assistant, &request_id);
            if cancelled {
                return geometry_failure(
                    request_id,
                    "ai_turn_interrupted",
                    "The geometry turn was interrupted.",
                );
            }
            let diagnostic = diagnostic_from_rpc(error.error, "ai_turn_start_failed");
            return geometry_failure(request_id, &diagnostic.code, &diagnostic.message);
        }
        Err(_) => {
            if let Some(detached) =
                detach_connection_after_unconfirmed_turn(&assistant, &connection, &request_id)
            {
                let _ = close_connection_for_app(&app, detached).await;
            }
            return geometry_failure(
                request_id,
                "codex_app_server_disconnected",
                "Codex could not confirm the geometry turn state.",
            );
        }
    };
    let interrupted_before_wait = {
        let mut state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        if state.active_turn_request_id.as_deref() != Some(request_id.as_str()) {
            true
        } else {
            state.active_turn_thread_id = Some(thread_id.clone());
            state.active_turn_id = Some(turn_id.clone());
            state.token_usage = None;
            let stale = state.context_epoch != turn_epoch || cancellation.load(Ordering::Acquire);
            if stale {
                state.cancel_requested = true;
                cancellation.store(true, Ordering::Release);
            }
            stale
        }
    };
    let waited = tauri::async_runtime::spawn_blocking({
        let connection = Arc::clone(&connection);
        let cancellation = Arc::clone(&cancellation);
        let interrupt_requested = Arc::clone(&interrupt_requested);
        let thread_id = thread_id.clone();
        let turn_id = turn_id.clone();
        move || {
            wait_for_turn_completion(
                connection,
                thread_id,
                turn_id,
                cancellation,
                interrupt_requested,
                interrupted_before_wait,
            )
        }
    })
    .await;
    let turn_unconfirmed = match &waited {
        Ok(outcome) => turn_outcome_requires_connection_reset(outcome),
        Err(_) => true,
    };
    let (still_owned, context_invalidated, detached_connection) = {
        let mut state = assistant
            .state
            .lock()
            .expect("Codex assistant mutex poisoned");
        let still_owned = state.active_turn_request_id.as_deref() == Some(request_id.as_str());
        let context_invalidated =
            cancellation.load(Ordering::Acquire) || state.context_epoch != turn_epoch;
        let detached_connection = if turn_unconfirmed && state.has_connection(&connection) {
            let detached = state.connection.take();
            state.clear_connection_catalog();
            detached
        } else {
            if still_owned {
                state.clear_active_turn();
                if context_invalidated {
                    state.token_usage = None;
                }
            }
            None
        };
        if turn_unconfirmed && detached_connection.is_none() && still_owned {
            state.clear_active_turn();
        }
        (still_owned, context_invalidated, detached_connection)
    };
    if let Some(detached) = detached_connection {
        let _ = close_connection_for_app(&app, detached).await;
    }
    if turn_unconfirmed || !still_owned {
        return geometry_failure(
            request_id,
            "codex_app_server_disconnected",
            "Codex could not confirm the completed geometry turn.",
        );
    }
    if context_invalidated {
        return geometry_failure(
            request_id,
            "ai_turn_interrupted",
            "The geometry turn was interrupted because its context changed.",
        );
    }
    let current_context = match app
        .state::<DesktopProjectSessionStore>()
        .build_geometry_ai_context(&project_session_id, &revision_id)
    {
        Ok(value) if value == context => value,
        _ => {
            return geometry_failure(
                request_id,
                "ai_context_stale",
                "The project context changed during geometry analysis.",
            )
        }
    };
    let current_image = match app
        .state::<AttachmentCenterStore>()
        .inspect_selected_image_for_vision(&app, &attachment_id, Some(&attachment_sha256))
    {
        Ok(value) if value.sha256.eq_ignore_ascii_case(&attachment_sha256) => value,
        _ => {
            return geometry_failure(
                request_id,
                "ai_context_stale",
                "The selected image changed during geometry analysis.",
            )
        }
    };
    match waited {
        Ok(TurnWaitOutcome::Completed {
            answer,
            token_usage,
        }) => {
            let parsed = serde_json::from_str::<GeometryAiDraft>(&answer)
                .map_err(|_| {
                    AiDiagnostic::new(
                        "geometry_ai_response_contract_invalid",
                        "Codex returned an invalid geometry draft.",
                    )
                })
                .and_then(|draft| {
                    validate_draft(
                        draft,
                        &geometry,
                        &geometry_hash,
                        &current_context,
                        &current_image,
                    )
                });
            match parsed {
                Ok(draft) => {
                    assistant
                        .state
                        .lock()
                        .expect("Codex assistant mutex poisoned")
                        .token_usage = token_usage.clone();
                    DesktopGeometryAiDraftResponse {
                        request_id,
                        status: "completed".to_string(),
                        model_id: GEOMETRY_VISION_MODEL_ID.to_string(),
                        reasoning_effort: Some(reasoning_effort),
                        draft: Some(draft),
                        token_usage,
                        error: None,
                    }
                }
                Err(error) => geometry_failure(request_id, &error.code, &error.message),
            }
        }
        Ok(TurnWaitOutcome::Failed {
            error,
            token_usage,
            completion_confirmed: true,
        }) => {
            assistant
                .state
                .lock()
                .expect("Codex assistant mutex poisoned")
                .token_usage = token_usage;
            let diagnostic = diagnostic_from_rpc(error, "ai_turn_start_failed");
            geometry_failure(request_id, &diagnostic.code, &diagnostic.message)
        }
        Ok(TurnWaitOutcome::Failed {
            completion_confirmed: false,
            ..
        })
        | Err(_) => geometry_failure(
            request_id,
            "codex_app_server_disconnected",
            "Codex could not confirm the completed geometry turn.",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn baseline() -> Value {
        json!({
            "schema_version": "building_geometry.v1",
            "status": "available",
            "geometry_id": "geometry-1",
            "project_session_id": "project-1",
            "identity_sha256": "a".repeat(64),
            "source_sha256": "b".repeat(64),
            "revision_id": "11111111-1111-4111-8111-111111111111",
            "geometry_revision": 0,
            "coordinate_space": {"kind": "studio_metric", "unit": "mm", "units_per_grid_cell": null, "y_axis": "up"},
            "provenance": {"source_kind": "studio_metric_draft", "application_owned": true, "source_schema_version": null},
            "capabilities": {"geometry_editing": "studio_draft", "prj_round_trip": "unsupported"},
            "levels": [{"id": "level-1", "level_number": 1, "name": "Level 1", "elevation": 0, "height": 3000, "vertices": [], "walls": [], "openings": [], "zone_regions": [], "flow_path_anchors": []}],
            "warnings": [],
            "unavailable_reason": null
        })
    }

    fn context() -> crate::zone_bridge::GeometryAiContext {
        crate::zone_bridge::GeometryAiContext {
            project_session_id: "project-1".into(),
            revision_id: "11111111-1111-4111-8111-111111111111".into(),
            revision_number: 0,
            source_sha256: "b".repeat(64),
            identity_sha256: "a".repeat(64),
            zones: vec![crate::zone_bridge::GeometryAiZoneContext {
                zone_id: "22222222-2222-4222-8222-222222222222".into(),
                contam_number: 1,
                name: "Room 1".into(),
                level_number: 1,
            }],
        }
    }

    fn image() -> VisionImageInput {
        VisionImageInput {
            attachment_id: "33333333-3333-4333-8333-333333333333".into(),
            display_name: "plan.png".into(),
            sha256: "c".repeat(64),
            mime_type: "image/png",
            width: 1200,
            height: 800,
            path: PathBuf::from("C:/safe/plan.png"),
        }
    }

    #[test]
    fn geometry_schema_requires_exact_bounded_operations() {
        let schema = geometry_ai_draft_schema();
        assert_eq!(schema["additionalProperties"], false);
        assert_eq!(
            schema["properties"]["operations"]["maxItems"],
            MAX_GEOMETRY_AI_OPERATIONS
        );
        assert_eq!(
            schema["properties"]["operations"]["items"]["oneOf"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
    }

    #[test]
    fn draft_validation_accepts_ordered_geometry_and_rejects_unknown_zone() {
        let geometry = baseline();
        let hash = geometry_hash(&geometry).unwrap();
        let raw = json!({
            "schema_version": GEOMETRY_AI_DRAFT_SCHEMA_VERSION,
            "project_session_id": "project-1",
            "revision_id": "11111111-1111-4111-8111-111111111111",
            "baseline_geometry_hash": hash,
            "attachment_sha256": "c".repeat(64),
            "summary": "One room traced from explicit dimensions.",
            "observations": ["A 4 m by 3 m rectangular room is dimensioned."],
            "measurement_basis": "explicit_dimensions",
            "confidence_percent": 90,
            "assumptions": [],
            "warnings": [],
            "operations": [
                {"operation":"add_vertex","parameters":{"level_id":"level-1","vertex":{"id":"ai-v1","x":0,"y":0}}},
                {"operation":"add_vertex","parameters":{"level_id":"level-1","vertex":{"id":"ai-v2","x":4000,"y":0}}},
                {"operation":"add_vertex","parameters":{"level_id":"level-1","vertex":{"id":"ai-v3","x":4000,"y":3000}}},
                {"operation":"add_vertex","parameters":{"level_id":"level-1","vertex":{"id":"ai-v4","x":0,"y":3000}}},
                {"operation":"add_wall","parameters":{"level_id":"level-1","wall":{"id":"ai-w1","start_vertex_id":"ai-v1","end_vertex_id":"ai-v2","kind":"exterior","thickness":200,"source_icon_id":null}}},
                {"operation":"create_zone_region","parameters":{"level_id":"level-1","zone_region":{"id":"ai-z1","semantic_zone_id":"22222222-2222-4222-8222-222222222222","outer_vertex_ids":["ai-v1","ai-v2","ai-v3","ai-v4"]}}}
            ]
        });
        let draft: GeometryAiDraft = serde_json::from_value(raw).unwrap();
        assert!(validate_draft(draft.clone(), &geometry, &hash, &context(), &image()).is_ok());
        let mut invalid = draft;
        if let GeometryAiOperation::CreateZoneRegion(parameters) =
            invalid.operations.last_mut().unwrap()
        {
            parameters.zone_region.semantic_zone_id = "unknown-zone".into();
        }
        assert_eq!(
            validate_draft(invalid, &geometry, &hash, &context(), &image())
                .unwrap_err()
                .code,
            "geometry_ai_operation_invalid"
        );
    }

    #[test]
    fn turn_payload_uses_local_image_luna_and_read_only_policy() {
        let params = geometry_turn_start_params("thread-1", "request-1", "{}", &image(), "high");
        assert_eq!(params["model"], GEOMETRY_VISION_MODEL_ID);
        assert_eq!(params["input"][1]["type"], "localImage");
        assert_eq!(params["input"][1]["detail"], "original");
        assert_eq!(params["approvalPolicy"], "never");
        assert_eq!(params["sandboxPolicy"]["type"], "readOnly");
        assert_eq!(params["sandboxPolicy"]["networkAccess"], false);
    }

    #[test]
    fn native_disclosure_grant_is_bound_expiring_and_single_use() {
        let source = image();
        let mut grant = NativeVisionDisclosureGrant::new(
            "project-1",
            "11111111-1111-4111-8111-111111111111",
            &source,
            1_000,
        );
        let mut changed = image();
        changed.sha256 = "d".repeat(64);
        assert!(!grant.consume(
            "project-1",
            "11111111-1111-4111-8111-111111111111",
            &changed,
            1_001,
        ));
        assert!(grant.consume(
            "project-1",
            "11111111-1111-4111-8111-111111111111",
            &source,
            1_001,
        ));
        assert!(!grant.consume(
            "project-1",
            "11111111-1111-4111-8111-111111111111",
            &source,
            1_002,
        ));

        let mut expired = NativeVisionDisclosureGrant::new(
            "project-1",
            "11111111-1111-4111-8111-111111111111",
            &source,
            1_000,
        );
        assert!(!expired.consume(
            "project-1",
            "11111111-1111-4111-8111-111111111111",
            &source,
            1_000 + VISION_DISCLOSURE_GRANT_TTL_MS + 1,
        ));
    }

    #[test]
    fn draft_validation_rejects_cross_level_geometry_references() {
        let mut geometry = baseline();
        geometry["levels"].as_array_mut().unwrap().extend([json!({
            "id": "level-2", "level_number": 2, "name": "Level 2",
            "elevation": 3000, "height": 3000,
            "vertices": [{"id": "level-2-v1", "x": 0, "y": 0}],
            "walls": [], "openings": [], "zone_regions": [], "flow_path_anchors": []
        })]);
        let hash = geometry_hash(&geometry).unwrap();
        let raw = json!({
            "schema_version": GEOMETRY_AI_DRAFT_SCHEMA_VERSION,
            "project_session_id": "project-1",
            "revision_id": "11111111-1111-4111-8111-111111111111",
            "baseline_geometry_hash": hash,
            "attachment_sha256": "c".repeat(64),
            "summary": "Invalid cross-level wall.",
            "observations": [],
            "measurement_basis": "unknown",
            "confidence_percent": 10,
            "assumptions": [],
            "warnings": ["The reference is intentionally invalid for the test."],
            "operations": [
                {"operation":"add_vertex","parameters":{"level_id":"level-1","vertex":{"id":"ai-v1","x":1000,"y":0}}},
                {"operation":"add_wall","parameters":{"level_id":"level-1","wall":{"id":"ai-w1","start_vertex_id":"ai-v1","end_vertex_id":"level-2-v1","kind":"interior","thickness":120,"source_icon_id":null}}}
            ]
        });
        let draft: GeometryAiDraft = serde_json::from_value(raw).unwrap();
        assert_eq!(
            validate_draft(draft, &geometry, &hash, &context(), &image())
                .unwrap_err()
                .code,
            "geometry_ai_operation_invalid"
        );
    }
}
