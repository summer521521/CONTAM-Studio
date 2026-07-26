use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

const PROTOCOL_VERSION: &str = "1.2";
const RESULT_SCHEMA_VERSION: &str = "1.0";
const READER_MODE: &str = "strict_contam_3_4_simple_zone_v1";
const PATCH_TYPE: &str = "replace_zone_volume";
const PATCH_FIELD: &str = "volume_m3";
const VOLUME_TOKEN_INDEX: i64 = 7;
const BRIDGE_MODULE: &str = "contam_studio_core.zone_bridge";
const PYTHON_ENVIRONMENT_VARIABLE: &str = "CONTAM_STUDIO_PYTHON";
const READ_OPERATION: &str = "read_simple_zones";
const PLAN_OPERATION: &str = "plan_zone_volume_patch";
const APPLY_OPERATION: &str = "apply_zone_volume_patch_to_copy";
const EXTRACT_ZONE_AIR_STATE_OPERATION: &str = "extract_zone_air_state";
const RUN_ACTIVE_PROJECT_OPERATION: &str = "run_active_project";
const ZONE_RESULT_STAGE_EVENT: &str = "zone-result-stage";
const RESULT_EXPORT_STAGE_EVENT: &str = "zone-result-export-stage";
const READ_AND_PLAN_TIMEOUT: Duration = Duration::from_secs(10);
const APPLY_TIMEOUT: Duration = Duration::from_secs(15);
const EXTRACT_TIMEOUT: Duration = Duration::from_secs(45);
const RUN_TIMEOUT: Duration = Duration::from_secs(75);
const POLL_INTERVAL: Duration = Duration::from_millis(20);
const MAX_STDOUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 16 * 1024;
const MAX_REQUEST_BYTES: usize = 128 * 1024;
const MAX_VOLUME_TOKEN_BYTES: usize = 80;
const MAX_DRAFT_REVISIONS: usize = 32;
const ZONE_UUID_NAMESPACE: Uuid = Uuid::from_u128(0x0c6dfd5d_98c2_5fb3_a9f3_a72ee89a4471);
const MAX_PREVIEW_LINE_CHARS: usize = 4096;
const MAX_DIFF_CHARS: usize = 16 * 1024;
const MAX_DIAGNOSTIC_CODE_BYTES: usize = 80;
const MAX_DIAGNOSTIC_MESSAGE_CHARS: usize = 160;
const MAX_CONTEXT_STRING_CHARS: usize = 120;
const PYTHON_DIAGNOSTIC_MESSAGE: &str = "Python Zone bridge returned a structured diagnostic.";
const SHA256_INITIAL: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];
const SHA256_ROUND: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

#[derive(Clone)]
struct Sha256 {
    state: [u32; 8],
    buffer: [u8; 64],
    buffer_len: usize,
    byte_len: u64,
}

impl Sha256 {
    fn new() -> Self {
        Self {
            state: SHA256_INITIAL,
            buffer: [0; 64],
            buffer_len: 0,
            byte_len: 0,
        }
    }

    fn update(&mut self, mut bytes: &[u8]) -> std::io::Result<()> {
        self.byte_len = self
            .byte_len
            .checked_add(bytes.len() as u64)
            .ok_or_else(|| std::io::Error::other("SHA-256 input is too large"))?;
        if self.buffer_len > 0 {
            let needed = 64 - self.buffer_len;
            let copied = needed.min(bytes.len());
            self.buffer[self.buffer_len..self.buffer_len + copied]
                .copy_from_slice(&bytes[..copied]);
            self.buffer_len += copied;
            bytes = &bytes[copied..];
            if self.buffer_len == 64 {
                let block = self.buffer;
                self.compress(&block);
                self.buffer_len = 0;
            }
        }
        while bytes.len() >= 64 {
            let block: &[u8; 64] = bytes[..64].try_into().expect("64-byte SHA-256 block");
            self.compress(block);
            bytes = &bytes[64..];
        }
        self.buffer[..bytes.len()].copy_from_slice(bytes);
        self.buffer_len = bytes.len();
        Ok(())
    }

    fn compress(&mut self, block: &[u8; 64]) {
        let mut words = [0_u32; 64];
        for (index, chunk) in block.chunks_exact(4).enumerate() {
            words[index] = u32::from_be_bytes(chunk.try_into().expect("four-byte SHA word"));
        }
        for index in 16..64 {
            let small0 = words[index - 15].rotate_right(7)
                ^ words[index - 15].rotate_right(18)
                ^ (words[index - 15] >> 3);
            let small1 = words[index - 2].rotate_right(17)
                ^ words[index - 2].rotate_right(19)
                ^ (words[index - 2] >> 10);
            words[index] = words[index - 16]
                .wrapping_add(small0)
                .wrapping_add(words[index - 7])
                .wrapping_add(small1);
        }
        let mut value = self.state;
        for index in 0..64 {
            let sum1 =
                value[4].rotate_right(6) ^ value[4].rotate_right(11) ^ value[4].rotate_right(25);
            let choose = (value[4] & value[5]) ^ (!value[4] & value[6]);
            let temporary1 = value[7]
                .wrapping_add(sum1)
                .wrapping_add(choose)
                .wrapping_add(SHA256_ROUND[index])
                .wrapping_add(words[index]);
            let sum0 =
                value[0].rotate_right(2) ^ value[0].rotate_right(13) ^ value[0].rotate_right(22);
            let majority = (value[0] & value[1]) ^ (value[0] & value[2]) ^ (value[1] & value[2]);
            let temporary2 = sum0.wrapping_add(majority);
            value = [
                temporary1.wrapping_add(temporary2),
                value[0],
                value[1],
                value[2],
                value[3].wrapping_add(temporary1),
                value[4],
                value[5],
                value[6],
            ];
        }
        for (state, value) in self.state.iter_mut().zip(value) {
            *state = state.wrapping_add(value);
        }
    }

    fn finalize(mut self) -> [u8; 32] {
        let bit_len = self.byte_len * 8;
        self.buffer[self.buffer_len] = 0x80;
        self.buffer_len += 1;
        if self.buffer_len > 56 {
            self.buffer[self.buffer_len..].fill(0);
            let block = self.buffer;
            self.compress(&block);
            self.buffer = [0; 64];
            self.buffer_len = 0;
        }
        self.buffer[self.buffer_len..56].fill(0);
        self.buffer[56..64].copy_from_slice(&bit_len.to_be_bytes());
        let block = self.buffer;
        self.compress(&block);
        let mut digest = [0_u8; 32];
        for (chunk, value) in digest.chunks_exact_mut(4).zip(self.state) {
            chunk.copy_from_slice(&value.to_be_bytes());
        }
        digest
    }
}

