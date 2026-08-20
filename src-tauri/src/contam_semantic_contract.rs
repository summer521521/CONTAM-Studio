use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const CONTAM_SEMANTIC_DRAFT_SCHEMA_VERSION: &str = "contam_semantic_draft.v1";
pub const MAX_SEMANTIC_DRAFT_ZONES: usize = 256;
pub const MAX_SEMANTIC_DRAFT_FLOW_PATHS: usize = 512;
pub const MAX_SEMANTIC_DRAFT_PAYLOAD_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ContamSemanticDraft {
    schema_version: String,
    status: String,
    draft_id: String,
    project_session_id: String,
    identity_sha256: String,
    source_sha256: String,
    revision_id: String,
    draft_revision: u64,
    provenance: DraftProvenance,
    zones: Vec<DraftZone>,
    flow_paths: Vec<DraftFlowPath>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DraftProvenance {
    source_kind: String,
    application_owned: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DraftZone {
    id: String,
    level_number: i64,
    name: String,
    display_name: String,
    volume_litres: i64,
    volume_basis: String,
    geometry_region_id: String,
    initial_temperature_millikelvin: i64,
    initial_pressure_millipascal: i64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DraftEndpoint {
    kind: String,
    zone_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DraftFlowPath {
    id: String,
    level_number: i64,
    opening_id: String,
    from_endpoint: DraftEndpoint,
    to_endpoint: DraftEndpoint,
    flow_element_id: String,
    multiplier_millionths: i64,
    x_mm: i64,
    y_mm: i64,
    relative_height_mm: i64,
    direction_degrees: i64,
}

pub struct ContamSemanticDraftContext<'a> {
    pub project_session_id: &'a str,
    pub identity_sha256: &'a str,
    pub source_sha256: &'a str,
    pub revision_id: &'a str,
    pub level_numbers: &'a BTreeSet<i64>,
    pub existing_zone_ids: &'a BTreeSet<String>,
    pub supported_flow_element_ids: &'a BTreeSet<String>,
    pub geometry: Option<&'a Value>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ContamSemanticDraftValidation {
    pub draft_sha256: String,
    pub diagnostics: Vec<String>,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'-'))
}

fn exact_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_contam_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 15
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-'))
}

fn valid_display_name(value: &str) -> bool {
    !value.is_empty()
        && value.chars().count() <= 80
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

fn endpoint_is_valid(endpoint: &DraftEndpoint) -> bool {
    match endpoint.kind.as_str() {
        "outdoor" => endpoint.zone_id.is_none(),
        "zone" => endpoint.zone_id.as_deref().is_some_and(valid_id),
        _ => false,
    }
}

fn canonicalize_json(value: &Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.iter().map(canonicalize_json).collect()),
        Value::Object(values) => {
            let sorted = values
                .iter()
                .map(|(key, value)| (key.clone(), canonicalize_json(value)))
                .collect::<BTreeMap<_, _>>();
            Value::Object(sorted.into_iter().collect())
        }
        _ => value.clone(),
    }
}

pub fn contam_semantic_draft_sha256(value: &Value) -> Result<String, &'static str> {
    let bytes = serde_json::to_vec(&canonicalize_json(value))
        .map_err(|_| "semantic_draft_contract_invalid")?;
    Ok(Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn parse_and_validate_structure(value: &Value) -> Result<ContamSemanticDraft, &'static str> {
    let bytes = serde_json::to_vec(value).map_err(|_| "semantic_draft_contract_invalid")?;
    if bytes.len() > MAX_SEMANTIC_DRAFT_PAYLOAD_BYTES {
        return Err("semantic_draft_payload_too_large");
    }
    let draft: ContamSemanticDraft =
        serde_json::from_value(value.clone()).map_err(|_| "semantic_draft_contract_invalid")?;
    if draft.schema_version != CONTAM_SEMANTIC_DRAFT_SCHEMA_VERSION
        || draft.status != "available"
        || !valid_id(&draft.draft_id)
        || !valid_id(&draft.project_session_id)
        || !exact_sha256(&draft.identity_sha256)
        || !exact_sha256(&draft.source_sha256)
        || !valid_id(&draft.revision_id)
        || draft.draft_revision > u32::MAX as u64
        || draft.provenance.source_kind != "studio_semantic_draft"
        || !draft.provenance.application_owned
        || draft.zones.len() > MAX_SEMANTIC_DRAFT_ZONES
        || draft.flow_paths.len() > MAX_SEMANTIC_DRAFT_FLOW_PATHS
    {
        return Err("semantic_draft_contract_invalid");
    }
    for zone in &draft.zones {
        if !valid_id(&zone.id)
            || !(1..=10_000).contains(&zone.level_number)
            || !valid_contam_name(&zone.name)
            || !valid_display_name(&zone.display_name)
            || !(1..=1_000_000_000).contains(&zone.volume_litres)
            || !matches!(
                zone.volume_basis.as_str(),
                "explicit" | "geometry_estimate_confirmed"
            )
            || !valid_id(&zone.geometry_region_id)
            || !(173_150..=373_150).contains(&zone.initial_temperature_millikelvin)
            || !(-1_000_000_000..=1_000_000_000).contains(&zone.initial_pressure_millipascal)
        {
            return Err("semantic_draft_contract_invalid");
        }
    }
    for path in &draft.flow_paths {
        if !valid_id(&path.id)
            || !(1..=10_000).contains(&path.level_number)
            || !valid_id(&path.opening_id)
            || !endpoint_is_valid(&path.from_endpoint)
            || !endpoint_is_valid(&path.to_endpoint)
            || !valid_id(&path.flow_element_id)
            || !(1..=1_000_000_000_000).contains(&path.multiplier_millionths)
            || !(-1_000_000_000..=1_000_000_000).contains(&path.x_mm)
            || !(-1_000_000_000..=1_000_000_000).contains(&path.y_mm)
            || !(0..=100_000_000).contains(&path.relative_height_mm)
            || !(-1..=359).contains(&path.direction_degrees)
        {
            return Err("semantic_draft_contract_invalid");
        }
    }
    Ok(draft)
}

