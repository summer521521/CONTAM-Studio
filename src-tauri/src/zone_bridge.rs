use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const PROTOCOL_VERSION: &str = "1.1";
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
const READ_AND_PLAN_TIMEOUT: Duration = Duration::from_secs(10);
const APPLY_TIMEOUT: Duration = Duration::from_secs(15);
const POLL_INTERVAL: Duration = Duration::from_millis(20);
const MAX_STDOUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 16 * 1024;
const MAX_REQUEST_BYTES: usize = 128 * 1024;
const MAX_VOLUME_TOKEN_BYTES: usize = 80;
const MAX_PREVIEW_LINE_CHARS: usize = 4096;
const MAX_DIFF_CHARS: usize = 16 * 1024;
const MAX_DIAGNOSTIC_CODE_BYTES: usize = 80;
const MAX_DIAGNOSTIC_MESSAGE_CHARS: usize = 160;
const MAX_CONTEXT_STRING_CHARS: usize = 120;
const PYTHON_DIAGNOSTIC_MESSAGE: &str = "Python Zone bridge returned a structured diagnostic.";

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[cfg_attr(test, derive(Serialize))]
struct RawReaderDiagnostic {
    code: String,
    message: String,
    source_line_number: Option<u64>,
    context: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ReaderDiagnostic {
    code: String,
    message: String,
    source_line_number: Option<u64>,
    context: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ZoneRecord {
    contam_number: i64,
    name: String,
    flags: i64,
    level_number: i64,
    relative_height: f64,
    volume_m3: f64,
    source_line_number: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[cfg_attr(test, derive(Serialize))]
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
    zones: Vec<ZoneRecord>,
    first_zone: Option<ZoneRecord>,
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
struct RawReadZonesResult {
    result_type: String,
    project: RawProjectInspection,
}

#[derive(Clone, Debug, Deserialize)]
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
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
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
struct PatchReplacement {
    new_token: String,
    new_value: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
struct PatchPreview {
    source_line_number: u64,
    old_token: String,
    new_token: String,
    old_line: String,
    new_line: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
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
struct RawPatchPlanResult {
    result_type: String,
    patch: ZoneVolumePatch,
    diff_text: String,
}

#[derive(Clone, Debug, Deserialize)]
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
struct RawPatchApplicationResult {
    result_type: String,
    application: RawPatchApplication,
    project: RawProjectInspection,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PatchReviewView {
    project_session_id: String,
    patch_id: String,
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
    error: Option<ReaderDiagnostic>,
}

#[derive(Clone, Debug)]
struct ActiveProjectContext {
    project_session_id: String,
    source_path: PathBuf,
    source_sha256: String,
    source_size_bytes: u64,
    reader_mode: String,
    header_version: String,
}

#[derive(Clone, Debug)]
struct PlannedPatchContext {
    patch_id: String,
    project_session_id: String,
    patch: ZoneVolumePatch,
    target_zone_number: i64,
    new_volume_token: String,
    source_sha256: String,
}

#[derive(Default)]
struct DesktopSessionState {
    active_project: Option<ActiveProjectContext>,
    planned_patch: Option<PlannedPatchContext>,
}

#[derive(Default)]
pub struct DesktopProjectSessionStore {
    state: Mutex<DesktopSessionState>,
    operation_busy: AtomicBool,
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
        project: &ProjectInspection,
    ) {
        let context = ActiveProjectContext {
            project_session_id,
            source_path,
            source_sha256: project.source_sha256.clone(),
            source_size_bytes: project.source_size_bytes,
            reader_mode: project.reader_mode.clone(),
            header_version: project.header_version.clone(),
        };
        let mut state = self.state.lock().expect("desktop session mutex poisoned");
        state.active_project = Some(context);
        state.planned_patch = None;
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

fn validate_output_path(source: &Path, selected: &Path) -> Result<PathBuf, &'static str> {
    let mut candidate = selected.to_path_buf();
    match candidate.extension().and_then(|value| value.to_str()) {
        None => {
            candidate.set_extension("prj");
        }
        Some(extension) if extension.eq_ignore_ascii_case("prj") => {}
        _ => return Err("selected_output_path_invalid"),
    }
    if candidate.exists() {
        if std::fs::canonicalize(&candidate).ok().as_deref() == Some(source) {
            return Err("selected_output_path_invalid");
        }
        return Err("patch_output_exists");
    }
    let Some(file_name) = candidate.file_name() else {
        return Err("selected_output_path_invalid");
    };
    let parent = candidate.parent().ok_or("selected_output_path_invalid")?;
    let canonical_parent =
        std::fs::canonicalize(parent).map_err(|_| "selected_output_path_invalid")?;
    if !canonical_parent.is_dir() {
        return Err("selected_output_path_invalid");
    }
    let output = canonical_parent.join(file_name);
    if output.to_str().is_none() || output == source {
        return Err("selected_output_path_invalid");
    }
    Ok(output)
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
    Ok(ProjectInspection {
        schema_version: raw.schema_version,
        reader_mode: raw.reader_mode,
        source_path: expected_path.to_string_lossy().into_owned(),
        source_sha256: raw.source_sha256,
        source_size_bytes: raw.source_size_bytes,
        source_unchanged: raw.source_unchanged,
        header_version: raw.header_version,
        header_variant: raw.header_variant,
        declared_zone_count: raw.declared_zone_count,
        zones: raw.zones,
        first_zone: raw.first_zone,
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
        new_volume_token: patch.replacement.new_token.clone(),
        source_sha256: patch.source_sha256.clone(),
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
    let project = validate_raw_project(raw.project, output)?;
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
    Ok(project)
}

impl DesktopOpenResponse {
    fn cancelled(request_id: &str) -> Self {
        Self {
            request_id: request_id.into(),
            cancelled: true,
            project_session_id: None,
            envelope: None,
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
        error: Some(error),
    }
}

#[tauri::command]
pub async fn select_and_read_prj_zones(app: AppHandle, request_id: String) -> DesktopOpenResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id) {
        return DesktopOpenResponse {
            request_id: String::new(),
            cancelled: false,
            project_session_id: None,
            envelope: Some(host_error(
                "",
                "bridge_request_invalid",
                "request_id is invalid.",
            )),
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
            }
        }
    };
    let bridge_id = request_id.clone();
    let source = canonical_path.clone();
    let envelope = tauri::async_runtime::spawn_blocking(move || execute_read(&source, &bridge_id))
        .await
        .unwrap_or_else(|_| {
            host_error(
                &request_id,
                "bridge_task_failed",
                "The read task ended unexpectedly.",
            )
        });
    let mut project_session_id = None;
    if let Some(project) = envelope.result.as_ref() {
        store.activate_project(request_id.clone(), canonical_path, project);
        project_session_id = Some(request_id.clone());
    }
    DesktopOpenResponse {
        request_id,
        cancelled: false,
        project_session_id,
        envelope: Some(envelope),
    }
}

#[tauri::command]
pub async fn plan_zone_volume_patch(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    contam_number: i64,
    new_volume_token: String,
) -> DesktopPlanResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id) || !request_id_is_valid(&project_session_id) {
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
    let active = {
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
            Some(active) => active,
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
    let (planned, review) =
        match validate_plan_result(plan, &active, &request_id, contam_number, &new_volume_token) {
            Ok(value) => value,
            Err(error) => return plan_failure(&request_id, error),
        };
    let mut state = store.state.lock().expect("desktop session mutex poisoned");
    if state
        .active_project
        .as_ref()
        .map(|value| &value.project_session_id)
        != Some(&project_session_id)
    {
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
pub async fn apply_zone_volume_patch_to_copy(
    app: AppHandle,
    request_id: String,
    project_session_id: String,
    patch_id: String,
) -> DesktopApplyResponse {
    let store = app.state::<DesktopProjectSessionStore>();
    if !request_id_is_valid(&request_id)
        || !request_id_is_valid(&project_session_id)
        || !request_id_is_valid(&patch_id)
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
                    "project_session_missing",
                    "No active project session exists.",
                    BTreeMap::new(),
                ),
            );
        };
        if active.project_session_id != project_session_id {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "project_session_mismatch",
                    "Project session did not match.",
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
        if planned.patch_id != patch_id || planned.project_session_id != project_session_id {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "patch_session_mismatch",
                    "Patch session did not match.",
                    BTreeMap::new(),
                ),
            );
        }
        if planned.source_sha256 != active.source_sha256
            || planned.new_volume_token != planned.patch.replacement.new_token
        {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "patch_precondition_failed",
                    "Stored patch preconditions are invalid.",
                    BTreeMap::new(),
                ),
            );
        }
        (active, planned)
    };
    let suggested = format!(
        "{}-modified.prj",
        active
            .source_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("project")
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
        Ok(selected) => selected,
        Err(_) => {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "desktop_save_dialog_failed",
                    "The native save dialog failed.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let Some(selected) = selected else {
        return DesktopApplyResponse {
            request_id,
            cancelled: true,
            project_session_id: None,
            project: None,
            target_zone_number: None,
            error: None,
        };
    };
    let selected_path = match selected.into_path() {
        Ok(path) => path,
        Err(_) => {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    "selected_output_path_invalid",
                    "The selected output was not a local path.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    let output = match validate_output_path(&active.source_path, &selected_path) {
        Ok(path) => path,
        Err(code) => {
            return apply_failure(
                &request_id,
                host_diagnostic(
                    code,
                    "The selected output path is not allowed.",
                    BTreeMap::new(),
                ),
            )
        }
    };
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
                    "bridge_task_failed",
                    "The patch application task ended unexpectedly.",
                    BTreeMap::new(),
                ),
            )
        }
    };
    if !raw.ok {
        let error = sanitize_python_error(&raw).unwrap_or_else(|error| error);
        if matches!(
            error.code.as_str(),
            "patch_precondition_failed" | "patch_verification_failed"
        ) {
            store
                .state
                .lock()
                .expect("desktop session mutex poisoned")
                .planned_patch = None;
        }
        return apply_failure(&request_id, error);
    }
    let application: RawPatchApplicationResult =
        match serde_json::from_value(raw.result.expect("validated result")) {
            Ok(value) => value,
            Err(_) => {
                return apply_failure(
                    &request_id,
                    host_diagnostic(
                        "patch_apply_response_invalid",
                        "Python patch application response was invalid.",
                        BTreeMap::new(),
                    ),
                )
            }
        };
    let project = match validate_application_result(application, &active, &planned, &output) {
        Ok(project) => project,
        Err(error) => return apply_failure(&request_id, error),
    };
    let target_zone_number = planned.target_zone_number;
    let new_session_id = request_id.clone();
    let new_active = ActiveProjectContext {
        project_session_id: new_session_id.clone(),
        source_path: output,
        source_sha256: project.source_sha256.clone(),
        source_size_bytes: project.source_size_bytes,
        reader_mode: project.reader_mode.clone(),
        header_version: project.header_version.clone(),
    };
    let mut state = store.state.lock().expect("desktop session mutex poisoned");
    if state
        .active_project
        .as_ref()
        .map(|value| &value.project_session_id)
        != Some(&project_session_id)
        || state.planned_patch.as_ref().map(|value| &value.patch_id) != Some(&patch_id)
    {
        return apply_failure(
            &request_id,
            host_diagnostic(
                "patch_session_mismatch",
                "Patch session changed during application.",
                BTreeMap::new(),
            ),
        );
    }
    state.active_project = Some(new_active);
    state.planned_patch = None;
    DesktopApplyResponse {
        request_id,
        cancelled: false,
        project_session_id: Some(new_session_id),
        project: Some(project),
        target_zone_number: Some(target_zone_number),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture_path(relative: &str) -> PathBuf {
        std::fs::canonicalize(project_root().join(relative)).unwrap()
    }

    fn primary_fixture() -> PathBuf {
        fixture_path("fixtures/contam/official-contamxpy/test_GetPrjInfo.prj")
    }

    fn outcome(stdout: Vec<u8>) -> ProcessOutcome {
        ProcessOutcome {
            success: true,
            exit_code: Some(0),
            timed_out: false,
            stdout: Capture {
                bytes: stdout,
                exceeded: false,
            },
            stderr: Capture {
                bytes: Vec::new(),
                exceeded: false,
            },
        }
    }

    #[test]
    fn python_discovery_and_timeout_limits_are_explicit() {
        let python = project_root().join("python/.venv/Scripts/python.exe");
        assert_eq!(
            discover_python(Some(python.clone().into_os_string()), Path::new("ignored")),
            Ok(python)
        );
        assert_eq!(READ_AND_PLAN_TIMEOUT, Duration::from_secs(10));
        assert_eq!(APPLY_TIMEOUT, Duration::from_secs(15));
        assert_eq!(MAX_REQUEST_BYTES, 128 * 1024);
    }

    #[test]
    fn nonempty_stderr_and_transport_failures_are_rejected() {
        let mut value = outcome(b"{}".to_vec());
        value.stderr.bytes = b"unexpected".to_vec();
        assert_eq!(
            validate_transport(value, "request-1").unwrap_err().0,
            "python_stderr_not_empty"
        );
        let mut value = outcome(Vec::new());
        value.timed_out = true;
        assert_eq!(
            validate_transport(value, "request-1").unwrap_err().0,
            "python_process_timeout"
        );
    }

    #[test]
    fn diagnostics_are_sanitized_before_webview_serialization() {
        let raw = RawReaderDiagnostic {
            code: "patch_precondition_failed".into(),
            message: "Traceback C:/secret/model.prj".repeat(30),
            source_line_number: Some(9),
            context: BTreeMap::from([
                ("token".into(), json!("x".repeat(300))),
                ("source_path".into(), json!("C:/secret/model.prj")),
                ("field".into(), json!({"nested": true})),
                ("old_token".into(), json!("600")),
            ]),
        };
        let safe = sanitize_raw_diagnostic(raw).unwrap();
        let serialized = serde_json::to_string(&safe).unwrap();
        assert!(!serialized.contains("Traceback"));
        assert!(!serialized.contains("secret"));
        assert_eq!(safe.context.len(), 2);
        assert_eq!(safe.context["token"].as_str().unwrap().len(), 120);
    }

    #[test]
    fn output_path_rules_refuse_existing_and_source() {
        let root = std::env::temp_dir().join(format!("contam-studio-rust-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source.prj");
        fs::write(&source, b"source").unwrap();
        let source = fs::canonicalize(source).unwrap();
        let no_extension = root.join("copy");
        assert!(validate_output_path(&source, &no_extension)
            .unwrap()
            .ends_with("copy.prj"));
        assert_eq!(
            validate_output_path(&source, &source),
            Err("selected_output_path_invalid")
        );
        let existing = root.join("existing.prj");
        fs::write(&existing, b"keep").unwrap();
        assert_eq!(
            validate_output_path(&source, &existing),
            Err("patch_output_exists")
        );
        assert_eq!(
            validate_output_path(&source, &root.join("copy.txt")),
            Err("selected_output_path_invalid")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn operation_latch_prevents_concurrent_project_operations() {
        let store = DesktopProjectSessionStore::default();
        let first = store.try_operation().unwrap();
        assert!(store.try_operation().is_none());
        drop(first);
        assert!(store.try_operation().is_some());
    }

    #[test]
    fn review_view_does_not_serialize_source_or_byte_ranges() {
        let review = PatchReviewView {
            project_session_id: "session-1".into(),
            patch_id: "patch-1".into(),
            zone_number: 1,
            zone_name: "One".into(),
            field: PATCH_FIELD.into(),
            old_token: "600".into(),
            new_token: "650".into(),
            old_value: 600.0,
            new_value: 650.0,
            source_line_number: 243,
            old_line: "old".into(),
            new_line: "new".into(),
            diff_text: "diff".into(),
        };
        let encoded = serde_json::to_string(&review).unwrap();
        assert!(!encoded.contains("source_path"));
        assert!(!encoded.contains("byte_start"));
        assert!(!encoded.contains("byte_end"));
        assert!(!encoded.contains("preconditions"));
    }

    #[test]
    fn session_store_replaces_project_and_clears_patch() {
        let store = DesktopProjectSessionStore::default();
        let fixture = primary_fixture();
        let project = execute_read(&fixture, "read-session").result.unwrap();
        store.activate_project("session-1".into(), fixture, &project);
        assert_eq!(
            store
                .state
                .lock()
                .unwrap()
                .active_project
                .as_ref()
                .unwrap()
                .project_session_id,
            "session-1"
        );
        store.state.lock().unwrap().planned_patch = None;
        assert!(store.state.lock().unwrap().planned_patch.is_none());
    }

    #[test]
    fn activating_a_new_project_replaces_session_and_clears_reviewed_patch() {
        let store = DesktopProjectSessionStore::default();
        let fixture = primary_fixture();
        let project = execute_read(&fixture, "read-session").result.unwrap();
        store.activate_project("session-1".into(), fixture.clone(), &project);
        let active = store.state.lock().unwrap().active_project.clone().unwrap();
        let request = json!({"protocol_version": PROTOCOL_VERSION, "request_id": "plan-store", "operation": PLAN_OPERATION, "source_path": active.source_path, "contam_number": 1, "new_volume_token": "650"});
        let envelope =
            execute_bridge_request(&request, "plan-store", READ_AND_PLAN_TIMEOUT).unwrap();
        let raw: RawPatchPlanResult = serde_json::from_value(envelope.result.unwrap()).unwrap();
        let (planned, _) = validate_plan_result(raw, &active, "plan-store", 1, "650").unwrap();
        store.state.lock().unwrap().planned_patch = Some(planned);

        store.activate_project("session-2".into(), fixture, &project);
        let state = store.state.lock().unwrap();
        assert_eq!(
            state.active_project.as_ref().unwrap().project_session_id,
            "session-2"
        );
        assert!(state.planned_patch.is_none());
    }

    #[test]
    fn plan_contract_rejects_source_hash_and_target_mismatches() {
        let fixture = primary_fixture();
        let project = execute_read(&fixture, "read-plan").result.unwrap();
        let active = ActiveProjectContext {
            project_session_id: "session-plan".into(),
            source_path: fixture.clone(),
            source_sha256: project.source_sha256,
            source_size_bytes: project.source_size_bytes,
            reader_mode: project.reader_mode,
            header_version: project.header_version,
        };
        let request = json!({"protocol_version": PROTOCOL_VERSION, "request_id": "plan-contract", "operation": PLAN_OPERATION, "source_path": fixture, "contam_number": 1, "new_volume_token": "650"});
        let envelope =
            execute_bridge_request(&request, "plan-contract", READ_AND_PLAN_TIMEOUT).unwrap();
        let raw: RawPatchPlanResult = serde_json::from_value(envelope.result.unwrap()).unwrap();

        let mut hash_mismatch = raw.clone();
        hash_mismatch.patch.source_sha256 = "0".repeat(64);
        assert_eq!(
            validate_plan_result(hash_mismatch, &active, "plan-contract", 1, "650")
                .unwrap_err()
                .code,
            "patch_response_contract_invalid"
        );

        let mut target_mismatch = raw.clone();
        target_mismatch.patch.target.contam_number = 2;
        assert_eq!(
            validate_plan_result(target_mismatch, &active, "plan-contract", 1, "650")
                .unwrap_err()
                .code,
            "patch_response_contract_invalid"
        );

        let mut source_mismatch = raw;
        source_mismatch.patch.source_path =
            fixture_path("fixtures/contam/official-nist-tutorials/demo1c.prj")
                .to_string_lossy()
                .into_owned();
        assert_eq!(
            validate_plan_result(source_mismatch, &active, "plan-contract", 1, "650")
                .unwrap_err()
                .code,
            "patch_response_source_mismatch"
        );
    }

    #[test]
    fn custom_command_acl_and_frontend_path_boundary_are_explicit() {
        let build_script = include_str!("../build.rs");
        let capability: Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let desktop_api = include_str!("../../src/app/desktop-api.ts");
        let package_json = include_str!("../../package.json");
        for command in [
            "select_and_read_prj_zones",
            "plan_zone_volume_patch",
            "apply_zone_volume_patch_to_copy",
        ] {
            assert!(build_script.contains(command));
        }
        assert_eq!(capability["permissions"].as_array().unwrap().len(), 4);
        let forbidden = [
            "sourcePath",
            "outputPath",
            "patch:",
            "@tauri-apps/plugin-dialog",
        ];
        for value in forbidden {
            assert!(!desktop_api.contains(value), "found {value}");
        }
        assert!(!package_json.contains("@tauri-apps/plugin-dialog"));
        let capability_text = include_str!("../capabilities/default.json");
        for permission in ["dialog", "fs:", "shell", "http"] {
            assert!(!capability_text.contains(permission));
        }
    }

    #[test]
    fn real_bridge_reads_all_official_fixtures() {
        for (relative, count, first) in [
            (
                "fixtures/contam/official-contamxpy/test_GetPrjInfo.prj",
                7,
                "One",
            ),
            (
                "fixtures/contam/official-contamxpy/valThreeZonesWthCtm-UseApi.prj",
                3,
                "one",
            ),
            (
                "fixtures/contam/official-nist-tutorials/demo1c.prj",
                7,
                "Attic",
            ),
        ] {
            let fixture = fixture_path(relative);
            let envelope = execute_read(&fixture, "request-real");
            assert!(envelope.ok, "{:?}", envelope.error);
            let result = envelope.result.unwrap();
            assert_eq!(result.declared_zone_count, count);
            assert_eq!(result.first_zone.unwrap().name, first);
        }
    }

    #[test]
    fn real_plan_and_apply_contracts_round_trip() {
        let active = {
            let fixture = primary_fixture();
            let project = execute_read(&fixture, "read-real").result.unwrap();
            ActiveProjectContext {
                project_session_id: "session-real".into(),
                source_path: fixture,
                source_sha256: project.source_sha256,
                source_size_bytes: project.source_size_bytes,
                reader_mode: project.reader_mode,
                header_version: project.header_version,
            }
        };
        let request = json!({"protocol_version": PROTOCOL_VERSION, "request_id": "plan-real", "operation": PLAN_OPERATION, "source_path": active.source_path, "contam_number": 1, "new_volume_token": "650.0"});
        let envelope =
            execute_bridge_request(&request, "plan-real", READ_AND_PLAN_TIMEOUT).unwrap();
        let raw: RawPatchPlanResult = serde_json::from_value(envelope.result.unwrap()).unwrap();
        let (planned, review) =
            validate_plan_result(raw, &active, "plan-real", 1, "650.0").unwrap();
        assert_eq!(review.new_token, "650.0");

        let output_root =
            std::env::temp_dir().join(format!("contam-studio-apply-{}", std::process::id()));
        let _ = fs::remove_dir_all(&output_root);
        fs::create_dir_all(&output_root).unwrap();
        let output = fs::canonicalize(&output_root).unwrap().join("copy.prj");
        let request = json!({"protocol_version": PROTOCOL_VERSION, "request_id": "apply-real", "operation": APPLY_OPERATION, "source_path": active.source_path, "output_path": output, "patch": planned.patch});
        let envelope = execute_bridge_request(&request, "apply-real", APPLY_TIMEOUT).unwrap();
        let raw: RawPatchApplicationResult =
            serde_json::from_value(envelope.result.unwrap()).unwrap();
        let mut output_mismatch = raw.clone();
        output_mismatch.application.output_path = primary_fixture().to_string_lossy().into_owned();
        assert_eq!(
            validate_application_result(output_mismatch, &active, &planned, &output)
                .unwrap_err()
                .code,
            "patch_apply_response_invalid"
        );
        let mut hash_mismatch = raw.clone();
        hash_mismatch.application.output_sha256 = "0".repeat(64);
        assert_eq!(
            validate_application_result(hash_mismatch, &active, &planned, &output)
                .unwrap_err()
                .code,
            "patch_apply_response_invalid"
        );
        let project = validate_application_result(raw, &active, &planned, &output).unwrap();
        assert_eq!(project.first_zone.unwrap().volume_m3, 650.0);
        fs::remove_dir_all(output_root).unwrap();
    }
}