pub(crate) fn sha256_file(path: &Path) -> std::io::Result<(String, u64)> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count])?;
    }
    let size = file.metadata()?.len();
    let digest = hasher.finalize();
    let hash = digest.iter().map(|byte| format!("{byte:02X}")).collect();
    Ok((hash, size))
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[cfg_attr(test, derive(Serialize))]
#[serde(deny_unknown_fields)]
struct RawReaderDiagnostic {
    code: String,
    message: String,
    source_line_number: Option<u64>,
    context: Option<BTreeMap<String, Value>>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ReaderDiagnostic {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) source_line_number: Option<u64>,
    pub(crate) context: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[cfg_attr(test, derive(Serialize))]
#[serde(deny_unknown_fields)]
struct RawZoneRecord {
    contam_number: i64,
    name: String,
    flags: i64,
    level_number: i64,
    relative_height: f64,
    volume_m3: f64,
    source_line_number: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ZoneRecord {
    zone_id: String,
    contam_number: i64,
    name: String,
    flags: i64,
    level_number: i64,
    relative_height: f64,
    volume_m3: f64,
    source_line_number: u64,
}

impl From<RawZoneRecord> for ZoneRecord {
    fn from(raw: RawZoneRecord) -> Self {
        Self {
            zone_id: String::new(),
            contam_number: raw.contam_number,
            name: raw.name,
            flags: raw.flags,
            level_number: raw.level_number,
            relative_height: raw.relative_height,
            volume_m3: raw.volume_m3,
            source_line_number: raw.source_line_number,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[cfg_attr(test, derive(Serialize))]
#[serde(deny_unknown_fields)]
struct RawProjectInspection {
    schema_version: String,
    reader_mode: String,
    source_path: String,
    source_sha256: String,
    source_size_bytes: u64,
    source_unchanged: bool,
    header_version: String,
    header_variant: i64,
    declared_zone_count: u64,
    zones: Vec<RawZoneRecord>,
    first_zone: Option<RawZoneRecord>,
    diagnostics: Vec<RawReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ProjectInspection {
    schema_version: String,
    reader_mode: String,
    source_path: String,
    source_sha256: String,
    source_size_bytes: u64,
    source_unchanged: bool,
    header_version: String,
    header_variant: i64,
    declared_zone_count: u64,
    zones: Vec<ZoneRecord>,
    first_zone: Option<ZoneRecord>,
    diagnostics: Vec<ReaderDiagnostic>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawReadZonesResult {
    result_type: String,
    project: RawProjectInspection,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawBridgeEnvelope {
    protocol_version: String,
    request_id: String,
    ok: bool,
    result: Option<Value>,
    error: Option<RawReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct BridgeEnvelope {
    protocol_version: String,
    request_id: String,
    ok: bool,
    result: Option<ProjectInspection>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopOpenResponse {
    request_id: String,
    cancelled: bool,
    project_session_id: Option<String>,
    envelope: Option<BridgeEnvelope>,
    draft: Option<DraftSummary>,
}

fn unix_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn zone_uuid(
    baseline_sha256: &str,
    object_type: &str,
    contam_number: i64,
    source_line_number: u64,
    name: &str,
) -> String {
    let identity = format!(
        "{}|{}|{}|{}|{}",
        baseline_sha256.to_ascii_uppercase(),
        object_type,
        contam_number,
        source_line_number,
        name
    );
    Uuid::new_v5(&ZONE_UUID_NAMESPACE, identity.as_bytes()).to_string()
}

fn assign_baseline_zone_ids(zones: &mut [ZoneRecord], baseline_sha256: &str) {
    for zone in zones {
        zone.zone_id = zone_uuid(
            baseline_sha256,
            "zone",
            zone.contam_number,
            zone.source_line_number,
            &zone.name,
        );
    }
}

fn bind_revision_zone_ids(
    project: &mut ProjectInspection,
    baseline_zones: &[ZoneRecord],
) -> Result<(), ReaderDiagnostic> {
    if project.zones.len() != baseline_zones.len() {
        return Err(host_diagnostic(
            "draft_identity_mismatch",
            "Draft Zone identities did not match the baseline.",
            BTreeMap::new(),
        ));
    }
    for zone in &mut project.zones {
        let Some(baseline) = baseline_zones.iter().find(|candidate| {
            candidate.contam_number == zone.contam_number
                && candidate.source_line_number == zone.source_line_number
                && candidate.name == zone.name
        }) else {
            return Err(host_diagnostic(
                "draft_identity_mismatch",
                "Draft Zone identities did not match the baseline.",
                BTreeMap::new(),
            ));
        };
        zone.zone_id = baseline.zone_id.clone();
    }
    project.first_zone = project.zones.first().cloned();
    Ok(())
}

fn safe_project_file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("project.prj")
        .to_string()
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DraftSummary {
    revision_id: String,
    revision_number: u64,
    history_tip: u64,
    dirty: bool,
    exported: bool,
    can_undo: bool,
    can_redo: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PatchTarget {
    contam_number: i64,
    zone_name: String,
    source_line_number: u64,
    field: String,
    token_index: i64,
    byte_start: u64,
    byte_end: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PatchPreconditions {
    source_sha256: String,
    source_size_bytes: u64,
    reader_mode: String,
    header_version: String,
    contam_number: i64,
    source_line_number: u64,
    old_token: String,
    old_value: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PatchReplacement {
    new_token: String,
    new_value: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PatchPreview {
    source_line_number: u64,
    old_token: String,
    new_token: String,
    old_line: String,
    new_line: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct ZoneVolumePatch {
    schema_version: String,
    patch_type: String,
    source_path: String,
    source_sha256: String,
    source_size_bytes: u64,
    reader_mode: String,
    header_version: String,
    target: PatchTarget,
    preconditions: PatchPreconditions,
    replacement: PatchReplacement,
    preview: PatchPreview,
    status: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawPatchPlanResult {
    result_type: String,
    patch: ZoneVolumePatch,
    diff_text: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawPatchApplication {
    schema_version: String,
    patch_type: String,
    status: String,
    source_path: String,
    source_sha256: String,
    source_size_bytes: u64,
    source_unchanged: bool,
    output_path: String,
    output_sha256: String,
    output_size_bytes: u64,
    target: PatchTarget,
    old_token: String,
    new_token: String,
    old_value: f64,
    new_value: f64,
    verification: Vec<String>,
    generated_artifacts: Vec<String>,
    diagnostics: Vec<RawReaderDiagnostic>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawPatchApplicationResult {
    result_type: String,
    application: RawPatchApplication,
    project: RawProjectInspection,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PatchReviewView {
    project_session_id: String,
    patch_id: String,
    zone_id: String,
    zone_number: i64,
    zone_name: String,
    field: String,
    old_token: String,
    new_token: String,
    old_value: f64,
    new_value: f64,
    source_line_number: u64,
    old_line: String,
    new_line: String,
    diff_text: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopPlanResponse {
    request_id: String,
    review: Option<PatchReviewView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopApplyResponse {
    request_id: String,
    cancelled: bool,
    project_session_id: Option<String>,
    project: Option<ProjectInspection>,
    target_zone_number: Option<i64>,
    target_zone_id: Option<String>,
    draft: Option<DraftSummary>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopDraftTransitionResponse {
    request_id: String,
    project_session_id: Option<String>,
    project: Option<ProjectInspection>,
    draft: Option<DraftSummary>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DraftExportSummary {
    file_name: String,
    sha256: String,
    size_bytes: u64,
    zone_count: u64,
    revision_number: u64,
    matches_active_revision: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopDraftExportResponse {
    request_id: String,
    cancelled: bool,
    project_session_id: Option<String>,
    export: Option<DraftExportSummary>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct RawZoneAirStateSample {
    index: u64,
    day_of_year: u64,
    day_type: Option<String>,
    sim_time_seconds: f64,
    temperature_k: f64,
    reference_pressure_pa: f64,
    air_density_kg_m3: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct RawZoneAirStateSourceEvidence {
    relative_path: String,
    sha256: String,
    size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct RawZoneAirStateSeries {
    schema_version: String,
    result_type: String,
    run_id: String,
    extraction_id: String,
    zone_number: i64,
    zone_name: String,
    source_line_number: u64,
    unit_system: String,
    sample_count: u64,
    samples: Vec<RawZoneAirStateSample>,
    source_evidence: RawZoneAirStateSourceEvidence,
    day_type_source: String,
    time_contract: String,
    diagnostics: Vec<RawReaderDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct RawZoneAirStateExtraction {
    result_type: String,
    extraction_id: String,
    status: String,
    run_id: String,
    zone_number: i64,
    zone_name: String,
    sample_count: u64,
    first_sample: RawZoneAirStateSample,
    parsed_result: RawZoneAirStateSeries,
    #[serde(default)]
    result_manifest_path: Option<String>,
    #[serde(default)]
    source_evidence: Option<RawZoneAirStateSourceEvidence>,
    #[serde(default)]
    run_manifest: Option<RawRunManifestEvidence>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ZoneAirStateSampleView {
    index: u64,
    day_of_year: u64,
    day_type: Option<String>,
    sim_time_seconds: f64,
    temperature_k: f64,
    reference_pressure_pa: f64,
    air_density_kg_m3: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ZoneAirStateResultView {
    schema_version: String,
    result_type: String,
    run_id: String,
    extraction_id: String,
    zone_id: String,
    zone_number: i64,
    zone_name: String,
    source_line_number: u64,
    unit_system: String,
    sample_count: u64,
    samples: Vec<ZoneAirStateSampleView>,
    day_type_source: String,
    time_contract: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopZoneAirStateResponse {
    request_id: String,
    cancelled: bool,
    project_session_id: Option<String>,
    result: Option<ZoneAirStateResultView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ZoneAirStateCsvExportSummary {
    file_name: String,
    row_count: u64,
    byte_count: u64,
    run_id: String,
    extraction_id: String,
    zone_id: String,
    zone_number: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopZoneAirStateCsvExportResponse {
    request_id: String,
    cancelled: bool,
    project_session_id: Option<String>,
    export: Option<ZoneAirStateCsvExportSummary>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRunSolver {
    architecture: String,
    name: String,
    path: String,
    provenance: String,
    sha256: String,
    size_bytes: u64,
    version: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRunSource {
    directory_entries_after: Vec<String>,
    directory_entries_before: Vec<String>,
    path: String,
    sha256: String,
    size_bytes: u64,
    unchanged: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRunInputSnapshot {
    classification: String,
    relative_path: String,
    snapshot_sha256: String,
    snapshot_size_bytes: u64,
    source_path: String,
    source_sha256: String,
    source_size_bytes: u64,
    source_unchanged: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRunArtifact {
    classification: String,
    relative_path: String,
    sha256: String,
    size_bytes: u64,
    suffix: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRunStreamEvidence {
    relative_path: String,
    sha256: String,
    size_bytes: u64,
    truncated: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRunCommand {
    arguments: Vec<String>,
    executable: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRunManifest {
    schema_version: String,
    run_id: String,
    status: String,
    execution_mode: String,
    started_at_utc: String,
    ended_at_utc: String,
    duration_ms: u64,
    source: RawRunSource,
    input_snapshots: Vec<RawRunInputSnapshot>,
    solver: RawRunSolver,
    command: RawRunCommand,
    working_directory: String,
    exit_code: Option<i32>,
    timed_out: bool,
    stdout: RawRunStreamEvidence,
    stderr: RawRunStreamEvidence,
    artifacts: Vec<RawRunArtifact>,
    diagnostics: Vec<RawReaderDiagnostic>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct RawRunManifestEvidence {
    path: String,
    sha256: String,
    unchanged: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawContamXRun {
    run_id: String,
    status: String,
    run_directory: String,
    manifest_path: String,
    solver_version: String,
    exit_code: Option<i32>,
    timed_out: bool,
    primary_artifacts: Vec<RawRunArtifact>,
    manifest: RawRunManifest,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawContamXRunResult {
    result_type: String,
    run: RawContamXRun,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ContamXRunSummaryView {
    status: String,
    run_id: String,
    solver_name: String,
    solver_version: String,
    started_at_utc: String,
    duration_ms: u64,
    exit_code: i32,
    timed_out: bool,
    sim_artifact_count: usize,
    source_unchanged: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DesktopRunResponse {
    request_id: String,
    project_session_id: Option<String>,
    summary: Option<ContamXRunSummaryView>,
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct ZoneResultStageEvent {
    request_id: String,
    stage: &'static str,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct ResultExportStageEvent {
    request_id: String,
    stage: &'static str,
}

#[derive(Clone, Debug)]
struct DraftPatchSummary {
    zone_id: String,
    contam_number: i64,
    old_token: String,
    new_token: String,
}

#[derive(Clone, Debug)]
struct DraftRevision {
    revision_id: String,
    revision_number: u64,
    parent_revision_id: Option<String>,
    source_path: PathBuf,
    source_sha256: String,
    source_size_bytes: u64,
    project: ProjectInspection,
    patch: Option<DraftPatchSummary>,
    created_at_unix_ms: u128,
    application_owned: bool,
}

#[derive(Clone, Debug)]
struct ActiveProjectContext {
    project_session_id: String,
    source_path: PathBuf,
    source_sha256: String,
    source_size_bytes: u64,
    reader_mode: String,
    header_version: String,
    zones: Vec<ZoneRecord>,
    baseline_source_path: PathBuf,
    baseline_source_sha256: String,
    baseline_source_size_bytes: u64,
    draft_root: PathBuf,
    revisions: Vec<DraftRevision>,
    revision_cursor: usize,
    exported_revisions: Vec<String>,
}

impl ActiveProjectContext {
    fn active_revision(&self) -> &DraftRevision {
        &self.revisions[self.revision_cursor]
    }

    fn draft_summary(&self) -> DraftSummary {
        let revision = self.active_revision();
        DraftSummary {
            revision_id: revision.revision_id.clone(),
            revision_number: revision.revision_number,
            history_tip: self
                .revisions
                .last()
                .map_or(0, |value| value.revision_number),
            dirty: revision.revision_number > 0,
            exported: self.exported_revisions.contains(&revision.revision_id),
            can_undo: self.revision_cursor > 0,
            can_redo: self.revision_cursor + 1 < self.revisions.len(),
        }
    }

    fn zone_by_id(&self, zone_id: &str) -> Option<&ZoneRecord> {
        self.zones.iter().find(|zone| zone.zone_id == zone_id)
    }

    fn sync_to_revision(&mut self, cursor: usize) {
        let revision = &self.revisions[cursor];
        self.source_path = revision.source_path.clone();
        self.source_sha256 = revision.source_sha256.clone();
        self.source_size_bytes = revision.source_size_bytes;
        self.reader_mode = revision.project.reader_mode.clone();
        self.header_version = revision.project.header_version.clone();
        self.zones = revision.project.zones.clone();
        self.revision_cursor = cursor;
    }
}

#[derive(Clone, Debug)]
struct PlannedPatchContext {
    patch_id: String,
    project_session_id: String,
    patch: ZoneVolumePatch,
    target_zone_number: i64,
    target_zone_id: String,
    new_volume_token: String,
    source_sha256: String,
    revision_id: String,
}

#[derive(Clone, Debug)]
struct ActiveRunContext {
    project_session_id: String,
    source_sha256: String,
    revision_id: String,
    run_id: String,
    manifest_path: PathBuf,
    succeeded: bool,
    summary: ContamXRunSummaryView,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ActiveResultSource {
    ActiveRun,
    SelectedManifest,
}

#[derive(Clone, Debug)]
struct ActiveResultContext {
    project_session_id: String,
    source_sha256: String,
    revision_id: String,
    zone_id: String,
    zone_number: i64,
    zone_name: String,
    source_line_number: u64,
    run_id: String,
    extraction_id: String,
    source: ActiveResultSource,
    result: ZoneAirStateResultView,
    sample_count: u64,
    unit_system: String,
}

impl ActiveResultContext {
    fn new(
        active: &ActiveProjectContext,
        source: ActiveResultSource,
        result: ZoneAirStateResultView,
    ) -> Result<Self, ReaderDiagnostic> {
        let selected = active
            .zones
            .iter()
            .find(|zone| zone.contam_number == result.zone_number);
        if selected.is_none_or(|zone| {
            zone.name != result.zone_name || zone.source_line_number != result.source_line_number
        }) || result.sample_count == 0
            || result.sample_count as usize != result.samples.len()
            || result.unit_system != "SI"
        {
            return Err(host_diagnostic(
                "active_result_identity_mismatch",
                "The verified result could not be bound to the active project.",
                BTreeMap::new(),
            ));
        }
        Ok(Self {
            project_session_id: active.project_session_id.clone(),
            source_sha256: active.source_sha256.clone(),
            revision_id: active.active_revision().revision_id.clone(),
            zone_id: selected.expect("validated Zone").zone_id.clone(),
            zone_number: result.zone_number,
            zone_name: result.zone_name.clone(),
            source_line_number: result.source_line_number,
            run_id: result.run_id.clone(),
            extraction_id: result.extraction_id.clone(),
            source,
            sample_count: result.sample_count,
            unit_system: result.unit_system.clone(),
            result,
        })
    }

    fn validate_export_identity(
        &self,
        active: &ActiveProjectContext,
        zone_id: &str,
        run_id: &str,
        extraction_id: &str,
    ) -> Result<(), ReaderDiagnostic> {
        if self.project_session_id != active.project_session_id
            || self.source_sha256 != active.source_sha256
            || self.revision_id != active.active_revision().revision_id
        {
            return Err(host_diagnostic(
                "active_result_project_mismatch",
                "The active result does not belong to the active project.",
                BTreeMap::new(),
            ));
        }
        let zone = active.zones.iter().find(|zone| zone.zone_id == zone_id);
        if self.zone_id != zone_id
            || zone.is_none_or(|zone| {
                zone.contam_number != self.zone_number
                    || zone.name != self.zone_name
                    || zone.source_line_number != self.source_line_number
            })
        {
            return Err(host_diagnostic(
                "active_result_zone_mismatch",
                "The active result does not belong to the selected Zone.",
                BTreeMap::new(),
            ));
        }
        let source_is_valid = matches!(
            self.source,
            ActiveResultSource::ActiveRun | ActiveResultSource::SelectedManifest
        );
        if !source_is_valid
            || self.run_id != run_id
            || self.extraction_id != extraction_id
            || self.result.run_id != self.run_id
            || self.result.extraction_id != self.extraction_id
            || self.sample_count != self.result.sample_count
            || self.sample_count as usize != self.result.samples.len()
            || self.unit_system != "SI"
            || self.result.unit_system != self.unit_system
        {
            return Err(host_diagnostic(
                "active_result_identity_mismatch",
                "The active result identity did not match the export request.",
                BTreeMap::new(),
            ));
        }
        Ok(())
    }
}

fn active_project_source_matches(active: &ActiveProjectContext) -> bool {
    sha256_file(&active.source_path).is_ok_and(|(sha256, size)| {
        size == active.source_size_bytes && sha256.eq_ignore_ascii_case(&active.source_sha256)
    })
}

impl ActiveRunContext {
    fn is_bound_to(&self, project: &ActiveProjectContext) -> bool {
        self.succeeded
            && self.project_session_id == project.project_session_id
            && self.source_sha256 == project.source_sha256
            && self.revision_id == project.active_revision().revision_id
            && !self.run_id.is_empty()
            && self.manifest_path.is_file()
    }
}

#[derive(Default)]
struct DesktopSessionState {
    active_project: Option<ActiveProjectContext>,
    planned_patch: Option<PlannedPatchContext>,
    active_run: Option<ActiveRunContext>,
    active_result: Option<ActiveResultContext>,
    last_trusted_result: Option<ActiveResultContext>,
}

#[derive(Default)]
pub struct DesktopProjectSessionStore {
    state: Mutex<DesktopSessionState>,
    operation_busy: AtomicBool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct ProjectCloseSnapshot {
    pub(crate) draft_dirty: bool,
    pub(crate) draft_exported: bool,
    pub(crate) patch_review: bool,
    pub(crate) operation_active: bool,
}

struct OperationGuard<'a> {
    busy: &'a AtomicBool,
}

impl Drop for OperationGuard<'_> {
    fn drop(&mut self) {
        self.busy.store(false, Ordering::Release);
    }
}

impl DesktopProjectSessionStore {
    pub(crate) fn close_snapshot(&self) -> ProjectCloseSnapshot {
        let state = self.state.lock().expect("desktop session mutex poisoned");
        let draft = state
            .active_project
            .as_ref()
            .map(ActiveProjectContext::draft_summary);
        ProjectCloseSnapshot {
            draft_dirty: draft.as_ref().is_some_and(|value| value.dirty),
            draft_exported: draft.as_ref().is_some_and(|value| value.exported),
            patch_review: state.planned_patch.is_some(),
            operation_active: self.operation_busy.load(Ordering::Acquire),
        }
    }

    fn try_operation(&self) -> Option<OperationGuard<'_>> {
        self.operation_busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| OperationGuard {
                busy: &self.operation_busy,
            })
    }

    fn activate_project(
        &self,
        project_session_id: String,
        source_path: PathBuf,
        draft_root: PathBuf,
        project: &ProjectInspection,
    ) {
        let baseline_revision_id = zone_uuid(&project.source_sha256, "revision", 0, 0, "baseline");
        let revision = DraftRevision {
            revision_id: baseline_revision_id,
            revision_number: 0,
            parent_revision_id: None,
            source_path: source_path.clone(),
            source_sha256: project.source_sha256.clone(),
            source_size_bytes: project.source_size_bytes,
            project: project.clone(),
            patch: None,
            created_at_unix_ms: unix_time_ms(),
            application_owned: false,
        };
        let context = ActiveProjectContext {
            project_session_id,
            source_path: source_path.clone(),
            source_sha256: project.source_sha256.clone(),
            source_size_bytes: project.source_size_bytes,
            reader_mode: project.reader_mode.clone(),
            header_version: project.header_version.clone(),
            zones: project.zones.clone(),
            baseline_source_path: source_path,
            baseline_source_sha256: project.source_sha256.clone(),
            baseline_source_size_bytes: project.source_size_bytes,
            draft_root,
            revisions: vec![revision],
            revision_cursor: 0,
            exported_revisions: Vec::new(),
        };
        let mut state = self.state.lock().expect("desktop session mutex poisoned");
        let previous = state.active_project.replace(context);
        state.planned_patch = None;
        state.active_run = None;
        state.active_result = None;
        state.last_trusted_result = None;
        drop(state);
        if let Some(previous) = previous {
            let _ = remove_owned_draft_root(&previous);
        }
    }

    fn retain_result(
        &self,
        active: &ActiveProjectContext,
        source: ActiveResultSource,
        result: &ZoneAirStateResultView,
    ) -> Result<(), ReaderDiagnostic> {
        let context = ActiveResultContext::new(active, source, result.clone())?;
        let mut state = self.state.lock().expect("desktop session mutex poisoned");
        let still_active = state.active_project.as_ref().is_some_and(|project| {
            project.project_session_id == active.project_session_id
                && project.source_sha256 == active.source_sha256
                && project.source_path == active.source_path
                && project.active_revision().revision_id == active.active_revision().revision_id
        });
        if !still_active {
            return Err(host_diagnostic(
                "active_result_project_mismatch",
                "The active project changed during result extraction.",
                BTreeMap::new(),
            ));
        }
        state.active_result = Some(context);
        state.last_trusted_result = state.active_result.clone();
        Ok(())
    }

    pub(crate) fn has_last_trusted_result(&self) -> bool {
        self.state
            .lock()
            .expect("desktop session mutex poisoned")
            .last_trusted_result
            .is_some()
    }

    pub(crate) fn build_ai_context(
        &self,
        project_session_id: &str,
        revision_id: &str,
        zone_id: &str,
        scopes: &[String],
    ) -> Result<AiTrustedContext, ReaderDiagnostic> {
        let state = self.state.lock().expect("desktop session mutex poisoned");
        let active = state.active_project.as_ref().ok_or_else(|| {
            host_diagnostic(
                "ai_context_unavailable",
                "No active project is available for AI context.",
                BTreeMap::new(),
            )
        })?;
        if active.project_session_id != project_session_id
            || active.active_revision().revision_id != revision_id
        {
            return Err(host_diagnostic(
                "ai_context_stale",
                "The project revision changed after the AI context request.",
                BTreeMap::new(),
            ));
        }
        let zone = active.zone_by_id(zone_id).ok_or_else(|| {
            host_diagnostic(
                "ai_context_stale",
                "The selected Zone changed after the AI context request.",
                BTreeMap::new(),
            )
        })?;
        let mut payload = serde_json::Map::new();
        for scope in scopes {
            match scope.as_str() {
                "project_summary" => {
                    payload.insert(
                        scope.clone(),
                        json!({
                            "file_name": safe_project_file_name(&active.baseline_source_path),
                            "zone_count": active.zones.len(),
                            "reader_mode": active.reader_mode,
                            "header_version": active.header_version,
                            "revision_number": active.active_revision().revision_number,
                        }),
                    );
                }
                "selected_zone" => {
                    payload.insert(
                        scope.clone(),
                        json!({
                            "zone_id": zone.zone_id,
                            "contam_number": zone.contam_number,
                            "name": zone.name,
                            "flags": zone.flags,
                            "level_number": zone.level_number,
                            "relative_height": zone.relative_height,
                            "volume_m3": zone.volume_m3,
                            "source_line_number": zone.source_line_number,
                            "units": {"relative_height": "m", "volume": "m3"},
                        }),
                    );
                }
                "draft_summary" => {
                    let draft = active.draft_summary();
                    payload.insert(
                        scope.clone(),
                        json!({
                            "revision_number": draft.revision_number,
                            "revision_id": draft.revision_id,
                            "dirty": draft.dirty,
                            "exported": draft.exported,
                            "can_undo": draft.can_undo,
                            "can_redo": draft.can_redo,
                        }),
                    );
                }
                "run_summary" => {
                    let run = state
                        .active_run
                        .as_ref()
                        .filter(|run| run.is_bound_to(active));
                    payload.insert(
                        scope.clone(),
                        match run {
                            Some(run) => json!({
                                "available": true,
                                "run_id": run.run_id,
                                "succeeded": run.succeeded,
                                "solver_name": run.summary.solver_name,
                                "solver_version": run.summary.solver_version,
                                "exit_code": run.summary.exit_code,
                                "timed_out": run.summary.timed_out,
                                "sim_artifact_count": run.summary.sim_artifact_count,
                                "source_unchanged": run.summary.source_unchanged,
                                "duration_ms": run.summary.duration_ms,
                            }),
                            None => json!({"available": false}),
                        },
                    );
                }
                "result_summary" => {
                    let result = state.active_result.as_ref().filter(|result| {
                        result.project_session_id == active.project_session_id
                            && result.revision_id == active.active_revision().revision_id
                            && result.source_sha256 == active.source_sha256
                            && result.zone_id == zone.zone_id
                            && result.sample_count as usize == result.result.samples.len()
                    });
                    payload.insert(
                        scope.clone(),
                        match result {
                            Some(result) => {
                                let first = result.result.samples.first();
                                let last = result.result.samples.last();
                                json!({
                                    "available": true,
                                    "result_type": result.result.result_type,
                                    "zone_id": result.zone_id,
                                    "zone_number": result.zone_number,
                                    "zone_name": result.zone_name,
                                    "run_id": result.run_id,
                                    "extraction_id": result.extraction_id,
                                    "sample_count": result.sample_count,
                                    "unit_system": result.unit_system,
                                    "first_sample": first,
                                    "last_sample": last,
                                    "time_range_seconds": [
                                        first.map(|sample| sample.sim_time_seconds),
                                        last.map(|sample| sample.sim_time_seconds)
                                    ],
                                    "full_series_disclosed": false,
                                    "disclosure_note": "The complete result series was not sent.",
                                })
                            }
                            None => json!({"available": false}),
                        },
                    );
                }
                "diagnostics" => {
                    let diagnostics: Vec<Value> = active
                        .active_revision()
                        .project
                        .diagnostics
                        .iter()
                        .map(|diagnostic| {
                            json!({
                                "code": diagnostic.code,
                                "message": diagnostic.message,
                                "source_line_number": diagnostic.source_line_number,
                            })
                        })
                        .collect();
                    payload.insert(scope.clone(), Value::Array(diagnostics));
                }
                _ => {
                    return Err(host_diagnostic(
                        "ai_context_scope_invalid",
                        "The requested AI context scope is not supported.",
                        BTreeMap::new(),
                    ))
                }
            }
        }
        Ok(AiTrustedContext {
            project_session_id: active.project_session_id.clone(),
            baseline_source_sha256: active.baseline_source_sha256.clone(),
            revision_id: active.active_revision().revision_id.clone(),
            revision_number: active.active_revision().revision_number,
            zone_id: zone.zone_id.clone(),
            zone_name: zone.name.clone(),
            payload: Value::Object(payload),
        })
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct AiTrustedContext {
    pub(crate) project_session_id: String,
    #[serde(skip_serializing)]
    pub(crate) baseline_source_sha256: String,
    pub(crate) revision_id: String,
    pub(crate) revision_number: u64,
    pub(crate) zone_id: String,
    pub(crate) zone_name: String,
    pub(crate) payload: Value,
}

impl Drop for DesktopProjectSessionStore {
    fn drop(&mut self) {
        if let Ok(state) = self.state.get_mut() {
            if let Some(active) = state.active_project.as_ref() {
                let _ = remove_owned_draft_root(active);
            }
        }
    }
}

#[derive(Debug)]
struct Capture {
    bytes: Vec<u8>,
    exceeded: bool,
}

#[derive(Debug)]
struct ProcessOutcome {
    success: bool,
    exit_code: Option<i32>,
    timed_out: bool,
    stdout: Capture,
    stderr: Capture,
}

type HostFailure = (&'static str, &'static str, BTreeMap<String, Value>);

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri must have a repository parent")
        .to_path_buf()
}

fn discover_python(configured: Option<OsString>, root: &Path) -> Result<PathBuf, &'static str> {
    if let Some(value) = configured {
        let candidate = PathBuf::from(value);
        return (candidate.is_absolute() && candidate.is_file())
            .then_some(candidate)
            .ok_or("python_runtime_not_found");
    }
    let candidate = root.join("python/.venv/Scripts/python.exe");
    candidate
        .is_file()
        .then_some(candidate)
        .ok_or("python_runtime_not_found")
}

fn request_id_is_valid(request_id: &str) -> bool {
    !request_id.is_empty()
        && request_id.len() <= 128
        && request_id.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
}

fn diagnostic_code_is_valid(code: &str) -> bool {
    !code.is_empty()
        && code.len() <= MAX_DIAGNOSTIC_CODE_BYTES
        && code
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn context_key_is_allowed(key: &str) -> bool {
    matches!(
        key,
        "byte_offset"
            | "candidate_count"
            | "contam_number"
            | "declared_count"
            | "expected"
            | "exit_code"
            | "field"
            | "field_count"
            | "header_variant"
            | "header_version"
            | "max_bytes"
            | "name_length"
            | "new_token"
            | "old_token"
            | "parsed_count"
            | "token"
            | "zone_number"
    )
}

fn truncate_chars(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

fn sanitize_raw_diagnostic(raw: RawReaderDiagnostic) -> Result<ReaderDiagnostic, ()> {
    if !diagnostic_code_is_valid(&raw.code) {
        return Err(());
    }
    let context = raw
        .context
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(key, value)| {
            if !context_key_is_allowed(&key) {
                return None;
            }
            match value {
                Value::String(value) => Some((
                    key,
                    Value::String(truncate_chars(&value, MAX_CONTEXT_STRING_CHARS)),
                )),
                Value::Number(_) => Some((key, value)),
                _ => None,
            }
        })
        .collect();
    Ok(ReaderDiagnostic {
        code: raw.code,
        message: PYTHON_DIAGNOSTIC_MESSAGE.to_string(),
        source_line_number: raw.source_line_number,
        context,
    })
}

fn host_diagnostic(
    code: &str,
    message: &str,
    context: BTreeMap<String, Value>,
) -> ReaderDiagnostic {
    ReaderDiagnostic {
        code: code.to_string(),
        message: truncate_chars(message, MAX_DIAGNOSTIC_MESSAGE_CHARS),
        source_line_number: None,
        context,
    }
}

fn host_error(request_id: &str, code: &str, message: &str) -> BridgeEnvelope {
    BridgeEnvelope {
        protocol_version: PROTOCOL_VERSION.to_string(),
        request_id: request_id.to_string(),
        ok: false,
        result: None,
        error: Some(host_diagnostic(code, message, BTreeMap::new())),
    }
}

fn canonicalize_selected_path(path: &Path) -> Result<PathBuf, &'static str> {
    if !path.is_file() {
        return Err("selected_path_invalid");
    }
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("prj"))
    {
        return Err("invalid_source_extension");
    }
    let canonical = std::fs::canonicalize(path).map_err(|_| "selected_path_invalid")?;
    if !canonical.is_file() || canonical.to_str().is_none() {
        return Err("selected_path_invalid");
    }
    Ok(canonical)
}

fn projected_canonical_path(path: &Path) -> std::io::Result<PathBuf> {
    let mut existing = path;
    let mut suffix = Vec::new();
    while !existing.exists() {
        let name = existing
            .file_name()
            .ok_or_else(|| std::io::Error::other("path has no existing ancestor"))?;
        suffix.push(name.to_os_string());
        existing = existing
            .parent()
            .ok_or_else(|| std::io::Error::other("path has no existing ancestor"))?;
    }
    let mut projected = std::fs::canonicalize(existing)?;
    for component in suffix.into_iter().rev() {
        projected.push(component);
    }
    Ok(projected)
}

fn create_controlled_draft_root(
    app: &AppHandle,
    project_session_id: &str,
    source_path: &Path,
) -> Result<PathBuf, ReaderDiagnostic> {
    let app_data = app.path().app_local_data_dir().map_err(|_| {
        host_diagnostic(
            "draft_apply_failed",
            "The controlled draft workspace is unavailable.",
            BTreeMap::new(),
        )
    })?;
    let projected_app_data = projected_canonical_path(&app_data).map_err(|_| {
        host_diagnostic(
            "draft_apply_failed",
            "The application data directory is unavailable.",
            BTreeMap::new(),
        )
    })?;
    let source_parent = source_path.parent().ok_or_else(|| {
        host_diagnostic(
            "draft_apply_failed",
            "The source project directory is invalid.",
            BTreeMap::new(),
        )
    })?;
    let projected_base =
        projected_canonical_path(&app_data.join("project-drafts")).map_err(|_| {
            host_diagnostic(
                "draft_apply_failed",
                "The controlled draft workspace is unavailable.",
                BTreeMap::new(),
            )
        })?;
    if projected_app_data == source_parent
        || projected_app_data.starts_with(source_parent)
        || projected_base == source_parent
        || projected_base.starts_with(source_parent)
    {
        return Err(host_diagnostic(
            "draft_apply_failed",
            "The controlled draft workspace conflicts with the source project.",
            BTreeMap::new(),
        ));
    }
    let base = app_data.join("project-drafts");
    std::fs::create_dir_all(&base).map_err(|_| {
        host_diagnostic(
            "draft_apply_failed",
            "The controlled draft workspace could not be created.",
            BTreeMap::new(),
        )
    })?;
    let canonical_base = std::fs::canonicalize(&base).map_err(|_| {
        host_diagnostic(
            "draft_apply_failed",
            "The controlled draft workspace is unavailable.",
            BTreeMap::new(),
        )
    })?;
    if canonical_base == source_parent || canonical_base.starts_with(source_parent) {
        return Err(host_diagnostic(
            "draft_apply_failed",
            "The controlled draft workspace conflicts with the source project.",
            BTreeMap::new(),
        ));
    }
    let session_root = canonical_base.join(project_session_id);
    std::fs::create_dir(&session_root).map_err(|_| {
        host_diagnostic(
            "draft_apply_failed",
            "A fresh draft session workspace could not be created.",
            BTreeMap::new(),
        )
    })?;
    let snapshots = session_root.join("snapshots");
    if let Err(error) = std::fs::create_dir(&snapshots) {
        let _ = std::fs::remove_dir(&session_root);
        return Err(host_diagnostic(
            "draft_apply_failed",
            &format!("The draft snapshot directory could not be created: {error}"),
            BTreeMap::new(),
        ));
    }
    Ok(session_root)
}

fn remove_owned_draft_root(active: &ActiveProjectContext) -> std::io::Result<()> {
    if !active.draft_root.exists() {
        return Ok(());
    }
    let root = std::fs::canonicalize(&active.draft_root)?;
    let source_parent = active
        .baseline_source_path
        .parent()
        .ok_or_else(|| std::io::Error::other("source parent missing"))?;
    if root == source_parent || root.starts_with(source_parent) {
        return Err(std::io::Error::other("draft root conflicts with source"));
    }
    if active.revisions.iter().any(|revision| {
        revision.application_owned
            && std::fs::canonicalize(&revision.source_path)
                .is_ok_and(|path| !path.starts_with(&root))
    }) {
        return Err(std::io::Error::other("draft revision escaped session root"));
    }
    std::fs::remove_dir_all(root)
}

fn read_limited<R: Read>(mut reader: R, limit: usize) -> Capture {
    let mut bytes = Vec::with_capacity(limit.min(8192));
    let mut exceeded = false;
    let mut buffer = [0_u8; 8192];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                let remaining = limit.saturating_sub(bytes.len());
                let accepted = remaining.min(count);
                bytes.extend_from_slice(&buffer[..accepted]);
                exceeded |= accepted < count;
            }
            Err(_) => break,
        }
    }
    Capture { bytes, exceeded }
}

fn wait_with_timeout(
    child: &mut Child,
    timeout: Duration,
) -> std::io::Result<(bool, bool, Option<i32>)> {
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok((status.success(), false, status.code()));
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let status = child.wait()?;
            return Ok((false, true, status.code()));
        }
        thread::sleep(POLL_INTERVAL);
    }
}

fn run_process(
    executable: &Path,
    arguments: &[OsString],
    stdin_bytes: &[u8],
    working_directory: &Path,
    timeout: Duration,
    stdout_limit: usize,
    stderr_limit: usize,
) -> Result<ProcessOutcome, std::io::Error> {
    let mut child = Command::new(executable)
        .args(arguments)
        .current_dir(working_directory)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let stdout_reader = thread::spawn(move || read_limited(stdout, stdout_limit));
    let stderr_reader = thread::spawn(move || read_limited(stderr, stderr_limit));
    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(stdin_bytes).is_err() {
            let _ = child.kill();
        }
    }
    let (success, timed_out, exit_code) = wait_with_timeout(&mut child, timeout)?;
    let stdout = stdout_reader.join().unwrap_or(Capture {
        bytes: Vec::new(),
        exceeded: false,
    });
    let stderr = stderr_reader.join().unwrap_or(Capture {
        bytes: Vec::new(),
        exceeded: false,
    });
    Ok(ProcessOutcome {
        success,
        exit_code,
        timed_out,
        stdout,
        stderr,
    })
}

fn validate_transport(
    outcome: ProcessOutcome,
    request_id: &str,
) -> Result<RawBridgeEnvelope, HostFailure> {
    if outcome.timed_out {
        return Err((
            "python_process_timeout",
            "Python bridge timed out.",
            BTreeMap::new(),
        ));
    }
    if outcome.stdout.exceeded {
        return Err((
            "python_stdout_too_large",
            "Python bridge stdout exceeded its limit.",
            BTreeMap::from([("max_bytes".to_string(), json!(MAX_STDOUT_BYTES))]),
        ));
    }
    if outcome.stderr.exceeded {
        return Err((
            "python_stderr_too_large",
            "Python bridge stderr exceeded its limit.",
            BTreeMap::from([("max_bytes".to_string(), json!(MAX_STDERR_BYTES))]),
        ));
    }
    if !outcome.stderr.bytes.is_empty() {
        return Err((
            "python_stderr_not_empty",
            "Python bridge wrote unexpected stderr.",
            BTreeMap::new(),
        ));
    }
    if !outcome.success {
        let exit_code = outcome
            .exit_code
            .map_or_else(|| "terminated".to_string(), |value| value.to_string());
        return Err((
            "python_process_failed",
            "Python bridge exited without a valid response.",
            BTreeMap::from([("exit_code".to_string(), json!(exit_code))]),
        ));
    }
    let stdout = std::str::from_utf8(&outcome.stdout.bytes).map_err(|_| {
        (
            "python_stdout_invalid_utf8",
            "Python bridge stdout was not UTF-8.",
            BTreeMap::new(),
        )
    })?;
    let envelope: RawBridgeEnvelope = serde_json::from_str(stdout).map_err(|_| {
        (
            "python_response_invalid_json",
            "Python bridge returned invalid JSON.",
            BTreeMap::new(),
        )
    })?;
    if envelope.protocol_version != PROTOCOL_VERSION {
        return Err((
            "python_response_protocol_mismatch",
            "Python bridge protocol mismatch.",
            BTreeMap::new(),
        ));
    }
    if envelope.request_id != request_id {
        return Err((
            "python_response_request_mismatch",
            "Python bridge request mismatch.",
            BTreeMap::new(),
        ));
    }
    if (envelope.ok && (envelope.result.is_none() || envelope.error.is_some()))
        || (!envelope.ok && (envelope.result.is_some() || envelope.error.is_none()))
    {
        return Err((
            "python_response_contract_invalid",
            "Python bridge envelope is invalid.",
            BTreeMap::new(),
        ));
    }
    Ok(envelope)
}

fn execute_bridge_request(
    request: &Value,
    request_id: &str,
    timeout: Duration,
) -> Result<RawBridgeEnvelope, ReaderDiagnostic> {
    let root = project_root();
    let python =
        discover_python(std::env::var_os(PYTHON_ENVIRONMENT_VARIABLE), &root).map_err(|code| {
            host_diagnostic(
                code,
                "The project Python runtime was not found.",
                BTreeMap::new(),
            )
        })?;
    let stdin_bytes = serde_json::to_vec(request).map_err(|_| {
        host_diagnostic(
            "bridge_request_serialization_failed",
            "The bridge request could not be serialized.",
            BTreeMap::new(),
        )
    })?;
    if stdin_bytes.len() > MAX_REQUEST_BYTES {
        return Err(host_diagnostic(
            "bridge_request_too_large",
            "The bridge request exceeded its limit.",
            BTreeMap::new(),
        ));
    }
    let arguments = [
        OsString::from("-I"),
        OsString::from("-m"),
        OsString::from(BRIDGE_MODULE),
    ];
    let outcome = run_process(
        &python,
        &arguments,
        &stdin_bytes,
        &root,
        timeout,
        MAX_STDOUT_BYTES,
        MAX_STDERR_BYTES,
    )
    .map_err(|_| {
        host_diagnostic(
            "python_process_start_failed",
            "The Python bridge could not start.",
            BTreeMap::new(),
        )
    })?;
    validate_transport(outcome, request_id)
        .map_err(|(code, message, context)| host_diagnostic(code, message, context))
}

fn sanitize_python_error(
    envelope: &RawBridgeEnvelope,
) -> Result<ReaderDiagnostic, ReaderDiagnostic> {
    let raw = envelope.error.clone().ok_or_else(|| {
        host_diagnostic(
            "python_response_contract_invalid",
            "Python error response was incomplete.",
            BTreeMap::new(),
        )
    })?;
    sanitize_raw_diagnostic(raw).map_err(|_| {
        host_diagnostic(
            "python_response_diagnostic_invalid",
            "Python diagnostic was invalid.",
            BTreeMap::new(),
        )
    })
}

fn validate_raw_project(
    raw: RawProjectInspection,
    expected_path: &Path,
) -> Result<ProjectInspection, ReaderDiagnostic> {
    let valid = raw.schema_version == RESULT_SCHEMA_VERSION
        && raw.reader_mode == READER_MODE
        && raw.source_unchanged
        && raw.declared_zone_count as usize == raw.zones.len()
        && raw.first_zone.as_ref() == raw.zones.first()
        && raw.source_sha256.len() == 64
        && raw
            .source_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit());
    if !valid {
        return Err(host_diagnostic(
            "python_response_result_invalid",
            "Python project result was invalid.",
            BTreeMap::new(),
        ));
    }
    let returned = std::fs::canonicalize(Path::new(&raw.source_path)).map_err(|_| {
        host_diagnostic(
            "python_response_source_mismatch",
            "Python project path did not match.",
            BTreeMap::new(),
        )
    })?;
    if returned != expected_path {
        return Err(host_diagnostic(
            "python_response_source_mismatch",
            "Python project path did not match.",
            BTreeMap::new(),
        ));
    }
    let diagnostics = raw
        .diagnostics
        .into_iter()
        .map(sanitize_raw_diagnostic)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| {
            host_diagnostic(
                "python_response_diagnostic_invalid",
                "Python diagnostic was invalid.",
                BTreeMap::new(),
            )
        })?;
    let mut zones = raw
        .zones
        .into_iter()
        .map(ZoneRecord::from)
        .collect::<Vec<_>>();
    assign_baseline_zone_ids(&mut zones, &raw.source_sha256);
    let first_zone = zones.first().cloned();
    Ok(ProjectInspection {
        schema_version: raw.schema_version,
        reader_mode: raw.reader_mode,
        source_path: safe_project_file_name(expected_path),
        source_sha256: raw.source_sha256,
        source_size_bytes: raw.source_size_bytes,
        source_unchanged: raw.source_unchanged,
        header_version: raw.header_version,
        header_variant: raw.header_variant,
        declared_zone_count: raw.declared_zone_count,
        zones,
        first_zone,
        diagnostics,
    })
}

fn execute_read(source_path: &Path, request_id: &str) -> BridgeEnvelope {
    let request = json!({
        "protocol_version": PROTOCOL_VERSION,
        "request_id": request_id,
        "operation": READ_OPERATION,
        "source_path": source_path,
    });
    let envelope = match execute_bridge_request(&request, request_id, READ_AND_PLAN_TIMEOUT) {
        Ok(value) => value,
        Err(error) => {
            return BridgeEnvelope {
                protocol_version: PROTOCOL_VERSION.into(),
                request_id: request_id.into(),
                ok: false,
                result: None,
                error: Some(error),
            }
        }
    };
    if !envelope.ok {
        return BridgeEnvelope {
            protocol_version: PROTOCOL_VERSION.into(),
            request_id: request_id.into(),
            ok: false,
            result: None,
            error: Some(sanitize_python_error(&envelope).unwrap_or_else(|error| error)),
        };
    }
    let raw: RawReadZonesResult =
        match serde_json::from_value(envelope.result.expect("validated result")) {
            Ok(value) => value,
            Err(_) => {
                return host_error(
                    request_id,
                    "python_response_result_invalid",
                    "Python read result was invalid.",
                )
            }
        };
    if raw.result_type != "read_zones" {
        return host_error(
            request_id,
            "python_response_result_invalid",
            "Python read result type was invalid.",
        );
    }
    match validate_raw_project(raw.project, source_path) {
        Ok(project) => BridgeEnvelope {
            protocol_version: PROTOCOL_VERSION.into(),
            request_id: request_id.into(),
            ok: true,
            result: Some(project),
            error: None,
        },
        Err(error) => BridgeEnvelope {
            protocol_version: PROTOCOL_VERSION.into(),
            request_id: request_id.into(),
            ok: false,
            result: None,
            error: Some(error),
        },
    }
}

fn validate_plan_result(
    raw: RawPatchPlanResult,
    active: &ActiveProjectContext,
    request_id: &str,
    zone_id: &str,
    contam_number: i64,
    new_volume_token: &str,
) -> Result<(PlannedPatchContext, PatchReviewView), ReaderDiagnostic> {
    let patch = raw.patch;
    let source = std::fs::canonicalize(Path::new(&patch.source_path)).map_err(|_| {
        host_diagnostic(
            "patch_response_source_mismatch",
            "Patch source did not match the active project.",
            BTreeMap::new(),
        )
    })?;
    if source != active.source_path {
        return Err(host_diagnostic(
            "patch_response_source_mismatch",
            "Patch source did not match the active project.",
            BTreeMap::new(),
        ));
    }
    let no_physical_break = |value: &str| !value.contains(['\r', '\n']);
    let contract_valid = raw.result_type == "zone_volume_patch_plan"
        && patch.schema_version == RESULT_SCHEMA_VERSION
        && patch.patch_type == PATCH_TYPE
        && patch.status == "planned"
        && patch.reader_mode == active.reader_mode
        && patch.source_sha256 == active.source_sha256
        && patch.source_size_bytes == active.source_size_bytes
        && patch.header_version == active.header_version
        && patch.target.contam_number == contam_number
        && patch.target.field == PATCH_FIELD
        && patch.target.token_index == VOLUME_TOKEN_INDEX
        && patch.replacement.new_token == new_volume_token
        && patch.preview.old_token == patch.preconditions.old_token
        && patch.preview.new_token == patch.replacement.new_token
        && patch.preview.source_line_number == patch.target.source_line_number
        && no_physical_break(&patch.preview.old_line)
        && no_physical_break(&patch.preview.new_line)
        && patch.preview.old_line.chars().count() <= MAX_PREVIEW_LINE_CHARS
        && patch.preview.new_line.chars().count() <= MAX_PREVIEW_LINE_CHARS
        && raw.diff_text.chars().count() <= MAX_DIFF_CHARS
        && raw.diff_text.lines().count() == 5
        && raw.diff_text.lines().nth(3) == Some(&format!("-{}", patch.preview.old_line))
        && raw.diff_text.lines().nth(4) == Some(&format!("+{}", patch.preview.new_line));
    if !contract_valid {
        return Err(host_diagnostic(
            "patch_response_contract_invalid",
            "Python patch plan result was invalid.",
            BTreeMap::new(),
        ));
    }
    let patch_id = request_id.to_string();
    let review = PatchReviewView {
        project_session_id: active.project_session_id.clone(),
        patch_id: patch_id.clone(),
        zone_id: zone_id.to_string(),
        zone_number: patch.target.contam_number,
        zone_name: patch.target.zone_name.clone(),
        field: patch.target.field.clone(),
        old_token: patch.preconditions.old_token.clone(),
        new_token: patch.replacement.new_token.clone(),
        old_value: patch.preconditions.old_value,
        new_value: patch.replacement.new_value,
        source_line_number: patch.target.source_line_number,
        old_line: patch.preview.old_line.clone(),
        new_line: patch.preview.new_line.clone(),
        diff_text: raw.diff_text,
    };
    let context = PlannedPatchContext {
        patch_id,
        project_session_id: active.project_session_id.clone(),
        target_zone_number: patch.target.contam_number,
        target_zone_id: zone_id.to_string(),
        new_volume_token: patch.replacement.new_token.clone(),
        source_sha256: patch.source_sha256.clone(),
        revision_id: active.active_revision().revision_id.clone(),
        patch,
    };
    Ok((context, review))
}

fn validate_application_result(
    raw: RawPatchApplicationResult,
    active: &ActiveProjectContext,
    planned: &PlannedPatchContext,
    output: &Path,
) -> Result<ProjectInspection, ReaderDiagnostic> {
    let application = raw.application;
    let returned_source =
        std::fs::canonicalize(Path::new(&application.source_path)).map_err(|_| {
            host_diagnostic(
                "patch_apply_response_invalid",
                "Patch application source was invalid.",
                BTreeMap::new(),
            )
        })?;
    let returned_output =
        std::fs::canonicalize(Path::new(&application.output_path)).map_err(|_| {
            host_diagnostic(
                "patch_apply_response_invalid",
                "Patch application output was invalid.",
                BTreeMap::new(),
            )
        })?;
    let required_verification = [
        "source_snapshot_unchanged",
        "single_token_byte_replacement_verified",
        "strict_zone_reread_verified",
        "parsed_zone_fields_verified",
    ];
    let contract_valid = raw.result_type == "zone_volume_patch_application"
        && application.schema_version == RESULT_SCHEMA_VERSION
        && application.patch_type == PATCH_TYPE
        && application.status == "applied"
        && returned_source == active.source_path
        && returned_output == output
        && application.source_sha256 == active.source_sha256
        && application.source_size_bytes == active.source_size_bytes
        && application.source_unchanged
        && application.output_sha256.len() == 64
        && application
            .output_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        && application.target == planned.patch.target
        && application.old_token == planned.patch.preconditions.old_token
        && application.new_token == planned.patch.replacement.new_token
        && application.old_value == planned.patch.preconditions.old_value
        && application.new_value == planned.patch.replacement.new_value
        && application.generated_artifacts.is_empty()
        && required_verification
            .iter()
            .all(|item| application.verification.iter().any(|value| value == item));
    if !contract_valid {
        return Err(host_diagnostic(
            "patch_apply_response_invalid",
            "Python patch application result was invalid.",
            BTreeMap::new(),
        ));
    }
    for diagnostic in application.diagnostics {
        sanitize_raw_diagnostic(diagnostic).map_err(|_| {
            host_diagnostic(
                "python_response_diagnostic_invalid",
                "Python diagnostic was invalid.",
                BTreeMap::new(),
            )
        })?;
    }
    let mut project = validate_raw_project(raw.project, output)?;
    bind_revision_zone_ids(&mut project, &active.revisions[0].project.zones)?;
    let target = project
        .zones
        .iter()
        .find(|zone| zone.contam_number == planned.target_zone_number);
    if project.source_sha256 != application.output_sha256
        || project.source_size_bytes != application.output_size_bytes
        || target.map(|zone| zone.volume_m3) != Some(planned.patch.replacement.new_value)
    {
        return Err(host_diagnostic(
            "patch_apply_response_invalid",
            "New project did not match the applied patch.",
            BTreeMap::new(),
        ));
    }
    validate_revision_delta(active, &project, planned)?;
    Ok(project)
}

fn validate_revision_delta(
    active: &ActiveProjectContext,
    project: &ProjectInspection,
    planned: &PlannedPatchContext,
) -> Result<(), ReaderDiagnostic> {
    if active.zones.len() != project.zones.len()
        || active.reader_mode != project.reader_mode
        || active.header_version != project.header_version
    {
        return Err(host_diagnostic(
            "draft_identity_mismatch",
            "The draft revision did not preserve the active project contract.",
            BTreeMap::new(),
        ));
    }
    for before in &active.zones {
        let Some(after) = project
            .zones
            .iter()
            .find(|zone| zone.zone_id == before.zone_id)
        else {
            return Err(host_diagnostic(
                "draft_identity_mismatch",
                "The draft revision did not preserve Zone identities.",
                BTreeMap::new(),
            ));
        };
        let identity_unchanged = before.contam_number == after.contam_number
            && before.name == after.name
            && before.flags == after.flags
            && before.level_number == after.level_number
            && before.relative_height == after.relative_height
            && before.source_line_number == after.source_line_number;
        let volume_valid = if before.zone_id == planned.target_zone_id {
            after.volume_m3 == planned.patch.replacement.new_value
                && after.volume_m3 != before.volume_m3
        } else {
            after.volume_m3 == before.volume_m3
        };
        if !identity_unchanged || !volume_valid {
            return Err(host_diagnostic(
                "draft_identity_mismatch",
                "The draft revision changed data outside the approved Zone volume.",
                BTreeMap::new(),
            ));
        }
    }
    Ok(())
}

impl DesktopOpenResponse {
    fn cancelled(request_id: &str) -> Self {
        Self {
            request_id: request_id.into(),
            cancelled: true,
            project_session_id: None,
            envelope: None,
            draft: None,
        }
    }
}

fn plan_failure(request_id: &str, error: ReaderDiagnostic) -> DesktopPlanResponse {
    DesktopPlanResponse {
        request_id: request_id.into(),
        review: None,
        error: Some(error),
    }
}

fn apply_failure(request_id: &str, error: ReaderDiagnostic) -> DesktopApplyResponse {
    DesktopApplyResponse {
        request_id: request_id.into(),
        cancelled: false,
        project_session_id: None,
        project: None,
        target_zone_number: None,
        target_zone_id: None,
        draft: None,
        error: Some(error),
    }
}

fn canonicalize_manifest_path(path: &Path) -> Result<PathBuf, &'static str> {
    if !path.is_file()
        || !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("json"))
    {
        return Err("result_manifest_invalid");
    }
    let canonical = std::fs::canonicalize(path).map_err(|_| "result_manifest_not_found")?;
    if !canonical.is_file() || canonical.to_str().is_none() {
        return Err("result_manifest_invalid");
    }
    Ok(canonical)
}

fn result_failure(request_id: &str, error: ReaderDiagnostic) -> DesktopZoneAirStateResponse {
    DesktopZoneAirStateResponse {
        request_id: request_id.into(),
        cancelled: false,
        project_session_id: None,
        result: None,
        error: Some(error),
    }
}

fn export_failure(
    request_id: &str,
    error: ReaderDiagnostic,
) -> DesktopZoneAirStateCsvExportResponse {
    DesktopZoneAirStateCsvExportResponse {
        request_id: request_id.into(),
        cancelled: false,
        project_session_id: None,
        export: None,
        error: Some(error),
    }
}

fn csv_formula_safe(value: &str) -> String {
    if value
        .as_bytes()
        .first()
        .is_some_and(|byte| matches!(byte, b'=' | b'+' | b'-' | b'@' | b'\t' | b'\r'))
    {
        format!("'{value}")
    } else {
        value.to_string()
    }
}

fn csv_text(value: &str) -> String {
    let protected = csv_formula_safe(value);
    if protected
        .bytes()
        .any(|byte| matches!(byte, b',' | b'"' | b'\r' | b'\n'))
    {
        format!("\"{}\"", protected.replace('"', "\"\""))
    } else {
        protected
    }
}

fn encode_zone_air_state_csv(context: &ActiveResultContext) -> Vec<u8> {
    const HEADER: &str = "run_id,extraction_id,zone_number,zone_name,source_line_number,unit_system,sample_index,day_of_year,day_type,sim_time_seconds,temperature_k,reference_pressure_pa,air_density_kg_m3\r\n";
    let mut csv = String::with_capacity(HEADER.len() + context.result.samples.len() * 160);
    csv.push_str(HEADER);
    let run_id = csv_text(&context.run_id);
    let extraction_id = csv_text(&context.extraction_id);
    let zone_name = csv_text(&context.zone_name);
    let unit_system = csv_text(&context.unit_system);
    for sample in &context.result.samples {
        let day_type = sample.day_type.as_deref().map(csv_text).unwrap_or_default();
        let zone_number = context.zone_number.to_string();
        let source_line_number = context.source_line_number.to_string();
        let sample_index = sample.index.to_string();
        let day_of_year = sample.day_of_year.to_string();
        let sim_time_seconds = sample.sim_time_seconds.to_string();
        let temperature_k = sample.temperature_k.to_string();
        let reference_pressure_pa = sample.reference_pressure_pa.to_string();
        let air_density_kg_m3 = sample.air_density_kg_m3.to_string();
        let fields = [
            run_id.as_str(),
            extraction_id.as_str(),
            zone_number.as_str(),
            zone_name.as_str(),
            source_line_number.as_str(),
            unit_system.as_str(),
            sample_index.as_str(),
            day_of_year.as_str(),
            day_type.as_str(),
            sim_time_seconds.as_str(),
            temperature_k.as_str(),
            reference_pressure_pa.as_str(),
            air_density_kg_m3.as_str(),
        ];
        csv.push_str(&fields.join(","));
        csv.push_str("\r\n");
    }
    csv.into_bytes()
}

fn validate_csv_destination(source: &Path, selected: &Path) -> Result<PathBuf, &'static str> {
    if selected.exists() && std::fs::canonicalize(selected).ok().as_deref() == Some(source) {
        return Err("export_destination_conflicts_with_source");
    }
    let mut candidate = selected.to_path_buf();
    match candidate.extension().and_then(|value| value.to_str()) {
        None => {
            candidate.set_extension("csv");
        }
        Some(extension) if extension.eq_ignore_ascii_case("csv") => {}
        _ => return Err("export_destination_invalid"),
    }
    if candidate.exists() {
        return Err("export_destination_exists");
    }
    let file_name = candidate
        .file_name()
        .filter(|value| !value.is_empty())
        .ok_or("export_destination_invalid")?;
    let parent = candidate.parent().ok_or("export_destination_invalid")?;
    let canonical_parent =
        std::fs::canonicalize(parent).map_err(|_| "export_destination_invalid")?;
    if !canonical_parent.is_dir() {
        return Err("export_destination_invalid");
    }
    let output = canonical_parent.join(file_name);
    if output.to_str().is_none() || output == source {
        return Err("export_destination_conflicts_with_source");
    }
    Ok(output)
}

fn create_csv_temporary_file(output: &Path) -> Result<(PathBuf, File), &'static str> {
    let parent = output.parent().ok_or("export_destination_invalid")?;
    let file_name = output
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("export_destination_invalid")?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    for attempt in 0..16_u8 {
        let temporary = parent.join(format!(
            ".{file_name}.{}.{}.{}.tmp",
            std::process::id(),
            nonce,
            attempt
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => return Ok((temporary, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("export_temporary_write_failed"),
        }
    }
    Err("export_temporary_write_failed")
}

fn write_csv_atomically(output: &Path, bytes: &[u8]) -> Result<u64, &'static str> {
    write_csv_atomically_with_steps(
        output,
        bytes,
        |file, bytes| {
            file.write_all(bytes)?;
            file.flush()?;
            file.sync_all()
        },
        |temporary, output| std::fs::rename(temporary, output),
    )
}

fn write_csv_atomically_with_steps<WriteStep, CommitStep>(
    output: &Path,
    bytes: &[u8],
    write_step: WriteStep,
    commit_step: CommitStep,
) -> Result<u64, &'static str>
where
    WriteStep: FnOnce(&mut File, &[u8]) -> std::io::Result<()>,
    CommitStep: FnOnce(&Path, &Path) -> std::io::Result<()>,
{
    if output.exists() {
        return Err("export_destination_exists");
    }
    let (temporary, mut file) = create_csv_temporary_file(output)?;
    let write_result = write_step(&mut file, bytes);
    drop(file);
    if write_result.is_err() {
        let _ = std::fs::remove_file(&temporary);
        return Err("export_temporary_write_failed");
    }
    if output.exists() {
        let _ = std::fs::remove_file(&temporary);
        return Err("export_destination_exists");
    }
    if commit_step(&temporary, output).is_err() {
        let _ = std::fs::remove_file(&temporary);
        return Err("export_atomic_commit_failed");
    }
    let actual = match std::fs::metadata(output) {
        Ok(metadata) => metadata.len(),
        Err(_) => {
            let _ = std::fs::remove_file(output);
            return Err("export_verification_failed");
        }
    };
    if actual != bytes.len() as u64 {
        let _ = std::fs::remove_file(output);
        return Err("export_verification_failed");
    }
    Ok(actual)
}

fn run_failure(request_id: &str, error: ReaderDiagnostic) -> DesktopRunResponse {
    DesktopRunResponse {
        request_id: request_id.into(),
        project_session_id: None,
        summary: None,
        error: Some(error),
    }
}

fn safe_run_relative_path(value: &str) -> bool {
    let path = Path::new(value);
    !value.is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn safe_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn raw_run_stream_is_valid(stream: &RawRunStreamEvidence) -> bool {
    safe_run_relative_path(&stream.relative_path)
        && safe_sha256(&stream.sha256)
        && stream.size_bytes <= MAX_STDOUT_BYTES.max(MAX_STDERR_BYTES) as u64
        && !stream.truncated
}

fn raw_run_artifact_is_valid(artifact: &RawRunArtifact) -> bool {
    safe_run_relative_path(&artifact.relative_path)
        && safe_sha256(&artifact.sha256)
        && artifact.size_bytes > 0
}

fn raw_zone_air_state_source_evidence_is_valid(evidence: &RawZoneAirStateSourceEvidence) -> bool {
    safe_run_relative_path(&evidence.relative_path)
        && safe_sha256(&evidence.sha256)
        && evidence.size_bytes > 0
}

fn run_id_is_valid(run_id: &str) -> bool {
    !run_id.is_empty()
        && run_id.len() <= 80
        && run_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn validate_contamx_run_result(
    raw: RawContamXRunResult,
    active: &ActiveProjectContext,
    run_root: &Path,
) -> Result<(ContamXRunSummaryView, ActiveRunContext), ReaderDiagnostic> {
    let run = raw.run;
    let manifest = &run.manifest;
    let run_id_valid = run_id_is_valid(&run.run_id);
    let primary_valid = !run.primary_artifacts.is_empty()
        && run.primary_artifacts.len() <= 64
        && run.primary_artifacts.iter().all(|artifact| {
            artifact.suffix.eq_ignore_ascii_case(".sim")
                && artifact.classification == "simulation_result"
                && raw_run_artifact_is_valid(artifact)
        });
    let manifest_sim_count = manifest
        .artifacts
        .iter()
        .filter(|artifact| {
            artifact.suffix.eq_ignore_ascii_case(".sim")
                && artifact.classification == "simulation_result"
                && raw_run_artifact_is_valid(artifact)
        })
        .count();
    let source = &manifest.source;
    let solver = &manifest.solver;
    let snapshots_valid = !manifest.input_snapshots.is_empty()
        && manifest.input_snapshots.len() <= 256
        && manifest.input_snapshots.iter().all(|snapshot| {
            snapshot.classification == "input_snapshot"
                && safe_run_relative_path(&snapshot.relative_path)
                && !snapshot.source_path.is_empty()
                && snapshot
                    .source_sha256
                    .eq_ignore_ascii_case(&active.source_sha256)
                && snapshot
                    .snapshot_sha256
                    .eq_ignore_ascii_case(&active.source_sha256)
                && snapshot.source_size_bytes == active.source_size_bytes
                && snapshot.snapshot_size_bytes == active.source_size_bytes
                && snapshot.source_unchanged
        });
    let source_evidence_valid = !source.path.is_empty()
        && source.size_bytes == active.source_size_bytes
        && source.directory_entries_before.len() <= 4096
        && source.directory_entries_after.len() <= 4096;
    let solver_evidence_valid = solver.architecture == "windows-x64"
        && !solver.path.is_empty()
        && !solver.provenance.is_empty()
        && safe_sha256(&solver.sha256)
        && solver.size_bytes > 0;
    let contract_valid = raw.result_type == "contamx_run"
        && run_id_valid
        && run.status == "succeeded"
        && run.run_id == manifest.run_id
        && run.solver_version == "3.4.0.3"
        && run.exit_code == Some(0)
        && !run.timed_out
        && manifest.schema_version == RESULT_SCHEMA_VERSION
        && manifest.status == "succeeded"
        && manifest.execution_mode == "isolated_contamx_process"
        && source.sha256.eq_ignore_ascii_case(&active.source_sha256)
        && source.unchanged
        && source_evidence_valid
        && solver.name.eq_ignore_ascii_case("contamx3.exe")
        && solver.version == "3.4.0.3"
        && solver_evidence_valid
        && manifest.command.executable == solver.name
        && !manifest.command.arguments.is_empty()
        && manifest.command.arguments.len() <= 16
        && manifest.working_directory == "workspace"
        && snapshots_valid
        && raw_run_stream_is_valid(&manifest.stdout)
        && raw_run_stream_is_valid(&manifest.stderr)
        && manifest.exit_code == Some(0)
        && !manifest.timed_out
        && manifest.diagnostics.is_empty()
        && manifest.artifacts.len() <= 256
        && manifest.artifacts.iter().all(raw_run_artifact_is_valid)
        && primary_valid
        && manifest_sim_count == run.primary_artifacts.len()
        && !manifest.started_at_utc.is_empty()
        && manifest.started_at_utc.len() <= 64
        && !manifest.ended_at_utc.is_empty()
        && manifest.ended_at_utc.len() <= 64
        && manifest.duration_ms <= 120_000;
    if !contract_valid {
        return Err(host_diagnostic(
            "run_response_contract_invalid",
            "The ContamX run response was invalid.",
            BTreeMap::new(),
        ));
    }
    let root = std::fs::canonicalize(run_root).map_err(|_| {
        host_diagnostic(
            "run_response_path_invalid",
            "The run workspace path was invalid.",
            BTreeMap::new(),
        )
    })?;
    let expected_run = std::fs::canonicalize(root.join(&run.run_id)).map_err(|_| {
        host_diagnostic(
            "run_response_path_invalid",
            "The run workspace path was invalid.",
            BTreeMap::new(),
        )
    })?;
    let returned_run = std::fs::canonicalize(Path::new(&run.run_directory)).map_err(|_| {
        host_diagnostic(
            "run_response_path_invalid",
            "The run workspace path was invalid.",
            BTreeMap::new(),
        )
    })?;
    let manifest_path = std::fs::canonicalize(Path::new(&run.manifest_path)).map_err(|_| {
        host_diagnostic(
            "run_response_path_invalid",
            "The run manifest path was invalid.",
            BTreeMap::new(),
        )
    })?;
    if expected_run != returned_run
        || manifest_path != expected_run.join("evidence").join("manifest.json")
        || !manifest_path.is_file()
    {
        return Err(host_diagnostic(
            "run_response_path_invalid",
            "The run evidence escaped the controlled workspace.",
            BTreeMap::new(),
        ));
    }
    let summary = ContamXRunSummaryView {
        status: "succeeded".into(),
        run_id: run.run_id.clone(),
        solver_name: manifest.solver.name.clone(),
        solver_version: manifest.solver.version.clone(),
        started_at_utc: manifest.started_at_utc.clone(),
        duration_ms: manifest.duration_ms,
        exit_code: 0,
        timed_out: false,
        sim_artifact_count: run.primary_artifacts.len(),
        source_unchanged: true,
    };
    let context = ActiveRunContext {
        project_session_id: active.project_session_id.clone(),
        source_sha256: active.source_sha256.clone(),
        revision_id: active.active_revision().revision_id.clone(),
        run_id: run.run_id,
        manifest_path,
        succeeded: true,
        summary: summary.clone(),
    };
    Ok((summary, context))
}

fn validate_zone_air_state_result(
    raw: RawZoneAirStateExtraction,
    active: &ActiveProjectContext,
    zone_number: i64,
    expected_run_id: Option<&str>,
) -> Result<ZoneAirStateResultView, ReaderDiagnostic> {
    let selected = active
        .zones
        .iter()
        .find(|zone| zone.contam_number == zone_number);
    let Some(selected) = selected else {
        return Err(host_diagnostic(
            "result_zone_mismatch",
            "The result Zone did not match the active project.",
            BTreeMap::new(),
        ));
    };
    let optional_manifest_evidence_valid = raw
        .result_manifest_path
        .as_ref()
        .is_none_or(|path| !path.is_empty())
        && raw
            .source_evidence
            .as_ref()
            .is_none_or(raw_zone_air_state_source_evidence_is_valid)
        && raw.run_manifest.as_ref().is_none_or(|manifest| {
            !manifest.path.is_empty() && safe_sha256(&manifest.sha256) && manifest.unchanged
        });
    let valid = raw.result_type == "zone_air_state_extraction"
        && raw.status == "succeeded"
        && raw.zone_number == zone_number
        && raw.zone_name == selected.name
        && raw.zone_name.len() <= 120
        && !raw.run_id.is_empty()
        && raw.run_id.len() <= 128
        && !raw.extraction_id.is_empty()
        && raw.extraction_id.len() <= 128
        && raw.sample_count > 0
        && raw.sample_count as usize == raw.parsed_result.samples.len()
        && raw.sample_count == raw.parsed_result.sample_count
        && raw.parsed_result.schema_version == RESULT_SCHEMA_VERSION
        && raw.parsed_result.result_type == "zone_air_state"
        && raw.parsed_result.run_id == raw.run_id
        && raw.parsed_result.extraction_id == raw.extraction_id
        && raw.parsed_result.zone_number == zone_number
        && raw.parsed_result.zone_name == selected.name
        && raw.parsed_result.source_line_number == selected.source_line_number
        && raw.parsed_result.unit_system == "SI"
        && raw.parsed_result.day_type_source == "not_available_in_simread_nfr_v1"
        && raw.parsed_result.time_contract == "elapsed_seconds_from_first_sample"
        && raw_zone_air_state_source_evidence_is_valid(&raw.parsed_result.source_evidence)
        && optional_manifest_evidence_valid
        && raw.first_sample == raw.parsed_result.samples[0];
    if expected_run_id.is_some_and(|run_id| raw.run_id != run_id) {
        return Err(host_diagnostic(
            "active_run_result_mismatch",
            "The extracted result did not match the active run.",
            BTreeMap::new(),
        ));
    }
    if !valid || raw.sample_count > 100_000 {
        return Err(host_diagnostic(
            "python_response_result_invalid",
            "Python Zone air-state result was invalid.",
            BTreeMap::new(),
        ));
    }
    let mut previous_time = None;
    let mut samples = Vec::with_capacity(raw.parsed_result.samples.len());
    for sample in raw.parsed_result.samples {
        if sample.day_type.is_some()
            || !sample.sim_time_seconds.is_finite()
            || !sample.temperature_k.is_finite()
            || !sample.reference_pressure_pa.is_finite()
            || !sample.air_density_kg_m3.is_finite()
            || previous_time.is_some_and(|value| sample.sim_time_seconds < value)
        {
            return Err(host_diagnostic(
                "python_response_result_invalid",
                "Python Zone air-state samples were invalid.",
                BTreeMap::new(),
            ));
        }
        previous_time = Some(sample.sim_time_seconds);
        samples.push(ZoneAirStateSampleView {
            index: sample.index,
            day_of_year: sample.day_of_year,
            day_type: None,
            sim_time_seconds: sample.sim_time_seconds,
            temperature_k: sample.temperature_k,
            reference_pressure_pa: sample.reference_pressure_pa,
            air_density_kg_m3: sample.air_density_kg_m3,
        });
    }
    Ok(ZoneAirStateResultView {
        schema_version: raw.parsed_result.schema_version,
        result_type: raw.parsed_result.result_type,
        run_id: raw.run_id,
        extraction_id: raw.extraction_id,
        zone_id: selected.zone_id.clone(),
        zone_number,
        zone_name: selected.name.clone(),
        source_line_number: selected.source_line_number,
        unit_system: raw.parsed_result.unit_system,
        sample_count: raw.sample_count,
        samples,
        day_type_source: raw.parsed_result.day_type_source,
        time_contract: raw.parsed_result.time_contract,
    })
}

fn validate_active_run_context(
    active_run: &ActiveRunContext,
    active: &ActiveProjectContext,
    run_root: &Path,
) -> Result<PathBuf, ReaderDiagnostic> {
    if active_run.project_session_id != active.project_session_id
        || active_run.source_sha256 != active.source_sha256
    {
        return Err(host_diagnostic(
            "active_run_project_mismatch",
            "The active run does not belong to the current project.",
            BTreeMap::new(),
        ));
    }
    if !active_run.succeeded || !run_id_is_valid(&active_run.run_id) {
        return Err(host_diagnostic(
            "active_run_invalid",
            "The active run context is invalid.",
            BTreeMap::new(),
        ));
    }
    let root = std::fs::canonicalize(run_root).map_err(|_| {
        host_diagnostic(
            "active_run_invalid",
            "The controlled run root is unavailable.",
            BTreeMap::new(),
        )
    })?;
    let expected_manifest = root
        .join(&active_run.run_id)
        .join("evidence")
        .join("manifest.json");
    let manifest = std::fs::canonicalize(&active_run.manifest_path).map_err(|_| {
        host_diagnostic(
            "active_run_invalid",
            "The active run manifest is unavailable.",
            BTreeMap::new(),
        )
    })?;
    if !manifest.is_file() || manifest != expected_manifest {
        return Err(host_diagnostic(
            "active_run_invalid",
            "The active run manifest escaped the controlled workspace.",
            BTreeMap::new(),
        ));
    }
    Ok(manifest)
}

async fn extract_zone_air_state_with_manifest(
    app: &AppHandle,
    request_id: &str,
    active: &ActiveProjectContext,
    zone_number: i64,
    manifest_path: PathBuf,
    expected_run_id: Option<&str>,
) -> Result<ZoneAirStateResultView, ReaderDiagnostic> {
    let result_root = app
        .path()
        .app_local_data_dir()
        .map(|path| path.join("result-extractions"))
        .map_err(|_| {
            host_diagnostic(
                "result_root_invalid",
                "The application result workspace is unavailable.",
                BTreeMap::new(),
            )
        })?;
    let request = json!({
        "protocol_version": PROTOCOL_VERSION,
        "request_id": request_id,
        "operation": EXTRACT_ZONE_AIR_STATE_OPERATION,
        "manifest_path": manifest_path,
        "source_path": active.source_path,
        "source_sha256": active.source_sha256,
        "result_root": result_root,
        "zone_number": zone_number,
    });
    let bridge_id = request_id.to_owned();
    let raw = tauri::async_runtime::spawn_blocking(move || {
        execute_bridge_request(&request, &bridge_id, EXTRACT_TIMEOUT)
    })
    .await
    .map_err(|_| {
        host_diagnostic(
            "bridge_task_failed",
            "The Zone result task ended unexpectedly.",
            BTreeMap::new(),
        )
    })??;
    if !raw.ok {
        return Err(sanitize_python_error(&raw).unwrap_or_else(|error| error));
    }
    let extraction: RawZoneAirStateExtraction =
        serde_json::from_value(raw.result.expect("validated result")).map_err(|_| {
            host_diagnostic(
                "python_response_result_invalid",
                "Python Zone air-state result was invalid.",
                BTreeMap::new(),
            )
        })?;
    validate_zone_air_state_result(extraction, active, zone_number, expected_run_id)
}

#[tauri::command]
pub async fn select_and_read_prj_zones(app: AppHandle, request_id: String) -> DesktopOpenResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id) || Uuid::parse_str(&request_id).is_err() {
        return DesktopOpenResponse {
            request_id: String::new(),
            cancelled: false,
            project_session_id: None,
            envelope: Some(host_error(
                "",
                "bridge_request_invalid",
                "request_id is invalid.",
            )),
            draft: None,
        };
    }
    let Some(_operation) = store.try_operation() else {
        return DesktopOpenResponse {
            request_id: request_id.clone(),
            cancelled: false,
            project_session_id: None,
            envelope: Some(host_error(
                &request_id,
                "project_operation_busy",
                "Another project operation is in progress.",
            )),
            draft: None,
        };
    };
    let dialog_app = app.clone();
    let selected = match tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .add_filter("CONTAM PRJ", &["prj"])
            .blocking_pick_file()
    })
    .await
    {
        Ok(selected) => selected,
        Err(_) => {
            return DesktopOpenResponse {
                request_id: request_id.clone(),
                cancelled: false,
                project_session_id: None,
                envelope: Some(host_error(
                    &request_id,
                    "desktop_dialog_failed",
                    "The native open dialog failed.",
                )),
                draft: None,
            }
        }
    };
    let Some(selected) = selected else {
        return DesktopOpenResponse::cancelled(&request_id);
    };
    let selected_path = match selected.into_path() {
        Ok(path) => path,
        Err(_) => {
            return DesktopOpenResponse {
                request_id: request_id.clone(),
                cancelled: false,
                project_session_id: None,
                envelope: Some(host_error(
                    &request_id,
                    "selected_path_invalid",
                    "The selected item was not a local path.",
                )),
                draft: None,
            }
        }
    };
    let canonical_path = match canonicalize_selected_path(&selected_path) {
        Ok(path) => path,
        Err(code) => {
            return DesktopOpenResponse {
                request_id: request_id.clone(),
                cancelled: false,
                project_session_id: None,
                envelope: Some(host_error(
                    &request_id,
                    code,
                    "The selected item was not a supported PRJ.",
                )),
                draft: None,
            }
        }
    };
    let bridge_id = request_id.clone();
    let source = canonical_path.clone();
    let mut envelope =
        tauri::async_runtime::spawn_blocking(move || execute_read(&source, &bridge_id))
            .await
            .unwrap_or_else(|_| {
                host_error(
                    &request_id,
                    "bridge_task_failed",
                    "The read task ended unexpectedly.",
                )
            });
    let mut project_session_id = None;
    let mut draft = None;
    if let Some(project) = envelope.result.clone() {
        match create_controlled_draft_root(&app, &request_id, &canonical_path) {
            Ok(draft_root) => {
                store.activate_project(request_id.clone(), canonical_path, draft_root, &project);
                project_session_id = Some(request_id.clone());
                draft = Some(DraftSummary {
                    revision_id: zone_uuid(&project.source_sha256, "revision", 0, 0, "baseline"),
                    revision_number: 0,
                    history_tip: 0,
                    dirty: false,
                    exported: false,
                    can_undo: false,
                    can_redo: false,
                });
            }
            Err(error) => {
                envelope = BridgeEnvelope {
                    protocol_version: PROTOCOL_VERSION.into(),
                    request_id: request_id.clone(),
                    ok: false,
                    result: None,
                    error: Some(error),
                };
            }
        }
    }
    if project_session_id.is_some() {
        app.state::<crate::codex_app_server::CodexAssistantStore>()
            .invalidate_context();
    }
    DesktopOpenResponse {
        request_id,
        cancelled: false,
        project_session_id,
        envelope: Some(envelope),
        draft,
    }
}

#[tauri::command]
pub async fn select_and_extract_zone_air_state(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    zone_id: String,
) -> DesktopZoneAirStateResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || Uuid::parse_str(&zone_id).is_err()
    {
        return result_failure(
            &request_id,
            host_diagnostic(
                "bridge_request_invalid",
                "Zone result request is invalid.",
                BTreeMap::new(),
            ),
        );
    }
    let Some(_operation) = store.try_operation() else {
        return result_failure(
            &request_id,
            host_diagnostic(
                "project_operation_busy",
                "Another project operation is in progress.",
                BTreeMap::new(),
            ),
        );
    };
    let (active, zone_number) = {
        let state = store.state.lock().expect("desktop session mutex poisoned");
        let Some(active) = state.active_project.clone() else {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "project_session_missing",
                    "No active project session exists.",
                    BTreeMap::new(),
                ),
            );
        };
        if active.project_session_id != project_session_id {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "project_session_mismatch",
                    "Project session did not match.",
                    BTreeMap::new(),
                ),
            );
        }
        let Some(zone) = active.zone_by_id(&zone_id) else {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "result_zone_mismatch",
                    "The selected Zone is not part of the active project.",
                    BTreeMap::new(),
                ),
            );
        };
        let zone_number = zone.contam_number;
        (active, zone_number)
    };
    let dialog_app = app.clone();
    let selected = match tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .add_filter("Phase 4 run manifest", &["json"])
            .blocking_pick_file()
    })
    .await
    {
        Ok(selected) => selected,
        Err(_) => {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "desktop_dialog_failed",
                    "The native manifest dialog failed.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let Some(selected) = selected else {
        return DesktopZoneAirStateResponse {
            request_id,
            cancelled: true,
            project_session_id: None,
            result: None,
            error: None,
        };
    };
    let manifest_path = match selected.into_path() {
        Ok(path) => match canonicalize_manifest_path(&path) {
            Ok(path) => path,
            Err(code) => {
                return result_failure(
                    &request_id,
                    host_diagnostic(
                        code,
                        "The selected run manifest is invalid.",
                        BTreeMap::new(),
                    ),
                )
            }
        },
        Err(_) => {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "result_manifest_invalid",
                    "The selected manifest was not a local path.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    if app
        .emit(
            ZONE_RESULT_STAGE_EVENT,
            ZoneResultStageEvent {
                request_id: request_id.clone(),
                stage: "loading",
            },
        )
        .is_err()
    {
        return result_failure(
            &request_id,
            host_diagnostic(
                "desktop_stage_notification_failed",
                "The result extraction stage could not be reported.",
                BTreeMap::new(),
            ),
        );
    }
    match extract_zone_air_state_with_manifest(
        &app,
        &request_id,
        &active,
        zone_number,
        manifest_path,
        None,
    )
    .await
    {
        Ok(result) => {
            if let Err(error) =
                store.retain_result(&active, ActiveResultSource::SelectedManifest, &result)
            {
                return result_failure(&request_id, error);
            }
            DesktopZoneAirStateResponse {
                request_id,
                cancelled: false,
                project_session_id: Some(active.project_session_id.clone()),
                result: Some(result),
                error: None,
            }
        }
        Err(error) => result_failure(&request_id, error),
    }
}

#[tauri::command]
pub async fn extract_active_run_zone_air_state(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    zone_id: String,
) -> DesktopZoneAirStateResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || Uuid::parse_str(&zone_id).is_err()
    {
        return result_failure(
            &request_id,
            host_diagnostic(
                "bridge_request_invalid",
                "Active run result request is invalid.",
                BTreeMap::new(),
            ),
        );
    }
    let Some(_operation) = store.try_operation() else {
        return result_failure(
            &request_id,
            host_diagnostic(
                "project_operation_busy",
                "Another project operation is in progress.",
                BTreeMap::new(),
            ),
        );
    };
    let (active, active_run, zone_number) = {
        let state = store.state.lock().expect("desktop session mutex poisoned");
        let Some(active) = state.active_project.clone() else {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "project_session_missing",
                    "No active project session exists.",
                    BTreeMap::new(),
                ),
            );
        };
        if active.project_session_id != project_session_id {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "project_session_mismatch",
                    "Project session did not match.",
                    BTreeMap::new(),
                ),
            );
        }
        let Some(zone) = active.zone_by_id(&zone_id) else {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "result_zone_mismatch",
                    "The selected Zone is not part of the active project.",
                    BTreeMap::new(),
                ),
            );
        };
        let zone_number = zone.contam_number;
        let Some(active_run) = state.active_run.clone() else {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "active_run_missing",
                    "No successful active run is available.",
                    BTreeMap::new(),
                ),
            );
        };
        (active, active_run, zone_number)
    };
    let run_root = match app.path().app_local_data_dir() {
        Ok(path) => path.join("runs"),
        Err(_) => {
            return result_failure(
                &request_id,
                host_diagnostic(
                    "active_run_invalid",
                    "The controlled run root is unavailable.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let manifest_path = match validate_active_run_context(&active_run, &active, &run_root) {
        Ok(path) => path,
        Err(error) => return result_failure(&request_id, error),
    };
    let result = match extract_zone_air_state_with_manifest(
        &app,
        &request_id,
        &active,
        zone_number,
        manifest_path.clone(),
        Some(&active_run.run_id),
    )
    .await
    {
        Ok(result) => result,
        Err(error) => return result_failure(&request_id, error),
    };
    let state = store.state.lock().expect("desktop session mutex poisoned");
    let project_still_current = state.active_project.as_ref().is_some_and(|project| {
        project.project_session_id == active.project_session_id
            && project.source_sha256 == active.source_sha256
            && project.active_revision().revision_id == active.active_revision().revision_id
    });
    let run_still_current = state.active_run.as_ref().is_some_and(|run| {
        run.succeeded
            && run.project_session_id == active.project_session_id
            && run.source_sha256 == active.source_sha256
            && run.revision_id == active.active_revision().revision_id
            && run.run_id == active_run.run_id
            && run.manifest_path == manifest_path
    });
    if !project_still_current || !run_still_current || result.run_id != active_run.run_id {
        return result_failure(
            &request_id,
            host_diagnostic(
                "active_run_result_mismatch",
                "The active run changed during result extraction.",
                BTreeMap::new(),
            ),
        );
    }
    drop(state);
    if let Err(error) = store.retain_result(&active, ActiveResultSource::ActiveRun, &result) {
        return result_failure(&request_id, error);
    }
    DesktopZoneAirStateResponse {
        request_id,
        cancelled: false,
        project_session_id: Some(active.project_session_id),
        result: Some(result),
        error: None,
    }
}

#[tauri::command]
pub async fn export_active_zone_air_state_csv(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    zone_id: String,
    run_id: String,
    extraction_id: String,
) -> DesktopZoneAirStateCsvExportResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || !request_id_is_valid(&run_id)
        || !request_id_is_valid(&extraction_id)
        || Uuid::parse_str(&zone_id).is_err()
    {
        return export_failure(
            &request_id,
            host_diagnostic(
                "bridge_request_invalid",
                "Zone result export request is invalid.",
                BTreeMap::new(),
            ),
        );
    }
    let Some(_operation) = store.try_operation() else {
        return export_failure(
            &request_id,
            host_diagnostic(
                "project_operation_busy",
                "Another project operation is in progress.",
                BTreeMap::new(),
            ),
        );
    };
    let (active, active_result, zone_number) = {
        let state = store.state.lock().expect("desktop session mutex poisoned");
        let Some(active) = state.active_project.clone() else {
            return export_failure(
                &request_id,
                host_diagnostic(
                    "project_session_missing",
                    "No active project session exists.",
                    BTreeMap::new(),
                ),
            );
        };
        if active.project_session_id != project_session_id {
            return export_failure(
                &request_id,
                host_diagnostic(
                    "active_result_project_mismatch",
                    "The project session did not match the active result.",
                    BTreeMap::new(),
                ),
            );
        }
        let Some(active_result) = state.active_result.clone() else {
            return export_failure(
                &request_id,
                host_diagnostic(
                    "active_result_missing",
                    "No active Zone result is available.",
                    BTreeMap::new(),
                ),
            );
        };
        let Some(zone) = active.zone_by_id(&zone_id) else {
            return export_failure(
                &request_id,
                host_diagnostic(
                    "active_result_zone_mismatch",
                    "The selected Zone is not part of the active draft.",
                    BTreeMap::new(),
                ),
            );
        };
        let zone_number = zone.contam_number;
        if let Err(error) =
            active_result.validate_export_identity(&active, &zone_id, &run_id, &extraction_id)
        {
            return export_failure(&request_id, error);
        }
        (active, active_result, zone_number)
    };
    let source_for_check = active.clone();
    let source_matches = tauri::async_runtime::spawn_blocking(move || {
        active_project_source_matches(&source_for_check)
    })
    .await
    .unwrap_or(false);
    if !source_matches {
        return export_failure(
            &request_id,
            host_diagnostic(
                "active_result_project_mismatch",
                "The project source no longer matches the active result.",
                BTreeMap::new(),
            ),
        );
    }
    let safe_run_id: String = run_id
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || value == '-' {
                value
            } else {
                '_'
            }
        })
        .collect();
    let suggested = format!("zone-{zone_number}-air-state-{safe_run_id}.csv");
    let dialog_app = app.clone();
    let selected = match tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .add_filter("Zone air-state CSV", &["csv"])
            .set_file_name(suggested)
            .blocking_save_file()
    })
    .await
    {
        Ok(selected) => selected,
        Err(_) => {
            return export_failure(
                &request_id,
                host_diagnostic(
                    "export_destination_invalid",
                    "The native CSV save dialog failed.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let Some(selected) = selected else {
        return DesktopZoneAirStateCsvExportResponse {
            request_id,
            cancelled: true,
            project_session_id: None,
            export: None,
            error: None,
        };
    };
    let selected_path = match selected.into_path() {
        Ok(path) => path,
        Err(_) => {
            return export_failure(
                &request_id,
                host_diagnostic(
                    "export_destination_invalid",
                    "The selected CSV destination was not local.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let output = match validate_csv_destination(&active.source_path, &selected_path) {
        Ok(path) => path,
        Err(code) => {
            return export_failure(
                &request_id,
                host_diagnostic(
                    code,
                    "The selected CSV destination is not allowed.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let source_for_check = active.clone();
    let source_matches = tauri::async_runtime::spawn_blocking(move || {
        active_project_source_matches(&source_for_check)
    })
    .await
    .unwrap_or(false);
    if !source_matches {
        return export_failure(
            &request_id,
            host_diagnostic(
                "active_result_project_mismatch",
                "The project source changed before CSV export.",
                BTreeMap::new(),
            ),
        );
    }
    if app
        .emit(
            RESULT_EXPORT_STAGE_EVENT,
            ResultExportStageEvent {
                request_id: request_id.clone(),
                stage: "exporting",
            },
        )
        .is_err()
    {
        return export_failure(
            &request_id,
            host_diagnostic(
                "export_stage_notification_failed",
                "The CSV export stage could not be reported.",
                BTreeMap::new(),
            ),
        );
    }
    let bytes = encode_zone_air_state_csv(&active_result);
    let output_for_write = output.clone();
    let byte_count = match tauri::async_runtime::spawn_blocking(move || {
        write_csv_atomically(&output_for_write, &bytes)
    })
    .await
    {
        Ok(Ok(size)) => size,
        Ok(Err(code)) => {
            return export_failure(
                &request_id,
                host_diagnostic(
                    code,
                    "The CSV export could not be completed safely.",
                    BTreeMap::new(),
                ),
            )
        }
        Err(_) => {
            return export_failure(
                &request_id,
                host_diagnostic(
                    "export_temporary_write_failed",
                    "The CSV export task ended unexpectedly.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let source_for_check = active.clone();
    let source_matches = tauri::async_runtime::spawn_blocking(move || {
        active_project_source_matches(&source_for_check)
    })
    .await
    .unwrap_or(false);
    if !source_matches {
        let _ = std::fs::remove_file(&output);
        return export_failure(
            &request_id,
            host_diagnostic(
                "active_result_project_mismatch",
                "The project source changed during CSV export.",
                BTreeMap::new(),
            ),
        );
    }
    let file_name = output
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("zone-air-state.csv")
        .to_string();
    DesktopZoneAirStateCsvExportResponse {
        request_id,
        cancelled: false,
        project_session_id: Some(project_session_id),
        export: Some(ZoneAirStateCsvExportSummary {
            file_name,
            row_count: active_result.sample_count,
            byte_count,
            run_id,
            extraction_id,
            zone_id,
            zone_number,
        }),
        error: None,
    }
}

#[tauri::command]
pub async fn run_active_contam_project(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
) -> DesktopRunResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id) || !request_id_is_valid(&project_session_id) {
        return run_failure(
            &request_id,
            host_diagnostic(
                "bridge_request_invalid",
                "ContamX run request is invalid.",
                BTreeMap::new(),
            ),
        );
    }
    let Some(_operation) = store.try_operation() else {
        return run_failure(
            &request_id,
            host_diagnostic(
                "project_operation_busy",
                "Another project operation is in progress.",
                BTreeMap::new(),
            ),
        );
    };
    let active = {
        let state = store.state.lock().expect("desktop session mutex poisoned");
        match state.active_project.clone() {
            None => {
                return run_failure(
                    &request_id,
                    host_diagnostic(
                        "project_session_missing",
                        "No active project session exists.",
                        BTreeMap::new(),
                    ),
                )
            }
            Some(active) if active.project_session_id != project_session_id => {
                return run_failure(
                    &request_id,
                    host_diagnostic(
                        "project_session_mismatch",
                        "Project session did not match.",
                        BTreeMap::new(),
                    ),
                )
            }
            Some(active) => active,
        }
    };
    let run_root = match app.path().app_local_data_dir() {
        Ok(path) => path.join("runs"),
        Err(_) => {
            return run_failure(
                &request_id,
                host_diagnostic(
                    "run_root_invalid",
                    "The application run workspace is unavailable.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let request = json!({
        "protocol_version": PROTOCOL_VERSION,
        "request_id": request_id,
        "operation": RUN_ACTIVE_PROJECT_OPERATION,
        "source_path": active.source_path,
        "source_sha256": active.source_sha256,
        "run_root": run_root,
    });
    let bridge_id = request_id.clone();
    let raw = match tauri::async_runtime::spawn_blocking(move || {
        execute_bridge_request(&request, &bridge_id, RUN_TIMEOUT)
    })
    .await
    {
        Ok(Ok(envelope)) => envelope,
        Ok(Err(error)) => return run_failure(&request_id, error),
        Err(_) => {
            return run_failure(
                &request_id,
                host_diagnostic(
                    "bridge_task_failed",
                    "The ContamX run task ended unexpectedly.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    if !raw.ok {
        return run_failure(
            &request_id,
            sanitize_python_error(&raw).unwrap_or_else(|error| error),
        );
    }
    let result: RawContamXRunResult =
        match serde_json::from_value(raw.result.expect("validated result")) {
            Ok(value) => value,
            Err(_) => {
                return run_failure(
                    &request_id,
                    host_diagnostic(
                        "run_response_contract_invalid",
                        "Python ContamX run result was invalid.",
                        BTreeMap::new(),
                    ),
                )
            }
        };
    let (summary, active_run) = match validate_contamx_run_result(result, &active, &run_root) {
        Ok(value) => value,
        Err(error) => return run_failure(&request_id, error),
    };
    if !active_run.is_bound_to(&active) {
        return run_failure(
            &request_id,
            host_diagnostic(
                "run_response_contract_invalid",
                "The active run context was not bound to the project.",
                BTreeMap::new(),
            ),
        );
    }
    let mut state = store.state.lock().expect("desktop session mutex poisoned");
    if state.active_project.as_ref().map(|project| {
        (
            &project.project_session_id,
            &project.source_sha256,
            &project.active_revision().revision_id,
        )
    }) != Some((
        &project_session_id,
        &active.source_sha256,
        &active.active_revision().revision_id,
    )) {
        return run_failure(
            &request_id,
            host_diagnostic(
                "project_session_mismatch",
                "Project session changed during the run.",
                BTreeMap::new(),
            ),
        );
    }
    state.active_run = Some(active_run);
    DesktopRunResponse {
        request_id,
        project_session_id: Some(project_session_id),
        summary: Some(summary),
        error: None,
    }
}

#[tauri::command]
pub async fn plan_zone_volume_patch(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    zone_id: String,
    new_volume_token: String,
) -> DesktopPlanResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || Uuid::parse_str(&zone_id).is_err()
    {
        return plan_failure(
            &request_id,
            host_diagnostic(
                "bridge_request_invalid",
                "Patch plan request is invalid.",
                BTreeMap::new(),
            ),
        );
    }
    if new_volume_token.is_empty()
        || new_volume_token.len() > MAX_VOLUME_TOKEN_BYTES
        || !new_volume_token.is_ascii()
    {
        return plan_failure(
            &request_id,
            host_diagnostic(
                "patch_new_value_invalid",
                "New volume token is invalid.",
                BTreeMap::new(),
            ),
        );
    }
    let Some(_operation) = store.try_operation() else {
        return plan_failure(
            &request_id,
            host_diagnostic(
                "project_operation_busy",
                "Another project operation is in progress.",
                BTreeMap::new(),
            ),
        );
    };
    let (active, contam_number) = {
        let state = store.state.lock().expect("desktop session mutex poisoned");
        match state.active_project.clone() {
            None => {
                return plan_failure(
                    &request_id,
                    host_diagnostic(
                        "project_session_missing",
                        "No active project session exists.",
                        BTreeMap::new(),
                    ),
                )
            }
            Some(active) if active.project_session_id != project_session_id => {
                return plan_failure(
                    &request_id,
                    host_diagnostic(
                        "project_session_mismatch",
                        "Project session did not match.",
                        BTreeMap::new(),
                    ),
                )
            }
            Some(active) => {
                let Some(zone) = active.zone_by_id(&zone_id) else {
                    return plan_failure(
                        &request_id,
                        host_diagnostic(
                            "draft_identity_mismatch",
                            "Zone identity did not match the active draft.",
                            BTreeMap::new(),
                        ),
                    );
                };
                let contam_number = zone.contam_number;
                (active, contam_number)
            }
        }
    };
    let request = json!({
        "protocol_version": PROTOCOL_VERSION,
        "request_id": request_id,
        "operation": PLAN_OPERATION,
        "source_path": active.source_path,
        "contam_number": contam_number,
        "new_volume_token": new_volume_token,
    });
    let bridge_id = request_id.clone();
    let raw = match tauri::async_runtime::spawn_blocking(move || {
        execute_bridge_request(&request, &bridge_id, READ_AND_PLAN_TIMEOUT)
    })
    .await
    {
        Ok(Ok(envelope)) => envelope,
        Ok(Err(error)) => return plan_failure(&request_id, error),
        Err(_) => {
            return plan_failure(
                &request_id,
                host_diagnostic(
                    "bridge_task_failed",
                    "The patch plan task ended unexpectedly.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    if !raw.ok {
        return plan_failure(
            &request_id,
            sanitize_python_error(&raw).unwrap_or_else(|error| error),
        );
    }
    let plan: RawPatchPlanResult =
        match serde_json::from_value(raw.result.expect("validated result")) {
            Ok(value) => value,
            Err(_) => {
                return plan_failure(
                    &request_id,
                    host_diagnostic(
                        "patch_response_contract_invalid",
                        "Python patch plan response was invalid.",
                        BTreeMap::new(),
                    ),
                )
            }
        };
    let (planned, review) = match validate_plan_result(
        plan,
        &active,
        &request_id,
        &zone_id,
        contam_number,
        &new_volume_token,
    ) {
        Ok(value) => value,
        Err(error) => return plan_failure(&request_id, error),
    };
    let mut state = store.state.lock().expect("desktop session mutex poisoned");
    if state.active_project.as_ref().is_none_or(|value| {
        value.project_session_id != project_session_id
            || value.active_revision().revision_id != active.active_revision().revision_id
    }) {
        return plan_failure(
            &request_id,
            host_diagnostic(
                "project_session_mismatch",
                "Project session changed during planning.",
                BTreeMap::new(),
            ),
        );
    }
    state.planned_patch = Some(planned);
    DesktopPlanResponse {
        request_id,
        review: Some(review),
        error: None,
    }
}

#[tauri::command]
pub async fn apply_zone_volume_patch_to_draft(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    patch_id: String,
) -> DesktopApplyResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || !request_id_is_valid(&patch_id)
        || Uuid::parse_str(&request_id).is_err()
    {
        return apply_failure(
            &request_id,
            host_diagnostic(
                "bridge_request_invalid",
                "Patch application request is invalid.",
                BTreeMap::new(),
            ),
        );
    }
    let Some(_operation) = store.try_operation() else {
        return apply_failure(
            &request_id,
            host_diagnostic(
                "project_operation_busy",
                "Another project operation is in progress.",
                BTreeMap::new(),
            ),
        );
    };
    let (active, planned) = {
        let state = store.state.lock().expect("desktop session mutex poisoned");
        let Some(active) = state.active_project.clone() else {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "draft_session_missing",
                    "No active draft session exists.",
                    BTreeMap::new(),
                ),
            );
        };
        if active.project_session_id != project_session_id {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "draft_session_mismatch",
                    "Draft session did not match.",
                    BTreeMap::new(),
                ),
            );
        }
        let Some(planned) = state.planned_patch.clone() else {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "patch_plan_missing",
                    "No reviewed patch plan exists.",
                    BTreeMap::new(),
                ),
            );
        };
        if planned.patch_id != patch_id
            || planned.project_session_id != project_session_id
            || planned.revision_id != active.active_revision().revision_id
            || planned.source_sha256 != active.source_sha256
            || planned.new_volume_token != planned.patch.replacement.new_token
        {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "patch_session_mismatch",
                    "Patch did not belong to the active draft revision.",
                    BTreeMap::new(),
                ),
            );
        }
        if active.revision_cursor + 1 >= MAX_DRAFT_REVISIONS {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "draft_history_limit_reached",
                    "The draft revision limit was reached.",
                    BTreeMap::new(),
                ),
            );
        }
        if !active_project_source_matches(&active) {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "draft_revision_changed",
                    "The active draft revision changed before application.",
                    BTreeMap::new(),
                ),
            );
        }
        (active, planned)
    };
    let revision_number = active.active_revision().revision_number + 1;
    let output = active
        .draft_root
        .join("snapshots")
        .join(format!("revision-{revision_number}-{request_id}.prj"));
    if output.exists() || !output.starts_with(active.draft_root.join("snapshots")) {
        return apply_failure(
            &request_id,
            host_diagnostic(
                "draft_apply_failed",
                "A fresh internal draft snapshot could not be allocated.",
                BTreeMap::new(),
            ),
        );
    }
    let request = json!({
        "protocol_version": PROTOCOL_VERSION,
        "request_id": request_id,
        "operation": APPLY_OPERATION,
        "source_path": active.source_path,
        "output_path": output,
        "patch": planned.patch,
    });
    let bridge_id = request_id.clone();
    let raw = match tauri::async_runtime::spawn_blocking(move || {
        execute_bridge_request(&request, &bridge_id, APPLY_TIMEOUT)
    })
    .await
    {
        Ok(Ok(envelope)) => envelope,
        Ok(Err(error)) => return apply_failure(&request_id, error),
        Err(_) => {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "draft_apply_failed",
                    "The draft application task ended unexpectedly.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    if !raw.ok {
        let _ = std::fs::remove_file(&output);
        return apply_failure(
            &request_id,
            sanitize_python_error(&raw).unwrap_or_else(|error| error),
        );
    }
    let application: RawPatchApplicationResult =
        match serde_json::from_value(raw.result.expect("validated result")) {
            Ok(value) => value,
            Err(_) => {
                let _ = std::fs::remove_file(&output);
                return apply_failure(
                    &request_id,
                    host_diagnostic(
                        "draft_apply_failed",
                        "Python draft application response was invalid.",
                        BTreeMap::new(),
                    ),
                );
            }
        };
    let mut project = match validate_application_result(application, &active, &planned, &output) {
        Ok(project) => project,
        Err(error) => {
            let _ = std::fs::remove_file(&output);
            return apply_failure(&request_id, error);
        }
    };
    project.source_path = safe_project_file_name(&active.baseline_source_path);
    if !active_project_source_matches(&active) {
        let _ = std::fs::remove_file(&output);
        return apply_failure(
            &request_id,
            host_diagnostic(
                "draft_revision_changed",
                "The active draft revision changed during application.",
                BTreeMap::new(),
            ),
        );
    }
    let revision = DraftRevision {
        revision_id: request_id.clone(),
        revision_number,
        parent_revision_id: Some(active.active_revision().revision_id.clone()),
        source_path: output.clone(),
        source_sha256: project.source_sha256.clone(),
        source_size_bytes: project.source_size_bytes,
        project: project.clone(),
        patch: Some(DraftPatchSummary {
            zone_id: planned.target_zone_id.clone(),
            contam_number: planned.target_zone_number,
            old_token: planned.patch.preconditions.old_token.clone(),
            new_token: planned.patch.replacement.new_token.clone(),
        }),
        created_at_unix_ms: unix_time_ms(),
        application_owned: true,
    };
    let mut state = store.state.lock().expect("desktop session mutex poisoned");
    let planned_patch_matches = state
        .planned_patch
        .as_ref()
        .is_some_and(|value| value.patch_id == patch_id);
    let Some(current) = state.active_project.as_mut() else {
        let _ = std::fs::remove_file(&output);
        return apply_failure(
            &request_id,
            host_diagnostic(
                "draft_session_missing",
                "Draft session ended during application.",
                BTreeMap::new(),
            ),
        );
    };
    if current.project_session_id != project_session_id
        || current.active_revision().revision_id != planned.revision_id
        || !planned_patch_matches
    {
        let _ = std::fs::remove_file(&output);
        return apply_failure(
            &request_id,
            host_diagnostic(
                "patch_session_mismatch",
                "Draft session changed during application.",
                BTreeMap::new(),
            ),
        );
    }
    let truncated = current.revisions.split_off(current.revision_cursor + 1);
    current.revisions.push(revision);
    let cursor = current.revisions.len() - 1;
    current.sync_to_revision(cursor);
    let draft = current.draft_summary();
    state.planned_patch = None;
    state.active_run = None;
    if state.active_result.is_some() {
        state.last_trusted_result = state.active_result.clone();
    }
    state.active_result = None;
    drop(state);
    for old in truncated {
        if old.application_owned
            && old
                .source_path
                .starts_with(active.draft_root.join("snapshots"))
        {
            let _ = std::fs::remove_file(old.source_path);
        }
    }
    app.state::<crate::codex_app_server::CodexAssistantStore>()
        .invalidate_context();
    DesktopApplyResponse {
        request_id,
        cancelled: false,
        project_session_id: Some(project_session_id),
        project: Some(project),
        target_zone_number: Some(planned.target_zone_number),
        target_zone_id: Some(planned.target_zone_id),
        draft: Some(draft),
        error: None,
    }
}

fn draft_transition_failure(
    request_id: &str,
    error: ReaderDiagnostic,
) -> DesktopDraftTransitionResponse {
    DesktopDraftTransitionResponse {
        request_id: request_id.into(),
        project_session_id: None,
        project: None,
        draft: None,
        error: Some(error),
    }
}

fn draft_export_failure(request_id: &str, error: ReaderDiagnostic) -> DesktopDraftExportResponse {
    DesktopDraftExportResponse {
        request_id: request_id.into(),
        cancelled: false,
        project_session_id: None,
        export: None,
        error: Some(error),
    }
}

fn validate_draft_revision(
    active: &ActiveProjectContext,
    revision: &DraftRevision,
    request_id: &str,
    allow_external_source_path: bool,
) -> Result<ProjectInspection, ReaderDiagnostic> {
    let revision_index = active
        .revisions
        .iter()
        .position(|candidate| candidate.revision_id == revision.revision_id)
        .ok_or_else(|| {
            host_diagnostic(
                "draft_identity_mismatch",
                "The draft revision is not part of the active history.",
                BTreeMap::new(),
            )
        })?;
    let metadata_valid = if revision_index == 0 {
        revision.revision_number == 0
            && revision.parent_revision_id.is_none()
            && revision.patch.is_none()
            && !revision.application_owned
            && (allow_external_source_path || revision.source_path == active.baseline_source_path)
            && revision.source_sha256 == active.baseline_source_sha256
            && revision.source_size_bytes == active.baseline_source_size_bytes
    } else {
        let previous = &active.revisions[revision_index - 1];
        let patch = revision.patch.as_ref();
        revision.revision_number == previous.revision_number + 1
            && revision.parent_revision_id.as_deref() == Some(previous.revision_id.as_str())
            && revision.application_owned
            && revision.created_at_unix_ms > 0
            && patch.is_some_and(|patch| {
                !patch.old_token.is_empty()
                    && !patch.new_token.is_empty()
                    && patch.old_token != patch.new_token
                    && revision.project.zones.iter().any(|zone| {
                        zone.zone_id == patch.zone_id
                            && zone.contam_number == patch.contam_number
                            && patch
                                .new_token
                                .parse::<f64>()
                                .is_ok_and(|value| value.is_finite() && value == zone.volume_m3)
                    })
            })
    };
    if !metadata_valid {
        return Err(host_diagnostic(
            "draft_identity_mismatch",
            "The draft revision lineage metadata was invalid.",
            BTreeMap::new(),
        ));
    }
    let (sha256, size) = sha256_file(&revision.source_path).map_err(|_| {
        host_diagnostic(
            "draft_revision_missing",
            "The draft revision file is unavailable.",
            BTreeMap::new(),
        )
    })?;
    if size != revision.source_size_bytes || !sha256.eq_ignore_ascii_case(&revision.source_sha256) {
        let code = if revision.revision_number == 0 {
            "draft_baseline_changed"
        } else {
            "draft_revision_changed"
        };
        return Err(host_diagnostic(
            code,
            "The draft revision no longer matches its verified snapshot.",
            BTreeMap::new(),
        ));
    }
    let envelope = execute_read(&revision.source_path, request_id);
    if !envelope.ok {
        return Err(envelope.error.unwrap_or_else(|| {
            host_diagnostic(
                "draft_revision_changed",
                "The draft revision could not be read.",
                BTreeMap::new(),
            )
        }));
    }
    let mut project = envelope.result.ok_or_else(|| {
        host_diagnostic(
            "draft_revision_changed",
            "The draft revision response was incomplete.",
            BTreeMap::new(),
        )
    })?;
    bind_revision_zone_ids(&mut project, &active.revisions[0].project.zones)?;
    project.source_path = safe_project_file_name(&active.baseline_source_path);
    let expected = &revision.project;
    if project.source_sha256 != expected.source_sha256
        || project.source_size_bytes != expected.source_size_bytes
        || project.reader_mode != expected.reader_mode
        || project.header_version != expected.header_version
        || project.zones != expected.zones
    {
        return Err(host_diagnostic(
            "draft_identity_mismatch",
            "The draft revision did not match its verified Zone view.",
            BTreeMap::new(),
        ));
    }
    Ok(project)
}

async fn switch_project_draft(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    direction: i8,
) -> DesktopDraftTransitionResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id) || !request_id_is_valid(&project_session_id) {
        return draft_transition_failure(
            &request_id,
            host_diagnostic(
                "bridge_request_invalid",
                "Draft transition request is invalid.",
                BTreeMap::new(),
            ),
        );
    }
    let Some(_operation) = store.try_operation() else {
        return draft_transition_failure(
            &request_id,
            host_diagnostic(
                "project_operation_busy",
                "Another project operation is in progress.",
                BTreeMap::new(),
            ),
        );
    };
    let (active, target_cursor) = {
        let state = store.state.lock().expect("desktop session mutex poisoned");
        let Some(active) = state.active_project.clone() else {
            return draft_transition_failure(
                &request_id,
                host_diagnostic(
                    "draft_session_missing",
                    "No active draft session exists.",
                    BTreeMap::new(),
                ),
            );
        };
        if active.project_session_id != project_session_id {
            return draft_transition_failure(
                &request_id,
                host_diagnostic(
                    "draft_session_mismatch",
                    "Draft session did not match.",
                    BTreeMap::new(),
                ),
            );
        }
        let target = if direction < 0 {
            active.revision_cursor.checked_sub(1).ok_or_else(|| {
                host_diagnostic(
                    "draft_undo_unavailable",
                    "No earlier draft revision is available.",
                    BTreeMap::new(),
                )
            })
        } else if active.revision_cursor + 1 < active.revisions.len() {
            Ok(active.revision_cursor + 1)
        } else {
            Err(host_diagnostic(
                "draft_redo_unavailable",
                "No later draft revision is available.",
                BTreeMap::new(),
            ))
        };
        let target = match target {
            Ok(value) => value,
            Err(error) => return draft_transition_failure(&request_id, error),
        };
        (active, target)
    };
    let validation_active = active.clone();
    let target_revision = active.revisions[target_cursor].clone();
    let validation_request = request_id.clone();
    let project = match tauri::async_runtime::spawn_blocking(move || {
        validate_draft_revision(
            &validation_active,
            &target_revision,
            &validation_request,
            false,
        )
    })
    .await
    {
        Ok(Ok(project)) => project,
        Ok(Err(error)) => return draft_transition_failure(&request_id, error),
        Err(_) => {
            return draft_transition_failure(
                &request_id,
                host_diagnostic(
                    "draft_revision_changed",
                    "Draft revision validation ended unexpectedly.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let mut state = store.state.lock().expect("desktop session mutex poisoned");
    let Some(current) = state.active_project.as_mut() else {
        return draft_transition_failure(
            &request_id,
            host_diagnostic(
                "draft_session_missing",
                "Draft session ended during transition.",
                BTreeMap::new(),
            ),
        );
    };
    if current.project_session_id != project_session_id
        || current.revision_cursor != active.revision_cursor
        || current.revisions[target_cursor].revision_id
            != active.revisions[target_cursor].revision_id
    {
        return draft_transition_failure(
            &request_id,
            host_diagnostic(
                "draft_session_mismatch",
                "Draft session changed during transition.",
                BTreeMap::new(),
            ),
        );
    }
    current.revisions[target_cursor].project = project.clone();
    current.sync_to_revision(target_cursor);
    let draft = current.draft_summary();
    state.planned_patch = None;
    state.active_run = None;
    state.active_result = None;
    drop(state);
    app.state::<crate::codex_app_server::CodexAssistantStore>()
        .invalidate_context();
    DesktopDraftTransitionResponse {
        request_id,
        project_session_id: Some(project_session_id),
        project: Some(project),
        draft: Some(draft),
        error: None,
    }
}

#[tauri::command]
pub async fn undo_project_draft(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
) -> DesktopDraftTransitionResponse {
    switch_project_draft(app, request_id, project_session_id, -1).await
}

#[tauri::command]
pub async fn redo_project_draft(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
) -> DesktopDraftTransitionResponse {
    switch_project_draft(app, request_id, project_session_id, 1).await
}

fn validate_draft_export_destination(
    active: &ActiveProjectContext,
    selected: &Path,
) -> Result<PathBuf, &'static str> {
    let mut candidate = selected.to_path_buf();
    match candidate.extension().and_then(|value| value.to_str()) {
        None => {
            candidate.set_extension("prj");
        }
        Some(extension) if extension.eq_ignore_ascii_case("prj") => {}
        _ => return Err("draft_export_destination_invalid"),
    }
    let file_name = candidate
        .file_name()
        .filter(|value| !value.is_empty())
        .ok_or("draft_export_destination_invalid")?;
    let parent = candidate
        .parent()
        .ok_or("draft_export_destination_invalid")?;
    let canonical_parent =
        std::fs::canonicalize(parent).map_err(|_| "draft_export_destination_invalid")?;
    let output = canonical_parent.join(file_name);
    if output.to_str().is_none() {
        return Err("draft_export_destination_invalid");
    }
    let resolved_output = if output.exists() {
        std::fs::canonicalize(&output).map_err(|_| "draft_export_destination_invalid")?
    } else {
        output.clone()
    };
    let resolved_draft_root = projected_canonical_path(&active.draft_root)
        .map_err(|_| "draft_export_destination_invalid")?;
    if resolved_output == active.baseline_source_path
        || resolved_output.starts_with(&resolved_draft_root)
        || active.revisions.iter().any(|revision| {
            projected_canonical_path(&revision.source_path)
                .is_ok_and(|path| resolved_output == path)
        })
    {
        return Err("draft_export_conflicts_with_source");
    }
    if output.exists() {
        return Err("draft_export_destination_exists");
    }
    Ok(output)
}

#[cfg(test)]
fn copy_draft_atomically(source: &Path, output: &Path) -> Result<(), &'static str> {
    copy_draft_atomically_with_commit(source, output, |temporary, output| {
        std::fs::hard_link(temporary, output)
    })
}

fn copy_draft_atomically_with_commit<CommitStep>(
    source: &Path,
    output: &Path,
    commit_step: CommitStep,
) -> Result<(), &'static str>
where
    CommitStep: FnOnce(&Path, &Path) -> std::io::Result<()>,
{
    if output.exists() {
        return Err("draft_export_destination_exists");
    }
    let parent = output.parent().ok_or("draft_export_destination_invalid")?;
    let file_name = output
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("draft_export_destination_invalid")?;
    let temporary = parent.join(format!(
        ".{file_name}.{}.{}.draft.tmp",
        std::process::id(),
        unix_time_ms()
    ));
    let result = (|| {
        let mut input = File::open(source).map_err(|_| "draft_export_write_failed")?;
        let mut target = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "draft_export_write_failed")?;
        std::io::copy(&mut input, &mut target).map_err(|_| "draft_export_write_failed")?;
        target.flush().map_err(|_| "draft_export_write_failed")?;
        target.sync_all().map_err(|_| "draft_export_write_failed")?;
        drop(target);
        commit_step(&temporary, output).map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "draft_export_destination_exists"
            } else {
                "draft_export_write_failed"
            }
        })?;
        Ok(())
    })();
    let _ = std::fs::remove_file(&temporary);
    result
}

fn verify_draft_export_copy(
    active: &ActiveProjectContext,
    output: &Path,
    request_id: &str,
) -> Result<(String, u64, ProjectInspection), ReaderDiagnostic> {
    let (sha256, size) = sha256_file(output).map_err(|_| {
        host_diagnostic(
            "draft_export_verification_failed",
            "The exported draft could not be verified.",
            BTreeMap::new(),
        )
    })?;
    if !sha256.eq_ignore_ascii_case(&active.source_sha256) || size != active.source_size_bytes {
        return Err(host_diagnostic(
            "draft_export_verification_failed",
            "The exported draft did not match the active revision.",
            BTreeMap::new(),
        ));
    }
    let canonical_output = std::fs::canonicalize(output).map_err(|_| {
        host_diagnostic(
            "draft_export_verification_failed",
            "The exported draft could not be resolved for verification.",
            BTreeMap::new(),
        )
    })?;
    let mut exported_revision = active.active_revision().clone();
    exported_revision.source_path = canonical_output;
    let project = validate_draft_revision(active, &exported_revision, request_id, true)?;
    Ok((sha256, size, project))
}

fn remove_owned_draft_export(active: &ActiveProjectContext, output: &Path) {
    let owned = sha256_file(output).is_ok_and(|(sha256, size)| {
        size == active.source_size_bytes && sha256.eq_ignore_ascii_case(&active.source_sha256)
    });
    if owned {
        let _ = std::fs::remove_file(output);
    }
}

fn export_draft_copy_with_commit<CommitStep>(
    active: &ActiveProjectContext,
    output: &Path,
    request_id: &str,
    commit_step: CommitStep,
) -> Result<(String, u64, ProjectInspection), ReaderDiagnostic>
where
    CommitStep: FnOnce(&Path, &Path) -> std::io::Result<()>,
{
    if let Err(code) = copy_draft_atomically_with_commit(&active.source_path, output, commit_step) {
        return Err(host_diagnostic(
            code,
            "The draft copy could not be written.",
            BTreeMap::new(),
        ));
    }
    match verify_draft_export_copy(active, output, request_id) {
        Ok(value) => Ok(value),
        Err(error) => {
            remove_owned_draft_export(active, output);
            Err(error)
        }
    }
}

fn export_draft_copy(
    active: &ActiveProjectContext,
    output: &Path,
    request_id: &str,
) -> Result<(String, u64, ProjectInspection), ReaderDiagnostic> {
    export_draft_copy_with_commit(active, output, request_id, |temporary, output| {
        std::fs::hard_link(temporary, output)
    })
}

#[tauri::command]
pub async fn export_active_project_draft_copy(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    revision_id: String,
) -> DesktopDraftExportResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || Uuid::parse_str(&revision_id).is_err()
    {
        return draft_export_failure(
            &request_id,
            host_diagnostic(
                "bridge_request_invalid",
                "Draft export request is invalid.",
                BTreeMap::new(),
            ),
        );
    }
    let Some(_operation) = store.try_operation() else {
        return draft_export_failure(
            &request_id,
            host_diagnostic(
                "project_operation_busy",
                "Another project operation is in progress.",
                BTreeMap::new(),
            ),
        );
    };
    let active = {
        let state = store.state.lock().expect("desktop session mutex poisoned");
        let Some(active) = state.active_project.clone() else {
            return draft_export_failure(
                &request_id,
                host_diagnostic(
                    "draft_session_missing",
                    "No active draft session exists.",
                    BTreeMap::new(),
                ),
            );
        };
        if active.project_session_id != project_session_id
            || active.active_revision().revision_id != revision_id
        {
            return draft_export_failure(
                &request_id,
                host_diagnostic(
                    "draft_session_mismatch",
                    "Draft export did not match the active revision.",
                    BTreeMap::new(),
                ),
            );
        }
        if !active_project_source_matches(&active) {
            return draft_export_failure(
                &request_id,
                host_diagnostic(
                    if active.active_revision().revision_number == 0 {
                        "draft_baseline_changed"
                    } else {
                        "draft_revision_changed"
                    },
                    "The active draft revision changed before export.",
                    BTreeMap::new(),
                ),
            );
        }
        active
    };
    let suggested = format!(
        "{}-draft-r{}.prj",
        active
            .baseline_source_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("project"),
        active.active_revision().revision_number
    );
    let dialog_app = app.clone();
    let selected = match tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .add_filter("CONTAM PRJ", &["prj"])
            .set_file_name(suggested)
            .blocking_save_file()
    })
    .await
    {
        Ok(value) => value,
        Err(_) => {
            return draft_export_failure(
                &request_id,
                host_diagnostic(
                    "draft_export_destination_invalid",
                    "The native draft export dialog failed.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let Some(selected) = selected else {
        return DesktopDraftExportResponse {
            request_id,
            cancelled: true,
            project_session_id: Some(project_session_id),
            export: None,
            error: None,
        };
    };
    let selected = match selected.into_path() {
        Ok(path) => path,
        Err(_) => {
            return draft_export_failure(
                &request_id,
                host_diagnostic(
                    "draft_export_destination_invalid",
                    "The selected draft destination was not local.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let output = match validate_draft_export_destination(&active, &selected) {
        Ok(path) => path,
        Err(code) => {
            return draft_export_failure(
                &request_id,
                host_diagnostic(
                    code,
                    "The draft export destination is not allowed.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let (sha256, size, project) = match export_draft_copy(&active, &output, &request_id) {
        Ok(value) => value,
        Err(error) => {
            return draft_export_failure(&request_id, error);
        }
    };
    let mut state = store.state.lock().expect("desktop session mutex poisoned");
    let Some(current) = state.active_project.as_mut() else {
        remove_owned_draft_export(&active, &output);
        return draft_export_failure(
            &request_id,
            host_diagnostic(
                "draft_session_missing",
                "Draft session ended during export.",
                BTreeMap::new(),
            ),
        );
    };
    if current.project_session_id != project_session_id
        || current.active_revision().revision_id != revision_id
    {
        remove_owned_draft_export(&active, &output);
        return draft_export_failure(
            &request_id,
            host_diagnostic(
                "draft_session_mismatch",
                "Draft session changed during export.",
                BTreeMap::new(),
            ),
        );
    }
    if !current.exported_revisions.contains(&revision_id) {
        current.exported_revisions.push(revision_id);
    }
    DesktopDraftExportResponse {
        request_id,
        cancelled: false,
        project_session_id: Some(project_session_id),
        export: Some(DraftExportSummary {
            file_name: safe_project_file_name(&output),
            sha256,
            size_bytes: size,
            zone_count: project.declared_zone_count,
            revision_number: active.active_revision().revision_number,
            matches_active_revision: true,
        }),
        error: None,
    }
}

pub(crate) mod simulation_loop;

#[cfg(test)]
mod tests;