pub fn validate_contam_semantic_draft_structure(value: &Value) -> Result<String, &'static str> {
    parse_and_validate_structure(value)?;
    contam_semantic_draft_sha256(value)
}

pub fn contam_semantic_draft_object_ids(
    value: &Value,
) -> Result<(BTreeSet<String>, BTreeSet<String>), &'static str> {
    let draft = parse_and_validate_structure(value)?;
    Ok((
        draft.zones.into_iter().map(|zone| zone.id).collect(),
        draft.flow_paths.into_iter().map(|path| path.id).collect(),
    ))
}

type GeometryFlowBinding = (String, i64, Option<String>, Option<String>, String);

fn geometry_bindings(
    geometry: &Value,
) -> (
    BTreeMap<String, String>,
    BTreeMap<String, i64>,
    BTreeMap<String, GeometryFlowBinding>,
) {
    let mut regions = BTreeMap::new();
    let mut openings = BTreeMap::new();
    let mut flow_paths = BTreeMap::new();
    if let Some(levels) = geometry.get("levels").and_then(Value::as_array) {
        for level in levels {
            let Some(level_number) = level.get("level_number").and_then(Value::as_i64) else {
                continue;
            };
            if let Some(values) = level.get("zone_regions").and_then(Value::as_array) {
                for region in values {
                    if let (Some(id), Some(zone_id)) = (
                        region.get("id").and_then(Value::as_str),
                        region.get("semantic_zone_id").and_then(Value::as_str),
                    ) {
                        regions.insert(id.to_owned(), zone_id.to_owned());
                    }
                }
            }
            if let Some(values) = level.get("openings").and_then(Value::as_array) {
                for opening in values {
                    if let Some(id) = opening.get("id").and_then(Value::as_str) {
                        openings.insert(id.to_owned(), level_number);
                    }
                }
            }
            if let Some(values) = level.get("flow_path_anchors").and_then(Value::as_array) {
                for anchor in values {
                    if let (Some(flow_id), Some(opening_id), Some(exterior_side)) = (
                        anchor.get("semantic_flow_path_id").and_then(Value::as_str),
                        anchor.get("opening_id").and_then(Value::as_str),
                        anchor.get("exterior_side").and_then(Value::as_str),
                    ) {
                        flow_paths.insert(
                            flow_id.to_owned(),
                            (
                                opening_id.to_owned(),
                                level_number,
                                anchor
                                    .get("from_zone_id")
                                    .and_then(Value::as_str)
                                    .map(str::to_owned),
                                anchor
                                    .get("to_zone_id")
                                    .and_then(Value::as_str)
                                    .map(str::to_owned),
                                exterior_side.to_owned(),
                            ),
                        );
                    }
                }
            }
        }
    }
    (regions, openings, flow_paths)
}

pub fn validate_contam_semantic_draft_value(
    value: &Value,
    context: &ContamSemanticDraftContext<'_>,
) -> Result<ContamSemanticDraftValidation, &'static str> {
    let draft = parse_and_validate_structure(value)?;

    let mut diagnostics = BTreeSet::new();
    if draft.project_session_id != context.project_session_id
        || draft.revision_id != context.revision_id
        || !draft
            .identity_sha256
            .eq_ignore_ascii_case(context.identity_sha256)
        || !draft
            .source_sha256
            .eq_ignore_ascii_case(context.source_sha256)
    {
        diagnostics.insert("semantic_draft_context_stale".to_owned());
    }
    let mut zone_ids = BTreeSet::new();
    let mut zone_names = BTreeSet::new();
    let mut region_ids = BTreeSet::new();
    for zone in &draft.zones {
        if !zone_ids.insert(zone.id.clone()) {
            diagnostics.insert("semantic_draft_zone_id_duplicate".to_owned());
        }
        if !zone_names.insert(zone.name.to_ascii_lowercase()) {
            diagnostics.insert("semantic_draft_zone_name_duplicate".to_owned());
        }
        if !region_ids.insert(zone.geometry_region_id.clone()) {
            diagnostics.insert("semantic_draft_zone_region_duplicate".to_owned());
        }
        if !context.level_numbers.contains(&zone.level_number) {
            diagnostics.insert("semantic_draft_level_unknown".to_owned());
        }
    }
    let all_zone_ids = context
        .existing_zone_ids
        .union(&zone_ids)
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut path_ids = BTreeSet::new();
    let mut opening_ids = BTreeSet::new();
    for path in &draft.flow_paths {
        if !path_ids.insert(path.id.clone()) {
            diagnostics.insert("semantic_draft_flow_path_id_duplicate".to_owned());
        }
        if !opening_ids.insert(path.opening_id.clone()) {
            diagnostics.insert("semantic_draft_opening_duplicate".to_owned());
        }
        if !context.level_numbers.contains(&path.level_number) {
            diagnostics.insert("semantic_draft_level_unknown".to_owned());
        }
        if !context
            .supported_flow_element_ids
            .contains(&path.flow_element_id)
        {
            diagnostics.insert("semantic_draft_flow_element_unsupported".to_owned());
        }
        if path.from_endpoint.kind == "outdoor" && path.to_endpoint.kind == "outdoor" {
            diagnostics.insert("semantic_draft_flow_path_outdoor_to_outdoor".to_owned());
        }
        for endpoint in [&path.from_endpoint, &path.to_endpoint] {
            if endpoint.kind == "zone"
                && endpoint
                    .zone_id
                    .as_ref()
                    .is_none_or(|zone_id| !all_zone_ids.contains(zone_id))
            {
                diagnostics.insert("semantic_draft_endpoint_unknown".to_owned());
            }
        }
        if path.from_endpoint.kind == "zone"
            && path.to_endpoint.kind == "zone"
            && path.from_endpoint.zone_id == path.to_endpoint.zone_id
        {
            diagnostics.insert("semantic_draft_flow_path_self_reference".to_owned());
        }
    }
    if let Some(geometry) = context.geometry {
        let (regions, openings, flow_paths) = geometry_bindings(geometry);
        for zone in &draft.zones {
            if regions.get(&zone.geometry_region_id) != Some(&zone.id) {
                diagnostics.insert("semantic_draft_zone_geometry_mismatch".to_owned());
            }
        }
        for path in &draft.flow_paths {
            let expected_from = (path.from_endpoint.kind == "zone")
                .then(|| path.from_endpoint.zone_id.clone())
                .flatten();
            let expected_to = (path.to_endpoint.kind == "zone")
                .then(|| path.to_endpoint.zone_id.clone())
                .flatten();
            let expected_exterior = if path.from_endpoint.kind == "outdoor" {
                "from"
            } else if path.to_endpoint.kind == "outdoor" {
                "to"
            } else {
                "none"
            };
            let expected_binding = (
                path.opening_id.clone(),
                path.level_number,
                expected_from,
                expected_to,
                expected_exterior.to_owned(),
            );
            if openings.get(&path.opening_id) != Some(&path.level_number)
                || flow_paths.get(&path.id) != Some(&expected_binding)
            {
                diagnostics.insert("semantic_draft_flow_path_geometry_mismatch".to_owned());
            }
        }
    }
    Ok(ContamSemanticDraftValidation {
        draft_sha256: contam_semantic_draft_sha256(value)?,
        diagnostics: diagnostics.into_iter().collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const IDENTITY: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const SOURCE: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    fn draft() -> Value {
        json!({
            "schema_version": CONTAM_SEMANTIC_DRAFT_SCHEMA_VERSION,
            "status": "available",
            "draft_id": "semantic-draft-1",
            "project_session_id": "session-1",
            "identity_sha256": IDENTITY,
            "source_sha256": SOURCE,
            "revision_id": "revision-1",
            "draft_revision": 2,
            "provenance": {"source_kind": "studio_semantic_draft", "application_owned": true},
            "zones": [{
                "id": "draft-zone-1", "level_number": 1, "name": "Office_1", "display_name": "办公室 1",
                "volume_litres": 48000, "volume_basis": "geometry_estimate_confirmed", "geometry_region_id": "region-1",
                "initial_temperature_millikelvin": 293150, "initial_pressure_millipascal": 0
            }],
            "flow_paths": [{
                "id": "draft-flow-1", "level_number": 1, "opening_id": "opening-1",
                "from_endpoint": {"kind": "zone", "zone_id": "draft-zone-1"},
                "to_endpoint": {"kind": "zone", "zone_id": "existing-zone-1"},
                "flow_element_id": "flow-element-1", "multiplier_millionths": 1000000,
                "x_mm": 4000, "y_mm": 2000, "relative_height_mm": 1500, "direction_degrees": -1
            }]
        })
    }

    fn context<'a>(
        levels: &'a BTreeSet<i64>,
        zones: &'a BTreeSet<String>,
        elements: &'a BTreeSet<String>,
        geometry: Option<&'a Value>,
    ) -> ContamSemanticDraftContext<'a> {
        ContamSemanticDraftContext {
            project_session_id: "session-1",
            identity_sha256: IDENTITY,
            source_sha256: SOURCE,
            revision_id: "revision-1",
            level_numbers: levels,
            existing_zone_ids: zones,
            supported_flow_element_ids: elements,
            geometry,
        }
    }

    #[test]
    fn fixed_point_semantic_draft_validates() {
        let levels = BTreeSet::from([1, 2]);
        let zones = BTreeSet::from(["existing-zone-1".to_owned()]);
        let elements = BTreeSet::from(["flow-element-1".to_owned()]);
        let result = validate_contam_semantic_draft_value(
            &draft(),
            &context(&levels, &zones, &elements, None),
        )
        .unwrap();
        assert!(result.diagnostics.is_empty());
        assert_eq!(result.draft_sha256.len(), 64);
    }

    #[test]
    fn contract_fixture_has_cross_language_canonical_hash() {
        let value: Value = serde_json::from_str(include_str!(
            "../../contracts/semantic-authoring/fixtures/valid-draft.json"
        ))
        .unwrap();
        assert_eq!(
            contam_semantic_draft_sha256(&value).unwrap(),
            "08ebf8937b1640ca13a55b701a84e3b83b05e77c665e5986ec4a795018229586"
        );
    }

    #[test]
    fn semantic_draft_fails_closed_on_unknown_fields_and_topology() {
        let levels = BTreeSet::from([1]);
        let zones = BTreeSet::from(["existing-zone-1".to_owned()]);
        let elements = BTreeSet::from(["flow-element-1".to_owned()]);
        let mut unknown = draft();
        unknown["unexpected"] = json!(true);
        assert_eq!(
            validate_contam_semantic_draft_value(
                &unknown,
                &context(&levels, &zones, &elements, None)
            ),
            Err("semantic_draft_contract_invalid")
        );
        let mut topology = draft();
        topology["flow_paths"][0]["from_endpoint"] = json!({"kind": "outdoor", "zone_id": null});
        topology["flow_paths"][0]["to_endpoint"] = json!({"kind": "outdoor", "zone_id": null});
        let result = validate_contam_semantic_draft_value(
            &topology,
            &context(&levels, &zones, &elements, None),
        )
        .unwrap();
        assert_eq!(
            result.diagnostics,
            vec!["semantic_draft_flow_path_outdoor_to_outdoor"]
        );
    }

    #[test]
    fn geometry_bindings_are_required_when_context_supplies_geometry() {
        let levels = BTreeSet::from([1]);
        let zones = BTreeSet::from(["existing-zone-1".to_owned()]);
        let elements = BTreeSet::from(["flow-element-1".to_owned()]);
        let geometry = json!({"levels": [{
            "level_number": 1,
            "zone_regions": [],
            "openings": [],
            "flow_path_anchors": []
        }]});
        let result = validate_contam_semantic_draft_value(
            &draft(),
            &context(&levels, &zones, &elements, Some(&geometry)),
        )
        .unwrap();
        assert_eq!(
            result.diagnostics,
            vec![
                "semantic_draft_flow_path_geometry_mismatch",
                "semantic_draft_zone_geometry_mismatch"
            ]
        );
        let matching = json!({"levels": [{
            "level_number": 1,
            "zone_regions": [{"id": "region-1", "semantic_zone_id": "draft-zone-1"}],
            "openings": [{"id": "opening-1"}],
            "flow_path_anchors": [{
                "semantic_flow_path_id": "draft-flow-1",
                "opening_id": "opening-1",
                "from_zone_id": "draft-zone-1",
                "to_zone_id": "existing-zone-1",
                "exterior_side": "none"
            }]
        }]});
        let matching_result = validate_contam_semantic_draft_value(
            &draft(),
            &context(&levels, &zones, &elements, Some(&matching)),
        )
        .unwrap();
        assert!(matching_result.diagnostics.is_empty());
    }
}
